// Real road-based routing service.
//
// Abstracts route geometry & stop-order optimization behind a provider switch
// (VITE_ROUTING_PROVIDER = 'osrm' | 'mapbox'). All public functions return
// plain JS objects with [lat,lng] arrays so callers don't need to know which
// engine answered. On failure they fall back to a straight-line geometry so
// the UI keeps working with the previous behaviour.
//
// TODO(rota-segura): once a RiskZone entity exists, callers can pass
//   options.avoidPolygons = [[[lat,lng],...], ...]. Mapbox forwards them as
//   `exclude=polygon(...)`; OSRM (public) has no equivalent and ignores them
//   with a console warning.

const PROVIDER = (import.meta.env.VITE_ROUTING_PROVIDER || "osrm").toLowerCase();
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";
const OSRM_BASE = "https://router.project-osrm.org";
const MAPBOX_BASE = "https://api.mapbox.com";
const DEFAULT_TIMEOUT_MS = 8000;

const cache = new Map();

function hashStops(stops, prefix) {
  return `${prefix}|${stops
    .map((s) => `${Number(s.latitude).toFixed(6)},${Number(s.longitude).toFixed(6)}`)
    .join(";")}`;
}

function validStops(stops) {
  return (stops || []).filter(
    (s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude))
  );
}

async function fetchJson(url, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const handle = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(handle);
  }
}

function roundLegs(legs = []) {
  return legs.map((l) => ({
    distance_km: Math.round((l.distance / 1000) * 10) / 10,
    duration_min: Math.round(l.duration / 60),
  }));
}

function geoJsonLineToLatLng(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

async function osrmRoute(stops, { timeout } = {}) {
  const coords = stops.map((s) => `${s.longitude},${s.latitude}`).join(";");
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const data = await fetchJson(url, { timeout });
  if (data.code !== "Ok") throw new Error(`OSRM route: ${data.code}`);
  const r = data.routes[0];
  return {
    coordinates: geoJsonLineToLatLng(r.geometry),
    distance_km: r.distance / 1000,
    duration_min: r.duration / 60,
    legs: roundLegs(r.legs),
  };
}

async function osrmTrip(stops, { fixEnd = false, timeout } = {}) {
  const coords = stops.map((s) => `${s.longitude},${s.latitude}`).join(";");
  const destination = fixEnd ? "last" : "any";
  const url = `${OSRM_BASE}/trip/v1/driving/${coords}?source=first&destination=${destination}&roundtrip=false&overview=full&geometries=geojson`;
  const data = await fetchJson(url, { timeout });
  if (data.code !== "Ok") throw new Error(`OSRM trip: ${data.code}`);
  const reordered = new Array(stops.length);
  data.waypoints.forEach((wp, inputIndex) => {
    reordered[wp.waypoint_index] = stops[inputIndex];
  });
  const trip = data.trips[0];
  return {
    stops: reordered,
    coordinates: geoJsonLineToLatLng(trip.geometry),
    distance_km: trip.distance / 1000,
    duration_min: trip.duration / 60,
    legs: roundLegs(trip.legs),
  };
}

// Monta o parâmetro `exclude` do Mapbox. Aceita feições nomeadas (ex.
// "toll" para evitar pedágios) e/ou polígonos a evitar. Mapbox separa os
// valores por vírgula: `exclude=toll,polygon(...)`.
function mapboxExcludeParam({ avoidPolygons = [], avoidTolls = false } = {}) {
  const parts = [];
  if (avoidTolls) parts.push("toll");
  for (const poly of avoidPolygons) {
    parts.push(`polygon(${poly.map(([lat, lng]) => `${lng} ${lat}`).join(",")})`);
  }
  return parts.length ? parts.join(",") : null;
}

async function mapboxRoute(stops, { avoidPolygons = [], avoidTolls = false, timeout } = {}) {
  if (!MAPBOX_TOKEN) throw new Error("VITE_MAPBOX_TOKEN missing");
  const coords = stops.map((s) => `${s.longitude},${s.latitude}`).join(";");
  const params = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    steps: "false",
    access_token: MAPBOX_TOKEN,
  });
  const exclude = mapboxExcludeParam({ avoidPolygons, avoidTolls });
  if (exclude) params.set("exclude", exclude);
  const url = `${MAPBOX_BASE}/directions/v5/mapbox/driving/${coords}?${params}`;
  const data = await fetchJson(url, { timeout });
  if (data.code && data.code !== "Ok") throw new Error(`Mapbox route: ${data.code}`);
  const r = data.routes[0];
  return {
    coordinates: geoJsonLineToLatLng(r.geometry),
    distance_km: r.distance / 1000,
    duration_min: r.duration / 60,
    legs: roundLegs(r.legs),
  };
}

async function mapboxOptimize(stops, { fixEnd = false, avoidTolls = false, timeout } = {}) {
  if (!MAPBOX_TOKEN) throw new Error("VITE_MAPBOX_TOKEN missing");
  const coords = stops.map((s) => `${s.longitude},${s.latitude}`).join(";");
  const params = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    source: "first",
    destination: fixEnd ? "last" : "any",
    roundtrip: "false",
    access_token: MAPBOX_TOKEN,
  });
  if (avoidTolls) params.set("exclude", "toll");
  const url = `${MAPBOX_BASE}/optimized-trips/v1/mapbox/driving/${coords}?${params}`;
  const data = await fetchJson(url, { timeout });
  if (data.code && data.code !== "Ok") throw new Error(`Mapbox optimize: ${data.code}`);
  const reordered = new Array(stops.length);
  data.waypoints.forEach((wp, inputIndex) => {
    reordered[wp.waypoint_index] = stops[inputIndex];
  });
  const trip = data.trips[0];
  return {
    stops: reordered,
    coordinates: geoJsonLineToLatLng(trip.geometry),
    distance_km: trip.distance / 1000,
    duration_min: trip.duration / 60,
    legs: roundLegs(trip.legs),
  };
}

function straightLineFallback(stops) {
  let distance = 0;
  for (let i = 1; i < stops.length; i++) {
    distance += haversineKm(
      stops[i - 1].latitude,
      stops[i - 1].longitude,
      stops[i].latitude,
      stops[i].longitude
    );
  }
  return {
    coordinates: stops.map((s) => [s.latitude, s.longitude]),
    distance_km: Math.round(distance * 10) / 10,
    duration_min: Math.round((distance / 50) * 60), // assume 50 km/h average
    legs: [],
    fallback: true,
  };
}

export async function getRouteGeometry(stops, options = {}) {
  const valid = validStops(stops);
  if (valid.length < 2) {
    return { coordinates: valid.map((s) => [s.latitude, s.longitude]), distance_km: 0, duration_min: 0, legs: [] };
  }
  const { avoidPolygons = [], avoidTolls = false, timeout = DEFAULT_TIMEOUT_MS } = options;
  const key = hashStops(valid, `geom:${PROVIDER}:avoid=${avoidPolygons.length}:toll=${avoidTolls ? 1 : 0}`);
  if (cache.has(key)) return cache.get(key);

  try {
    let raw;
    if (PROVIDER === "mapbox") {
      raw = await mapboxRoute(valid, { avoidPolygons, avoidTolls, timeout });
    } else {
      if (avoidPolygons.length) {
        // eslint-disable-next-line no-console
        console.info("[routing] OSRM does not support avoidPolygons — ignored");
      }
      if (avoidTolls) {
        // eslint-disable-next-line no-console
        console.info("[routing] OSRM does not support avoiding tolls — ignored (use Mapbox provider)");
      }
      raw = await osrmRoute(valid, { timeout });
    }
    const result = {
      coordinates: raw.coordinates,
      distance_km: Math.round(raw.distance_km * 10) / 10,
      duration_min: Math.round(raw.duration_min),
      legs: raw.legs,
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[routing] geometry failed, using straight-line fallback:", err?.message || err);
    return straightLineFallback(valid);
  }
}

export async function optimizeStopOrder(stops, options = {}) {
  const valid = validStops(stops);
  if (valid.length < 3) {
    const geom = await getRouteGeometry(valid, options);
    return { ...geom, stops: valid, optimized: false };
  }
  const { fixEnd = false, avoidPolygons = [], avoidTolls = false, timeout = DEFAULT_TIMEOUT_MS } = options;
  const key = hashStops(valid, `opt:${PROVIDER}:fixEnd=${fixEnd}:avoid=${avoidPolygons.length}:toll=${avoidTolls ? 1 : 0}`);
  if (cache.has(key)) return cache.get(key);

  try {
    let raw;
    if (PROVIDER === "mapbox") {
      raw = await mapboxOptimize(valid, { fixEnd, avoidTolls, timeout });
    } else {
      if (avoidPolygons.length) {
        // eslint-disable-next-line no-console
        console.info("[routing] OSRM trip does not support avoidPolygons — ignored");
      }
      if (avoidTolls) {
        // eslint-disable-next-line no-console
        console.info("[routing] OSRM trip does not support avoiding tolls — ignored (use Mapbox provider)");
      }
      raw = await osrmTrip(valid, { fixEnd, timeout });
    }
    const result = {
      stops: raw.stops,
      coordinates: raw.coordinates,
      distance_km: Math.round(raw.distance_km * 10) / 10,
      duration_min: Math.round(raw.duration_min),
      legs: raw.legs,
      optimized: true,
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[routing] optimize failed, keeping original order:", err?.message || err);
    return { ...straightLineFallback(valid), stops: valid, optimized: false };
  }
}

// Decode a persisted route_geometry value into an array of [lat,lng] pairs.
// Accepts: array, JSON-stringified array, or GeoJSON LineString string.
export function parseGeometry(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed;
    if (parsed?.type === "LineString" && Array.isArray(parsed.coordinates)) {
      return parsed.coordinates.map(([lng, lat]) => [lat, lng]);
    }
    if (Array.isArray(parsed?.coordinates)) return parsed.coordinates;
  } catch {
    return null;
  }
  return null;
}

// Base44 rejeita campos de texto acima de um tamanho máximo ("Field
// exceeds the maximum allowed size"), então a geometria persistida precisa
// caber nesse limite. 20k chars ≈ 850 pontos com 5 casas decimais — mais
// do que suficiente para desenhar a rota no mapa.
const GEOMETRY_MAX_CHARS = 20000;

function roundCoord(v) {
  // toFixed + Number garante no máximo 5 casas (≈1m) no JSON serializado.
  return Number(Number(v).toFixed(5));
}

// Distância perpendicular (km) do ponto p ao segmento a-b, em projeção
// equiretangular — precisão suficiente para simplificação de polylines.
function perpendicularDistanceKm(p, a, b) {
  const midLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const kmPerDegLat = 110.574;
  const kmPerDegLng = 111.32 * Math.cos(midLat);
  const px = (p[1] - a[1]) * kmPerDegLng, py = (p[0] - a[0]) * kmPerDegLat;
  const bx = (b[1] - a[1]) * kmPerDegLng, by = (b[0] - a[0]) * kmPerDegLat;
  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.sqrt(px * px + py * py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  const dx = px - t * bx, dy = py - t * by;
  return Math.sqrt(dx * dx + dy * dy);
}

// Douglas-Peucker iterativo (sem recursão — driven_path pode ter milhares
// de pontos). Mantém sempre o primeiro e o último ponto.
function douglasPeucker(points, toleranceKm) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0, maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistanceKm(points[i], points[start], points[end]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxIdx !== -1 && maxDist > toleranceKm) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// Serialize a coordinates array for persistence. Arredonda para 5 casas,
// remove pontos consecutivos duplicados e simplifica progressivamente até
// o JSON caber no limite de tamanho de campo do Base44.
export function serializeGeometry(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) return null;
  let pts = [];
  for (const c of coordinates) {
    if (!Array.isArray(c) || !Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) continue;
    const p = [roundCoord(c[0]), roundCoord(c[1])];
    const last = pts[pts.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    pts.push(p);
  }
  if (!pts.length) return null;

  let json = JSON.stringify(pts);
  for (const tolMeters of [5, 10, 25, 50, 100, 250, 500]) {
    if (json.length <= GEOMETRY_MAX_CHARS) return json;
    pts = douglasPeucker(pts, tolMeters / 1000);
    json = JSON.stringify(pts);
  }
  // Último recurso: reduz pela metade até caber, preservando as pontas.
  while (json.length > GEOMETRY_MAX_CHARS && pts.length > 2) {
    pts = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1);
    json = JSON.stringify(pts);
  }
  return json;
}

export function formatDuration(minutes) {
  if (!minutes && minutes !== 0) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "<1min";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h}h ${rest}min`;
  if (h) return `${h}h`;
  return `${rest}min`;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const ROUTING_PROVIDER = PROVIDER;

// Evitar pedágio só é suportado pelo Mapbox (com token). O OSRM público
// ignora o pedido. A UI usa isso para avisar o usuário quando a opção não
// terá efeito real.
export const SUPPORTS_AVOID_TOLLS = PROVIDER === "mapbox" && !!MAPBOX_TOKEN;

// Returns the route's departure point or null. Supports both the new schema
// (route.departure_lat/lng/address as top-level fields) and the legacy schema
// where the departure was stored as a synthetic stop with _isDeparture: true.
export function getRouteDeparture(route) {
  if (!route) return null;
  if (Number.isFinite(Number(route.departure_lat)) && Number.isFinite(Number(route.departure_lng))) {
    return {
      latitude: Number(route.departure_lat),
      longitude: Number(route.departure_lng),
      address: route.departure_address || "Base",
    };
  }
  const legacy = (route.stops || []).find((s) => s._isDeparture);
  if (legacy) {
    return {
      latitude: Number(legacy.latitude),
      longitude: Number(legacy.longitude),
      address: legacy.address || "Base",
    };
  }
  return null;
}

// Returns only real delivery stops, filtering out any legacy departure entry.
export function getDeliveryStops(route) {
  if (!route) return [];
  return (route.stops || []).filter((s) => !s._isDeparture);
}

// Departure point configured on the company (the depot/base). Used as the
// route origin whenever a route itself doesn't carry one — e.g. routes
// created before the departure was set in Settings.
export function getCompanyDeparture(company) {
  if (!company) return null;
  if (Number.isFinite(Number(company.departure_lat)) && Number.isFinite(Number(company.departure_lng))) {
    return {
      latitude: Number(company.departure_lat),
      longitude: Number(company.departure_lng),
      address: company.departure_address || "Base",
    };
  }
  return null;
}

// The origin a route should start from: the route's own departure if it has
// one, otherwise the company depot. Keeps every trajectory anchored to the
// base even for older routes saved without a departure.
export function resolveRouteDeparture(route, company) {
  return getRouteDeparture(route) || getCompanyDeparture(company);
}

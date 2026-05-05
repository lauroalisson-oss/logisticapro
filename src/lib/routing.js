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

function mapboxExcludeParam(avoidPolygons) {
  if (!avoidPolygons || !avoidPolygons.length) return null;
  // Mapbox expects polygon(lng1 lat1, lng2 lat2, ...); list separated by ';'
  return avoidPolygons
    .map((poly) =>
      `polygon(${poly.map(([lat, lng]) => `${lng} ${lat}`).join(",")})`
    )
    .join(";");
}

async function mapboxRoute(stops, { avoidPolygons = [], timeout } = {}) {
  if (!MAPBOX_TOKEN) throw new Error("VITE_MAPBOX_TOKEN missing");
  const coords = stops.map((s) => `${s.longitude},${s.latitude}`).join(";");
  const params = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    steps: "false",
    access_token: MAPBOX_TOKEN,
  });
  const exclude = mapboxExcludeParam(avoidPolygons);
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

async function mapboxOptimize(stops, { fixEnd = false, timeout } = {}) {
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
  const { avoidPolygons = [], timeout = DEFAULT_TIMEOUT_MS } = options;
  const key = hashStops(valid, `geom:${PROVIDER}:avoid=${avoidPolygons.length}`);
  if (cache.has(key)) return cache.get(key);

  try {
    let raw;
    if (PROVIDER === "mapbox") {
      raw = await mapboxRoute(valid, { avoidPolygons, timeout });
    } else {
      if (avoidPolygons.length) {
        // eslint-disable-next-line no-console
        console.info("[routing] OSRM does not support avoidPolygons — ignored");
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
  const { fixEnd = false, avoidPolygons = [], timeout = DEFAULT_TIMEOUT_MS } = options;
  const key = hashStops(valid, `opt:${PROVIDER}:fixEnd=${fixEnd}:avoid=${avoidPolygons.length}`);
  if (cache.has(key)) return cache.get(key);

  try {
    let raw;
    if (PROVIDER === "mapbox") {
      raw = await mapboxOptimize(valid, { fixEnd, timeout });
    } else {
      if (avoidPolygons.length) {
        // eslint-disable-next-line no-console
        console.info("[routing] OSRM trip does not support avoidPolygons — ignored");
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

// Serialize a coordinates array for persistence.
export function serializeGeometry(coordinates) {
  if (!Array.isArray(coordinates) || !coordinates.length) return null;
  return JSON.stringify(coordinates);
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

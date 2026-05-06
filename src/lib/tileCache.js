// Tile pre-fetching for offline map use.
//
// Slippy map math (web Mercator) → list of tile URLs covering a bounding box
// at a range of zoom levels. The Service Worker (public/sw.js) handles the
// actual network fetch + caching; we just compute URLs and post a message.

export function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}

export function tilesForBounds({ north, south, east, west }, zoom) {
  // x grows with longitude, y grows southwards
  const xMin = lon2tile(west, zoom);
  const xMax = lon2tile(east, zoom);
  const yMin = lat2tile(north, zoom);
  const yMax = lat2tile(south, zoom);
  const urls = [];
  for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x++) {
    for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y++) {
      urls.push(`https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`);
    }
  }
  return urls;
}

// Build a list of tile URLs covering all listed lat/lng points (with a small
// padding) across a range of zoom levels. Caps the total to avoid hitting
// OSM tile limits / huge prefetches.
export function tileUrlsForPoints(points, { zoomMin = 11, zoomMax = 14, paddingDeg = 0.05, maxTiles = 4000 } = {}) {
  if (!points || points.length === 0) return [];
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  const bounds = {
    north: Math.max(...lats) + paddingDeg,
    south: Math.min(...lats) - paddingDeg,
    east: Math.max(...lngs) + paddingDeg,
    west: Math.min(...lngs) - paddingDeg,
  };
  const urls = new Set();
  for (let z = zoomMin; z <= zoomMax; z++) {
    for (const u of tilesForBounds(bounds, z)) {
      urls.add(u);
      if (urls.size >= maxTiles) return Array.from(urls);
    }
  }
  return Array.from(urls);
}

export function prefetchTiles(urls, onProgress) {
  return new Promise((resolve, reject) => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
      reject(new Error("Service Worker indisponível — abra o app pelo navegador (https) e recarregue."));
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "PREFETCH_PROGRESS") onProgress?.(data);
      if (data.type === "PREFETCH_DONE") {
        onProgress?.(data);
        channel.port1.close();
        resolve(data);
      }
    };
    navigator.serviceWorker.controller.postMessage(
      { type: "PREFETCH_TILES", urls },
      [channel.port2]
    );
  });
}

export function getCachedTileCount() {
  return new Promise((resolve) => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
      resolve(0);
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "CACHE_STATUS_RESULT") resolve(data.count || 0);
      channel.port1.close();
    };
    navigator.serviceWorker.controller.postMessage(
      { type: "CACHE_STATUS" },
      [channel.port2]
    );
  });
}

export function clearTileCache() {
  return new Promise((resolve) => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
      resolve();
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data?.type === "CACHE_CLEARED") resolve();
      channel.port1.close();
    };
    navigator.serviceWorker.controller.postMessage(
      { type: "CLEAR_TILES" },
      [channel.port2]
    );
  });
}

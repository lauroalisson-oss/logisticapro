// Service worker that caches OpenStreetMap tile images so the map keeps
// working when the driver loses connectivity.
//
// Strategy:
//   - GET *.tile.openstreetmap.org/* → stale-while-revalidate
//   - On network failure, fall back to whatever is in the cache.
//   - Main thread can post {type:"PREFETCH_TILES", urls:[...]} to warm
//     the cache for a route ahead of time. Progress is reported back.

const TILE_CACHE = "osm-tiles-v2";
const TILE_HOSTS = new Set([
  "a.tile.openstreetmap.org",
  "b.tile.openstreetmap.org",
  "c.tile.openstreetmap.org",
  "tile.openstreetmap.org",
]);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith("osm-tiles-") && k !== TILE_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let url;
  try { url = new URL(event.request.url); } catch { return; }
  if (!TILE_HOSTS.has(url.hostname)) return;
  event.respondWith(handleTile(event.request));
});

async function handleTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      // Status 0 (opaque) is fine — we just stash whatever came back.
      if (res && (res.ok || res.type === "opaque")) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response("", { status: 504, statusText: "Offline and not cached" });
}

// Sem isso, um único tile que o servidor da OSM demora (ou nunca) responder
// travava o worker inteiro pra sempre — com vários workers concorrentes
// puxando de uma fila de até milhares de tiles, bastava alguns pedidos
// travados pra o download inteiro ficar preso em "carregando" indefinidamente.
async function fetchWithTimeout(url, opts, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("message", async (event) => {
  const data = event.data || {};
  if (data.type === "PREFETCH_TILES" && Array.isArray(data.urls)) {
    const cache = await caches.open(TILE_CACHE);
    const urls = data.urls;
    const total = urls.length;
    let done = 0;
    let cachedAlready = 0;
    let failed = 0;
    const concurrency = 4;
    let cursor = 0;

    async function worker() {
      while (cursor < urls.length) {
        const i = cursor++;
        const url = urls[i];
        try {
          const existing = await cache.match(url);
          if (existing) {
            cachedAlready++;
          } else {
            const res = await fetchWithTimeout(url, { mode: "no-cors" }, 8000);
            if (res && (res.ok || res.type === "opaque")) {
              await cache.put(url, res.clone());
            } else {
              failed++;
            }
          }
        } catch {
          failed++;
        }
        done++;
        if (done % 10 === 0 || done === total) {
          event.source?.postMessage({
            type: "PREFETCH_PROGRESS",
            done, total, failed, cachedAlready,
          });
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    event.source?.postMessage({
      type: "PREFETCH_DONE",
      done, total, failed, cachedAlready,
    });
  } else if (data.type === "CACHE_STATUS") {
    const cache = await caches.open(TILE_CACHE);
    const keys = await cache.keys();
    event.source?.postMessage({ type: "CACHE_STATUS_RESULT", count: keys.length });
  } else if (data.type === "CLEAR_TILES") {
    await caches.delete(TILE_CACHE);
    event.source?.postMessage({ type: "CACHE_CLEARED" });
  }
});

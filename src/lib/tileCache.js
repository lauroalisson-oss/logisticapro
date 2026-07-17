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

// Tiles ao longo do trajeto real (geometria da rota + paradas), não do
// retângulo que envolve todos os pontos — a versão anterior baixava a área
// inteira entre a parada mais ao norte/sul/leste/oeste, o que em rotas que
// não são uma linha reta significa baixar muito chão que o motorista nunca
// vai passar perto. Aqui cada ponto do trajeto marca só os tiles vizinhos a
// ele (tileRadius), formando um corredor em volta do caminho real.
export function tileUrlsForRoute(points, { zoomMin = 12, zoomMax = 14, tileRadius = 1, maxTiles = 1500 } = {}) {
  if (!points || points.length === 0) return [];
  const urls = new Set();
  for (let z = zoomMin; z <= zoomMax; z++) {
    for (const [lat, lng] of points) {
      if (lat == null || lng == null) continue;
      const cx = lon2tile(lng, z);
      const cy = lat2tile(lat, z);
      for (let dx = -tileRadius; dx <= tileRadius; dx++) {
        for (let dy = -tileRadius; dy <= tileRadius; dy++) {
          urls.add(`https://tile.openstreetmap.org/${z}/${cx + dx}/${cy + dy}.png`);
          if (urls.size >= maxTiles) return Array.from(urls);
        }
      }
    }
  }
  return Array.from(urls);
}

export function prefetchTiles(urls, onProgress) {
  return new Promise((resolve, reject) => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
      reject(new Error("Service Worker ainda não está pronto — aguarde alguns segundos e tente de novo (ou recarregue a página)."));
      return;
    }
    const channel = new MessageChannel();
    // Cada tile já tem timeout individual no service worker, mas isso é uma
    // rede de segurança pro caso raro do PREFETCH_DONE nunca chegar (SW
    // reiniciado no meio do processo, canal perdido, etc.) — sem isso a UI
    // ficava presa em "carregando" pra sempre, sem chance de tentar de novo.
    const safetyTimer = setTimeout(() => {
      channel.port1.close();
      reject(new Error("O download demorou demais e foi cancelado. Tente novamente com conexão mais estável."));
    }, 5 * 60 * 1000);
    channel.port1.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "PREFETCH_PROGRESS") onProgress?.(data);
      if (data.type === "PREFETCH_DONE") {
        clearTimeout(safetyTimer);
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

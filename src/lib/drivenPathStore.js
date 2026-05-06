// IndexedDB store for the driven path (the actual GPS trail of the driver).
//
// Why: keeping the trail only in component state means it gets wiped when
// the OS kills the app or the driver navigates away. By writing every fix
// to IndexedDB, the trail survives app close and we can resume it on the
// next launch — even if the driver was offline the whole time.
//
// Layout: one record per route, keyed by route_id. Whole path is rewritten
// on every save; trails are small (a few KB after hours of driving with the
// 25 m throttle in DriverMap) so this is fine.

const DB_NAME = "driven_path_db";
const STORE_NAME = "paths";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "route_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDrivenPath(routeId, path, lastSyncedLength = 0) {
  if (!routeId) return;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({
        route_id: routeId,
        path,
        last_synced_length: lastSyncedLength,
        updated_at: new Date().toISOString(),
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[drivenPathStore] save failed:", err?.message || err);
  }
}

export async function loadDrivenPath(routeId) {
  if (!routeId) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(routeId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[drivenPathStore] load failed:", err?.message || err);
    return null;
  }
}

export async function clearDrivenPath(routeId) {
  if (!routeId) return;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(routeId);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[drivenPathStore] clear failed:", err?.message || err);
  }
}

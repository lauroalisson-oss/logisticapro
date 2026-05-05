/**
 * Offline-first GPS queue using IndexedDB.
 * 
 * Stores GPS positions locally when offline or on failure,
 * then flushes them to the server automatically when online.
 */
import { useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const DB_NAME = "gps_queue_db";
const STORE_NAME = "positions";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "ts" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dequeueAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Hook: useGpsQueue
 * 
 * Usage:
 *   const { push } = useGpsQueue({ userEmail, getRouteData });
 *   push({ latitude, longitude, accuracy });
 *
 * - Queues positions in IndexedDB immediately
 * - Flushes queue to DriverLocation entity whenever online
 * - Re-flushes on `online` event (connectivity restored)
 */
export function useGpsQueue({ userEmail, getRouteData }) {
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (flushingRef.current || !navigator.onLine || !userEmail) return;
    flushingRef.current = true;
    try {
      const pending = await dequeueAll();
      if (pending.length === 0) return;

      // Use the most recent queued position (last item) for the live location record
      const latest = pending[pending.length - 1];
      const routeData = getRouteData();

      const existing = await base44.entities.DriverLocation.filter({ driver_email: userEmail });
      const payload = {
        company_id: latest.company_id || "",
        driver_email: userEmail,
        driver_name: latest.driver_name || "",
        latitude: latest.latitude,
        longitude: latest.longitude,
        vehicle_plate: routeData?.vehicle_plate || "",
        route_id: routeData?.id || "",
        route_status: routeData?.status || "",
        route_progress: routeData?.progress || 0,
        last_update: latest.ts,
        is_active: true,
      };

      if (existing.length > 0) {
        await base44.entities.DriverLocation.update(existing[0].id, payload);
      } else {
        await base44.entities.DriverLocation.create(payload);
      }

      await clearQueue();
    } catch (err) {
      console.warn("[GPS Queue] Flush failed, keeping queue:", err.message);
    } finally {
      flushingRef.current = false;
    }
  }, [userEmail, getRouteData]);

  // Listen for connectivity restored
  useEffect(() => {
    const handleOnline = () => flush();
    window.addEventListener("online", handleOnline);
    // Also try to flush on visibility restored (screen wake)
    const handleVisible = () => { if (document.visibilityState === "visible") flush(); };
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [flush]);

  const push = useCallback(async (posData) => {
    const record = {
      ...posData,
      ts: new Date().toISOString(),
    };
    // Always enqueue first (offline-safe)
    await enqueue(record);
    // Then try to flush immediately if online
    flush();
  }, [flush]);

  return { push, flush };
}
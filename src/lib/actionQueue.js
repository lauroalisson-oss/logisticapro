// Offline-first mutation queue for driver actions.
//
// Why: when the driver hits "Entregar", "Não entregue", "Iniciar Rota" or
// "Concluir Rota" while in a connectivity dead zone, the direct base44
// call would fail and the action would be lost. Here we always persist
// the action to IndexedDB first, apply it optimistically in the UI, and
// drain the queue whenever connectivity is back.
//
// Action shapes:
//   { id, ts, type: "STOP_STATUS", routeId, stopOrderId,
//     payload: { stopFields, orderUpdate } }
//   { id, ts, type: "ROUTE_UPDATE", routeId, payload: {...routeFields} }
//
// STOP_STATUS actions are coalesced per route at flush time so multiple
// per-stop updates collapse into a single Route.update call (the entity
// rewrites the whole stops[] array).

import { base44 } from "@/api/base44Client";

const DB_NAME = "action_queue_db";
const STORE_NAME = "actions";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function enqueueAction(action) {
  const record = { id: newId(), ts: new Date().toISOString(), ...action };
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return record;
}

export async function getAllActions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeAction(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueueSize() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}

async function flushStopStatusForRoute(routeId, actions) {
  // Reload current route so we merge our patches onto fresh stops[]; the
  // dispatcher might have edited it server-side while we were offline.
  let route;
  try {
    const list = await base44.entities.Route.filter({ id: routeId });
    route = list[0];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[actionQueue] could not load route", routeId, err?.message || err);
    return 0;
  }
  if (!route) {
    // Route was deleted server-side — drop our pending edits silently.
    for (const a of actions) await removeAction(a.id);
    return actions.length;
  }
  // Apply patches (in enqueue order) by order_id.
  const stops = (route.stops || []).map((s) => {
    let merged = s;
    for (const a of actions) {
      if (a.stopOrderId === s.order_id) {
        merged = { ...merged, ...a.payload.stopFields };
      }
    }
    return merged;
  });
  await base44.entities.Route.update(routeId, { stops });
  // Per-action Order updates (best effort — losing one is acceptable, the
  // route stop already reflects truth).
  for (const a of actions) {
    if (a.payload.orderUpdate && a.stopOrderId) {
      try {
        await base44.entities.Order.update(a.stopOrderId, a.payload.orderUpdate);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[actionQueue] order update failed (continuing):", err?.message || err);
      }
    }
    await removeAction(a.id);
  }
  return actions.length;
}

async function flushRouteUpdate(action) {
  await base44.entities.Route.update(action.routeId, action.payload);
  await removeAction(action.id);
}

// Drain the queue. Skips silently when offline. Returns counts.
export async function flushActionQueue() {
  if (!navigator.onLine) return { flushed: 0, remaining: await getQueueSize() };
  const all = (await getAllActions()).sort((a, b) => (a.ts < b.ts ? -1 : 1));
  if (all.length === 0) return { flushed: 0, remaining: 0 };

  // Group STOP_STATUS by routeId so we issue one Route.update per route.
  const stopActionsByRoute = {};
  const otherActions = [];
  for (const a of all) {
    if (a.type === "STOP_STATUS") {
      stopActionsByRoute[a.routeId] = stopActionsByRoute[a.routeId] || [];
      stopActionsByRoute[a.routeId].push(a);
    } else {
      otherActions.push(a);
    }
  }

  let flushed = 0;
  for (const [routeId, actions] of Object.entries(stopActionsByRoute)) {
    try {
      flushed += await flushStopStatusForRoute(routeId, actions);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[actionQueue] STOP_STATUS flush failed for ${routeId} (will retry):`, err?.message || err);
    }
  }
  for (const a of otherActions) {
    try {
      if (a.type === "ROUTE_UPDATE") {
        await flushRouteUpdate(a);
        flushed += 1;
      } else {
        // Unknown — drop so it doesn't block forever
        await removeAction(a.id);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[actionQueue] ${a.type} flush failed (will retry):`, err?.message || err);
    }
  }
  return { flushed, remaining: await getQueueSize() };
}

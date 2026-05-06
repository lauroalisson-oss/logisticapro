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
//     payload: { stopFields, orderUpdate, proofRef? } }
//   { id, ts, type: "ROUTE_UPDATE", routeId,
//     payload: { ...routeFields, kmPhotoRef?, kmPhotoField? } }
//
// `proofRef` and `kmPhotoRef` are local proof_id pointers into proofStore.
// At flush time we read the blob from there, upload it to base44, and
// replace the placeholder URLs (object URLs from the local Blob) with
// real server URLs. The integrity bundle (SHA-256 hashes + metadata) is
// also stamped onto the entity so the central can verify the capture.

import { base44 } from "@/api/base44Client";
import { getProof, markProofSynced, proofMetadataFromRecord } from "@/lib/proofStore";

async function uploadProofAssets(proof) {
  let proof_url = proof.proof_url || null;
  let signature_url = proof.signature_url || null;
  if (!proof_url && proof.image_blob) {
    const file = new File([proof.image_blob], `${proof.kind || "proof"}-${proof.id}.jpg`, {
      type: proof.image_blob.type || "image/jpeg",
    });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    proof_url = file_url;
  }
  if (!signature_url && proof.signature_blob) {
    const file = new File([proof.signature_blob], `assinatura-${proof.id}.png`, {
      type: "image/png",
    });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    signature_url = file_url;
  }
  if (!proof.proof_url || !proof.signature_url) {
    await markProofSynced(proof.id, { proof_url, signature_url });
  }
  return { proof_url, signature_url };
}

// Resolve `payload.proofRef` for a STOP_STATUS action. Returns the merged
// stopFields (proof_url / signature_url / proof_metadata stamped) and a
// flag indicating whether the resolution actually finished — if the proof
// blob has gone missing we fall through cleanly without blowing up.
async function resolveStopProofRef(action) {
  const stopFields = { ...(action.payload?.stopFields || {}) };
  const ref = action.payload?.proofRef;
  if (!ref) return { stopFields };
  const proof = await getProof(ref);
  if (!proof) {
    // Proof gone (cleaned up, never captured) — strip the placeholder URLs
    // so we don't write blob:// pseudo-URLs to the server.
    delete stopFields.proof_url;
    delete stopFields.signature_url;
    delete stopFields.proof_metadata;
    return { stopFields };
  }
  const { proof_url, signature_url } = await uploadProofAssets(proof);
  if (proof_url) stopFields.proof_url = proof_url;
  else delete stopFields.proof_url;
  if (signature_url) stopFields.signature_url = signature_url;
  else delete stopFields.signature_url;
  stopFields.proof_metadata = {
    ...proofMetadataFromRecord(proof),
    sync_status: "synced",
  };
  return { stopFields };
}

// Resolve `payload.kmPhotoRef` for a ROUTE_UPDATE action. The route field
// to populate is named in `payload.kmPhotoField` (km_departure_photo /
// km_arrival_photo). Strips the internal ref keys so they don't leak into
// the wire payload, and stamps `<field>_metadata` for verifiability.
async function resolveRoutePhotoRef(action) {
  const payload = { ...(action.payload || {}) };
  const ref = payload.kmPhotoRef;
  const field = payload.kmPhotoField;
  delete payload.kmPhotoRef;
  delete payload.kmPhotoField;
  if (!ref || !field) return payload;
  const proof = await getProof(ref);
  if (!proof) {
    // Proof missing — drop the optimistic blob:// placeholder if it lingered
    if (typeof payload[field] === "string" && payload[field].startsWith("blob:")) {
      delete payload[field];
    }
    return payload;
  }
  const { proof_url } = await uploadProofAssets(proof);
  if (proof_url) {
    payload[field] = proof_url;
    payload[`${field}_metadata`] = {
      ...proofMetadataFromRecord(proof),
      sync_status: "synced",
    };
  } else if (typeof payload[field] === "string" && payload[field].startsWith("blob:")) {
    delete payload[field];
  }
  return payload;
}

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
  // Resolve any pending proofRefs first — uploads photos/signatures from
  // IndexedDB to the server and produces the metadata block to stamp onto
  // each stop. Done before the route fetch so a slow upload doesn't keep
  // the route lock open.
  const resolved = [];
  for (const a of actions) {
    const { stopFields } = await resolveStopProofRef(a);
    resolved.push({ ...a, payload: { ...a.payload, stopFields } });
  }

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
    for (const a of resolved) await removeAction(a.id);
    return resolved.length;
  }
  // Apply patches (in enqueue order) by order_id.
  const stops = (route.stops || []).map((s) => {
    let merged = s;
    for (const a of resolved) {
      if (a.stopOrderId === s.order_id) {
        merged = { ...merged, ...a.payload.stopFields };
      }
    }
    return merged;
  });
  await base44.entities.Route.update(routeId, { stops });
  // Per-action Order updates (best effort — losing one is acceptable, the
  // route stop already reflects truth).
  for (const a of resolved) {
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
  return resolved.length;
}

async function flushRouteUpdate(action) {
  const payload = await resolveRoutePhotoRef(action);
  await base44.entities.Route.update(action.routeId, payload);
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

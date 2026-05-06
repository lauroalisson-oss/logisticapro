// IndexedDB-backed store for delivery / km photos and signatures.
//
// Why a separate store: blobs are heavy (hundreds of KB each). Embedding
// them in the action queue's payload would bloat IndexedDB writes and the
// eventual Route.update body. Here we keep the binary out of band and the
// queue carries only a `proof_id` reference. At flush time the queue reads
// the blob, uploads it, and replaces the reference with a server URL.
//
// Records survive across reloads, app kills and offline periods. They are
// only removed after a successful upload + server confirmation.

import { sha256OfBlob, buildIntegrityBundle } from "@/lib/secureProof";

const DB_NAME = "proof_store_db";
const STORE_NAME = "proofs";
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

async function tx(mode) {
  const db = await openDB();
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function newId() {
  return `proof-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getCurrentGps(timeoutMs = 4000) {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => { if (!done) { done = true; clearTimeout(t); resolve(null); } },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 }
    );
  });
}

// Capture a proof bundle (one or both of photo and signature). Returns the
// stored record, including the proof_id that callers should pass to the
// action queue.
export async function captureProof({
  kind,                  // "delivery" | "km_departure" | "km_arrival"
  route_id,
  stop_order_id,
  driver_email,
  image_blob,
  signature_blob,
  gps,
}) {
  const id = newId();
  const captured_at = new Date().toISOString();
  const fix = gps ?? await getCurrentGps();
  const image_hash = image_blob ? await sha256OfBlob(image_blob) : null;
  const signature_hash = signature_blob ? await sha256OfBlob(signature_blob) : null;
  const bundle = await buildIntegrityBundle({
    proof_id: id,
    route_id,
    stop_order_id,
    driver_email,
    captured_at,
    captured_lat: fix?.latitude ?? null,
    captured_lng: fix?.longitude ?? null,
    captured_accuracy: fix?.accuracy ?? null,
    image_hash,
    signature_hash,
  });
  const record = {
    id,
    kind,
    route_id,
    stop_order_id: stop_order_id || null,
    driver_email: driver_email || null,
    image_blob: image_blob || null,
    signature_blob: signature_blob || null,
    captured_at,
    captured_lat: bundle.captured_lat,
    captured_lng: bundle.captured_lng,
    captured_accuracy: bundle.captured_accuracy,
    image_hash,
    signature_hash,
    bundle_hash: bundle.bundle_hash,
    bundle_v: bundle.v,
    proof_url: null,
    signature_url: null,
    status: "pending",
    created_at: captured_at,
  };
  const store = await tx("readwrite");
  await new Promise((resolve, reject) => {
    const r = store.put(record);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  return record;
}

export async function getProof(id) {
  if (!id) return null;
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const r = store.get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

export async function markProofSynced(id, { proof_url, signature_url }) {
  const existing = await getProof(id);
  if (!existing) return;
  const next = {
    ...existing,
    proof_url: proof_url ?? existing.proof_url,
    signature_url: signature_url ?? existing.signature_url,
    // Drop the raw blobs once the server has them — no point keeping
    // hundreds of KB around forever. Hashes stay so the device can still
    // verify the bundle if asked.
    image_blob: null,
    signature_blob: null,
    status: "synced",
    synced_at: new Date().toISOString(),
  };
  const store = await tx("readwrite");
  await new Promise((resolve, reject) => {
    const r = store.put(next);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
  return next;
}

export async function deleteProof(id) {
  if (!id) return;
  const store = await tx("readwrite");
  await new Promise((resolve, reject) => {
    const r = store.delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

// Build the metadata blob that should be persisted alongside the route
// stop / route entity, so the central can verify integrity later.
export function proofMetadataFromRecord(rec) {
  if (!rec) return null;
  return {
    proof_id: rec.id,
    bundle_v: rec.bundle_v,
    bundle_hash: rec.bundle_hash,
    image_hash: rec.image_hash,
    signature_hash: rec.signature_hash,
    captured_at: rec.captured_at,
    captured_lat: rec.captured_lat,
    captured_lng: rec.captured_lng,
    captured_accuracy: rec.captured_accuracy,
    driver_email: rec.driver_email,
    synced_at: rec.synced_at || null,
  };
}

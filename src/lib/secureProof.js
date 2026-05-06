// Tamper-evident proof bundles.
//
// Each captured photo / signature gets:
//  - a SHA-256 hash of the bytes (immutable fingerprint),
//  - a metadata block (driver, route, stop, timestamp, GPS),
//  - a SHA-256 of the metadata + image hashes ("bundle_hash").
//
// The bundle_hash is what gets stored alongside the eventual server URL.
// Any later modification (swapping the photo on the server, editing the
// metadata, copying a signature from one stop to another) changes the
// computed hash, so the central can detect tampering by re-hashing the
// uploaded image and re-deriving the bundle hash.

const BUNDLE_VERSION = 1;

function hex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256OfBlob(blob) {
  if (!blob) return null;
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return hex(digest);
}

// Build a tamper-evident bundle of metadata about this capture. The hashes
// of the image/signature bytes are folded in so editing them post-hoc
// would change the bundle hash.
export async function buildIntegrityBundle({
  proof_id,
  route_id,
  stop_order_id,
  driver_email,
  captured_at,
  captured_lat,
  captured_lng,
  captured_accuracy,
  image_hash,
  signature_hash,
}) {
  const fields = {
    v: BUNDLE_VERSION,
    proof_id,
    route_id: route_id || null,
    stop_order_id: stop_order_id || null,
    driver_email: driver_email || null,
    captured_at,
    captured_lat: captured_lat ?? null,
    captured_lng: captured_lng ?? null,
    captured_accuracy: captured_accuracy ?? null,
    image_hash: image_hash || null,
    signature_hash: signature_hash || null,
  };
  // Stable serialization (sorted keys) so the same input always hashes the same.
  const ordered = Object.keys(fields).sort().reduce((acc, k) => {
    acc[k] = fields[k];
    return acc;
  }, {});
  const buf = new TextEncoder().encode(JSON.stringify(ordered));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return { ...fields, bundle_hash: hex(digest) };
}

// Helper for re-verifying a bundle hash. Returns true if the recomputed
// hash matches the stored bundle_hash.
export async function verifyBundle(bundle) {
  if (!bundle?.bundle_hash) return false;
  // eslint-disable-next-line no-unused-vars
  const { bundle_hash, ...rest } = bundle;
  const recomputed = await buildIntegrityBundle(rest);
  return recomputed.bundle_hash === bundle_hash;
}

export function shortHash(hash) {
  if (!hash) return "";
  return hash.slice(0, 8) + "…" + hash.slice(-6);
}

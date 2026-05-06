import { useRef, useState } from "react";
import { Camera, CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { captureProof } from "@/lib/proofStore";
import { shortHash } from "@/lib/secureProof";

// Captures a photo locally first (Blob → IndexedDB with integrity hashes),
// then asks the parent to enqueue the action. The actual upload to base44
// happens later, at queue flush time, so the driver can complete the step
// even fully offline. The bundle hash makes the capture tamper-evident:
// editing the photo or its metadata afterwards changes the hash.
export default function OdometerCamera({ label, onCapture, existingUrl, kind = "km", routeId, driverEmail }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(existingUrl || null);
  const [proof, setProof] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    try {
      const rec = await captureProof({
        kind,
        route_id: routeId,
        driver_email: driverEmail,
        image_blob: file,
      });
      setProof(rec);
      onCapture({ proofId: rec.id, previewUrl: localUrl, bundleHash: rec.bundle_hash, capturedAt: rec.captured_at });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[OdometerCamera] capture failed:", err);
      onCapture(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />

      {preview ? (
        <div className="space-y-1">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={preview} alt="Odômetro" className="w-full h-40 object-cover" />
            <div className="absolute top-2 right-2 flex gap-2">
              <div className="bg-green-500 rounded-full p-1">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="bg-black/60 rounded-full p-1"
                type="button"
              >
                <RotateCcw className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          {proof && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              Capturada com lacre {shortHash(proof.bundle_hash)} — sincroniza online
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/30"
          type="button"
        >
          <Camera className="w-8 h-8" />
          <span className="text-sm">Tirar foto do hodômetro</span>
        </button>
      )}
    </div>
  );
}

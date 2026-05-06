import { useRef, useState } from "react";
import { Camera, Loader2, CheckCircle2, RotateCcw, Pen, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureProof } from "@/lib/proofStore";

// Simple canvas signature pad
function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] || e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e, canvasRef.current);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = (e) => {
    e.preventDefault();
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      onSave({ blob, dataUrl: canvas.toDataURL("image/png") });
    }, "image/png");
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Assinatura do recebedor</p>
      <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <p className="text-xs text-muted-foreground text-center">Assine dentro do quadro acima</p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clear} className="flex-1" type="button"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Limpar</Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1" type="button"><X className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
        <Button size="sm" onClick={save} className="flex-1" type="button"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar</Button>
      </div>
    </div>
  );
}

// Photo capture for delivery proof — keeps the file as a Blob in memory
// until "Confirmar Entrega" is pressed, when it's bundled with the
// signature into a single tamper-evident proof record.
function ProofCamera({ label, file, previewUrl, onPick }) {
  const inputRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    onPick(f, URL.createObjectURL(f));
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {previewUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={previewUrl} alt="Comprovante" className="w-full h-32 object-cover" />
          <div className="absolute top-2 right-2 flex gap-1">
            <div className="bg-green-500 rounded-full p-1"><CheckCircle2 className="w-3.5 h-3.5 text-white" /></div>
            <button onClick={() => inputRef.current?.click()} className="bg-black/60 rounded-full p-1" type="button"><RotateCcw className="w-3.5 h-3.5 text-white" /></button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-28 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/20"
          type="button"
        >
          <Camera className="w-6 h-6" />
          <span className="text-xs">Fotografar comprovante</span>
        </button>
      )}
    </div>
  );
}

// onConfirm receives { proofId, photoPreviewUrl, signaturePreviewUrl, bundleHash, capturedAt }
export default function DeliveryProof({ onConfirm, onCancel, uploading, routeId, stopOrderId, driverEmail }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [signatureBlob, setSignatureBlob] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  const [bundling, setBundling] = useState(false);

  const handleSignatureSave = ({ blob, dataUrl }) => {
    setSignatureBlob(blob);
    setSignaturePreview(dataUrl);
    setShowSignature(false);
  };

  const handleConfirm = async () => {
    setBundling(true);
    try {
      const rec = await captureProof({
        kind: "delivery",
        route_id: routeId,
        stop_order_id: stopOrderId,
        driver_email: driverEmail,
        image_blob: photoFile || null,
        signature_blob: signatureBlob || null,
      });
      onConfirm({
        proofId: rec.id,
        photoPreviewUrl: photoPreview,
        signaturePreviewUrl: signaturePreview,
        bundleHash: rec.bundle_hash,
        capturedAt: rec.captured_at,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[DeliveryProof] capture failed:", err);
      onConfirm(null);
    } finally {
      setBundling(false);
    }
  };

  return (
    <div className="space-y-4">
      {showSignature ? (
        <SignaturePad onSave={handleSignatureSave} onCancel={() => setShowSignature(false)} />
      ) : (
        <>
          <ProofCamera
            label="📷 Foto da entrega"
            file={photoFile}
            previewUrl={photoPreview}
            onPick={(f, url) => { setPhotoFile(f); setPhotoPreview(url); }}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium">✍️ Assinatura do recebedor</p>
            {signaturePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={signaturePreview} alt="Assinatura" className="w-full h-24 object-contain bg-white" />
                <button
                  onClick={() => setShowSignature(true)}
                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                  type="button"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSignature(true)}
                className="w-full h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/20"
                type="button"
              >
                <Pen className="w-5 h-5" /><span className="text-xs">Capturar assinatura</span>
              </button>
            )}
          </div>

          {(photoPreview || signaturePreview) && (
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5">
              <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
              Cada captura recebe um lacre criptográfico (SHA-256) com data, GPS e
              motorista. A assinatura não pode ser alterada depois.
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} type="button">Cancelar</Button>
            <Button
              className="flex-1 bg-accent hover:bg-accent/90"
              disabled={uploading || bundling || (!photoFile && !signatureBlob)}
              onClick={handleConfirm}
              type="button"
            >
              {uploading || bundling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar Entrega
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

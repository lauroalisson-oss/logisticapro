import { useRef, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Loader2, CheckCircle2, RotateCcw, Pen, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    onSave(canvas.toDataURL("image/png"));
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
        <Button variant="outline" size="sm" onClick={clear} className="flex-1"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Limpar</Button>
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1"><X className="w-3.5 h-3.5 mr-1" /> Cancelar</Button>
        <Button size="sm" onClick={save} className="flex-1"><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar</Button>
      </div>
    </div>
  );
}

// Photo capture for delivery proof
function ProofCamera({ label, onCapture, existingUrl }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(existingUrl || null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploading(false);
    onCapture(file_url);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={preview} alt="Comprovante" className="w-full h-32 object-cover" />
          {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 className="w-6 h-6 text-white animate-spin" /></div>}
          {!uploading && (
            <div className="absolute top-2 right-2 flex gap-1">
              <div className="bg-green-500 rounded-full p-1"><CheckCircle2 className="w-3.5 h-3.5 text-white" /></div>
              <button onClick={() => inputRef.current?.click()} className="bg-black/60 rounded-full p-1"><RotateCcw className="w-3.5 h-3.5 text-white" /></button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-28 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/20"
        >
          <Camera className="w-6 h-6" />
          <span className="text-xs">Fotografar comprovante</span>
        </button>
      )}
    </div>
  );
}

export default function DeliveryProof({ onConfirm, onCancel, uploading }) {
  const [photoUrl, setPhotoUrl] = useState(null);
  const [signatureData, setSignatureData] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);

  const handleSignatureSave = async (dataUrl) => {
    setShowSignature(false);
    setUploadingSignature(true);
    // Convert dataUrl to blob then upload
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], "assinatura.png", { type: "image/png" });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setSignatureData(file_url);
    setUploadingSignature(false);
  };

  return (
    <div className="space-y-4">
      {showSignature ? (
        <SignaturePad onSave={handleSignatureSave} onCancel={() => setShowSignature(false)} />
      ) : (
        <>
          <ProofCamera label="📷 Foto da entrega" onCapture={setPhotoUrl} />

          <div className="space-y-2">
            <p className="text-sm font-medium">✍️ Assinatura do recebedor</p>
            {signatureData ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={signatureData} alt="Assinatura" className="w-full h-24 object-contain bg-white" />
                <button
                  onClick={() => setShowSignature(true)}
                  className="absolute top-2 right-2 bg-black/60 rounded-full p-1"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSignature(true)}
                className="w-full h-20 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/20"
              >
                {uploadingSignature ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Pen className="w-5 h-5" /><span className="text-xs">Capturar assinatura</span></>}
              </button>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>Cancelar</Button>
            <Button
              className="flex-1 bg-accent hover:bg-accent/90"
              disabled={uploading || uploadingSignature}
              onClick={() => onConfirm({ photoUrl, signatureData })}
            >
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Confirmar Entrega
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
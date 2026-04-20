import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Loader2, CheckCircle2, RotateCcw } from "lucide-react";

export default function OdometerCamera({ label, onCapture, existingUrl }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(existingUrl || null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploading(false);
    onCapture(file_url);
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
        <div className="relative rounded-xl overflow-hidden border border-border">
          <img src={preview} alt="Odômetro" className="w-full h-40 object-cover" />
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
          {!uploading && (
            <div className="absolute top-2 right-2 flex gap-2">
              <div className="bg-green-500 rounded-full p-1">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="bg-black/60 rounded-full p-1"
              >
                <RotateCcw className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-36 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors bg-muted/30"
        >
          <Camera className="w-8 h-8" />
          <span className="text-sm">Tirar foto do hodômetro</span>
        </button>
      )}
    </div>
  );
}
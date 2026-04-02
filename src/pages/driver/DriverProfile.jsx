import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Save, Loader2 } from "lucide-react";

export default function DriverProfile() {
  const [user, setUser] = useState(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    setPhone(me?.phone || "");
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({ phone });
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3 pb-4 border-b border-border">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-bold">{user?.full_name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <p className="text-xs text-muted-foreground">Motorista</p>
          </div>
        </div>

        <div>
          <Label>Telefone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function RoleRouter() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(user => {
      setRole(user?.role || "driver");
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role === "driver") {
    return <Navigate to="/driver" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}
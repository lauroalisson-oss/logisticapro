import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

export default function RoleRouter() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isDriver, setIsDriver] = useState(false);

  useEffect(() => {
    base44.auth.me().then(user => {
      setRole(user?.role || "user");
      setIsDriver(!!(user?.is_driver || user?.driver_pin));
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

  if (isDriver && role !== "admin") {
    return <Navigate to="/driver" replace />;
  }

  return <Navigate to="/dashboard" replace />;
}
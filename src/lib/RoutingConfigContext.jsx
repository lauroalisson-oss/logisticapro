import React, { createContext, useContext, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { configureRouting, supportsAvoidTolls } from "@/lib/routing";

// Busca a configuração do motor de rotas (provider + token do Mapbox) no
// backend uma vez ao iniciar e aplica em configureRouting(). No Base44 o
// token fica em um Segredo, acessível só ao backend — o build do frontend
// não o enxerga, então precisamos buscá-lo em runtime.
const RoutingConfigContext = createContext({ ready: false, avoidTollsSupported: false });

export const RoutingConfigProvider = ({ children }) => {
  const [state, setState] = useState({ ready: false, avoidTollsSupported: supportsAvoidTolls() });

  useEffect(() => {
    let cancelled = false;
    base44.functions
      .invoke("getMapboxConfig", {})
      .then((res) => {
        if (cancelled) return;
        const { provider, token } = res.data || {};
        configureRouting({ provider, token });
      })
      .catch(() => {
        // Sem config do backend, segue com o valor de build (OSRM por padrão).
      })
      .finally(() => {
        if (!cancelled) setState({ ready: true, avoidTollsSupported: supportsAvoidTolls() });
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <RoutingConfigContext.Provider value={state}>
      {children}
    </RoutingConfigContext.Provider>
  );
};

export const useRoutingConfig = () => useContext(RoutingConfigContext);

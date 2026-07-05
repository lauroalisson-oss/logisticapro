import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Entrega ao frontend a configuração do motor de rotas (provider + token do
// Mapbox). O token do Mapbox é guardado como Segredo no Base44, que só é
// acessível às funções de backend — o build do frontend não enxerga esse
// valor. Por isso o app busca aqui em runtime e configura o motor de rotas.
//
// Segredos esperados (cadastrados em Segredos do aplicativo):
//   VITE_MAPBOX_TOKEN     — token público do Mapbox (pk....), restrito por URL
//   VITE_ROUTING_PROVIDER — "mapbox" (opcional; default "mapbox" se houver token)
//
// O token é público e restrito por domínio no painel da Mapbox, então
// entregá-lo a um usuário autenticado é seguro; ainda assim exigimos login
// para não expô-lo a visitantes anônimos.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('VITE_MAPBOX_TOKEN') || '';
    // Se um token existe mas o provider não foi definido, assume mapbox.
    const provider = (Deno.env.get('VITE_ROUTING_PROVIDER') || (token ? 'mapbox' : 'osrm')).toLowerCase();

    return Response.json({ provider, token });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

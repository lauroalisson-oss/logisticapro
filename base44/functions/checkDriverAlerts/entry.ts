import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Max distance in km before triggering "off_route" alert
const OFF_ROUTE_THRESHOLD_KM = 0.5;
// Minutes without GPS update before triggering "gps_silent" alert
const GPS_SILENCE_MINUTES = 10;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Minimum distance from a point to any segment on the route polyline
function minDistanceToRouteKm(lat, lon, stops) {
  let minDist = Infinity;
  for (const stop of stops) {
    const d = haversineKm(lat, lon, stop.latitude, stop.longitude);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sr = base44.asServiceRole;

    // Fetch all active routes and driver locations
    const [routes, locations, existingAlerts] = await Promise.all([
      sr.entities.Route.filter({ status: ['started', 'in_progress'] }),
      sr.entities.DriverLocation.filter({ is_active: true }),
      sr.entities.Alert.filter({ status: 'pending' }),
    ]);

    const now = new Date();
    const created = [];

    for (const route of routes) {
      const loc = locations.find(l => l.driver_email === route.driver_email);

      // ---------- GPS SILENCE CHECK ----------
      const silenceKey = `gps_silent_${route.id}`;
      const alreadySilent = existingAlerts.find(
        a => a.type === 'gps_silent' && a.route_id === route.id
      );
      if (!alreadySilent) {
        let isSilent = false;
        if (!loc) {
          // Never sent a location
          const startedAt = route.started_at ? new Date(route.started_at) : null;
          if (startedAt) {
            const minutesSinceStart = (now - startedAt) / 60000;
            if (minutesSinceStart > GPS_SILENCE_MINUTES) isSilent = true;
          }
        } else {
          const lastUpdate = new Date(loc.last_update);
          const minutesSilent = (now - lastUpdate) / 60000;
          if (minutesSilent > GPS_SILENCE_MINUTES) isSilent = true;
        }

        if (isSilent) {
          await sr.entities.Alert.create({
            company_id: route.company_id,
            type: 'gps_silent',
            status: 'pending',
            route_id: route.id,
            route_number: route.route_number,
            driver_name: route.driver_name,
            driver_email: route.driver_email,
            notes: `Motorista sem enviar localização por mais de ${GPS_SILENCE_MINUTES} minutos.`,
          });
          created.push(`gps_silent:${route.route_number}`);
        }
      }

      // ---------- OFF-ROUTE CHECK ----------
      if (!loc || !loc.latitude || !loc.longitude) continue;

      const routeStops = (route.stops || []).filter(s => s.latitude && s.longitude && !s._isDeparture);
      if (routeStops.length === 0) continue;

      const distKm = minDistanceToRouteKm(loc.latitude, loc.longitude, routeStops);
      const alreadyOffRoute = existingAlerts.find(
        a => a.type === 'off_route' && a.route_id === route.id
      );

      if (distKm > OFF_ROUTE_THRESHOLD_KM && !alreadyOffRoute) {
        await sr.entities.Alert.create({
          company_id: route.company_id,
          type: 'off_route',
          status: 'pending',
          route_id: route.id,
          route_number: route.route_number,
          driver_name: route.driver_name,
          driver_email: route.driver_email,
          notes: `Motorista a ${distKm.toFixed(1)} km da rota planejada (limite: ${OFF_ROUTE_THRESHOLD_KM} km).`,
        });
        created.push(`off_route:${route.route_number}`);
      }

      // Auto-resolve off_route alerts when driver returns to route
      if (distKm <= OFF_ROUTE_THRESHOLD_KM && alreadyOffRoute) {
        await sr.entities.Alert.update(alreadyOffRoute.id, {
          status: 'resolved',
          resolved_at: now.toISOString(),
          resolved_by: 'Sistema automático',
        });
      }
    }

    return Response.json({ checked: routes.length, created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();

  const { data, old_data } = body;

  if (!data || !data.stops) {
    return Response.json({ skipped: true });
  }

  const oldStops = old_data?.stops || [];
  const newStops = data.stops || [];

  const createdAlerts = [];

  for (const stop of newStops) {
    if (stop.status !== "issue" && stop.status !== "not_delivered") continue;

    // Check if this stop already had this status in old_data
    const oldStop = oldStops.find(s => s.order_id === stop.order_id);
    if (oldStop && (oldStop.status === "issue" || oldStop.status === "not_delivered")) continue;

    // Check if alert already exists for this stop
    const existing = await base44.asServiceRole.entities.Alert.filter({
      route_id: data.id,
      order_id: stop.order_id,
    });
    if (existing.length > 0) continue;

    const alert = await base44.asServiceRole.entities.Alert.create({
      type: stop.status === "not_delivered" ? "not_delivered" : "issue",
      status: "pending",
      route_id: data.id,
      route_number: data.route_number,
      order_id: stop.order_id,
      order_number: stop.order_number,
      client_name: stop.client_name,
      address: stop.address,
      driver_name: data.driver_name,
      driver_email: data.driver_email,
      notes: stop.delivery_notes || "",
    });
    createdAlerts.push(alert);
  }

  return Response.json({ created: createdAlerts.length });
});
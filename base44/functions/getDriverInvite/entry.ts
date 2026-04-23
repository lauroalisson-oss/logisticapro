import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Find pending invite for this user's email
    const invites = await base44.asServiceRole.entities.DriverInvite.filter({
      email: user.email,
      status: 'pending'
    });

    if (!invites || invites.length === 0) {
      return Response.json({ invite: null });
    }

    return Response.json({ invite: invites[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
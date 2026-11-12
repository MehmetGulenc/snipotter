import { createJwt, pushPayload, secretMatches, type Action } from './apns.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!await secretMatches(req.headers.get('x-webhook-secret'), Deno.env.get('ACTION_PUSH_WEBHOOK_SECRET') ?? '')) return new Response('Unauthorized', { status: 401 });
  const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
  try {
    const event = await req.json();
    if (event.type !== 'INSERT' || event.table !== 'device_actions' || event.schema !== 'public' || !/^[0-9a-f-]{36}$/i.test(event.record?.id ?? '')) return new Response('Invalid event', { status: 400 });
    const base = `${env('SUPABASE_URL')}/rest/v1`;
    const service = env('SUPABASE_SERVICE_ROLE_KEY');
    const headers = { apikey: service, Authorization: `Bearer ${service}` };
    const read = async (path: string) => { const r = await fetch(`${base}/${path}`, { headers }); if (!r.ok) throw new Error('Database request failed'); return r.json(); };
    // Read canonical state; never trust webhook content as the action payload.
    const [action]: Action[] = await read(`device_actions?id=eq.${event.record.id}&select=*`);
    if (!action || action.consumed_at || Date.parse(action.expires_at) <= Date.now()) return Response.json({ sent: 0 });
    const members: { user_id: string }[] = await read(`workspace_members?workspace_id=eq.${action.workspace_id}&select=user_id`);
    const memberIds = new Set(members.map(m => m.user_id));
    const tokens: { id: string; user_id: string; token: string; environment: string }[] = await read(`push_tokens?workspace_id=eq.${action.workspace_id}&platform=eq.ios&select=id,user_id,token,environment`);
    const jwt = await createJwt(env('APNS_PRIVATE_KEY'), env('APNS_KEY_ID'), env('APNS_TEAM_ID'));
    let sent = 0;
    let failed = 0;
    for (const token of tokens.filter(t => memberIds.has(t.user_id) && t.user_id !== action.sender_user_id)) {
      const host = token.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
      const response = await fetch(`https://${host}/3/device/${token.token}`, { method: 'POST', headers: {
        'content-type': 'application/json', authorization: `bearer ${jwt}`, 'apns-topic': env('APNS_TOPIC'), 'apns-push-type': 'alert', 'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.parse(action.expires_at) / 1000)), 'apns-collapse-id': action.id,
      }, body: JSON.stringify(pushPayload(action)) });
      if (response.status === 410) {
        // Match the token too: a concurrent token refresh must survive cleanup.
        const deleted = await fetch(`${base}/push_tokens?id=eq.${token.id}&token=eq.${token.token}`, { method: 'DELETE', headers });
        if (!deleted.ok) throw new Error('Token cleanup failed');
      } else if (response.ok) sent++;
      else failed++;
    }
    return Response.json({ sent, failed }, { status: failed ? 502 : 200 });
  } catch {
    // Do not log credentials, device tokens or action payloads.
    return new Response('Push delivery failed', { status: 500 });
  }
});

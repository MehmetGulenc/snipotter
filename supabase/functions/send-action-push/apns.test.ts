import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJwt, pushPayload, secretMatches, spaceNotePayload } from './apns.ts';

test('ES256 JWT has APNs claims and a verifiable JOSE signature', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
  const jwt = await createJwt(pem, 'TESTKEY', 'TESTTEAM', 1700000000000);
  const [header, body, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'ES256', kid: 'TESTKEY' });
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url').toString()), { iss: 'TESTTEAM', iat: 1700000000 });
  assert.equal(Buffer.from(signature, 'base64url').length, 64);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${body}`)), true);
});
test('payload preserves Turkish actions within APNs 4KB limit', () => {
  const action = { id: crypto.randomUUID(), workspace_id: crypto.randomUUID(), sender_user_id: crypto.randomUUID(), kind: 'address' as const, payload: 'İstanbul Çiçek sokağı', expires_at: new Date().toISOString(), consumed_at: null };
  const body = pushPayload(action);
  assert.equal(body.aps.category, 'SNIPOTTER_ADDRESS');
  for (const [kind, category] of Object.entries({ phone: 'SNIPOTTER_PHONE', address: 'SNIPOTTER_ADDRESS', url: 'SNIPOTTER_URL', iban: 'SNIPOTTER_COPY', text: 'SNIPOTTER_COPY' })) {
    assert.equal(pushPayload({ ...action, kind: kind as typeof action.kind }).aps.category, category);
  }
  assert.equal(body.payload, action.payload);
  assert.equal(body.action_id, action.id);
  assert.equal(JSON.stringify(body.aps).includes(action.payload), false);
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 4096);
  const large = pushPayload({ ...action, payload: '😀'.repeat(2000) });
  assert.equal(large.payload, '');
  assert.ok(Buffer.byteLength(JSON.stringify(large)) < 4096);
});
test('webhook secret rejects missing and incorrect credentials', async () => {
  assert.equal(await secretMatches(null, 'secret'), false);
  assert.equal(await secretMatches('secret', ''), false);
  assert.equal(await secretMatches('wrong', 'secret'), false);
  assert.equal(await secretMatches('secret', 'secret'), true);
});

test('webhook rejects unauthorized requests and deletes only APNs 410 tokens', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
  const vars: Record<string, string> = { ACTION_PUSH_WEBHOOK_SECRET: 'test-only-secret', SUPABASE_URL: 'https://db.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only-service', APNS_PRIVATE_KEY: pem, APNS_KEY_ID: 'TESTKEY', APNS_TEAM_ID: 'TESTTEAM', APNS_TOPIC: 'com.example.test' };
  let handler: (req: Request) => Promise<Response>;
  const runtime = globalThis as typeof globalThis & { Deno?: unknown };
  runtime.Deno = { env: { get: (name: string) => vars[name] }, serve: (fn: typeof handler) => { handler = fn; } };
  const originalFetch = globalThis.fetch;
  const calls: { url: string; method: string }[] = [];
  const id = crypto.randomUUID();
  const ws = crypto.randomUUID();
  const user = crypto.randomUUID();
  const sender = crypto.randomUUID();
  const expiredToken = 'a'.repeat(64);
  globalThis.fetch = async (input, init) => {
    const url = String(input); const method = init?.method ?? 'GET'; calls.push({ url, method });
    if (url.includes('push.apple.com')) return new Response(null, { status: 410 });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/device_actions?')) return Response.json([{ id, workspace_id: ws, sender_user_id: sender, kind: 'phone', payload: '+905551112233', expires_at: new Date(Date.now() + 60000).toISOString(), consumed_at: null }]);
    if (url.includes('/workspace_members?')) return Response.json([{ user_id: user }, { user_id: sender }]);
    if (url.includes('/push_tokens?')) return Response.json([{ id: 'token-row', user_id: user, token: expiredToken, environment: 'sandbox' }, { id: 'sender-row', user_id: sender, token: 'b'.repeat(64), environment: 'sandbox' }]);
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    await import('./index.ts');
    assert.equal((await handler!(new Request('https://fn.invalid', { method: 'POST' }))).status, 401);
    assert.equal(calls.length, 0);
    const result = await handler!(new Request('https://fn.invalid', { method: 'POST', headers: { 'x-webhook-secret': vars.ACTION_PUSH_WEBHOOK_SECRET }, body: JSON.stringify({ type: 'INSERT', schema: 'public', table: 'device_actions', record: { id } }) }));
    assert.equal(result.status, 200);
    assert.equal(calls.filter(c => c.url.startsWith('https://api.sandbox.push.apple.com/')).length, 1);
    assert.ok(!calls.some(c => c.url.includes('b'.repeat(64))));
    assert.ok(calls.some(c => c.method === 'DELETE' && c.url.includes(`id=eq.token-row&token=eq.${expiredToken}`)));
  } finally { globalThis.fetch = originalFetch; delete runtime.Deno; }
});
test('shared-space note push carries ids only', () => {
  const space = crypto.randomUUID();
  const note = crypto.randomUUID();
  const body = spaceNotePayload(space, note);
  assert.equal(body.aps.category, 'SNIPOTTER_SPACE_NOTE');
  assert.equal(body.space_id, space);
  assert.equal(body.note_id, note);
  assert.equal(body.aps['thread-id'], space);
  assert.deepEqual(Object.keys(body).sort(), ['aps', 'note_id', 'space_id']);
});

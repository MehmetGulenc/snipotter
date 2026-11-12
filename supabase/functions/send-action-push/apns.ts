export interface Action {
  id: string; workspace_id: string; sender_user_id: string;
  kind: 'phone' | 'address' | 'iban' | 'url' | 'text'; payload: string;
  expires_at: string; consumed_at: string | null;
}
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const json64 = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
export async function createJwt(pem: string, keyId: string, teamId: string, now = Date.now()): Promise<string> {
  const raw = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(raw), c => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const data = `${json64({ alg: 'ES256', kid: keyId })}.${json64({ iss: teamId, iat: Math.floor(now / 1000) })}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data));
  return `${data}.${encode(new Uint8Array(signature))}`;
}
export function pushPayload(action: Action) {
  // Avoid exposing phone numbers, IBANs or other content on the lock screen.
  return { aps: { alert: { title: 'Snipotter', body: 'Cihazından yeni bir işlem geldi' }, sound: 'default', category: ({ phone: 'SNIPOTTER_PHONE', address: 'SNIPOTTER_ADDRESS', url: 'SNIPOTTER_URL', iban: 'SNIPOTTER_COPY', text: 'SNIPOTTER_COPY' } as const)[action.kind] }, action_id: action.id, kind: action.kind, payload: new TextEncoder().encode(action.payload).length <= 3000 ? action.payload : '' };
}
export async function secretMatches(actual: string | null, expected: string): Promise<boolean> {
  if (!actual || !expected) return false;
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  return a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0) === 0;
}

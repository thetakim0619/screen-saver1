// GET /api/auth/poll?session=XXX -> {ready, token?, name?}
import { makeStore } from '../../_lib/store.js';
import { makeAuth } from '../../_lib/auth.js';
import { json, preflight } from '../../_lib/http.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  const S = makeStore(env);
  const A = makeAuth(S);
  const url = new URL(request.url);
  const session = (url.searchParams.get('session') || '').trim();
  if (!session) return json({ error: 'session 필요' }, 400);
  const s = await A.getSession(session);
  if (!s) return json({ ready: false, expired: true });
  if (s.status === 'ok') return json({ ready: true, token: s.token, name: s.name });
  return json({ ready: false });
}

// GET /api/auth/me?token=XXX  (또는 Authorization: Bearer XXX)
import { makeStore } from '../../_lib/store.js';
import { makeAuth } from '../../_lib/auth.js';
import { json, preflight } from '../../_lib/http.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  const S = makeStore(env);
  const A = makeAuth(S);
  const url = new URL(request.url);
  let token = (url.searchParams.get('token') || '').trim();
  if (!token) {
    const auth = request.headers.get('authorization') || '';
    if (auth) token = auth.replace(/^Bearer\s+/i, '').trim();
  }
  const uid = await A.resolveToken(token);
  if (!uid) return json({ loggedIn: false });
  const u = await A.getUser(uid);
  if (!u) return json({ loggedIn: false });
  return json({ loggedIn: true, name: u.name, purchased: u.purchased || 0 });
}

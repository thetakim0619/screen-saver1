// GET /api/auth/kakao/start?session=XXX
// 로그인 세션을 만들고 카카오 인증 페이지로 넘긴다.
import { makeStore } from '../../../_lib/store.js';
import { makeAuth } from '../../../_lib/auth.js';
import { originOf } from '../../../_lib/http.js';

export async function onRequest({ request, env }) {
  const BASE = originOf(request);
  const REDIRECT_URI = `${BASE}/api/auth/kakao/callback`;
  const url = new URL(request.url);
  const session = (url.searchParams.get('session') || '').trim();
  const key = env.KAKAO_REST_API_KEY;
  if (!session) return new Response('session 필요', { status: 400 });
  if (!key) return new Response('KAKAO_REST_API_KEY 미설정', { status: 500 });

  const S = makeStore(env);
  const A = makeAuth(S);
  await A.createSession(session);

  const auth = new URL('https://kauth.kakao.com/oauth/authorize');
  auth.searchParams.set('client_id', key);
  auth.searchParams.set('redirect_uri', REDIRECT_URI);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('state', session);
  auth.searchParams.set('scope', 'profile_nickname');
  return new Response(null, { status: 302, headers: { Location: auth.toString() } });
}

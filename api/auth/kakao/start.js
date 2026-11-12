// GET /api/auth/kakao/start?session=XXX
// 로그인 세션을 만들고 카카오 인증 페이지로 넘긴다. (앱이 이 주소를 브라우저로 연다)
'use strict';
const A = require('../../_auth');

const BASE = 'https://screen-war.vercel.app';
const REDIRECT_URI = `${BASE}/api/auth/kakao/callback`;

module.exports = async (req, res) => {
  const url = new URL(req.url, BASE);
  const session = (url.searchParams.get('session') || '').trim();
  const key = process.env.KAKAO_REST_API_KEY;
  if (!session) { res.statusCode = 400; return res.end('session 필요'); }
  if (!key) { res.statusCode = 500; return res.end('KAKAO_REST_API_KEY 미설정'); }

  await A.createSession(session);
  const auth = new URL('https://kauth.kakao.com/oauth/authorize');
  auth.searchParams.set('client_id', key);
  auth.searchParams.set('redirect_uri', REDIRECT_URI);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('state', session);
  auth.searchParams.set('scope', 'profile_nickname');
  res.writeHead(302, { Location: auth.toString() });
  res.end();
};

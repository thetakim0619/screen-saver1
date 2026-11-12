// GET /api/auth/poll?session=XXX
// 앱이 로그인 완료를 기다리며 폴링. 완료면 토큰을 돌려준다.
'use strict';
const A = require('../_auth');
const { send } = require('../_http');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const session = (url.searchParams.get('session') || '').trim();
  if (!session) return send(res, 400, { error: 'session 필요' });
  const s = await A.getSession(session);
  if (!s) return send(res, 200, { ready: false, expired: true });
  if (s.status === 'ok') return send(res, 200, { ready: true, token: s.token, name: s.name });
  return send(res, 200, { ready: false });
};

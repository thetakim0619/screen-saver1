// GET /api/auth/me?token=XXX  (또는 Authorization: Bearer XXX)
// 토큰으로 계정 정보를 돌려준다. (로그인 유지 확인용)
'use strict';
const A = require('../_auth');
const { send } = require('../_http');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let token = (url.searchParams.get('token') || '').trim();
  if (!token && req.headers.authorization) token = req.headers.authorization.replace(/^Bearer\s+/i, '').trim();
  const uid = await A.resolveToken(token);
  if (!uid) return send(res, 200, { loggedIn: false });
  const u = await A.getUser(uid);
  if (!u) return send(res, 200, { loggedIn: false });
  return send(res, 200, { loggedIn: true, name: u.name, purchased: u.purchased || 0 });
};

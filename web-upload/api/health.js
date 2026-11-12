// GET /api/health — Redis 연결 점검용. 비밀 값은 노출하지 않고 상태만 알려준다.
'use strict';
const { send } = require('./_http');

function clean(v) { return v ? String(v).trim().replace(/^["']|["']$/g, '') : v; }

module.exports = async (req, res) => {
  const url = clean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const token = clean(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  const out = {
    hasUrl: !!url,
    hasToken: !!token,
    urlHost: null,
    urlLooksValid: false,
  };
  try { if (url) { out.urlHost = new URL(url).host; out.urlLooksValid = /^https:\/\/.+\.upstash\.io$/.test(url); } } catch { out.urlHost = 'INVALID_URL'; }

  if (url && token) {
    try {
      const k = 'sw:health';
      const r1 = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(['SET', k, String(Date.now()), 'EX', '60']) });
      const j1 = await r1.json().catch(() => ({}));
      const r2 = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(['GET', k]) });
      const j2 = await r2.json().catch(() => ({}));
      out.setHttpStatus = r1.status;
      out.getHttpStatus = r2.status;
      out.roundTrip = (j2 && j2.result) ? 'ok' : 'fail';
      if (j1 && j1.error) out.redisError = j1.error; // 인증 실패 등 메시지(비밀 아님)
    } catch (e) {
      out.fetchError = String(e && e.message || e);
    }
  }
  return send(res, 200, out);
};

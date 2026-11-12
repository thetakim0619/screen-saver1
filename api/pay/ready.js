// POST /api/pay/ready { token, n, item } -> { orderId, redirectUrl }
// 카카오페이 결제준비(ready) 호출. 테스트는 CID=TC0ONETIME + dev 시크릿키.
'use strict';
const A = require('../_auth');
const { kvSet } = require('../_store');
const { readJson, send } = require('../_http');

const CID = process.env.KAKAOPAY_CID || 'TC0ONETIME';
const SECRET = process.env.KAKAOPAY_SECRET_KEY || '';
const PRICE = Number(process.env.SW_PRICE || 500); // 장당 원

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!SECRET) return send(res, 500, { error: '서버에 KAKAOPAY_SECRET_KEY(dev)가 설정되지 않았어요' });

  const b = await readJson(req);
  const uid = await A.resolveToken(b.token);
  if (!uid) return send(res, 401, { error: '로그인 후 결제할 수 있어요' });

  const n = Math.max(1, Math.min(20, (b.n | 0) || 1));
  const amount = n * PRICE;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const BASE = `${proto}://${host}`;
  const orderId = 'sw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  const body = {
    cid: CID,
    partner_order_id: orderId,
    partner_user_id: uid,
    item_name: b.item === 'custom' ? '커스텀 화면' : `공격권 ${n}장`,
    quantity: n,
    total_amount: amount,
    tax_free_amount: 0,
    approval_url: `${BASE}/api/pay/approve?order=${orderId}`,
    cancel_url: `${BASE}/api/pay/done?r=cancel`,
    fail_url: `${BASE}/api/pay/done?r=fail`,
  };

  let r;
  try {
    const resp = await fetch('https://open-api.kakaopay.com/online/v1/payment/ready', {
      method: 'POST',
      headers: { Authorization: `SECRET_KEY ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    r = await resp.json();
    if (!resp.ok) return send(res, 400, { error: `카카오페이 준비 실패: ${r.error_message || JSON.stringify(r)}` });
  } catch (e) {
    return send(res, 502, { error: '카카오페이 연결 실패: ' + e.message });
  }

  await kvSet(`sw:pay:${orderId}`, { tid: r.tid, uid, n, amount, status: 'pending' }, 600);
  const redirectUrl = r.next_redirect_pc_url || r.next_redirect_mobile_url;
  return send(res, 200, { ok: true, orderId, redirectUrl, amount });
};

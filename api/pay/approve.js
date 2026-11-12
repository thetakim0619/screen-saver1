// GET /api/pay/approve?order=..&pg_token=..  (카카오페이가 결제 후 리다이렉트하는 곳)
// 결제승인(approve) 호출 → 성공하면 계정에 공격권 적립. HTML 결과 페이지를 돌려준다.
'use strict';
const A = require('../_auth');
const { kvGet, kvSet } = require('../_store');

const clean = (s) => (s || '').replace(/["']/g, '').replace(/\s+/g, '');
const CID = clean(process.env.KAKAOPAY_CID) || 'TC0ONETIME';
const SECRET = clean(process.env.KAKAOPAY_SECRET_KEY);

function page(title, msg) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <body style="font-family:'Pretendard','Malgun Gothic',system-ui,sans-serif;background:#17181a;color:#e8e8ea;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
  <div><div style="font-size:30px;margin-bottom:10px">${title}</div><div style="color:#8a8f96;font-size:14px;line-height:1.6">${msg}</div>
  <div style="color:#5a5f66;font-size:12px;margin-top:14px">이 창은 닫으셔도 됩니다.</div></div>
  <script>setTimeout(function(){try{window.close()}catch(e){}},2500)</script></body></html>`;
}
function html(res, code, body) { res.statusCode = code; res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(body); }

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const orderId = url.searchParams.get('order');
  const pgToken = url.searchParams.get('pg_token');
  if (!orderId || !pgToken) return html(res, 400, page('결제 확인 실패', '잘못된 접근이에요.'));

  const order = await kvGet(`sw:pay:${orderId}`);
  if (!order) return html(res, 404, page('결제 만료', '결제 세션이 만료됐어요. 다시 시도해 주세요.'));
  if (order.status === 'done') return html(res, 200, page('이미 완료됨', '이미 적립된 결제예요.'));

  let r;
  try {
    const resp = await fetch('https://open-api.kakaopay.com/online/v1/payment/approve', {
      method: 'POST',
      headers: { Authorization: `SECRET_KEY ${SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid: CID, tid: order.tid, partner_order_id: orderId, partner_user_id: order.uid, pg_token: pgToken }),
    });
    r = await resp.json();
    if (!resp.ok) {
      await kvSet(`sw:pay:${orderId}`, Object.assign({}, order, { status: 'fail', err: r.error_message }), 600);
      return html(res, 400, page('결제 승인 실패', (r.error_message || '승인 중 오류가 났어요') + ` (${r.error_code || ''})`));
    }
  } catch (e) {
    return html(res, 502, page('연결 실패', '카카오페이 연결에 실패했어요.'));
  }

  // 계정에 공격권 적립
  const acct = await A.getUser(order.uid);
  if (acct) { acct.purchased = (acct.purchased || 0) + order.n; await A.setUser(acct); }
  await kvSet(`sw:pay:${orderId}`, Object.assign({}, order, { status: 'done', purchased: acct ? acct.purchased : null }), 600);
  return html(res, 200, page('결제 완료', `공격권 ${order.n}장이 계정에 적립됐어요.`));
};

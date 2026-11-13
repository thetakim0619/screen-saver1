// /api/pay/<op>  (op = ready | approve | status | done)  — 카카오페이 결제
import { makeStore } from '../../_lib/store.js';
import { makeAuth } from '../../_lib/auth.js';
import { readJson, json, preflight } from '../../_lib/http.js';

const clean = (s) => (s || '').replace(/["']/g, '').replace(/\s+/g, '');

function page(title, msg) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <body style="font-family:'Pretendard','Malgun Gothic',system-ui,sans-serif;background:#17181a;color:#e8e8ea;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
  <div><div style="font-size:30px;margin-bottom:10px">${title}</div><div style="color:#8a8f96;font-size:14px;line-height:1.6">${msg}</div>
  <div style="color:#5a5f66;font-size:12px;margin-top:14px">이 창은 닫으셔도 됩니다.</div></div>
  <script>setTimeout(function(){try{window.close()}catch(e){}},2500)</script></body></html>`;
}
function htmlResp(body, code = 200) {
  return new Response(body, { status: code, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();

  const S = makeStore(env);
  const A = makeAuth(S);
  const url = new URL(request.url);
  const op = params.op;

  const CID = clean(env.KAKAOPAY_CID) || 'TC0ONETIME';
  const SECRET = clean(env.KAKAOPAY_SECRET_KEY);
  const PRICE = Number(env.SW_PRICE || 500);

  // ---- 결제 준비 ----
  if (op === 'ready') {
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!SECRET) return json({ error: '서버에 KAKAOPAY_SECRET_KEY(dev)가 설정되지 않았어요' }, 500);
    if (SECRET.length < 30) return json({ error: `서버 시크릿키가 ${SECRET.length}자예요 — dev Secret key(약 40자)가 맞는지 확인하세요.` }, 500);
    const b = await readJson(request);
    const uid = await A.resolveToken(b.token);
    if (!uid) return json({ error: '로그인 후 결제할 수 있어요' }, 401);
    const n = Math.max(1, Math.min(20, (b.n | 0) || 1));
    const amount = n * PRICE;
    const BASE = url.origin;
    const orderId = 'sw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const body = {
      cid: CID, partner_order_id: orderId, partner_user_id: uid,
      item_name: b.item === 'custom' ? '커스텀 화면' : `공격권 ${n}장`,
      quantity: n, total_amount: amount, tax_free_amount: 0,
      approval_url: `${BASE}/api/pay/approve?order=${orderId}`,
      cancel_url: `${BASE}/api/pay/done?r=cancel`, fail_url: `${BASE}/api/pay/done?r=fail`,
    };
    let r;
    try {
      const resp = await fetch('https://open-api.kakaopay.com/online/v1/payment/ready', {
        method: 'POST', headers: { Authorization: `SECRET_KEY ${SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      r = await resp.json();
      if (!resp.ok) return json({ error: `카카오페이 준비 실패: ${r.error_message || JSON.stringify(r)}` }, 400);
    } catch (e) { return json({ error: '카카오페이 연결 실패: ' + e.message }, 502); }
    await S.kvSet(`sw:pay:${orderId}`, { tid: r.tid, uid, n, amount, status: 'pending' }, 600);
    return json({ ok: true, orderId, redirectUrl: r.next_redirect_pc_url || r.next_redirect_mobile_url, amount });
  }

  // ---- 결제 승인 (카카오페이 리다이렉트 도착지) ----
  if (op === 'approve') {
    const orderId = url.searchParams.get('order');
    const pgToken = url.searchParams.get('pg_token');
    if (!orderId || !pgToken) return htmlResp(page('결제 확인 실패', '잘못된 접근이에요.'), 400);
    const order = await S.kvGet(`sw:pay:${orderId}`);
    if (!order) return htmlResp(page('결제 만료', '결제 세션이 만료됐어요. 다시 시도해 주세요.'), 404);
    if (order.status === 'done') return htmlResp(page('이미 완료됨', '이미 적립된 결제예요.'));
    let r;
    try {
      const resp = await fetch('https://open-api.kakaopay.com/online/v1/payment/approve', {
        method: 'POST', headers: { Authorization: `SECRET_KEY ${SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: CID, tid: order.tid, partner_order_id: orderId, partner_user_id: order.uid, pg_token: pgToken }),
      });
      r = await resp.json();
      if (!resp.ok) {
        await S.kvSet(`sw:pay:${orderId}`, { ...order, status: 'fail', err: r.error_message }, 600);
        return htmlResp(page('결제 승인 실패', (r.error_message || '승인 중 오류가 났어요') + ` (${r.error_code || ''})`), 400);
      }
    } catch (e) { return htmlResp(page('연결 실패', '카카오페이 연결에 실패했어요.'), 502); }
    const acct = await A.getUser(order.uid);
    if (acct) { acct.purchased = (acct.purchased || 0) + order.n; await A.setUser(acct); }
    await S.kvSet(`sw:pay:${orderId}`, { ...order, status: 'done', purchased: acct ? acct.purchased : null }, 600);
    return htmlResp(page('결제 완료', `공격권 ${order.n}장이 계정에 적립됐어요.`));
  }

  // ---- 상태 폴링 ----
  if (op === 'status') {
    const orderId = url.searchParams.get('order');
    if (!orderId) return json({ error: 'order 필요' }, 400);
    const order = await S.kvGet(`sw:pay:${orderId}`);
    if (!order) return json({ status: 'expired' });
    return json({ status: order.status, purchased: order.purchased == null ? null : order.purchased });
  }

  // ---- 취소/실패 랜딩 ----
  if (op === 'done') {
    const r = url.searchParams.get('r') || 'cancel';
    return htmlResp(page(r === 'fail' ? '결제 실패' : '결제 취소', r === 'fail' ? '결제에 실패했어요.' : '결제를 취소했어요.'));
  }

  return json({ error: 'unknown op' }, 404);
}

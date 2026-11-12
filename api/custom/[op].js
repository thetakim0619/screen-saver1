// /api/custom/<op>  (op = upload | list | img | del)
// 동적 라우트 하나로 커스텀 이미지 엔드포인트를 묶는다(무료 플랜 함수 개수 절약).
'use strict';
const A = require('../_auth');
const { kvGet, kvSet, kvDel } = require('../_store');
const { readJson, send } = require('../_http');

const MAX = 2;
const MAX_B64 = 420000; // ~300KB

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const url = new URL(req.url, 'http://x');
  const op = url.pathname.split('/').pop();

  // ---- 이미지 제공 (공개: 피해자 오버레이가 불러옴) ----
  if (op === 'img') {
    const o = url.searchParams.get('o'), id = url.searchParams.get('id');
    if (!o || !id) { res.statusCode = 400; return res.end('bad'); }
    const rec = await kvGet(`sw:custimg:${o}:${id}`);
    if (!rec || !rec.data) { res.statusCode = 404; return res.end('not found'); }
    res.statusCode = 200;
    res.setHeader('content-type', rec.mime || 'image/jpeg');
    res.setHeader('cache-control', 'public, max-age=86400');
    res.setHeader('access-control-allow-origin', '*');
    return res.end(Buffer.from(rec.data, 'base64'));
  }

  // ---- 목록 ----
  if (op === 'list') {
    const uid = await A.resolveToken(url.searchParams.get('token'));
    if (!uid) return send(res, 200, { items: [], freeCustom: false });
    const items = (await kvGet(`sw:cust:${uid}`)) || [];
    const acct = await A.getUser(uid);
    return send(res, 200, { items, uid, freeCustom: !!(acct && acct.freeCustom) });
  }

  // ---- 업로드 ----
  if (op === 'upload') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const b = await readJson(req);
    const uid = await A.resolveToken(b.token);
    if (!uid) return send(res, 401, { error: '로그인 후 등록할 수 있어요' });
    // 과금 정책: 본 오픈(SW_OPEN=true) 전 사용자는 평생 무료(freeCustom), 오픈 후 신규는 유료.
    const OPEN = process.env.SW_OPEN === 'true';
    const acct = await A.getUser(uid);
    if (OPEN && !(acct && acct.freeCustom)) return send(res, 402, { error: '커스텀 화면은 유료 기능이에요 (충전 후 사용)', paid: true });
    if (!OPEN && acct && !acct.freeCustom) { acct.freeCustom = true; await A.setUser(acct); }

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(b.dataUrl || ''));
    if (!m) return send(res, 400, { error: '이미지 파일이 아니에요' });
    const mime = m[1], data = m[2];
    if (data.length > MAX_B64) return send(res, 413, { error: '이미지가 너무 커요 — 더 작은 이미지를 올려주세요' });
    const name = String(b.name || '내 화면').slice(0, 20);

    const idxKey = `sw:cust:${uid}`;
    let items = (await kvGet(idxKey)) || [];
    while (items.length >= MAX) { const old = items.shift(); if (old) await kvDel(`sw:custimg:${uid}:${old.id}`); }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await kvSet(`sw:custimg:${uid}:${id}`, { mime, data, name });
    items.push({ id, name });
    await kvSet(idxKey, items);
    return send(res, 200, { ok: true, items });
  }

  // ---- 삭제 ----
  if (op === 'del') {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const b = await readJson(req);
    const uid = await A.resolveToken(b.token);
    if (!uid) return send(res, 401, { error: '로그인 필요' });
    const idxKey = `sw:cust:${uid}`;
    let items = (await kvGet(idxKey)) || [];
    const before = items.length;
    items = items.filter((x) => x.id !== b.id);
    if (items.length !== before) await kvDel(`sw:custimg:${uid}:${b.id}`);
    await kvSet(idxKey, items);
    return send(res, 200, { ok: true, items });
  }

  return send(res, 404, { error: 'unknown op' });
};

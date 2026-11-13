// /api/custom/<op>  (op = upload | list | img | del)  — 커스텀 공격 이미지
import { makeStore } from '../../_lib/store.js';
import { makeAuth } from '../../_lib/auth.js';
import { readJson, json, preflight } from '../../_lib/http.js';

const MAX = 2;
const MAX_B64 = 420000; // ~300KB

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();

  const S = makeStore(env);
  const A = makeAuth(S);
  const url = new URL(request.url);
  const op = params.op;

  // ---- 이미지 제공 (공개: 피해자 오버레이가 불러옴) ----
  if (op === 'img') {
    const o = url.searchParams.get('o'), id = url.searchParams.get('id');
    if (!o || !id) return new Response('bad', { status: 400 });
    const rec = await S.kvGet(`sw:custimg:${o}:${id}`);
    if (!rec || !rec.data) return new Response('not found', { status: 404 });
    const bin = atob(rec.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': rec.mime || 'image/jpeg',
        'cache-control': 'public, max-age=86400',
        'access-control-allow-origin': '*',
      },
    });
  }

  // ---- 목록 ----
  if (op === 'list') {
    const uid = await A.resolveToken(url.searchParams.get('token'));
    if (!uid) return json({ items: [], freeCustom: false });
    const items = (await S.kvGet(`sw:cust:${uid}`)) || [];
    const acct = await A.getUser(uid);
    return json({ items, uid, freeCustom: !!(acct && acct.freeCustom) });
  }

  // ---- 업로드 ----
  if (op === 'upload') {
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await readJson(request);
    const uid = await A.resolveToken(b.token);
    if (!uid) return json({ error: '로그인 후 등록할 수 있어요' }, 401);
    // 과금 정책: 본 오픈(SW_OPEN=true) 전 사용자는 평생 무료(freeCustom), 오픈 후 신규는 유료.
    const OPEN = env.SW_OPEN === 'true';
    const acct = await A.getUser(uid);
    if (OPEN && !(acct && acct.freeCustom)) return json({ error: '커스텀 화면은 유료 기능이에요 (충전 후 사용)', paid: true }, 402);
    if (!OPEN && acct && !acct.freeCustom) { acct.freeCustom = true; await A.setUser(acct); }

    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(b.dataUrl || ''));
    if (!m) return json({ error: '이미지 파일이 아니에요' }, 400);
    const mime = m[1], data = m[2];
    if (data.length > MAX_B64) return json({ error: '이미지가 너무 커요 — 더 작은 이미지를 올려주세요' }, 413);
    const name = String(b.name || '내 화면').slice(0, 20);

    const idxKey = `sw:cust:${uid}`;
    let items = (await S.kvGet(idxKey)) || [];
    while (items.length >= MAX) { const old = items.shift(); if (old) await S.kvDel(`sw:custimg:${uid}:${old.id}`); }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await S.kvSet(`sw:custimg:${uid}:${id}`, { mime, data, name });
    items.push({ id, name });
    await S.kvSet(idxKey, items);
    return json({ ok: true, items });
  }

  // ---- 삭제 ----
  if (op === 'del') {
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await readJson(request);
    const uid = await A.resolveToken(b.token);
    if (!uid) return json({ error: '로그인 필요' }, 401);
    const idxKey = `sw:cust:${uid}`;
    let items = (await S.kvGet(idxKey)) || [];
    const before = items.length;
    items = items.filter((x) => x.id !== b.id);
    if (items.length !== before) await S.kvDel(`sw:custimg:${uid}:${b.id}`);
    await S.kvSet(idxKey, items);
    return json({ ok: true, items });
  }

  return json({ error: 'unknown op' }, 404);
}

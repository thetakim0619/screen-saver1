// POST /api/custom/upload { token, dataUrl, name } -> { ok, items }
// 계정에 커스텀 공격 이미지를 저장한다. 계정당 최대 2장(넘으면 가장 오래된 것 교체).
'use strict';
const A = require('../_auth');
const { kvGet, kvSet, kvDel } = require('../_store');
const { readJson, send } = require('../_http');

const MAX = 2;
const MAX_B64 = 420000; // base64 길이 상한(~300KB)

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readJson(req);
  const uid = await A.resolveToken(b.token);
  if (!uid) return send(res, 401, { error: '로그인 후 등록할 수 있어요' });

  // 과금 정책: 본 오픈(SW_OPEN=true) 전에 쓴 사람은 평생 무료(freeCustom 표식), 오픈 후 신규는 유료.
  const OPEN = process.env.SW_OPEN === 'true';
  const acct = await A.getUser(uid);
  if (OPEN && !(acct && acct.freeCustom)) {
    // 오픈 후 신규 사용자 — 유료(추후 결제/크레딧 차감 연결). 지금은 테스트 기간이라 이 분기 안 탐.
    return send(res, 402, { error: '커스텀 화면은 유료 기능이에요 (충전 후 사용)' , paid: true });
  }
  if (!OPEN && acct && !acct.freeCustom) {
    acct.freeCustom = true; // 테스트 기간 사용자 → 평생 무료로 표시
    await A.setUser(acct);
  }

  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(b.dataUrl || ''));
  if (!m) return send(res, 400, { error: '이미지 파일이 아니에요' });
  const mime = m[1], data = m[2];
  if (data.length > MAX_B64) return send(res, 413, { error: '이미지가 너무 커요 — 더 작은 이미지를 올려주세요' });
  const name = String(b.name || '내 화면').slice(0, 20);

  const idxKey = `sw:cust:${uid}`;
  let items = (await kvGet(idxKey)) || [];
  // 2장 넘으면 가장 오래된 것 삭제
  while (items.length >= MAX) {
    const old = items.shift();
    if (old) await kvDel(`sw:custimg:${uid}:${old.id}`);
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await kvSet(`sw:custimg:${uid}:${id}`, { mime, data, name });
  items.push({ id, name });
  await kvSet(idxKey, items);
  return send(res, 200, { ok: true, items });
};

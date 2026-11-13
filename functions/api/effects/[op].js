// /api/effects/<op>  (op = list | pick)  — 공격 화면(효과) 보유/스타터팩
// 테스트 기간(SW_OPEN != 'true'): 로그인 사용자에게 effectsAll 자동 부여(얼리버드, 평생 무료).
// 본 오픈(SW_OPEN='true') 후 신규: 스타터 3개 선택, 나머지는 잠금(결제로 해제).
import { makeStore } from '../../_lib/store.js';
import { makeAuth } from '../../_lib/auth.js';
import * as G from '../../_lib/game.js';
import { readJson, json, preflight } from '../../_lib/http.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();

  const S = makeStore(env);
  const A = makeAuth(S);
  const url = new URL(request.url);
  const op = params.op;
  const OPEN = env.SW_OPEN === 'true';
  const catalog = G.EFFECT_CATALOG;
  const starterN = G.STARTER_N;

  // ---- 보유 목록 ----
  if (op === 'list') {
    const uid = await A.resolveToken(url.searchParams.get('token'));
    if (!uid) {
      // 비로그인: 오픈 전이면 전부 해제, 오픈 후면 기본 세트만
      return json({ catalog, starterN, open: OPEN, all: !OPEN, owned: OPEN ? G.DEFAULT_EFFECTS : catalog, picked: false, loggedIn: false });
    }
    const acct = await A.getUser(uid);
    // 얼리버드: 오픈 전 로그인 사용자는 effectsAll 자동 부여(평생 무료)
    if (!OPEN && acct && !acct.effectsAll) { acct.effectsAll = true; await A.setUser(acct); }
    const all = !OPEN || !!(acct && acct.effectsAll);
    const owned = all ? catalog : ((acct && acct.effects) || []);
    const picked = !!(acct && acct.pickedStarter);
    return json({ catalog, starterN, open: OPEN, all, owned, picked, loggedIn: true });
  }

  // ---- 스타터 선택 (오픈 후 신규만) ----
  if (op === 'pick') {
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    const b = await readJson(request);
    const uid = await A.resolveToken(b.token);
    if (!uid) return json({ error: '로그인 후 고를 수 있어요' }, 401);
    const acct = await A.getUser(uid);
    if (!acct) return json({ error: '계정을 찾을 수 없어요' }, 401);
    if (acct.effectsAll) return json({ error: '이미 전체 화면을 보유 중이에요', owned: catalog, all: true });
    if (acct.pickedStarter) return json({ error: '스타터는 한 번만 고를 수 있어요', owned: acct.effects || [] }, 400);

    // 검증: 카탈로그 내 중복 제거, 최대 starterN개
    const want = Array.isArray(b.effects) ? b.effects : [];
    const picked = [...new Set(want)].filter((e) => catalog.includes(e)).slice(0, starterN);
    if (picked.length === 0) return json({ error: '최소 1개는 골라야 해요' }, 400);

    acct.effects = picked;
    acct.pickedStarter = true;
    await A.setUser(acct);
    return json({ ok: true, owned: picked, all: false, picked: true });
  }

  return json({ error: 'unknown op' }, 404);
}

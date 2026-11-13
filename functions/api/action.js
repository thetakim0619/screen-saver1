// POST /api/action {room, player, t:'attack'|'resolve'|'shield'|'dnd'|'buy', ...}
import * as G from '../_lib/game.js';
import { makeStore } from '../_lib/store.js';
import { makeAuth } from '../_lib/auth.js';
import { readJson, json, preflight } from '../_lib/http.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const S = makeStore(env);
  const A = makeAuth(S);
  const b = await readJson(request);
  const code = String(b.room || '').trim().toUpperCase();
  const pid = String(b.player || '').trim();
  if (!code || !pid) return json({ error: 'room, player 필요' }, 400);

  const room = await S.loadRoom(code);
  const player = room.players[pid];
  if (!player) return json({ error: '방에 없는 플레이어', gone: true }, 404);

  const uid = await A.resolveToken(b.token);
  player.userId = uid || undefined; // 소유권은 현재 토큰을 따라간다(로그아웃 시 해제)
  G.maybeDailyReset(player);
  G.maybeRegen(player, G.regenConfig(env)); // 행동 직전 무료 공격권 자동 충전 반영

  let events = [];
  if (b.t === 'attack') {
    let customUrl = null;
    if (b.effect === 'custom') {
      if (!uid) { await S.saveRoom(code, room); return json({ error: '커스텀 화면은 로그인 후 쓸 수 있어요' }, 401); }
      if (!b.customId) { await S.saveRoom(code, room); return json({ error: '커스텀 이미지를 고르세요' }, 400); }
      customUrl = `/api/custom/img?o=${encodeURIComponent(uid)}&id=${encodeURIComponent(b.customId)}`;
    }
    const acct = player.userId ? await A.getUser(player.userId) : null;
    // 공격 화면 잠금 (본 오픈 후에만). custom/랜덤('')은 제외.
    if (env.SW_OPEN === 'true' && G.EFFECT_CATALOG.includes(b.effect)) {
      const owned = acct ? (acct.effectsAll ? G.EFFECT_CATALOG : (acct.effects || [])) : G.DEFAULT_EFFECTS;
      if (!owned.includes(b.effect)) { await S.saveRoom(code, room); return json({ error: '잠긴 공격 화면이에요 (스타터팩에서 고르거나 충전으로 해제)' }, 403); }
    }
    player.purchased = acct ? (acct.purchased || 0) : 0;
    const r = G.attack(room, pid, { kind: b.kind, targetId: b.targetId, customText: b.customText, effect: b.effect, customUrl, customFx: b.customFx });
    if (!r.ok) { player.purchased = 0; await S.saveRoom(code, room); return json({ error: reasonText(r.reason) }, 400); }
    if (acct) { acct.purchased = player.purchased; await A.setUser(acct); }
    player.purchased = 0;
    events = S.routeEvents(room, pid, r.events);
  } else if (b.t === 'resolve') {
    const r = G.resolveMission(room, pid, { success: !!b.success, kind: b.kind, from: b.fromId || null, reflected: !!b.reflected });
    if (r.ok) events = S.routeEvents(room, pid, r.events);
  } else if (b.t === 'shield') {
    const r = G.raiseShield(room, pid, b.mode);
    if (!r.ok) { await S.saveRoom(code, room); return json({ error: r.reason === 'cooldown' ? '방패 재사용 대기중' : '방패 사용 불가' }, 400); }
    events = [{ t: 'toast', msg: `방패(${b.mode === 'reflect' ? '반사' : '막기'}) 올림` }];
  } else if (b.t === 'dnd') {
    const r = G.setDnd(room, pid, !!b.on);
    if (!r.ok) { await S.saveRoom(code, room); return json({ error: '자리비움 설정 실패' }, 400); }
    events = [{ t: 'toast', msg: r.dnd ? '자리비움 켜짐 · 공격 안 받음' : '자리비움 해제' }];
  } else if (b.t === 'buy') {
    if (!uid) { await S.saveRoom(code, room); return json({ error: '로그인 후 구매할 수 있어요' }, 401); }
    const acct = await A.getUser(uid);
    if (!acct) { await S.saveRoom(code, room); return json({ error: '계정을 찾을 수 없어요' }, 401); }
    const n = Math.max(1, Math.min(10, (b.n | 0) || 1));
    acct.purchased = (acct.purchased || 0) + n;
    await A.setUser(acct);
    events = [{ t: 'toast', msg: `공격권 ${n}개 구매 (계정에 적립: ${acct.purchased})` }];
  } else if (b.t === 'pet') {
    const r = G.setPet(room, pid, b.sp, b.col);
    if (!r.ok) { await S.saveRoom(code, room); return json({ error: '펫 설정 실패' }, 400); }
    if (uid) { const acct = await A.getUser(uid); if (acct) { acct.pet = r.pet; await A.setUser(acct); } } // 재입장 복원용
    events = [];
  } else {
    return json({ error: '알 수 없는 동작' }, 400);
  }

  await S.saveRoom(code, room);
  return json({ ok: true, events });
}

function reasonText(r) {
  return {
    no_credits: '공격권이 없습니다', bad_target: '대상을 고르세요',
    no_victims: '공격할 상대가 없습니다', bad_kind: '잘못된 공격',
    self_away: '자리비움 중엔 공격할 수 없어요', target_away: '상대가 자리비움이에요',
  }[r] || '공격 실패';
}

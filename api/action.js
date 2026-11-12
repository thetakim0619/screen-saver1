// POST /api/action {room, player, t:'attack'|'resolve'|'shield'|'buy', ...}
// -> {ok, events}  (events는 호출자 본인에게 즉시 보여줄 것들; 나머지는 상대 inbox로)
'use strict';
const G = require('./_game');
const A = require('./_auth');
const { loadRoom, saveRoom, routeEvents } = require('./_store');
const { readJson, send } = require('./_http');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readJson(req);
  const code = String(b.room || '').trim().toUpperCase();
  const pid = String(b.player || '').trim();
  if (!code || !pid) return send(res, 400, { error: 'room, player 필요' });

  const room = await loadRoom(code);
  const player = room.players[pid];
  if (!player) return send(res, 404, { error: '방에 없는 플레이어', gone: true });

  // 로그인 토큰이 있으면 이 플레이어를 계정에 연결한다 (구매 공격권은 계정에 보관)
  const uid = await A.resolveToken(b.token);
  if (uid) player.userId = uid;

  let events = [];
  if (b.t === 'attack') {
    // 계정의 구매 공격권을 플레이어에 잠시 반영 → 공격 처리 → 쓴 만큼 계정에 되돌려 저장
    const acct = player.userId ? await A.getUser(player.userId) : null;
    player.purchased = acct ? (acct.purchased || 0) : 0;
    const r = G.attack(room, pid, { kind: b.kind, targetId: b.targetId, customText: b.customText, effect: b.effect });
    if (!r.ok) { player.purchased = 0; await saveRoom(code, room); return send(res, 400, { error: reasonText(r.reason) }); }
    if (acct) { acct.purchased = player.purchased; await A.setUser(acct); } // 구매분 변화 반영
    player.purchased = 0; // 방 플레이어는 구매분을 들고 있지 않음(계정이 보관)
    events = routeEvents(room, pid, r.events);
  } else if (b.t === 'resolve') {
    const r = G.resolveMission(room, pid, { success: !!b.success, kind: b.kind, from: b.fromId || null, reflected: !!b.reflected });
    if (r.ok) events = routeEvents(room, pid, r.events);
  } else if (b.t === 'shield') {
    const r = G.raiseShield(room, pid, b.mode);
    if (!r.ok) { await saveRoom(code, room); return send(res, 400, { error: r.reason === 'cooldown' ? '방패 재사용 대기중' : '방패 사용 불가' }); }
    events = [{ t: 'toast', msg: `방패(${b.mode === 'reflect' ? '반사' : '막기'}) 올림` }];
  } else if (b.t === 'dnd') {
    const r = G.setDnd(room, pid, !!b.on);
    if (!r.ok) { await saveRoom(code, room); return send(res, 400, { error: '자리비움 설정 실패' }); }
    events = [{ t: 'toast', msg: r.dnd ? '자리비움 켜짐 · 공격 안 받음' : '자리비움 해제' }];
  } else if (b.t === 'buy') {
    // 현질은 로그인 필요 — 구매 공격권은 계정에 쌓인다
    if (!uid) { await saveRoom(code, room); return send(res, 401, { error: '로그인 후 구매할 수 있어요' }); }
    const acct = await A.getUser(uid);
    if (!acct) { await saveRoom(code, room); return send(res, 401, { error: '계정을 찾을 수 없어요' }); }
    const n = Math.max(1, Math.min(10, (b.n | 0) || 1));
    acct.purchased = (acct.purchased || 0) + n;
    await A.setUser(acct);
    events = [{ t: 'toast', msg: `공격권 ${n}개 구매 (계정에 적립: ${acct.purchased})` }];
  } else {
    return send(res, 400, { error: '알 수 없는 동작' });
  }

  await saveRoom(code, room);
  return send(res, 200, { ok: true, events });
};

function reasonText(r) {
  return {
    no_credits: '공격권이 없습니다', bad_target: '대상을 고르세요',
    no_victims: '공격할 상대가 없습니다', bad_kind: '잘못된 공격',
    self_away: '자리비움 중엔 공격할 수 없어요', target_away: '상대가 자리비움이에요',
  }[r] || '공격 실패';
}

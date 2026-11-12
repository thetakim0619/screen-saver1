// POST /api/action {room, player, t:'attack'|'resolve'|'shield'|'buy', ...}
// -> {ok, events}  (events는 호출자 본인에게 즉시 보여줄 것들; 나머지는 상대 inbox로)
'use strict';
const G = require('./_game');
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
  if (!room.players[pid]) return send(res, 404, { error: '방에 없는 플레이어', gone: true });

  let events = [];
  if (b.t === 'attack') {
    const r = G.attack(room, pid, { kind: b.kind, targetId: b.targetId, customText: b.customText, effect: b.effect });
    if (!r.ok) { await saveRoom(code, room); return send(res, 400, { error: reasonText(r.reason) }); }
    events = routeEvents(room, pid, r.events);
  } else if (b.t === 'resolve') {
    const r = G.resolveMission(room, pid, { success: !!b.success, kind: b.kind, from: b.fromId || null, reflected: !!b.reflected });
    if (r.ok) events = routeEvents(room, pid, r.events);
  } else if (b.t === 'shield') {
    const r = G.raiseShield(room, pid, b.mode);
    if (!r.ok) { await saveRoom(code, room); return send(res, 400, { error: r.reason === 'cooldown' ? '방패 재사용 대기중' : '방패 사용 불가' }); }
    events = [{ t: 'toast', msg: `방패(${b.mode === 'reflect' ? '반사' : '막기'}) 올림` }];
  } else if (b.t === 'buy') {
    const n = Math.max(1, Math.min(10, (b.n | 0) || 1));
    G.buyCredits(room, pid, n);
    events = [{ t: 'toast', msg: `공격권 ${n}개 구매(현질)` }];
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
  }[r] || '공격 실패';
}

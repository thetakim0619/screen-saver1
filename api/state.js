// GET /api/state?room=CODE&player=ID -> {you, roster, events}
// 폴링 때마다 호출. 쌓인 공격(inbox)을 비우며 돌려준다.
'use strict';
const { loadRoom, saveRoom, drainInbox } = require('./_store');
const { send } = require('./_http');

function publicPlayer(p) {
  return { id: p.id, name: p.name, hp: p.hp, alive: p.alive, dnd: !!p.dnd,
    credits: p.credits, purchased: p.purchased, shield: p.shield ? p.shield.mode : null };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const url = new URL(req.url, 'http://x');
  const code = String(url.searchParams.get('room') || '').trim().toUpperCase();
  const pid = String(url.searchParams.get('player') || '').trim();
  if (!code || !pid) return send(res, 400, { error: 'room, player 필요' });

  const room = await loadRoom(code);
  const me = room.players[pid];
  if (!me) return send(res, 404, { error: '방에 없는 플레이어', gone: true });

  const events = drainInbox(room, pid);
  await saveRoom(code, room); // inbox 비운 상태 저장

  return send(res, 200, {
    you: { id: me.id, name: me.name, hp: me.hp, credits: me.credits, purchased: me.purchased, dnd: !!me.dnd, shieldReadyAt: me.shieldReadyAt },
    roster: Object.values(room.players).map(publicPlayer),
    events,
  });
};

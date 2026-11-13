// GET /api/state?room=CODE&player=ID -> {you, roster, events}
import { makeStore } from '../_lib/store.js';
import { json, preflight } from '../_lib/http.js';

function publicPlayer(p) {
  return {
    id: p.id, name: p.name, hp: p.hp, alive: p.alive, dnd: !!p.dnd,
    credits: p.credits, purchased: p.purchased, shield: p.shield ? p.shield.mode : null,
  };
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const S = makeStore(env);
  const url = new URL(request.url);
  const code = String(url.searchParams.get('room') || '').trim().toUpperCase();
  const pid = String(url.searchParams.get('player') || '').trim();
  if (!code || !pid) return json({ error: 'room, player 필요' }, 400);

  const room = await S.loadRoom(code);
  const me = room.players[pid];
  if (!me) return json({ error: '방에 없는 플레이어', gone: true }, 404);

  const events = S.drainInbox(room, pid);
  await S.saveRoom(code, room);

  return json({
    you: { id: me.id, name: me.name, hp: me.hp, credits: me.credits, purchased: me.purchased, dnd: !!me.dnd, shieldReadyAt: me.shieldReadyAt },
    roster: Object.values(room.players).map(publicPlayer),
    events,
  });
}

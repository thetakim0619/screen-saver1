// POST /api/join {room, name} -> {you:{id,name}, config}
import * as G from '../_lib/game.js';
import { makeStore } from '../_lib/store.js';
import { readJson, json, preflight } from '../_lib/http.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  const S = makeStore(env);
  const b = await readJson(request);
  const code = String(b.room || '').trim().toUpperCase();
  const name = String(b.name || '').trim().slice(0, 16) || '익명';
  if (!code) return json({ error: '방 코드가 필요합니다' }, 400);

  const room = await S.loadRoom(code);

  let player = Object.values(room.players).find((p) => p.name === name);
  if (!player) {
    if (Object.keys(room.players).length >= G.CONFIG.MAX_PLAYERS) {
      return json({ error: '방이 가득 찼습니다 (최대 6명)' }, 403);
    }
    const id = 'p_' + Math.random().toString(36).slice(2, 9);
    player = G.newPlayer(id, name);
    room.players[id] = player;
  }
  G.maybeDailyReset(player);
  await S.saveRoom(code, room);

  return json({ you: { id: player.id, name: player.name }, config: G.CONFIG });
}

// POST /api/join {room, name} -> {you:{id,name}, config}
'use strict';
const G = require('./_game');
const { loadRoom, saveRoom } = require('./_store');
const { readJson, send } = require('./_http');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readJson(req);
  const code = String(b.room || '').trim().toUpperCase();
  const name = String(b.name || '').trim().slice(0, 16) || '익명';
  if (!code) return send(res, 400, { error: '방 코드가 필요합니다' });

  const room = await loadRoom(code);

  let player = Object.values(room.players).find((p) => p.name === name);
  if (!player) {
    if (Object.keys(room.players).length >= G.CONFIG.MAX_PLAYERS) {
      return send(res, 403, { error: '방이 가득 찼습니다 (최대 6명)' });
    }
    const id = 'p_' + Math.random().toString(36).slice(2, 9);
    player = G.newPlayer(id, name);
    room.players[id] = player;
  }
  G.maybeDailyReset(player);
  await saveRoom(code, room);

  return send(res, 200, { you: { id: player.id, name: player.name }, config: G.CONFIG });
};

// POST /api/custom/del { token, id } -> { ok, items }
'use strict';
const A = require('../_auth');
const { kvGet, kvSet, kvDel } = require('../_store');
const { readJson, send } = require('../_http');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await readJson(req);
  const uid = await A.resolveToken(b.token);
  if (!uid) return send(res, 401, { error: '로그인 필요' });
  const idxKey = `sw:cust:${uid}`;
  let items = (await kvGet(idxKey)) || [];
  const before = items.length;
  items = items.filter((x) => x.id !== b.id);
  if (items.length !== before) await kvDel(`sw:custimg:${uid}:${b.id}`);
  await kvSet(idxKey, items);
  return send(res, 200, { ok: true, items });
};

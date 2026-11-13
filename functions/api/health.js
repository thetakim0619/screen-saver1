// Cloudflare Pages Function — 이전 파이프라인 검증용 헬스체크.
// /api/health 로 접근. 라우팅 + Upstash 연결(PING)을 한 번에 확인한다.
// (Vercel은 functions/ 폴더를 무시하므로 현재 서비스에 영향 없음)
export async function onRequest(context) {
  const { env } = context;
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  let kv = 'no-env';
  if (url) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(['PING']),
      });
      const j = await r.json();
      kv = j.result || JSON.stringify(j);
    } catch (e) { kv = 'err:' + e.message; }
  }
  return new Response(JSON.stringify({ ok: true, host: 'cloudflare-pages', kv, time: Date.now() }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

// GET /api/auth/kakao/callback?code=...&state=session
// 카카오 로그인 완료 → 토큰 교환 → 계정 생성 → 세션 완료 표시.
import { makeStore } from '../../../_lib/store.js';
import { makeAuth } from '../../../_lib/auth.js';
import { originOf } from '../../../_lib/http.js';

function page(msg) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:#141414;color:#eee;font-family:system-ui,'Malgun Gothic',sans-serif;text-align:center}
.box{padding:28px 32px;border:1px solid #2e2e2e;border-radius:14px;background:#1e1e1e}
.t{font-size:18px;font-weight:700;margin-bottom:8px}.s{font-size:13px;color:#8a8a8a;line-height:1.6}</style>
</head><body><div class="box"><div class="t">${msg.t}</div><div class="s">${msg.s}</div></div></body></html>`;
}
function htmlResp(body, code = 200) {
  return new Response(body, { status: code, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function onRequest({ request, env }) {
  const BASE = originOf(request);
  const REDIRECT_URI = `${BASE}/api/auth/kakao/callback`;
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return htmlResp(page({ t: '로그인 실패', s: '잘못된 요청입니다.' }), 400);

    const key = env.KAKAO_REST_API_KEY;
    const secret = env.KAKAO_CLIENT_SECRET; // 선택
    const body = new URLSearchParams({
      grant_type: 'authorization_code', client_id: key, redirect_uri: REDIRECT_URI, code,
    });
    if (secret) body.set('client_secret', secret);

    const tokRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    const tok = await tokRes.json();
    if (!tok.access_token) {
      const detail = `[${tokRes.status}] ${tok.error || ''} ${tok.error_description || ''} (code=${tok.error_code || ''})`;
      return htmlResp(page({ t: '로그인 실패', s: '토큰 교환 실패: ' + detail }), 400);
    }

    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const me = await meRes.json();
    const kakaoId = me.id;
    const nickname = (me.properties && me.properties.nickname)
      || (me.kakao_account && me.kakao_account.profile && me.kakao_account.profile.nickname)
      || '카카오사용자';
    if (!kakaoId) return htmlResp(page({ t: '로그인 실패', s: '사용자 정보를 못 받았습니다.' }), 400);

    const S = makeStore(env);
    const A = makeAuth(S);
    const user = await A.upsertUser('kakao', kakaoId, nickname);
    const token = await A.issueToken(user.userId);
    await A.completeSession(state, token, user.name);

    return htmlResp(page({ t: '로그인 완료 ✓', s: `${user.name}님, 이제 SCREEN WAR 앱으로 돌아가세요. 이 창은 닫으셔도 됩니다.` }));
  } catch (e) {
    return htmlResp(page({ t: '로그인 오류', s: '처리 중 문제가 생겼습니다. 다시 시도해 주세요.' }), 500);
  }
}

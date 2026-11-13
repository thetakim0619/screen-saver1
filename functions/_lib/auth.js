// 로그인(계정·토큰·세션) 공용 로직 — Cloudflare Pages Functions
// 선택 로그인: 평소엔 익명(방+닉네임), 구매할 때만 계정에 묶는다.
// Web Crypto 사용 (node:crypto 불필요).

const SESSION_TTL = 600;             // 로그인 진행 세션 10분
const TOKEN_TTL = 60 * 60 * 24 * 90; // 로그인 토큰 90일

function rnd(n = 24) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makeAuth(S) {
  async function createSession(sid) { await S.kvSet(`sw:sess:${sid}`, { status: 'pending' }, SESSION_TTL); }
  async function getSession(sid) { return S.kvGet(`sw:sess:${sid}`); }
  async function completeSession(sid, token, name) { await S.kvSet(`sw:sess:${sid}`, { status: 'ok', token, name }, SESSION_TTL); }

  function userId(provider, pid) { return `${provider}:${pid}`; }
  async function upsertUser(provider, pid, name) {
    const uid = userId(provider, pid);
    let u = await S.kvGet(`sw:user:${uid}`);
    if (!u) u = { userId: uid, provider, providerId: String(pid), name, purchased: 0, createdAt: Date.now() };
    else if (name) u.name = name;
    await S.kvSet(`sw:user:${uid}`, u);
    return u;
  }
  async function getUser(uid) { return S.kvGet(`sw:user:${uid}`); }
  async function setUser(u) { await S.kvSet(`sw:user:${u.userId}`, u); }

  async function issueToken(uid) {
    const token = rnd(32);
    await S.kvSet(`sw:tok:${token}`, { userId: uid, createdAt: Date.now() }, TOKEN_TTL);
    return token;
  }
  async function resolveToken(token) {
    if (!token) return null;
    const t = await S.kvGet(`sw:tok:${token}`);
    return t ? t.userId : null;
  }

  return {
    rnd, createSession, getSession, completeSession,
    userId, upsertUser, getUser, setUser, issueToken, resolveToken,
  };
}

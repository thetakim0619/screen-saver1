// 로그인(계정·토큰·세션) 공용 로직
// 선택 로그인: 평소엔 익명(방+닉네임)으로 놀고, 구매할 때만 계정에 묶는다.
'use strict';
const crypto = require('crypto');
const { kvGet, kvSet } = require('./_store');

const SESSION_TTL = 600;          // 로그인 진행 세션 10분
const TOKEN_TTL = 60 * 60 * 24 * 90; // 로그인 토큰 90일

const rnd = (n = 24) => crypto.randomBytes(n).toString('base64url');

// 로그인 진행 세션 (앱이 만들고, 콜백이 완료 표시, 앱이 폴링)
async function createSession(sid) { await kvSet(`sw:sess:${sid}`, { status: 'pending' }, SESSION_TTL); }
async function getSession(sid) { return kvGet(`sw:sess:${sid}`); }
async function completeSession(sid, token, name) { await kvSet(`sw:sess:${sid}`, { status: 'ok', token, name }, SESSION_TTL); }

// 계정 (provider + 제공자쪽 고유 id 로 식별)
function userId(provider, pid) { return `${provider}:${pid}`; }
async function upsertUser(provider, pid, name) {
  const uid = userId(provider, pid);
  let u = await kvGet(`sw:user:${uid}`);
  if (!u) u = { userId: uid, provider, providerId: String(pid), name, purchased: 0, createdAt: Date.now() };
  else if (name) u.name = name;
  await kvSet(`sw:user:${uid}`, u); // 영구 (TTL 없음)
  return u;
}
async function getUser(uid) { return kvGet(`sw:user:${uid}`); }
async function setUser(u) { await kvSet(`sw:user:${u.userId}`, u); }

// 로그인 토큰 (앱이 들고 다니며 "나 이 계정"을 증명)
async function issueToken(uid) {
  const token = rnd(32);
  await kvSet(`sw:tok:${token}`, { userId: uid, createdAt: Date.now() }, TOKEN_TTL);
  return token;
}
async function resolveToken(token) {
  if (!token) return null;
  const t = await kvGet(`sw:tok:${token}`);
  return t ? t.userId : null;
}

module.exports = {
  rnd, createSession, getSession, completeSession,
  userId, upsertUser, getUser, setUser, issueToken, resolveToken,
};

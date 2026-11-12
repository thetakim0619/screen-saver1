// 방 상태 저장소 + 이벤트 라우팅.
// Upstash(KV_REST_API_*)가 있으면 Redis를, 없으면 인메모리를 쓴다(로컬 테스트용).
'use strict';

// 이름을 KV_* 로 넣었든 Upstash 기본(UPSTASH_*)으로 넣었든 둘 다 인식한다.
// 혹시 값에 따옴표나 공백이 섞여 들어가도 벗겨낸다.
function clean(v) { return v ? String(v).trim().replace(/^["']|["']$/g, '') : v; }
const URL = clean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
const TOKEN = clean(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
const TTL = 60 * 60 * 24 * 2; // 2일 뒤 방 자동 소멸
const mem = new Map();        // 인메모리 폴백

async function redis(args) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  return j.result;
}

const key = (code) => `sw:room:${code}`;

function freshRoom() { return { players: {}, inbox: {} }; }

async function loadRoom(code) {
  if (!URL) { return mem.get(code) || freshRoom(); }
  const s = await redis(['GET', key(code)]);
  return s ? JSON.parse(s) : freshRoom();
}

async function saveRoom(code, room) {
  if (!URL) { mem.set(code, room); return; }
  await redis(['SET', key(code), JSON.stringify(room), 'EX', String(TTL)]);
}

// game.js가 낸 이벤트를 수신자별로 나눈다.
// 호출자(callerId)에게 갈 건 바로 반환, 나머지는 room.inbox에 쌓는다.
function recipientOf(e) {
  switch (e.t) {
    case 'incoming': return e.victim;
    case 'recover':
    case 'hit':
    case 'defended': return e.player;
    case 'notify': return e.to;
    case 'blocked': return null;     // 아래에서 양쪽 처리
    case 'reflected': return null;
    default: return null;
  }
}

function pushInbox(room, pid, msg) {
  if (!room.inbox[pid]) room.inbox[pid] = [];
  room.inbox[pid].push(msg);
  // 폭주 방지: 인박스는 최근 50개만
  if (room.inbox[pid].length > 50) room.inbox[pid] = room.inbox[pid].slice(-50);
}

// 서버 이벤트를 클라이언트가 바로 쓰는 메시지(t=incoming/hit/...)로 바꾼다.
function toClientMsg(room, e) {
  if (e.t === 'incoming') {
    return {
      t: 'incoming', attackId: e.attackId, kind: e.kind,
      from: e.from ? (room.players[e.from]?.name || null) : null,
      reflected: !!e.reflected, purchasedAttack: !!e.purchasedAttack,
      effect: e.effect || null, mission: e.mission,
    };
  }
  if (e.t === 'recover') return { t: 'recover', mission: e.mission };
  if (e.t === 'hit') return { t: 'hit', dmg: e.dmg, hp: e.hp, effect: e.effect, capped: e.capped };
  if (e.t === 'defended') return { t: 'defended', reward: e.reward };
  if (e.t === 'notify') return { t: 'toast', msg: e.msg };
  return null;
}

// 이벤트 배열을 라우팅해서 호출자용 메시지 배열을 돌려준다.
function routeEvents(room, callerId, events) {
  const forCaller = [];
  for (const e of events || []) {
    if (e.t === 'blocked') {
      pushInbox(room, e.victim, { t: 'toast', msg: '방패로 막았습니다' });
      pushInbox(room, e.from, { t: 'toast', msg: `${room.players[e.victim]?.name || '상대'}의 방패에 막힘` });
      continue;
    }
    if (e.t === 'reflected') {
      pushInbox(room, e.by, { t: 'toast', msg: '공격을 반사했습니다' });
      pushInbox(room, e.to, { t: 'toast', msg: `${room.players[e.by]?.name || '상대'}가 공격을 반사함!` });
      continue;
    }
    const rid = recipientOf(e);
    const msg = toClientMsg(room, e);
    if (!rid || !msg) continue;
    if (rid === callerId) forCaller.push(msg);
    else pushInbox(room, rid, msg);
  }
  return forCaller;
}

// 폴링 시 인박스를 비우며 가져온다.
function drainInbox(room, pid) {
  const box = room.inbox[pid] || [];
  room.inbox[pid] = [];
  return box;
}

// 범용 키-값 (로그인 세션·토큰·계정용). 값은 JSON으로 저장.
async function kvGet(key) {
  if (!URL) { const v = mem.get(key); return v === undefined ? null : v; }
  const s = await redis(['GET', key]);
  return s ? JSON.parse(s) : null;
}
async function kvSet(key, val, ttlSec) {
  if (!URL) { mem.set(key, val); return; }
  const args = ['SET', key, JSON.stringify(val)];
  if (ttlSec) args.push('EX', String(ttlSec));
  await redis(args);
}
async function kvDel(key) {
  if (!URL) { mem.delete(key); return; }
  await redis(['DEL', key]);
}

module.exports = { loadRoom, saveRoom, routeEvents, drainInbox, pushInbox, kvGet, kvSet, kvDel };

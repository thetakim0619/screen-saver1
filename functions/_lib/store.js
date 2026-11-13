// 방 상태 저장소 + 이벤트 라우팅 (Cloudflare Pages Functions)
// Upstash/Vercel KV REST 를 쓴다. env 는 요청 시점에 context.env 로 들어온다.

function clean(v) { return v ? String(v).trim().replace(/^["']|["']$/g, '') : v; }

function freshRoom() { return { players: {}, inbox: {} }; }

// --- 순수 로직 (env 불필요) ---

function recipientOf(e) {
  switch (e.t) {
    case 'incoming': return e.victim;
    case 'recover':
    case 'hit':
    case 'defended': return e.player;
    case 'notify': return e.to;
    default: return null;
  }
}

function pushInbox(room, pid, msg) {
  if (!room.inbox[pid]) room.inbox[pid] = [];
  room.inbox[pid].push(msg);
  if (room.inbox[pid].length > 50) room.inbox[pid] = room.inbox[pid].slice(-50);
}

function toClientMsg(room, e) {
  if (e.t === 'incoming') {
    return {
      t: 'incoming', attackId: e.attackId, kind: e.kind,
      from: e.from ? (room.players[e.from]?.name || null) : null,
      reflected: !!e.reflected, purchasedAttack: !!e.purchasedAttack,
      effect: e.effect || null, customUrl: e.customUrl || null, customFx: e.customFx || null, mission: e.mission,
    };
  }
  if (e.t === 'recover') return { t: 'recover', mission: e.mission };
  if (e.t === 'hit') return { t: 'hit', dmg: e.dmg, hp: e.hp, effect: e.effect, capped: e.capped };
  if (e.t === 'defended') return { t: 'defended', reward: e.reward };
  if (e.t === 'notify') return { t: 'toast', msg: e.msg };
  return null;
}

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

function drainInbox(room, pid) {
  const box = room.inbox[pid] || [];
  room.inbox[pid] = [];
  return box;
}

// --- KV 접근 (env 필요) ---

const TTL = 60 * 60 * 24 * 2; // 2일 뒤 방 자동 소멸

export function makeStore(env) {
  const URL_ = clean(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL);
  const TOKEN = clean(env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN);

  async function redis(args) {
    const r = await fetch(URL_, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const j = await r.json();
    return j.result;
  }

  const key = (code) => `sw:room:${code}`;

  async function loadRoom(code) {
    const s = await redis(['GET', key(code)]);
    return s ? JSON.parse(s) : freshRoom();
  }
  async function saveRoom(code, room) {
    await redis(['SET', key(code), JSON.stringify(room), 'EX', String(TTL)]);
  }
  async function kvGet(k) {
    const s = await redis(['GET', k]);
    return s ? JSON.parse(s) : null;
  }
  async function kvSet(k, val, ttlSec) {
    const a = ['SET', k, JSON.stringify(val)];
    if (ttlSec) a.push('EX', String(ttlSec));
    await redis(a);
  }
  async function kvDel(k) { await redis(['DEL', k]); }

  // 순수 로직도 같이 묶어 endpoint 에서 S.* 로 일관되게 쓴다.
  return { loadRoom, saveRoom, kvGet, kvSet, kvDel, routeEvents, drainInbox, pushInbox };
}

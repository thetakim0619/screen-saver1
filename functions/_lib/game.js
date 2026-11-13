// screen-war — 순수 게임 로직 (ESM). 상태를 들고 있지 않고 "상태+행동 -> 다음 상태+이벤트"만 계산.

const CONFIG = {
  MAX_PLAYERS: 6,
  DAILY_CREDITS: 3,
  MAX_HP: 100,
  DMG_BROADCAST: 5,
  DMG_TARGET: 15,
  DAILY_DMG_CAP: 60,
  COST_ATTACK: 1,
  EARN_DEFEND: 1,
  EARN_REFLECT: 2,
  SHIELD_COOLDOWN_MS: 60000,
  MISSION_BROADCAST_SEC: 6,
  MISSION_TARGET_SEC: 4,
  MISSION_RECOVER_SEC: 6,
};

// 공격 화면(효과) 카탈로그 — 스타터팩에서 고르는 대상
const EFFECT_CATALOG = ['crack', 'glitch', 'melt', 'bsod', 'cute1', 'cute2'];
const STARTER_N = 3;                               // 본 오픈 후 신규 사용자가 무료로 고르는 개수
const DEFAULT_EFFECTS = ['crack', 'glitch', 'bsod']; // 비로그인 사용자가 오픈 후 쓸 수 있는 기본 세트

const PHRASES_EASY = ['오늘도 평화', '밥은 먹었니', '퇴근하고싶다', '커피 한잔', '졸리다 진짜'];
const PHRASES_HARD = [
  '나는 이 게임에서 질 운명이다',
  '방금 전체공격 한 사람 나와',
  '제발 이번 한 번만 봐주세요',
  '회의중인데 이게 뭐라고',
];

function todayKey(now = Date.now()) {
  const d = new Date(now + 9 * 3600000);
  return d.toISOString().slice(0, 10);
}

function newPlayer(id, name) {
  return {
    id, name,
    credits: CONFIG.DAILY_CREDITS,
    purchased: 0,
    hp: CONFIG.MAX_HP,
    dmgToday: 0,
    shield: null,
    shieldReadyAt: 0,
    lastDailyReset: todayKey(),
    dnd: false,
    alive: true,
  };
}

function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)]; }

function maybeDailyReset(p, now = Date.now()) {
  const key = todayKey(now);
  if (p.lastDailyReset !== key) {
    p.lastDailyReset = key;
    p.credits = CONFIG.DAILY_CREDITS;
    p.hp = CONFIG.MAX_HP;
    p.dmgToday = 0;
    p.alive = true;
    return true;
  }
  return false;
}

function totalCredits(p) { return p.credits + p.purchased; }

function spendCredit(p) {
  if (p.credits > 0) { p.credits -= 1; return { ok: true, purchased: false }; }
  if (p.purchased > 0) { p.purchased -= 1; return { ok: true, purchased: true }; }
  return { ok: false };
}

function makeMission(kind, customText) {
  if (kind === 'recover') return { type: 'type', text: pick(PHRASES_HARD), seconds: CONFIG.MISSION_RECOVER_SEC };
  if (kind === 'target') {
    return { type: 'type', text: (customText && customText.trim()) || pick(PHRASES_HARD), seconds: CONFIG.MISSION_TARGET_SEC };
  }
  return { type: 'type', text: pick(PHRASES_EASY), seconds: CONFIG.MISSION_BROADCAST_SEC };
}

let _attackSeq = 0;
function nextAttackId() { _attackSeq += 1; return 'atk_' + Date.now().toString(36) + '_' + _attackSeq; }

function attack(room, attackerId, { kind, targetId, customText, effect, customUrl }, now = Date.now()) {
  const useCustom = effect === 'custom' && customUrl;
  const fx = useCustom ? 'custom' : (EFFECT_CATALOG.includes(effect) ? effect : null);
  const cUrl = useCustom ? customUrl : null;
  const attacker = room.players[attackerId];
  if (!attacker) return { ok: false, reason: 'no_attacker' };
  maybeDailyReset(attacker, now);
  if (attacker.dnd) return { ok: false, reason: 'self_away' };

  if (kind !== 'broadcast' && kind !== 'target') return { ok: false, reason: 'bad_kind' };
  if (totalCredits(attacker) < CONFIG.COST_ATTACK) return { ok: false, reason: 'no_credits' };

  let victims = [];
  if (kind === 'target') {
    const t = room.players[targetId];
    if (!t || t.id === attackerId) return { ok: false, reason: 'bad_target' };
    if (t.dnd) return { ok: false, reason: 'target_away' };
    victims = [t];
  } else {
    victims = Object.values(room.players).filter((p) => p.id !== attackerId && !p.dnd);
  }
  if (victims.length === 0) return { ok: false, reason: 'no_victims' };

  const spent = spendCredit(attacker);
  if (!spent.ok) return { ok: false, reason: 'no_credits' };

  const events = [];
  for (const v of victims) {
    maybeDailyReset(v, now);

    if (v.shield && v.shield.readyAt <= now) {
      const mode = v.shield.mode;
      v.shield = null;
      v.shieldReadyAt = now + CONFIG.SHIELD_COOLDOWN_MS;
      if (mode === 'block') { events.push({ t: 'blocked', victim: v.id, from: attacker.id }); continue; }
      if (mode === 'reflect') {
        const mission = makeMission(kind === 'target' ? 'target' : 'broadcast', customText);
        const atkId = nextAttackId();
        events.push({
          t: 'incoming', attackId: atkId, victim: attacker.id, from: v.id, kind,
          reflected: true, purchasedAttack: spent.purchased, effect: fx, customUrl: cUrl, mission,
        });
        events.push({ t: 'reflected', by: v.id, to: attacker.id });
        continue;
      }
    }

    const mission = makeMission(kind, customText);
    const atkId = nextAttackId();
    events.push({
      t: 'incoming', attackId: atkId, victim: v.id,
      from: kind === 'target' ? attacker.id : null, kind,
      purchasedAttack: spent.purchased, effect: fx, customUrl: cUrl, mission,
    });
  }

  return { ok: true, purchased: spent.purchased, events };
}

function resolveMission(room, playerId, { success, kind, from, reflected }, now = Date.now()) {
  const p = room.players[playerId];
  if (!p) return { ok: false, reason: 'no_player' };
  maybeDailyReset(p, now);

  const events = [];
  if (success) {
    const reward = reflected ? CONFIG.EARN_REFLECT : CONFIG.EARN_DEFEND;
    p.credits += reward;
    events.push({ t: 'defended', player: p.id, reward });
    if (from) events.push({ t: 'notify', to: from, msg: `${p.name} 막음` });
    return { ok: true, defended: true, events };
  }

  const base = kind === 'target' ? CONFIG.DMG_TARGET : CONFIG.DMG_BROADCAST;
  const room_left = Math.max(0, CONFIG.DAILY_DMG_CAP - p.dmgToday);
  const dmg = Math.min(base, room_left, p.hp);
  p.dmgToday += dmg;
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp <= 0) p.alive = false;

  const effect = kind === 'target' ? pick(['bsod', 'melt', 'glitch']) : pick(['crack', 'glitch']);
  events.push({ t: 'hit', player: p.id, dmg, hp: p.hp, effect, capped: dmg < base });
  if (from) events.push({ t: 'notify', to: from, msg: `${p.name} 뚫림 (-${dmg})` });
  events.push({ t: 'recover', player: p.id, mission: makeMission('recover') });
  return { ok: true, defended: false, dmg, events };
}

function raiseShield(room, playerId, mode, now = Date.now()) {
  const p = room.players[playerId];
  if (!p) return { ok: false, reason: 'no_player' };
  if (mode !== 'block' && mode !== 'reflect') return { ok: false, reason: 'bad_mode' };
  if (now < p.shieldReadyAt) return { ok: false, reason: 'cooldown', readyAt: p.shieldReadyAt };
  p.shield = { mode, readyAt: now };
  return { ok: true, mode };
}

function setDnd(room, playerId, on) {
  const p = room.players[playerId];
  if (!p) return { ok: false, reason: 'no_player' };
  p.dnd = !!on;
  return { ok: true, dnd: p.dnd };
}

function buyCredits(room, playerId, n = 1) {
  const p = room.players[playerId];
  if (!p) return { ok: false, reason: 'no_player' };
  p.purchased += n;
  return { ok: true, purchased: p.purchased };
}

export {
  CONFIG, EFFECT_CATALOG, STARTER_N, DEFAULT_EFFECTS,
  newPlayer, todayKey, maybeDailyReset,
  totalCredits, spendCredit, makeMission,
  attack, resolveMission, raiseShield, setDnd, buyCredits,
};

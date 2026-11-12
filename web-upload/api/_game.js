// screen-war — 순수 게임 로직 (서버/시뮬레이션 공용)
// 상태를 직접 들고 있지 않고, "현재 상태 + 행동 -> 다음 상태 + 발생 이벤트"만 계산한다.
// 이렇게 짜두면 서버 없이도 테스트로 로직만 돌려 검증할 수 있다.

'use strict';

const CONFIG = {
  MAX_PLAYERS: 6,
  DAILY_CREDITS: 3,        // 매일 자정 충전되는 기본 공격권
  MAX_HP: 100,             // 하루 체력
  DMG_BROADCAST: 5,        // 전체 공격 1대 피해
  DMG_TARGET: 15,          // 지정 공격 1대 피해
  DAILY_DMG_CAP: 60,       // 한 사람이 하루에 받을 수 있는 피해 상한
  COST_ATTACK: 1,          // 공격 1회 비용(공격권)
  EARN_DEFEND: 1,          // 방어 성공 보상
  EARN_REFLECT: 2,         // 반사 성공 보상
  SHIELD_COOLDOWN_MS: 60_000,
  MISSION_BROADCAST_SEC: 6, // 전체 공격 미션 제한시간(쉬움)
  MISSION_TARGET_SEC: 4,    // 지정 공격 미션 제한시간(어려움)
  MISSION_RECOVER_SEC: 6,   // 화면 복구 미션 제한시간
};

// 미션에 쓸 기본 문장 풀 (지정 공격은 공격자가 직접 넣을 수도 있음)
const PHRASES_EASY = ['오늘도 평화', '밥은 먹었니', '퇴근하고싶다', '커피 한잔', '졸리다 진짜'];
const PHRASES_HARD = [
  '나는 이 게임에서 질 운명이다',
  '방금 전체공격 한 사람 나와',
  '제발 이번 한 번만 봐주세요',
  '회의중인데 이게 뭐라고',
];

function newPlayer(id, name) {
  return {
    id,
    name,
    credits: CONFIG.DAILY_CREDITS,
    purchased: 0,            // 구매(현질)로 생긴 공격권 수 — 공격에 쓰면 '현질 공격' 표시
    hp: CONFIG.MAX_HP,
    dmgToday: 0,             // 오늘 받은 누적 피해 (상한 체크용)
    shield: null,            // { mode:'block'|'reflect', readyAt:ms }
    shieldReadyAt: 0,        // 다음 방패 사용 가능 시각
    lastDailyReset: todayKey(),
    alive: true,
  };
}

function todayKey(now = Date.now()) {
  // KST 기준 날짜 키 (자정 충전용)
  const d = new Date(now + 9 * 3600_000);
  return d.toISOString().slice(0, 10);
}

function pick(arr, rnd = Math.random) {
  return arr[Math.floor(rnd() * arr.length)];
}

// 자정이 지났으면 공격권/체력/피해량을 충전·리셋
function maybeDailyReset(p, now = Date.now()) {
  const key = todayKey(now);
  if (p.lastDailyReset !== key) {
    p.lastDailyReset = key;
    p.credits = CONFIG.DAILY_CREDITS;
    p.purchased = 0;
    p.hp = CONFIG.MAX_HP;
    p.dmgToday = 0;
    p.alive = true;
    return true;
  }
  return false;
}

function totalCredits(p) {
  return p.credits + p.purchased;
}

// 공격권 1 차감. 구매분을 먼저 쓰고, 썼으면 purchasedUsed=true (현질 공격 표시용)
function spendCredit(p) {
  if (p.purchased > 0) {
    p.purchased -= 1;
    return { ok: true, purchased: true };
  }
  if (p.credits > 0) {
    p.credits -= 1;
    return { ok: true, purchased: false };
  }
  return { ok: false };
}

function makeMission(kind, customText) {
  if (kind === 'recover') {
    return { type: 'type', text: pick(PHRASES_HARD), seconds: CONFIG.MISSION_RECOVER_SEC };
  }
  if (kind === 'target') {
    return {
      type: 'type',
      text: (customText && customText.trim()) || pick(PHRASES_HARD),
      seconds: CONFIG.MISSION_TARGET_SEC,
    };
  }
  return { type: 'type', text: pick(PHRASES_EASY), seconds: CONFIG.MISSION_BROADCAST_SEC };
}

let _attackSeq = 0;
function nextAttackId() {
  _attackSeq += 1;
  return 'atk_' + Date.now().toString(36) + '_' + _attackSeq;
}

// --- 핵심 행동 ---

// 공격 시도. victims 목록 각각에 대해 '미션을 띄워라'는 이벤트를 만든다.
// 방패(block/reflect)는 미션이 뜨기 전에 먼저 소모된다.
function attack(room, attackerId, { kind, targetId, customText }, now = Date.now()) {
  const attacker = room.players[attackerId];
  if (!attacker) return { ok: false, reason: 'no_attacker' };
  maybeDailyReset(attacker, now);

  if (kind !== 'broadcast' && kind !== 'target') return { ok: false, reason: 'bad_kind' };
  if (totalCredits(attacker) < CONFIG.COST_ATTACK) return { ok: false, reason: 'no_credits' };

  let victims = [];
  if (kind === 'target') {
    const t = room.players[targetId];
    if (!t || t.id === attackerId) return { ok: false, reason: 'bad_target' };
    victims = [t];
  } else {
    victims = Object.values(room.players).filter((p) => p.id !== attackerId);
  }
  if (victims.length === 0) return { ok: false, reason: 'no_victims' };

  const spent = spendCredit(attacker);
  if (!spent.ok) return { ok: false, reason: 'no_credits' };

  const events = [];
  for (const v of victims) {
    maybeDailyReset(v, now);

    // 방패가 올라가 있으면 미션 전에 먼저 처리
    if (v.shield && v.shield.readyAt <= now) {
      const mode = v.shield.mode;
      v.shield = null;
      v.shieldReadyAt = now + CONFIG.SHIELD_COOLDOWN_MS;
      if (mode === 'block') {
        events.push({ t: 'blocked', victim: v.id, from: attacker.id });
        continue; // 공격 무효
      }
      if (mode === 'reflect') {
        // 공격을 공격자에게 되돌림: 공격자가 미션을 받는다
        const mission = makeMission(kind === 'target' ? 'target' : 'broadcast', customText);
        const atkId = nextAttackId();
        events.push({
          t: 'incoming',
          attackId: atkId,
          victim: attacker.id,       // 되돌아가서 공격자가 피해자가 됨
          from: v.id,                // 반사한 사람
          kind,
          reflected: true,
          purchasedAttack: spent.purchased,
          mission,
        });
        events.push({ t: 'reflected', by: v.id, to: attacker.id });
        continue;
      }
    }

    const mission = makeMission(kind, customText);
    const atkId = nextAttackId();
    // 전체 공격은 공격자를 숨김(anonymous), 지정 공격은 공개
    events.push({
      t: 'incoming',
      attackId: atkId,
      victim: v.id,
      from: kind === 'target' ? attacker.id : null,
      kind,
      purchasedAttack: spent.purchased,
      mission,
    });
  }

  return { ok: true, purchased: spent.purchased, events };
}

// 미션 결과 처리. success면 방어 성공, 실패면 피해 + 화면 깨짐.
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

  // 실패 → 피해. 단 하루 상한을 넘기지 않음.
  const base = kind === 'target' ? CONFIG.DMG_TARGET : CONFIG.DMG_BROADCAST;
  const room_left = Math.max(0, CONFIG.DAILY_DMG_CAP - p.dmgToday);
  const dmg = Math.min(base, room_left, p.hp);
  p.dmgToday += dmg;
  p.hp = Math.max(0, p.hp - dmg);
  if (p.hp <= 0) p.alive = false;

  const effect = kind === 'target' ? pick(['bsod', 'melt', 'glitch']) : pick(['crack', 'glitch']);
  events.push({ t: 'hit', player: p.id, dmg, hp: p.hp, effect, capped: dmg < base });
  if (from) events.push({ t: 'notify', to: from, msg: `${p.name} 뚫림 (-${dmg})` });
  // 화면 복구 미션을 하나 더 띄운다
  events.push({ t: 'recover', player: p.id, mission: makeMission('recover') });
  return { ok: true, defended: false, dmg, events };
}

// 방패 올리기 (미리 걸어두는 방어)
function raiseShield(room, playerId, mode, now = Date.now()) {
  const p = room.players[playerId];
  if (!p) return { ok: false, reason: 'no_player' };
  if (mode !== 'block' && mode !== 'reflect') return { ok: false, reason: 'bad_mode' };
  if (now < p.shieldReadyAt) return { ok: false, reason: 'cooldown', readyAt: p.shieldReadyAt };
  p.shield = { mode, readyAt: now };
  return { ok: true, mode };
}

// 공격권 구매(현질) — 프로토타입에서는 실제 결제 없이 숫자만 올린다.
// 단, 하루 피해 상한은 구매와 무관하게 유지된다(돈으로 한 명을 무한히 때릴 수 없음).
function buyCredits(room, playerId, n = 1) {
  const p = room.players[playerId];
  if (!p) return { ok: false, reason: 'no_player' };
  p.purchased += n;
  return { ok: true, purchased: p.purchased };
}

module.exports = {
  CONFIG,
  newPlayer, todayKey, maybeDailyReset,
  totalCredits, spendCredit, makeMission,
  attack, resolveMission, raiseShield, buyCredits,
};

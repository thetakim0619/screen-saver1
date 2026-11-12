'use strict';
const $ = (id) => document.getElementById(id);
const layer = $('layer');

let cur = null;       // 현재 처리중인 incoming
let timer = null;     // 미션 카운트다운
let effectTimer = null;

function setActive(on) {
  layer.classList.toggle('on', on);
  window.api.cmd({ t: 'overlay-active', active: on });
}

function clearAll() {
  clearInterval(timer); clearInterval(effectTimer);
  $('mission').classList.remove('show', 'target');
  $('recover').classList.remove('show');
  $('fx').classList.remove('show'); $('fx').innerHTML = '';
  $('escHint').style.display = 'none';
  cur = null;
  setActive(false);
}

// 입력 진행에 따라 글자 색칠
function paint(textEl, target, typed) {
  let html = '';
  for (let i = 0; i < target.length; i++) {
    const ch = target[i].replace('&', '&amp;').replace('<', '&lt;');
    if (i < typed.length) html += `<span class="${typed[i] === target[i] ? 'typed' : 'bad'}">${ch}</span>`;
    else html += ch;
  }
  textEl.innerHTML = html;
}

// 제한 시간은 클라이언트가 정한다 (서버 값 대신, 넉넉하게)
const CLIENT_SEC = { broadcast: 9, target: 7, recover: 8 };

// 입력창에 확실히 포커스가 가도록 여러 번 시도
function grabFocus(inp) {
  const tries = [0, 60, 150, 300];
  tries.forEach((t) => setTimeout(() => { try { window.focus(); inp.focus(); } catch {} }, t));
}

// ---- 미션(초기 공격 방어) ----
function startMission(m) {
  cur = m;
  const mis = $('mission');
  const isTarget = m.kind === 'target';
  mis.classList.toggle('target', isTarget);
  $('m-head').classList.toggle('target', isTarget);
  $('m-title').textContent = isTarget ? '지정 공격' : '새 알림';
  $('m-tag').textContent = m.reflected ? '반사됨' : (isTarget ? (m.from ? m.from + ' →' : '') : '익명');
  if (m.purchasedAttack) $('m-tag').textContent += ' · 현질';
  const target = m.mission.text;
  paint($('m-text'), target, '');
  const inp = $('m-input'); inp.value = '';
  mis.classList.add('show');
  setActive(true);
  grabFocus(inp);

  const total = (CLIENT_SEC[m.kind] || 7) * 1000;
  const t0 = Date.now();
  inp.oninput = () => {
    paint($('m-text'), target, inp.value);
    if (inp.value === target) finishMission(true);
  };
  timer = setInterval(() => {
    const left = Math.max(0, total - (Date.now() - t0));
    $('m-bar').style.width = (left / total * 100) + '%';
    if (left <= 0) finishMission(false);
  }, 80);
}

function finishMission(success) {
  clearInterval(timer);
  $('mission').classList.remove('show');
  // 서버에 결과 보고 (성공=방어, 실패=피해+복구는 서버가 hit/recover로 알려줌)
  window.api.cmd({
    t: 'resolve', success, kind: cur.kind,
    fromId: null, reflected: !!cur.reflected,
  });
  if (success) { cur = null; setActive(false); }
  // 실패면 setActive 유지, 곧 hit/recover가 온다
}

// ---- 화면 깨짐 연출 (실사 이미지 + 애니메이션) ----
// 이미지는 서버의 /fx 에서 불러오고, 검은 배경은 알파로 투명 처리돼 있어 실제 화면 위에 자연스럽게 얹힌다.
const FX_IMG = {
  crack: ['fx/crack1.webp', 'fx/crack2.webp', 'fx/crack3.webp'],
  glitch: ['fx/glitch.webp'],
  melt: ['fx/melt.webp'],
};
(function preloadFx() { // 공격이 오면 즉시 뜨도록 미리 받아 캐시
  for (const arr of Object.values(FX_IMG)) arr.forEach((u) => { const i = new Image(); i.src = u; });
})();
function imgLayer(url, cls) {
  const d = document.createElement('div');
  d.className = 'fximg ' + cls;
  d.style.backgroundImage = `url("${url}")`;
  return d;
}

function playEffect(kind) {
  const fx = $('fx'); fx.innerHTML = ''; fx.classList.remove('shake'); fx.classList.add('show');
  setActive(true);
  $('escHint').style.display = 'block';
  if (kind === 'bsod') {
    fx.innerHTML = `<div class="bsod"><div class="face">:(</div>
      <div>문제가 발생하여 화면을 복구하는 중입니다.</div>
      <div>잠시만 기다리거나 복구 문장을 입력하세요.</div>
      <div class="fake">* 게임 연출입니다 (실제 오류 아님) · ESC로 닫기</div></div>`;
  } else if (kind === 'crack' || kind === 'glitch' || kind === 'melt') {
    const pool = FX_IMG[kind];
    const url = pool[Math.floor(Math.random() * pool.length)];
    if (kind === 'crack') {
      const flash = document.createElement('div'); flash.className = 'fx-flash flashHit';
      fx.appendChild(flash);
      fx.appendChild(imgLayer(url, 'crackIn'));
      void fx.offsetWidth; fx.classList.add('shake'); // 리플로우 후 흔들림 시작
    } else if (kind === 'glitch') {
      fx.appendChild(imgLayer(url, 'glitchAnim'));
    } else {
      fx.appendChild(imgLayer(url, 'meltAnim'));
    }
  } else {
    fx.appendChild(imgLayer(FX_IMG.glitch[0], 'glitchAnim'));
  }
  // 안전장치: 복구 못 해도 일정 시간 뒤 자동 해제 (최대 8초)
  clearTimeout(effectTimer);
  effectTimer = setTimeout(clearAll, 8000);
}

function crackSVG() {
  const cx = 30 + Math.random() * 40, cy = 30 + Math.random() * 40;
  let lines = '';
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
    let x = cx, y = cy, d = `M ${cx} ${cy}`;
    for (let s = 0; s < 4; s++) {
      x += Math.cos(a) * (8 + Math.random() * 10) + (Math.random() - 0.5) * 8;
      y += Math.sin(a) * (8 + Math.random() * 10) + (Math.random() - 0.5) * 8;
      d += ` L ${x} ${y}`;
    }
    lines += `<path d="${d}" stroke="rgba(255,255,255,.75)" stroke-width="${1 + Math.random()}" fill="none"/>`;
    lines += `<path d="${d}" stroke="rgba(0,0,0,.35)" stroke-width="3" fill="none" opacity=".4"/>`;
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
    <circle cx="${cx}" cy="${cy}" r="2" fill="rgba(255,255,255,.9)"/>${lines}</svg>`;
}

// ---- 복구 미션 (순수 클라이언트, 서버와 무관) ----
function startRecover(m) {
  const rec = $('recover'); const target = m.mission.text;
  paint($('r-text'), target, '');
  const inp = $('r-input'); inp.value = '';
  rec.classList.add('show'); setActive(true);
  grabFocus(inp);
  const total = (CLIENT_SEC.recover) * 1000, t0 = Date.now();
  inp.oninput = () => { paint($('r-text'), target, inp.value); if (inp.value === target) clearAll(); };
  clearInterval(effectTimer); // 복구 미션을 푸는 동안엔 자동해제 타이머를 복구 바로 대체
  const rt = setInterval(() => {
    const left = Math.max(0, total - (Date.now() - t0));
    $('r-bar').style.width = (left / total * 100) + '%';
    if (left <= 0) { clearInterval(rt); clearAll(); } // 못 풀어도 자동 해제(안전)
  }, 80);
}

// ---- 서버 메시지 ----
function isDnd() { try { return localStorage.getItem('sw_dnd') === '1'; } catch { return false; } }

window.api.onServer((m) => {
  if (m.t === 'incoming') {
    if (isDnd()) { setActive(false); return; } // 자리비움: 서버 반영 전 날아온 공격도 무시
    startMission(m);
  }
  else if (m.t === 'hit') playEffect((cur && cur.effect) ? cur.effect : m.effect); // 공격자가 고른 연출 우선
  else if (m.t === 'recover') startRecover(m);
});
window.api.onForceClear(() => clearAll());

// ESC로 즉시 닫기
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearAll(); });

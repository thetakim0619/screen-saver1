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
  stopFx();
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

// ---- 화면 깨짐 연출 (실사 투명 영상) ----
// 서버 /fx 의 투명 WebM(VP8 알파). 검은 배경은 투명이라 실제 화면 위에 그대로 얹힌다.
// 유리/멜트=한 번 재생 후 마지막 프레임 정지, 글리치=반복.
const FX_VID = { crack: 'fx/crack.webm', glitch: 'fx/glitch.webm', melt: 'fx/melt.webm' };
(function preloadFx() { // 공격이 오면 바로 뜨도록 미리 받아 캐시
  for (const u of Object.values(FX_VID)) { const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = u; }
})();

let curFx = null;
function stopFx() { if (curFx && curFx._stop) curFx._stop(); curFx = null; }

// 검은 배경 영상을 매 프레임 실시간 키잉(밝기→알파, 검은색=투명)해 캔버스에 그린다.
// VP8/VP9 알파가 이 환경에서 안 되므로, 투명 처리는 브라우저가 직접 한다.
function videoLayer(url, loop) {
  const wrap = document.createElement('div'); wrap.className = 'fximg';
  const cv = document.createElement('canvas'); cv.className = 'fxcanvas'; wrap.appendChild(cv);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const vid = document.createElement('video');
  vid.src = url; vid.muted = true; vid.loop = !!loop; vid.playsInline = true;
  vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
  let raf = 0, sized = false, stopped = false;
  function frame() {
    if (stopped) return;
    if (vid.videoWidth) {
      if (!sized) { cv.width = vid.videoWidth; cv.height = vid.videoHeight; sized = true; }
      try {
        ctx.drawImage(vid, 0, 0, cv.width, cv.height);
        const im = ctx.getImageData(0, 0, cv.width, cv.height), d = im.data;
        for (let i = 0; i < d.length; i += 4) { let l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; l *= 1.4; d[i + 3] = l > 255 ? 255 : l; }
        ctx.putImageData(im, 0, 0);
      } catch (e) {}
    }
    raf = requestAnimationFrame(frame);
  }
  vid.addEventListener('ended', () => { if (!loop) { stopped = true; cancelAnimationFrame(raf); } }); // 마지막 프레임 유지
  const go = () => { raf = requestAnimationFrame(frame); };
  vid.play().then(go).catch(go);
  wrap._stop = () => { stopped = true; cancelAnimationFrame(raf); try { vid.pause(); vid.src = ''; } catch (e) {} };
  return wrap;
}

// ---- 귀여운 연출 (스티커 폭탄 / 뿅 캐릭터) ----
function stickerSVG(kind, c) {
  if (kind === 'heart') return `<svg viewBox="0 0 24 24"><path d="M12 21C3 15 2 9.5 5.5 7.2 8 5.6 11 7.6 12 9.4 13 7.6 16 5.6 18.5 7.2 22 9.5 21 15 12 21Z" fill="${c}" stroke="#fff" stroke-width="1.4"/></svg>`;
  if (kind === 'star') return `<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.8 6.1 20.6l1.3-6.6L2.5 8.9l6.6-.8Z" fill="${c}" stroke="#fff" stroke-width="1.3"/></svg>`;
  if (kind === 'flower') return `<svg viewBox="0 0 24 24"><g fill="${c}" stroke="#fff" stroke-width="1.1">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="12" cy="5.5" rx="3.3" ry="4.2" transform="rotate(${a} 12 12)"/>`).join('')}</g><circle cx="12" cy="12" r="3.1" fill="#fff3b0" stroke="#fff" stroke-width="1.1"/></svg>`;
  if (kind === 'cat') return `<svg viewBox="0 0 24 24"><g fill="${c}" stroke="#fff" stroke-width="1.2"><path d="M6 5l3 3.5M18 5l-3 3.5"/><circle cx="12" cy="13" r="8"/></g><circle cx="9.3" cy="12" r="1.1" fill="#3a2b3a"/><circle cx="14.7" cy="12" r="1.1" fill="#3a2b3a"/><path d="M11 15q1 1 2 0" stroke="#3a2b3a" stroke-width="1" fill="none" stroke-linecap="round"/><circle cx="7.6" cy="14.5" r="1.3" fill="#ff9ec4"/><circle cx="16.4" cy="14.5" r="1.3" fill="#ff9ec4"/></svg>`;
  return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="${c}" stroke="#fff" stroke-width="1.4"/><circle cx="9" cy="10.5" r="1.3" fill="#3a2b3a"/><circle cx="15" cy="10.5" r="1.3" fill="#3a2b3a"/><path d="M8.5 14.5q3.5 3 7 0" stroke="#3a2b3a" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="6.8" cy="13.5" r="1.4" fill="#ff9ec4" opacity=".8"/><circle cx="17.2" cy="13.5" r="1.4" fill="#ff9ec4" opacity=".8"/></svg>`;
}
function mochiSVG() {
  return `<svg viewBox="0 0 120 110"><ellipse cx="60" cy="96" rx="34" ry="8" fill="rgba(0,0,0,.12)"/><ellipse cx="60" cy="60" rx="46" ry="42" fill="#b8e0ff" stroke="#fff" stroke-width="4"/><circle cx="44" cy="56" r="5.5" fill="#33303a"/><circle cx="76" cy="56" r="5.5" fill="#33303a"/><circle cx="45.6" cy="54" r="1.8" fill="#fff"/><circle cx="77.6" cy="54" r="1.8" fill="#fff"/><circle cx="36" cy="66" r="6" fill="#ff9ec4" opacity=".85"/><circle cx="84" cy="66" r="6" fill="#ff9ec4" opacity=".85"/><path d="M53 68q7 7 14 0" stroke="#33303a" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
}
const CUTE_SHAPES = ['heart', 'star', 'flower', 'smiley', 'cat'];
const CUTE_COLORS = ['#ff8fab', '#ffd166', '#8bd3e6', '#a0e8af', '#ffafcc', '#bdb2ff', '#9bf6ff', '#ffc6ff'];
function buildCute(host, kind) {
  const wrap = document.createElement('div'); wrap.className = 'cute';
  const u = Math.max(4, (host.clientHeight || 400) / 100); wrap.style.setProperty('--u', u + 'px');
  if (kind === 'cute2') {
    // 스티커 비 — 화면 위에서 우르르 쏟아진다
    for (let i = 0; i < 44; i++) {
      const s = document.createElement('div'); s.className = 'raindrop';
      const sz = u * (4.5 + Math.random() * 5); s.style.width = s.style.height = sz + 'px';
      s.style.left = (Math.random() * 97) + '%';
      const dur = 1.2 + Math.random() * 1.3;
      s.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
      s.style.animation = `cFall ${dur}s linear ${(-Math.random() * dur * 2).toFixed(2)}s infinite`;
      s.innerHTML = stickerSVG(CUTE_SHAPES[i % CUTE_SHAPES.length], CUTE_COLORS[i % CUTE_COLORS.length]);
      wrap.appendChild(s);
    }
  } else {
    // 스티커 폭탄 — 팡팡 팝업
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('div'); s.className = 'sticker';
      const sz = u * (5 + Math.random() * 5.5); s.style.width = s.style.height = sz + 'px';
      s.style.left = (Math.random() * 90 + 2) + '%'; s.style.top = (Math.random() * 82 + 4) + '%';
      s.style.setProperty('--r', (Math.random() * 60 - 30) + 'deg'); s.style.animationDelay = (Math.random() * 0.9) + 's';
      s.innerHTML = stickerSVG(CUTE_SHAPES[i % CUTE_SHAPES.length], CUTE_COLORS[i % CUTE_COLORS.length]); wrap.appendChild(s);
    }
    const b = document.createElement('div'); b.className = 'cbubble'; b.textContent = '당했다!'; wrap.appendChild(b);
  }
  return wrap;
}

function playEffect(kind, customUrl) {
  const fx = $('fx'); stopFx(); fx.innerHTML = ''; fx.classList.remove('shake'); fx.classList.add('show');
  setActive(true);
  $('escHint').style.display = 'block';
  if (kind === 'cute1' || kind === 'cute2') {
    fx.appendChild(buildCute(fx, kind));
  } else if (kind === 'custom' && customUrl) {
    // 공격자가 올린 이미지를 화면 전체에 띄운다(화면 점령)
    const d = document.createElement('div'); d.className = 'fximg custimg';
    d.style.backgroundImage = `url("${customUrl}")`;
    fx.appendChild(d);
  } else if (kind === 'bsod') {
    fx.innerHTML = `<div class="bsod"><div class="face">:(</div>
      <div>문제가 발생하여 화면을 복구하는 중입니다.</div>
      <div>잠시만 기다리거나 복구 문장을 입력하세요.</div>
      <div class="fake">* 게임 연출입니다 (실제 오류 아님) · ESC로 닫기</div></div>`;
  } else if (kind === 'crack' || kind === 'glitch' || kind === 'melt') {
    curFx = videoLayer(FX_VID[kind], kind === 'glitch'); fx.appendChild(curFx); // 글리치만 반복
  } else {
    curFx = videoLayer(FX_VID.glitch, true); fx.appendChild(curFx);
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
  else if (m.t === 'hit') playEffect((cur && cur.effect) ? cur.effect : m.effect, cur && cur.customUrl); // 공격자가 고른 연출/이미지 우선
  else if (m.t === 'recover') startRecover(m);
});
window.api.onForceClear(() => clearAll());

// ESC로 즉시 닫기
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearAll(); });

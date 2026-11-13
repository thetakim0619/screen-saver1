'use strict';
const $ = (id) => document.getElementById(id);
let me = null, roster = [], selected = null, config = null, selectedFx = '';
let myFree = 0, acctPurchased = 0, myCred = 0;
let myDnd = false, curRoom = '', curName = '';
let selectedCustomId = null, customs = [], myUid = '';
const PAYMENTS_ON = false; // 사업자 전까지 결제 숨김. 나중에 true로.
function updateCred() { myCred = myFree + acctPurchased; $('cred').textContent = myCred; }
const FX_NAMES = { '': '랜덤', crack: '유리 깨짐', glitch: '글리치', melt: '녹아내림', bsod: '블루스크린', cute1: '귀염 스티커', cute2: '스티커 비' };

const EXPANDED = { w: 212, h: 340 };
const COLLAPSED = { w: 212, h: 34 };

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ===== 화면 전환 (입장 / 게임 / 방선택) =====
function showScreen(name) {
  $('setup').classList.toggle('show', name === 'setup');
  $('rooms').classList.toggle('show', name === 'rooms');
  $('game').style.display = name === 'game' ? 'block' : 'none';
  if (name === 'rooms') renderRoomList();
}
// 과거 호출 호환
function showSetup(show) { showScreen(show ? 'setup' : 'game'); }

function setCollapsed(collapsed) {
  document.body.classList.toggle('collapsed', collapsed);
  $('minBtn').textContent = collapsed ? '+' : '–';
  const s = collapsed ? COLLAPSED : EXPANDED;
  window.api.cmd({ t: 'resize-widget', w: s.w, h: s.h });
}

function randomCode(n = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ===== 저장된 방 목록 (localStorage) =====
function getRooms() { try { return JSON.parse(localStorage.getItem('sw_rooms') || '[]'); } catch { return []; } }
function saveRooms(a) { try { localStorage.setItem('sw_rooms', JSON.stringify(a.slice(0, 12))); } catch {} }
function recordRoom(code, name) {
  if (!code) return;
  const a = getRooms().filter((r) => r.code !== code);
  a.unshift({ code, name: name || '' });
  saveRooms(a);
}
function removeRoom(code) { saveRooms(getRooms().filter((r) => r.code !== code)); renderRoomList(); }

function renderRoomList() {
  const box = $('roomList'); const rooms = getRooms();
  if (!rooms.length) { box.innerHTML = '<div class="empty">저장된 방이 없습니다</div>'; return; }
  box.innerHTML = '';
  for (const r of rooms) {
    const el = document.createElement('div');
    el.className = 'roomrow' + (r.code === curRoom ? ' cur' : '');
    el.innerHTML = `<span class="rc">${escapeHtml(r.code)}</span>
      <span class="rn">${escapeHtml(r.name || '')}</span>
      <span class="del" title="목록에서 삭제">✕</span>`;
    el.querySelector('.rc').onclick = el.querySelector('.rn').onclick = () => switchRoom(r.code, r.name);
    el.onclick = (e) => { if (!e.target.classList.contains('del')) switchRoom(r.code, r.name); };
    el.querySelector('.del').onclick = (e) => { e.stopPropagation(); removeRoom(r.code); };
    box.appendChild(el);
  }
}

// 방 전환: 저장된 이름으로 재입장 (exe의 save-config가 재접속을 처리한다)
function switchRoom(code, name) {
  if (!code) return;
  curRoom = code; curName = (name || curName || '').trim();
  if (!curName) { // 이름 정보가 없으면 입장 화면으로
    $('su-room').value = code; showScreen('setup'); return;
  }
  me = null; roster = []; selected = null; myDnd = false;
  try { localStorage.setItem('sw_dnd', '0'); } catch {}
  document.body.classList.remove('dnd');
  $('curRoom').textContent = code;
  showScreen('game');
  window.api.cmd({ t: 'save-config', room: code, name: curName });
  toast(`${code} 방으로 전환`);
}

function renderRoster() {
  const box = $('roster'); box.innerHTML = '';
  for (const p of roster) {
    if (p.id === me) continue;
    const el = document.createElement('div');
    el.className = 'pl' + (selected === p.id ? ' sel' : '') + (p.dnd ? ' away' : '');
    el.innerHTML = `<span class="nm">${escapeHtml(p.name)}${p.dnd ? '<span class="tag-away">자리비움</span>' : ''}</span>
      <div class="hpbar"><i style="width:${p.hp}%"></i></div>`;
    el.onclick = () => {
      if (p.dnd) { toast(`${p.name}님은 자리비움이에요`); return; }
      selected = (selected === p.id) ? null : p.id;
      $('customText').classList.toggle('show', !!selected);
      renderRoster();
    };
    box.appendChild(el);
  }
}

// ===== 자리비움(방해금지) =====
function setDndUI(on) {
  myDnd = on;
  const b = $('dndBtn');
  b.textContent = on ? '자리비움 ON · 공격 안 받음 (해제)' : '자리비움 (회의 중 켜기)';
  b.classList.toggle('on', on);
  document.body.classList.toggle('dnd', on);
  $('atkAll').disabled = on; $('atkOne').disabled = on;
  try { localStorage.setItem('sw_dnd', on ? '1' : '0'); } catch {} // 오버레이가 읽어 날아온 공격도 차단
}

window.api.onConn(({ status }) => {
  $('dot').classList.toggle('on', status === 'online');
});
window.api.onNeedSetup((c) => {
  config = c; showScreen('setup');
  if (c.room) $('su-room').value = c.room;
  if (c.name) $('su-name').value = c.name;
});
window.api.onServer((m) => {
  if (m.t === 'joined') {
    me = m.you.id; config = m.config; $('meName').textContent = m.you.name;
    curName = m.you.name; recordRoom(curRoom, curName); $('curRoom').textContent = curRoom || '—';
    showScreen('game');
  }
  else if (m.t === 'state') {
    roster = m.roster || [];
    if (m.you) {
      if (!me) { me = m.you.id; $('meName').textContent = m.you.name; curName = m.you.name; recordRoom(curRoom, curName); }
      myFree = m.you.credits;      // 매일 주는 무료 공격권
      updateCred();                // 무료 + 계정 구매분 합산 표시
      $('hp').textContent = m.you.hp;
      if (typeof m.you.dnd === 'boolean' && m.you.dnd !== myDnd) setDndUI(m.you.dnd); // 서버값과 동기화
      if (curRoom) $('curRoom').textContent = curRoom;
      showScreen('game'); // 내 정보가 있으면 게임 화면을 띄운다
    }
    renderRoster();
  }
  else if (m.t === 'toast') toast(m.msg);
  else if (m.t === 'error') toast('⚠ ' + m.msg);
  else if (m.t === 'defended') toast(`방어 성공 +${m.reward}`);
  else if (m.t === 'hit') toast(`맞았다! -${m.dmg}`);
});

// 제목줄 버튼 — 접기/펼치기, 종료
$('minBtn').onclick = () => setCollapsed(!document.body.classList.contains('collapsed'));
$('quitBtn').onclick = () => { try { window.close(); } catch {} }; // 창 닫으면 앱 완전 종료(메인에서 처리)

// ===== 입장 화면 =====
$('su-make').onclick = () => { $('su-room').value = randomCode(); toast('방 코드 생성, 친구에게 공유하세요'); };
$('su-save').onclick = () => {
  const room = $('su-room').value.trim().toUpperCase(), name = $('su-name').value.trim();
  if (!room || !name) return toast('이름과 방 코드를 넣으세요');
  curRoom = room; curName = name; me = null; roster = []; selected = null;
  try { localStorage.setItem('sw_dnd', '0'); } catch {} document.body.classList.remove('dnd');
  $('curRoom').textContent = room;
  showScreen('game');
  window.api.cmd({ t: 'save-config', room, name });
};
$('su-cancel').onclick = () => showScreen('rooms');

// ===== 방 선택 화면 =====
$('switchRoom').onclick = () => showScreen('rooms');
$('roomBack').onclick = () => showScreen(me ? 'game' : 'setup');
$('roomNew').onclick = () => { $('su-name').value = curName || ''; $('su-room').value = randomCode(); showScreen('setup'); toast('새 방 코드 생성됨'); };
$('roomJoin').onclick = () => { $('su-name').value = curName || ''; $('su-room').value = ''; showScreen('setup'); };

// ===== 자리비움 토글 =====
$('dndBtn').onclick = () => {
  const next = !myDnd; setDndUI(next);
  window.api.cmd({ t: 'dnd', on: next });
  toast(next ? '자리비움 켜짐 · 공격 안 받음' : '자리비움 해제');
};

// 연출 썸네일 선택 (기본 연출 고르면 커스텀 선택 해제)
document.querySelectorAll('#fxpick .fxitem').forEach((el) => {
  el.onclick = () => {
    const fx = el.dataset.fx || '';
    if (picking) { // 스타터 고르는 중: 여러 개 토글
      if (!fx) return toast('랜덤은 가진 화면 중에서 자동으로 떠요');
      const i = pickSel.indexOf(fx);
      if (i >= 0) { pickSel.splice(i, 1); el.classList.remove('pk'); }
      else { if (pickSel.length >= fxStarterN) return toast(`${fxStarterN}개까지만 고를 수 있어요`); pickSel.push(fx); el.classList.add('pk'); }
      updateSpBtn();
      return;
    }
    if (isFxLocked(fx)) { toast('잠긴 화면이에요 · 스타터팩에서 고르거나 충전으로 해제'); return; }
    selectedFx = fx;
    selectedCustomId = null;
    document.querySelectorAll('#fxpick .fxitem').forEach((x) => x.classList.toggle('sel', x === el));
    renderCustpick();
  };
});
function fxLabel() { return selectedFx === 'custom' ? '내 화면' : (FX_NAMES[selectedFx] || '랜덤'); }

// ===== 공격 화면(효과) 보유 / 스타터팩 =====
const EFFECTS_BASE = location.origin;
let ownedEffects = null;   // null = 모름(잠금 안 함). 배열 = 보유 목록
let fxOpen = false, fxAll = true, fxPicked = false, fxStarterN = 3;
let picking = false, pickSel = [];

function fxLockActive() { return fxOpen && !fxAll && Array.isArray(ownedEffects); }
function isFxLocked(fx) { if (!fx || fx === 'custom') return false; if (!fxLockActive()) return false; return !ownedEffects.includes(fx); }

async function refreshEffects() {
  try {
    const q = authToken ? `?token=${encodeURIComponent(authToken)}&t=${Date.now()}` : `?t=${Date.now()}`;
    const r = await fetch(`${EFFECTS_BASE}/api/effects/list${q}`);
    if (!r.ok) throw 0;
    const j = await r.json();
    fxOpen = !!j.open; fxAll = !!j.all; fxPicked = !!j.picked;
    fxStarterN = j.starterN || 3;
    ownedEffects = Array.isArray(j.owned) ? j.owned : null;
  } catch { ownedEffects = null; fxAll = true; } // 엔드포인트 없으면(구버전) 전부 해제
  renderFxLocks();
  if (fxOpen && !fxAll && !fxPicked && authToken && !picking) startStarterPick(); // 오픈 후 신규
}

function renderFxLocks() {
  document.querySelectorAll('#fxpick .fxitem').forEach((el) => {
    el.classList.toggle('locked', isFxLocked(el.dataset.fx || ''));
  });
}

function startStarterPick() {
  picking = true; pickSel = [];
  document.body.classList.add('picking');
  $('starterPick').style.display = 'block';
  $('spN').textContent = fxStarterN;
  document.querySelectorAll('#fxpick .fxitem').forEach((el) => el.classList.remove('pk', 'sel'));
  updateSpBtn();
  toast(`공격 화면 ${fxStarterN}개를 고르세요`);
}
function updateSpBtn() {
  const b = $('spConfirm');
  b.disabled = pickSel.length === 0;
  b.textContent = `선택 완료 (${pickSel.length}/${fxStarterN})`;
}
async function confirmStarter() {
  if (!pickSel.length) return;
  try {
    const r = await fetch(`${EFFECTS_BASE}/api/effects/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: authToken, effects: pickSel }) });
    const j = await r.json();
    if (!j.ok) return toast('⚠ ' + (j.error || '선택 실패'));
    ownedEffects = j.owned || pickSel; fxPicked = true;
    picking = false; document.body.classList.remove('picking'); $('starterPick').style.display = 'none';
    renderFxLocks();
    toast('공격 화면 선택 완료!');
  } catch { toast('선택 실패'); }
}
$('spConfirm').onclick = confirmStarter;

// ===== 커스텀 이미지(내 화면) =====
async function refreshCustoms() {
  if (!authToken) { customs = []; myUid = ''; renderCustpick(); return; }
  try {
    const r = await fetch(`${AUTH_BASE}/api/custom/list?token=${encodeURIComponent(authToken)}&t=${Date.now()}`);
    const j = await r.json(); customs = j.items || []; myUid = j.uid || '';
  } catch { customs = []; }
  renderCustpick();
}
function renderCustpick() {
  const box = $('custpick'); box.innerHTML = '';
  if (!authToken) { box.innerHTML = '<div class="custhint">카카오 로그인하면 내 이미지를 등록해 공격 화면으로 띄울 수 있어요</div>'; return; }
  for (const c of customs) {
    const el = document.createElement('div');
    el.className = 'fxitem cust' + (selectedCustomId === c.id ? ' sel' : '');
    el.innerHTML = `<span class="fxthumb"><img src="${AUTH_BASE}/api/custom/img?o=${encodeURIComponent(myUid)}&id=${encodeURIComponent(c.id)}" /></span><span class="lbl">${escapeHtml(c.name)}</span><span class="cdel" title="삭제">×</span>`;
    el.onclick = (e) => { if (e.target.classList.contains('cdel')) return; selectCustom(c.id); };
    el.querySelector('.cdel').onclick = (e) => { e.stopPropagation(); delCustom(c.id); };
    box.appendChild(el);
  }
  if (customs.length < 2) {
    const add = document.createElement('div');
    add.className = 'fxitem addcust';
    add.innerHTML = '<span class="fxthumb addthumb">+</span><span class="lbl">추가</span>';
    add.onclick = () => $('custFile').click();
    box.appendChild(add);
  }
  const hint = document.createElement('div');
  hint.className = 'custhint';
  hint.textContent = '공격 시 상대 전체 화면에 떠요 · 최대 2장 · 과한 이미지는 자제해요';
  box.appendChild(hint);
}
function selectCustom(id) {
  selectedFx = 'custom'; selectedCustomId = id;
  document.querySelectorAll('#fxpick .fxitem').forEach((x) => x.classList.remove('sel'));
  renderCustpick();
  toast('내 화면 선택됨 · 지정 공격으로 발사');
}
async function delCustom(id) {
  try {
    const r = await fetch(`${AUTH_BASE}/api/custom/del`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: authToken, id }) });
    const j = await r.json(); customs = j.items || [];
    if (selectedCustomId === id) { selectedCustomId = null; selectedFx = ''; }
    renderCustpick();
  } catch {}
}
// 파일 → 캔버스 리사이즈 → JPEG dataURL (용량 절약)
function resizeImage(file, maxW, q) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sc = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * sc), h = Math.round(img.height * sc);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/jpeg', q));
    };
    img.onerror = reject; img.src = url;
  });
}
$('custFile').onchange = async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  if (!authToken) { $('custFile').value = ''; return toast('카카오 로그인 후 등록할 수 있어요'); }
  toast('이미지 올리는 중...');
  let dataUrl;
  try { dataUrl = await resizeImage(f, 1000, 0.82); } catch { $('custFile').value = ''; return toast('이미지를 읽지 못했어요'); }
  try {
    const r = await fetch(`${AUTH_BASE}/api/custom/upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: authToken, dataUrl, name: f.name.replace(/\.[^.]+$/, '').slice(0, 20) }) });
    const j = await r.json();
    $('custFile').value = '';
    if (!j.ok) return toast('⚠ ' + (j.error || '업로드 실패'));
    customs = j.items || []; renderCustpick(); toast('내 화면 등록됨');
  } catch { $('custFile').value = ''; toast('업로드 실패'); }
};

// ===== 공격/방어/현질 =====
function customOk() {
  if (selectedFx !== 'custom') return true;
  if (!authToken) { toast('내 화면은 카카오 로그인 후 쓸 수 있어요'); return false; }
  if (!selectedCustomId) { toast('내 화면을 먼저 고르세요'); return false; }
  return true;
}
$('atkAll').onclick = () => {
  if (picking) return toast('먼저 공격 화면 선택을 끝내세요');
  if (myDnd) return toast('자리비움 중엔 공격할 수 없어요');
  if (myCred < 1) return toast('공격권이 없습니다');
  if (!customOk()) return;
  window.api.cmd({ t: 'attack', kind: 'broadcast', effect: selectedFx, customId: selectedFx === 'custom' ? selectedCustomId : undefined, token: authToken });
  $('cred').textContent = Math.max(0, myCred - 1); // 즉시 반영(곧 서버값으로 갱신)
  setTimeout(refreshAcct, 600);                    // 구매분 썼을 수 있으니 갱신
  toast(`전체 공격 보냄 → (${fxLabel()})`);
};
$('atkOne').onclick = () => {
  if (picking) return toast('먼저 공격 화면 선택을 끝내세요');
  if (myDnd) return toast('자리비움 중엔 공격할 수 없어요');
  if (!selected) return toast('상대를 먼저 클릭하세요');
  if (myCred < 1) return toast('공격권이 없습니다');
  if (!customOk()) return;
  const name = (roster.find((p) => p.id === selected) || {}).name || '상대';
  window.api.cmd({ t: 'attack', kind: 'target', targetId: selected, customText: $('customText').value.trim(), effect: selectedFx, customId: selectedFx === 'custom' ? selectedCustomId : undefined, token: authToken });
  $('cred').textContent = Math.max(0, myCred - 1);
  setTimeout(refreshAcct, 600);
  toast(`${name}에게 공격 보냄 → (${fxLabel()})`);
};
$('shBlock').onclick = () => window.api.cmd({ t: 'shield', mode: 'block' });
$('shReflect').onclick = () => window.api.cmd({ t: 'shield', mode: 'reflect' });
// 카카오페이 결제(테스트) — 결제준비 → 결제창 팝업 → 상태 폴링 → 계정 적립
async function startCharge(n) {
  if (!authToken) return toast('카카오 로그인 후 결제할 수 있어요');
  toast('결제창을 여는 중...');
  let j;
  try {
    const r = await fetch(`${AUTH_BASE}/api/pay/ready`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: authToken, n }) });
    j = await r.json();
  } catch (e) { return toast('결제 연결 실패'); }
  if (!j.ok || !j.redirectUrl) return toast('⚠ ' + (j.error || '결제 준비 실패'));
  const pop = window.open(j.redirectUrl, 'kakaopay', 'width=480,height=720');
  toast(`카카오페이 결제창에서 진행하세요 (${j.amount}원)`);
  let tries = 0;
  const iv = setInterval(async () => {
    tries++;
    try {
      const s = await (await fetch(`${AUTH_BASE}/api/pay/status?order=${encodeURIComponent(j.orderId)}&t=${Date.now()}`)).json();
      if (s.status === 'done') { clearInterval(iv); try { pop && pop.close(); } catch (e) {} refreshAcct(); toast('결제 완료 · 공격권 적립됨'); }
      else if (s.status === 'fail') { clearInterval(iv); toast('결제 실패'); }
      else if (s.status === 'expired') { clearInterval(iv); }
    } catch (e) {}
    if (tries > 120) clearInterval(iv); // 3분
  }, 1500);
}
$('buy').onclick = () => startCharge(3);

// ===== 카카오 로그인 (선택) =====
const AUTH_BASE = location.origin;
let authToken = '';
try { authToken = localStorage.getItem('sw_token') || ''; } catch {}

async function refreshAcct() {
  if (!authToken) { $('acctName').textContent = '로그인 안 됨'; $('loginBtn').textContent = '카카오 로그인'; refreshCustoms(); refreshEffects(); return; }
  try {
    const r = await fetch(`${AUTH_BASE}/api/auth/me?token=${encodeURIComponent(authToken)}&t=${Date.now()}`);
    const j = await r.json();
    if (j.loggedIn) { acctPurchased = j.purchased || 0; $('acctName').textContent = `${j.name}님 · 구매 ${acctPurchased}`; $('loginBtn').textContent = '로그아웃'; }
    else { authToken = ''; try { localStorage.removeItem('sw_token'); } catch {} acctPurchased = 0; $('acctName').textContent = '로그인 안 됨'; $('loginBtn').textContent = '카카오 로그인'; }
    updateCred();
    refreshCustoms(); // 내 커스텀 이미지 목록 갱신
    refreshEffects(); // 내 보유 공격 화면 갱신
    if (PAYMENTS_ON && $('paySec')) $('paySec').style.display = 'block';
  } catch {}
}

function startKakaoLogin() {
  const sid = ((window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()) + Date.now()).replace(/-/g, '').slice(0, 24);
  const pop = window.open(`${AUTH_BASE}/api/auth/kakao/start?session=${sid}`, 'kakao_login', 'width=480,height=720');
  toast('카카오 로그인 창에서 진행하세요');
  let tries = 0;
  const iv = setInterval(async () => {
    tries++;
    try {
      const r = await fetch(`${AUTH_BASE}/api/auth/poll?session=${sid}&t=${Date.now()}`);
      const j = await r.json();
      if (j.ready) {
        clearInterval(iv); authToken = j.token;
        try { localStorage.setItem('sw_token', authToken); } catch {}
        try { pop && pop.close(); } catch {}
        refreshAcct(); toast(`${j.name}님 로그인 완료`);
      } else if (j.expired) { clearInterval(iv); toast('로그인 시간이 초과됐어요. 다시 시도하세요'); }
    } catch {}
    if (tries > 80) clearInterval(iv); // 2분
  }, 1500);
}

$('loginBtn').onclick = () => {
  if (authToken) { authToken = ''; try { localStorage.removeItem('sw_token'); } catch {} refreshAcct(); toast('로그아웃됨'); return; }
  startKakaoLogin();
};
refreshAcct();

// 처음 뜰 때 펼친 크기로 맞추고, 저장된 설정으로 화면을 먼저 결정한다
window.api.cmd({ t: 'resize-widget', w: EXPANDED.w, h: EXPANDED.h });
try { localStorage.setItem('sw_dnd', '0'); } catch {} // 시작은 항상 자리비움 해제
Promise.resolve(window.api.cmd({ t: 'get-config' })).then((cfg) => {
  if (cfg && cfg.room) { curRoom = cfg.room; $('curRoom').textContent = cfg.room; }
  if (cfg && cfg.name) curName = cfg.name;
  // 방/이름이 저장돼 있으면 게임 화면(곧 상태가 채워짐), 없으면 상황에 맞게
  if (cfg && cfg.room && cfg.name) showScreen('game');
  else if (getRooms().length) showScreen('rooms');
  else showScreen('setup');
}).catch(() => showScreen('setup'));

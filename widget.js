'use strict';
const $ = (id) => document.getElementById(id);
let me = null, roster = [], selected = null, config = null, selectedFx = '';
let myFree = 0, acctPurchased = 0, myCred = 0;
function updateCred() { myCred = myFree + acctPurchased; $('cred').textContent = myCred; }
const FX_NAMES = { '': '랜덤', crack: '유리 깨짐', glitch: '글리치', melt: '녹아내림', bsod: '블루스크린' };

const EXPANDED = { w: 212, h: 340 };
const COLLAPSED = { w: 212, h: 34 };

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function showSetup(show) {
  $('setup').classList.toggle('show', show);
  $('game').style.display = show ? 'none' : 'block';
}

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

function renderRoster() {
  const box = $('roster'); box.innerHTML = '';
  for (const p of roster) {
    if (p.id === me) continue;
    const el = document.createElement('div');
    el.className = 'pl' + (selected === p.id ? ' sel' : '');
    el.innerHTML = `<span class="nm">${escapeHtml(p.name)}</span>
      <div class="hpbar"><i style="width:${p.hp}%"></i></div>`;
    el.onclick = () => {
      selected = (selected === p.id) ? null : p.id;
      $('customText').classList.toggle('show', !!selected);
      renderRoster();
    };
    box.appendChild(el);
  }
}

window.api.onConn(({ status }) => {
  $('dot').classList.toggle('on', status === 'online');
});
window.api.onNeedSetup((c) => {
  config = c; showSetup(true);
  if (c.room) $('su-room').value = c.room;
  if (c.name) $('su-name').value = c.name;
});
window.api.onServer((m) => {
  if (m.t === 'joined') { me = m.you.id; config = m.config; $('meName').textContent = m.you.name; showSetup(false); }
  else if (m.t === 'state') {
    roster = m.roster || [];
    if (m.you) {
      if (!me) { me = m.you.id; $('meName').textContent = m.you.name; } // 입장 신호를 놓쳤어도 복구
      myFree = m.you.credits;      // 매일 주는 무료 공격권
      updateCred();                // 무료 + 계정 구매분 합산 표시
      $('hp').textContent = m.you.hp;
      showSetup(false); // 내 정보가 있으면 게임 화면을 띄운다
    }
    renderRoster();
  }
  else if (m.t === 'toast') toast(m.msg);
  else if (m.t === 'error') toast('⚠ ' + m.msg);
  else if (m.t === 'defended') toast(`방어 성공 +${m.reward}`);
  else if (m.t === 'hit') toast(`맞았다! -${m.dmg}`);
});

// 제목줄 버튼으로 접기/펼치기 (이 버튼은 작동 확인됨)
$('minBtn').onclick = () => setCollapsed(!document.body.classList.contains('collapsed'));

// 설정/게임 버튼
$('su-make').onclick = () => { $('su-room').value = randomCode(); toast('방 코드 생성, 친구에게 공유하세요'); };
$('su-save').onclick = () => {
  const room = $('su-room').value.trim().toUpperCase(), name = $('su-name').value.trim();
  if (!room || !name) return toast('이름과 방 코드를 넣으세요');
  window.api.cmd({ t: 'save-config', room, name });
};
// 연출 썸네일 선택
document.querySelectorAll('#fxpick .fxitem').forEach((el) => {
  el.onclick = () => {
    selectedFx = el.dataset.fx || '';
    document.querySelectorAll('#fxpick .fxitem').forEach((x) => x.classList.toggle('sel', x === el));
  };
});
function fxLabel() { return FX_NAMES[selectedFx] || '랜덤'; }
$('atkAll').onclick = () => {
  if (myCred < 1) return toast('공격권이 없습니다');
  window.api.cmd({ t: 'attack', kind: 'broadcast', effect: selectedFx, token: authToken });
  $('cred').textContent = Math.max(0, myCred - 1); // 즉시 반영(곧 서버값으로 갱신)
  setTimeout(refreshAcct, 600);                    // 구매분 썼을 수 있으니 갱신
  toast(`전체 공격 보냄 → (${fxLabel()})`);
};
$('atkOne').onclick = () => {
  if (!selected) return toast('상대를 먼저 클릭하세요');
  if (myCred < 1) return toast('공격권이 없습니다');
  const name = (roster.find((p) => p.id === selected) || {}).name || '상대';
  window.api.cmd({ t: 'attack', kind: 'target', targetId: selected, customText: $('customText').value.trim(), effect: selectedFx, token: authToken });
  $('cred').textContent = Math.max(0, myCred - 1);
  setTimeout(refreshAcct, 600);
  toast(`${name}에게 공격 보냄 → (${fxLabel()})`);
};
$('shBlock').onclick = () => window.api.cmd({ t: 'shield', mode: 'block' });
$('shReflect').onclick = () => window.api.cmd({ t: 'shield', mode: 'reflect' });
$('buy').onclick = async () => {
  if (!authToken) return toast('현질은 카카오 로그인 후 가능해요');
  await window.api.cmd({ t: 'buy', n: 3, token: authToken });
  setTimeout(refreshAcct, 500);
};

// ===== 카카오 로그인 (선택) =====
// 위젯은 서버에서 로드되므로 location.origin이 곧 우리 서버다. 같은 출처라 바로 호출 가능.
const AUTH_BASE = location.origin;
let authToken = '';
try { authToken = localStorage.getItem('sw_token') || ''; } catch {}

async function refreshAcct() {
  if (!authToken) { $('acctName').textContent = '로그인 안 됨'; $('loginBtn').textContent = '카카오 로그인'; return; }
  try {
    const r = await fetch(`${AUTH_BASE}/api/auth/me?token=${encodeURIComponent(authToken)}&t=${Date.now()}`);
    const j = await r.json();
    if (j.loggedIn) { acctPurchased = j.purchased || 0; $('acctName').textContent = `${j.name}님 · 구매 ${acctPurchased}`; $('loginBtn').textContent = '로그아웃'; }
    else { authToken = ''; try { localStorage.removeItem('sw_token'); } catch {} acctPurchased = 0; $('acctName').textContent = '로그인 안 됨'; $('loginBtn').textContent = '카카오 로그인'; }
    updateCred();
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
Promise.resolve(window.api.cmd({ t: 'get-config' })).then((cfg) => {
  // 방/이름이 저장돼 있으면 게임 화면(곧 상태가 채워짐), 없으면 입장 화면
  showSetup(!(cfg && cfg.room && cfg.name));
}).catch(() => showSetup(true));

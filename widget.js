'use strict';
const $ = (id) => document.getElementById(id);
let me = null, roster = [], selected = null, config = null;

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
      $('cred').textContent = m.you.credits + m.you.purchased;
      $('hp').textContent = m.you.hp;
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
$('atkAll').onclick = () => window.api.cmd({ t: 'attack', kind: 'broadcast' });
$('atkOne').onclick = () => {
  if (!selected) return toast('상대를 먼저 클릭하세요');
  window.api.cmd({ t: 'attack', kind: 'target', targetId: selected, customText: $('customText').value.trim() });
};
$('shBlock').onclick = () => window.api.cmd({ t: 'shield', mode: 'block' });
$('shReflect').onclick = () => window.api.cmd({ t: 'shield', mode: 'reflect' });
$('buy').onclick = () => window.api.cmd({ t: 'buy', n: 3 });

// 처음 뜰 때 펼친 크기로 맞춤
window.api.cmd({ t: 'resize-widget', w: EXPANDED.w, h: EXPANDED.h });

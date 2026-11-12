'use strict';
const $ = (id) => document.getElementById(id);
let me = null;        // 내 id
let roster = [];
let selected = null;  // 지정 공격 대상 id
let config = null;

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function showSetup(show) {
  $('setup').classList.toggle('show', show);
  $('game').style.display = show ? 'none' : 'block';
}

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

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// --- 서버 메시지 ---
window.api.onConn(({ status }) => $('dot').classList.toggle('on', status === 'online'));
window.api.onNeedSetup((c) => {
  config = c; showSetup(true);
  if (c.room) $('su-room').value = c.room;
  if (c.name) $('su-name').value = c.name;
});

// 랜덤 방 코드 생성 (헷갈리는 0/O/1/I 제외)
function randomCode(n = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
window.api.onServer((m) => {
  if (m.t === 'joined') { me = m.you.id; config = m.config; $('meName').textContent = m.you.name; showSetup(false); }
  else if (m.t === 'state') {
    roster = m.roster || [];
    if (m.you) { $('cred').textContent = (m.you.credits + m.you.purchased); $('hp').textContent = m.you.hp; }
    renderRoster();
  }
  else if (m.t === 'toast') toast(m.msg);
  else if (m.t === 'error') toast('⚠ ' + m.msg);
  else if (m.t === 'defended') toast(`방어 성공 +${m.reward} 공격권`);
  else if (m.t === 'hit') toast(`맞았다! -${m.dmg}`);
});

// --- 버튼 ---
$('su-make').onclick = () => { $('su-room').value = randomCode(); toast('방 코드를 만들었어요. 친구들에게 공유하세요'); };
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

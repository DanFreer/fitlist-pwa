// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE = './api';
const PALETTE = ['#FF6B6B','#FF9F43','#FFD166','#06D6A0','#74B9FF','#A29BFE','#FD79A8','#00CEC9','#BADC58','#F9CA24'];
const EMOJIS  = ['🦁','🐯','🐼','🦊','🐸','🦋','🐳','🦄','🐙','🦖','🐝','🦩','🐧','🦀','🦚'];
const SIZE_FIELDS = [
  {key:'top',    label:'Top / Shirt',    ph:'e.g. 8, M, 8T'},
  {key:'bottom', label:'Pants / Shorts', ph:'e.g. 10, 28×26'},
  {key:'dress',  label:'Dress',          ph:'e.g. 7–8, 130cm'},
  {key:'shoes',  label:'Shoes',          ph:'e.g. 4Y, EU 36'},
  {key:'hat',    label:'Hat',            ph:'e.g. S/M, 54cm'},
  {key:'jacket', label:'Jacket',         ph:'e.g. 10–12, L'},
];

// ── State ─────────────────────────────────────────────────────────────────────
let kids = [];
let activeId = null;
let deferredInstall = null;
let authMode = 'signin';
let familyUser = '';
let familyFilter = 'all';

const session = {
  token: localStorage.getItem('fitlist-token') || '',
  username: localStorage.getItem('fitlist-user') || '',
  displayName: localStorage.getItem('fitlist-displayName') || ''
};

// ── Persistence ───────────────────────────────────────────────────────────────
function saveLocal() {
  try { localStorage.setItem('fitlist-v3', JSON.stringify(kids)); } catch (e) {}
}

function save() {
  saveLocal();
  if (session.token) {
    syncRemote();
  }
}

function loadLocal() {
  try {
    const d = localStorage.getItem('fitlist-v3');
    if (d) { kids = JSON.parse(d); return; }
  } catch (e) {}
  kids = [
    { id:'demo-emma', name:'Emma', age:'8', emoji:'🦋', color:'#A29BFE', style:'Loves pastels & floral, prefers leggings over jeans, no scratchy tags',
      photo:null, sizes:{top:'M / 8',bottom:'8',dress:'8-10',shoes:'3Y',hat:'',jacket:'10'},
      gifts:[
        {id:'g1',text:'Watercolor set',urgent:false,claimedBy:null},
        {id:'g2',text:'Purple sneakers size 3Y',urgent:true,claimedBy:'Grandma Sue'},
        {id:'g3',text:'Art smock / apron',urgent:false,claimedBy:null},
      ],
      buys:[{id:'b1',text:'Pink rain jacket - Target',date:'2025-10-01'},{id:'b2',text:'3-pack leggings - H&M',date:'2025-09-15'}]
    },
    { id:'demo-jake', name:'Jake', age:'11', emoji:'🦖', color:'#FF6B6B', style:'Dinosaurs & gaming graphics, athletic fit only, hates jeans',
      photo:null, sizes:{top:'L / 12-14',bottom:'12 slim',dress:'',shoes:'5Y',hat:'M',jacket:'12-14'},
      gifts:[
        {id:'g4',text:'Minecraft hoodie',urgent:false,claimedBy:null},
        {id:'g5',text:'Basketball sneakers size 5.5Y',urgent:true,claimedBy:null},
        {id:'g6',text:'LEGO Technic set',urgent:false,claimedBy:'Uncle Rob'},
      ],
      buys:[{id:'b3',text:'3-pack graphic tees - Amazon',date:'2025-10-10'}]
    },
  ];
}

function getAuthHeaders() {
  return session.token ? { Authorization: `Bearer ${session.token}` } : {};
}

async function fetchJson(url, opts = {}) {
  opts.headers = opts.headers || {};
  opts.headers = { ...opts.headers, ...getAuthHeaders() };
  return fetch(url, opts);
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  el.textContent = message;
  el.style.display = 'block';
}

function clearAuthError() {
  const el = document.getElementById('auth-error');
  el.textContent = '';
  el.style.display = 'none';
}

function openAuthModal(mode = 'signin') {
  authMode = mode;
  const title = mode === 'signin' ? 'Sign In' : 'Create account';
  const submitText = mode === 'signin' ? 'Sign In' : 'Register';
  const toggleText = mode === 'signin' ? 'Create account' : 'Have an account? Sign in';
  document.getElementById('auth-title').textContent = title;
  document.getElementById('auth-submit').textContent = submitText;
  document.getElementById('auth-toggle').textContent = toggleText;
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  clearAuthError();
  document.getElementById('auth-modal').classList.add('open');
  setTimeout(() => document.getElementById('auth-username').focus(), 100);
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('open');
}

async function login() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!username || !password) {
    return showAuthError('Enter both username and password.');
  }
  try {
    const res = await fetchJson(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const data = await res.json();
      return showAuthError(data?.error || 'Login failed');
    }
    const data = await res.json();
    session.token = data.token;
    session.username = data.username;
    session.displayName = data.displayName || data.username;
    localStorage.setItem('fitlist-token', session.token);
    localStorage.setItem('fitlist-user', session.username);
    localStorage.setItem('fitlist-displayName', session.displayName);
    renderUserBtns();
    await refreshSession();
    closeAuthModal();
  } catch (error) {
    showAuthError('Unable to reach the backend.');
  }
}

async function registerAccount() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!username || !password) {
    return showAuthError('Enter both username and password.');
  }
  try {
    const res = await fetchJson(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const data = await res.json();
      return showAuthError(data?.error || 'Registration failed');
    }
    const data = await res.json();
    session.token = data.token;
    session.username = data.username;
    session.displayName = data.displayName || data.username;
    localStorage.setItem('fitlist-token', session.token);
    localStorage.setItem('fitlist-user', session.username);
    localStorage.setItem('fitlist-displayName', session.displayName);
    renderUserBtns();
    await refreshSession();
    closeAuthModal();
  } catch (error) {
    showAuthError('Unable to reach the backend.');
  }
}

function logout() {
  session.token = '';
  session.username = '';
  session.displayName = '';
  localStorage.removeItem('fitlist-token');
  localStorage.removeItem('fitlist-user');
  localStorage.removeItem('fitlist-displayName');
  renderUserBtns();
  openAuthModal('signin');
}

function logoutSilent() {
  session.token = '';
  session.username = '';
  session.displayName = '';
  localStorage.removeItem('fitlist-token');
  localStorage.removeItem('fitlist-user');
  localStorage.removeItem('fitlist-displayName');
  renderUserBtns();
}

async function refreshSession() {
  try {
    const res = await fetchJson(`${API_BASE}/auth/me`);
    if (!res.ok) {
      if (res.status === 401) {
        logoutSilent();
      }
      return;
    }
    const data = await res.json();
    session.username = data.username;
    session.displayName = data.displayName || data.username;
    localStorage.setItem('fitlist-user', session.username);
    localStorage.setItem('fitlist-displayName', session.displayName);
    renderUserBtns();
    await fetchRemoteData();
  } catch (error) {
    console.warn('Auth refresh failed', error);
  }
}

async function fetchRemoteData() {
  try {
    const res = await fetchJson(`${API_BASE}/sync`);
    if (!res.ok) {
      if (res.status === 401) {
        logoutSilent();
      }
      return;
    }
    const data = await res.json();
    if (Array.isArray(data.kids)) {
      kids = data.kids;
      saveLocal();
      if (kids.length && !getKid(activeId)) {
        activeId = kids[0].id;
      }
      renderSidebar();
      if (activeId) selectKid(activeId);
    }
  } catch (error) {
    console.warn('Remote fetch failed', error);
  }
}

async function syncRemote() {
  if (!session.token) return;
  try {
    const res = await fetchJson(`${API_BASE}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kids })
    });
    if (!res.ok) {
      console.warn('Sync failed', await res.text());
    }
  } catch (error) {
    console.warn('Sync failed', error);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  loadLocal();
  renderSidebar();
  renderUserBtns();
  if (kids.length) selectKid(kids[0].id);
  updateStats();
  registerSW();
  if (session.token) {
    await refreshSession();
  }
  if (!session.token) {
    openAuthModal('signin');
  }
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        if (reg.update) reg.update();
      })
      .catch(err => {
        console.warn('Service worker registration failed', err);
      });
  }
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstall = e;
  document.getElementById('install-banner').classList.add('show');
});
document.getElementById('install-btn').onclick = async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  document.getElementById('install-banner').classList.remove('show');
};
document.getElementById('install-dismiss').onclick = () => {
  document.getElementById('install-banner').classList.remove('show');
};

document.getElementById('auth-submit').onclick = () => {
  if (authMode === 'signin') {
    login();
  } else {
    registerAccount();
  }
};
document.getElementById('auth-toggle').onclick = () => {
  openAuthModal(authMode === 'signin' ? 'register' : 'signin');
};

document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

function renderSidebar() {
  const list = document.getElementById('kid-list');
  list.innerHTML = '';
  kids.forEach(k => {
    const urgentOpen = k.gifts.filter(g => g.urgent && !g.claimedBy).length;
    const btn = document.createElement('button');
    btn.className = 'kid-btn' + (k.id === activeId ? ' active' : '');
    btn.style.setProperty('--kid-color', k.color || '#aaa');
    btn.innerHTML = `
      <span class="kid-emoji">${k.photo ? `<img src="${k.photo}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">` : k.emoji}</span>
      <span class="kid-info"><span class="kid-name">${k.name}</span><span class="kid-age">Age ${k.age || '?'}</span></span>
      ${urgentOpen ? `<span class="urgent-dot">${urgentOpen}</span>` : ''}
    `;
    btn.onclick = () => selectKid(k.id);
    list.appendChild(btn);
  });
}

function renderUserBtns() {
  const el = document.getElementById('user-btns');
  if (session.username) {
    el.innerHTML = `
      <span style="color:#fff;font-size:12px;">Hi ${session.displayName || session.username}</span>
      <button class="topbtn" onclick="logout()">Logout</button>
    `;
  } else {
    el.innerHTML = `<button class="topbtn green" onclick="openAuthModal('signin')">Sign In</button>`;
  }
}

function getKid(id) { return kids.find(k => k.id === id); }
function activeKid() { return getKid(activeId); }

function selectKid(id) {
  activeId = id;
  const k = activeKid();
  if (!k) return;
  document.getElementById('no-kid').style.display = 'none';
  document.getElementById('kid-header').style.display = 'flex';
  document.getElementById('tabs').style.display = 'block';
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-sizes').classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="sizes"]').classList.add('active');
  setCSSKidColor(k.color);
  renderKidHeader(k);
  renderSizes(k);
  renderGifts(k);
  renderBuys(k);
  renderSidebar();
  updateStats();
}

function setCSSKidColor(color) {
  document.getElementById('detail').style.setProperty('--kid-color', color);
}

function renderKidHeader(k) {
  document.getElementById('kid-name-input').value = k.name;
  document.getElementById('kid-age-input').value = k.age;
  const avatarEmoji = document.getElementById('kid-avatar-emoji');
  const avatarImg   = document.getElementById('kid-avatar-img');
  document.getElementById('kid-avatar').style.setProperty('--kid-color', k.color || '#aaa');
  if (k.photo) {
    avatarEmoji.style.display = 'none';
    avatarImg.src = k.photo; avatarImg.style.display = 'block';
  } else {
    avatarEmoji.textContent = k.emoji; avatarEmoji.style.display = '';
    avatarImg.style.display = 'none';
  }
  const cr = document.getElementById('color-row');
  cr.innerHTML = PALETTE.map(c => `
    <div class="color-dot${k.color === c ? ' active' : ''}" style="background:${c}" onclick="setKidColor('${c}')"></div>
  `).join('');
  document.getElementById('delete-kid-btn').style.display = kids.length > 1 ? '' : 'none';
}

function onNameChange(v) { const k = activeKid(); if (k) { k.name = v; renderSidebar(); } }
function onAgeChange(v)  { const k = activeKid(); if (k) k.age = v; }
function onStyleChange(v){ const k = activeKid(); if (k) { k.style = v; renderStyleTags(v, k.color); } }
function saveCurrentKid(){ save(); renderSidebar(); updateStats(); }

function setKidColor(color) {
  const k = activeKid(); if (!k) return;
  k.color = color; save();
  setCSSKidColor(color);
  renderKidHeader(k);
  renderSidebar();
  renderSizes(k);
  renderGifts(k);
  renderBuys(k);
}

function triggerPhotoUpload() { document.getElementById('photo-input').click(); }
function handlePhoto(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const k = activeKid(); if (!k) return;
    k.photo = e.target.result; save();
    renderKidHeader(k); renderSidebar();
  };
  reader.readAsDataURL(file);
}

function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
}

function renderSizes(k) {
  document.getElementById('sizes-bar').style.background = k.color;
  document.getElementById('style-bar').style.background = k.color;
  const grid = document.getElementById('size-grid');
  grid.innerHTML = SIZE_FIELDS.map(f => `
    <div>
      <div class="field-label">${f.label}</div>
      <input class="field-input${k.sizes[f.key] ? ' filled' : ''}" type="text"
        value="${k.sizes[f.key] || ''}" placeholder="${f.ph}"
        oninput="onSizeChange('${f.key}',this)"
        onblur="saveCurrentKid()"/>
    </div>
  `).join('');
  document.getElementById('style-input').value = k.style || '';
  renderStyleTags(k.style || '', k.color);
}

function onSizeChange(key, input) {
  const k = activeKid(); if (!k) return;
  k.sizes[key] = input.value;
  input.classList.toggle('filled', !!input.value);
}

function renderStyleTags(style, color) {
  const el = document.getElementById('style-tags');
  const tags = style.split(',').map(s => s.trim()).filter(Boolean);
  el.innerHTML = tags.map(t => `<span class="style-tag" style="--kid-color:${color}">${t}</span>`).join('');
}

function renderGifts(k) {
  document.getElementById('gifts-bar').style.background = k.color;
  document.getElementById('gift-input').style.setProperty('--kid-color', k.color);
  document.querySelector('.add-btn').style.background = k.color;
  const claimed = k.gifts.filter(g => g.claimedBy).length;
  const open = k.gifts.filter(g => !g.claimedBy).length;
  const urgentOpen = k.gifts.filter(g => g.urgent && !g.claimedBy).length;
  document.getElementById('gifts-sub').textContent = `${claimed} claimed · ${open} open`;
  const badge = document.getElementById('urgent-badge');
  badge.style.display = urgentOpen ? '' : 'none';
  badge.textContent = urgentOpen;
  const list = document.getElementById('gifts-list');
  let html = '';
  const urgentGifts = k.gifts.filter(g => g.urgent && !g.claimedBy);
  const normalGifts = k.gifts.filter(g => !g.urgent && !g.claimedBy);
  const claimedGifts = k.gifts.filter(g => g.claimedBy);
  if (urgentGifts.length)  { html += `<div class="gift-section-label" style="color:var(--urgent)">⚡ Needed Soon</div>`; urgentGifts.forEach(g => { html += giftCardHTML(g, k.color); }); }
  if (normalGifts.length)  { html += `<div class="gift-section-label" style="color:#bbb">🎁 Gift Ideas</div>`; normalGifts.forEach(g => { html += giftCardHTML(g, k.color); }); }
  if (claimedGifts.length) { html += `<div class="gift-section-label" style="color:var(--claimed)">✓ Claimed</div>`; claimedGifts.forEach(g => { html += giftCardHTML(g, k.color); }); }
  if (!k.gifts.length) html = '<div class="empty">No gift ideas yet</div>';
  list.innerHTML = html;
}

function giftCardHTML(g, color) {
  const claimed = !!g.claimedBy;
  return `
    <div class="gift-card${g.urgent && !claimed ? ' urgent' : ''}${claimed ? ' claimed' : ''} fade-in" id="gift-${g.id}">
      <div class="gift-top">
        <span class="gift-icon">${claimed ? '🎉' : g.urgent ? '⚡' : '🎁'}</span>
        <span class="gift-text${claimed ? ' done' : ''}">${g.text}</span>
        <div class="gift-actions">
          ${!claimed ? `<button class="small-btn" style="--kid-color:${color}" onclick="toggleUrgent('${g.id}')">${g.urgent ? 'Later' : 'Urgent'}</button>` : ''}
          <button class="remove-btn" onclick="removeGift('${g.id}')">×</button>
        </div>
      </div>
      ${g.urgent && !claimed ? `<div style="margin-top:4px"><span class="gift-tag">Needed Soon</span></div>` : ''}
      ${claimed ? `<div><span class="claimed-badge">✓ ${g.claimedBy} <span style="opacity:.5;cursor:pointer" onclick="unclaimGift('${g.id}')">×</span></span></div>` : ''}
      ${!claimed ? `
        <div class="claim-row" id="claim-row-${g.id}">
          <button class="ill-buy-btn" onclick="showClaimForm('${g.id}')">🙋 I'll buy this</button>
          <div class="claim-form" id="claim-form-${g.id}" style="display:none">
            <input class="claim-input" id="claim-input-${g.id}" type="text" value="${session.displayName || session.username || ''}" placeholder="Your name…" onkeydown="if(event.key==='Enter')submitClaim('${g.id}')"/>
            <button class="claim-submit" onclick="submitClaim('${g.id}')">I'll get it!</button>
            <button class="claim-cancel" onclick="hideClaimForm('${g.id}')">Cancel</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function addGift() {
  const input = document.getElementById('gift-input');
  const urgent = document.getElementById('gift-urgent').checked;
  const text = input.value.trim(); if (!text) return;
  const k = activeKid(); if (!k) return;
  k.gifts.push({ id: 'g' + Date.now(), text, urgent, claimedBy: null });
  input.value = ''; document.getElementById('gift-urgent').checked = false;
  save(); renderGifts(k); updateStats();
}

function removeGift(gid) {
  const k = activeKid(); if (!k) return;
  k.gifts = k.gifts.filter(g => g.id !== gid);
  save(); renderGifts(k); updateStats();
}

function toggleUrgent(gid) {
  const k = activeKid(); if (!k) return;
  const g = k.gifts.find(x => x.id === gid); if (!g) return;
  g.urgent = !g.urgent; save(); renderGifts(k); updateStats();
}

function showClaimForm(gid) {
  document.querySelector(`#claim-row-${gid} .ill-buy-btn`).style.display = 'none';
  document.getElementById(`claim-form-${gid}`).style.display = 'flex';
  document.getElementById(`claim-input-${gid}`).focus();
}
function hideClaimForm(gid) {
  document.querySelector(`#claim-row-${gid} .ill-buy-btn`).style.display = '';
  document.getElementById(`claim-form-${gid}`).style.display = 'none';
}
function submitClaim(gid) {
  const who = document.getElementById(`claim-input-${gid}`).value.trim();
  if (!who) return;
  const k = activeKid(); if (!k) return;
  const g = k.gifts.find(x => x.id === gid); if (!g) return;
  g.claimedBy = who; save(); renderGifts(k); updateStats();
}
function unclaimGift(gid) {
  const k = activeKid(); if (!k) return;
  const g = k.gifts.find(x => x.id === gid); if (!g) return;
  g.claimedBy = null; save(); renderGifts(k); updateStats();
}

function renderBuys(k) {
  document.getElementById('history-bar').style.background = k.color;
  const list = document.getElementById('buys-list');
  if (!k.buys.length) { list.innerHTML = '<div class="empty">Nothing logged yet</div>'; return; }
  list.innerHTML = k.buys.map((b, i) => `
    <div class="buy-card fade-in">
      <div><div class="buy-text">✓ ${b.text}</div><div class="buy-date">${b.date}</div></div>
      <button class="remove-btn" onclick="removeBuy(${i})">×</button>
    </div>
  `).join('');
}

function addBuy() {
  const input = document.getElementById('buy-input');
  const text = input.value.trim(); if (!text) return;
  const k = activeKid(); if (!k) return;
  k.buys.unshift({ id: 'b' + Date.now(), text, date: new Date().toISOString().slice(0, 10) });
  input.value = ''; save(); renderBuys(k);
}

function removeBuy(idx) {
  const k = activeKid(); if (!k) return;
  k.buys.splice(idx, 1); save(); renderBuys(k);
}

function promptAddKid() {
  document.getElementById('add-kid-input').value = '';
  openModal('add-kid-modal');
  setTimeout(() => document.getElementById('add-kid-input').focus(), 100);
}

function confirmAddKid() {
  const name = document.getElementById('add-kid-input').value.trim(); if (!name) return;
  const ci = kids.length % PALETTE.length;
  const kid = { id: 'k' + Date.now(), name, age: '', emoji: EMOJIS[ci], color: PALETTE[ci],
    photo: null, style: '', sizes: { top: '', bottom: '', dress: '', shoes: '', hat: '', jacket: '' },
    gifts: [], buys: [] };
  kids.push(kid); save();
  closeModal('add-kid-modal');
  renderSidebar(); selectKid(kid.id); updateStats();
}

function confirmDeleteKid() {
  if (!confirm(`Remove ${activeKid()?.name}? This cannot be undone.`)) return;
  kids = kids.filter(k => k.id !== activeId);
  activeId = null; save();
  if (kids.length) selectKid(kids[0].id);
  else {
    document.getElementById('kid-header').style.display = 'none';
    document.getElementById('tabs').style.display = 'none';
    document.getElementById('no-kid').style.display = 'block';
  }
  renderSidebar(); updateStats();
}

function updateStats() {
  const allGifts = kids.flatMap(k => k.gifts);
  const claimed = allGifts.filter(g => g.claimedBy).length;
  const open = allGifts.filter(g => !g.claimedBy).length;
  const urgent = allGifts.filter(g => g.urgent && !g.claimedBy).length;
  const uEl = document.getElementById('stat-urgent');
  uEl.textContent = `${urgent} urgent`; uEl.style.display = urgent ? '' : 'none';
  document.getElementById('stat-claimed').textContent = `${claimed} claimed`;
  document.getElementById('stat-open').textContent = `${open} open`;
}

function formatKid(k) {
  const sizes = SIZE_FIELDS.filter(f => k.sizes[f.key]).map(f => `  ${f.label}: ${k.sizes[f.key]}`).join('\n');
  const urgent = k.gifts.filter(g => g.urgent).map(g => `  ⚡ ${g.text}${g.claimedBy ? ' [CLAIMED by ' + g.claimedBy + ']' : ''}`).join('\n');
  const normal = k.gifts.filter(g => !g.urgent).map(g => `  🎁 ${g.text}${g.claimedBy ? ' [CLAIMED by ' + g.claimedBy + ']' : ''}`).join('\n');
  const gifts = [urgent, normal].filter(Boolean).join('\n') || '  (none)';
  const recent = (k.buys || []).map(b => `  ✓ ${b.text} (${b.date})`).join('\n') || '  (none)';
  return `👕 ${k.name}  |  Age ${k.age || '?'}\n${'─'.repeat(32)}\nSIZES:\n${sizes || '  (none)'}\n\nSTYLE NOTES:\n  ${k.style || 'none'}\n\nGIFT IDEAS:\n${gifts}\n\nRECENTLY BOUGHT:\n${recent}`;
}

function shareKid() {
  const k = activeKid(); if (!k) return;
  openShareModal(k.name, formatKid(k));
}
function shareAll() {
  openShareModal('All Kids', kids.map(formatKid).join('\n\n' + '═'.repeat(34) + '\n\n'));
}
function openShareModal(title, text) {
  document.getElementById('share-title').textContent = `📤 ${title}`;
  document.getElementById('share-text').value = text;
  openModal('share-modal');
}
function copyShare() {
  navigator.clipboard.writeText(document.getElementById('share-text').value).then(() => {
    const btn = document.querySelector('#share-modal .modal-btn-primary');
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy', 2000);
  });
}

function openFamilyView() {
  const fv = document.getElementById('family-view');
  fv.style.display = 'flex'; fv.style.flexDirection = 'column';
  resetFamilyView();
}
function closeFamilyView() { document.getElementById('family-view').style.display = 'none'; }

function resetFamilyView() {
  familyUser = '';
  document.getElementById('family-name-input').value = '';
  document.getElementById('family-name-step').style.display = 'flex';
  document.getElementById('family-browse').classList.remove('open');
  document.getElementById('family-sub').textContent = 'Claim gifts so nobody buys the same thing twice';
}

function startBrowsing() {
  const name = document.getElementById('family-name-input').value.trim();
  if (!name) return;
  familyUser = name; familyFilter = 'all';
  document.getElementById('family-name-step').style.display = 'none';
  document.getElementById('family-browse').classList.add('open');
  document.getElementById('family-sub').textContent = `Shopping as ${familyUser}`;
  renderFamilyList();
}

function setFilter(f, btn) {
  familyFilter = f;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderFamilyList();
}

function renderFamilyList() {
  const myClaims = kids.flatMap(k => k.gifts.filter(g => g.claimedBy === familyUser).map(g => ({ ...g, kidName: k.name, kidId: k.id })));
  const claimsBar = document.getElementById('my-claims-bar');
  if (myClaims.length) {
    claimsBar.style.display = 'block';
    document.getElementById('my-claims-title').textContent = `🎉 You're getting (${myClaims.length}):`;
    document.getElementById('my-claims-chips').innerHTML = myClaims.map(g => `
      <span class="claim-chip">${g.text} <span style="opacity:.5;font-size:10px">(${g.kidName})</span>
        <span style="cursor:pointer;opacity:.4;margin-left:2px" onclick="familyUnclaim('${g.kidId}','${g.id}')">×</span>
      </span>
    `).join('');
  } else { claimsBar.style.display = 'none'; }

  const list = document.getElementById('family-list');
  let html = '';
  kids.forEach(k => {
    const gifts = k.gifts.filter(g => {
      if (familyFilter === 'available') return !g.claimedBy;
      if (familyFilter === 'mine') return g.claimedBy === familyUser;
      return true;
    });
    if (!gifts.length) return;
    const openCount = k.gifts.filter(g => !g.claimedBy).length;
    html += `
      <div class="family-kid-header" style="border-color:${k.color}44">
        <span style="font-size:22px">${k.emoji}</span>
        <span class="family-kid-name">${k.name}</span>
        <span class="family-kid-age">Age ${k.age || '?'}</span>
        <span class="family-avail">${openCount} available</span>
      </div>
    `;
    gifts.forEach(g => {
      const claimed = !!g.claimedBy;
      const isMine = g.claimedBy === familyUser;
      html += `
        <div class="gift-card${g.urgent && !claimed ? ' urgent' : ''}${claimed ? ' claimed' : ''} fade-in">
          <div class="gift-top">
            <span class="gift-icon">${claimed ? '🎉' : g.urgent ? '⚡' : '🎁'}</span>
            <span class="gift-text${claimed ? ' done' : ''}">${g.text}</span>
          </div>
          ${claimed ? `<div style="margin-top:6px"><span class="claimed-badge">✓ ${g.claimedBy}${isMine ? ` <span style="cursor:pointer;opacity:.5" onclick="familyUnclaim('${k.id}','${g.id}')">×</span>` : ''}</span></div>` : ''}
          ${!claimed ? `
            <div class="claim-row" id="fclaim-row-${g.id}">
              <button class="ill-buy-btn" onclick="showFamilyClaimForm('${g.id}','${k.id}')">🙋 I'll buy this</button>
              <div class="claim-form" id="fclaim-form-${g.id}" style="display:none">
                <input class="claim-input" id="fclaim-input-${g.id}" type="text" value="${familyUser}" placeholder="Your name…" onkeydown="if(event.key==='Enter')submitFamilyClaim('${g.id}','${k.id}')"/>
                <button class="claim-submit" onclick="submitFamilyClaim('${g.id}','${k.id}')">I'll get it!</button>
                <button class="claim-cancel" onclick="hideFamilyClaimForm('${g.id}')">Cancel</button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    });
  });
  if (!html) html = `<div class="empty" style="padding:48px 0">${familyFilter === 'mine' ? 'You haven\'t claimed anything yet.' : 'Everything\'s been claimed! 🎉'}</div>`;
  list.innerHTML = html;
}

function showFamilyClaimForm(gid) {
  document.querySelector(`#fclaim-row-${gid} .ill-buy-btn`).style.display = 'none';
  document.getElementById(`fclaim-form-${gid}`).style.display = 'flex';
  document.getElementById(`fclaim-input-${gid}`).focus();
}
function hideFamilyClaimForm(gid) {
  document.querySelector(`#fclaim-row-${gid} .ill-buy-btn`).style.display = '';
  document.getElementById(`fclaim-form-${gid}`).style.display = 'none';
}
function submitFamilyClaim(gid, kidId) {
  const who = document.getElementById(`fclaim-input-${gid}`).value.trim(); if (!who) return;
  const k = getKid(kidId); if (!k) return;
  const g = k.gifts.find(x => x.id === gid); if (!g) return;
  g.claimedBy = who; save(); renderFamilyList(); updateStats();
  if (activeId === kidId) renderGifts(k);
}
function familyUnclaim(kidId, gid) {
  const k = getKid(kidId); if (!k) return;
  const g = k.gifts.find(x => x.id === gid); if (!g) return;
  g.claimedBy = null; save(); renderFamilyList(); updateStats();
  if (activeId === kidId) renderGifts(k);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

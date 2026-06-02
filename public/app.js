// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE = '/api';
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
let familyUser = '';
let familyFilter = 'all';
let familyOwner = null;
let familyKids = [];

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

function normalizeKid(k) {
  if (!k.gifts) k.gifts = [];
  k.gifts = k.gifts.map(g => ({
    id: g.id,
    text: g.text,
    urgent: !!g.urgent,
    claimedBy: g.claimedBy ?? g.claimed_by ?? null
  }));
  if (!k.buys) k.buys = [];
  return k;
}

function loadLocal() {
  if (session.token) {
    kids = [];
    return;
  }
  try {
    const d = localStorage.getItem('fitlist-v3');
    if (d) {
      kids = JSON.parse(d).map(normalizeKid);
      return;
    }
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

function logout() {
  session.token = '';
  session.username = '';
  session.displayName = '';
  localStorage.removeItem('fitlist-token');
  localStorage.removeItem('fitlist-user');
  localStorage.removeItem('fitlist-displayName');
  localStorage.removeItem('fitlist-v3');

  kids = [];
  activeId = null;
  renderSidebar();
  updateStats();
  document.getElementById('kid-header').style.display = 'none';
  document.getElementById('tabs').style.display = 'none';
  document.getElementById('no-kid').style.display = 'block';
  renderUserBtns();
  window.location.href = '/';
}

function logoutSilent() {
  session.token = '';
  session.username = '';
  session.displayName = '';
  localStorage.removeItem('fitlist-token');
  localStorage.removeItem('fitlist-user');
  localStorage.removeItem('fitlist-displayName');
  localStorage.removeItem('fitlist-v3');

  kids = [];
  activeId = null;
  renderSidebar();
  updateStats();
  document.getElementById('kid-header').style.display = 'none';
  document.getElementById('tabs').style.display = 'none';
  document.getElementById('no-kid').style.display = 'block';
  renderUserBtns();
  window.location.href = '/';
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
      kids = data.kids.map(normalizeKid);
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
  if (!session.token) {
    window.location.href = '/';
    return;
  }
  loadLocal();
  renderSidebar();
  renderUserBtns();
  updateStats();
  registerSW();
  await refreshSession();
  if (kids.length) {
    selectKid(activeId && getKid(activeId) ? activeId : kids[0].id);
  } else {
    document.getElementById('kid-header').style.display = 'none';
    document.getElementById('tabs').style.display = 'none';
    document.getElementById('no-kid').style.display = 'block';
  }
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
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
    const label = session.displayName || session.username;
    el.innerHTML = `<span class="stat-pill" style="background:rgba(255,255,255,.08);color:#ccc;max-width:100px;overflow:hidden;text-overflow:ellipsis" title="${label}">${label}</span><button class="topbtn" onclick="logout()">Logout</button>`;
  } else {
    el.innerHTML = '';
  }
}

function openConnectedAccounts() {
  document.getElementById('connected-modal').classList.add('open');
  loadSharingPanel();
}

function closeConnectedAccounts() { document.getElementById('connected-modal').classList.remove('open'); }

function loadSharingPanel() {
  loadPendingRequestsModal();
  loadMembersList();
  loadConnectedOwners();
}

function loadPendingRequestsModal() {
  const listEl = document.getElementById('pending-requests-list');
  listEl.innerHTML = 'Loading…';
  fetchJson(`${API_BASE}/family/requests/incoming`)
    .then(res => res.json())
    .then(data => {
      const requests = data.requests || [];
      if (!requests.length) {
        listEl.innerHTML = '<div class="empty">No pending requests.</div>';
        return;
      }
      listEl.innerHTML = requests.map(r => `
        <div class="family-pending-row">
          <div>
            <div style="font-weight:700">${r.requesterDisplayName || r.requesterUsername}</div>
            <div style="font-size:12px;color:#888">@${r.requesterUsername}${r.message ? ' — ' + r.message : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="modal-btn-primary" style="padding:6px 10px;font-size:11px" onclick="approveFamilyRequest(${r.id})">Approve</button>
            <button class="modal-btn-secondary" style="padding:6px 10px;font-size:11px" onclick="denyFamilyRequest(${r.id})">Deny</button>
          </div>
        </div>
      `).join('');
    })
    .catch(() => { listEl.innerHTML = '<div class="empty">Unable to load requests.</div>'; });
}

function loadMembersList() {
  const listEl = document.getElementById('members-list');
  listEl.innerHTML = 'Loading…';
  fetchJson(`${API_BASE}/family/members`)
    .then(res => res.json())
    .then(data => {
      const members = data.members || [];
      if (!members.length) {
        listEl.innerHTML = '<div class="empty">Nobody else has access yet.</div>';
        return;
      }
      listEl.innerHTML = members.map(m => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #f0f0f0;border-radius:10px;margin-bottom:8px;background:#fff;">
          <div>
            <div style="font-weight:700">${m.displayName || m.username}</div>
            <div style="font-size:12px;color:#888">@${m.username}</div>
          </div>
          <button class="modal-btn-secondary" onclick="revokeMemberAccess(${m.memberId})">Revoke</button>
        </div>
      `).join('');
    })
    .catch(() => { listEl.innerHTML = '<div class="empty">Unable to load members.</div>'; });
}

function approveFamilyRequest(requestId) {
  fetchJson(`${API_BASE}/family/requests/${requestId}/approve`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        loadSharingPanel();
        loadFamilyPendingRequests();
      } else {
        alert(data.error || 'Unable to approve');
      }
    });
}

function denyFamilyRequest(requestId) {
  fetchJson(`${API_BASE}/family/requests/${requestId}/deny`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        loadSharingPanel();
        loadFamilyPendingRequests();
      } else {
        alert(data.error || 'Unable to deny');
      }
    });
}

function revokeMemberAccess(memberId) {
  fetchJson(`${API_BASE}/family/access/${memberId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if (data.ok) loadSharingPanel();
      else alert(data.error || 'Unable to revoke');
    });
}

function loadConnectedOwners() {
  const listEl = document.getElementById('connected-list');
  listEl.innerHTML = 'Loading…';
  fetchJson(`${API_BASE}/family/owners`)
    .then(res => res.json())
    .then(data => {
      const owners = data.owners || [];
      if (!owners.length) {
        listEl.innerHTML = '<div class="empty">You have not joined any other family lists.</div>';
        return;
      }
      listEl.innerHTML = owners.map(o => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border:1px solid #f0f0f0;border-radius:10px;margin-bottom:8px;background:#fff;">
          <div>
            <div style="font-weight:700">${o.displayName || o.username}</div>
            <div style="font-size:12px;color:#888">@${o.username}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="modal-btn-primary" onclick="(function(){ closeConnectedAccounts(); openFamilyView(); loadFamilyOwner(${o.ownerId}); })()">Browse</button>
            <button class="modal-btn-secondary" onclick="removeFamilyAccess(${o.ownerId})">Leave</button>
          </div>
        </div>
      `).join('');
    })
    .catch(() => { listEl.innerHTML = '<div class="empty">Unable to load families.</div>'; });
}

function removeFamilyAccess(ownerId) {
  fetchJson(`${API_BASE}/family/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId })
  })
    .then(res => res.json())
    .then(data => {
      if (data.ok) loadSharingPanel();
      else alert(data.error || 'Unable to remove access');
    })
    .catch(() => alert('Unable to remove access.'));
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
  if (session.token) loadFamilyPendingRequests();
}
function closeFamilyView() { document.getElementById('family-view').style.display = 'none'; }

function resetFamilyView() {
  familyOwner = null;
  familyKids = [];
  familyUser = session.displayName || session.username || '';
  document.getElementById('family-name-input').value = '';
  document.getElementById('family-account-input').value = '';
  document.getElementById('family-invite-input').value = '';
  document.getElementById('family-account-results').innerHTML = '';
  document.getElementById('family-account-message').textContent = '';
  const pendingEl = document.getElementById('family-pending-requests');
  if (pendingEl) { pendingEl.style.display = 'none'; pendingEl.innerHTML = ''; }
  if (session.token) {
    document.getElementById('family-name-step').style.display = 'none';
    document.getElementById('family-account-step').style.display = 'flex';
  } else {
    document.getElementById('family-name-step').style.display = 'flex';
    document.getElementById('family-account-step').style.display = 'none';
  }
  document.getElementById('family-browse').classList.remove('open');
  document.getElementById('family-sub').textContent = 'Claim gifts so nobody buys the same thing twice';
}

function loadFamilyPendingRequests() {
  const el = document.getElementById('family-pending-requests');
  if (!el) return;
  fetchJson(`${API_BASE}/family/requests/incoming`)
    .then(res => res.json())
    .then(data => {
      const requests = data.requests || [];
      if (!requests.length) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
      }
      el.style.display = 'block';
      el.className = 'family-pending-box';
      el.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:8px">Pending access requests</div>` +
        requests.map(r => `
          <div class="family-pending-row">
            <div>
              <div style="font-weight:700;font-size:13px">${r.requesterDisplayName || r.requesterUsername}</div>
              <div style="font-size:11px;color:#888">@${r.requesterUsername}</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="modal-btn-primary" style="padding:5px 8px;font-size:11px" onclick="approveFamilyRequest(${r.id})">Approve</button>
              <button class="modal-btn-secondary" style="padding:5px 8px;font-size:11px" onclick="denyFamilyRequest(${r.id})">Deny</button>
            </div>
          </div>
        `).join('');
    })
    .catch(() => { el.style.display = 'none'; });
}

function startBrowsing() {
  const name = document.getElementById('family-name-input').value.trim();
  if (!name) return;
  familyUser = name; familyFilter = 'all';
  document.getElementById('family-name-step').style.display = 'none';
  document.getElementById('family-browse').classList.add('open');
  document.getElementById('family-sub').textContent = familyOwner ? `Browsing ${familyOwner.displayName}'s family` : `Shopping as ${familyUser}`;
  renderFamilyList();
}

function openFamilyBrowseWithoutAccount() {
  document.getElementById('family-account-step').style.display = 'none';
  document.getElementById('family-name-step').style.display = 'flex';
}

function searchFamilyAccount() {
  const term = document.getElementById('family-account-input').value.trim();
  if (!term) return;
  const resultsEl = document.getElementById('family-account-results');
  const messageEl = document.getElementById('family-account-message');
  resultsEl.innerHTML = 'Searching…';
  messageEl.textContent = '';
  fetchJson(`${API_BASE}/users/search?term=${encodeURIComponent(term)}`)
    .then(res => res.json())
    .then(data => {
      const users = data.users || [];
      if (!users.length) {
        resultsEl.innerHTML = '<div class="empty">No matching accounts found.</div>';
        return;
      }
      resultsEl.innerHTML = users.map(u => `
        <div class="family-account-row">
          <div>
            <div class="family-account-name">${u.displayName || u.username}</div>
            <div class="family-account-username">@${u.username}</div>
          </div>
          <button class="modal-btn-primary" onclick="requestFamilyAccess('${u.username}')">Request access</button>
        </div>
      `).join('');
    })
    .catch(() => {
      resultsEl.innerHTML = '<div class="empty">Unable to search right now.</div>';
    });
}

function requestFamilyAccess(ownerUsername) {
  const messageEl = document.getElementById('family-account-message');
  messageEl.textContent = 'Sending request…';
  fetchJson(`${API_BASE}/family/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerUsername })
  })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        messageEl.textContent = `Request sent to ${ownerUsername}.`; 
      } else {
        messageEl.textContent = data.error || 'Unable to send request.';
      }
    })
    .catch(() => {
      messageEl.textContent = 'Unable to send request right now.';
    });
}

function joinFamilyByCode() {
  const code = document.getElementById('family-invite-input').value.trim();
  if (!code) return;
  const messageEl = document.getElementById('family-account-message');
  messageEl.textContent = 'Joining family…';
  fetchJson(`${API_BASE}/family/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        familyOwner = data.owner;
        familyKids = [];
        familyUser = familyOwner.displayName || familyOwner.username;
        document.getElementById('family-name-step').style.display = 'none';
        document.getElementById('family-account-step').style.display = 'none';
        document.getElementById('family-browse').classList.add('open');
        document.getElementById('family-sub').textContent = `Browsing ${familyOwner.displayName}'s family`;
        loadFamilyOwner(data.owner.ownerId);
      } else {
        messageEl.textContent = data.error || 'Unable to join family.';
      }
    })
    .catch(() => {
      messageEl.textContent = 'Unable to join family right now.';
    });
}

function createFamilyInvite() {
  const codeEl = document.getElementById('family-invite-code');
  codeEl.textContent = 'Creating invite…';
  fetchJson(`${API_BASE}/family/invite`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.ok && data.code) {
        codeEl.textContent = `Invite code: ${data.code}`;
        document.getElementById('family-invite-input').value = data.code;
      } else {
        codeEl.textContent = data.error || 'Unable to create invite.';
      }
    })
    .catch(() => {
      codeEl.textContent = 'Unable to create invite right now.';
    });
}

function loadFamilyOwner(ownerId) {
  fetchJson(`${API_BASE}/family/owner/${ownerId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        document.getElementById('family-account-message').textContent = data.error;
        return;
      }
      familyOwner = data.owner;
      familyKids = (data.kids || []).map(normalizeKid);
      familyUser = session.displayName || session.username || familyUser;
      document.getElementById('family-account-step').style.display = 'none';
      document.getElementById('family-browse').classList.add('open');
      document.getElementById('family-sub').textContent = `Browsing ${familyOwner.displayName}'s family`;
      renderFamilyList();
    })
    .catch(() => {
      document.getElementById('family-account-message').textContent = 'Unable to load family list.';
    });
}

async function updateRemoteGiftClaim(giftId, claimedBy) {
  if (!familyOwner?.ownerId) return false;
  const res = await fetchJson(`${API_BASE}/family/owner/${familyOwner.ownerId}/gifts/${giftId}/claim`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimedBy })
  });
  const data = await res.json();
  return res.ok && data.ok;
}

function setFilter(f, btn) {
  familyFilter = f;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderFamilyList();
}

function renderFamilyList() {
  const sourceKids = familyOwner ? familyKids : kids;
  const myClaims = sourceKids.flatMap(k => k.gifts.filter(g => g.claimedBy === familyUser).map(g => ({ ...g, kidName: k.name, kidId: k.id })));
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
  sourceKids.forEach(k => {
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

function showFamilyClaimForm(gid, kidId) {
  document.querySelector(`#fclaim-row-${gid} .ill-buy-btn`).style.display = 'none';
  document.getElementById(`fclaim-form-${gid}`).style.display = 'flex';
  const input = document.getElementById(`fclaim-input-${gid}`);
  if (!input.value) input.value = familyUser || session.displayName || session.username || '';
  input.focus();
}
function hideFamilyClaimForm(gid) {
  document.querySelector(`#fclaim-row-${gid} .ill-buy-btn`).style.display = '';
  document.getElementById(`fclaim-form-${gid}`).style.display = 'none';
}
async function submitFamilyClaim(gid, kidId) {
  const who = document.getElementById(`fclaim-input-${gid}`).value.trim();
  if (!who) return;
  const k = familyOwner ? familyKids.find(x => x.id === kidId) : getKid(kidId);
  if (!k) return;
  const g = k.gifts.find(x => x.id === gid);
  if (!g) return;
  if (familyOwner) {
    const ok = await updateRemoteGiftClaim(gid, who);
    if (!ok) {
      alert('Unable to save claim. Check your access.');
      return;
    }
    g.claimedBy = who;
    renderFamilyList();
    return;
  }
  g.claimedBy = who;
  save();
  renderFamilyList();
  updateStats();
  if (activeId === kidId) renderGifts(k);
}
async function familyUnclaim(kidId, gid) {
  const k = familyOwner ? familyKids.find(x => x.id === kidId) : getKid(kidId);
  if (!k) return;
  const g = k.gifts.find(x => x.id === gid);
  if (!g) return;
  if (familyOwner) {
    const ok = await updateRemoteGiftClaim(gid, null);
    if (!ok) {
      alert('Unable to remove claim.');
      return;
    }
    g.claimedBy = null;
    renderFamilyList();
    return;
  }
  g.claimedBy = null;
  save();
  renderFamilyList();
  updateStats();
  if (activeId === kidId) renderGifts(k);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

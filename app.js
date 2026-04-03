// ══════════════════════════════════════
//  app.js — Color Matching Game v3
// ══════════════════════════════════════

// ── SUPABASE INIT (dari config.js) ──
const { createClient } = supabase;
const sb = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY);

// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let TC = {r:0,g:0,b:0};
let matchStart = 0, elInt = null, p1Raf = null;
let curScreen = 's0';
let isGuest = true;
let currentUser = null; // {id, username, bio, avatar_url}
let authMode = 'register';

// records
let recOffset = 0;
const REC_PAGE = 50;
let recAllLoaded = false;
let recSeenUsers = new Set();

// chat
let chatTargetUser = null;
let chatMessages = [];
let chatSubscription = null;

const CIRC = 2 * Math.PI * 82;
const arc = document.getElementById('r-arc');
const trk = document.getElementById('r-trk');
arc.style.strokeDasharray = CIRC;
arc.style.strokeDashoffset = 0;

// ══════════════════════════════════════
//  SVG ICONS
// ══════════════════════════════════════
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
</svg>`;

// ══════════════════════════════════════
//  UTILS
// ══════════════════════════════════════
const rc   = () => Math.floor(Math.random() * 256);
const toHex = (r,g,b) => '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
const clampV = (v,a,b) => Math.max(a, Math.min(b, v));
const r5   = () => Array.from({length:5}, () => Math.floor(Math.random()*10)).join('');
const fmtDate = d => new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
const fmtTime = d => new Date(d).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
const escHtml = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function calcScore(tr,tg,tb,mr,mg,mb) {
  const d = Math.sqrt((tr-mr)**2 + (tg-mg)**2 + (tb-mb)**2);
  const maxD = Math.sqrt(3*255**2);
  const ratio = clampV(1 - d/maxD, 0, 1);
  const raw = ratio * 10;
  return { ratio, d, raw, str:`${Math.min(9, Math.floor(raw))},${r5()}` };
}

const VDICTS = [
  {t:0,   lab:'COBA LAGI',   col:'#ff5050'},
  {t:2,   lab:'HAMPIR...',   col:'#ff8844'},
  {t:4,   lab:'LUMAYAN',     col:'#ffcc33'},
  {t:6,   lab:'BAGUS!',      col:'#bbdd44'},
  {t:8,   lab:'HEBAT!',      col:'#44ee88'},
  {t:9,   lab:'SEMPURNA!',   col:'#44ffaa'},
  {t:9.95,lab:'LUAR BIASA!', col:'#ffffff'},
];
function verdict(raw) {
  let v = VDICTS[0];
  for (const x of VDICTS) if (raw >= x.t) v = x;
  return v;
}

let toastTimer;
function toast(msg, dur=2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), dur);
}

// ── Avatar HTML builder ──
// Menghasilkan <img> jika ada URL, atau placeholder SVG
function buildAvatar(url, size=28, className='') {
  if (url) {
    return `<img src="${url}" alt="" class="${className}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1.5px solid var(--bord);display:inline-block;vertical-align:middle;flex-shrink:0;" onerror="this.replaceWith(buildAvatarPh(${size}))">`;
  }
  return `<span style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(242,237,228,.08);border:1.5px solid var(--bord);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;vertical-align:middle;overflow:hidden;">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:${size*.55}px;height:${size*.55}px;opacity:.45;">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  </span>`;
}

function buildAvatarEl(url, size=28) {
  // Returns a DOM element
  const wrap = document.createElement('span');
  wrap.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:rgba(242,237,228,.08);border:1.5px solid var(--bord);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;vertical-align:middle;overflow:hidden;`;
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
    img.onerror = () => {
      img.remove();
      wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:${size*.55}px;height:${size*.55}px;opacity:.45;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    };
    wrap.appendChild(img);
  } else {
    wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:${size*.55}px;height:${size*.55}px;opacity:.45;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  }
  return wrap;
}

// ══════════════════════════════════════
//  SCREEN TRANSITIONS
// ══════════════════════════════════════
function goTo(id) {
  const prev = document.getElementById(curScreen);
  if (prev) { prev.classList.remove('on'); prev.classList.add('out'); }
  setTimeout(() => {
    if (prev) prev.classList.remove('out');
    const next = document.getElementById(id);
    next.classList.add('on');
  }, 60);
  curScreen = id;

  const gameDots = document.getElementById('game-dots');
  const inGame = ['s1','s2','s3'].includes(id);
  gameDots.style.display = inGame ? 'flex' : 'none';
  if (inGame) {
    const idx = ['s1','s2','s3'].indexOf(id);
    for (let i=0;i<3;i++) {
      const d = document.getElementById('gd'+i);
      d.classList.remove('act','done');
      if (i < idx) d.classList.add('done');
      if (i === idx) d.classList.add('act');
    }
  }
}

// ══════════════════════════════════════
//  MODAL
// ══════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

['modal-edit-profile','modal-view-profile','modal-chat'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) {
      if (id === 'modal-chat') teardownChat();
      closeModal(id);
    }
  });
});
document.getElementById('close-edit-profile').addEventListener('click', () => closeModal('modal-edit-profile'));
document.getElementById('close-view-profile').addEventListener('click', () => closeModal('modal-view-profile'));
document.getElementById('close-chat').addEventListener('click', () => { teardownChat(); closeModal('modal-chat'); });

// ══════════════════════════════════════
//  AUTH STATE
// ══════════════════════════════════════
async function checkStoredSession() {
  const stored = localStorage.getItem('cm_user');
  if (!stored) return;
  try {
    const u = JSON.parse(stored);
    const { data, error } = await sb.from('users_colormatch')
      .select('id, username, bio, avatar_url').eq('id', u.id).single();
    if (data && !error) {
      currentUser = data;
      updateHomeUserBar();
    } else {
      localStorage.removeItem('cm_user');
    }
  } catch(e) {}
}

function updateHomeUserBar() {
  const bar = document.getElementById('home-user-bar');
  const btnProfile = document.getElementById('btn-profile');
  if (currentUser) {
    bar.style.display = 'flex';
    document.getElementById('hub-name').textContent = currentUser.username;
    btnProfile.style.display = '';
  } else {
    bar.style.display = 'none';
    btnProfile.style.display = 'none';
  }
}

// ══════════════════════════════════════
//  HOME
// ══════════════════════════════════════
document.getElementById('btn-play').addEventListener('click', () => {
  if (currentUser) { isGuest=false; startGameFlow(); }
  else goTo('s-pick');
});
document.getElementById('btn-rec').addEventListener('click', () => {
  recOffset=0; recAllLoaded=false; recSeenUsers=new Set();
  loadRecords(true); goTo('s-rec');
});
document.getElementById('btn-profile').addEventListener('click', () => {
  if (!currentUser) { toast('Login terlebih dahulu.'); return; }
  loadMyProfile(); goTo('s-profile');
});
document.getElementById('btn-quit').addEventListener('click', () => {
  if (window.history && window.history.length > 1) window.history.back();
  else window.close();
});
document.getElementById('hub-logout').addEventListener('click', () => {
  currentUser=null; isGuest=true;
  localStorage.removeItem('cm_user');
  updateHomeUserBar(); toast('Berhasil keluar.');
});

// ══════════════════════════════════════
//  PLAY PICKER
// ══════════════════════════════════════
document.getElementById('btn-with-acc').addEventListener('click', () => {
  if (currentUser) { isGuest=false; startGameFlow(); }
  else { setAuthMode('register'); goTo('s-auth'); }
});
document.getElementById('btn-guest').addEventListener('click', () => { isGuest=true; startGameFlow(); });
document.getElementById('btn-pick-back').addEventListener('click', () => goTo('s0'));

// ══════════════════════════════════════
//  AUTH
// ══════════════════════════════════════
function setAuthMode(mode) {
  authMode = mode;
  const isReg = mode==='register';
  document.getElementById('auth-title').textContent = isReg?'DAFTAR':'MASUK';
  document.getElementById('auth-toggle').textContent = isReg?'Sudah punya akun?':'Belum punya akun?';
  document.getElementById('btn-auth-submit').textContent = isReg?'DAFTAR & MASUK':'MASUK';
  document.getElementById('field-confirm').style.display = isReg?'':'none';
  document.getElementById('auth-err').textContent = '';
  document.getElementById('inp-conf').value = '';
}
document.getElementById('auth-toggle').addEventListener('click', () => setAuthMode(authMode==='register'?'login':'register'));
document.getElementById('auth-back').addEventListener('click', () => goTo('s-pick'));
document.getElementById('btn-auth-submit').addEventListener('click', handleAuth);
['inp-user','inp-pass','inp-conf'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') handleAuth(); });
});

async function handleAuth() {
  const username = document.getElementById('inp-user').value.trim();
  const password = document.getElementById('inp-pass').value;
  const confirm  = document.getElementById('inp-conf').value;
  const errEl    = document.getElementById('auth-err');
  errEl.textContent = '';
  if (!username||!password) { errEl.textContent='Username dan password wajib diisi.'; return; }
  if (username.length<3)   { errEl.textContent='Username minimal 3 karakter.'; return; }
  if (password.length<6)   { errEl.textContent='Password minimal 6 karakter.'; return; }
  document.getElementById('btn-auth-submit').textContent = '...';

  if (authMode==='register') {
    if (password!==confirm) { errEl.textContent='Password tidak cocok.'; resetAuthBtn(); return; }
    const { data: existing } = await sb.from('users_colormatch').select('id').eq('username',username).maybeSingle();
    if (existing) { errEl.textContent='Username sudah dipakai.'; resetAuthBtn(); return; }
    const hashed = await hashPass(password);
    const { data, error } = await sb.from('users_colormatch')
      .insert({ username, password_hash:hashed, bio:'', avatar_url:null })
      .select('id,username,bio,avatar_url').single();
    if (error||!data) { errEl.textContent='Gagal mendaftar. Coba lagi.'; resetAuthBtn(); return; }
    currentUser = data;
  } else {
    const { data: user } = await sb.from('users_colormatch')
      .select('id,username,password_hash,bio,avatar_url').eq('username',username).maybeSingle();
    if (!user) { errEl.textContent='Username tidak ditemukan.'; resetAuthBtn(); return; }
    const hashed = await hashPass(password);
    if (hashed!==user.password_hash) { errEl.textContent='Password salah.'; resetAuthBtn(); return; }
    currentUser = { id:user.id, username:user.username, bio:user.bio||'', avatar_url:user.avatar_url };
  }
  localStorage.setItem('cm_user', JSON.stringify(currentUser));
  updateHomeUserBar(); isGuest=false;
  toast(`Selamat datang, ${currentUser.username}!`);
  startGameFlow();
}
function resetAuthBtn() {
  document.getElementById('btn-auth-submit').textContent = authMode==='register'?'DAFTAR & MASUK':'MASUK';
}
async function hashPass(pass) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cm_salt_'+pass));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ══════════════════════════════════════
//  RECORDS
// ══════════════════════════════════════
async function loadRecords(reset=false) {
  if (reset) {
    recOffset=0; recAllLoaded=false; recSeenUsers=new Set();
    document.getElementById('rec-content').innerHTML = '<div class="rec-empty">Memuat...</div>';
    document.getElementById('rec-load-more').style.display = 'none';
  }

  const limit = REC_PAGE;
  // Fetch with offset — we need more rows than REC_PAGE because some may be dupes in the window
  const fetchLimit = limit * 3; // over-fetch to account for dedup
  const { data, error } = await sb.from('scores_colormatch')
    .select('user_id, username, score_raw, similarity_pct, elapsed_seconds, created_at, avatar_url')
    .order('score_raw', { ascending:false })
    .range(recOffset * limit, recOffset * limit + fetchLimit - 1);

  if (error) {
    if (reset) document.getElementById('rec-content').innerHTML = '<div class="rec-empty">Gagal memuat.</div>';
    return;
  }

  const deduped = [];
  for (const row of (data||[])) {
    if (!recSeenUsers.has(row.user_id) && deduped.length < limit) {
      recSeenUsers.add(row.user_id);
      deduped.push(row);
    }
  }

  if (reset) {
    if (deduped.length===0) {
      document.getElementById('rec-content').innerHTML = '<div class="rec-empty">Belum ada rekor. Jadilah yang pertama!</div>';
      return;
    }
    document.getElementById('rec-content').innerHTML = '';
  }

  // Create table if not exists
  let tbody = document.getElementById('rec-tbody');
  if (!tbody) {
    document.getElementById('rec-content').innerHTML = `
      <table class="rec-table" id="rec-table-main">
        <thead><tr>
          <th>#</th><th>Pemain</th><th>Skor</th><th>Mirip</th><th>Waktu</th><th></th>
        </tr></thead>
        <tbody id="rec-tbody"></tbody>
      </table>`;
    tbody = document.getElementById('rec-tbody');
  }

  const existingCount = tbody.querySelectorAll('tr').length;

  deduped.forEach((row, i) => {
    const rank = existingCount + i + 1;
    if (rank > 1000) { recAllLoaded=true; return; }
    const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':rank;
    const isMe = currentUser && row.user_id===currentUser.id;

    const tr = document.createElement('tr');
    tr.dataset.uid = row.user_id;
    tr.dataset.rank = rank;

    // rank cell
    const tdRank = document.createElement('td');
    tdRank.innerHTML = `<span class="rec-rank">${medal}</span>`;

    // player name cell — with real avatar img
    const tdName = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'rec-row-name';

    // Avatar element (real image, no emoji)
    const avEl = buildAvatarEl(row.avatar_url || (isMe && currentUser ? currentUser.avatar_url : null), 28);
    nameWrap.appendChild(avEl);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = row.username + (isMe?' (kamu)':'');
    if (isMe) nameSpan.style.color = 'var(--acc)';
    nameWrap.appendChild(nameSpan);
    tdName.appendChild(nameWrap);

    // score, sim, time
    const tdScore = document.createElement('td');
    tdScore.textContent = row.score_raw.toFixed(2);
    const tdSim = document.createElement('td');
    tdSim.textContent = row.similarity_pct.toFixed(1)+'%';
    const tdTime = document.createElement('td');
    tdTime.textContent = row.elapsed_seconds.toFixed(2)+'s';

    // actions
    const tdAct = document.createElement('td');
    tdAct.innerHTML = `<div class="rec-row-actions">
      <button class="rec-act-btn" onclick="showUserProfile('${row.user_id}','${row.username.replace(/'/g,"\\'")}')">Profil</button>
      ${!isMe?`<button class="rec-act-btn" onclick="openChatWith('${row.user_id}','${row.username.replace(/'/g,"\\'")}')">💬</button>`:''}
    </div>`;

    tr.append(tdRank, tdName, tdScore, tdSim, tdTime, tdAct);
    tbody.appendChild(tr);
  });

  recOffset++;
  const totalShown = tbody.querySelectorAll('tr').length;
  const hasMore = data && data.length >= limit && totalShown < 1000 && !recAllLoaded;
  document.getElementById('rec-load-more').style.display = hasMore ? 'block' : 'none';
}

document.getElementById('rec-load-more').addEventListener('click', () => loadRecords(false));
document.getElementById('rec-back').addEventListener('click', () => goTo('s0'));

// ── SEARCH ──
document.getElementById('rec-search-btn').addEventListener('click', searchUser);
document.getElementById('rec-search-inp').addEventListener('keydown', e => { if(e.key==='Enter') searchUser(); });

async function searchUser() {
  const q = document.getElementById('rec-search-inp').value.trim();
  const res = document.getElementById('rec-search-result');
  if (!q) { res.classList.remove('show'); return; }
  res.classList.add('show');
  res.innerHTML = '<div style="color:var(--mu);font-size:.68rem;letter-spacing:.08em;">Mencari...</div>';

  const { data: user } = await sb.from('users_colormatch')
    .select('id,username,bio,avatar_url').ilike('username',q).maybeSingle();
  if (!user) {
    res.innerHTML = '<div style="color:var(--mu);font-size:.68rem;letter-spacing:.08em;">Username tidak ditemukan.</div>';
    return;
  }

  const { data: bestScore } = await sb.from('scores_colormatch')
    .select('score_raw').eq('user_id',user.id)
    .order('score_raw',{ascending:false}).limit(1).maybeSingle();

  let rankStr = '—';
  if (bestScore) {
    const { count } = await sb.from('scores_colormatch')
      .select('user_id',{count:'exact',head:true}).gt('score_raw',bestScore.score_raw);
    rankStr = `#${(count||0)+1}`;
  }

  const isMe = currentUser && user.id===currentUser.id;
  res.innerHTML = '';
  const rsrn = document.createElement('div');
  rsrn.className = 'rsrn';
  const avEl = buildAvatarEl(user.avatar_url, 38);
  rsrn.appendChild(avEl);
  rsrn.innerHTML += `
    <div class="rsrn-info">
      <div class="rsrn-name">${escHtml(user.username)}</div>
      <div class="rsrn-rank">Rank ${rankStr} · Best: ${bestScore?bestScore.score_raw.toFixed(2):'—'}</div>
    </div>`;
  res.appendChild(rsrn);
  res.innerHTML += `<div class="rsrn-acts">
    <button class="rsrn-act" onclick="showUserProfile('${user.id}','${user.username.replace(/'/g,"\\'")}')">Lihat Profil</button>
    ${!isMe?`<button class="rsrn-act" onclick="openChatWith('${user.id}','${user.username.replace(/'/g,"\\'")}')">💬 Pesan</button>`:''}
  </div>`;
}

// ══════════════════════════════════════
//  VIEW PROFILE MODAL
// ══════════════════════════════════════
async function showUserProfile(userId, username) {
  openModal('modal-view-profile');
  const content = document.getElementById('modal-view-profile-content');
  content.innerHTML = '<div class="chat-loading">Memuat profil...</div>';

  const [{ data: user }, { data: scores }] = await Promise.all([
    sb.from('users_colormatch').select('id,username,bio,avatar_url').eq('id',userId).maybeSingle(),
    sb.from('history_colormatch')
      .select('score_raw,similarity_pct,elapsed_seconds,created_at,target_r,target_g,target_b,answer_r,answer_g,answer_b')
      .eq('user_id',userId).order('score_raw',{ascending:false}).limit(20)
  ]);

  const u = user || { username, bio:'', avatar_url:null };
  const bestScore = scores && scores.length>0 ? scores[0].score_raw : null;
  let rankStr = '—';
  if (bestScore !== null) {
    const { count } = await sb.from('scores_colormatch')
      .select('user_id',{count:'exact',head:true}).gt('score_raw',bestScore);
    rankStr = `#${(count||0)+1}`;
  }

  const isMe = currentUser && userId===currentUser.id;
  content.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'pview-header';
  const avWrap = document.createElement('div');
  avWrap.className = 'pview-avatar';
  if (u.avatar_url) {
    const img = document.createElement('img');
    img.src = u.avatar_url; img.alt='';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    img.onerror = () => { img.remove(); avWrap.innerHTML = ICON_USER.replace('stroke="currentColor"','stroke="rgba(242,237,228,.4)"'); };
    avWrap.appendChild(img);
  } else {
    avWrap.innerHTML = ICON_USER.replace('stroke="currentColor"','stroke="rgba(242,237,228,.4)"');
  }
  header.appendChild(avWrap);
  header.innerHTML += `<div class="pview-info">
    <div class="pview-name">${escHtml(u.username)}</div>
    <div class="pview-rank">Rank ${rankStr}</div>
    ${u.bio?`<div class="pview-bio">${escHtml(u.bio)}</div>`:''}
  </div>`;
  content.appendChild(header);

  // Stats
  content.innerHTML += `<div class="pview-stats">
    <div class="pview-stat"><div class="pview-stat-val">${scores?scores.length:0}</div><div class="pview-stat-lbl">Games</div></div>
    <div class="pview-stat"><div class="pview-stat-val">${bestScore!==null?bestScore.toFixed(2):'—'}</div><div class="pview-stat-lbl">Best</div></div>
    <div class="pview-stat"><div class="pview-stat-val">${rankStr}</div><div class="pview-stat-lbl">Rank</div></div>
  </div>`;

  // History
  content.innerHTML += `<div class="pview-hist-title">Riwayat Permainan</div>`;
  let histHtml = '<div class="pview-hist">';
  if (scores && scores.length>0) {
    scores.forEach(s => {
      histHtml += `<div class="pview-row">
        <div><div class="pview-score">${s.score_raw.toFixed(2)}</div><div style="font-size:.58rem;color:var(--mu);">${fmtDate(s.created_at)}</div></div>
        <div style="text-align:right;"><div>${s.similarity_pct.toFixed(1)}%</div><div style="color:var(--mu);font-size:.6rem;">${s.elapsed_seconds.toFixed(2)}s</div></div>
        <div style="display:flex;gap:3px;align-items:center;">
          <span style="width:14px;height:14px;border-radius:50%;background:rgb(${s.target_r},${s.target_g},${s.target_b});border:1px solid rgba(255,255,255,.12);display:inline-block;"></span>
          <span style="color:var(--mu);font-size:.6rem;">→</span>
          <span style="width:14px;height:14px;border-radius:50%;background:rgb(${s.answer_r},${s.answer_g},${s.answer_b});border:1px solid rgba(255,255,255,.12);display:inline-block;"></span>
        </div>
      </div>`;
    });
  } else {
    histHtml += '<div style="color:var(--mu);font-size:.68rem;text-align:center;padding:1rem;">Belum ada riwayat.</div>';
  }
  histHtml += '</div>';
  content.innerHTML += histHtml;

  if (!isMe) {
    content.innerHTML += `<div class="pview-btn-row">
      <button class="btn btn-ghost" style="flex:1;" onclick="openChatWith('${userId}','${u.username.replace(/'/g,"\\'")}');closeModal('modal-view-profile');">💬 Kirim Pesan</button>
    </div>`;
  }
}

// ══════════════════════════════════════
//  MY PROFILE
// ══════════════════════════════════════
async function loadMyProfile() {
  if (!currentUser) return;
  document.getElementById('prof-username').textContent = currentUser.username;

  // Bio
  const bioEl = document.getElementById('prof-bio');
  if (currentUser.bio && currentUser.bio.trim()) {
    bioEl.textContent = currentUser.bio;
    bioEl.className = 'prof-bio';
  } else {
    bioEl.innerHTML = '<span class="prof-bio-empty">Belum ada bio. Klik edit untuk menambahkan.</span>';
  }

  // Avatar
  const avImg = document.getElementById('prof-avatar-img');
  const avPh  = document.getElementById('prof-avatar-ph');
  if (currentUser.avatar_url) {
    avImg.src = currentUser.avatar_url;
    avImg.style.display = 'block';
    avPh.style.display  = 'none';
  } else {
    avImg.style.display = 'none';
    avPh.style.display  = 'flex';
  }

  document.getElementById('prof-history').innerHTML = '<div class="prof-empty">Memuat...</div>';

  const [{ data: scores }, { data: bestRec }] = await Promise.all([
    sb.from('history_colormatch')
      .select('score_raw,similarity_pct,elapsed_seconds,created_at,target_r,target_g,target_b,answer_r,answer_g,answer_b')
      .eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(30),
    sb.from('scores_colormatch')
      .select('score_raw').eq('user_id',currentUser.id).maybeSingle()
  ]);

  document.getElementById('ps-games').textContent = scores ? scores.length : '0';
  document.getElementById('ps-best').textContent  = bestRec ? bestRec.score_raw.toFixed(2) : '—';

  if (bestRec) {
    const { count } = await sb.from('scores_colormatch')
      .select('user_id',{count:'exact',head:true}).gt('score_raw',bestRec.score_raw);
    document.getElementById('ps-rank').textContent = `#${(count||0)+1}`;
  } else {
    document.getElementById('ps-rank').textContent = '—';
  }

  if (!scores || scores.length===0) {
    document.getElementById('prof-history').innerHTML = '<div class="prof-empty">Belum ada riwayat permainan.</div>';
    return;
  }

  let html = '';
  scores.forEach(s => {
    html += `<div class="ph-row">
      <div class="ph-left">
        <div class="ph-score">${s.score_raw.toFixed(2)}</div>
        <div class="ph-time">${fmtDate(s.created_at)} · ${fmtTime(s.created_at)}</div>
      </div>
      <div class="ph-right">
        <div class="ph-sim">${s.similarity_pct.toFixed(1)}%</div>
        <div class="ph-elapsed">${s.elapsed_seconds.toFixed(2)}s</div>
        <div class="ph-colors">
          <div class="ph-dot" style="background:rgb(${s.target_r},${s.target_g},${s.target_b});"></div>
          <div class="ph-dot" style="background:rgb(${s.answer_r},${s.answer_g},${s.answer_b});"></div>
        </div>
      </div>
    </div>`;
  });
  document.getElementById('prof-history').innerHTML = html;
}

document.getElementById('prof-back').addEventListener('click', () => goTo('s0'));
document.getElementById('prof-avatar-wrap').addEventListener('click', openEditProfileModal);
document.getElementById('prof-edit-btn').addEventListener('click', openEditProfileModal);

function openEditProfileModal() {
  if (!currentUser) { toast('Login terlebih dahulu.'); return; }
  const bioInp = document.getElementById('edit-bio');
  bioInp.value = currentUser.bio || '';
  document.getElementById('bio-count').textContent = `${bioInp.value.length}/120`;

  const prevEl = document.getElementById('edit-av-preview');
  if (currentUser.avatar_url) {
    prevEl.innerHTML = `<img src="${currentUser.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    prevEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:36px;height:36px;opacity:.4;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  }
  pendingAvatarBase64 = null;
  openModal('modal-edit-profile');
}

document.getElementById('edit-bio').addEventListener('input', function() {
  document.getElementById('bio-count').textContent = `${this.value.length}/120`;
});
document.getElementById('edit-avatar-btn').addEventListener('click', () => {
  document.getElementById('edit-avatar-input').click();
});

let pendingAvatarBase64 = null;
document.getElementById('edit-avatar-input').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { toast('Foto maksimal 3MB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    pendingAvatarBase64 = e.target.result;
    document.getElementById('edit-av-preview').innerHTML =
      `<img src="${pendingAvatarBase64}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-save-profile').addEventListener('click', async () => {
  if (!currentUser) return;
  const bio = document.getElementById('edit-bio').value.trim();
  const btn = document.getElementById('btn-save-profile');
  btn.textContent = 'Menyimpan...';
  const updateData = { bio };
  if (pendingAvatarBase64) {
    const compressed = await compressImage(pendingAvatarBase64, 220, 220, 0.82);
    updateData.avatar_url = compressed;
    pendingAvatarBase64 = null;
  }
  const { error } = await sb.from('users_colormatch').update(updateData).eq('id',currentUser.id);
  if (error) { toast('Gagal menyimpan.'); btn.textContent='SIMPAN'; return; }
  currentUser.bio = bio;
  if (updateData.avatar_url) currentUser.avatar_url = updateData.avatar_url;
  localStorage.setItem('cm_user', JSON.stringify(currentUser));
  closeModal('modal-edit-profile');
  loadMyProfile();
  toast('Profil tersimpan! ✓');
  btn.textContent = 'SIMPAN';
});

function compressImage(dataUrl, maxW, maxH, quality) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w=img.width, h=img.height;
      if (w>maxW) { h=h*maxW/w; w=maxW; }
      if (h>maxH) { w=w*maxH/h; h=maxH; }
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL('image/jpeg',quality));
    };
    img.src = dataUrl;
  });
}

// ══════════════════════════════════════
//  CHAT REAL-TIME
// ══════════════════════════════════════
function teardownChat() {
  if (chatSubscription) {
    try { chatSubscription.unsubscribe(); } catch(e) {}
    chatSubscription = null;
  }
}

async function openChatWith(targetId, targetUsername) {
  if (!currentUser) { toast('Login untuk mengirim pesan.'); return; }
  if (targetId===currentUser.id) { toast('Kamu tidak bisa pesan dirimu sendiri.'); return; }
  teardownChat();

  chatTargetUser = { id:targetId, username:targetUsername };
  document.getElementById('chat-target-name').textContent = targetUsername;
  document.getElementById('chat-modal-title').textContent = `💬 ${targetUsername}`;
  document.getElementById('chat-msgs').innerHTML = '<div class="chat-loading">Memuat pesan...</div>';
  document.getElementById('chat-input').value = '';
  openModal('modal-chat');

  const channelId = [currentUser.id, targetId].sort().join('_');

  // Load messages
  const { data: msgs } = await sb.from('messages_colormatch')
    .select('id,sender_id,sender_username,content,created_at')
    .eq('channel_id',channelId)
    .order('created_at',{ascending:true})
    .limit(100);

  // Fetch target user avatar
  const { data: targetUserData } = await sb.from('users_colormatch')
    .select('avatar_url').eq('id',targetId).maybeSingle();
  chatTargetUser.avatar_url = targetUserData?.avatar_url || null;

  chatMessages = msgs || [];
  renderChatMessages();

  // Subscribe realtime
  chatSubscription = sb.channel(`chat_${channelId}`)
    .on('postgres_changes', {
      event:'INSERT', schema:'public', table:'messages_colormatch',
      filter:`channel_id=eq.${channelId}`
    }, payload => {
      chatMessages.push(payload.new);
      renderChatMessages();
    })
    .subscribe();
}

function renderChatMessages() {
  const container = document.getElementById('chat-msgs');
  if (chatMessages.length===0) {
    container.innerHTML = '<div class="chat-empty">Belum ada pesan. Mulai percakapan!</div>';
    return;
  }
  container.innerHTML = '';
  chatMessages.forEach(msg => {
    const isMe = msg.sender_id===currentUser.id;
    const time  = fmtTime(msg.created_at);
    const avUrl = isMe ? currentUser.avatar_url : chatTargetUser?.avatar_url;

    const row = document.createElement('div');
    row.className = `cm${isMe?' mine':''}`;

    // avatar
    const avDiv = document.createElement('div');
    avDiv.className = 'cm-av';
    if (avUrl) {
      const img = document.createElement('img');
      img.src = avUrl; img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      img.onerror = () => { img.remove(); avDiv.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;opacity:.5;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`; };
      avDiv.appendChild(img);
    } else {
      avDiv.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;opacity:.5;"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    }

    // body (bubble + time)
    const body = document.createElement('div');
    body.className = 'cm-body';

    const bubble = document.createElement('div');
    bubble.className = 'cm-bubble';
    bubble.textContent = msg.content;

    const timeEl = document.createElement('div');
    timeEl.className = 'cm-time';
    timeEl.textContent = time;
    if (isMe) timeEl.style.textAlign = 'right';

    body.appendChild(bubble);
    body.appendChild(timeEl);
    row.appendChild(avDiv);
    row.appendChild(body);
    container.appendChild(row);
  });
  container.scrollTop = container.scrollHeight;
}

document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});

async function sendChatMessage() {
  if (!currentUser||!chatTargetUser) return;
  const inp = document.getElementById('chat-input');
  const content = inp.value.trim();
  if (!content) return;
  inp.value = '';
  const channelId = [currentUser.id, chatTargetUser.id].sort().join('_');
  const { error } = await sb.from('messages_colormatch').insert({
    channel_id:channelId,
    sender_id:currentUser.id,
    sender_username:currentUser.username,
    receiver_id:chatTargetUser.id,
    content
  });
  if (error) { toast('Gagal mengirim pesan.'); inp.value=content; }
}

// ══════════════════════════════════════
//  GAME FLOW
// ══════════════════════════════════════
function startGameFlow() {
  TC = {r:rc(), g:rc(), b:rc()};
  ['sr','sg','sb'].forEach(id => document.getElementById(id).value=128);
  updatePreview();
  arc.style.strokeDashoffset = 0;
  if (p1Raf) cancelAnimationFrame(p1Raf);
  goTo('s1');
  setTimeout(runMemorize, 120);
}

function runMemorize() {
  const {r,g,b} = TC;
  const lum = (0.299*r + 0.587*g + 0.114*b) / 255;
  const fg = lum>0.56?'#08080a':'#f2ede4';
  const fm = lum>0.56?'rgba(8,8,10,.42)':'rgba(242,237,228,.32)';
  const fl = document.getElementById('color-flood');
  fl.style.background = `rgb(${r},${g},${b})`;
  fl.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => fl.style.opacity='1'));
  ['rsec','rms','rlbl','p1lbl'].forEach(id => document.getElementById(id).style.color = id==='rsec'?fg:fm);
  document.getElementById('p1txt').style.color = lum>0.56?'rgba(8,8,10,.68)':'rgba(242,237,228,.72)';
  arc.style.stroke = fg;
  trk.style.stroke = lum>0.56?'rgba(8,8,10,.1)':'rgba(242,237,228,.07)';
  arc.style.strokeDashoffset = 0;
  const t0=performance.now(), dur=5000;
  function frame(now) {
    const el=now-t0, rem=Math.max(0,dur-el);
    document.getElementById('rsec').textContent = Math.floor(rem/1000);
    document.getElementById('rms').textContent  = '.'+String(Math.floor(rem%1000)).padStart(3,'0');
    arc.style.strokeDashoffset = CIRC*(el/dur);
    if (rem>0) { p1Raf=requestAnimationFrame(frame); }
    else { arc.style.strokeDashoffset=CIRC; setTimeout(enterMatch,320); }
  }
  p1Raf = requestAnimationFrame(frame);
}

function enterMatch() {
  goTo('s2');
  updatePreview();
  matchStart = performance.now();
  clearInterval(elInt);
  elInt = setInterval(() => {
    document.getElementById('elnum').textContent = ((performance.now()-matchStart)/1000).toFixed(2);
  }, 50);
}

function updatePreview() {
  const r=+document.getElementById('sr').value;
  const g=+document.getElementById('sg').value;
  const b=+document.getElementById('sb').value;
  document.getElementById('p2circ').style.background = `rgb(${r},${g},${b})`;
  document.getElementById('rv').textContent = r;
  document.getElementById('gv').textContent = g;
  document.getElementById('bv').textContent = b;
  document.getElementById('p2hex').textContent = toHex(r,g,b).toUpperCase();
}
['sr','sg','sb'].forEach(id => document.getElementById(id).addEventListener('input',updatePreview));

document.getElementById('gobtn').addEventListener('click', () => {
  clearInterval(elInt);
  const elapsed = (performance.now()-matchStart)/1000;
  const r=+document.getElementById('sr').value;
  const g=+document.getElementById('sg').value;
  const b=+document.getElementById('sb').value;
  showResults(r,g,b,elapsed);
});

async function showResults(mr,mg,mb,elapsed) {
  const {r:tr,g:tg,b:tb} = TC;
  const {ratio,d,raw,str} = calcScore(tr,tg,tb,mr,mg,mb);
  const pct = (ratio*100).toFixed(1);
  const v = verdict(raw);
  document.getElementById('cst').style.background = `rgb(${tr},${tg},${tb})`;
  document.getElementById('csy').style.background = `rgb(${mr},${mg},${mb})`;
  document.getElementById('csth').textContent = toHex(tr,tg,tb).toUpperCase();
  document.getElementById('csyh').textContent = toHex(mr,mg,mb).toUpperCase();
  document.getElementById('rttl').textContent = v.lab;
  document.getElementById('rttl').style.color  = v.col;
  document.getElementById('rsc').textContent   = str;
  document.getElementById('rtm').textContent   = elapsed.toFixed(2)+'s';
  document.getElementById('rds').textContent   = parseFloat(d).toFixed(0);
  document.getElementById('drr').textContent   = Math.abs(tr-mr);
  document.getElementById('drg').textContent   = Math.abs(tg-mg);
  document.getElementById('drb').textContent   = Math.abs(tb-mb);
  document.getElementById('bpct').textContent  = pct+'%';
  document.getElementById('bfill').style.width = '0%';
  document.querySelectorAll('.r-wrap .fa').forEach(el => {
    el.style.animation='none'; void el.offsetWidth; el.style.animation='';
  });
  goTo('s3');
  setTimeout(() => document.getElementById('bfill').style.width=pct+'%', 380);

  if (!isGuest && currentUser) {
    const scoreNum = parseFloat(str.replace(',','.'));
    const { data: existing } = await sb.from('scores_colormatch')
      .select('id,score_raw').eq('user_id',currentUser.id).maybeSingle();
    if (!existing) {
      const { error } = await sb.from('scores_colormatch').insert({
        user_id:currentUser.id, username:currentUser.username,
        score_raw:scoreNum, similarity_pct:parseFloat(pct),
        elapsed_seconds:parseFloat(elapsed.toFixed(2)),
        target_r:tr,target_g:tg,target_b:tb,
        answer_r:mr,answer_g:mg,answer_b:mb,
        avatar_url:currentUser.avatar_url||null
      });
      if (!error) toast('Skor tersimpan ke Rekor Dunia! 🏆');
      else toast('Gagal menyimpan skor.');
    } else if (scoreNum > existing.score_raw) {
      const { error } = await sb.from('scores_colormatch').update({
        score_raw:scoreNum, similarity_pct:parseFloat(pct),
        elapsed_seconds:parseFloat(elapsed.toFixed(2)),
        target_r:tr,target_g:tg,target_b:tb,
        answer_r:mr,answer_g:mg,answer_b:mb,
        avatar_url:currentUser.avatar_url||null,
        created_at:new Date().toISOString()
      }).eq('id',existing.id);
      if (!error) toast('Rekor baru! Skor diperbarui 🏆');
      else toast('Gagal memperbarui skor.');
    } else {
      toast('Skor tidak mengalahkan rekor terbaikmu.');
    }
    // Simpan ke history
    await sb.from('history_colormatch').insert({
      user_id:currentUser.id, username:currentUser.username,
      score_raw:scoreNum, similarity_pct:parseFloat(pct),
      elapsed_seconds:parseFloat(elapsed.toFixed(2)),
      target_r:tr,target_g:tg,target_b:tb,
      answer_r:mr,answer_g:mg,answer_b:mb
    });
  }
}

document.getElementById('play-again').addEventListener('click', () => {
  if (p1Raf) cancelAnimationFrame(p1Raf);
  document.getElementById('color-flood').style.opacity='0';
  startGameFlow();
});
document.getElementById('back-home-res').addEventListener('click', () => {
  if (p1Raf) cancelAnimationFrame(p1Raf);
  document.getElementById('color-flood').style.opacity='0';
  document.getElementById('game-dots').style.display='none';
  goTo('s0');
});

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
document.getElementById('btn-profile').style.display = 'none';
updatePreview();
checkStoredSession();

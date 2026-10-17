// Аккаунт и синхронизация прогресса между устройствами (Firebase: вход через Google + Firestore).
// Прогресс по-прежнему живёт в браузере и работает без входа и без сети; после входа он сжимается
// и сохраняется в документ progress/{uid}. При расхождении устройств прогресс объединяется:
// по каждому заданию берётся лучший результат, журналы и уроки складываются — ничего не теряется.
// Ключи ИИ хранятся отдельно и в облако не попадают.

const FB_CONFIG = {
  apiKey: 'AIzaSyBdGvC1z8mit65BTeXF3aBOG05ldN50pn0',
  authDomain: 'qa-trainer-b0cda.firebaseapp.com',
  projectId: 'qa-trainer-b0cda',
  storageBucket: 'qa-trainer-b0cda.firebasestorage.app',
  messagingSenderId: '865981081652',
  appId: '1:865981081652:web:74aa2b15f15de318690261'
};
const FB_SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const SYNC_FLAG = KEY + '-sync';                     // «на этом устройстве выполнен вход» — чтобы не грузить SDK зря
const DEVICE = (() => { try { let d = localStorage.getItem(KEY + '-device'); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem(KEY + '-device', d); } return d; } catch(e) { return 'x'; } })();
const LOCAL_ONLY = ['appBuild', 'appVersion', 'prevBuild', 'dataVersion'];   // свои у каждого устройства

const SYNC = {state: 'off', user: null, at: null, err: null};
let FB = null, pushTimer = null, unsub = null, lastPushed = 0;

// ───────── Сжатие ─────────
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pack(obj){
  const json = JSON.stringify(obj);
  if (!window.CompressionStream) return {raw: json};
  const buf = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return {z: b64(buf)};
}
async function unpack(d){
  if (d.raw) return JSON.parse(d.raw);
  return JSON.parse(await new Response(new Blob([unb64(d.z)]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}

// ───────── Объединение прогресса двух устройств ─────────
const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
const unionBy = (a = [], b = [], key) => { const m = new Map(); [...a, ...b].forEach(x => { const k = key(x); if (!m.has(k)) m.set(k, x); }); return [...m.values()]; };
function mergeState(local, remote){
  const newer = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote, older = newer === local ? remote : local;
  const out = {};
  new Set([...Object.keys(local), ...Object.keys(remote)]).forEach(k => {
    const n = newer[k], o = older[k];
    if (n === undefined) out[k] = o; else if (o === undefined || !isObj(n) || !isObj(o)) out[k] = n;
    else out[k] = {...o, ...n};                                     // по ключам: свежая сторона побеждает
  });
  // Результаты заданий: лучший балл, суммарные попытки
  out.results = {...(local.results || {})};
  Object.entries(remote.results || {}).forEach(([id, r]) => {
    const l = out.results[id];
    if (!l) out.results[id] = r;
    else { const best = (r.score || 0) > (l.score || 0) ? r : l; out.results[id] = {...best, xp: Math.max(l.xp || 0, r.xp || 0), attempts: Math.max(l.attempts || 0, r.attempts || 0), date: l.date > r.date ? l.date : r.date}; }
  });
  out.log = unionBy(local.log, remote.log, e => e.ts + '|' + e.id).sort((a, b) => a.ts - b.ts);
  out.learn = {...older.learn, ...newer.learn, done: {...(remote.learn?.done || {}), ...(local.learn?.done || {})}, ans: {...older.learn?.ans, ...newer.learn?.ans}, ai: {...older.learn?.ai, ...newer.learn?.ai}};
  out.cardLog = {...older.cardLog}; Object.entries(newer.cardLog || {}).forEach(([d, c]) => { const o = out.cardLog[d]; out.cardLog[d] = o ? {n: Math.max(o.n, c.n), ok: Math.max(o.ok, c.ok), new: Math.max(o.new || 0, c.new || 0)} : c; });
  out.cards = {...older.cards}; Object.entries(newer.cards || {}).forEach(([i, c]) => { const o = out.cards[i]; out.cards[i] = !o || (c.reps || 0) >= (o.reps || 0) ? c : o; });
  out.assess = unionBy(local.assess, remote.assess, a => a.date + '|' + a.total + '|' + a.mins).sort((a, b) => a.date < b.date ? -1 : 1);
  out.mocks = unionBy(local.mocks, remote.mocks, m => m.date + '|' + m.avg);
  out.interrupts = unionBy(local.interrupts, remote.interrupts, x => x.day + '|' + x.from + '|' + x.pick);
  out.mcards = unionBy(newer.mcards, older.mcards, m => m.id);
  out.gen = unionBy(local.gen, remote.gen, g => g.id);
  if (local.tree || remote.tree) out.tree = {got: {...(remote.tree?.got || {}), ...(local.tree?.got || {})}};
  LOCAL_ONLY.forEach(k => { if (k in local) out[k] = local[k]; else delete out[k]; });
  out.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
  return out;
}
// Сравнение без учёта порядка ключей и служебных полей устройства
const stable = x => Array.isArray(x) ? '[' + x.map(stable).join(',') + ']' : isObj(x) ? '{' + Object.keys(x).sort().filter(k => x[k] !== undefined).map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}' : JSON.stringify(x);
const strip_ = o => { const c = {...o}; ['updatedAt', ...LOCAL_ONLY].forEach(k => delete c[k]); return c; };
const sameProgress = (a, b) => stable(strip_(a)) === stable(strip_(b));
function upgradeRemote(r){ MIGRATIONS.filter(m => m.to > (r.dataVersion || 1)).sort((a, b) => a.to - b.to).forEach(m => { try { m.run(r); } catch(e) {} }); return Object.assign(def(), r); }

// ───────── Firebase ─────────
async function fb(){
  if (FB) return FB;
  const [app, auth, fs] = await Promise.all(['app', 'auth', 'firestore'].map(m => import(FB_SDK + `firebase-${m}.js`)));
  const a = app.initializeApp(FB_CONFIG);
  FB = {auth: auth.getAuth(a), A: auth, db: fs.initializeFirestore(a, {experimentalAutoDetectLongPolling: true}), F: fs};
  FB.A.onAuthStateChanged(FB.auth, onUser);
  return FB;
}
const docRef = () => FB.F.doc(FB.db, 'progress', SYNC.user.uid);
async function onUser(u){
  if (unsub) { unsub(); unsub = null; }
  if (!u) { SYNC.user = null; SYNC.state = 'off'; try { localStorage.removeItem(SYNC_FLAG); } catch(e) {} render(); return; }
  SYNC.user = {uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL};
  try { localStorage.setItem(SYNC_FLAG, '1'); } catch(e) {}
  await pull(true);
  // Изменения с других устройств приходят сами
  unsub = FB.F.onSnapshot(docRef(), s => { const d = s.data(); if (!s.metadata.hasPendingWrites && d && d.device !== DEVICE && d.updatedAt > lastPushed) applyRemote(d); }, () => {});
}
async function applyRemote(d){
  let remote; try { remote = upgradeRemote(await unpack(d)); } catch(e) { SYNC.state = 'error'; SYNC.err = 'Не удалось прочитать прогресс из облака'; render(); return false; }
  const merged = mergeState(S, remote), changed = !sameProgress(merged, S);
  if (changed) {
    snapshot('Перед объединением с облаком');
    S = merged; ensureState(); _saveLocal(); checkAdvancements(true);
    if (view !== 'task') render(); else document.getElementById('chips') && renderChips();
    toast('Прогресс с другого устройства загружен');
  }
  return !sameProgress(merged, remote);
}
async function pull(first){
  SYNC.state = 'sync'; SYNC.err = null; render();
  try {
    const s = await FB.F.getDoc(docRef());
    const needPush = s.exists() ? await applyRemote(s.data()) : true;
    if (needPush) await push(); else { SYNC.state = 'ok'; SYNC.at = Date.now(); }
  } catch(e) { SYNC.state = 'error'; SYNC.err = errText(e); }
  render();
}
async function push(){
  if (!SYNC.user) return;
  clearTimeout(pushTimer); pushTimer = null;
  SYNC.state = 'sync'; renderChips();
  try {
    const body = {...S}; LOCAL_ONLY.forEach(k => delete body[k]);
    let p = await pack(body);
    // Лимит документа ~1 МБ: если прогресс разросся — без истории чатов наставника и ИИ-ревью
    if ((p.z || p.raw).length > 950000) { ['tutor', 'aiReviews', 'coach', 'vacancies', 'elicitRun'].forEach(k => body[k] = {}); p = await pack(body); }
    if ((p.z || p.raw).length > 1000000) throw new Error('Прогресс слишком большой для облака — сделайте экспорт копии');
    lastPushed = S.updatedAt || Date.now();
    await FB.F.setDoc(docRef(), {...p, updatedAt: lastPushed, device: DEVICE, build: APP.build});
    SYNC.state = 'ok'; SYNC.at = Date.now(); SYNC.err = null;
  } catch(e) { SYNC.state = 'error'; SYNC.err = errText(e); }
  renderChips(); if (view === 'settings') render();
}
const errText = e => /offline|unavailable|network/i.test(e.code || e.message) ? 'Нет соединения — синхронизируем, когда появится интернет' : /permission/i.test(e.code || e.message) ? 'Нет доступа к облаку (проверьте вход)' : (e.message || String(e));
function schedulePush(){ if (!SYNC.user) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, 4000); }

async function signIn(){
  SYNC.state = 'sync'; SYNC.err = null; render();
  try { await fb(); await FB.A.signInWithPopup(FB.auth, new FB.A.GoogleAuthProvider()); }
  catch(e) {
    SYNC.state = 'off';
    SYNC.err = /popup-blocked/.test(e.code) ? 'Браузер заблокировал окно входа — разрешите всплывающие окна для этого сайта и повторите'
      : /popup-closed|cancelled/.test(e.code) ? null : /unauthorized-domain/.test(e.code) ? 'Этот адрес не добавлен в разрешённые домены Firebase' : errText(e);
    render();
  }
}
async function signOut(){
  if (!confirm('Выйти из аккаунта? Прогресс останется в этом браузере, а синхронизация с другими устройствами остановится.')) return;
  if (pushTimer) await push();
  await FB.A.signOut(FB.auth);
}

// ───────── Сохранение: локально сразу, в облако — через 4 секунды после последнего изменения ─────────
const _saveLocal = save;
save = function(){ S.updatedAt = Date.now(); _saveLocal(); schedulePush(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pushTimer) push(); if (document.visibilityState === 'visible' && SYNC.user && Date.now() - (SYNC.at || 0) > 60000) pull(); });
window.addEventListener('online', () => { if (SYNC.user) pull(); });

// ───────── Интерфейс ─────────
const CLOUD = {off: ['☁️', 'Войти, чтобы прогресс был на всех устройствах'], sync: ['🔄', 'Синхронизация…'], ok: ['✅', 'Прогресс сохранён в облаке'], error: ['⚠️', 'Ошибка синхронизации']};
function renderChips(){
  const c = document.getElementById('chips'); if (!c) return;
  c.querySelector('.cloud')?.remove();
  const [ic, t] = CLOUD[SYNC.state] || CLOUD.off;
  c.insertAdjacentHTML('afterbegin', `<span class="chip cloud clk" title="${esc(SYNC.err || t)}" onclick="go('settings')">${SYNC.user ? ic : '☁️ Войти'}</span>`);
}
AFTER_RENDER.push(renderChips);
function accountCard(){
  const U = SYNC.user, when = SYNC.at ? new Date(SYNC.at).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}) : null;
  if (!U) return `<div class="card"><h2>Аккаунт и синхронизация</h2>
    <p>Войдите через Google — прогресс будет сохраняться в облаке и будет одинаковым на всех устройствах, где вы вошли под этим аккаунтом.</p>
    <ul class="small"><li>Без входа всё работает как раньше — прогресс хранится только в этом браузере.</li><li>При первом входе прогресс из этого браузера переносится в аккаунт; если в аккаунте уже есть прогресс с другого устройства — они объединятся, ничего не потеряется.</li><li>Ключи ИИ в облако не попадают.</li></ul>
    <button class="btn" onclick="signIn()" ${SYNC.state === 'sync' ? 'disabled' : ''}>${SYNC.state === 'sync' ? 'Открываю вход…' : 'Войти через Google'}</button>${SYNC.err ? `<p class="err small">${esc(SYNC.err)}</p>` : ''}</div>`;
  return `<div class="card"><h2>Аккаунт и синхронизация</h2>
    <div class="row" style="gap:12px">${U.photo ? `<img src="${esc(U.photo)}" alt="" width="40" height="40" style="border-radius:50%" referrerpolicy="no-referrer">` : ''}<div><b>${esc(U.name || 'Без имени')}</b><div class="small muted">${esc(U.email || '')}</div></div></div>
    <p class="small">${SYNC.state === 'sync' ? '🔄 Синхронизация…' : SYNC.state === 'error' ? `<span class="err">⚠️ ${esc(SYNC.err)}</span>` : `✅ Прогресс сохранён в облаке${when ? ` в ${when}` : ''}. Изменения отправляются автоматически, а с других устройств подтягиваются сами.`}</p>
    <div class="row"><button class="btn ghost sm" onclick="pull()">Синхронизировать сейчас</button><button class="btn ghost sm" onclick="signOut()">Выйти</button></div></div>`;
}
VIEWS.settings = () => { const h = vSettings(); return h.replace('<h1>Настройки</h1>', '<h1>Настройки</h1>' + accountCard()); };
// Ненавязчивое приглашение на главном экране, пока не вошли
const _todaySync = VIEWS.today;
VIEWS.today = () => (!SYNC.user && !S.settings.syncHint && (S.log.length >= 3) ? `<div class="card note row" style="justify-content:space-between"><span>☁️ Занимаетесь с нескольких устройств? Войдите через Google — прогресс будет общим.</span><span><button class="btn sm" onclick="go('settings')">Войти</button><button class="btn sm ghost" onclick="S.settings.syncHint=1;save();render()">Не нужно</button></span></div>` : '') + _todaySync();

// Если на этом устройстве уже входили — поднимаем Firebase, сессия восстановится сама
try { if (localStorage.getItem(SYNC_FLAG) && location.protocol !== 'file:') { SYNC.state = 'sync'; fb().catch(e => { SYNC.state = 'error'; SYNC.err = 'Не удалось загрузить модуль входа (нет интернета?)'; renderChips(); }); } } catch(e) {}
render();

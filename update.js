// Система обновлений: прогресс переживает любые обновления.
// 1) Автокопия прогресса перед первым запуском новой версии, перед сбросом и импортом (хранятся последние 3).
// 2) Миграции формата данных по dataVersion — старый прогресс преобразуется, а не сбрасывается.
// 3) Проверка новой версии на сервере и обновление одной кнопкой; «Что нового» после обновления.
// 4) Запрос постоянного хранилища, чтобы браузер не удалил данные при нехватке места.

const BK_KEY = KEY + '-autobackup';
const readBackups = () => { try { return JSON.parse(localStorage.getItem(BK_KEY)) || []; } catch(e) { return []; } };
function snapshot(reason){
  let raw; try { raw = localStorage.getItem(KEY); } catch(e) { return false; }
  if (!raw) return false;
  // Копию пустого прогресса не делаем, чтобы она не вытеснила полезные
  try { const o = JSON.parse(raw); if (!((o.log || []).length || Object.keys(o.results || {}).length || Object.keys(o.learn?.done || {}).length)) return false; } catch(e) {}
  const list = readBackups().filter(b => b.data !== raw);
  list.unshift({at: Date.now(), reason, version: S.appVersion || 'до 1.3.0', data: raw});
  for (let n = 3; n > 0; n--) { try { localStorage.setItem(BK_KEY, JSON.stringify(list.slice(0, n))); return true; } catch(e) {} }
  return false;
}
function restoreBackup(i){
  const b = readBackups()[i]; if (!b) return;
  if (!confirm(`Восстановить прогресс из копии от ${new Date(b.at).toLocaleString('ru-RU')}? Текущий прогресс сначала будет сохранён в отдельную копию.`)) return;
  snapshot('Перед восстановлением из копии');
  try { S = Object.assign(def(), JSON.parse(b.data)); migrate(); save(); ensureState(); toast('Прогресс восстановлен'); render(); }
  catch(e) { toast('Не удалось прочитать копию'); }
}

// ───────── Миграции ─────────
// to — версия формата, до которой поднимает функция. Миграции идут по порядку и никогда не удаляют прогресс.
const MIGRATIONS = [
  {to: 2, run: s => {
    // 1.0–1.2: поля новых модулей могли отсутствовать — добавляем пустыми
    ['hunt', 'coll', 'logs', 'triage', 'auto'].forEach(k => s[k] = s[k] || {});
    s.learn = Object.assign({done:{}, ans:{}, ai:{}}, s.learn || {});
  }}
];
function migrate(){
  const from = S.dataVersion || 1;
  MIGRATIONS.filter(m => m.to > from).sort((a, b) => a.to - b.to).forEach(m => { try { m.run(S); S.dataVersion = m.to; } catch(e) { console.error('Миграция', m.to, e); } });
  S.dataVersion = Math.max(S.dataVersion || 1, APP.dataVersion);
}

// Запуск новой версии: копия → миграции → отметка версии
(function boot(){
  const hasProgress = S.log.length || Object.keys(S.results).length || Object.keys(S.learn?.done || {}).length;
  if (hasProgress && S.appBuild !== APP.build) snapshot(`Перед обновлением до ${APP.version}`);
  migrate();
  if (S.appBuild !== APP.build) {
    S.prevBuild = S.appBuild || (hasProgress ? 14 : APP.build);
    S.appBuild = APP.build; S.appVersion = APP.version; save();
  }
})();

// ───────── Проверка обновлений ─────────
let UPD = {latest: null, checking: false, at: null};
async function checkUpdate(manual){
  if (location.protocol === 'file:') { if (manual) toast('Проверка обновлений работает на опубликованном сайте'); return; }
  UPD.checking = true; if (manual) render();
  try {
    const t = await (await fetch('version.js?t=' + Date.now(), {cache: 'no-store'})).text();
    const build = +(t.match(/build:\s*(\d+)/) || [])[1], version = (t.match(/version:\s*'([^']+)'/) || [])[1];
    UPD.at = Date.now();
    if (build > APP.build) { UPD.latest = {build, version}; showUpdateBanner(); }
    else if (manual) toast('У вас последняя версия ' + APP.version);
  } catch(e) { if (manual) toast('Не удалось проверить обновления: нет соединения'); }
  UPD.checking = false; if (manual) render();
}
function showUpdateBanner(){
  if (document.getElementById('updbar') || !UPD.latest) return;
  const el = document.createElement('div'); el.id = 'updbar'; el.className = 'updbar noprint';
  el.innerHTML = `<span>🔄 Вышла версия <b>${esc(UPD.latest.version)}</b>. Ваш прогресс сохранится.</span><button class="btn sm" onclick="applyUpdate()">Обновить</button><button class="btn sm ghost" onclick="this.parentNode.remove()">Позже</button>`;
  document.body.appendChild(el);
}
function applyUpdate(){
  save(); snapshot(`Перед обновлением до ${UPD.latest?.version || 'новой версии'}`);
  location.replace(location.pathname + '?v=' + (UPD.latest?.build || Date.now()) + location.hash);
}

// ───────── «Что нового» ─────────
function changelogHtml(sinceBuild){
  return APP.changelog.filter(c => c.build > (sinceBuild || 0)).map(c => `<h3>${esc(c.version)} <span class="small muted">· ${c.date}</span></h3><ul>${c.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('');
}
function showWhatsNew(sinceBuild, title){
  const html = changelogHtml(sinceBuild); if (!html) return;
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'wnov';
  ov.innerHTML = `<div class="modal wn"><h2>${title || `🎉 Обновление до версии ${esc(APP.version)}`}</h2>${sinceBuild ? '<p class="good small">✓ Ваш прогресс сохранён. Перед обновлением сделана резервная копия — её можно восстановить в «Настройках».</p>' : ''}${html}<button class="btn" onclick="document.getElementById('wnov').remove()">Отлично</button></div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
}

// ───────── Постоянное хранилище ─────────
let PERSIST = null;
async function askPersist(){
  try { if (navigator.storage?.persist) { PERSIST = await navigator.storage.persisted() || await navigator.storage.persist(); } } catch(e) {}
}

// ───────── Настройки и запуск после загрузки всех модулей ─────────
window.addEventListener('load', () => {
  // Сброс и импорт тоже сначала делают копию
  const _imp = importBackup; importBackup = f => { snapshot('Перед импортом резервной копии'); _imp(f); };
  const _vs = vSettings;
  vSettings = function(){
    const B = readBackups();
    return _vs().replace('<div class="card"><h2>Данные</h2>', `<div class="card"><h2>Обновления и сохранность прогресса</h2>
    <p>Версия <b>${esc(APP.version)}</b> (сборка ${APP.build}). ${UPD.latest ? `<span class="good">Доступна ${esc(UPD.latest.version)}.</span> <button class="btn sm" onclick="applyUpdate()">Обновить</button>` : ''}</p>
    <ul class="small"><li>Прогресс хранится в этом браузере и <b>не сбрасывается</b> при обновлениях: перед первым запуском новой версии тренажёр сам сохраняет копию.</li>
    <li>Хранилище браузера: ${PERSIST === true ? '<span class="good">постоянное — браузер не удалит данные при нехватке места</span>' : PERSIST === false ? 'обычное — браузер может очистить его при нехватке места; делайте экспорт копии' : 'проверяется…'}</li>
    <li>Для переноса на другое устройство используйте экспорт и импорт ниже.</li></ul>
    <div class="row"><button class="btn ghost sm" onclick="checkUpdate(true)" ${UPD.checking ? 'disabled' : ''}>${UPD.checking ? 'Проверяю…' : 'Проверить обновления'}</button><button class="btn ghost sm" onclick="showWhatsNew(0,'История версий')">История версий</button></div>
    <h3>Автоматические копии</h3>${B.length ? B.map((b, i) => `<div class="sbrow small"><span>${new Date(b.at).toLocaleString('ru-RU')} · ${esc(b.reason)} · ${(b.data.length / 1024).toFixed(1).replace('.', ',')} КБ</span><span><button class="btn sm ghost" onclick="restoreBackup(${i})">Восстановить</button><button class="btn sm ghost" onclick="downloadFile('qa-trainer-autobackup-${i}.json', readBackups()[${i}].data)">Скачать</button></span></div>`).join('') : '<p class="muted small">Пока нет — копия появится перед первым обновлением, сбросом или импортом.</p>'}</div>
    <div class="card"><h2>Данные</h2>`);
  };
  // Кнопка «Сбросить» в «Прогрессе» — тоже через копию
  const _vp = VIEWS.progress;
  VIEWS.progress = () => _vp().replace("if(confirm('Сбросить весь прогресс?')){S=def();save();render()}", "if(confirm('Сбросить весь прогресс? Копия сохранится в «Настройках» → «Автоматические копии».')){snapshot('Перед сбросом прогресса');S=def();S.appBuild=APP.build;S.appVersion=APP.version;S.dataVersion=APP.dataVersion;save();ensureState();render()}");
  if (window.LOAD_ERR) toast('Сохранённый прогресс не прочитался — он отложен в отдельную копию, ничего не удалено');
  if (S.prevBuild && S.prevBuild < APP.build) { const p = S.prevBuild; delete S.prevBuild; save(); setTimeout(() => showWhatsNew(p), 600); }
  else if (S.prevBuild) { delete S.prevBuild; save(); }
  askPersist().then(() => { if (view === 'settings') render(); });
  render();
  setTimeout(() => checkUpdate(), 3000);
  setInterval(() => checkUpdate(), 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (!UPD.at || Date.now() - UPD.at > 5 * 60 * 1000)) checkUpdate(); });
});

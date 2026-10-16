// Песочница логов (поиск по сервисам, уровням и request-id, закрепление строк) и баг-трекер (разбор входящих),
// а также карточка ретеста на экране рабочего дня.

S.logs = S.logs || {}; S.triage = S.triage || {};
const _ensureStateQ = ensureState;
ensureState = function(){ _ensureStateQ(); S.logs = S.logs || {}; S.triage = S.triage || {}; };

// ───────── Логи ─────────
const NOISE = {
  'api-gateway': n => [`GET /api/v1/products?page=${n % 7 + 1} → 200 (${40 + n % 90} ms)`, `POST /api/v1/cart → 200 (${30 + n % 50} ms)`, `GET /api/v1/orders → 200 (${55 + n % 70} ms)`, `GET /api/v1/profile → 200 (${25 + n % 30} ms)`],
  'order-service': n => [`order ${5400 + n} status=paid`, `validate items ok (${n % 4 + 1})`, `order ${5400 + n} created, total=${(n % 9 + 1) * 990}`],
  'inventory-service': n => [`reserve ok sku=SKU-${1000 + n} qty=${n % 3 + 1}`, `stock sync batch=${n} ok (${120 + n % 40} items)`],
  'payment-service': n => [`payment pay_${(n * 7919).toString(36)} status=success`, `3DS challenge started payment=pay_${(n * 104729).toString(36)}`],
  'notification-service': n => [`push sent user=${3000 + n}`, `email sent order=${88000 + n} to=u***@mail.ru`],
  'bank-gateway': n => [`charge ch_${(n * 31).toString(36)} SUCCESS (${300 + n % 900} ms)`, `refund rf_${(n * 17).toString(36)} SUCCESS`]
};
const tSec = t => { const [h, m, s] = t.split(':'); return +h * 3600 + +m * 60 + parseFloat(s); };
const tFmt = x => `${pad(Math.floor(x / 3600))}:${pad(Math.floor(x / 60) % 60)}:${(x % 60).toFixed(3).padStart(6, '0')}`;
function buildLogs(t){
  if (t._logs) return t._logs;
  const svcs = [...new Set(t.key.map(k => k[1]))], [a, b] = t.window.map(tSec), n = 70;
  let h = t.seed * 2654435761 >>> 0; const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  const L = t.key.map(k => ({t: k[0], svc: k[1], lvl: k[2], req: k[3], msg: k[4], root: !!k[5]}));
  for (let i = 0; i < n; i++) {
    const svc = svcs[Math.floor(rnd() * svcs.length)], T = NOISE[svc] ? NOISE[svc](i + t.seed) : [`heartbeat ok`];
    L.push({t: tFmt(a + rnd() * (b - a)), svc, lvl: rnd() < 0.06 ? 'WARN' : 'INFO', req: Math.floor(rnd() * 65535).toString(16).padStart(4, '0'), msg: T[Math.floor(rnd() * T.length)]});
  }
  L.sort((x, y) => x.t < y.t ? -1 : 1); L.forEach((l, i) => l.i = i);
  return t._logs = L;
}
const LG_ = id => (S.logs[id] = S.logs[id] || {q:'', svc:'', lvl:'', req:'', pins:[], ans:{req:'', svc:'', text:''}, checks:[]});
function logFilter(id){
  const t = ITEMS[id], F = LG_(id), q = F.q.toLowerCase();
  return buildLogs(t).filter(l => (!F.svc || l.svc === F.svc) && (!F.lvl || l.lvl === F.lvl) && (!F.req || l.req === F.req) && (!q || (l.msg + ' ' + l.svc + ' ' + l.req).toLowerCase().includes(q)));
}
function logsTableHtml(id){
  const F = LG_(id), L = logFilter(id);
  return `<p class="small muted">Найдено строк: ${L.length}${F.req ? ` · фильтр по request-id <code>${esc(F.req)}</code> <a href="#" onclick="LG_('${id}').req='';save();drawLogs('${id}');return false">снять</a>` : ''}</p>
  <div class="logs"><table class="dt"><tr><th>📌</th><th>Время</th><th>Сервис</th><th>Уровень</th><th>req</th><th>Сообщение</th></tr>
  ${L.map(l => `<tr class="${F.pins.includes(l.i) ? 'pinned' : ''}"><td><button class="pin" title="Закрепить для баг-репорта" onclick="logPin('${id}',${l.i})">${F.pins.includes(l.i) ? '📌' : '·'}</button></td><td class="mono">${l.t}</td><td>${esc(l.svc)}</td><td class="lv-${l.lvl}">${l.lvl}</td><td>${l.req === '—' ? '—' : `<a href="#" class="mono" onclick="LG_('${id}').req='${l.req}';save();drawLogs('${id}');return false">${l.req}</a>`}</td><td class="mono">${esc(l.msg)}</td></tr>`).join('')}</table></div>`;
}
function drawLogs(id){ const el = document.getElementById('logtbl'); if (el) el.innerHTML = logsTableHtml(id); const p = document.getElementById('logpins'); if (p) p.innerHTML = pinsHtml(id); }
function logPin(id, i){ const F = LG_(id); F.pins = F.pins.includes(i) ? F.pins.filter(x => x !== i) : [...F.pins, i]; save(); drawLogs(id); }
function pinsHtml(id){ const F = LG_(id), L = buildLogs(ITEMS[id]); return F.pins.length ? F.pins.slice().sort((a,b)=>a-b).map(i => `<div class="cline ${L[i].lvl === 'ERROR' ? 'error' : L[i].lvl === 'WARN' ? 'warn' : ''}">${L[i].t} [${L[i].svc}] ${L[i].lvl} [req=${L[i].req}] ${esc(L[i].msg)}</div>`).join('') : '<p class="muted small">Нажмите «·» у строки, чтобы закрепить её.</p>'; }
function tLogs(it){
  const F = LG_(it.id), L = buildLogs(it), svcs = [...new Set(L.map(l => l.svc))], done = F.score != null;
  const inp = (k, ph) => `<input class="sbi" placeholder="${ph}" value="${esc(F[k])}" oninput="LG_('${it.id}').${k}=this.value;save();drawLogs('${it.id}')">`;
  return `<div class="card"><h3>Ситуация</h3><p>${esc(it.scenario)}</p><h3>Задание</h3><p>${esc(it.question)}</p></div>
  <div class="card"><h3>🔎 Логи · Kibana стенда</h3>
  <div class="logbar">${inp('q', 'Поиск по тексту: order, 1532, ERROR…')}
  <select onchange="LG_('${it.id}').svc=this.value;save();drawLogs('${it.id}')"><option value="">Все сервисы</option>${svcs.map(s => `<option ${F.svc===s?'selected':''}>${s}</option>`).join('')}</select>
  <select onchange="LG_('${it.id}').lvl=this.value;save();drawLogs('${it.id}')"><option value="">Все уровни</option>${['ERROR','WARN','INFO'].map(s => `<option ${F.lvl===s?'selected':''}>${s}</option>`).join('')}</select>
  ${inp('req', 'request-id')}</div>
  <div id="logtbl">${logsTableHtml(it.id)}</div></div>
  <div class="card"><h3>📌 Строки для баг-репорта</h3><div id="logpins">${pinsHtml(it.id)}</div></div>
  <div class="card"><h3>Вывод</h3>
  <div class="split"><div><label>request-id проблемного запроса</label><input class="sbi mono" ${done?'disabled':''} value="${esc(F.ans.req)}" oninput="LG_('${it.id}').ans.req=this.value.trim();save()"></div>
  <div><label>Сервис, в котором первопричина</label><select ${done?'disabled':''} onchange="LG_('${it.id}').ans.svc=this.value;save()"><option value="">— выберите —</option>${svcs.map(s => `<option ${F.ans.svc===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
  <label>Что произошло, почему и что делать дальше</label><textarea rows="6" ${done?'disabled':''} oninput="LG_('${it.id}').ans.text=this.value;save()" placeholder="Последовательность событий, первопричина, влияние на пользователя, что ещё не так в поведении системы, следующие шаги">${esc(F.ans.text)}</textarea>
  ${done ? logResultHtml(it) : `<div class="row">${AI.enabled ? `<button class="btn" onclick="checkLogs('${it.id}',true)">Проверить с ИИ</button><button class="btn ghost" onclick="checkLogs('${it.id}')">Самопроверка</button>` : `<button class="btn" onclick="checkLogs('${it.id}')">Проверить</button>`}</div>`}
  ${!done && F.self ? `<h3>Самопроверка описания</h3><p class="small muted">Отметьте, что есть в вашем описании.</p>${it.checklist.map((c,i) => `<label class="chk"><input type="checkbox" ${F.checks[i]?'checked':''} onchange="LG_('${it.id}').checks[${i}]=this.checked;save()"> ${esc(c)}</label>`).join('')}<button class="btn" onclick="finishLogs('${it.id}')">Засчитать</button>` : ''}</div>
  ${aiBox(it.id)}`;
}
async function checkLogs(id, ai){
  const it = ITEMS[id], F = LG_(id);
  if (!F.ans.req || !F.ans.svc || F.ans.text.trim().length < 30) { toast('Укажите request-id, сервис и опишите вывод'); return; }
  if (ai) { const r = await runReview(id, {title: it.title, task: it.question, context: it.scenario, reference: it.reference, checklist: it.checklist}, F.ans.text); if (r) { F.checks = r.checklist; finishLogs(id); } return; }
  F.self = true; save(); render();
}
function finishLogs(id){
  const it = ITEMS[id], F = LG_(id), L = buildLogs(it);
  const okReq = F.ans.req === it.answer.req, okSvc = F.ans.svc === it.answer.svc, okPin = F.pins.some(i => L[i].root);
  const desc = F.checks.filter(Boolean).length / it.checklist.length;
  F.score = Math.round((0.25 * okReq + 0.25 * okSvc + 0.2 * okPin + 0.3 * desc) * 100); F.res = {okReq, okSvc, okPin};
  save(); render();
}
function logResultHtml(it){
  const F = LG_(it.id), R = F.res, L = buildLogs(it), root = L.find(l => l.root);
  const m = (ok, t) => `<div class="chk ${ok ? 'good' : 'err'}">${ok ? '✓' : '✗'} ${t}</div>`;
  return `<div class="card ref"><h3>Итог: ${F.score}%</h3>
  ${m(R.okReq, `request-id: <code>${it.answer.req}</code>`)}${m(R.okSvc, `первопричина в сервисе ${it.answer.svc}`)}${m(R.okPin, `закреплена ключевая строка: <span class="mono small">${esc(root.t + ' ' + root.msg)}</span>`)}
  <p class="small">Описание: ${F.checks.filter(Boolean).length} из ${it.checklist.length} пунктов.</p><ul class="small">${it.checklist.map((c,i) => `<li class="${F.checks[i] ? 'good' : 'muted'}">${esc(c)}</li>`).join('')}</ul>
  <p><b>Разбор:</b> ${esc(it.reference)}</p>
  <div class="row"><button class="btn" onclick="complete('${it.id}',${F.score / 100},{missed:${esc(JSON.stringify(it.checklist.filter((_,i)=>!F.checks[i])))}});go(lastList)">Засчитать (${F.score}%)</button><button class="btn ghost" onclick="delete S.logs['${it.id}'];delete AIR['${it.id}'];save();render()">Заново</button></div></div>`;
}

// ───────── Баг-трекер ─────────
const ACT_RU = {accept:'Принять в работу', dup:'Дубликат', reject:'Не баг (отклонить)', info:'Запросить данные'};
const TR_ = id => (S.triage[id] = S.triage[id] || {d:{}});
function tTriage(it){
  const T = TR_(it.id), done = T.score != null;
  const sel = (bid, k, opts, val) => `<select ${done?'disabled':''} onchange="TR_('${it.id}').d['${bid}']=Object.assign(TR_('${it.id}').d['${bid}']||{},{${k}:this.value});save();render()"><option value="">${k === 'act' ? '— решение —' : k === 'sev' ? 'Severity' : k === 'prio' ? 'Priority' : 'Оригинал'}</option>${opts.map(o => `<option value="${o[0]}" ${val===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>`;
  return `<div class="card"><h3>Ситуация</h3><p>${esc(it.scenario)}</p><h3>Выдержка из требований</h3><div class="txt">${it.reqs}</div>
  <p class="small muted">Для каждого бага: принять (с severity и priority), отметить дубликат (указать оригинал), отклонить как не-баг (с объяснением по требованиям) или запросить данные (написать, каких именно).</p></div>
  <div class="card"><h3>🗂 Входящие (${it.items.length})</h3>
  ${it.items.map(b => { const d = T.d[b.id] || {}, r = done ? triageCheck(b, d) : null;
    return `<div class="rep triage"><div class="row" style="justify-content:space-between"><b><span class="mono">${b.id}</span> ${esc(b.title)}</b><span class="tag">${esc(b.from)}</span></div>
    <p class="small">${esc(b.body)}</p>
    <div class="row">${sel(b.id, 'act', Object.entries(ACT_RU), d.act)}
    ${d.act === 'accept' ? sel(b.id, 'sev', REP_SEV.map(s => [s, s]), d.sev) + sel(b.id, 'prio', ['High','Medium','Low'].map(s => [s, s]), d.prio) : ''}
    ${d.act === 'dup' ? sel(b.id, 'dup', it.items.filter(x => x.id !== b.id).map(x => [x.id, x.id]), d.dup) : ''}</div>
    ${d.act === 'reject' || d.act === 'info' ? `<textarea rows="2" ${done?'disabled':''} placeholder="${d.act === 'reject' ? 'Почему это не баг (со ссылкой на требование)' : 'Какие данные нужны от автора'}" oninput="(TR_('${it.id}').d['${b.id}']=TR_('${it.id}').d['${b.id}']||{}).note=this.value;save()">${esc(d.note || '')}</textarea>` : ''}
    ${r ? `<div class="small ${r.score >= 0.99 ? 'good' : r.score > 0 ? 'warn' : 'err'}">${r.score >= 0.99 ? '✓' : '✗'} Ожидалось: <b>${ACT_RU[b.act]}</b>${b.act === 'accept' ? ` · ${b.sev.join('/')} · ${b.prio.join('/')}` : b.act === 'dup' ? ` → ${b.dup}` : ''}. ${esc(b.why)}</div>` : ''}</div>`; }).join('')}</div>
  ${done ? `<div class="card ref"><h3>Итог разбора: ${T.score}%</h3><div class="row"><button class="btn" onclick="complete('${it.id}',${T.score / 100},{missed:${esc(JSON.stringify(it.items.filter(b => triageCheck(b, T.d[b.id] || {}).score < 0.99).map(b => b.id + ': ожидалось «' + ACT_RU[b.act] + '»')))}});go(lastList)">Засчитать (${T.score}%)</button><button class="btn ghost" onclick="delete S.triage['${it.id}'];save();render()">Заново</button></div></div>`
  : `<div class="card"><button class="btn" onclick="finishTriage('${it.id}')">Завершить разбор</button></div>`}`;
}
function triageCheck(b, d){
  if (d.act !== b.act) return {score: 0};
  if (b.act === 'accept') return {score: 0.6 + (b.sev.includes(d.sev) ? 0.2 : 0) + (b.prio.includes(d.prio) ? 0.2 : 0)};
  if (b.act === 'dup') return {score: d.dup === b.dup ? 1 : 0.6};
  return {score: (d.note || '').trim().length >= 10 ? 1 : 0.6};
}
function finishTriage(id){
  const it = ITEMS[id], T = TR_(id);
  if (it.items.some(b => !T.d[b.id]?.act)) { toast('Примите решение по каждому багу'); return; }
  T.score = Math.round(it.items.reduce((a, b) => a + triageCheck(b, T.d[b.id]).score, 0) / it.items.length * 100);
  save(); render();
}

Object.assign(TASK_VIEWS, {logs: it => tLogs(it), triage: it => tTriage(it)});

// ───────── Ретест на экране рабочего дня ─────────
function retestDayBanner(){
  const ready = [...BUGHUNT, ...APIHUNT].filter(it => rtReady(it));
  if (!ready.length) return '';
  return `<div class="card note"><b>🔁 Разработчики выкатили исправления ваших багов</b> — сборка 1.1 на стенде. Проверьте исправления и проведите регресс:
  ${ready.map(it => `<div class="row" style="justify-content:space-between"><span>${esc(it.title)} · тикетов: ${rtTickets(it).length}</span><button class="btn sm" onclick="RTV['${it.id}']=true;openTask('${it.id}')">Начать ретест</button></div>`).join('')}</div>`;
}
const _todayQ = VIEWS.today;
VIEWS.today = () => retestDayBanner() + _todayQ();

// Дерево навыков в стиле достижений Minecraft: дорожная карта обучения от первого урока до Senior.
// Узел получен, когда выполнены все его условия; доступен, когда получены все родители.
// task — обычный навык (квадратная рамка), goal — веха (круглая), challenge — испытание (золотая звезда).

S.tree = S.tree || null;

const rL = id => ({label: `Урок «${lessonById(id).title}»`, ok: () => !!S.learn.done[id], go: `openLesson('${id}')`});
const rT = (id, min = 0.7) => ({label: `${KIND_LABEL[ITEMS[id].kind]} «${ITEMS[id].title}» — от ${Math.round(min * 100)}%`, ok: () => best(id) >= min, go: `openTask('${id}')`});
const rN = (label, ids, n, min, go) => ({label, ok: () => ids.filter(i => best(i) >= min).length >= n, prog: () => `${Math.min(n, ids.filter(i => best(i) >= min).length)}/${n}`, go: go || `openTask('${ids.find(i => best(i) < min) || ids[0]}')`});
const rK = (label, kind, n, min, go) => ({label, ok: () => kindScores(kind).filter(s => s >= min).length >= n, prog: () => `${Math.min(n, kindScores(kind).filter(s => s >= min).length)}/${n}`, go});
const rF = (label, fn, go, prog) => ({label, ok: fn, go, prog});
const ids = (kindOrList) => Array.isArray(kindOrList) ? kindOrList.map(x => x.id) : Object.values(ITEMS).filter(i => i.kind === kindOrList).map(i => i.id);
const GL = ['Стажёр', 'Junior', 'Middle', 'Senior'];
const gradeAtLeast = g => GL.indexOf(matrixGrade()) >= GL.indexOf(g);

const TREE = [
 {id:'start', icon:'🐣', title:'Добро пожаловать в QA', c:0, r:4, type:'goal', parents:[],
  desc:'Первый шаг: узнать, чем занимается тестировщик и как устроена его работа.', reqs:[rL('l1-1')]},
 {id:'theory', icon:'📖', title:'Теория тестирования', c:1, r:4, parents:['start'],
  desc:'Принципы, виды и уровни тестирования, место QA в команде.', reqs:[rL('l1-2'), rL('l1-3'), rT('quiz-base')]},
 {id:'reqs', icon:'📜', title:'Требования', c:2, r:0, parents:['theory'],
  desc:'Читать требования как тестировщик: находить неоднозначности и пропуски.', reqs:[rL('l2-1'), rL('l2-2'), rT('case-ta-2')]},
 {id:'testreq', icon:'🔎', title:'Тестирование требований', c:3, r:0, parents:['reqs'],
  desc:'Ловить дефекты ещё до кода и уточнять правила у аналитика и PO.', reqs:[rT('case-ta-1'), rK('Созвон по уточнению требований — от 70%', 'elicit', 1, 0.7, `openTask('el-1')`)]},
 {id:'td', icon:'📐', title:'Тест-дизайн', c:2, r:1, parents:['theory'],
  desc:'Классы эквивалентности и граничные значения — главные техники тестировщика.', reqs:[rL('l3-1'), rT('case-td-1'), rT('quiz-td')]},
 {id:'tdpro', icon:'🧮', title:'Продвинутый тест-дизайн', c:3, r:1, parents:['td'],
  desc:'Таблицы решений, переходы состояний, pairwise.', reqs:[rL('l3-2'), rL('l3-3'), rN('2 из 3 кейсов: таблица решений, состояния, pairwise — от 75%', ['case-td-2', 'case-td-3', 'case-td-4'], 2, 0.75)]},
 {id:'docs', icon:'📝', title:'Тестовая документация', c:2, r:2, parents:['theory'],
  desc:'Чек-листы и тест-кейсы, понятные любому в команде.', reqs:[rL('l4-1'), rT('case-doc-1')]},
 {id:'tcases', icon:'🗒', title:'Тест-кейсы', c:3, r:2, parents:['docs'],
  desc:'Атомарные кейсы с конкретными данными и проверяемым результатом; ревью чужих кейсов.', reqs:[rT('case-doc-2'), rT('case-doc-3')]},
 {id:'testplan', icon:'🗺', title:'Тест-план', c:4, r:2, parents:['tcases'],
  desc:'Планировать тестирование и регресс, когда времени меньше, чем тестов.', reqs:[rL('l4-2'), rT('case-doc-4'), rT('case-rel-1')]},
 {id:'bugs', icon:'🐞', title:'Баг-репорты', c:2, r:3, parents:['theory'],
  desc:'Описывать дефекты так, чтобы их воспроизвёл любой разработчик.', reqs:[rL('l5-1'), rT('case-bug-1'), rT('case-bug-2')]},
 {id:'hunter', icon:'🏹', title:'Охотник за багами', c:3, r:3, parents:['td', 'bugs', 'web'],
  desc:'Исследовательское тестирование на стендах с настоящими багами.', reqs:[rL('l3-4'), rK('2 UI-стенда — от 60%', 'hunt', 2, 0.6, `go('library');filter='hunt';render()`)]},
 {id:'retest', icon:'🔁', title:'Ретест и регресс', c:4, r:3, parents:['hunter'],
  desc:'Проверять исправления, переоткрывать недоделанное и ловить регрессии.', reqs:[rK('Ретест сборки 1.1 — от 70% (появится на следующий день после сдачи стенда)', 'retest', 1, 0.7, `go('library');filter='hunt';render()`)]},
 {id:'master', icon:'🗡', title:'Мастер стендов', c:4, r:4, parents:['hunter'], type:'challenge',
  desc:'Найти почти всё на всех пяти UI-стендах.', reqs:[rN('Все 5 UI-стендов — от 75%', ids(BUGHUNT), 5, 0.75, `go('library');filter='hunt';render()`)]},
 {id:'triage', icon:'🗂', title:'Разбор баг-трекера', c:3, r:4, parents:['bugs'],
  desc:'Severity и priority, дубликаты, не-баги и запрос данных.', reqs:[rL('l5-2'), rT('case-bug-3'), rT('triage-1', 0.75)]},
 {id:'web', icon:'🌐', title:'Веб и DevTools', c:2, r:5, parents:['theory'],
  desc:'Клиент-сервер, HTTP и DevTools: Network, Console, Application.', reqs:[rL('l6-1'), rL('l6-2'), rT('quiz-web'), rT('case-web-1')]},
 {id:'api', icon:'🔌', title:'Тестирование API', c:3, r:5, parents:['web'],
  desc:'Коды ответов, валидация и авторизация — проверка API в клиенте.', reqs:[rL('l7-1'), rL('l7-2'), rT('quiz-http'), rT('api-users', 0.6)]},
 {id:'apipro', icon:'🛰', title:'API-тестировщик', c:4, r:5, parents:['api'],
  desc:'Права доступа, переходы статусов, безопасность токенов.', reqs:[rN('Все 3 API-стенда — от 70%', ids(APIHUNT), 3, 0.7, `go('library');filter='api';render()`), rT('case-api-1')]},
 {id:'auto', icon:'🤖', title:'Автотесты API', c:5, r:5, parents:['apipro'],
  desc:'Коллекции с тестами, которые ловят баги и не дают ложных падений.', reqs:[rL('l10-1'), rN('2 коллекции автотестов — от 70%', ids(AUTOTASKS), 2, 0.7)]},
 {id:'automator', icon:'⚙️', title:'Автоматизатор', c:6, r:5, parents:['auto'], type:'challenge',
  desc:'Автоматизация на уровне Senior: стратегия, стабильность, полное покрытие.', reqs:[rN('Все 3 коллекции — от 90%', ids(AUTOTASKS), 3, 0.9), rT('case-auto-1', 0.85), rT('case-auto-2', 0.75)]},
 {id:'perfsec', icon:'🛡', title:'Нагрузка и безопасность', c:5, r:6, parents:['apipro'],
  desc:'Планировать нагрузочное тестирование и делать базовые проверки безопасности.', reqs:[rL('l10-2'), rL('l10-3'), rT('case-perf-1'), rT('case-sec-1'), rT('api-auth', 0.7)]},
 {id:'sql', icon:'🗄', title:'SQL для тестировщика', c:3, r:6, parents:['web'],
  desc:'Проверять данные в базе: выборки, JOIN, группировки.', reqs:[rL('l8-1'), rL('l8-2'), rN('3 из 4 SQL-задач 1–4 — от 80%', ['sql-1', 'sql-2', 'sql-3', 'sql-4'], 3, 0.8)]},
 {id:'sqlpro', icon:'🕵', title:'SQL-детектив', c:4, r:6, parents:['sql'],
  desc:'Находить в данных дубли, «висячие» записи, двойные списания и flaky-тесты.', reqs:[rL('l8-3'), rN('5 из 9 SQL-задач 6–15 — от 80%', ['sql-6', 'sql-7', 'sql-8', 'sql-9', 'sql-11', 'sql-12', 'sql-13', 'sql-14', 'sql-15'], 5, 0.8)]},
 {id:'logs', icon:'📜', title:'Логи и инциденты', c:5, r:7, parents:['sqlpro', 'api'],
  desc:'Проследить запрос по request-id через сервисы и найти первопричину.', reqs:[rN('2 задачи по логам — от 70%', ids(LOGTASKS), 2, 0.7), rT('case-log-1')]},
 {id:'firefighter', icon:'🧯', title:'Пожарный', c:6, r:7, parents:['logs'], type:'challenge',
  desc:'Разобрать прод-инцидент с двойным списанием и предложить меры.', reqs:[rT('logs-3', 0.85), rT('case-log-2', 0.85)]},
 {id:'mobile', icon:'📱', title:'Мобильное тестирование', c:3, r:8, parents:['web'],
  desc:'Прерывания, сеть, разрешения, push, выбор устройств.', reqs:[rL('l9-1'), rL('l9-2'), rT('quiz-mob', 0.75), rT('case-mob-1')]},
 {id:'project', icon:'🛒', title:'Проект «Новый чекаут»', c:5, r:2, parents:['testplan', 'retest'], type:'goal',
  desc:'Провести тестирование фичи от анализа требований до решения о релизе.', reqs:[rF('Все 10 этапов проекта — от 70%', () => PROJECT.stages.every(s => best(s.id) >= 0.7), `go('project')`, () => `${PROJECT.stages.filter(s => best(s.id) >= 0.7).length}/10`)]},
 {id:'junior', icon:'🥉', title:'Junior QA', c:5, r:0, parents:['testreq', 'tdpro'], type:'goal',
  desc:'Грейд Junior по матрице компетенций: 80% навыков уровня подтверждены результатами.', reqs:[rF('Грейд по матрице компетенций — Junior', () => gradeAtLeast('Junior'), `go('progress')`)]},
 {id:'interview', icon:'🎤', title:'Готов к собеседованию', c:6, r:0, parents:['junior'],
  desc:'Уверенно отвечать на вопросы интервью и разбирать вакансии.', reqs:[rF('Пробное собеседование со средним от 7/10', () => S.mocks.some(m => m.avg >= 7), `go('career')`), rN('10 письменных вопросов собеседования', INTERVIEW.map((_, i) => 'iv-' + i), 10, 0.4, `go('interview')`)]},
 {id:'release', icon:'🚀', title:'Хранитель релиза', c:6, r:3, parents:['project', 'triage'],
  desc:'Давать прозрачную картину качества и рекомендацию Go / No-go.', reqs:[rT('case-rel-2', 0.85), rT('triage-2', 0.75)]},
 {id:'middle', icon:'🥈', title:'Middle QA', c:7, r:2, parents:['junior', 'release'], type:'goal',
  desc:'Грейд Middle по матрице компетенций.', reqs:[rF('Грейд по матрице компетенций — Middle', () => gradeAtLeast('Middle'), `go('progress')`)]},
 {id:'senior', icon:'🥇', title:'Senior QA', c:8, r:4, parents:['middle', 'automator', 'firefighter', 'perfsec'], type:'challenge',
  desc:'Вершина дерева: грейд Senior и стабильный результат на ассессментах.', reqs:[rF('Грейд по матрице компетенций — Senior', () => gradeAtLeast('Senior'), `go('progress')`), rF('3 ассессмента подряд — от 85%', () => S.assess.length >= 3 && S.assess.slice(-3).every(a => a.total >= 85), `AS=null;go('assess')`)]}
];
const TN = Object.fromEntries(TREE.map(n => [n.id, n]));
const nodeDone = n => n.reqs.every(q => q.ok());
const nodeState = n => nodeDone(n) ? 'done' : n.parents.every(p => nodeDone(TN[p])) ? 'open' : 'locked';
let treeSel = null;

const COLW = 156, ROWH = 106, NODE = 54, PADX = 56, PADY = 24;
function vTree(){
  lastList = 'tree';
  const st = Object.fromEntries(TREE.map(n => [n.id, nodeState(n)])), got = TREE.filter(n => st[n.id] === 'done').length;
  const W = PADX * 2 + (Math.max(...TREE.map(n => n.c)) + 1) * COLW - (COLW - NODE) + 40, H = PADY * 2 + (Math.max(...TREE.map(n => n.r)) + 1) * ROWH;
  const X = n => PADX + n.c * COLW, Y = n => PADY + n.r * ROWH;
  const lines = TREE.flatMap(n => n.parents.map(p => { const a = TN[p], x1 = X(a) + NODE, y1 = Y(a) + NODE / 2, x2 = X(n), y2 = Y(n) + NODE / 2, mx = x2 - 22;
    const d = `M${x1} ${y1} H${mx} V${y2} H${x2}`, lit = st[p] === 'done';
    return `<path d="${d}" class="ln-o"/><path d="${d}" class="ln ${lit ? 'lit' : ''}"/>`; })).join('');
  const sel = TN[treeSel] || TREE.find(n => st[n.id] === 'open') || TREE[0];
  const next = TREE.filter(n => st[n.id] === 'open');
  return `<h1>Дерево навыков</h1>
  <p class="muted">Дорожная карта обучения: от первого урока до Senior. Навык открывается, когда получены предыдущие; получен — когда выполнены его условия. Нажмите на навык, чтобы увидеть условия и перейти к заданиям.</p>
  <div class="row" style="justify-content:space-between"><div class="small">Получено <b>${got}</b> из ${TREE.length} · доступно сейчас: ${next.length}</div><div class="small mclegend"><span class="lg done"></span> получено <span class="lg open"></span> доступно <span class="lg locked"></span> закрыто · ▢ навык ◯ веха ✦ испытание</div></div>
  <div class="bar"><i style="width:${Math.round(got / TREE.length * 100)}%"></i></div>
  <div class="mcwrap" id="mcwrap"><div class="mctree" style="width:${W}px;height:${H}px">
   <svg width="${W}" height="${H}" class="mclines">${lines}</svg>
   ${TREE.map(n => `<div class="mcn ${st[n.id]} ${n.type || 'task'} ${sel.id === n.id ? 'sel' : ''}" style="left:${X(n)}px;top:${Y(n)}px" onclick="treeSel='${n.id}';render()" title="${esc(n.title)}"><div class="fr"><span>${st[n.id] === 'locked' ? '🔒' : n.icon}</span></div><div class="lb">${esc(n.title)}</div></div>`).join('')}
  </div></div>
  ${treeDetail(sel, st[sel.id])}
  ${next.length ? `<div class="card"><h3>Что открыть дальше</h3>${next.map(n => `<div class="lrow" onclick="treeSel='${n.id}';render()"><span>${n.icon}</span><span class="lt">${esc(n.title)}</span><span class="small muted">${n.reqs.filter(q => q.ok()).length}/${n.reqs.length} условий</span></div>`).join('')}</div>` : ''}`;
}
function treeDetail(n, s){
  const kind = {task:'Навык', goal:'Веха', challenge:'Испытание'}[n.type || 'task'];
  const need = n.parents.filter(p => !nodeDone(TN[p]));
  return `<div class="mctip ${s}"><div class="row" style="justify-content:space-between"><b class="mct">${n.icon} ${esc(n.title)}</b><span class="small">${kind} · ${s === 'done' ? `получено${S.tree?.got?.[n.id] ? ' ' + S.tree.got[n.id] : ''}` : s === 'open' ? 'доступно' : 'закрыто'}</span></div>
  <p>${esc(n.desc)}</p>
  ${need.length ? `<p class="small">🔒 Сначала получите: ${need.map(p => `<a href="#" onclick="treeSel='${p}';render();return false">${esc(TN[p].title)}</a>`).join(', ')}</p>` : ''}
  <h3>Условия</h3>${n.reqs.map(q => { const ok = q.ok(); return `<div class="mcreq ${ok ? 'ok' : ''}"><span>${ok ? '✅' : '⬜'}</span><span class="lt">${esc(q.label)}${q.prog && !ok ? ` <span class="small">(${q.prog()})</span>` : ''}</span>${!ok && q.go ? `<button class="btn sm" onclick="${q.go}">Открыть</button>` : ''}</div>`; }).join('')}</div>`;
}
// Перетаскивание дерева мышью
AFTER_RENDER.push(() => {
  const w = document.getElementById('mcwrap'); if (!w) return;
  if (treeSel === null) { const o = TREE.find(n => nodeState(n) === 'open'); if (o) w.scrollLeft = Math.max(0, PADX + o.c * COLW - w.clientWidth / 2); }
  let drag = null;
  w.onmousedown = e => { if (e.target.closest('.mcn')) return; drag = {x: e.clientX, y: e.clientY, l: w.scrollLeft, t: w.scrollTop}; w.classList.add('drag'); };
  window.onmousemove = e => { if (!drag) return; w.scrollLeft = drag.l - (e.clientX - drag.x); w.scrollTop = drag.t - (e.clientY - drag.y); };
  window.onmouseup = () => { drag = null; w.classList.remove('drag'); };
});

// ───────── «Достижение получено!» ─────────
function checkAdvancements(silent){
  const fresh = !S.tree; S.tree = S.tree || {got:{}};
  const newly = TREE.filter(n => nodeDone(n) && !S.tree.got[n.id]);
  newly.forEach(n => S.tree.got[n.id] = today());
  if (newly.length) save();
  if (!fresh && !silent) newly.forEach((n, i) => setTimeout(() => advToast(n), i * 1600));
}
function advToast(n){
  const el = document.createElement('div'); el.className = 'advt ' + (n.type || 'task');
  el.innerHTML = `<div class="fr"><span>${n.icon}</span></div><div><div class="advh">${n.type === 'challenge' ? 'Испытание выполнено!' : n.type === 'goal' ? 'Цель достигнута!' : 'Достижение получено!'}</div><div>${esc(n.title)}</div></div>`;
  el.onclick = () => { treeSel = n.id; go('tree'); };
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 4200);
}
const _completeT = complete;
complete = function(id, score, extra){ _completeT(id, score, extra); setTimeout(() => checkAdvancements(), 50); };

// Ссылки на дерево из «Обучения» и «Прогресса»
const _learnT = VIEWS.learn, _progT = VIEWS.progress;
const treeCard = () => { const got = TREE.filter(nodeDone).length, nx = TREE.find(n => nodeState(n) === 'open');
  return `<div class="card note row" style="justify-content:space-between"><span>🌳 Дерево навыков: получено ${got} из ${TREE.length}${nx ? ` · следующий навык: <b>${esc(nx.title)}</b>` : ''}</span><button class="btn sm" onclick="${nx ? `treeSel='${nx.id}';` : ''}go('tree')">Открыть дорожную карту</button></div>`; };
VIEWS.learn = () => _learnT().replace('<h1>Обучение</h1>', '<h1>Обучение</h1>' + treeCard());
VIEWS.progress = () => _progT().replace('<h1>Прогресс</h1>', '<h1>Прогресс</h1>' + treeCard());
VIEWS.tree = () => vTree();
checkAdvancements(true);
render();

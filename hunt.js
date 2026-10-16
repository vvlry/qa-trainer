// Песочницы для поиска багов: тестовые стенды с внедрёнными дефектами, DevTools (сеть, консоль, хранилище,
// режимы сети), API-клиент с mock-серверами, баг-репорты, ретест исправлений и регрессий,
// вкладка тестов и коллекции запросов с автопроверкой (тест должен падать на баге и проходить на исправленной сборке).

S.hunt = S.hunt || {}; S.coll = S.coll || {};
const _ensureStateH = ensureState;
ensureState = function(){ _ensureStateH(); S.hunt = S.hunt || {}; S.coll = S.coll || {}; };

const SEV_W = {critical:3, major:2, minor:1};
const SEV_RU = {critical:'Critical', major:'Major', minor:'Minor'};
const REP_SEV = ['Blocker','Critical','Major','Minor','Trivial'];
const H_ = id => (S.hunt[id] = S.hunt[id] || {reports:[], trig:[], checks:null, done:false, draft:{}});

// ───────── Сборки: какие дефекты активны ─────────
// b1 — исходная сборка (все дефекты, кроме регрессий); b2 — сборка с исправлениями для ретеста;
// fixed — всё исправлено; only — активен один дефект (для проверки автотестов).
const REG_IDS = new Set([...BUGHUNT, ...APIHUNT].map(h => h.retest?.reg?.id).filter(Boolean));
let CUR = {mode:'b1'};
function on(id){
  if (CUR.mode === 'fixed') return false;
  if (CUR.mode === 'only') return id === CUR.only;
  if (CUR.mode === 'b1') return !REG_IDS.has(id);
  return REG_IDS.has(id) || !CUR.fixed.has(id);
}
function withMode(mode, fn){ const prev = CUR; CUR = {...mode, silent:true}; try { return fn(); } finally { CUR = prev; } }

// ───────── Состояние стенда (в памяти: «Сбросить стенд» возвращает исходные данные) ─────────
let SB = null;
const standOf = it => it.kind === 'auto' ? APIS[it.api] : it.api ? APIS[it.api] : APPS[it.app];
function sbStart(id, mode = 'b1'){
  const it = ITEMS[id];
  CUR = mode === 'b2' ? {mode:'b2', fixed: rtFixedSet(id)} : {mode:'b1'};
  SB = {id, mode, st: standOf(it).init(), net:[], con:[], tab:'net', open:null, netMode:'online', env:{}, side:'hist'};
}
function trig(b){
  if (!SB || CUR.silent || !on(b)) return;
  const H = H_(SB.id), T = SB.mode === 'b2' ? (H.rt = H.rt || {}) : H;
  T.trig = T.trig || []; if (!T.trig.includes(b)) { T.trig.push(b); save(); }
}
function net(method, url, status, req, res, headers = {'content-type':'application/json'}){ SB.net.unshift({n: SB.net.length + 1, at: hm(Date.now()), method, url, status, req, res, headers, ms: 35 + Math.round(Math.random()*220) + (SB.netMode === 'slow' ? 2000 : 0)}); }
function con(level, msg){ SB.con.unshift({level, msg, at: hm(Date.now())}); }
const delay = () => SB.netMode === 'slow' ? 2500 : 700;
function sbAct(name, ...args){
  const A = APPS[ITEMS[SB.id].app];
  if (SB.netMode === 'offline' && (A.netActs || []).includes(name)) {
    if (!(A.offline && A.offline(SB.st, name))) {
      net('—', `/api/v1/${ITEMS[SB.id].app}`, 0, null, '(failed) net::ERR_INTERNET_DISCONNECTED');
      con('error', 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED');
      SB.st.msg = {text:'Нет соединения с сервером. Проверьте интернет и повторите.'};
    }
    sbDraw(); return;
  }
  A.act(SB.st, name, ...args); sbDraw();
}
function sbReset(){ sbStart(SB.id, SB.mode); sbDraw(); toast('Стенд сброшен к исходным данным'); }
function sbDraw(){
  if (!SB) return;
  const it = ITEMS[SB.id], box = document.getElementById('sbx'), dt = document.getElementById('devt'), api = it.kind !== 'hunt';
  CUR = SB.mode === 'b2' ? {mode:'b2', fixed: rtFixedSet(SB.id)} : {mode:'b1'};
  if (box) box.innerHTML = api ? apiClientHtml() : APPS[it.app].view(SB.st);
  if (dt) dt.innerHTML = api ? apiSideHtml() : devtoolsHtml();
}
AFTER_RENDER.push(() => {
  const it = view === 'task' && ITEMS[current];
  if (!it || !['hunt','api','auto'].includes(it.kind)) return;
  const mode = RTV[current] ? 'b2' : 'b1';
  if (!SB || SB.id !== current || SB.mode !== mode) sbStart(current, mode);
  sbDraw();
});

// Поле ввода, значение которого живёт в состоянии стенда (переживает перерисовку)
const fld = (st, k, label, type = 'text', attrs = '') => `<label class="sbl">${label}<input class="sbi" type="${type}" value="${esc(st.f[k] ?? '')}" oninput="SB.st.f['${k}']=this.value" ${attrs}></label>`;
const rub = n => `${n} ₽`;
const r2 = n => Math.round(n * 100) / 100;
const pj = x => typeof x === 'string' ? x : JSON.stringify(x, null, 2);

function devtoolsHtml(){
  const errs = SB.con.filter(c => c.level === 'error').length, st = SB.st;
  const tab = (k, l) => `<button class="dtab ${SB.tab===k?'on':''}" onclick="SB.tab='${k}';sbDraw()">${l}</button>`;
  let body;
  if (SB.tab === 'net') body = SB.net.length ? `<table class="dt"><tr><th>#</th><th>Метод</th><th>URL</th><th>Статус</th><th>Время</th></tr>${SB.net.map((r,i)=>`<tr class="clk" onclick="SB.open=SB.open===${i}?null:${i};sbDraw()"><td>${r.n}</td><td>${r.method}</td><td class="mono">${esc(r.url)}</td><td class="${r.status>=400||r.status===0?'err':'good'}">${r.status || '(failed)'}</td><td>${r.ms} мс</td></tr>${SB.open===i?`<tr><td colspan="5"><div class="small"><b>Заголовки ответа:</b> ${esc(Object.entries(r.headers).map(([k,v])=>k+': '+v).join('; '))}</div>${r.req!=null?`<div class="small"><b>Запрос:</b></div><pre class="codeblk mono small">${esc(pj(r.req))}</pre>`:''}<div class="small"><b>Ответ:</b></div><pre class="codeblk mono small">${esc(pj(r.res))}</pre></td></tr>`:''}`).join('')}</table>` : '<p class="muted small">Запросов пока не было. Действуйте на стенде — здесь появятся запросы к серверу.</p>';
  else if (SB.tab === 'con') body = SB.con.length ? SB.con.map(c => `<div class="cline ${c.level}"><span class="muted">${c.at}</span> ${esc(c.msg)}</div>`).join('') : '<p class="muted small">Консоль пуста.</p>';
  else {
    if ((st.cookies || []).some(c => !c.httpOnly || !c.secure)) trig('t8');
    const ls = Object.entries(st.ls || {}), ck = st.cookies || [];
    body = `<h4>Local Storage</h4>${ls.length ? `<table class="dt"><tr><th>Ключ</th><th>Значение</th></tr>${ls.map(([k,v])=>`<tr><td class="mono">${esc(k)}</td><td class="mono">${esc(v)}</td></tr>`).join('')}</table>` : '<p class="muted small">Пусто</p>'}
    <h4>Cookies</h4>${ck.length ? `<table class="dt"><tr><th>Имя</th><th>Значение</th><th>HttpOnly</th><th>Secure</th><th>SameSite</th></tr>${ck.map(c=>`<tr><td class="mono">${esc(c.name)}</td><td class="mono">${esc(c.value)}</td><td>${c.httpOnly?'✓':''}</td><td>${c.secure?'✓':''}</td><td>${esc(c.sameSite||'')}</td></tr>`).join('')}</table>` : '<p class="muted small">Пусто</p>'}`;
  }
  return `<div class="dthead"><b>🛠 DevTools</b>${tab('net', `Network (${SB.net.length})`)}${tab('con', `Console${errs?` <span class="err">● ${errs}</span>`:''} (${SB.con.length})`)}${tab('app', 'Application')}
  <select class="dtsel" title="Режим сети" onchange="SB.netMode=this.value;sbDraw()">${[['online','Сеть: обычная'],['slow','Сеть: медленная 3G'],['offline','Сеть: офлайн']].map(([v,l])=>`<option value="${v}" ${SB.netMode===v?'selected':''}>${l}</option>`).join('')}</select></div>${body}`;
}

// ───────── UI-стенды ─────────
const APPS = {

// 1. Регистрация
reg: {
  netActs: ['submit'],
  init: () => ({f:{email:'', pass:'', pass2:'', age:'', agree:false}, users:[{id:1, email:'test@mail.ru', age:30}], msg:null, busy:0, ls:{}, cookies:[]}),
  view: st => `<div class="sbapp"><div class="sbbar">🛒 ТехноМаркет · Регистрация</div>
    ${fld(st,'email','Email')}${fld(st,'pass','Пароль','password')}${fld(st,'pass2','Повторите пароль','password')}${fld(st,'age','Возраст')}
    <label class="chk"><input type="checkbox" ${st.f.agree?'checked':''} onchange="SB.st.f.agree=this.checked"> Я принимаю правила сервиса</label>
    <button class="btn" onclick="sbAct('submit')" ${st.busy && !on('b6') ? 'disabled' : ''}>Зарегистрироваться</button>
    ${st.msg?`<p class="${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    <h4>Таблица users (тестовый доступ к БД)</h4><table class="dt"><tr><th>id</th><th>email</th><th>age</th></tr>${st.users.map(u=>`<tr><td>${u.id}</td><td>${esc(u.email)}</td><td>${u.age}</td></tr>`).join('')}</table></div>`,
  act(st, a){
    if (a !== 'submit') return;
    if (st.busy && !on('b6')) return;
    const f = st.f, email = f.email.trim(), say = (text, ok) => st.msg = {text, ok};
    if (f.age === '') {
      if (on('b7')) { con('error', "Uncaught TypeError: Cannot read properties of null (reading 'value')\n    at validateAge (register.js:42)\n    at HTMLButtonElement.onSubmit (register.js:17)"); trig('b7'); st.msg = null; return; }
      return say('Укажите возраст');
    }
    if (!email) return say('Укажите email');
    const strict = /^[^@\s]+@[^@\s]+\.[a-zа-я]{2,}$/i;
    if (!(on('b3') ? /^[^@\s]+@[^@\s]+$/ : strict).test(email)) return say('Некорректный email');
    if (!strict.test(email)) trig('b3');
    if (on('rr1') && /[-\d]/.test(email.split('@')[0])) { trig('rr1'); return say('Некорректный email'); }
    const p = f.pass, strong = /[a-zа-я]/i.test(p) && /\d/.test(p), min = on('b1') ? 7 : 8;
    if (p.length < min || p.length > 32 || !strong) { trig('b5'); return say(`Пароль должен быть от ${on('b5') ? 6 : 8} до 32 символов и содержать букву и цифру`); }
    if (p.length === 7) trig('b1');
    if (p !== f.pass2) return say('Пароли не совпадают');
    const age = Number(f.age);
    if (!Number.isInteger(age) || age < 18 || age > (on('b2') ? 100 : 99)) return say('Возраст должен быть от 18 до 99 лет');
    if (age === 100) trig('b2');
    if (!f.agree) return say('Необходимо принять правила сервиса');
    const same = u => on('b4') ? u.email === email : u.email.toLowerCase() === email.toLowerCase();
    const exists = st.users.some(same);
    if (!exists && st.users.some(u => u.email.toLowerCase() === email.toLowerCase())) trig('b4');
    const req = {email, password:'***', age};
    st.busy++; say('Отправка…', true);
    setTimeout(() => {
      st.busy--;
      if (exists) { net('POST', '/api/v1/register', 409, req, {error:'USER_EXISTS', message:'Пользователь уже существует'}); say('Пользователь уже существует'); }
      else {
        if (st.users.some(u => u.email === email)) trig('b6');
        const u = {id: st.users.length + 1, email, age}; st.users.push(u);
        const tok = 'eyJhbGciOiJIUzI1NiJ9.' + btoa(email).slice(0, 12);
        st.ls = {...st.ls, access_token: tok, user: JSON.stringify(on('b8') ? {email, password: p} : {email})};
        if (on('b8')) trig('b8');
        net('POST', '/api/v1/register', 201, req, {id:u.id, email, access_token: tok}); say('Регистрация прошла успешно', true);
      }
      sbDraw();
    }, delay() + 200);
  }
},

// 2. Корзина и промокоды
cart: {
  netActs: ['promo','checkout'],
  P: [{id:'kb', name:'Клавиатура', price:2500}, {id:'ms', name:'Мышь', price:1000}, {id:'pad', name:'Коврик', price:500}, {id:'cab', name:'Кабель USB-C', price:149.9}],
  init: () => ({qty:{kb:1}, f:{promo:''}, disc:0, pct:0, used:[], msg:null, orders:[], busy:false, ls:{cart:'{"kb":1}'}, cookies:[{name:'sid', value:'c7f2…', httpOnly:true, secure:true, sameSite:'Lax'}]}),
  sum: st => APPS.cart.P.reduce((a,p) => a + p.price * (st.qty[p.id] || 0), 0),
  money: v => on('c6') ? String(v) : r2(v).toLocaleString('ru-RU', {maximumFractionDigits:2}),
  calc(st){
    const sum = APPS.cart.sum(st), disc = on('c5') ? st.disc : r2(sum * st.pct), goods = r2(sum - disc);
    const free = on('c1') ? goods > 3000 : goods >= 3000 - 1e-9;
    if (Math.abs(goods - 3000) < 0.001) trig('c1');
    const inCart = APPS.cart.P.filter(p => st.qty[p.id] != null), ship = inCart.length ? (free ? 0 : 300) : 0;
    return {sum, disc, goods, ship, total: on('c6') ? sum - disc + ship : r2(goods + ship), inCart};
  },
  view(st){
    const C = APPS.cart, P = C.P, k = C.calc(st), m = C.money;
    if ([k.total, k.sum, ...k.inCart.map(p => p.price * st.qty[p.id])].some(v => /\.\d{3,}/.test(String(v)))) trig('c6');
    return `<div class="sbapp"><div class="sbbar">🛒 ТехноМаркет · Корзина</div>
    <h4>Каталог</h4>${P.filter(p => st.qty[p.id] == null).map(p => `<div class="sbrow"><span>${p.name} — ${rub(p.price.toString().replace('.',','))}</span><button class="btn sm ghost" onclick="sbAct('add','${p.id}')">В корзину</button></div>`).join('') || '<p class="muted small">Все товары в корзине</p>'}
    <h4>Корзина</h4>${k.inCart.length ? k.inCart.map(p => `<div class="sbrow"><span>${p.name}</span><input class="sbi qty" type="number" min="1" max="10" value="${st.qty[p.id]}" onchange="sbAct('qty','${p.id}',this.value)"><span>${rub(m(p.price * st.qty[p.id]))}</span><button class="btn sm ghost" onclick="sbAct('del','${p.id}')">✕</button></div>`).join('') : '<p class="muted">Корзина пуста</p>'}
    <div class="sbrow">${fld(st,'promo','Промокод')}<button class="btn sm" onclick="sbAct('promo')">Применить</button></div>
    ${st.msg?`<p class="small ${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    <table class="dt"><tr><td>Товары</td><td>${rub(m(k.sum))}</td></tr><tr><td>Скидка</td><td>−${rub(m(k.disc))}</td></tr><tr><td>Доставка</td><td>${k.ship ? rub(k.ship) : 'бесплатно'}</td></tr><tr><th>Итого</th><th>${rub(m(k.total))}</th></tr></table>
    <button class="btn" onclick="sbAct('checkout')" ${!k.inCart.length || (st.busy && !on('c8')) ? 'disabled' : ''}>${st.busy ? 'Оформляем…' : 'Оформить заказ'}</button>
    ${st.orders.length?`<p class="good small">Оформлены заказы: ${st.orders.map(o=>'№'+o).join(', ')}</p>`:''}</div>`;
  },
  changed(st){ if (st.pct) trig('c5'); st.ls = {...st.ls, cart: JSON.stringify(st.qty)}; },
  act(st, a, id, v){
    const C = APPS.cart;
    if (a === 'add') { st.qty[id] = 1; C.changed(st); }
    if (a === 'del') { delete st.qty[id]; C.changed(st); }
    if (a === 'qty') {
      const n = parseInt(v, 10);
      if (on('cr1') && n === 10) { trig('cr1'); st.msg = {text:'Количество — от 1 до 10'}; return; }
      if (isNaN(n) || n < 1 || n > 10) { if (on('c2')) trig('c2'); else { st.msg = {text:'Количество — от 1 до 10'}; return; } }
      st.qty[id] = isNaN(n) ? 1 : n; C.changed(st);
    }
    if (a === 'promo') {
      const raw = st.f.promo.trim(), code = on('c4') ? raw : raw.toUpperCase(), sum = C.sum(st);
      const apply = (pct, msg, res) => { st.used.push(code); st.pct = r2(st.pct + pct); st.disc = r2(st.disc + sum * pct); st.msg = {text:msg, ok:true}; net('POST', '/api/v1/cart/promo', 200, {code: raw}, res); };
      if (code === 'SALE10') {
        if (st.used.includes('SALE10')) { if (on('c3')) trig('c3'); else { st.msg = {text:'Промокод уже применён'}; net('POST', '/api/v1/cart/promo', 409, {code: raw}, {error:'PROMO_ALREADY_APPLIED'}); return; } }
        apply(0.1, 'Промокод применён: −10%', {discount_percent:10});
      } else if (code === 'OLD5') {
        if (on('c7')) { trig('c7'); apply(0.05, 'Промокод применён: −5%', {discount_percent:5, valid_until:'2025-12-31'}); }
        else { st.msg = {text:'Срок действия промокода истёк'}; net('POST', '/api/v1/cart/promo', 410, {code: raw}, {error:'PROMO_EXPIRED'}); }
      } else { if (raw.toUpperCase() === 'SALE10') trig('c4'); st.msg = {text:'Промокод не найден'}; net('POST', '/api/v1/cart/promo', 404, {code: raw}, {error:'PROMO_NOT_FOUND'}); }
    }
    if (a === 'checkout') {
      if (st.busy && !on('c8')) return;
      if (st.busy) trig('c8');
      st.busy = true; const k = C.calc(st);
      setTimeout(() => { const no = 5000 + Math.floor(Math.random()*999); st.orders.push(no); st.busy = false; net('POST', '/api/v1/orders', 201, {items: st.qty, promo: st.used}, {id: no, total: r2(k.total)}); sbDraw(); }, delay());
    }
  }
},

// 3. Каталог: поиск, фильтр, сортировка, пагинация
search: {
  netActs: ['find','stock','sort','page'],
  C: [['Мышь беспроводная Logi M190',990,12],['Клавиатура механическая K2',7490,3],['Монитор 27" Dell',24990,0],['Коврик для мыши XL',590,40],['Наушники Sony WH',15990,5],['Веб-камера 1080p',2490,0],['Мышь игровая Razer',4990,7],['Кабель HDMI 2 м',390,100],['Колонки Edifier',10990,2],['Микрофон USB',3990,0],['Подставка для ноутбука',1990,9],['USB-хаб 4 порта',1290,15]].map(([name,price,stock],i)=>({id:i+1,name,price,stock})),
  init: () => ({f:{q:''}, q:null, stock:false, sort:'', page:1, offline:false, ls:{recent_search:'[]'}, cookies:[]}),
  offline(st, a){
    if (a === 'find') { st.q = st.f.q; st.page = 1; }
    net('GET', '/api/v1/products', 0, null, '(failed) net::ERR_INTERNET_DISCONNECTED'); con('error', 'GET /api/v1/products net::ERR_INTERNET_DISCONNECTED');
    st.offline = true; if (on('s7')) trig('s7'); return true;
  },
  list(st){
    let L = APPS.search.C.slice();
    if (st.q !== null) {
      if (st.q === '') { if (on('s6')) { trig('s6'); L = []; } }
      else { const cs = L.filter(p => p.name.includes(st.q)), ci = L.filter(p => p.name.toLowerCase().includes(st.q.toLowerCase())); if (ci.length > cs.length) trig('s2'); L = on('s2') ? cs : ci; }
    }
    if (st.stock) { L = L.filter(p => on('s3') ? p.stock >= 0 : p.stock > 0); if (L.some(p => p.stock === 0)) trig('s3'); }
    if (st.sort === 'pa' || st.sort === 'pd') { if (on('s1')) { L.sort((a,b) => String(a.price) < String(b.price) ? -1 : 1); trig('s1'); } else L.sort((a,b) => a.price - b.price); if (st.sort === 'pd') L.reverse(); }
    if (st.sort === 'n') { L.sort((a,b) => a.name.localeCompare(b.name, 'ru')); if (on('sr1')) { L.reverse(); trig('sr1'); } }
    return L;
  },
  title(q){
    if (on('s5') && /<\s*\/?\s*[a-z]/i.test(q)) {
      trig('s5');
      if (/on\w+\s*=|<\s*script|javascript:/i.test(q)) return {html:'', alert:true};
      return {html: esc(q).replace(/&lt;(\/?)(b|i|u|s|h1|h2|h3|mark|marquee|em|strong)&gt;/gi, '<$1$2>')};
    }
    return {html: esc(q)};
  },
  view(st){
    const L = st.offline ? [] : APPS.search.list(st), per = 5, pages = (on('s4') ? Math.floor(L.length / per) : Math.ceil(L.length / per)) || 1;
    if (L.length > per && L.length % per) trig('s4');
    const page = Math.min(st.page, pages), shown = L.slice((page-1)*per, page*per);
    const t = st.q ? APPS.search.title(st.q) : null;
    const empty = st.offline && !on('s7') ? `<p class="err">Нет соединения с сервером. <a href="#" onclick="SB.st.offline=false;sbAct('find');return false">Повторить</a></p>` : `<p class="muted">Ничего не найдено. <a href="#" onclick="sbAct('clear');return false">Сбросить фильтры</a></p>`;
    return `<div class="sbapp"><div class="sbbar">🛒 ТехноМаркет · Каталог</div>
    <div class="sbrow">${fld(st,'q','Поиск','text',`onkeydown="if(event.key==='Enter')sbAct('find')"`)}<button class="btn sm" onclick="sbAct('find')">Найти</button></div>
    <div class="sbrow"><label class="chk"><input type="checkbox" ${st.stock?'checked':''} onchange="sbAct('stock',this.checked)"> Только в наличии</label>
    <select onchange="sbAct('sort',this.value)"><option value="">Без сортировки</option>${[['pa','Цена ↑'],['pd','Цена ↓'],['n','По названию']].map(([v,l])=>`<option value="${v}" ${st.sort===v?'selected':''}>${l}</option>`).join('')}</select></div>
    ${t ? (t.alert ? `<div class="sbalert">⚠️ alert: страница выполнила JavaScript из поискового запроса</div>` : `<h4>Результаты по запросу: ${t.html}</h4>`) : ''}
    ${shown.length ? shown.map(p => `<div class="sbrow"><span>${esc(p.name)}</span><span>${rub(p.price.toLocaleString('ru-RU'))}</span><span class="small ${p.stock?'good':'muted'}">${p.stock?`в наличии: ${p.stock}`:'нет в наличии'}</span></div>`).join('') : empty}
    ${pages > 1 ? `<div class="sbrow">${Array.from({length:pages},(_,i)=>`<button class="btn sm ${page===i+1?'':'ghost'}" onclick="sbAct('page',${i+1})">${i+1}</button>`).join('')}</div>` : ''}
    <p class="small muted">Найдено товаров: ${L.length}</p></div>`;
  },
  act(st, a, v){
    st.offline = false;
    if (a === 'find') { st.q = st.f.q; st.page = 1; if (st.q) st.ls = {...st.ls, recent_search: JSON.stringify([st.q, ...JSON.parse(st.ls.recent_search)].slice(0, 5))}; }
    if (a === 'stock') { st.stock = v; st.page = 1; }
    if (a === 'sort') st.sort = v;
    if (a === 'page') st.page = v;
    if (a === 'clear') { st.q = null; st.f.q = ''; st.stock = false; st.sort = ''; st.page = 1; }
    const L = APPS.search.list(st);
    net('GET', `/api/v1/products?q=${encodeURIComponent(st.q ?? '')}&in_stock=${st.stock}&sort=${st.sort}&page=${st.page}`, 200, null, {total: L.length, items: L.slice((st.page-1)*5, st.page*5).map(p=>p.id)});
  }
},

// 4. Перевод с карты на карту
transfer: {
  OWN: '4276123456789012',
  netActs: ['preview','confirm'],
  init: () => ({f:{card:'', amount:'', code:''}, balance:60000, step:'form', pre:null, attempts:0, hist:[], msg:null, ls:{}, cookies:[{name:'SESSIONID', value:'8f3a1c9e…', httpOnly:!on('t8'), secure:!on('t8'), sameSite:'Strict'}]}),
  view(st){
    const bal = `<div class="sbrow"><span>Карта •• 9012 (ваша): 4276 1234 5678 9012</span><b>Баланс: ${rub(st.balance.toLocaleString('ru-RU'))}</b></div>`;
    let body;
    if (st.step === 'form') body = `${fld(st,'card','Номер карты получателя')}${fld(st,'amount','Сумма, ₽')}<button class="btn" onclick="sbAct('preview')">Продолжить</button>`;
    else body = `<table class="dt"><tr><td>Получатель</td><td>${esc(st.pre.card)}</td></tr><tr><td>Сумма</td><td>${rub(st.pre.amount)}</td></tr><tr><td>Комиссия</td><td>${rub(st.pre.fee)}</td></tr><tr><th>Будет списано</th><th>${rub(r2(st.pre.amount + st.pre.fee))}</th></tr></table>
      <p class="small muted">Код из SMS отправлен на +7 *** ***-**-45 (на стенде код всегда 1234)</p>${fld(st,'code','Код из SMS')}<button class="btn" onclick="sbAct('confirm')">Подтвердить перевод</button><button class="btn ghost" onclick="sbAct('back')">Назад</button>`;
    return `<div class="sbapp"><div class="sbbar">🏦 ТехноБанк · Перевод с карты на карту</div>${bal}${body}
    ${st.msg?`<p class="${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    ${st.hist.length?`<h4>История операций</h4><table class="dt">${st.hist.map(h=>`<tr><td>${h.at}</td><td>→ ${esc(h.card)}</td><td>−${rub(h.total)}</td></tr>`).join('')}</table>`:''}</div>`;
  },
  act(st, a){
    const T = APPS.transfer, say = (text, ok) => st.msg = {text, ok};
    if (a === 'back') { st.step = 'form'; st.msg = null; return; }
    if (a === 'preview') {
      const digits = st.f.card.replace(/\s/g, ''), raw = st.f.amount.trim();
      if (!/^\d{16}$/.test(digits)) return say('Номер карты должен содержать 16 цифр');
      if (on('tr1') && digits !== T.OWN && digits.startsWith('4276')) { trig('tr1'); return say('Нельзя перевести деньги на свою карту'); }
      if (digits === T.OWN) { if (on('t3')) trig('t3'); else return say('Нельзя перевести деньги на свою карту'); }
      const amount = on('t2') ? parseFloat(raw) : parseFloat(raw.replace(',', '.'));
      if (isNaN(amount)) return say('Введите сумму');
      if (raw.includes(',') && parseFloat(raw) !== parseFloat(raw.replace(',', '.'))) trig('t2');
      if (amount < 10) return say('Минимальная сумма перевода — 10 ₽');
      if (amount > (on('t5') ? 500000 : 50000)) return say('Максимальная сумма перевода — 50 000 ₽');
      if (amount > 50000) trig('t5');
      const fee1 = r2(amount * 0.01), fee = on('t1') ? fee1 : Math.max(30, fee1);
      if (fee1 < 30) trig('t1');
      if ((on('t4') ? amount : amount + fee) > st.balance) return say('Недостаточно средств');
      if (amount + fee > st.balance) trig('t4');
      if (on('t7')) { trig('t7'); net('GET', `/api/v1/transfer/preview?card_to=${digits}&card_from=${T.OWN}&amount=${amount}`, 200, null, {amount, fee, total: r2(amount + fee)}); }
      else net('POST', '/api/v1/transfer/preview', 200, {card_to_token:'tk_' + digits.slice(-4), amount}, {amount, fee, total: r2(amount + fee)});
      st.pre = {card: st.f.card.trim(), digits, amount, fee}; st.step = 'confirm'; st.attempts = 0; st.f.code = ''; st.msg = null;
    }
    if (a === 'confirm') {
      if (st.f.code.trim() !== '1234') {
        st.attempts++; if (st.attempts > 3) trig('t6');
        net('POST', '/api/v1/transfer/confirm', 400, {code: st.f.code}, {error:'INVALID_CODE', attempts_left: Math.max(0, 3 - st.attempts)});
        if (st.attempts >= 3 && !on('t6')) { st.step = 'form'; return say('Перевод заблокирован: превышено число попыток ввода кода'); }
        return say(`Неверный код. Осталось попыток: ${Math.max(0, 3 - st.attempts)}`);
      }
      const p = st.pre; st.balance = r2(st.balance - p.amount - p.fee);
      st.hist.unshift({at: hm(Date.now()), card: p.card, total: r2(p.amount + p.fee)});
      net('POST', '/api/v1/transfer/confirm', 200, {code:'1234'}, {status:'DONE', balance: st.balance});
      st.step = 'form'; st.f = {card:'', amount:'', code:''}; say('Перевод выполнен', true);
    }
  }
},

// 5. Бронирование номера в отеле
booking: {
  netActs: ['calc','book','cancel'],
  init: () => ({f:{in:'', out:'', guests:'2'}, calc:null, list:[], msg:null, ls:{}, cookies:[]}),
  day: s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); },
  canCancel: b => { const d = (APPS.booking.day(b.in) - APPS.booking.day(dayKey())) / 864e5; return on('k7') ? d >= 0 : d >= 2; },
  view(st){
    const c = st.calc;
    return `<div class="sbapp"><div class="sbbar">🏨 ТехноТревел · Бронирование номера «Стандарт»</div>
    ${fld(st,'in','Дата заезда','date')}${fld(st,'out','Дата выезда','date')}${fld(st,'guests','Гостей','number','min="1" max="4"')}
    <button class="btn" onclick="sbAct('calc')">Рассчитать</button>
    ${st.msg?`<p class="${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    ${c?`<table class="dt"><tr><td>Ночей</td><td>${c.n}</td></tr>${c.rows.map(r=>`<tr><td class="small">${r.d}</td><td class="small">${rub(r.p)}</td></tr>`).join('')}<tr><td>Доп. места</td><td>${rub(c.extra)}</td></tr><tr><th>Итого</th><th>${rub(c.total)}</th></tr></table><button class="btn" onclick="sbAct('book')">Забронировать</button>`:''}
    ${st.list.length?`<h4>Мои брони</h4>${st.list.map((b,i)=>`<div class="sbrow"><span>№${b.no}: ${b.in} — ${b.out}, ${rub(b.total)} ${b.cancelled?'<span class="err">отменена</span>':''}</span>${!b.cancelled && APPS.booking.canCancel(b) ? `<button class="btn sm ghost" onclick="sbAct('cancel',${i})">Отменить</button>` : ''}</div>`).join('')}`:''}</div>`;
  },
  act(st, a, i){
    const B = APPS.booking, say = (text, ok) => st.msg = {text, ok};
    if (a === 'calc') {
      st.calc = null;
      if (!st.f.in || !st.f.out) return say('Укажите даты заезда и выезда');
      const din = B.day(st.f.in), dout = B.day(st.f.out), today0 = B.day(dayKey());
      if (din < today0) { if (on('k1')) trig('k1'); else return say('Дата заезда не может быть в прошлом'); }
      const diff = Math.round((dout - din) / 864e5);
      if (diff <= 0) { if (on('k2')) trig('k2'); else return say('Дата выезда должна быть позже даты заезда'); }
      if (diff > (on('k6') ? 31 : 30)) return say('Максимальный срок проживания — 30 ночей');
      if (diff === 31) trig('k6');
      const n = on('k3') ? diff + 1 : diff; if (diff > 0) trig('k3');
      const g = parseInt(st.f.guests, 10);
      if (!(g >= 1 && g <= 4)) return say('Количество гостей — от 1 до 4');
      if (g === 2) trig('k5');
      const rows = []; let sum = 0;
      for (let k = 0; k < n; k++) {
        const d = new Date(din.getFullYear(), din.getMonth(), din.getDate() + k), wd = d.getDay();
        const we = on('k4') ? (wd === 0 || wd === 6) : (wd === 5 || wd === 6);
        if (wd === 5 || wd === 0) trig('k4');
        const p = we ? 5500 : 4000; sum += p; rows.push({d: d.toLocaleDateString('ru-RU', {weekday:'short', day:'numeric', month:'short'}), p});
      }
      const extra = Math.max(0, g - (on('k5') ? 1 : 2)) * 1000 * n;
      if (on('kr1') && extra) trig('kr1');
      st.calc = {n, rows: rows.slice(0, 10), extra, total: diff <= 0 ? (diff - 1) * 4000 : sum + (on('kr1') ? 0 : extra)};
      if (n > 10) st.calc.rows.push({d:`… ещё ${n - 10}`, p: rows.slice(10).reduce((a,r)=>a+r.p,0)});
      net('POST', '/api/v1/booking/quote', 200, {check_in: st.f.in, check_out: st.f.out, guests: g}, {nights: n, total: st.calc.total});
      st.msg = null;
    }
    if (a === 'book') { const no = 70000 + Math.floor(Math.random()*9999); st.list.push({no, in: st.f.in, out: st.f.out, total: st.calc.total}); net('POST', '/api/v1/booking', 201, {check_in: st.f.in, check_out: st.f.out}, {id: no, status:'CONFIRMED'}); say(`Бронь №${no} подтверждена`, true); st.calc = null; }
    if (a === 'cancel') { const b = st.list[i]; if ((B.day(b.in) - B.day(dayKey())) / 864e5 < 2) trig('k7'); b.cancelled = true; net('POST', `/api/v1/booking/${b.no}/cancel`, 200, null, {status:'CANCELLED', refund: b.total}); say(`Бронь №${b.no} отменена, возврат ${b.total} ₽`, true); }
  }
}
};

// ───────── Mock-серверы API ─────────
const BASE = 'https://stand.technomarket.local';
const J = (status, body, headers = {}) => ({status, body, headers: {'content-type':'application/json; charset=utf-8', ...headers}});
const isEmail = e => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e);
const okAge = a => Number.isInteger(a) && a >= 18 && a <= 120;

const APIS = {

users: {
  start: {m:'GET', u:'/api/v1/users?limit=20&offset=0', h:'Authorization: Bearer test-token-123', b:'', t:''},
  init: () => ({users:[{id:1, name:'Анна Смирнова', email:'anna@test.ru', age:28, password_hash:'$2b$10$N9qo8uLOickgx2ZMRZoMye', created_at:'2025-03-01T10:00:00Z'}, {id:2, name:'Борис Петров', email:'boris@test.ru', age:35, password_hash:'$2b$10$Xa8sdfkHyw2ZMRbcq2Lme', created_at:'2025-03-02T12:30:00Z'}], next:3}),
  handle(st, r){
    const pub = u => ({id:u.id, name:u.name, email:u.email, age:u.age, created_at:u.created_at});
    const authed = r.headers.authorization === 'Bearer test-token-123';
    const m = r.path.match(/^\/api\/v1\/users(?:\/([^/]+))?\/?$/);
    if (!m) return J(404, {error:'Not Found'});
    if (r.method === 'DELETE') {
      if (!authed) { if (on('u5')) trig('u5'); else return J(401, {error:'Unauthorized', message:'Missing or invalid token'}); }
      const u = st.users.find(x => String(x.id) === m[1]); if (!u) return J(404, {error:'User not found'});
      st.users = st.users.filter(x => x !== u); return {status:204, body:'', headers:{}};
    }
    if (!authed) return J(401, {error:'Unauthorized', message:'Missing or invalid token'});
    if (!m[1]) {
      if (r.method === 'GET') {
        if (on('ur1') && r.query.limit == null) { trig('ur1'); return J(400, {error:'limit is required', field:'limit'}); }
        const lim = r.query.limit != null ? Number(r.query.limit) : 20, off = Number(r.query.offset || 0);
        if (!Number.isInteger(lim) || lim < 1 || lim > 100) { if (on('u6')) { trig('u6'); return J(200, {items: st.users.map(pub), total: st.users.length, limit: r.query.limit}); } return J(400, {error:'limit must be 1-100', field:'limit'}); }
        return J(200, {items: st.users.slice(off, off + lim).map(pub), total: st.users.length, limit: lim, offset: off});
      }
      if (r.method === 'POST') {
        const b = r.body; if (!b || typeof b !== 'object') return J(400, {error:'Body must be a JSON object'});
        if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.length > 50) return J(400, {error:'name must be 2-50 characters', field:'name'});
        if (!isEmail(b.email)) return J(400, {error:'invalid email', field:'email'});
        if (!okAge(b.age)) { if (on('u2')) trig('u2'); else return J(400, {error:'age must be an integer 18-120', field:'age'}); }
        if (st.users.some(u => u.email.toLowerCase() === String(b.email).toLowerCase())) { if (on('u4')) trig('u4'); else return J(409, {error:'email already exists', field:'email'}); }
        const u = {id: st.next++, name:b.name, email:b.email, age:b.age, password_hash:'$2b$10$' + Math.random().toString(36).slice(2, 22), created_at: new Date().toISOString()};
        st.users.push(u); trig('u1'); return J(on('u1') ? 200 : 201, pub(u));
      }
      return J(405, {error:'Method Not Allowed'});
    }
    const u = st.users.find(x => String(x.id) === m[1]);
    if (r.method === 'GET') {
      if (!u) { if (on('u3')) { trig('u3'); return J(500, {error:'Internal Server Error', trace:'java.lang.NullPointerException at UserService.getById(UserService.java:88)'}); } return J(404, {error:'User not found'}); }
      if (on('u8')) { trig('u8'); return J(200, {...pub(u), password_hash: u.password_hash}); }
      return J(200, pub(u));
    }
    if (r.method === 'PATCH') {
      if (!u) return J(404, {error:'User not found'});
      const b = r.body || {};
      if ('name' in b && (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.length > 50)) return J(400, {error:'name must be 2-50 characters', field:'name'});
      if ('email' in b && !isEmail(b.email)) { if (on('u7')) trig('u7'); else return J(400, {error:'invalid email', field:'email'}); }
      if ('age' in b && !okAge(b.age)) { if (on('u2')) trig('u2'); else return J(400, {error:'age must be an integer 18-120', field:'age'}); }
      ['name','email','age'].forEach(k => { if (k in b) u[k] = b[k]; });
      return J(200, pub(u));
    }
    return J(405, {error:'Method Not Allowed'});
  }
},

orders: {
  start: {m:'GET', u:'/api/v1/orders', h:'Authorization: Bearer token-a', b:'', t:''},
  PR: {1:{name:'Клавиатура', price:2500}, 2:{name:'Мышь', price:1000}, 3:{name:'Коврик', price:500}},
  init: () => ({orders:[{id:1001, user_id:2, status:'paid', items:[{product_id:2, qty:3, price:1000}], total:3000}, {id:1002, user_id:1, status:'new', items:[{product_id:1, qty:1, price:2500}], total:2500}], next:1003}),
  handle(st, r){
    const P = APIS.orders.PR, uid = {'Bearer token-a':1, 'Bearer token-b':2}[r.headers.authorization];
    if (!uid) return J(401, {error:'Unauthorized'});
    let m;
    if (r.path.replace(/\/$/, '') === '/api/v1/orders') {
      if (r.method === 'GET') return J(200, {items: st.orders.filter(o => o.user_id === uid)});
      if (r.method !== 'POST') return J(405, {error:'Method Not Allowed'});
      const items = r.body?.items;
      if (!Array.isArray(items) || !items.length) return J(400, {error:'items must be a non-empty array'});
      for (const it of items) {
        if (!P[it.product_id]) { if (on('o6')) { trig('o6'); return J(500, {error:'Internal Server Error', trace:"TypeError: Cannot read properties of undefined (reading 'price')"}); } return J(400, {error:'unknown product_id', field:'product_id'}); }
        if (!Number.isInteger(it.qty)) return J(400, {error:'qty must be an integer', field:'qty'});
        if (it.qty > 10) return J(400, {error:'qty must be between 1 and 10', field:'qty'});
        if (it.qty < 1) { if (on('o3')) trig('o3'); else return J(400, {error:'qty must be between 1 and 10', field:'qty'}); }
      }
      if (items.some(it => it.qty !== 1)) trig('o2');
      const lines = items.map(it => ({product_id: it.product_id, qty: it.qty, price: P[it.product_id].price}));
      const o = {id: st.next++, user_id: uid, status:'new', items: lines, total: lines.reduce((a, l) => a + l.price * (on('o2') ? 1 : l.qty), 0)};
      st.orders.push(o);
      let body = o; if (on('or1') && lines.length > 1) { trig('or1'); body = {...o, items: lines.slice(0, 1)}; }
      if (on('o7')) { trig('o7'); return J(201, body, {'content-type':'text/html; charset=utf-8'}); }
      return J(201, body);
    }
    if ((m = r.path.match(/^\/api\/v1\/orders\/(\d+)(?:\/(pay|cancel))?\/?$/))) {
      const o = st.orders.find(x => x.id === Number(m[1]));
      if (!o) return J(404, {error:'Order not found'});
      if (o.user_id !== uid) { if (on('o1')) trig('o1'); else return J(404, {error:'Order not found'}); }
      if (!m[2]) return r.method === 'GET' ? J(200, o) : J(405, {error:'Method Not Allowed'});
      if (r.method !== 'POST') return J(405, {error:'Method Not Allowed'});
      if (m[2] === 'pay') {
        if (o.status === 'cancelled') return J(409, {error:'Order is cancelled'});
        if (o.status === 'paid') { if (on('o4')) trig('o4'); else return J(409, {error:'Order is already paid'}); }
        o.status = 'paid'; return J(200, {id:o.id, status:o.status, charged:o.total, payment_id:'pay_' + Math.random().toString(36).slice(2, 10)});
      }
      if (o.status === 'cancelled') { if (on('o5')) trig('o5'); else return J(409, {error:'Order is already cancelled'}); }
      o.status = 'cancelled'; return J(200, {id:o.id, status:o.status});
    }
    return J(404, {error:'Not Found'});
  }
},

auth: {
  start: {m:'POST', u:'/api/v1/auth/login', h:'', b:'{\n  "email": "test@mail.ru",\n  "password": "Qwerty123"\n}', t:''},
  init: () => ({fails:{}, tokens:{}}),
  handle(st, r){
    const p = r.path.replace(/\/$/, '');
    if (p === '/api/v1/auth/login') {
      if (r.method !== 'POST') return J(405, {error:'Method Not Allowed'});
      const b = r.body || {};
      if (typeof b.email !== 'string' || typeof b.password !== 'string') return J(400, {error:'email and password are required'});
      if (b.email !== b.email.trim()) { if (on('a6')) { trig('a6'); return J(500, {error:'Internal Server Error'}); } }
      const email = b.email.trim(), k = email.toLowerCase(); st.fails[k] = st.fails[k] || 0;
      if (st.fails[k] >= 5) { if (on('a2')) trig('a2'); else return J(429, {error:'TOO_MANY_ATTEMPTS', message:'Слишком много попыток. Повторите через 15 минут', retry_after:900}); }
      const same = 'Неверный email или пароль';
      const known = on('a4') ? email === 'test@mail.ru' : k === 'test@mail.ru';
      if (!known) { if (k === 'test@mail.ru') trig('a4'); st.fails[k]++; if (on('a1')) { trig('a1'); return J(401, {error:'USER_NOT_FOUND', message:'Пользователь с таким email не найден'}); } return J(401, {error:'INVALID_CREDENTIALS', message:same}); }
      if (b.password !== 'Qwerty123') { st.fails[k]++; if (on('a1')) { trig('a1'); return J(401, {error:'WRONG_PASSWORD', message:'Неверный пароль'}); } return J(401, {error:'INVALID_CREDENTIALS', message:same}); }
      st.fails[k] = 0;
      const t = 'tok_' + Math.random().toString(36).slice(2, 14); st.tokens[t] = 'active'; trig('a5');
      return J(200, {access_token:t, token_type:'Bearer', expires_in: on('a5') ? 9000 : 900});
    }
    const t = (r.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (p === '/api/v1/auth/me') {
      if (r.method !== 'GET') return J(405, {error:'Method Not Allowed'});
      if (!st.tokens[t] || (st.tokens[t] === 'out' && !on('a3'))) return J(401, {error:'Unauthorized'});
      if (st.tokens[t] === 'out') trig('a3');
      if (on('ar1')) { trig('ar1'); return J(200, {id:7, name:'Тестовый Пользователь'}); }
      return J(200, {id:7, email:'test@mail.ru', name:'Тестовый Пользователь'});
    }
    if (p === '/api/v1/auth/logout') {
      if (r.method !== 'POST') return J(405, {error:'Method Not Allowed'});
      if (!st.tokens[t] || st.tokens[t] === 'out') return J(401, {error:'Unauthorized'});
      st.tokens[t] = 'out'; return {status:204, body:'', headers:{}};
    }
    return J(404, {error:'Not Found'});
  }
}
};

// ───────── API-клиент: запросы, переменные, тесты, коллекция ─────────
const CL = () => { const it = ITEMS[SB.id]; return SB.st.client = SB.st.client || {...APIS[it.api].start, name:''}; };
const STATUS_TEXT = {0:'Failed', 200:'OK', 201:'Created', 204:'No Content', 400:'Bad Request', 401:'Unauthorized', 403:'Forbidden', 404:'Not Found', 405:'Method Not Allowed', 409:'Conflict', 410:'Gone', 422:'Unprocessable Entity', 429:'Too Many Requests', 500:'Internal Server Error'};
const subst = (s, env) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => env[k] ?? m);

// Выполнить запрос к mock-серверу: {res} или {res, err}
function apiCall(api, st, q, env){
  let url; try { url = new URL(subst(q.u, env).trim(), BASE); } catch(e) { return {res: J(0, {error:'Некорректный URL'}), url: q.u}; }
  const headers = {};
  subst(q.h, env).split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
  let body = null, raw = subst(q.b, env).trim(), res;
  if (raw && q.m !== 'GET') { try { body = JSON.parse(raw); } catch(e) { res = J(400, {error:'Malformed JSON', detail: e.message}); } }
  if (!res) res = APIS[api].handle(st, {method: q.m, path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body});
  return {res, url: url.pathname + url.search, body: body ?? (raw || null)};
}
// Мини-фреймворк тестов в стиле Postman/Jest: test(name, fn), expect(x).toBe(y), env.set(k, v)
const fmt = v => { try { return JSON.stringify(v); } catch(e) { return String(v); } };
function runTests(code, res, env){
  const out = [];
  if (!String(code || '').trim()) return out;
  const test = (name, fn) => { try { fn(); out.push({name, ok:true}); } catch(e) { out.push({name, ok:false, err: e.message}); } };
  const expect = a => {
    const chk = neg => { const m = (cond, what, b) => { if (!!cond === neg) throw new Error(`ожидалось${neg ? ' НЕ' : ''} ${what}${b !== undefined ? ' ' + fmt(b) : ''}, получено ${fmt(a)}`); };
      return {toBe: b => m(a === b, 'равно', b), toEqual: b => m(fmt(a) === fmt(b), 'равно', b), toBeDefined: () => m(a !== undefined, 'значение'), toBeUndefined: () => m(a === undefined, 'отсутствие значения'),
        toContain: b => m(a != null && typeof a.includes === 'function' && a.includes(b), 'содержит', b), toBeGreaterThan: b => m(a > b, 'больше', b), toBeLessThan: b => m(a < b, 'меньше', b),
        toMatch: re => m(new RegExp(re).test(String(a)), 'совпадение с', String(re)), toHaveProperty: k => m(a != null && typeof a === 'object' && k in a, 'наличие поля', k), toBeOneOf: arr => m(arr.includes(a), 'одно из', arr)}; };
    const o = chk(false); o.not = chk(true); return o;
  };
  const E = {set: (k, v) => { env[k] = v; }, get: k => env[k]};
  const R = {status: res.status, headers: res.headers, body: res.body, json: () => res.body};
  try { new Function('res', 'test', 'expect', 'env', String(code))(R, test, expect, E); }
  catch(e) { out.push({name:'Ошибка в коде тестов', ok:false, err: e.message}); }
  return out;
}
function apiSend(){
  const it = ITEMS[SB.id], c = CL(), x = apiCall(it.api, SB.st, c, SB.env);
  net(c.m, x.url, x.res.status, x.body, x.res.body, x.res.headers);
  SB.lastTests = runTests(c.t, x.res, SB.env);
  sbDraw();
}
const testsHtml = T => T && T.length ? `<div class="tests">${T.map(t => `<div class="${t.ok ? 'good' : 'err'} small">${t.ok ? '✓' : '✗'} ${esc(t.name)}${t.ok ? '' : ` — <span class="muted">${esc(t.err)}</span>`}</div>`).join('')}</div>` : '';
function apiClientHtml(){
  const c = CL(), last = SB.net[0], envKeys = Object.keys(SB.env);
  return `<div class="sbapp apic"><div class="sbbar">📮 API-клиент · ${BASE}</div>
  <div class="sbrow"><select onchange="CL().m=this.value">${['GET','POST','PUT','PATCH','DELETE'].map(m=>`<option ${c.m===m?'selected':''}>${m}</option>`).join('')}</select>
  <input class="sbi mono grow" value="${esc(c.u)}" oninput="CL().u=this.value" onkeydown="if(event.key==='Enter')apiSend()"><button class="btn sm" onclick="apiSend()">Send</button></div>
  <label class="sbl">Заголовки (по одному на строку: Имя: значение)<textarea class="mono" rows="2" oninput="CL().h=this.value">${esc(c.h)}</textarea></label>
  <label class="sbl">Тело запроса (JSON)<textarea class="mono" rows="5" oninput="CL().b=this.value" placeholder='{"key": "value"}'>${esc(c.b)}</textarea></label>
  <details class="sub" ${c.t ? 'open' : ''}><summary>🧪 Тесты (выполняются после ответа)</summary>
  <textarea class="mono" rows="6" spellcheck="false" oninput="CL().t=this.value" placeholder="test('Создан пользователь', () => {\n  expect(res.status).toBe(201);\n  expect(res.body.email).toBe('ivan@test.ru');\n});\nenv.set('id', res.body.id);   // затем {{id}} в URL">${esc(c.t || '')}</textarea>
  <p class="small muted">Доступно: <code>res.status</code>, <code>res.body</code>, <code>res.headers['content-type']</code>; <code>expect(x)</code> → <code>.toBe .toEqual .toBeDefined .toBeUndefined .toContain .toHaveProperty .toBeGreaterThan .toBeLessThan .toMatch .toBeOneOf</code>, <code>.not</code>; переменные <code>env.set('token', …)</code> и <code>{{token}}</code> в URL, заголовках и теле.</p></details>
  <div class="sbrow"><input class="sbi grow" placeholder="Название запроса, например: Создание пользователя → 201" value="${esc(c.name || '')}" oninput="CL().name=this.value"><button class="btn sm ghost" onclick="collAdd()">+ В коллекцию</button></div>
  ${envKeys.length ? `<p class="small muted">Переменные: ${envKeys.map(k => `<code>{{${esc(k)}}}</code> = ${esc(String(SB.env[k]).slice(0, 24))}`).join(' · ')} <a href="#" onclick="SB.env={};sbDraw();return false">очистить</a></p>` : ''}
  ${last ? `<h4>Ответ: <span class="${last.status>=400||last.status===0?'err':'good'}">${last.status} ${STATUS_TEXT[last.status]||''}</span> <span class="muted small">· ${last.ms} мс</span></h4>
  ${testsHtml(SB.lastTests)}
  <div class="small muted">${Object.entries(last.headers).map(([k,v])=>`${esc(k)}: ${esc(v)}`).join('<br>') || 'нет заголовков'}</div>
  <pre class="codeblk mono small">${esc(last.res === '' ? '(пустое тело)' : pj(last.res))}</pre>` : '<p class="muted small">Отправьте первый запрос. Документация API — выше.</p>'}</div>`;
}
// Коллекция хранится по имени API и общая для стенда поиска багов и задания на автотесты
const COLL = () => (S.coll[ITEMS[SB.id].api] = S.coll[ITEMS[SB.id].api] || []);
function collAdd(){ const c = CL(); COLL().push({name: c.name.trim() || `${c.m} ${c.u}`, m:c.m, u:c.u, h:c.h, b:c.b, t:c.t || ''}); save(); SB.side = 'coll'; sbDraw(); toast('Запрос добавлен в коллекцию'); }
function collDel(i){ COLL().splice(i, 1); save(); sbDraw(); }
function collMove(i, d){ const L = COLL(), j = i + d; if (j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; save(); sbDraw(); }
function collLoad(i){ const q = COLL()[i]; Object.assign(CL(), {...q}); sbDraw(); }
// Прогон коллекции на чистых данных сервера в заданной сборке
function runCollection(api, items, mode){
  const go_ = () => { const st = APIS[api].init(), env = {}; return items.map(q => { const x = apiCall(api, st, q, env); return {name: q.name, status: x.res.status, tests: runTests(q.t, x.res, env)}; }); };
  return mode ? withMode(mode, go_) : go_();
}
function collRun(){ SB.collRes = runCollection(ITEMS[SB.id].api, COLL(), SB.mode === 'b2' ? {mode:'b2', fixed: rtFixedSet(SB.id)} : {mode:'b1'}); SB.side = 'coll'; sbDraw(); }
function apiSideHtml(){
  const tab = (k, l) => `<button class="dtab ${SB.side===k?'on':''}" onclick="SB.side='${k}';sbDraw()">${l}</button>`;
  const L = COLL();
  let body;
  if (SB.side === 'hist') body = SB.net.length ? `<table class="dt">${SB.net.map((r,i)=>`<tr class="clk" onclick="apiLoad(${i})"><td>${r.method}</td><td class="mono small">${esc(r.url)}</td><td class="${r.status>=400?'err':'good'}">${r.status}</td></tr>`).join('')}</table>` : '<p class="muted small">Пусто</p>';
  else {
    const R = SB.collRes, pass = R ? R.reduce((a, r) => a + r.tests.filter(t => t.ok).length, 0) : 0, all = R ? R.reduce((a, r) => a + r.tests.length, 0) : 0;
    body = L.length ? `<p class="small muted">Запросы выполняются по порядку на свежих данных сервера; переменные из env передаются дальше.</p>
    ${L.map((q,i)=>`<div class="sbrow small"><span class="clk" onclick="collLoad(${i})"><b>${i+1}.</b> <span class="verb v-${q.m.toLowerCase()}">${q.m}</span> ${esc(q.name)}${q.t ? '' : ' <span class="warn">· нет тестов</span>'}</span><span><button class="btn sm ghost" onclick="collMove(${i},-1)">↑</button><button class="btn sm ghost" onclick="collMove(${i},1)">↓</button><button class="btn sm ghost" onclick="collDel(${i})">✕</button></span></div>`).join('')}
    <button class="btn sm" onclick="collRun()">▶ Запустить коллекцию</button>
    ${R ? `<h4>Результат: <span class="${pass === all ? 'good' : 'err'}">${pass} из ${all} тестов прошли</span></h4>${R.map(r => `<div class="small"><b>${esc(r.name)}</b> → ${r.status}</div>${testsHtml(r.tests)}`).join('')}` : ''}`
    : '<p class="muted small">Коллекция пуста. Отправьте запрос, напишите для него тесты и нажмите «+ В коллекцию».</p>';
  }
  return `<div class="dthead">${tab('hist', `🕘 История (${SB.net.length})`)}${tab('coll', `📚 Коллекция (${L.length})`)}</div>${body}`;
}
function apiLoad(i){ const r = SB.net[i], c = CL(); c.m = r.method; c.u = r.url; c.b = r.req == null ? '' : pj(r.req); sbDraw(); }

// ───────── Баг-репорты ─────────
function repQuality(r){
  const steps = r.steps.split('\n').filter(l => l.trim()).length;
  const C = [['заголовок отвечает на «что? где? когда?» (≥ 4 слов)', r.title.trim().split(/\s+/).length >= 4], ['шаги воспроизведения (≥ 2 шагов)', steps >= 2], ['ожидаемый результат', r.exp.trim().length >= 5], ['фактический результат отличается от ожидаемого', r.act.trim().length >= 5 && r.act.trim() !== r.exp.trim()]];
  return {score: C.filter(c => c[1]).length / C.length, miss: C.filter(c => !c[1]).map(c => c[0])};
}
const repText = r => `${r.title}\nСерьёзность: ${r.sev}\nШаги:\n${r.steps}\nОжидаемый результат: ${r.exp}\nФактический результат: ${r.act}`;
const repMatch = (b, r) => b.keys.some(k => new RegExp(k, 'i').test([r.title, r.steps, r.exp, r.act].join(' ')));
// Автосверка: каждый репорт засчитывается не больше чем за один дефект — тот, с которым совпало больше признаков
const repHits = (b, r) => b.keys.filter(k => new RegExp(k, 'i').test([r.title, r.steps, r.exp, r.act].join(' '))).length;
function autoMatch(it, reps){
  const checks = it.bugs.map(() => false);
  reps.forEach(r => { const c = it.bugs.map((b, i) => [i, repHits(b, r)]).filter(x => x[1] > 0 && !checks[x[0]]).sort((x, y) => y[1] - x[1]); if (c.length) checks[c[0][0]] = true; });
  return checks;
}
// Форма баг-репорта: pre — куда сохранять (H или H.rt), fn — префикс функций
function repFormHtml(id, T, rt){
  const d = T.draft = T.draft || {}, set = k => `${rt ? 'RT_' : 'H_'}('${id}').draft.${k}=this.value;save()`;
  return `<div class="card"><h3>🐞 Новый баг-репорт</h3>
    <label>Заголовок (что не так, где и при каких условиях)</label><input class="sbi" value="${esc(d.title||'')}" oninput="${set('title')}" placeholder="Например: Регистрация: принимается пароль из 7 символов">
    <label>Шаги воспроизведения</label><textarea rows="4" oninput="${set('steps')}" placeholder="1. Открыть …\n2. Ввести …\n3. Нажать …">${esc(d.steps||'')}</textarea>
    <div class="split"><div><label>Ожидаемый результат</label><textarea rows="2" oninput="${set('exp')}">${esc(d.exp||'')}</textarea></div><div><label>Фактический результат</label><textarea rows="2" oninput="${set('act')}">${esc(d.act||'')}</textarea></div></div>
    <label>Серьёзность (severity)</label><select onchange="${set('sev')}">${REP_SEV.map(s=>`<option ${(d.sev||'Major')===s?'selected':''}>${s}</option>`).join('')}</select>
    <div class="row"><button class="btn" onclick="addReport('${id}',${!!rt})">Завести баг</button></div></div>`;
}
function repListHtml(id, T, locked, rt){
  return T.reports.length ? T.reports.map((r,i) => { const q = repQuality(r); return `<div class="rep"><div class="row" style="justify-content:space-between"><b>BUG-${i+1}. ${esc(r.title)}</b><span><span class="tag">${r.sev}</span>${locked?'':` <button class="btn sm ghost" onclick="editReport('${id}',${i},${!!rt})">Изменить</button><button class="btn sm ghost" onclick="delReport('${id}',${i},${!!rt})">✕</button>`}</span></div>
    <details><summary class="small">Подробнее</summary><p class="pre small">${esc(r.steps)}</p><p class="small"><b>Ожидаемо:</b> ${esc(r.exp)}<br><b>Фактически:</b> ${esc(r.act)}</p></details>
    ${q.miss.length?`<div class="small warn">Чего не хватает: ${q.miss.join('; ')}</div>`:''}</div>`; }).join('') : '<p class="muted small">Пока ни одного баг-репорта.</p>';
}
const T_of = (id, rt) => rt ? RT_(id) : H_(id);
function addReport(id, rt){
  const T = T_of(id, rt), d = T.draft || {};
  if (!(d.title||'').trim() || !(d.act||'').trim()) { toast('Заполните хотя бы заголовок и фактический результат'); return; }
  const r = {title:d.title.trim(), steps:(d.steps||'').trim(), exp:(d.exp||'').trim(), act:d.act.trim(), sev:d.sev||'Major'};
  if (T.editing != null) { T.reports[T.editing] = r; T.editing = null; } else T.reports.push(r);
  T.draft = {}; save(); render(); toast('Баг заведён');
}
function editReport(id, i, rt){ const T = T_of(id, rt); T.draft = {...T.reports[i]}; T.editing = i; save(); render(); }
function delReport(id, i, rt){ const T = T_of(id, rt); T.reports.splice(i, 1); save(); render(); }

// ───────── Экран стенда ─────────
function standHtml(it, title){
  return `<div class="hunt"><div class="card sbwrap"><div class="row" style="justify-content:space-between"><h3>${title}</h3><button class="btn sm ghost" onclick="sbReset()">Сбросить стенд</button></div><div id="sbx"></div></div>
  <div class="card devt" id="devt"></div></div>`;
}
const specHtml = it => `<div class="card"><h3>Ситуация</h3><p>${esc(it.scenario)}</p><h3>${it.kind==='hunt'?'Требования':'Документация API'}</h3><div class="txt">${it.spec}</div>
  <p class="small muted">Всё, что расходится с требованиями, — дефект. Проверяйте позитивные и негативные сценарии, границы, повторные действия, ${it.kind==='api'?'коды ответов, заголовки, авторизацию и тело ответа':'сообщения об ошибках и DevTools: Network, Console, Application и режимы сети'}. Багов на стенде: ${it.bugs.length}.</p></div>`;
function tHunt(it){
  if (RTV[it.id]) return tRetest(it);
  const H = H_(it.id);
  return `${retestBanner(it)}${specHtml(it)}${standHtml(it, '🧪 Тестовый стенд · сборка 1.0')}
  <div class="card"><h3>Ваши баг-репорты (${H.reports.length})</h3>${repListHtml(it.id, H, H.done)}</div>
  ${H.done ? '' : repFormHtml(it.id, H)}
  ${!H.done ? `<div class="card"><button class="btn" onclick="finishHunt('${it.id}')" ${H.reports.length?'':'disabled'}>Завершить тестирование и сверить с известными дефектами</button><span class="small muted">&nbsp;После этого заводить баги будет нельзя.</span></div>` : huntResultHtml(it)}
  ${aiBox(it.id)}`;
}
function finishHunt(id){
  const it = ITEMS[id], H = H_(id);
  if (!confirm('Завершить тестирование? Новые баги завести будет нельзя.')) return;
  H.done = true; H.checks = autoMatch(it, H.reports); save(); render();
}
function huntScore(it){
  const H = H_(it.id), tot = it.bugs.reduce((a,b) => a + SEV_W[b.sev], 0);
  const found = it.bugs.reduce((a,b,i) => a + (H.checks?.[i] ? SEV_W[b.sev] : 0), 0) / tot;
  const ai = AIR[it.id]?.res?.score, q = H.reports.length ? H.reports.reduce((a,r) => a + repQuality(r).score, 0) / H.reports.length : 0;
  return {found, quality: ai != null ? ai / 100 : q, total: Math.round((0.7 * found + 0.3 * (ai != null ? ai / 100 : q)) * 100)};
}
function huntResultHtml(it){
  const H = H_(it.id), sc = huntScore(it), locked = H.scored;
  return `<div class="card ref"><h3>Известные дефекты стенда</h3>${locked ? '' : `<p class="muted small">Автосверка отметила баги, которые похожи на ваши репорты. Проверьте честно и поправьте отметки: засчитывайте баг, только если вы описали именно его. ${AI.enabled?'Или поручите сверку ИИ.':''}</p>`}
  ${it.bugs.map((b,i) => `<label class="chk"><input type="checkbox" ${H.checks[i]?'checked':''} ${AIR[it.id]?.res || locked ?'disabled':''} onchange="H_('${it.id}').checks[${i}]=this.checked;save();render()"><span><span class="tag ${b.sev==='critical'?'sev-critical':b.sev==='major'?'sev-major':''}">${SEV_RU[b.sev]}</span> <b>${esc(b.title)}</b>${H.trig.includes(b.id)?' <span class="small good">· вы воспроизводили его на стенде</span>':''}<br><span class="small muted">Как найти: ${esc(b.how)}</span></span></label>`).join('')}
  <div class="kpis"><div class="kpi"><b>${Math.round(sc.found*100)}%</b><span>найдено (с весом серьёзности)</span></div><div class="kpi"><b>${Math.round(sc.quality*100)}%</b><span>качество репортов${AIR[it.id]?.res?' (ИИ)':''}</span></div><div class="kpi"><b>${sc.total}%</b><span>итог: 70% поиск + 30% репорты</span></div></div>
  <div class="row">${locked ? `<span class="good">Засчитано ${H.scored}.</span>` : `${AI.enabled && !AIR[it.id]?.res ? `<button class="btn ghost" onclick="aiHunt('${it.id}')">Сверить и оценить репорты с ИИ</button>` : ''}<button class="btn" onclick="finishHuntScore('${it.id}')">Засчитать (${sc.total}%)</button>`}<button class="btn ghost" onclick="if(confirm('Начать заново? Ваши репорты и ретест будут удалены.')){delete S.hunt['${it.id}'];delete AIR['${it.id}'];sbStart('${it.id}');save();render()}">Пройти заново</button></div></div>`;
}
async function aiHunt(id){
  const it = ITEMS[id], H = H_(id);
  const r = await runReview(id, {title: it.title, task: 'Найти дефекты на тестовом стенде и описать их баг-репортами. Критерии — список известных дефектов: отметь true, только если среди репортов есть описание ИМЕННО этого дефекта. Итоговый score — качество баг-репортов: понятный заголовок, воспроизводимые шаги, ожидаемый и фактический результат, адекватная серьёзность, нет дублей и «не-багов».', context: strip(it.spec), checklist: it.bugs.map(b => b.title)}, H.reports.map((r,i) => `BUG-${i+1}. ${repText(r)}`).join('\n\n'));
  if (r) { H.checks = r.checklist; save(); render(); }
}
function finishHuntScore(id){
  const it = ITEMS[id], H = H_(id), sc = huntScore(it);
  H.scored = today(); save();
  complete(id, sc.total / 100, {missed: it.bugs.filter((_,i) => !H.checks[i]).map(b => b.title), answer: H.reports.map(repText).join('\n\n')});
  go(lastList);
}

// ───────── Ретест: сборка 1.1 с исправлениями ─────────
// В ретест попадают баги, засчитанные ученику. Один из них разработчик «исправил» не до конца,
// по одному ответил «Cannot reproduce», остальные исправлены. Плюс в сборке появилась регрессия.
const RTV = {};
const RT_ = id => { const H = H_(id); return H.rt = H.rt || {reports:[], trig:[], verdict:{}, comment:{}, draft:{}}; };
const rtTickets = it => { const H = H_(it.id); return it.bugs.filter((b, i) => H.checks?.[i]); };
function rtStatus(it, b){ const R = it.retest; return b.id === R.cnr ? 'cnr' : b.id === R.partial ? 'partial' : 'fixed'; }
function rtFixedSet(id){ const it = ITEMS[id]; if (!it?.retest) return new Set(); return new Set(rtTickets(it).filter(b => rtStatus(it, b) === 'fixed').map(b => b.id)); }
const rtReady = it => { const H = H_(it.id); return it.retest && H.scored && rtTickets(it).length && H.scored < today() && !H.rt?.score; };
function retestBanner(it){
  const H = H_(it.id);
  if (!it.retest || !H.scored || !rtTickets(it).length) return '';
  if (H.rt?.score != null) return `<div class="card note row" style="justify-content:space-between"><span>🔁 Ретест сборки 1.1 пройден: ${H.rt.score}%</span><button class="btn sm ghost" onclick="RTV['${it.id}']=true;render()">Открыть ретест</button></div>`;
  if (H.scored >= today()) return `<div class="card note">🔁 Разработчики взяли ваши баги в работу. Сборка 1.1 с исправлениями будет на стенде завтра — проведите ретест.</div>`;
  return `<div class="card note row" style="justify-content:space-between"><span>🔁 На стенд выкатили сборку 1.1 с исправлениями ваших багов. Проведите ретест и регресс.</span><button class="btn sm" onclick="RTV['${it.id}']=true;render()">Начать ретест</button></div>`;
}
const DEV = 'Артём Ли · разработчик';
function tRetest(it){
  const R = RT_(it.id), done = R.score != null, T = rtTickets(it), RTC = it.retest;
  const st = b => rtStatus(it, b);
  return `<button class="back" onclick="RTV['${it.id}']=false;render()">← К сборке 1.0 и вашим репортам</button>
  <div class="card"><h3>🔁 Ретест: сборка 1.1</h3><p>Разработчики отработали ваши баг-репорты и выкатили сборку 1.1. Ваша задача:</p>
  <ol><li>Проверить каждый тикет на стенде и закрыть его или переоткрыть. Для «Cannot reproduce» — дополнить данными, чтобы разработчик воспроизвёл.</li><li>Провести регресс: исправления могли сломать то, что раньше работало. Новые дефекты заводите баг-репортами ниже.</li></ol>
  <details class="sub"><summary>${it.kind==='hunt'?'Требования':'Документация API'}</summary><div class="txt">${it.spec}</div></details></div>
  ${standHtml(it, '🧪 Тестовый стенд · сборка 1.1')}
  <div class="card"><h3>Тикеты на проверку (${T.length})</h3>
  ${T.map(b => { const s = st(b), v = R.verdict[b.id];
    const note = s === 'cnr' ? RTC.cnrNote : s === 'partial' ? RTC.partialNote : 'Исправлено в сборке 1.1.';
    return `<div class="rep"><div class="row" style="justify-content:space-between"><b>${esc(b.title)}</b><span class="tag ${s==='cnr'?'err':'ok'}">${s === 'cnr' ? 'Cannot reproduce' : 'Fixed'}</span></div>
    <div class="msg"><div class="from">💬 ${DEV}</div>${esc(note)}</div>
    <div class="row"><button class="btn sm ${v==='close'?'':'ghost'}" ${done?'disabled':''} onclick="RT_('${it.id}').verdict['${b.id}']='close';save();render()">✓ Закрыть: исправлено</button><button class="btn sm ${v==='reopen'?'bad':'ghost'}" ${done?'disabled':''} onclick="RT_('${it.id}').verdict['${b.id}']='reopen';save();render()">↩ Переоткрыть</button></div>
    ${v === 'reopen' ? `<textarea rows="2" ${done?'disabled':''} placeholder="Комментарий разработчику: что именно не исправлено, точные шаги и данные, при которых воспроизводится" oninput="RT_('${it.id}').comment['${b.id}']=this.value;save()">${esc(R.comment[b.id] || '')}</textarea>` : ''}
    ${done ? `<p class="small ${(v === 'close') === (s === 'fixed') ? 'good' : 'err'}">${s === 'fixed' ? 'Правильно закрыть: баг действительно исправлен.' : s === 'partial' ? 'Баг не исправлен — нужно было переоткрыть с комментарием.' : 'Баг воспроизводится — нужно было переоткрыть и дать разработчику точные шаги и условия.'}</p>` : ''}</div>`; }).join('')}</div>
  <div class="card"><h3>Новые дефекты в сборке 1.1 (${R.reports.length})</h3>${repListHtml(it.id, R, done, true)}</div>
  ${done ? '' : repFormHtml(it.id, R, true)}
  ${done ? rtResultHtml(it) : `<div class="card"><button class="btn" onclick="finishRetest('${it.id}')">Завершить ретест</button></div>`}`;
}
function rtScore(it){
  const R = RT_(it.id), T = rtTickets(it), RTC = it.retest;
  const ok = T.filter(b => { const s = rtStatus(it, b), v = R.verdict[b.id]; return s === 'fixed' ? v === 'close' : v === 'reopen' && (R.comment[b.id] || '').trim().length >= 15; }).length;
  const reg = R.reports.some(r => repMatch(RTC.reg, r));
  return {verdicts: T.length ? ok / T.length : 0, reg, total: Math.round((0.6 * (T.length ? ok / T.length : 0) + 0.4 * (reg ? 1 : 0)) * 100)};
}
function finishRetest(id){
  const it = ITEMS[id], R = RT_(id), T = rtTickets(it);
  if (T.some(b => !R.verdict[b.id])) { toast('Примите решение по каждому тикету'); return; }
  const sc = rtScore(it); R.score = sc.total;
  const pid = 'rt@' + id; ensurePseudo(pid, 'retest', 'Ретест: ' + it.title); ITEMS[pid].cat = 'Процесс и релизы';
  const missed = [];
  T.forEach(b => { const s = rtStatus(it, b), v = R.verdict[b.id]; if (s === 'fixed' && v !== 'close') missed.push(`Исправленный баг не закрыт: ${b.title}`); if (s !== 'fixed' && v !== 'reopen') missed.push(`Не переоткрыт неисправленный баг: ${b.title}`); });
  if (!sc.reg) missed.push('Регрессия в сборке 1.1: ' + it.retest.reg.title);
  complete(pid, sc.total / 100, {missed});
  render();
}
function rtResultHtml(it){
  const R = RT_(it.id), sc = rtScore(it), g = it.retest.reg;
  return `<div class="card ref"><h3>Итог ретеста: ${R.score}%</h3>
  <p><b>Регрессия сборки 1.1:</b> <span class="tag ${g.sev==='critical'?'sev-critical':g.sev==='major'?'sev-major':''}">${SEV_RU[g.sev]}</span> ${esc(g.title)} — ${sc.reg ? '<span class="good">вы её нашли ✓</span>' : '<span class="err">не найдена</span>'}${R.trig.includes(g.id) ? ' <span class="small">(вы на неё натыкались на стенде)</span>' : ''}<br><span class="small muted">Как найти: ${esc(g.how)}</span></p>
  <div class="kpis"><div class="kpi"><b>${Math.round(sc.verdicts*100)}%</b><span>верных решений по тикетам</span></div><div class="kpi"><b>${sc.reg ? 'да' : 'нет'}</b><span>регрессия найдена</span></div><div class="kpi"><b>${R.score}%</b><span>итог: 60% тикеты + 40% регресс</span></div></div>
  <p class="small muted">Урок: после исправлений проверяйте не только сам баг, но и соседнюю функциональность — регрессии появляются именно там.</p>
  <button class="btn ghost sm" onclick="if(confirm('Пройти ретест заново?')){delete H_('${it.id}').rt;sbStart('${it.id}','b2');save();render()}">Пройти ретест заново</button></div>`;
}

// ───────── Задание «Автотесты для API» ─────────
// Коллекция засчитывает дефект, если на сборке, где активен только он, падают другие тесты, чем на исправленной;
// падения на полностью исправленной сборке — ложные и снижают балл.
function tAuto(it){
  const hunt = APIHUNT.find(h => h.api === it.api), A = S.auto?.[it.id];
  return `<div class="card"><h3>Ситуация</h3><p>${esc(it.scenario)}</p><h3>Задание</h3><div class="txt pre">${esc(it.task)}</div>
  <details class="sub"><summary>Документация API</summary><div class="txt">${hunt.spec}</div></details>
  <details class="sub"><summary>Пример теста</summary><pre class="codeblk mono small">${esc(it.example)}</pre></details></div>
  ${standHtml(it, '🧪 API-клиент и коллекция')}
  <div class="card"><h3>Проверка коллекции</h3><p class="small muted">Тренажёр прогонит вашу коллекцию на исправленной сборке (все тесты должны пройти) и на сборках, в каждой из которых оставлен ровно один известный дефект (хотя бы один тест должен упасть). Так проверяется, что тесты ловят баги и не дают ложных падений.</p>
  <button class="btn" onclick="checkAuto('${it.id}')">Проверить коллекцию</button>
  ${A ? autoResultHtml(it, hunt, A) : ''}</div>`;
}
function checkAuto(id){
  const it = ITEMS[id], hunt = APIHUNT.find(h => h.api === it.api), items = S.coll[it.api] || [];
  if (!items.length || !items.some(q => q.t.trim())) { toast('Добавьте в коллекцию запросы с тестами'); return; }
  // «Подпись» прогона — какие тесты упали; дефект пойман, если подпись отличается от исправленной сборки
  const sig = R => R.flatMap((r, i) => r.tests.map((t, j) => t.ok ? '' : i + ':' + j)).filter(Boolean).join(',');
  const fixedRun = runCollection(it.api, items, {mode:'fixed'}), base = sig(fixedRun);
  const falseFails = fixedRun.flatMap(r => r.tests.filter(t => !t.ok).map(t => `${r.name}: ${t.name} — ${t.err}`));
  const caught = hunt.bugs.map(b => sig(runCollection(it.api, items, {mode:'only', only:b.id})) !== base);
  const tot = hunt.bugs.reduce((a, b) => a + SEV_W[b.sev], 0), w = hunt.bugs.reduce((a, b, i) => a + (caught[i] ? SEV_W[b.sev] : 0), 0) / tot;
  const score = Math.round(w * (falseFails.length ? 0.4 : 1) * 100);
  S.auto = S.auto || {}; S.auto[id] = {caught, falseFails, score, tests: items.reduce((a, q) => a + (q.t.match(/\btest\s*\(/g) || []).length, 0)}; save(); render();
}
function autoResultHtml(it, hunt, A){
  return `<div class="kpis"><div class="kpi"><b>${A.caught.filter(Boolean).length}/${hunt.bugs.length}</b><span>дефектов ловит коллекция</span></div><div class="kpi"><b class="${A.falseFails.length?'err':'good'}">${A.falseFails.length}</b><span>ложных падений на исправленной сборке</span></div><div class="kpi"><b>${A.score}%</b><span>итог${A.falseFails.length ? ' (×0,4 за ложные падения)' : ''}</span></div></div>
  ${A.falseFails.length ? `<p class="err small"><b>Тесты падают на исправленной сборке</b> — значит, ожидания в них неверные:</p><ul class="small">${A.falseFails.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  ${hunt.bugs.map((b, i) => `<div class="chk ${A.caught[i] ? 'good' : 'muted'}">${A.caught[i] ? '✓ ловит' : '○ не ловит'} · <span class="tag">${SEV_RU[b.sev]}</span> ${esc(b.title)}</div>`).join('')}
  <button class="btn" onclick="complete('${it.id}', ${A.score / 100}, {missed: ${esc(JSON.stringify(hunt.bugs.filter((_, i) => !A.caught[i]).map(b => 'Нет автотеста: ' + b.title)))}});go(lastList)">Засчитать (${A.score}%)</button>`;
}

Object.assign(TASK_VIEWS, {hunt: it => tHunt(it), api: it => tHunt(it), auto: it => tAuto(it)});

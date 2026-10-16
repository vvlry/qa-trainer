// Песочницы для поиска багов: тестовые стенды с внедрёнными дефектами, DevTools (сеть и консоль),
// API-клиент с mock-сервером, баг-репорты и их проверка (автоматически, самопроверкой или ИИ).

S.hunt = S.hunt || {};
const _ensureStateH = ensureState;
ensureState = function(){ _ensureStateH(); S.hunt = S.hunt || {}; };

const SEV_W = {critical:3, major:2, minor:1};
const SEV_RU = {critical:'Critical', major:'Major', minor:'Minor'};
const REP_SEV = ['Blocker','Critical','Major','Minor','Trivial'];
const H_ = id => (S.hunt[id] = S.hunt[id] || {reports:[], trig:[], checks:null, done:false, draft:{}});

// ───────── Состояние стенда (в памяти: «Сбросить стенд» возвращает исходные данные) ─────────
let SB = null;
function sbStart(id){ const it = ITEMS[id], A = it.kind === 'api' ? APIS[it.api] : APPS[it.app]; SB = {id, st: A.init(), net:[], con:[], tab:'net', open:null}; }
function trig(b){ if (!SB) return; const H = H_(SB.id); if (!H.trig.includes(b)) { H.trig.push(b); save(); } }
function net(method, url, status, req, res, headers = {'content-type':'application/json'}){ SB.net.unshift({n: SB.net.length + 1, at: hm(Date.now()), method, url, status, req, res, headers, ms: 35 + Math.round(Math.random()*220)}); }
function con(level, msg){ SB.con.unshift({level, msg, at: hm(Date.now())}); }
function sbAct(name, ...args){ const it = ITEMS[SB.id]; APPS[it.app].act(SB.st, name, ...args); sbDraw(); }
function sbReset(){ sbStart(SB.id); sbDraw(); toast('Стенд сброшен к исходным данным'); }
function sbDraw(){
  if (!SB) return;
  const it = ITEMS[SB.id], box = document.getElementById('sbx'), dt = document.getElementById('devt');
  if (box) box.innerHTML = it.kind === 'api' ? apiClientHtml() : APPS[it.app].view(SB.st);
  if (dt) dt.innerHTML = it.kind === 'api' ? apiHistoryHtml() : devtoolsHtml();
}
AFTER_RENDER.push(() => { if (view === 'task' && ITEMS[current] && ['hunt','api'].includes(ITEMS[current].kind)) { if (!SB || SB.id !== current) sbStart(current); sbDraw(); } });

// Поле ввода, значение которого живёт в состоянии стенда (переживает перерисовку)
const fld = (st, k, label, type = 'text', attrs = '') => `<label class="sbl">${label}<input class="sbi" type="${type}" value="${esc(st.f[k] ?? '')}" oninput="SB.st.f['${k}']=this.value" ${attrs}></label>`;
const rub = n => `${n} ₽`;
const pj = x => typeof x === 'string' ? x : JSON.stringify(x, null, 2);

function devtoolsHtml(){
  const errs = SB.con.filter(c => c.level === 'error').length;
  const tab = (k, l) => `<button class="dtab ${SB.tab===k?'on':''}" onclick="SB.tab='${k}';sbDraw()">${l}</button>`;
  let body;
  if (SB.tab === 'net') body = SB.net.length ? `<table class="dt"><tr><th>#</th><th>Метод</th><th>URL</th><th>Статус</th><th>Время</th></tr>${SB.net.map((r,i)=>`<tr class="clk" onclick="SB.open=SB.open===${i}?null:${i};sbDraw()"><td>${r.n}</td><td>${r.method}</td><td class="mono">${esc(r.url)}</td><td class="${r.status>=400?'err':'good'}">${r.status}</td><td>${r.ms} мс</td></tr>${SB.open===i?`<tr><td colspan="5"><div class="small"><b>Заголовки ответа:</b> ${esc(Object.entries(r.headers).map(([k,v])=>k+': '+v).join('; '))}</div>${r.req!=null?`<div class="small"><b>Запрос:</b></div><pre class="codeblk mono small">${esc(pj(r.req))}</pre>`:''}<div class="small"><b>Ответ:</b></div><pre class="codeblk mono small">${esc(pj(r.res))}</pre></td></tr>`:''}`).join('')}</table>` : '<p class="muted small">Запросов пока не было. Действуйте на стенде — здесь появятся запросы к серверу.</p>';
  else body = SB.con.length ? SB.con.map(c => `<div class="cline ${c.level}"><span class="muted">${c.at}</span> ${esc(c.msg)}</div>`).join('') : '<p class="muted small">Консоль пуста.</p>';
  return `<div class="dthead"><b>🛠 DevTools</b>${tab('net', `Network (${SB.net.length})`)}${tab('con', `Console${errs?` <span class="err">● ${errs}</span>`:''} (${SB.con.length})`)}</div>${body}`;
}

// ───────── UI-стенды ─────────
const APPS = {

// 1. Регистрация
reg: {
  init: () => ({f:{email:'', pass:'', pass2:'', age:'', agree:false}, users:[{id:1, email:'test@mail.ru', age:30}], msg:null}),
  view: st => `<div class="sbapp"><div class="sbbar">🛒 ТехноМаркет · Регистрация</div>
    ${fld(st,'email','Email')}${fld(st,'pass','Пароль','password')}${fld(st,'pass2','Повторите пароль','password')}${fld(st,'age','Возраст')}
    <label class="chk"><input type="checkbox" ${st.f.agree?'checked':''} onchange="SB.st.f.agree=this.checked"> Я принимаю правила сервиса</label>
    <button class="btn" onclick="sbAct('submit')">Зарегистрироваться</button>
    ${st.msg?`<p class="${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    <h4>Таблица users (тестовый доступ к БД)</h4><table class="dt"><tr><th>id</th><th>email</th><th>age</th></tr>${st.users.map(u=>`<tr><td>${u.id}</td><td>${esc(u.email)}</td><td>${u.age}</td></tr>`).join('')}</table></div>`,
  act(st, a){
    if (a !== 'submit') return;
    const f = st.f, email = f.email.trim(), say = (text, ok) => st.msg = {text, ok};
    if (f.age === '') { con('error', "Uncaught TypeError: Cannot read properties of null (reading 'value')\n    at validateAge (register.js:42)\n    at HTMLButtonElement.onSubmit (register.js:17)"); trig('b7'); st.msg = null; return; }
    if (!email) return say('Укажите email');
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return say('Некорректный email');
    if (!/^[^@\s]+@[^@\s]+\.[a-zа-я]{2,}$/i.test(email)) trig('b3');
    const p = f.pass, strong = /[a-zа-я]/i.test(p) && /\d/.test(p);
    if (p.length < 7 || p.length > 32 || !strong) { trig('b5'); return say('Пароль должен быть от 6 до 32 символов и содержать букву и цифру'); }
    if (p.length === 7) trig('b1');
    if (p !== f.pass2) return say('Пароли не совпадают');
    const age = Number(f.age);
    if (!Number.isInteger(age) || age < 18 || age > 100) return say('Возраст должен быть от 18 до 99 лет');
    if (age === 100) trig('b2');
    if (!f.agree) return say('Необходимо принять правила сервиса');
    const exists = st.users.some(u => u.email === email);
    if (!exists && st.users.some(u => u.email.toLowerCase() === email.toLowerCase())) trig('b4');
    const req = {email, password:'***', age};
    say('Отправка…', true);
    setTimeout(() => {
      if (exists) { net('POST', '/api/v1/register', 409, req, {error:'USER_EXISTS', message:'Пользователь уже существует'}); say('Пользователь уже существует'); }
      else {
        if (st.users.some(u => u.email === email)) trig('b6');
        const u = {id: st.users.length + 1, email, age}; st.users.push(u);
        net('POST', '/api/v1/register', 201, req, {id:u.id, email}); say('Регистрация прошла успешно', true);
      }
      sbDraw();
    }, 900);
  }
},

// 2. Корзина и промокоды
cart: {
  P: [{id:'kb', name:'Клавиатура', price:2500}, {id:'ms', name:'Мышь', price:1000}, {id:'pad', name:'Коврик', price:500}, {id:'cab', name:'Кабель USB-C', price:149.9}],
  init: () => ({qty:{kb:1}, f:{promo:''}, disc:0, used:[], msg:null, order:null}),
  sum: st => APPS.cart.P.reduce((a,p) => a + p.price * (st.qty[p.id] || 0), 0),
  view(st){
    const P = APPS.cart.P, inCart = P.filter(p => st.qty[p.id] != null), sum = APPS.cart.sum(st);
    const goods = sum - st.disc, free = goods > 3000;
    if (Math.abs(goods - 3000) < 0.001) trig('c1');
    const ship = inCart.length ? (free ? 0 : 300) : 0, total = goods + ship;
    if ([total, sum, ...inCart.map(p => p.price * st.qty[p.id])].some(v => /\.\d{3,}/.test(String(v)))) trig('c6');
    return `<div class="sbapp"><div class="sbbar">🛒 ТехноМаркет · Корзина</div>
    <h4>Каталог</h4>${P.filter(p => st.qty[p.id] == null).map(p => `<div class="sbrow"><span>${p.name} — ${rub(p.price.toString().replace('.',','))}</span><button class="btn sm ghost" onclick="sbAct('add','${p.id}')">В корзину</button></div>`).join('') || '<p class="muted small">Все товары в корзине</p>'}
    <h4>Корзина</h4>${inCart.length ? inCart.map(p => `<div class="sbrow"><span>${p.name}</span><input class="sbi qty" type="number" min="1" max="10" value="${st.qty[p.id]}" onchange="sbAct('qty','${p.id}',this.value)"><span>${rub(p.price * st.qty[p.id])}</span><button class="btn sm ghost" onclick="sbAct('del','${p.id}')">✕</button></div>`).join('') : '<p class="muted">Корзина пуста</p>'}
    <div class="sbrow">${fld(st,'promo','Промокод')}<button class="btn sm" onclick="sbAct('promo')">Применить</button></div>
    ${st.msg?`<p class="small ${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    <table class="dt"><tr><td>Товары</td><td>${rub(sum)}</td></tr><tr><td>Скидка</td><td>−${rub(st.disc)}</td></tr><tr><td>Доставка</td><td>${ship ? rub(ship) : 'бесплатно'}</td></tr><tr><th>Итого</th><th>${rub(total)}</th></tr></table>
    <button class="btn" onclick="sbAct('checkout')" ${inCart.length?'':'disabled'}>Оформить заказ</button>${st.order?`<p class="good small">Заказ №${st.order} оформлен</p>`:''}</div>`;
  },
  act(st, a, id, v){
    if (a === 'add') { st.qty[id] = 1; if (st.disc) trig('c5'); }
    if (a === 'del') { delete st.qty[id]; if (st.disc) trig('c5'); }
    if (a === 'qty') { const n = parseInt(v, 10); st.qty[id] = isNaN(n) ? 1 : n; if (n < 1 || n > 10) trig('c2'); if (st.disc) trig('c5'); }
    if (a === 'promo') {
      const code = st.f.promo.trim(), sum = APPS.cart.sum(st);
      if (code === 'SALE10') { if (st.used.includes(code)) trig('c3'); st.used.push(code); st.disc = Math.round((st.disc + sum * 0.1) * 100) / 100; st.msg = {text:'Промокод применён: −10%', ok:true}; net('POST', '/api/v1/cart/promo', 200, {code}, {discount_percent:10}); }
      else if (code === 'OLD5') { trig('c7'); st.used.push(code); st.disc = Math.round((st.disc + sum * 0.05) * 100) / 100; st.msg = {text:'Промокод применён: −5%', ok:true}; net('POST', '/api/v1/cart/promo', 200, {code}, {discount_percent:5, valid_until:'2025-12-31'}); }
      else { if (code.toUpperCase() === 'SALE10') trig('c4'); st.msg = {text:'Промокод не найден'}; net('POST', '/api/v1/cart/promo', 404, {code}, {error:'PROMO_NOT_FOUND'}); }
    }
    if (a === 'checkout') { const sum = APPS.cart.sum(st); st.order = 5000 + Math.floor(Math.random()*999); net('POST', '/api/v1/orders', 201, {items: st.qty, promo: st.used}, {id: st.order, goods: sum, discount: st.disc}); }
  }
},

// 3. Каталог: поиск, фильтр, сортировка, пагинация
search: {
  C: [['Мышь беспроводная Logi M190',990,12],['Клавиатура механическая K2',7490,3],['Монитор 27" Dell',24990,0],['Коврик для мыши XL',590,40],['Наушники Sony WH',15990,5],['Веб-камера 1080p',2490,0],['Мышь игровая Razer',4990,7],['Кабель HDMI 2 м',390,100],['Колонки Edifier',10990,2],['Микрофон USB',3990,0],['Подставка для ноутбука',1990,9],['USB-хаб 4 порта',1290,15]].map(([name,price,stock],i)=>({id:i+1,name,price,stock})),
  init: () => ({f:{q:''}, q:null, stock:false, sort:'', page:1, alert:null}),
  list(st){
    let L = APPS.search.C.slice();
    if (st.q !== null) {
      if (st.q === '') { trig('s6'); L = []; }
      else { const cs = L.filter(p => p.name.includes(st.q)), ci = L.filter(p => p.name.toLowerCase().includes(st.q.toLowerCase())); if (ci.length > cs.length) trig('s2'); L = cs; }
    }
    if (st.stock) { L = L.filter(p => p.stock >= 0); if (L.some(p => p.stock === 0)) trig('s3'); }
    if (st.sort === 'pa' || st.sort === 'pd') { L.sort((a,b) => String(a.price) < String(b.price) ? -1 : 1); if (st.sort === 'pd') L.reverse(); trig('s1'); }
    if (st.sort === 'n') L.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
    return L;
  },
  title(q){
    if (/<\s*\/?\s*[a-z]/i.test(q)) {
      trig('s5');
      if (/on\w+\s*=|<\s*script|javascript:/i.test(q)) return {html:'', alert:true};
      return {html: esc(q).replace(/&lt;(\/?)(b|i|u|s|h1|h2|h3|mark|marquee|em|strong)&gt;/gi, '<$1$2>')};
    }
    return {html: esc(q)};
  },
  view(st){
    const L = APPS.search.list(st), per = 5, pages = Math.floor(L.length / per) || 1;
    if (L.length > per && L.length % per) trig('s4');
    const page = Math.min(st.page, pages), shown = L.slice((page-1)*per, page*per);
    const t = st.q ? APPS.search.title(st.q) : null;
    return `<div class="sbapp"><div class="sbbar">🛒 ТехноМаркет · Каталог</div>
    <div class="sbrow">${fld(st,'q','Поиск','text',`onkeydown="if(event.key==='Enter')sbAct('find')"`)}<button class="btn sm" onclick="sbAct('find')">Найти</button></div>
    <div class="sbrow"><label class="chk"><input type="checkbox" ${st.stock?'checked':''} onchange="sbAct('stock',this.checked)"> Только в наличии</label>
    <select onchange="sbAct('sort',this.value)"><option value="">Без сортировки</option>${[['pa','Цена ↑'],['pd','Цена ↓'],['n','По названию']].map(([v,l])=>`<option value="${v}" ${st.sort===v?'selected':''}>${l}</option>`).join('')}</select></div>
    ${t ? (t.alert ? `<div class="sbalert">⚠️ alert: страница выполнила JavaScript из поискового запроса</div>` : `<h4>Результаты по запросу: ${t.html}</h4>`) : ''}
    ${shown.length ? shown.map(p => `<div class="sbrow"><span>${esc(p.name)}</span><span>${rub(p.price.toLocaleString('ru-RU'))}</span><span class="small ${p.stock?'good':'muted'}">${p.stock?`в наличии: ${p.stock}`:'нет в наличии'}</span></div>`).join('') : `<p class="muted">Ничего не найдено. <a href="#" onclick="sbAct('clear');return false">Сбросить фильтры</a></p>`}
    ${pages > 1 ? `<div class="sbrow">${Array.from({length:pages},(_,i)=>`<button class="btn sm ${page===i+1?'':'ghost'}" onclick="sbAct('page',${i+1})">${i+1}</button>`).join('')}</div>` : ''}
    <p class="small muted">Найдено товаров: ${L.length}</p></div>`;
  },
  act(st, a, v){
    if (a === 'find') { st.q = st.f.q; st.page = 1; }
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
  init: () => ({f:{card:'', amount:'', code:''}, balance:60000, step:'form', pre:null, attempts:0, hist:[], msg:null}),
  view(st){
    const bal = `<div class="sbrow"><span>Карта •• 9012 (ваша): 4276 1234 5678 9012</span><b>Баланс: ${rub(st.balance.toLocaleString('ru-RU'))}</b></div>`;
    let body;
    if (st.step === 'form') body = `${fld(st,'card','Номер карты получателя')}${fld(st,'amount','Сумма, ₽')}<button class="btn" onclick="sbAct('preview')">Продолжить</button>`;
    else if (st.step === 'confirm') body = `<table class="dt"><tr><td>Получатель</td><td>${esc(st.pre.card)}</td></tr><tr><td>Сумма</td><td>${rub(st.pre.amount)}</td></tr><tr><td>Комиссия</td><td>${rub(st.pre.fee)}</td></tr><tr><th>Будет списано</th><th>${rub(st.pre.amount + st.pre.fee)}</th></tr></table>
      <p class="small muted">Код из SMS отправлен на +7 *** ***-**-45 (на стенде код всегда 1234)</p>${fld(st,'code','Код из SMS')}<button class="btn" onclick="sbAct('confirm')">Подтвердить перевод</button><button class="btn ghost" onclick="sbAct('back')">Назад</button>`;
    return `<div class="sbapp"><div class="sbbar">🏦 ТехноБанк · Перевод с карты на карту</div>${bal}${body}
    ${st.msg?`<p class="${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    ${st.hist.length?`<h4>История операций</h4><table class="dt">${st.hist.map(h=>`<tr><td>${h.at}</td><td>→ ${esc(h.card)}</td><td>−${rub(h.total)}</td></tr>`).join('')}</table>`:''}</div>`;
  },
  act(st, a){
    const say = (text, ok) => st.msg = {text, ok};
    if (a === 'back') { st.step = 'form'; st.msg = null; return; }
    if (a === 'preview') {
      const digits = st.f.card.replace(/\s/g, ''), raw = st.f.amount.trim();
      if (!/^\d{16}$/.test(digits)) return say('Номер карты должен содержать 16 цифр');
      if (digits === APPS.transfer.OWN) trig('t3');
      const amount = parseFloat(raw);
      if (isNaN(amount)) return say('Введите сумму');
      if (raw.includes(',') && amount !== parseFloat(raw.replace(',', '.'))) trig('t2');
      if (amount < 10) return say('Минимальная сумма перевода — 10 ₽');
      if (amount > 500000) return say('Максимальная сумма перевода — 50 000 ₽');
      if (amount > 50000) trig('t5');
      const fee = Math.round(amount * 0.01 * 100) / 100;
      if (fee < 30) trig('t1');
      if (amount > st.balance) return say('Недостаточно средств');
      if (amount + fee > st.balance) trig('t4');
      trig('t7');
      net('GET', `/api/v1/transfer/preview?card_to=${digits}&card_from=${APPS.transfer.OWN}&amount=${amount}`, 200, null, {amount, fee, total: amount + fee});
      st.pre = {card: st.f.card.trim(), digits, amount, fee}; st.step = 'confirm'; st.attempts = 0; st.f.code = ''; st.msg = null;
    }
    if (a === 'confirm') {
      if (st.f.code.trim() !== '1234') {
        st.attempts++; if (st.attempts > 3) trig('t6');
        net('POST', '/api/v1/transfer/confirm', 400, {code: st.f.code}, {error:'INVALID_CODE', attempts_left: Math.max(0, 3 - st.attempts)});
        return say(`Неверный код. Осталось попыток: ${Math.max(0, 3 - st.attempts)}`);
      }
      const p = st.pre; st.balance = Math.round((st.balance - p.amount - p.fee) * 100) / 100;
      st.hist.unshift({at: hm(Date.now()), card: p.card, total: Math.round((p.amount + p.fee) * 100) / 100});
      net('POST', '/api/v1/transfer/confirm', 200, {code:'1234'}, {status:'DONE', balance: st.balance});
      st.step = 'form'; st.f = {card:'', amount:'', code:''}; say('Перевод выполнен', true);
    }
  }
},

// 5. Бронирование номера в отеле
booking: {
  init: () => ({f:{in:'', out:'', guests:'2'}, calc:null, list:[], msg:null}),
  day: s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); },
  view(st){
    const c = st.calc;
    return `<div class="sbapp"><div class="sbbar">🏨 ТехноТревел · Бронирование номера «Стандарт»</div>
    ${fld(st,'in','Дата заезда','date')}${fld(st,'out','Дата выезда','date')}${fld(st,'guests','Гостей','number','min="1" max="4"')}
    <button class="btn" onclick="sbAct('calc')">Рассчитать</button>
    ${st.msg?`<p class="${st.msg.ok?'good':'err'}">${esc(st.msg.text)}</p>`:''}
    ${c?`<table class="dt"><tr><td>Ночей</td><td>${c.n}</td></tr>${c.rows.map(r=>`<tr><td class="small">${r.d}</td><td class="small">${rub(r.p)}</td></tr>`).join('')}<tr><td>Доп. места</td><td>${rub(c.extra)}</td></tr><tr><th>Итого</th><th>${rub(c.total)}</th></tr></table><button class="btn" onclick="sbAct('book')">Забронировать</button>`:''}
    ${st.list.length?`<h4>Мои брони</h4>${st.list.map((b,i)=>`<div class="sbrow"><span>№${b.no}: ${b.in} — ${b.out}, ${rub(b.total)} ${b.cancelled?'<span class="err">отменена</span>':''}</span>${!b.cancelled && APPS.booking.day(b.in) >= APPS.booking.day(dayKey()) ? `<button class="btn sm ghost" onclick="sbAct('cancel',${i})">Отменить</button>` : ''}</div>`).join('')}`:''}</div>`;
  },
  act(st, a, i){
    const B = APPS.booking, say = (text, ok) => st.msg = {text, ok};
    if (a === 'calc') {
      st.calc = null;
      if (!st.f.in || !st.f.out) return say('Укажите даты заезда и выезда');
      const din = B.day(st.f.in), dout = B.day(st.f.out), today0 = B.day(dayKey());
      if (din < today0) trig('k1');
      const diff = Math.round((dout - din) / 864e5);
      if (diff <= 0) trig('k2');
      if (diff > 31) return say('Максимальный срок проживания — 30 ночей');
      if (diff === 31) trig('k6');
      const n = diff + 1; if (diff > 0) trig('k3');
      const g = parseInt(st.f.guests, 10);
      if (!(g >= 1 && g <= 4)) return say('Количество гостей — от 1 до 4');
      if (g >= 2) trig('k5');
      const rows = []; let sum = 0;
      for (let k = 0; k < n; k++) { const d = new Date(din.getFullYear(), din.getMonth(), din.getDate() + k), wd = d.getDay(), we = wd === 0 || wd === 6; if (wd === 5 || wd === 0) trig('k4'); const p = we ? 5500 : 4000; sum += p; rows.push({d: d.toLocaleDateString('ru-RU', {weekday:'short', day:'numeric', month:'short'}), p}); }
      const extra = Math.max(0, g - 1) * 1000 * n;
      st.calc = {n, rows: rows.slice(0, 10), extra, total: diff <= 0 ? (diff - 1) * 4000 : sum + extra};
      if (n > 10) st.calc.rows.push({d:`… ещё ${n - 10}`, p: rows.slice(10).reduce((a,r)=>a+r.p,0)});
      net('POST', '/api/v1/booking/quote', 200, {check_in: st.f.in, check_out: st.f.out, guests: g}, {nights: n, total: st.calc.total});
      st.msg = null;
    }
    if (a === 'book') { const no = 70000 + Math.floor(Math.random()*9999); st.list.push({no, in: st.f.in, out: st.f.out, total: st.calc.total}); net('POST', '/api/v1/booking', 201, {check_in: st.f.in, check_out: st.f.out}, {id: no, status:'CONFIRMED'}); say(`Бронь №${no} подтверждена`, true); st.calc = null; }
    if (a === 'cancel') { const b = st.list[i]; if ((B.day(b.in) - B.day(dayKey())) / 864e5 < 2) trig('k7'); b.cancelled = true; net('POST', `/api/v1/booking/${b.no}/cancel`, 200, null, {status:'CANCELLED', refund: b.total}); say(`Бронь №${b.no} отменена, возврат ${b.total} ₽`, true); }
  }
}
};

// ───────── API-клиент и mock-серверы ─────────
const BASE = 'https://stand.technomarket.local';
const J = (status, body, headers = {}) => ({status, body, headers: {'content-type':'application/json; charset=utf-8', ...headers}});
const isEmail = e => typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e);

const APIS = {

users: {
  start: {m:'GET', u:'/api/v1/users?limit=20&offset=0', h:'Authorization: Bearer test-token-123', b:''},
  init: () => ({users:[{id:1, name:'Анна Смирнова', email:'anna@test.ru', age:28, password_hash:'$2b$10$N9qo8uLOickgx2ZMRZoMye', created_at:'2025-03-01T10:00:00Z'}, {id:2, name:'Борис Петров', email:'boris@test.ru', age:35, password_hash:'$2b$10$Xa8sdfkHyw2ZMRbcq2Lme', created_at:'2025-03-02T12:30:00Z'}], next:3, client:null}),
  handle(st, r){
    const pub = u => ({id:u.id, name:u.name, email:u.email, age:u.age, created_at:u.created_at});
    const authed = r.headers.authorization === 'Bearer test-token-123';
    const m = r.path.match(/^\/api\/v1\/users(?:\/([^/]+))?\/?$/);
    if (!m) return J(404, {error:'Not Found'});
    if (r.method === 'DELETE') {
      if (!authed) trig('u5');
      const u = st.users.find(x => String(x.id) === m[1]); if (!u) return J(404, {error:'User not found'});
      st.users = st.users.filter(x => x !== u); return {status:204, body:'', headers:{}};
    }
    if (!authed) return J(401, {error:'Unauthorized', message:'Missing or invalid token'});
    if (!m[1]) {
      if (r.method === 'GET') {
        const lim = r.query.limit != null ? Number(r.query.limit) : 20, off = Number(r.query.offset || 0);
        if (!Number.isInteger(lim) || lim < 1 || lim > 100) { trig('u6'); return J(200, {items: st.users.map(pub), total: st.users.length, limit: r.query.limit}); }
        return J(200, {items: st.users.slice(off, off + lim).map(pub), total: st.users.length, limit: lim, offset: off});
      }
      if (r.method === 'POST') {
        const b = r.body; if (!b || typeof b !== 'object') return J(400, {error:'Body must be a JSON object'});
        if (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.length > 50) return J(400, {error:'name must be 2-50 characters', field:'name'});
        if (!isEmail(b.email)) return J(400, {error:'invalid email', field:'email'});
        if (!(Number.isInteger(b.age) && b.age >= 18 && b.age <= 120)) trig('u2');
        if (st.users.some(u => u.email.toLowerCase() === String(b.email).toLowerCase())) trig('u4');
        const u = {id: st.next++, name:b.name, email:b.email, age:b.age, password_hash:'$2b$10$' + Math.random().toString(36).slice(2, 22), created_at: new Date().toISOString()};
        st.users.push(u); trig('u1'); return J(200, pub(u));
      }
      return J(405, {error:'Method Not Allowed'});
    }
    const u = st.users.find(x => String(x.id) === m[1]);
    if (r.method === 'GET') {
      if (!u) { trig('u3'); return J(500, {error:'Internal Server Error', trace:'java.lang.NullPointerException at UserService.getById(UserService.java:88)'}); }
      trig('u8'); return J(200, {...pub(u), password_hash: u.password_hash});
    }
    if (r.method === 'PATCH') {
      if (!u) return J(404, {error:'User not found'});
      const b = r.body || {};
      if ('name' in b && (typeof b.name !== 'string' || b.name.trim().length < 2 || b.name.length > 50)) return J(400, {error:'name must be 2-50 characters', field:'name'});
      if ('email' in b && !isEmail(b.email)) trig('u7');
      if ('age' in b && !(Number.isInteger(b.age) && b.age >= 18 && b.age <= 120)) trig('u2');
      ['name','email','age'].forEach(k => { if (k in b) u[k] = b[k]; });
      return J(200, pub(u));
    }
    return J(405, {error:'Method Not Allowed'});
  }
},

orders: {
  start: {m:'GET', u:'/api/v1/orders', h:'Authorization: Bearer token-a', b:''},
  PR: {1:{name:'Клавиатура', price:2500}, 2:{name:'Мышь', price:1000}, 3:{name:'Коврик', price:500}},
  init: () => ({orders:[{id:1001, user_id:2, status:'paid', items:[{product_id:2, qty:3}], total:3000}, {id:1002, user_id:1, status:'new', items:[{product_id:1, qty:1}], total:2500}], next:1003, client:null}),
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
        if (!P[it.product_id]) { trig('o6'); return J(500, {error:'Internal Server Error', trace:"TypeError: Cannot read properties of undefined (reading 'price')"}); }
        if (!Number.isInteger(it.qty)) return J(400, {error:'qty must be an integer', field:'qty'});
        if (it.qty > 10) return J(400, {error:'qty must be between 1 and 10', field:'qty'});
        if (it.qty < 1) trig('o3');
      }
      if (items.some(it => it.qty !== 1)) trig('o2');
      const o = {id: st.next++, user_id: uid, status:'new', items: items.map(it => ({product_id: it.product_id, qty: it.qty, price: P[it.product_id].price})), total: items.reduce((a, it) => a + P[it.product_id].price, 0)};
      st.orders.push(o); trig('o7'); return J(201, o, {'content-type':'text/html; charset=utf-8'});
    }
    if ((m = r.path.match(/^\/api\/v1\/orders\/(\d+)(?:\/(pay|cancel))?\/?$/))) {
      const o = st.orders.find(x => x.id === Number(m[1]));
      if (!o) return J(404, {error:'Order not found'});
      if (o.user_id !== uid) trig('o1');
      if (!m[2]) return r.method === 'GET' ? J(200, o) : J(405, {error:'Method Not Allowed'});
      if (r.method !== 'POST') return J(405, {error:'Method Not Allowed'});
      if (m[2] === 'pay') {
        if (o.status === 'cancelled') return J(409, {error:'Order is cancelled'});
        if (o.status === 'paid') trig('o4');
        o.status = 'paid'; return J(200, {id:o.id, status:o.status, charged:o.total, payment_id:'pay_' + Math.random().toString(36).slice(2, 10)});
      }
      if (o.status === 'cancelled') trig('o5');
      o.status = 'cancelled'; return J(200, {id:o.id, status:o.status});
    }
    return J(404, {error:'Not Found'});
  }
},

auth: {
  start: {m:'POST', u:'/api/v1/auth/login', h:'', b:'{\n  "email": "test@mail.ru",\n  "password": "Qwerty123"\n}'},
  init: () => ({fails:{}, tokens:{}, client:null}),
  handle(st, r){
    const p = r.path.replace(/\/$/, '');
    if (p === '/api/v1/auth/login') {
      if (r.method !== 'POST') return J(405, {error:'Method Not Allowed'});
      const b = r.body || {}, email = b.email;
      if (typeof email !== 'string' || typeof b.password !== 'string') return J(400, {error:'email and password are required'});
      if (email !== email.trim()) { trig('a6'); return J(500, {error:'Internal Server Error'}); }
      const k = email.toLowerCase(); st.fails[k] = st.fails[k] || 0;
      if (st.fails[k] >= 5) trig('a2');
      if (email !== 'test@mail.ru') { if (k === 'test@mail.ru') trig('a4'); st.fails[k]++; trig('a1'); return J(401, {error:'USER_NOT_FOUND', message:'Пользователь с таким email не найден'}); }
      if (b.password !== 'Qwerty123') { st.fails[k]++; trig('a1'); return J(401, {error:'WRONG_PASSWORD', message:'Неверный пароль'}); }
      st.fails[k] = 0;
      const t = 'tok_' + Math.random().toString(36).slice(2, 14); st.tokens[t] = 'active'; trig('a5');
      return J(200, {access_token:t, token_type:'Bearer', expires_in:9000});
    }
    const t = (r.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (p === '/api/v1/auth/me') {
      if (r.method !== 'GET') return J(405, {error:'Method Not Allowed'});
      if (!st.tokens[t]) return J(401, {error:'Unauthorized'});
      if (st.tokens[t] === 'out') trig('a3');
      return J(200, {id:7, email:'test@mail.ru', name:'Тестовый Пользователь'});
    }
    if (p === '/api/v1/auth/logout') {
      if (r.method !== 'POST') return J(405, {error:'Method Not Allowed'});
      if (!st.tokens[t]) return J(401, {error:'Unauthorized'});
      st.tokens[t] = 'out'; return {status:204, body:'', headers:{}};
    }
    return J(404, {error:'Not Found'});
  }
}
};

const CL = () => { const it = ITEMS[SB.id]; return SB.st.client = SB.st.client || {...APIS[it.api].start}; };
function apiClientHtml(){
  const c = CL(), last = SB.net[0];
  return `<div class="sbapp apic"><div class="sbbar">📮 API-клиент · ${BASE}</div>
  <div class="sbrow"><select onchange="CL().m=this.value">${['GET','POST','PUT','PATCH','DELETE'].map(m=>`<option ${c.m===m?'selected':''}>${m}</option>`).join('')}</select>
  <input class="sbi mono grow" value="${esc(c.u)}" oninput="CL().u=this.value" onkeydown="if(event.key==='Enter')apiSend()"><button class="btn sm" onclick="apiSend()">Send</button></div>
  <label class="sbl">Заголовки (по одному на строку: Имя: значение)<textarea class="mono" rows="2" oninput="CL().h=this.value">${esc(c.h)}</textarea></label>
  <label class="sbl">Тело запроса (JSON)<textarea class="mono" rows="6" oninput="CL().b=this.value" placeholder='{"key": "value"}'>${esc(c.b)}</textarea></label>
  ${last ? `<h4>Ответ: <span class="${last.status>=400?'err':'good'}">${last.status} ${STATUS_TEXT[last.status]||''}</span> <span class="muted small">· ${last.ms} мс</span></h4>
  <div class="small muted">${Object.entries(last.headers).map(([k,v])=>`${esc(k)}: ${esc(v)}`).join('<br>') || 'нет заголовков'}</div>
  <pre class="codeblk mono small">${esc(last.res === '' ? '(пустое тело)' : pj(last.res))}</pre>` : '<p class="muted small">Отправьте первый запрос. Документация API — выше.</p>'}</div>`;
}
const STATUS_TEXT = {200:'OK', 201:'Created', 204:'No Content', 400:'Bad Request', 401:'Unauthorized', 403:'Forbidden', 404:'Not Found', 405:'Method Not Allowed', 409:'Conflict', 422:'Unprocessable Entity', 429:'Too Many Requests', 500:'Internal Server Error'};
function apiSend(){
  const it = ITEMS[SB.id], c = CL();
  let url; try { url = new URL(c.u.trim(), BASE); } catch(e) { toast('Некорректный URL'); return; }
  const headers = {};
  c.h.split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim(); });
  let body = null, res;
  if (c.b.trim() && c.m !== 'GET') { try { body = JSON.parse(c.b); } catch(e) { res = J(400, {error:'Malformed JSON', detail: e.message}); } }
  if (!res) res = APIS[it.api].handle(SB.st, {method: c.m, path: url.pathname, query: Object.fromEntries(url.searchParams), headers, body});
  net(c.m, url.pathname + url.search, res.status, body ?? (c.b.trim() || null), res.body, res.headers);
  sbDraw();
}
function apiHistoryHtml(){
  return `<div class="dthead"><b>🕘 История запросов</b><span class="small muted">нажмите, чтобы повторить</span></div>${SB.net.length ? `<table class="dt">${SB.net.map((r,i)=>`<tr class="clk" onclick="apiLoad(${i})"><td>${r.method}</td><td class="mono small">${esc(r.url)}</td><td class="${r.status>=400?'err':'good'}">${r.status}</td></tr>`).join('')}</table>` : '<p class="muted small">Пусто</p>'}`;
}
function apiLoad(i){ const r = SB.net[i], c = CL(); c.m = r.method; c.u = r.url; c.b = r.req == null ? '' : pj(r.req); sbDraw(); }

// ───────── Экран задания: стенд + баг-репорты ─────────
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

function tHunt(it){
  const H = H_(it.id), d = H.draft || {};
  const repForm = H.done ? '' : `<div class="card"><h3>🐞 Новый баг-репорт</h3>
    <label>Заголовок (что не так, где и при каких условиях)</label><input class="sbi" value="${esc(d.title||'')}" oninput="H_('${it.id}').draft.title=this.value;save()" placeholder="Например: Регистрация: принимается пароль из 7 символов">
    <label>Шаги воспроизведения</label><textarea rows="4" oninput="H_('${it.id}').draft.steps=this.value;save()" placeholder="1. Открыть …\n2. Ввести …\n3. Нажать …">${esc(d.steps||'')}</textarea>
    <div class="split"><div><label>Ожидаемый результат</label><textarea rows="2" oninput="H_('${it.id}').draft.exp=this.value;save()">${esc(d.exp||'')}</textarea></div><div><label>Фактический результат</label><textarea rows="2" oninput="H_('${it.id}').draft.act=this.value;save()">${esc(d.act||'')}</textarea></div></div>
    <label>Серьёзность (severity)</label><select onchange="H_('${it.id}').draft.sev=this.value;save()">${REP_SEV.map(s=>`<option ${(d.sev||'Major')===s?'selected':''}>${s}</option>`).join('')}</select>
    <div class="row"><button class="btn" onclick="addReport('${it.id}')">Завести баг</button></div></div>`;
  const reps = H.reports.length ? H.reports.map((r,i) => { const q = repQuality(r); return `<div class="rep"><div class="row" style="justify-content:space-between"><b>BUG-${i+1}. ${esc(r.title)}</b><span><span class="tag">${r.sev}</span>${H.done?'':` <button class="btn sm ghost" onclick="editReport('${it.id}',${i})">Изменить</button><button class="btn sm ghost" onclick="delReport('${it.id}',${i})">✕</button>`}</span></div>
    <details><summary class="small">Подробнее</summary><p class="pre small">${esc(r.steps)}</p><p class="small"><b>Ожидаемо:</b> ${esc(r.exp)}<br><b>Фактически:</b> ${esc(r.act)}</p></details>
    ${q.miss.length?`<div class="small warn">Чего не хватает: ${q.miss.join('; ')}</div>`:''}</div>`; }).join('') : '<p class="muted small">Пока ни одного баг-репорта.</p>';
  return `<div class="card"><h3>Ситуация</h3><p>${esc(it.scenario)}</p><h3>${it.kind==='api'?'Документация API':'Требования'}</h3><div class="txt">${it.spec}</div>
    <p class="small muted">Всё, что расходится с требованиями, — дефект. Проверяйте позитивные и негативные сценарии, границы, повторные действия, ${it.kind==='api'?'коды ответов, заголовки, авторизацию и тело ответа':'сообщения об ошибках и вкладки DevTools (Network, Console)'}. Багов на стенде: ${it.bugs.length}.</p></div>
  <div class="hunt"><div class="card sbwrap"><div class="row" style="justify-content:space-between"><h3>🧪 Тестовый стенд</h3><button class="btn sm ghost" onclick="sbReset()">Сбросить стенд</button></div><div id="sbx"></div></div>
  <div class="card devt" id="devt"></div></div>
  <div class="card"><h3>Ваши баг-репорты (${H.reports.length})</h3>${reps}</div>
  ${repForm}
  ${!H.done ? `<div class="card"><button class="btn" onclick="finishHunt('${it.id}')" ${H.reports.length?'':'disabled'}>Завершить тестирование и сверить с известными дефектами</button><span class="small muted">&nbsp;После этого заводить баги будет нельзя.</span></div>` : huntResultHtml(it)}
  ${aiBox(it.id)}`;
}
function addReport(id){
  const H = H_(id), d = H.draft;
  if (!(d.title||'').trim() || !(d.act||'').trim()) { toast('Заполните хотя бы заголовок и фактический результат'); return; }
  const r = {title:d.title.trim(), steps:(d.steps||'').trim(), exp:(d.exp||'').trim(), act:d.act.trim(), sev:d.sev||'Major'};
  if (H.editing != null) { H.reports[H.editing] = r; H.editing = null; } else H.reports.push(r);
  H.draft = {}; save(); render(); toast('Баг заведён');
}
function editReport(id, i){ const H = H_(id); H.draft = {...H.reports[i]}; H.editing = i; save(); render(); }
function delReport(id, i){ const H = H_(id); H.reports.splice(i, 1); save(); render(); }
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
  const H = H_(it.id), sc = huntScore(it);
  return `<div class="card ref"><h3>Известные дефекты стенда</h3><p class="muted small">Автосверка отметила баги, которые похожи на ваши репорты. Проверьте честно и поправьте отметки: засчитывайте баг, только если вы описали именно его. ${AI.enabled?'Или поручите сверку ИИ.':''}</p>
  ${it.bugs.map((b,i) => `<label class="chk"><input type="checkbox" ${H.checks[i]?'checked':''} ${AIR[it.id]?.res?'disabled':''} onchange="H_('${it.id}').checks[${i}]=this.checked;save();render()"><span><span class="tag ${b.sev==='critical'?'sev-critical':b.sev==='major'?'sev-major':''}">${SEV_RU[b.sev]}</span> <b>${esc(b.title)}</b>${H.trig.includes(b.id)?' <span class="small good">· вы воспроизводили его на стенде</span>':''}<br><span class="small muted">Как найти: ${esc(b.how)}</span></span></label>`).join('')}
  <div class="kpis"><div class="kpi"><b>${Math.round(sc.found*100)}%</b><span>найдено (с весом серьёзности)</span></div><div class="kpi"><b>${Math.round(sc.quality*100)}%</b><span>качество репортов${AIR[it.id]?.res?' (ИИ)':''}</span></div><div class="kpi"><b>${sc.total}%</b><span>итог: 70% поиск + 30% репорты</span></div></div>
  <div class="row">${AI.enabled && !AIR[it.id]?.res ? `<button class="btn ghost" onclick="aiHunt('${it.id}')">Сверить и оценить репорты с ИИ</button>` : ''}<button class="btn" onclick="finishHuntScore('${it.id}')">Засчитать (${sc.total}%)</button><button class="btn ghost" onclick="if(confirm('Начать заново? Ваши репорты будут удалены.')){delete S.hunt['${it.id}'];delete AIR['${it.id}'];sbStart('${it.id}');save();render()}">Пройти заново</button></div></div>`;
}
async function aiHunt(id){
  const it = ITEMS[id], H = H_(id);
  const r = await runReview(id, {title: it.title, task: 'Найти дефекты на тестовом стенде и описать их баг-репортами. Критерии — список известных дефектов: отметь true, только если среди репортов есть описание ИМЕННО этого дефекта. Итоговый score — качество баг-репортов: понятный заголовок, воспроизводимые шаги, ожидаемый и фактический результат, адекватная серьёзность, нет дублей и «не-багов».', context: strip(it.spec), checklist: it.bugs.map(b => b.title)}, H.reports.map((r,i) => `BUG-${i+1}. ${repText(r)}`).join('\n\n'));
  if (r) { H.checks = r.checklist; save(); render(); }
}
function finishHuntScore(id){
  const it = ITEMS[id], H = H_(id), sc = huntScore(it);
  complete(id, sc.total / 100, {missed: it.bugs.filter((_,i) => !H.checks[i]).map(b => b.title), answer: H.reports.map(repText).join('\n\n')});
  go(lastList);
}
Object.assign(TASK_VIEWS, {hunt: it => tHunt(it), api: it => tHunt(it)});

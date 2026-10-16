// Песочница логов (инциденты) и баг-трекер (разбор входящих багов).

// ───────── Анализ логов ─────────
// key — ключевые строки инцидента [время, сервис, уровень, request-id, сообщение, корневая?];
// остальные строки — фоновый «шум» за тот же интервал (генерируется в qa2.js).
window.LOGTASKS = [
{ id:"logs-1", kind:"logs", level:2, cat:"Логи и инциденты", title:"Логи: заказ не создаётся",
  scenario:"Поддержка: «Клиент (user_id 1532) около 12:05 пытался оформить заказ — крутилось секунд 15, потом „Что-то пошло не так“». Доступ к логам всех сервисов за 12:03–12:07.",
  question:"Найдите запрос клиента, проследите его по сервисам и определите первопричину. Закрепите строки, которые приложите к баг-репорту.",
  window:["12:03:00","12:07:00"], seed:11,
  key:[
   ["12:04:51.120","api-gateway","INFO","7f3a","POST /api/v1/orders user=1532"],
   ["12:04:51.134","order-service","INFO","7f3a","validate items ok (3)"],
   ["12:04:51.140","order-service","INFO","7f3a","call inventory-service reserve items=3"],
   ["12:04:50.020","inventory-service","WARN","—","HikariPool-1 - active=50/50, pending=37"],
   ["12:04:56.139","inventory-service","ERROR","7f3a","HikariPool-1 - Connection is not available, request timed out after 5000ms",1],
   ["12:04:56.141","order-service","WARN","7f3a","inventory.reserve timeout after 5000ms, retry 1/2"],
   ["12:05:01.140","inventory-service","ERROR","7f3a","HikariPool-1 - Connection is not available, request timed out after 5000ms"],
   ["12:05:01.142","order-service","WARN","7f3a","inventory.reserve timeout after 5000ms, retry 2/2"],
   ["12:05:06.142","inventory-service","ERROR","7f3a","HikariPool-1 - Connection is not available, request timed out after 5000ms"],
   ["12:05:06.143","order-service","ERROR","7f3a","OrderCreateException: inventory unavailable"],
   ["12:05:06.144","api-gateway","INFO","7f3a","POST /api/v1/orders → 500 (15024 ms)"],
   ["12:05:07.010","inventory-service","INFO","—","GET /health → 200"],
   ["12:04:12.400","payment-service","WARN","51c0","3DS challenge timeout for payment 99812, user=877"]
  ],
  answer:{req:"7f3a", svc:"inventory-service"},
  checklist:["Первопричина: в inventory-service исчерпан пул соединений к БД (HikariPool 50/50)","order-service трижды ждал по 5 с и вернул ошибку","Пользователь получил 500 через ~15 с вместо понятного сообщения","Health-check отвечает 200, хотя сервис не работает — мониторинг не видит проблему","Следующие шаги: сообщить дежурному, проверить нагрузку и пул БД inventory, завести баги"],
  reference:"Запрос 7f3a: gateway → order-service → inventory-service. В inventory пул соединений к БД исчерпан (active=50/50, pending=37), каждый вызов reserve падает через 5 с, order-service делает 2 ретрая и отдаёт 500 через 15 с. Предупреждение payment-service относится к другому пользователю — это шум. Дефекты: 500 вместо 503 и понятного сообщения, суммарный таймаут 15 с, health-check не проверяет БД." },
{ id:"logs-2", kind:"logs", level:3, cat:"Логи и инциденты", title:"Логи: письма о заказах не приходят",
  scenario:"С 10:00 в поддержку жалуются: после оплаты не приходит письмо-подтверждение. Последняя жалоба — по заказу 88120 (оплачен в 10:14). Логи за 09:58–10:16.",
  question:"Найдите обработку письма по заказу 88120 и первопричину сбоя. С какого момента и после чего начались проблемы?",
  window:["09:58:00","10:16:00"], seed:22,
  key:[
   ["09:59:40.210","notification-service","INFO","b801","email sent order=88011 to=a***@mail.ru"],
   ["10:01:58.000","notification-service","INFO","—","Deploy notification-service v2.4.0 started"],
   ["10:02:09.512","notification-service","INFO","—","Config loaded: smtp.host=smtp.mail.local port=587 user=noreply@technomarket.ru"],
   ["10:02:10.004","notification-service","INFO","—","Deploy notification-service v2.4.0 finished"],
   ["10:04:22.117","notification-service","ERROR","c0a7","SMTP 535 5.7.8 Authentication credentials invalid (order=88057)",1],
   ["10:09:41.880","notification-service","ERROR","c2f9","SMTP 535 5.7.8 Authentication credentials invalid (order=88093)"],
   ["10:14:03.441","order-service","INFO","c41d","order 88120 status=paid, publish OrderPaid"],
   ["10:14:03.902","notification-service","INFO","c41d","consume OrderPaid order=88120"],
   ["10:14:04.310","notification-service","ERROR","c41d","SMTP 535 5.7.8 Authentication credentials invalid (order=88120)"],
   ["10:14:04.311","notification-service","WARN","c41d","email for order=88120 dropped after 1 attempt (retry disabled)"],
   ["10:07:15.000","order-service","WARN","—","slow query 1840 ms: SELECT * FROM orders WHERE status='new'"]
  ],
  answer:{req:"c41d", svc:"notification-service"},
  checklist:["Проблема началась после деплоя notification-service v2.4.0 в 10:02","Первопричина: SMTP 535 — неверные учётные данные почтового сервера в новой конфигурации","Письма не переотправляются (retry отключён) — их нужно переотправить после исправления","Медленный запрос order-service — не связан с проблемой","Следующие шаги: откат/исправление конфига, переотправка писем за период, мониторинг ошибок SMTP"],
  reference:"Заказ 88120 обработан запросом c41d: order-service публикует OrderPaid, notification-service получает событие и падает с SMTP 535. Все ошибки начались после деплоя v2.4.0 в 10:02 — в новом конфиге неверные учётные данные SMTP. Письма не ретраятся, поэтому после исправления нужна переотправка за 10:02–сейчас. Медленный запрос order-service — шум." },
{ id:"logs-3", kind:"logs", level:4, cat:"Логи и инциденты", title:"Логи: двойное списание",
  scenario:"Клиент пишет, что за заказ 5521 с карты списали дважды по 4 990 ₽. Время оплаты — около 19:20. Логи сервисов и шлюза банка за 19:18–19:23.",
  question:"Найдите запрос оплаты, восстановите последовательность событий и определите, в каком сервисе ошибка и почему произошло второе списание.",
  window:["19:18:00","19:23:00"], seed:33,
  key:[
   ["19:20:11.003","api-gateway","INFO","a9e2","POST /api/v1/orders/5521/pay user=4410"],
   ["19:20:11.020","payment-service","INFO","a9e2","charge order=5521 amount=4990 → bank-gateway"],
   ["19:20:11.035","bank-gateway","INFO","a9e2","charge request order=5521 amount=4990 id=ch_71a"],
   ["19:20:20.950","bank-gateway","INFO","a9e2","charge ch_71a SUCCESS (9915 ms)"],
   ["19:20:21.021","payment-service","WARN","a9e2","bank-gateway timeout after 10000ms, retrying charge without idempotency key",1],
   ["19:20:21.040","bank-gateway","INFO","a9e2","charge request order=5521 amount=4990 id=ch_71b"],
   ["19:20:22.102","bank-gateway","INFO","a9e2","charge ch_71b SUCCESS (1062 ms)"],
   ["19:20:22.110","payment-service","INFO","a9e2","order=5521 paid, payment=ch_71b"],
   ["19:20:22.130","api-gateway","INFO","a9e2","POST /api/v1/orders/5521/pay → 200 (11127 ms)"],
   ["19:19:02.000","payment-service","INFO","—","feature flag payment.retry_on_timeout=ON"],
   ["19:21:40.500","order-service","WARN","d17c","order 5530 cancelled by user before payment"]
  ],
  answer:{req:"a9e2", svc:"payment-service"},
  checklist:["Банк провёл первое списание (ch_71a) за 9,9 с — почти на границе таймаута","payment-service не дождался ответа (таймаут 10 с) и повторил списание без ключа идемпотентности","Второе списание ch_71b тоже успешно — клиенту списали дважды, а в заказе учтён только ch_71b","Причина — включённый флаг retry_on_timeout для неидемпотентной операции","Что сделать: вернуть деньги по ch_71a, найти всех пострадавших SQL-запросом, отключить флаг, добавить Idempotency-Key и тест на медленный ответ банка"],
  reference:"Запрос a9e2. Банк выполнил ch_71a за 9 915 мс, payment-service с таймаутом 10 000 мс ответ не дождался и (флаг retry_on_timeout=ON) повторил списание без ключа идемпотентности — банк провёл ch_71b. Ошибка в payment-service: ретрай неидемпотентной операции. Отмена заказа 5530 — шум." }
];

// ───────── Баг-трекер: разбор входящих (triage) ─────────
// act: accept | dup | reject | info; sev/prio — допустимые значения; dup — id оригинала
window.TRIAGE = [
{ id:"triage-1", kind:"triage", level:2, cat:"Баг-репорты", title:"Баг-трекер: утренний разбор по чекауту",
  scenario:"Понедельник, 10:00. За выходные в трекер упали баги от поддержки, менеджеров и ночных автотестов. QA-лид просит разобрать входящие до планирования: принять в работу с severity и priority, отметить дубликаты, отклонить не-баги, запросить данные, где их не хватает.",
  reqs:`<ul><li>Бесплатная доставка — при сумме заказа <b>от 3 000 ₽</b>, иначе 300 ₽.</li><li>Промокод вводится <b>без учёта регистра</b>.</li><li>Способы оплаты: карта, СБП. Гость может оформить заказ без регистрации.</li><li>Поле «Комментарий курьеру» необязательное, <b>до 250 символов</b>.</li></ul>`,
  items:[
   {id:"BUG-201", from:"Поддержка (12 обращений)", title:"Оплата картой: после 3-D Secure бесконечная загрузка, деньги списаны, заказ «Новый»", body:"Android и iOS, приложение 5.2.1. После подтверждения 3-DS крутится загрузка. В выписке клиентов списание есть, в заказе статус «Новый». Примеры заказов: 77120, 77135.",
    act:"accept", sev:["Blocker","Critical"], prio:["High"], why:"Деньги списаны, заказ не оплачен, массово — Critical/Blocker, чинить срочно."},
   {id:"BUG-202", from:"Менеджер по продажам", title:"Не работает оплата!!!", body:"Клиент звонил, говорит, не может оплатить. Срочно почините!!!",
    act:"info", why:"Нет данных: способ оплаты, платформа, время, номер заказа, что видит пользователь. Возможно, это BUG-201 — но без данных это не понять."},
   {id:"BUG-203", from:"Тестировщик Ольга", title:"Промокод в нижнем регистре не применяется: sale10 → «Промокод не найден»", body:"Шаги: корзина 2 000 ₽ → ввести sale10 → «Применить». Ожидаемо: скидка 10% (по требованиям регистр не важен). Фактически: «Промокод не найден». SALE10 работает.",
    act:"accept", sev:["Major","Minor"], prio:["Medium","High"], why:"Нарушено требование, есть обход (ввести заглавными) — Major/Minor."},
   {id:"BUG-204", from:"Ночные автотесты", title:"test_promo_lowercase FAILED: expected discount 10%, got 0", body:"POST /api/v1/cart/promo {code: \"sale10\"} → 404 PROMO_NOT_FOUND.",
    act:"dup", dup:"BUG-203", why:"Та же проблема, что BUG-203, обнаруженная автотестом."},
   {id:"BUG-205", from:"Поддержка", title:"Клиенту насчитали доставку при сумме 2 990 ₽", body:"Клиент возмущён: «у вас же бесплатная доставка!». Сумма заказа 2 990 ₽, доставка 300 ₽.",
    act:"reject", why:"По требованиям бесплатно от 3 000 ₽ — при 2 990 ₽ доставка платная. Не баг; можно предложить PO улучшить подсказку «до бесплатной доставки осталось 10 ₽»."},
   {id:"BUG-206", from:"Дизайнер", title:"Опечатка на кнопке: «Офромить заказ»", body:"Главная кнопка страницы оформления, все платформы.",
    act:"accept", sev:["Trivial","Minor"], prio:["High","Medium"], why:"Косметика, но на главной кнопке у всех — низкая severity, высокий priority."},
   {id:"BUG-207", from:"Менеджер", title:"Комментарий курьеру обрезается на 250 символах", body:"Клиент хотел написать подробную инструкцию, текст не влез.",
    act:"reject", why:"Ограничение 250 символов задано требованиями. Если бизнесу нужно больше — это запрос на изменение к PO, а не баг."},
   {id:"BUG-208", from:"Тестировщик Ольга", title:"Safari на iOS 15: при выборе СБП ничего не происходит, в консоли TypeError", body:"iPhone 8, iOS 15.7, Safari. Выбрать СБП → «Оплатить» — нет перехода. Console: TypeError: undefined is not a function (sbp.js:12). На iOS 16+ работает. Доля iOS 15 — 4% аудитории.",
    act:"accept", sev:["Major","Critical"], prio:["Medium","High"], why:"Способ оплаты недоступен части пользователей, но есть обход (карта) — Major, priority по доле аудитории."}
  ]},
{ id:"triage-2", kind:"triage", level:3, cat:"Баг-репорты", title:"Баг-трекер: личный кабинет перед релизом",
  scenario:"Четверг, релиз личного кабинета в понедельник. В трекере новые баги от поддержки беты, тестировщиков и автотестов. Разберите их, чтобы на triage-встрече с PO было ясно, что блокирует релиз.",
  reqs:`<ul><li>Аватар: <b>JPG или PNG до 5 МБ</b>.</li><li>Смена email — с подтверждением по ссылке из письма.</li><li>История заказов показывает заказы <b>за последние 2 года</b>.</li><li>Удаление аккаунта: аккаунт блокируется и <b>удаляется через 30 дней</b>, в течение которых его можно восстановить.</li></ul>`,
  items:[
   {id:"BUG-301", from:"Бета-тестер", title:"Аватар 8 МБ не загружается", body:"Пытаюсь загрузить фото с телефона (8 МБ), пишет «Файл слишком большой».",
    act:"reject", why:"Ограничение 5 МБ по требованиям, сообщение понятное. Не баг."},
   {id:"BUG-302", from:"Поддержка", title:"После смены email пользователь видит заказы другого клиента", body:"Клиент сменил email на адрес, который раньше принадлежал удалённому аккаунту, и увидел чужие заказы с адресами доставки. Скриншот приложен.",
    act:"accept", sev:["Critical","Blocker"], prio:["High"], why:"Утечка персональных данных — Critical, блокирует релиз."},
   {id:"BUG-303", from:"Бета-тестер", title:"В истории нет моих заказов 2022 года", body:"Вижу только заказы за последние два года, старых нет.",
    act:"reject", why:"История за 2 года — по требованиям. Не баг."},
   {id:"BUG-304", from:"Тестировщик Максим", title:"Загрузка PNG ~4 МБ иногда падает с 500", body:"Воспроизводится примерно 1 из 10 на PNG 3,8–4,5 МБ. Ответ POST /api/v1/profile/avatar → 500, в логах image-service: OutOfMemoryError при ресайзе. JPG такого же размера — ок.",
    act:"accept", sev:["Major","Critical"], prio:["Medium","High"], why:"Плавающий, но с данными и логами; функция работает с повторной попытки — Major."},
   {id:"BUG-305", from:"Бета-тестер", title:"Аватар не сохраняется", body:"Не получается поменять фото.",
    act:"info", why:"Нет данных: формат и размер файла, платформа, что за ошибка. Возможно, BUG-301 или BUG-304 — нужно уточнить."},
   {id:"BUG-306", from:"Ночные автотесты", title:"test_upload_avatar_png_4mb FAILED (1/10 runs): 500 Internal Server Error", body:"POST /api/v1/profile/avatar, file=large.png (4.2 MB) → 500.",
    act:"dup", dup:"BUG-304", why:"Та же проблема, что BUG-304."},
   {id:"BUG-307", from:"Тестировщик Ольга", title:"«Удалить аккаунт» удаляет данные сразу, восстановить нельзя", body:"После подтверждения удаления в БД записи пользователя и заказы удалены сразу, кнопки восстановления нет. По требованиям — блокировка и удаление через 30 дней.",
    act:"accept", sev:["Critical","Blocker"], prio:["High"], why:"Необратимая потеря данных пользователя — Critical, блокирует релиз."},
   {id:"BUG-308", from:"Дизайнер", title:"Тёмная тема: серый текст на сером фоне в истории заказов (контраст 1,8:1)", body:"Читается с трудом, по WCAG нужно не меньше 4,5:1.",
    act:"accept", sev:["Minor","Major"], prio:["Low","Medium"], why:"Доступность нарушена, но функция работает — Minor/Major, не блокирует релиз."}
  ]}
];

// ZERNO — ассистент на сайте: кнопка справа внизу → чат.
// Кнопки-подборщики работают сами по себе; свободные вопросы уходят в ИИ через мини-сервер Cloudflare (ASSISTANT_URL).
(function () {
  var ASSISTANT_URL = 'https://zerno-assistant.zetjetsss.workers.dev';
  var ASSISTANT_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';   // быстрая, точная и самая экономная по бесплатному лимиту   // адрес Cloudflare Worker, например https://zerno-assistant.<имя>.workers.dev

  var root = document.documentElement;
  var ICON_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5Z"/><circle cx="8.5" cy="10.5" r=".6" class="dot"/><circle cx="12" cy="10.5" r=".6" class="dot"/><circle cx="15.5" cy="10.5" r=".6" class="dot"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  /* ---------- разметка ---------- */
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ast-btn'; btn.setAttribute('aria-label', 'Открыть ассистента');
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'ast');
  btn.innerHTML = ICON_CHAT;
  var hint = document.createElement('p');
  hint.className = 'ast-hint'; hint.textContent = 'Помочь с выбором кофе?';
  var panel = document.createElement('section');
  panel.className = 'ast'; panel.id = 'ast'; panel.setAttribute('aria-label', 'Ассистент ZERNO');
  panel.innerHTML =
    '<header class="ast__head"><div><p class="ast__title">Ассистент ZERNO</p><p class="ast__sub">Подберу кофе в&nbsp;зале или зерно домой</p></div>' +
    '<button type="button" class="ast__close" aria-label="Закрыть ассистента">' + ICON_X + '</button></header>' +
    '<div class="ast__log" role="log" aria-live="polite"></div>' +
    '<div class="ast__chips"></div>' +
    '<form class="ast__form"><input class="ast__input" type="text" maxlength="400" placeholder="Спросите что-нибудь…" aria-label="Ваш вопрос" autocomplete="off">' +
    '<button type="submit" class="ast__send" aria-label="Отправить">' + ICON_SEND + '</button></form>';
  document.body.append(hint, btn, panel);

  var log = panel.querySelector('.ast__log'), chips = panel.querySelector('.ast__chips');
  var form = panel.querySelector('.ast__form'), input = panel.querySelector('.ast__input');
  var history = [], started = false, busy = false;

  /* ---------- открыть / закрыть ---------- */
  function setOpen(open) {
    panel.classList.toggle('is-open', open);
    btn.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Закрыть ассистента' : 'Открыть ассистента');
    btn.innerHTML = open ? ICON_X : ICON_CHAT;
    hint.classList.remove('is-shown');
    root.classList.toggle('ast-open', open);
    if (open && !started) { started = true; step('start'); }
    if (open && matchMedia('(hover:hover)').matches) setTimeout(function () { input.focus(); }, 300);
  }
  btn.addEventListener('click', function () { setOpen(!panel.classList.contains('is-open')); });
  panel.querySelector('.ast__close').addEventListener('click', function () { setOpen(false); btn.focus(); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false); });
  // кнопки «Спросить ассистента» в других местах сайта
  [].forEach.call(document.querySelectorAll('[data-assistant]'), function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); setTimeout(function () { setOpen(true); }, 350); });
  });

  // подсказка рядом с кнопкой — один раз за визит
  setTimeout(function () {
    try { if (sessionStorage.getItem('ast-hint')) return; sessionStorage.setItem('ast-hint', '1'); } catch (e) {}
    if (!panel.classList.contains('is-open')) { hint.classList.add('is-shown'); setTimeout(function () { hint.classList.remove('is-shown'); }, 6000); }
  }, 4000);

  // на телефоне кнопка появляется после первого экрана, чтобы не закрывать «Посмотреть меню»
  var hero = document.querySelector('.hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { root.classList.toggle('past-hero', !en[0].isIntersecting); }, { threshold: 0.35 }).observe(hero);
  }

  /* ---------- сообщения ---------- */
  function say(text, who) {
    var p = document.createElement('p');
    p.className = 'ast__msg ast__msg--' + (who || 'bot');
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
    history.push({ role: who === 'me' ? 'user' : 'assistant', content: text });
    if (history.length > 12) history.splice(0, history.length - 12);
  }
  function typing(on) {
    var t = log.querySelector('.ast__typing');
    if (on && !t) { t = document.createElement('p'); t.className = 'ast__typing'; t.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(t); log.scrollTop = log.scrollHeight; }
    if (!on && t) t.remove();
  }
  function setChips(list) {
    chips.innerHTML = '';
    list.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ast__chip'; b.textContent = c[0];
      b.addEventListener('click', function () {
        if (busy) return;
        if (c[1].charAt(0) === '#') { go(c[1]); return; }
        say(c[0], 'me'); step(c[1]);
      });
      chips.appendChild(b);
    });
  }
  function go(hash) {
    if (matchMedia('(max-width:760px)').matches) setOpen(false);
    var el = document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
  function reply(text, next) {
    busy = true; typing(true); setChips([]);
    setTimeout(function () { typing(false); say(text); setChips(next || AGAIN); busy = false; }, 650);
  }

  /* ---------- сценарии на кнопках (работают без ИИ) ---------- */
  var AGAIN = [['Начать заново', 'start'], ['Открыть меню', '#menu']];
  var S = {
    start: ['Здравствуйте! Помогу выбрать напиток в зале или зерно домой. С чего начнём?',
      [['Подобрать напиток', 'drink'], ['Зерно домой', 'beans'], ['Что такое подписка', 'subs'], ['Часы и адрес', 'place']]],
    drink: ['С молоком или без?', [['С молоком', 'milk'], ['Без молока', 'black']]],
    milk: ['Как вам больше нравится?', [['Мягко и сладко', 'm-sweet'], ['Классика, вкус кофе', 'm-classic']]],
    black: ['Какой вкус ближе?', [['Яркий, ягодный', 'b-bright'], ['Шоколадный, плотный', 'b-choc']]],
    'm-sweet': ['Попробуйте раф ванильный: сливки и ваниль из стручка, 300 мл — 360 ₽. Если хочется чуть меньше сладости, возьмите латте, 320 ₽.', null],
    'm-classic': ['Советую флэт уайт: двойной ристретто и немного молока, 200 мл — 310 ₽. Вкус кофе в нём слышно лучше, чем в капучино.', null],
    'b-bright': ['Возьмите воронку V60 на лоте дня — сегодня Эфиопия Иргачеффе: бергамот, персик, лёгкая кислинка. 250 мл — 340 ₽.', null],
    'b-choc': ['Тогда американо, 250 мл — 230 ₽, или эспрессо, 30 мл — 190 ₽. Бариста подскажет, какой лот сегодня самый шоколадный.', null],
    beans: ['Как будете варить дома?', [['Кофемашина', 'h-esp'], ['Турка или гейзер', 'h-moka'], ['Воронка или френч-пресс', 'h-filter']]],
    'h-esp': ['Под кофемашину берите эспрессо-обжарку: плотный вкус с нотами шоколада и ореха. Удобнее всего подписка «Доппио» — лот под эспрессо и лот под фильтр, 2 390 ₽ в месяц.', [['Перейти к подписке', '#subscribe'], ['Начать заново', 'start']]],
    'h-moka': ['Для турки и гейзера подойдёт эспрессо-обжарка — она не горчит на высокой температуре. Попросите смолоть мелко, прямо под турку.', [['Перейти к подписке', '#subscribe'], ['Начать заново', 'start']]],
    'h-filter': ['Для воронки и френч-пресса — фильтр-обжарка, например Эфиопия Иргачеффе: бергамот и персик. Начать можно с подписки «Соло» — пачка 250 г в месяц, 1 290 ₽.', [['Перейти к подписке', '#subscribe'], ['Начать заново', 'start']]],
    subs: ['Подписка — свежее зерно раз в месяц. Привозим на 7-й день после обжарки, когда зерно отдохнуло. «Соло» — 1 пачка за 1 290 ₽, «Доппио» — 2 пачки за 2 390 ₽, «Триппло» — 2 пачки и редкий микролот за 3 690 ₽. Пауза и отмена в любой момент.', [['Перейти к подписке', '#subscribe'], ['Начать заново', 'start']]],
    place: ['Мы на ул. Садовая, 14, вход со двора. Пн–Пт 8:00–22:00, Сб–Вс 9:00–23:00. Телефон: +7 900 123-45-67.', [['Показать на сайте', '#place'], ['Начать заново', 'start']]],
  };
  function step(id) {
    var s = S[id];
    if (!s) return;
    if (id === 'start' && !log.childElementCount) { say(s[0]); setChips(s[1]); return; }
    reply(s[0], s[1]);
  }

  /* ---------- свободный вопрос → ИИ ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q || busy) return;
    input.value = '';
    say(q, 'me');
    if (!ASSISTANT_URL) {
      reply('Свободные вопросы я научусь понимать совсем скоро. Пока выберите вариант ниже — так я точно помогу.', S.start[1]);
      return;
    }
    busy = true; typing(true); setChips([]);
    fetch(ASSISTANT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: ASSISTANT_MODEL, messages: history }) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { typing(false); say((d.reply || '').trim() || 'Не расслышал, повторите, пожалуйста.'); setChips(AGAIN); })
      .catch(function () { typing(false); say('Сейчас не получается ответить. Попробуйте кнопки ниже — они работают всегда.'); setChips(S.start[1]); })
      .then(function () { busy = false; });
  });
})();

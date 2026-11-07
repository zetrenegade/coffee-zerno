// ZERNO — появление экрана и блоков, навигация, вкладки меню, счётчики.
(function () {
  var root = document.documentElement;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* первый экран: ждём шрифты, но не дольше 1,2 с */
  var shown = false, show = function () { if (!shown) { shown = true; root.classList.add('is-in'); } };
  if (document.fonts) document.fonts.ready.then(show);
  setTimeout(show, 1200);

  /* блоки ниже: появляются один раз при прокрутке */
  var items = [].slice.call(document.querySelectorAll('.reveal'));
  items.forEach(function (el) { var d = el.getAttribute('data-d'); if (d) el.style.setProperty('--d', d + 'ms'); });
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* счётчики в «О нас» */
  function countUp(el) {
    var target = parseInt(el.textContent, 10), t0 = null;
    if (isNaN(target)) return;
    el.textContent = '0';
    (function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / 1500);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  if ('IntersectionObserver' in window && !reduced) {
    var cio = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); obs.unobserve(e.target); } });
    }, { threshold: 0.6 });
    [].forEach.call(document.querySelectorAll('.stat__v'), function (el) { cio.observe(el); });
  }

  /* навигация: сплошной фон после начала прокрутки */
  var nav = document.getElementById('nav');
  var onScroll = function () { nav.classList.toggle('is-solid', scrollY > 40); };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Параллакс фото при прокрутке: кадр движется медленнее страницы, как вид сквозь окно */
  var frames = [].slice.call(document.querySelectorAll('[data-parallax]'));
  if (frames.length && !reduced) {
    var ticking = false;
    var update = function () {
      ticking = false;
      frames.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        var p = (r.top + r.height / 2 - innerHeight / 2) / (innerHeight / 2 + r.height / 2);   // -1..1
        el.style.setProperty('--py', (p * r.height * 0.07).toFixed(1) + 'px');
      });
    };
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* вкладки меню: клик и стрелки на клавиатуре */
  var tabs = [].slice.call(document.querySelectorAll('[role="tab"]'));
  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });
})();

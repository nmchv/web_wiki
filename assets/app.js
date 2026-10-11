/* Вики — публичная часть сайта. Без сборки, чистый JS. */
(function () {
  'use strict';

  var CLASSES = [5, 6, 7, 8, 9, 10, 11];
  var DATA = { notes: [], slides: [], terms: [] };
  var app = document.getElementById('app');

  /* ---------- утилиты ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
  function highlight(text, q) {
    var safe = esc(text);
    if (!q) return safe;
    var parts = norm(q).split(/\s+/).filter(Boolean).map(function (p) {
      return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    if (!parts.length) return safe;
    // подсветка по нормализованному тексту (ё → е сохраняет длину)
    var n = norm(safe), re = new RegExp('(' + parts.join('|') + ')', 'g'), out = '', last = 0, m;
    while ((m = re.exec(n))) {
      out += safe.slice(last, m.index) + '<mark>' + safe.slice(m.index, m.index + m[0].length) + '</mark>';
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    return out + safe.slice(last);
  }
  function fmtDate(d) {
    if (!d) return '';
    var p = String(d).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : d;
  }
  function toast(msg, isErr) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast is-on' + (isErr ? ' is-err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, isErr ? 6000 : 3200);
  }
  function plural(n, a, b, c) {
    var m = Math.abs(n) % 100, k = m % 10;
    if (m > 10 && m < 20) return c;
    if (k > 1 && k < 5) return b;
    return k === 1 ? a : c;
  }
  function ready(p) { return p.then(function (r) { return r; }); }

  /* ---------- загрузка данных ---------- */
  function loadOne(name) {
    return fetch('data/' + name + '.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : { items: [] }; })
      .then(function (j) { return (j && j.items) || []; })
      .catch(function () { return []; });
  }
  function loadAll() {
    return Promise.all([loadOne('notes'), loadOne('slides'), loadOne('terms')]).then(function (r) {
      DATA.notes = r[0]; DATA.slides = r[1]; DATA.terms = r[2];
    });
  }

  /* ---------- страницы ---------- */
  function home() {
    var cnt = {
      notes: DATA.notes.length, terms: DATA.terms.length, slides: DATA.slides.length
    };
    app.innerHTML =
      '<section class="hero"><div class="wrap">' +
        '<div class="eyebrow">Учебная вики</div>' +
        '<h1>География<br>для <em>урока</em></h1>' +
        '<p class="hero__lead">Конспекты уроков, словарь терминов с примерами и презентации — всё, что нужно ученику, в одном месте.</p>' +
        '<div class="hero__meta"><span><b>Школа №116</b> · пространство решений</span><span>N 47°21′ · E 39°75′</span></div>' +
      '</div></section>' +
      '<section class="section"><div class="wrap">' +
        '<div class="section__head"><span class="section__num">02</span><h2 class="section__title">Разделы</h2></div>' +
        '<div class="cards">' +
          card('01', 'Конспекты', 'Записи с уроков по классам. Скачать можно в PDF.', cnt.notes, 'материал', 'материала', 'материалов', '#/notes') +
          card('02', 'Термины', 'Библиотека определений с примерами. Найдите нужный термин через поиск.', cnt.terms, 'термин', 'термина', 'терминов', '#/terms') +
          card('03', 'Презентации', 'Слайды с уроков по классам. Скачать можно в PPTX и PDF.', cnt.slides, 'презентация', 'презентации', 'презентаций', '#/slides') +
        '</div></div></section>';
  }
  function card(n, t, d, count, a, b, c, href) {
    return '<a class="card" href="' + href + '"><span class="card__num">' + n + '</span><h3>' + t + '</h3><p>' + d + '</p>' +
      '<div class="card__foot"><span>' + count + ' ' + plural(count, a, b, c) + '</span><span>Открыть →</span></div></a>';
  }

  /* общий каркас для конспектов и презентаций */
  function materials(kind) {
    var isNotes = kind === 'notes';
    var items = DATA[kind].slice().sort(function (x, y) {
      return String(y.date || '').localeCompare(String(x.date || '')) || (y.id > x.id ? 1 : -1);
    });
    var state = { grade: 'all', q: '' };

    app.innerHTML =
      '<section class="page"><div class="wrap">' +
        '<div class="page__top"><span class="eyebrow">' + (isNotes ? '01 · Конспекты' : '03 · Презентации') + '</span>' +
        '<h1>' + (isNotes ? 'Конспекты' : 'Презентации') + '</h1>' +
        '<p>' + (isNotes ? 'Конспекты, которые мы записываем на уроках. Выберите класс и скачайте PDF.' : 'Презентации с уроков. Выберите класс и скачайте PPTX или PDF.') + '</p></div>' +
        '<div class="toolbar"><div class="chips" id="chips"></div>' +
        '<div class="search"><input type="search" id="q" placeholder="Поиск по названию…" aria-label="Поиск"></div></div>' +
        '<div id="out"></div></div></section>';

    var chips = document.getElementById('chips'), out = document.getElementById('out');

    function drawChips() {
      var h = '<button class="chip' + (state.grade === 'all' ? ' is-on' : '') + '" data-g="all">Все классы</button>';
      CLASSES.forEach(function (g) {
        var has = items.some(function (i) { return Number(i.grade) === g; });
        h += '<button class="chip' + (state.grade === g ? ' is-on' : '') + '" data-g="' + g + '"' + (has ? '' : ' style="opacity:.45"') + '>' + g + ' класс</button>';
      });
      chips.innerHTML = h;
    }
    function dl(href, label, name) {
      return '<a class="btn btn--sm btn--primary" href="' + esc(encodeURI(href)) + '" download="' + esc(name || '') + '">' + label + '</a>';
    }
    function draw() {
      var q = norm(state.q).trim();
      var list = items.filter(function (i) {
        if (state.grade !== 'all' && Number(i.grade) !== state.grade) return false;
        return !q || norm(i.title + ' ' + (i.description || '')).indexOf(q) > -1;
      });
      if (!list.length) {
        out.innerHTML = '<div class="empty">' + (items.length ? 'Ничего не найдено. Попробуйте другой класс или запрос.' : 'Материалов пока нет — скоро появятся.') + '</div>';
        return;
      }
      var grades = state.grade === 'all' ? CLASSES : [state.grade], html = '';
      grades.forEach(function (g) {
        var part = list.filter(function (i) { return Number(i.grade) === g; });
        if (!part.length) return;
        html += '<div class="group"><h2 class="group__title">' + g + ' класс <span>' + part.length + '</span></h2><div class="list">';
        part.forEach(function (i) {
          var base = String(i.title).replace(/[\\/:*?"<>|]+/g, '').trim();
          var acts = '';
          if (isNotes) {
            if (i.pdf) acts += dl(i.pdf, 'Скачать PDF', base + '.pdf');
          } else {
            if (i.pptx) acts += dl(i.pptx, 'Скачать PPTX', base + '.pptx');
            if (i.pdf) acts += dl(i.pdf, 'Скачать PDF', base + '.pdf');
          }
          html += '<article class="item"><div class="item__meta"><span>' + fmtDate(i.date) + '</span>' + (i.topic ? '<span class="tag">' + esc(i.topic) + '</span>' : '') + '</div>' +
            '<h3>' + highlight(i.title, state.q) + '</h3>' +
            (i.description ? '<p>' + esc(i.description) + '</p>' : '') +
            '<div class="item__act">' + (acts || '<span class="tag">файл не прикреплён</span>') + '</div></article>';
        });
        html += '</div></div>';
      });
      out.innerHTML = html;
    }

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state.grade = b.dataset.g === 'all' ? 'all' : Number(b.dataset.g);
      drawChips(); draw();
    });
    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; draw(); });
    drawChips(); draw();
  }

  /* термины */
  function terms() {
    var items = DATA.terms.slice().sort(function (a, b) { return a.term.localeCompare(b.term, 'ru'); });
    var state = { q: '', letter: '' };

    app.innerHTML =
      '<section class="page"><div class="wrap">' +
        '<div class="page__top"><span class="eyebrow">02 · Термины</span><h1>Термины</h1>' +
        '<p>Библиотека определений. Введите слово в поиск — найдём определение и примеры.</p></div>' +
        '<div class="toolbar"><div class="search" style="margin:0;max-width:none"><input type="search" id="q" placeholder="Например: широта, рельеф, масштаб…" aria-label="Поиск термина" autocomplete="off"></div></div>' +
        '<div class="alpha" id="alpha"></div><div id="out"></div></div></section>';

    var out = document.getElementById('out'), alpha = document.getElementById('alpha');

    function first(t) { return norm(t.term).trim().charAt(0).toUpperCase(); }

    function drawAlpha() {
      var letters = {};
      items.forEach(function (t) { letters[first(t)] = true; });
      var list = Object.keys(letters).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
      alpha.innerHTML = list.length ? list.map(function (l) {
        return '<button data-l="' + l + '" class="' + (state.letter === l ? 'is-on' : '') + '">' + l + '</button>';
      }).join('') : '';
    }
    function draw() {
      var q = norm(state.q).trim();
      var list = items.filter(function (t) {
        if (state.letter && first(t) !== state.letter) return false;
        if (!q) return true;
        var hay = norm(t.term + ' ' + t.definition + ' ' + (t.topic || '') + ' ' + (t.examples || []).join(' '));
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; });
      });
      // термины, в названии которых есть запрос, выше
      if (q) list.sort(function (a, b) {
        return (norm(a.term).indexOf(q) === 0 ? 0 : norm(a.term).indexOf(q) > -1 ? 1 : 2) -
               (norm(b.term).indexOf(q) === 0 ? 0 : norm(b.term).indexOf(q) > -1 ? 1 : 2);
      });
      if (!list.length) {
        out.innerHTML = '<div class="empty">' + (items.length ? 'Такого термина пока нет в библиотеке.' : 'Терминов пока нет — скоро появятся.') + '</div>';
        return;
      }
      out.innerHTML = '<div class="terms">' + list.map(function (t) {
        var ex = (t.examples || []).filter(Boolean);
        return '<article class="term"><div><h3>' + highlight(t.term, state.q) + '</h3>' + (t.topic ? '<span class="tag">' + esc(t.topic) + '</span>' : '') + '</div>' +
          '<div><p class="term__def">' + highlight(t.definition, state.q) + '</p>' +
          (ex.length ? '<div class="term__ex"><b>' + (ex.length > 1 ? 'Примеры' : 'Пример') + '</b>' +
            (ex.length > 1 ? '<ul>' + ex.map(function (e) { return '<li>' + highlight(e, state.q) + '</li>'; }).join('') + '</ul>' : highlight(ex[0], state.q)) + '</div>' : '') +
          '</div></article>';
      }).join('') + '</div>';
    }

    var timer;
    document.getElementById('q').addEventListener('input', function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { state.q = v; draw(); }, 80);
    });
    alpha.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      state.letter = state.letter === b.dataset.l ? '' : b.dataset.l;
      drawAlpha(); draw();
    });
    drawAlpha(); draw();
  }

  /* ---------- роутер ---------- */
  function route() {
    var r = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
    document.querySelectorAll('[data-r]').forEach(function (a) {
      a.classList.toggle('is-active', a.dataset.r === r);
    });
    document.getElementById('nav').classList.remove('is-open');
    document.getElementById('burger').setAttribute('aria-expanded', 'false');
    window.scrollTo(0, 0);

    var titles = { notes: 'Конспекты', terms: 'Термины', slides: 'Презентации', admin: 'Админ' };
    document.title = (titles[r] ? titles[r] + ' — ' : '') + 'Вики · Алексей Немичев';

    if (r === 'notes') materials('notes');
    else if (r === 'slides') materials('slides');
    else if (r === 'terms') terms();
    else if (r === 'admin' && window.WikiAdmin) window.WikiAdmin.render(app);
    else home();
  }

  document.getElementById('burger').addEventListener('click', function () {
    var n = document.getElementById('nav'), open = n.classList.toggle('is-open');
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  window.addEventListener('hashchange', route);

  /* экспорт для админки */
  window.Wiki = {
    CLASSES: CLASSES, DATA: DATA, esc: esc, toast: toast, fmtDate: fmtDate, norm: norm,
    reload: function () { return loadAll(); },
    refresh: route
  };

  loadAll().then(route);
})();

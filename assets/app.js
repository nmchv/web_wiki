/* Вики — публичная часть сайта. Без сборки, чистый JS. */
(function () {
  'use strict';

  var CLASSES = [5, 6, 7, 8, 9, 10, 11];
  var DATA = {
  notes: [],
  slides: [],
  terms: [],
  works: [],
  plan: []
};
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
  return Promise.all([
    loadOne('notes'),
    loadOne('slides'),
    loadOne('terms'),
    loadOne('works'),
    loadOne('plan')
  ]).then(function (r) {
    DATA.notes = r[0];
    DATA.slides = r[1];
    DATA.terms = r[2];
    DATA.works = r[3];
    DATA.plan = r[4];
  });
}

  /* ---------- страницы ---------- */
  function home() {
    var cnt = {
      notes: DATA.notes.length,
      terms: DATA.terms.length,
      slides: DATA.slides.length,
      works: DATA.works.length
    };
    app.innerHTML =
      '<section class="hero"><div class="wrap">' +
        '<div class="hero__content"><div class="eyebrow">Учебная вики · 5–11 классы</div>' +
        '<h1>География<br><em>открывает мир</em></h1>' +
        '<p class="hero__lead">Материалы к урокам, понятные объяснения и практические задания — собраны в одном месте.</p>' +
        '<a class="btn btn--primary hero__link" href="#/notes">Перейти к материалам <span aria-hidden="true">→</span></a></div>' +
        '<div class="hero__visual" aria-hidden="true"><div class="hero__globe"><span class="hero__globe-line"></span><span class="hero__globe-dot"></span></div><span class="hero__coordinate">55°45′N · 37°37′E</span></div>' +
        '<div class="hero__meta"><span><b>' + cnt.notes + '</b> конспектов</span><span><b>' + cnt.terms + '</b> терминов</span><span><b>' + cnt.slides + '</b> презентаций</span><span><b>' + cnt.works + '</b> практических работ</span></div>' +
      '</div></section>' +
      '<section class="section"><div class="wrap">' +
        '<div class="section__head"><span class="section__num">01</span><h2 class="section__title">Выберите раздел</h2></div>' +
        '<div class="cards">' +
          card('01', 'Конспекты', 'Краткие записи с уроков, сгруппированные по классам.', cnt.notes, 'материал', 'материала', 'материалов', '#/notes', 'PDF · ЧИТАТЬ') +
          card('02', 'Термины', 'Словарь географии с определениями и примерами.', cnt.terms, 'термин', 'термина', 'терминов', '#/terms', 'ПОИСК · УЗНАВАТЬ') +
          card('03', 'Презентации', 'Наглядные материалы к темам уроков.', cnt.slides, 'презентация', 'презентации', 'презентаций', '#/slides', 'СЛАЙДЫ · СМОТРЕТЬ') +
          card('04', 'Практические работы', 'Задания с поиском по классу и номеру перечня.', cnt.works, 'работа', 'работы', 'работ', '#/works', 'ЗАДАНИЯ · РЕШАТЬ') +
        '</div>' +
        '<details class="planner" id="planner"><summary><span><span class="eyebrow">Для подготовки к уроку</span><strong>Поурочное планирование</strong><small>Темы и материалы по классам</small></span><span class="planner__toggle" aria-hidden="true">+</span></summary>' +
          '<div class="planner__body"><div class="planner__toolbar"><p>Федеральный номер поможет быстро найти тему, презентацию или практическую работу.</p><label class="planner__grade">Класс <select class="input" id="plan-grade"><option value="all">Все классы</option>' +
            CLASSES.map(function (g) { return '<option value="' + g + '">' + g + ' класс</option>'; }).join('') +
          '</select></label></div><div id="plan-out"></div></div>' +
        '</details>' +
      '</div></section>';
    drawPlanner();
    reveal(app.querySelectorAll('.card'));
    document.getElementById('plan-grade').addEventListener('change', drawPlanner);
  }
  function card(n, t, d, count, a, b, c, href, hint) {
    return '<a class="card" href="' + href + '"><span class="card__num">' + n + '</span><span class="card__hint">' + hint + '</span><span class="card__orbit" aria-hidden="true"></span><h3>' + t + '</h3><p>' + d + '</p>' +
      '<div class="card__foot"><span>' + count + ' ' + plural(count, a, b, c) + '</span><span>Открыть <b aria-hidden="true">↗</b></span></div></a>';
  }

  function drawPlanner() {
    var out = document.getElementById('plan-out');
    if (!out) return;
    var selectedGrade = document.getElementById('plan-grade').value;
    var rows = DATA.plan.slice().filter(function (row) {
      return selectedGrade === 'all' || Number(row.grade) === Number(selectedGrade);
    }).sort(function (a, b) {
      return Number(a.grade) - Number(b.grade) ||
        String(a.lessonNo || '').localeCompare(String(b.lessonNo || ''), 'ru', { numeric: true }) ||
        String(a.number || '').localeCompare(String(b.number || ''), 'ru', { numeric: true });
    });
    if (!rows.length) {
      out.innerHTML = '<div class="empty">Планирование пока не заполнено. Добавьте темы и прикрепите материалы в <a href="#/admin">админ-панели</a>.</div>';
      return;
    }
    function materialLinks(kind, id) {
      var item = DATA[kind].filter(function (entry) { return entry.id === id; })[0];
      if (!item) return '';
      var links = [];
      var label = kind === 'works' ? 'Практическая' : 'Презентация';
      if (kind === 'slides' && item.pptx) {
        links.push('<a class="planner__link" href="' + esc(encodeURI(item.pptx)) + '" download>' + label + ' PPTX ↗</a>');
      }
      if (item.pdf) {
        links.push('<button class="planner__link" type="button" data-pdf="' + esc(item.pdf) + '" data-pdf-title="' + esc(item.title) + '">' + label + ' PDF ↗</button>');
      }
      return links.join('');
    }
    out.innerHTML = '<div class="planner__table-wrap"><table class="planner__table"><thead><tr><th>Класс</th><th>Урок</th><th>№ темы</th><th>Тема</th><th>Материалы</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var resources = materialLinks('slides', row.slideId) + materialLinks('works', row.workId);
        return '<tr><td><span class="tag">' + esc(row.grade) + ' класс</span></td><td>' + esc(row.lessonNo || '—') + '</td><td><span class="planner__number">' + esc(row.number || '—') + '</span></td><td><strong>' + esc(row.title) + '</strong></td><td>' + (resources ? '<div class="planner__resources">' + resources + '</div>' : '<span class="planner__empty">Не прикреплено</span>') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function reveal(nodes) {
    if (!window.IntersectionObserver) {
      Array.prototype.forEach.call(nodes, function (node) { node.classList.add('is-visible'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
    Array.prototype.forEach.call(nodes, function (node, i) {
      node.classList.add('reveal');
      node.style.setProperty('--reveal-delay', Math.min(i % 6, 5) * 55 + 'ms');
      observer.observe(node);
    });
  }

  /* общий каталог материалов */
  function materials(kind) {
    var isNotes = kind === 'notes';
    var isWorks = kind === 'works';
    var items = DATA[kind].slice().sort(function (x, y) {
      return String(y.id || '').localeCompare(String(x.id || ''));
    });
    var state = { grade: 'all', q: '' };

        app.innerHTML =
      '<section class="page"><div class="wrap">' +
        '<div class="page__top"><span class="eyebrow">' +
          (isNotes ? '01 · Конспекты' : isWorks ? '04 · Практические работы' : '03 · Презентации') +
        '</span>' +
        '<h1>' + (isNotes ? 'Конспекты' : isWorks ? 'Практические работы' : 'Презентации') + '</h1>' +
        '<p>' +
          (isNotes
            ? 'Конспекты, которые мы записываем на уроках. Выберите класс и скачайте PDF.'
            : isWorks
              ? 'Практические работы по географии. Выберите класс, найдите нужное задание и скачайте PDF.'
              : 'Презентации с уроков. Выберите класс, найдите нужное задание и скачайте PPTX или PDF.') +
        '</p></div>' +
        '<div class="toolbar"><div id="chips" class="chips"></div>' +
        '<div class="search"><input id="search" type="search" placeholder="' + (isWorks || kind === 'slides' ? 'Поиск по номеру или теме…' : 'Поиск по материалам…') + '" aria-label="Поиск по материалам"></div></div>' +
        '<div id="out" class="materials-grid"></div>' +
      '</div></section>';

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
    function pdfPreview(href, title) {
      return '<button class="btn btn--sm btn--primary" type="button" data-pdf="' + esc(href) +
        '" data-pdf-title="' + esc(title) + '">Просмотреть PDF</button>';
    }
    function draw() {
      var q = norm(state.q).trim();
      var list = items.filter(function (i) {
        if (state.grade !== 'all' && Number(i.grade) !== state.grade) return false;
        return !q || norm(i.title + ' ' + (i.description || '') + ' ' + (i.number || '')).indexOf(q) > -1;
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
        part.sort(function (a, b) {
          var an = String(a.number || ''), bn = String(b.number || '');
          if (an && bn) return an.localeCompare(bn, 'ru', { numeric: true });
          if (an) return -1;
          if (bn) return 1;
          return String(b.id || '').localeCompare(String(a.id || ''));
        }).forEach(function (i, index) {
          var base = String(i.title).replace(/[\\/:*?"<>|]+/g, '').trim();
          var acts = '';

if (isNotes || isWorks) {
  if (i.pdf) {
    acts += pdfPreview(i.pdf, i.title) + dl(i.pdf, 'Скачать PDF', base + '.pdf');
  }
} else {
  if (i.pptx) {
    acts += dl(i.pptx, 'Скачать PPTX', base + '.pptx');
  }

  if (i.pdf) {
    acts += pdfPreview(i.pdf, i.title) + dl(i.pdf, 'Скачать PDF', base + '.pdf');
  }
}
          html += '<article class="item"><div class="item__meta">' + (i.number ? '<span class="tag item__number">№ ' + highlight(i.number, state.q) + '</span>' : '') + (i.topic ? '<span class="tag">' + esc(i.topic) + '</span>' : '') + '<span class="item__ordinal">' + String(index + 1).padStart(2, '0') + '</span></div>' +
            '<h3>' + highlight(i.title, state.q) + '</h3>' +
            (i.description ? '<p>' + esc(i.description) + '</p>' : '') +
            '<div class="item__act">' + (acts || '<span class="tag">файл не прикреплён</span>') + '</div></article>';
        });
        html += '</div></div>';
      });
      out.innerHTML = html;
      reveal(out.querySelectorAll('.item'));
    }

    chips.addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      state.grade = b.dataset.g === 'all' ? 'all' : Number(b.dataset.g);
      drawChips(); draw();
    });
    document.getElementById('search').addEventListener('input', function (e) { state.q = e.target.value; draw(); });
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
      reveal(out.querySelectorAll('.term'));
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

    var titles = {
  notes: 'Конспекты',
  terms: 'Термины',
  slides: 'Презентации',
  works: 'Практические работы',
  admin: 'Админ'
};
    document.title = (titles[r] ? titles[r] + ' — ' : '') + 'Вики · Алексей Немичев';

    if (r === 'notes') materials('notes');
    else if (r === 'slides') materials('slides');
    else if (r === 'terms') terms();
    else if (r === 'works') materials('works');
    else if (r === 'admin' && window.WikiAdmin) window.WikiAdmin.render(app);
    else home();
  }

  document.getElementById('burger').addEventListener('click', function () {
    var n = document.getElementById('nav'), open = n.classList.toggle('is-open');
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  app.addEventListener('click', function (e) {
    var button = e.target.closest('[data-pdf]');
    if (!button) return;
    var viewer = document.getElementById('pdf-viewer');
    var frame = viewer.querySelector('iframe');
    var url = encodeURI(button.dataset.pdf);
    viewer.querySelector('#pdf-viewer-title').textContent = button.dataset.pdfTitle;
    viewer.querySelector('[data-pdf-download]').href = url;
    viewer.querySelector('[data-pdf-download]').download =
      String(button.dataset.pdfTitle).replace(/[\\/:*?"<>|]+/g, '').trim() + '.pdf';
    frame.src = url + '#view=FitH';
    if (typeof viewer.showModal === 'function') viewer.showModal();
    else window.open(url, '_blank', 'noopener');
  });
  document.querySelector('[data-pdf-close]').addEventListener('click', function () {
    document.getElementById('pdf-viewer').close();
  });
  document.getElementById('pdf-viewer').addEventListener('close', function () {
    this.querySelector('iframe').src = 'about:blank';
  });
  window.addEventListener('hashchange', route);

  /* экспорт для админки */
  window.Wiki = {
    CLASSES: CLASSES, DATA: DATA, esc: esc, toast: toast, norm: norm,
    reload: function () { return loadAll(); },
    refresh: route
  };

  loadAll().then(route);
})();

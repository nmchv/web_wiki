/* Админ-панель. Меняет файлы прямо в репозитории через GitHub API. */
(function () {
  'use strict';

  var PW_HASH = '9fadd87faadc366f07df367daf1d17a40f3de628c2318954b7ccd6c9f7616f46';            // SHA-256 пароля
  var SS_KEY = 'wiki_admin_ok';
  var LS_KEY = 'wiki_gh';
  var W = window.Wiki;
  var esc = W.esc;

  var view = { tab: 'notes', editing: null, filter: '' };
  var root;

  /* ---------- вспомогательное ---------- */
  function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function cfg() {
    var c = {};
    try { c = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) {}
    if (!c.repo) {
      var m = location.hostname.match(/^([^.]+)\.github\.io$/);
      if (m) c.repo = m[1] + '/' + (location.pathname.split('/')[1] || m[1] + '.github.io');
    }
    c.branch = c.branch || 'main';
    return c;
  }
  function saveCfg(c) { try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch (e) {} }
  function isReady() { var c = cfg(); return !!(c.token && c.repo); }

  var TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
  function slug(s) {
    var out = String(s).toLowerCase().split('').map(function (ch) { return TR[ch] !== undefined ? TR[ch] : ch; }).join('');
    return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'file';
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }
  function utf8b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64utf8(b) { return decodeURIComponent(escape(atob(b.replace(/\s/g, '')))); }
  function fileB64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = function () { rej(new Error('Не удалось прочитать файл')); };
      r.readAsDataURL(file);
    });
  }

  /* ---------- GitHub API ---------- */
  function api(method, path, body) {
    var c = cfg();
    var url = 'https://api.github.com/repos/' + c.repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
    if (method === 'GET') url += '?ref=' + encodeURIComponent(c.branch) + '&t=' + Date.now();
    if (body) body.branch = c.branch;
    return fetch(url, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + c.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 404 && method === 'GET') return null;
      if (r.ok) return r.json();
      return r.json().catch(function () { return {}; }).then(function (j) {
        var msg = j.message || ('Ошибка ' + r.status);
        if (r.status === 401) msg = 'Токен неверный или просрочен. Проверьте вкладку «Настройки».';
        else if (r.status === 403) msg = 'Нет прав: у токена должно быть Contents → Read and write для этого репозитория. (' + msg + ')';
        else if (r.status === 404) msg = 'Репозиторий или ветка не найдены. Проверьте вкладку «Настройки».';
        var e = new Error(msg); e.status = r.status; throw e;
      });
    });
  }
  function getFile(path) { return api('GET', path); }
  function putFile(path, b64, message) {
    return getFile(path).then(function (ex) {
      var body = { message: message, content: b64 };
      if (ex && ex.sha) body.sha = ex.sha;
      return api('PUT', path, body);
    });
  }
  function delFile(path, message) {
    return getFile(path).then(function (ex) {
      if (!ex) return null;
      return api('DELETE', path, { message: message, sha: ex.sha });
    });
  }
  function readData(name) {
    return getFile('data/' + name + '.json').then(function (f) {
      var items = [];
      if (f && f.content) { try { items = JSON.parse(b64utf8(f.content)).items || []; } catch (e) {} }
      return { items: items, sha: f && f.sha };
    });
  }
  function mutate(name, fn, message, attempt) {
    attempt = attempt || 0;
    return readData(name).then(function (cur) {
      var items = fn(cur.items.slice());
      if (name === 'notes' || name === 'slides' || name === 'works') {
        items.forEach(function (item) { delete item.date; });
      }
      var body = { message: message, content: utf8b64(JSON.stringify({ items: items }, null, 2) + '\n') };
      if (cur.sha) body.sha = cur.sha;
      return api('PUT', 'data/' + name + '.json', body).then(function () { return items; });
    }).catch(function (e) {
      if ((e.status === 409 || e.status === 422) && attempt < 2) return mutate(name, fn, message, attempt + 1);
      throw e;
    });
  }

  /* ---------- UI helpers ---------- */
  function setProgress(p) {
    var box = root.querySelector('.progress'); if (!box) return;
    box.style.display = p == null ? 'none' : 'block';
    box.firstChild.style.width = (p || 0) + '%';
  }
  function busy(btn, on) { if (btn) btn.disabled = on; }
  function gradeOptions(sel) {
    return W.CLASSES.map(function (g) { return '<option value="' + g + '"' + (Number(sel) === g ? ' selected' : '') + '>' + g + ' класс</option>'; }).join('');
  }
  function cached(name) { return view.cache && view.cache[name] ? view.cache[name] : W.DATA[name]; }

  /* ---------- экран входа ---------- */
  function gate() {
    root.innerHTML =
      '<section class="page"><div class="wrap"><div class="panel gate">' +
      '<span class="eyebrow">Админ</span><h2 style="margin-top:10px">Вход</h2>' +
      '<form id="gf"><div class="field"><label for="pw">Пароль</label><input class="input" id="pw" type="password" autocomplete="current-password" autofocus></div>' +
      '<p class="err" id="ge"></p><div class="actions"><button class="btn btn--primary" type="submit">Войти</button></div></form></div></div></section>';
    document.getElementById('gf').addEventListener('submit', function (e) {
      e.preventDefault();
      sha256(document.getElementById('pw').value).then(function (h) {
        if (h === PW_HASH) { sessionStorage.setItem(SS_KEY, '1'); render(root); }
        else { document.getElementById('ge').textContent = 'Неверный пароль'; }
      });
    });
  }

  /* ---------- каркас ---------- */
  function shell() {
    var tabs = [
  ['notes', 'Конспекты'],
  ['slides', 'Презентации'],
  ['works', 'Практические работы'],
  ['terms', 'Термины'],
  ['settings', 'Настройки']
];
    root.innerHTML =
      '<section class="page"><div class="wrap">' +
      '<div class="page__top"><span class="eyebrow">Админ-панель</span><h1>Управление</h1>' +
      '<p>Добавляйте, меняйте и удаляйте материалы. Изменения сохраняются в репозиторий и появятся на сайте через 1–2 минуты.</p></div>' +
      '<div class="tabs">' + tabs.map(function (t) {
        return '<button class="chip' + (view.tab === t[0] ? ' is-on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '<button class="chip" id="logout" style="margin-left:auto">Выйти</button></div>' +
      '<div id="body"></div></div></section>';
    root.querySelector('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      if (b.id === 'logout') { sessionStorage.removeItem(SS_KEY); location.hash = '#/'; return; }
      view.tab = b.dataset.t; view.editing = null; view.filter = ''; render(root);
    });
  }

  /* ---------- настройки ---------- */
  function settings() {
    var c = cfg(), body = document.getElementById('body');
    body.innerHTML =
      '<div class="panel" style="max-width:640px"><h2>Подключение к GitHub</h2>' +
      '<div class="hint"><b>Один раз на каждом устройстве.</b> Токен хранится только в этом браузере и нигде больше не публикуется.<ol>' +
      '<li>GitHub → Settings → Developer settings → <b>Fine-grained tokens</b> → Generate new token.</li>' +
      '<li>Repository access: <b>Only select repositories</b> → ваш репозиторий сайта.</li>' +
      '<li>Permissions → Repository permissions → <b>Contents: Read and write</b>.</li>' +
      '<li>Скопируйте токен (начинается с <code>github_pat_</code>) и вставьте ниже.</li></ol></div>' +
      '<form id="sf"><div class="field"><label>Репозиторий (владелец/название)</label><input class="input" id="s-repo" placeholder="nmchv/wiki" value="' + esc(c.repo || '') + '"></div>' +
      '<div class="field"><label>Ветка</label><input class="input" id="s-br" value="' + esc(c.branch) + '"><small>Обычно main</small></div>' +
      '<div class="field"><label>Токен</label><input class="input" id="s-tok" type="password" autocomplete="off" placeholder="' + (c.token ? '•••••••• (сохранён)' : 'github_pat_…') + '"></div>' +
      '<div class="actions"><button class="btn btn--primary" type="submit">Сохранить и проверить</button>' +
      (c.token ? '<button class="btn btn--danger" type="button" id="s-clr">Удалить токен</button>' : '') + '</div></form></div>';
    document.getElementById('sf').addEventListener('submit', function (e) {
      e.preventDefault();
      var n = {
        repo: document.getElementById('s-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''),
        branch: document.getElementById('s-br').value.trim() || 'main',
        token: document.getElementById('s-tok').value.trim() || c.token
      };
      if (!n.repo || !n.token) { W.toast('Заполните репозиторий и токен', true); return; }
      saveCfg(n);
      getFile('data/notes.json').then(function (f) {
        if (!f) throw new Error('Подключились, но data/notes.json не найден — проверьте, что загрузили все файлы сайта в ветку ' + n.branch);
        W.toast('Готово: подключение работает');
        view.tab = 'notes'; render(root);
      }).catch(function (err) { W.toast(err.message, true); });
    });
    var clr = document.getElementById('s-clr');
    if (clr) clr.addEventListener('click', function () { var n = cfg(); delete n.token; saveCfg(n); settings(); W.toast('Токен удалён'); });
  }

  /* ---------- материалы (конспекты / презентации) ---------- */
  function materials(kind) {
  var isNotes = kind === 'notes';
  var isWorks = kind === 'works';
  var body = document.getElementById('body');
    var items = cached(kind).slice().sort(function (a, b) { return String(b.id || '').localeCompare(String(a.id || '')); });
    var ed = view.editing ? items.filter(function (i) { return i.id === view.editing; })[0] : null;
    ed = ed || {};

    body.innerHTML =
      '<div class="admin-grid"><div class="panel"><h2>' +
  (ed.id
    ? 'Изменить'
    : isWorks
      ? 'Новая практическая работа'
      : isNotes
        ? 'Новый конспект'
        : 'Новая презентация') +
'</h2>' +
      '<form id="mf">' +
      '<div class="field"><label>Название</label><input class="input" id="m-title" required value="' +
  esc(ed.title || '') +
  '" placeholder="' +
  (isWorks
    ? 'Например: Сравнение двух рек'
    : isNotes
      ? 'Тема: Литосфера'
      : 'Тема: Климат России') +
  '"></div>' +
      '<div class="field"><label>Класс</label><select class="input" id="m-grade">' + gradeOptions(ed.grade || 5) + '</select></div>' +
      '<div class="field"><label>Описание (необязательно)</label><textarea class="input" id="m-desc" style="min-height:80px">' + esc(ed.description || '') + '</textarea></div>' +
      ((isNotes || isWorks)
  ? '<div class="field"><label>PDF-файл' +
      (ed.pdf ? ' (оставьте пустым, чтобы не менять)' : '') +
    '</label><input type="file" id="m-pdf" accept=".pdf,application/pdf"' +
      (!ed.pdf ? ' required' : '') +
    '></div>'
  : '<div class="field"><label>PPTX-файл' +
      (ed.pptx ? ' (оставьте пустым, чтобы не менять)' : '') +
    '</label><input type="file" id="m-pptx" accept=".pptx,.ppt"></div>' +
    '<div class="field"><label>PDF-файл' +
      (ed.pdf ? ' (оставьте пустым, чтобы не менять)' : '') +
    '</label><input type="file" id="m-pdf" accept=".pdf,application/pdf"></div>') +
      '<div class="progress"><i></i></div>' +
      '<div class="actions"><button class="btn btn--primary" type="submit">' + (ed.id ? 'Сохранить' : 'Опубликовать') + '</button>' +
      (ed.id ? '<button class="btn" type="button" id="m-cancel">Отмена</button>' : '') + '</div></form></div>' +
      '<div><div class="admin-list" id="al">' + (items.length ? items.map(function (i) {
        return '<div class="arow"><div class="arow__t"><b>' + esc(i.title) + '</b><span>' + i.grade + ' класс' +
          (i.pptx ? ' · PPTX' : '') + (i.pdf ? ' · PDF' : '') + '</span></div><div class="arow__a">' +
          '<button class="btn btn--sm" data-e="' + i.id + '">Изменить</button><button class="btn btn--sm btn--danger" data-d="' + i.id + '">Удалить</button></div></div>';
      }).join('') : '<div class="empty">Пока пусто. Добавьте первый материал слева.</div>') + '</div></div></div>';

    var cancel = document.getElementById('m-cancel');
    if (cancel) cancel.addEventListener('click', function () { view.editing = null; materials(kind); });

    document.getElementById('al').addEventListener('click', function (e) {
      var be = e.target.closest('[data-e]'), bd = e.target.closest('[data-d]');
      if (be) { view.editing = be.dataset.e; materials(kind); window.scrollTo(0, 0); }
      if (bd) removeItem(kind, bd.dataset.d, bd);
    });

    document.getElementById('mf').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!isReady()) { W.toast('Сначала подключите GitHub во вкладке «Настройки»', true); return; }
      var btn = e.target.querySelector('[type=submit]');
      var title = document.getElementById('m-title').value.trim();
      var grade = Number(document.getElementById('m-grade').value);
      var desc = document.getElementById('m-desc').value.trim();
      var fPdf = document.getElementById('m-pdf').files[0];
      var fPptx = (isNotes || isWorks)
  ? null
  : document.getElementById('m-pptx').files[0];

      if (!ed.id && !fPdf && !fPptx) {
  W.toast('Прикрепите файл', true);
  return;
}
      if (fPdf && ext(fPdf.name) !== 'pdf') { W.toast('PDF-поле: нужен файл .pdf', true); return; }
      if (fPptx && ['pptx', 'ppt'].indexOf(ext(fPptx.name)) < 0) { W.toast('PPTX-поле: нужен файл .pptx', true); return; }
      var big = [fPdf, fPptx].filter(Boolean).filter(function (f) { return f.size > 95 * 1024 * 1024; });
      if (big.length) { W.toast('Файл больше 95 МБ — GitHub его не примет. Сожмите картинки в презентации.', true); return; }

      var id = ed.id || uid();
      var rec = { id: id, title: title, grade: grade, description: desc, pdf: ed.pdf || '', pptx: ed.pptx || '' };
      var dir = 'files/' + kind + '/' + grade + '/';
      var base = id + '-' + slug(title);
      var oldPaths = [];
      var uploads = [];
      if (fPdf) { var pp = dir + base + '.pdf'; if (ed.pdf && ed.pdf !== pp) oldPaths.push(ed.pdf); rec.pdf = pp; uploads.push([pp, fPdf]); }
      if (fPptx) { var px = dir + base + '.' + ext(fPptx.name); if (ed.pptx && ed.pptx !== px) oldPaths.push(ed.pptx); rec.pptx = px; uploads.push([px, fPptx]); }

      busy(btn, true); setProgress(5);
      var step = 0, total = uploads.length + 1;
      var chain = Promise.resolve();
      uploads.forEach(function (u) {
        chain = chain.then(function () { return fileB64(u[1]); })
          .then(function (b64) { return putFile(u[0], b64, 'Загрузка: ' + title); })
          .then(function () { step++; setProgress(Math.round(step / total * 90)); });
      });
      chain.then(function () {
        return mutate(kind, function (list) {
          var idx = -1; list.forEach(function (x, k) { if (x.id === id) idx = k; });
          if (idx > -1) list[idx] = rec; else list.push(rec);
          return list;
        }, (ed.id ? 'Изменение: ' : 'Добавление: ') + title);
      }).then(function (list) {
        setProgress(100);
        view.cache = view.cache || {}; view.cache[kind] = list; W.DATA[kind] = list;
        view.editing = null;
        W.toast(ed.id ? 'Изменения сохранены' : 'Опубликовано! На сайте появится через 1–2 минуты');
        oldPaths.forEach(function (p) { delFile(p, 'Удаление старого файла'); });
        materials(kind);
      }).catch(function (err) { setProgress(null); busy(btn, false); W.toast(err.message, true); });
    });

    refreshFresh(kind, function () { materials(kind); }, items);
  }

  function removeItem(kind, id, btn) {
    if (!isReady()) { W.toast('Сначала подключите GitHub во вкладке «Настройки»', true); return; }
    var it = cached(kind).filter(function (i) { return i.id === id; })[0]; if (!it) return;
    if (!confirm('Удалить «' + (it.title || it.term) + '»? Это действие нельзя отменить.')) return;
    busy(btn, true);
    mutate(kind, function (list) { return list.filter(function (x) { return x.id !== id; }); }, 'Удаление: ' + (it.title || it.term))
      .then(function (list) {
        view.cache = view.cache || {}; view.cache[kind] = list; W.DATA[kind] = list;
        [it.pdf, it.pptx].filter(Boolean).forEach(function (p) { delFile(p, 'Удаление файла'); });
        W.toast('Удалено');
        if (view.editing === id) view.editing = null;
        view.tab === 'terms' ? terms() : materials(kind);
      }).catch(function (err) { busy(btn, false); W.toast(err.message, true); });
  }

  /* подтянуть свежие данные из репозитория (сайт мог ещё не пересобраться) */
  var fresh = {};
  function refreshFresh(name, cb, current) {
    if (!isReady() || fresh[name]) return;
    fresh[name] = true;
    readData(name).then(function (d) {
      view.cache = view.cache || {}; view.cache[name] = d.items; W.DATA[name] = d.items;
      if (JSON.stringify(d.items) !== JSON.stringify(current) && view.tab === name && !view.editing) cb();
    }).catch(function () { fresh[name] = false; });
  }

  /* ---------- термины ---------- */
  function terms() {
    var body = document.getElementById('body');
    var items = cached('terms').slice().sort(function (a, b) { return a.term.localeCompare(b.term, 'ru'); });
    var ed = (view.editing ? items.filter(function (i) { return i.id === view.editing; })[0] : null) || {};
    var topics = {}; items.forEach(function (t) { if (t.topic) topics[t.topic] = 1; });
    var q = W.norm(view.filter).trim();
    var shown = items.filter(function (t) { return !q || W.norm(t.term + ' ' + t.definition).indexOf(q) > -1; });

    body.innerHTML =
      '<div class="admin-grid"><div class="panel"><h2>' + (ed.id ? 'Изменить термин' : 'Новый термин') + '</h2>' +
      '<form id="tf">' +
      '<div class="field"><label>Термин</label><input class="input" id="t-term" required value="' + esc(ed.term || '') + '" placeholder="Например: Широта"></div>' +
      '<div class="field"><label>Тема (необязательно)</label><input class="input" id="t-topic" list="t-topics" value="' + esc(ed.topic || '') + '" placeholder="Картография"><datalist id="t-topics">' +
        Object.keys(topics).map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></div>' +
      '<div class="field"><label>Определение</label><textarea class="input" id="t-def" required>' + esc(ed.definition || '') + '</textarea></div>' +
      '<div class="field"><label>Примеры</label><textarea class="input" id="t-ex" placeholder="Каждый пример с новой строки">' + esc((ed.examples || []).join('\n')) + '</textarea><small>Каждый пример — с новой строки</small></div>' +
      '<div class="actions"><button class="btn btn--primary" type="submit">' + (ed.id ? 'Сохранить' : 'Добавить') + '</button>' +
      (ed.id ? '<button class="btn" type="button" id="t-cancel">Отмена</button>' : '') + '</div></form></div>' +
      '<div><div class="field"><input class="input" id="t-search" type="search" placeholder="Поиск по терминам (' + items.length + ')…" value="' + esc(view.filter) + '"></div>' +
      '<div class="admin-list" id="al">' + (shown.length ? shown.map(function (i) {
        return '<div class="arow"><div class="arow__t"><b>' + esc(i.term) + '</b><span>' + esc((i.definition || '').slice(0, 90)) + '</span></div><div class="arow__a">' +
          '<button class="btn btn--sm" data-e="' + i.id + '">Изменить</button><button class="btn btn--sm btn--danger" data-d="' + i.id + '">Удалить</button></div></div>';
      }).join('') : '<div class="empty">' + (items.length ? 'Ничего не найдено' : 'Терминов пока нет') + '</div>') + '</div></div></div>';

    var cancel = document.getElementById('t-cancel');
    if (cancel) cancel.addEventListener('click', function () { view.editing = null; terms(); });
    var s = document.getElementById('t-search');
    s.addEventListener('input', function () {
      view.filter = s.value; var pos = s.selectionStart; terms();
      var n = document.getElementById('t-search'); n.focus(); n.setSelectionRange(pos, pos);
    });
    document.getElementById('al').addEventListener('click', function (e) {
      var be = e.target.closest('[data-e]'), bd = e.target.closest('[data-d]');
      if (be) { view.editing = be.dataset.e; terms(); window.scrollTo(0, 0); }
      if (bd) removeItem('terms', bd.dataset.d, bd);
    });
    document.getElementById('tf').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!isReady()) { W.toast('Сначала подключите GitHub во вкладке «Настройки»', true); return; }
      var btn = e.target.querySelector('[type=submit]');
      var id = ed.id || uid();
      var rec = {
        id: id,
        term: document.getElementById('t-term').value.trim(),
        topic: document.getElementById('t-topic').value.trim(),
        definition: document.getElementById('t-def').value.trim(),
        examples: document.getElementById('t-ex').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean)
      };
      busy(btn, true);
      mutate('terms', function (list) {
        var idx = -1; list.forEach(function (x, k) { if (x.id === id) idx = k; });
        if (idx > -1) list[idx] = rec; else list.push(rec);
        return list;
      }, (ed.id ? 'Изменение термина: ' : 'Новый термин: ') + rec.term).then(function (list) {
        view.cache = view.cache || {}; view.cache.terms = list; W.DATA.terms = list;
        view.editing = null; W.toast(ed.id ? 'Изменения сохранены' : 'Термин добавлен');
        terms();
      }).catch(function (err) { busy(btn, false); W.toast(err.message, true); });
    });

    refreshFresh('terms', terms, items);
  }

  /* ---------- вход в раздел ---------- */
  function render(app) {
    root = app;
    if (!window.crypto || !crypto.subtle) {
      app.innerHTML = '<section class="page"><div class="wrap"><div class="empty">Админка работает только по HTTPS (на GitHub Pages — включите «Enforce HTTPS»).</div></div></section>';
      return;
    }
    if (sessionStorage.getItem(SS_KEY) !== '1') return gate();
    shell();
    if (!isReady() && view.tab !== 'settings') view.tab = 'settings';
    // обновить вкладки после возможной смены
    root.querySelectorAll('.tabs .chip').forEach(function (c) { c.classList.toggle('is-on', c.dataset.t === view.tab); });
    if (view.tab === 'settings') settings();
    else if (view.tab === 'terms') terms();
    else materials(view.tab);
  }

  window.WikiAdmin = { render: render };
  // если страница открыта сразу на #/admin, а app.js уже отрисовал "домой" — перерисовать
  if (/^#\/admin/.test(location.hash)) setTimeout(function () { W.refresh(); }, 0);
})();

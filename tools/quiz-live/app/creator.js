/* The quiz maker: all 10 question types, pictures and video, timers, points, reordering, the question bank,
   spreadsheet and file import, the quick generator, sharing and challenge links. */
(function () {
  'use strict';
  var QL = window.QL, h = QL.h;

  /* ---------- the quiz library ---------- */
  QL.lib = {
    all: function () { return QL.load('quizzes', []); },
    get: function (id) { return QL.lib.all().filter(function (k) { return k.id === id; })[0] || null; },
    put: function (k) { var a = QL.lib.all(), i = a.findIndex(function (x) { return x.id === k.id; }); k.updated = Date.now(); if (i >= 0) a[i] = k; else a.unshift(k); return QL.save('quizzes', a); },
    del: function (id) { QL.save('quizzes', QL.lib.all().filter(function (k) { return k.id !== id; })); }
  };

  /* ---------- a small dialog ---------- */
  QL.modal = function (title, content, buttons) {
    var back = h('div', { class: 'modal-back' }), box = h('div', { class: 'modal', role: 'dialog', 'aria-label': title });
    function close() { back.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    box.appendChild(h('div', { class: 'modal-head' }, h('h3', { text: title }), h('button', { class: 'x', text: '×', 'aria-label': 'Close', onclick: close })));
    box.appendChild(h('div', { class: 'modal-body' }, content));
    if (buttons && buttons.length) box.appendChild(h('div', { class: 'modal-foot' }, buttons.map(function (b) { return h('button', { class: 'btn ' + (b.primary ? 'primary' : ''), text: b.label, onclick: function () { if (b.fn && b.fn() === false) return; if (!b.keep) close(); } }); })));
    back.appendChild(box); back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.body.appendChild(back); document.addEventListener('keydown', esc);
    return { close: close, box: box };
  };

  /* an image the person picked, shrunk so it is light enough to keep */
  QL.readImage = function (file, max) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Pick an image file.'));
      var fr = new FileReader();
      fr.onload = function () {
        var im = new Image();
        im.onload = function () {
          var s = Math.min(1, (max || 900) / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        im.onerror = function () { reject(new Error('That image could not be read.')); };
        im.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('That file could not be read.')); };
      fr.readAsDataURL(file);
    });
  };

  /* ---------- the editor ---------- */
  QL.editor = function (kahoot, mount, cb) {
    var k = QL.clone(kahoot), sel = 0, dirty = false, timer = null;
    if (!k.questions.length) k.questions.push(QL.newQuestion('quiz'));
    function touch() { dirty = true; clearTimeout(timer); timer = setTimeout(persist, 500); status('Saving...'); }
    function persist() { if (QL.lib.put(k)) status('Saved'); dirty = false; }
    function status(t) { var s = QL.$('#ed-status'); if (s) s.textContent = t; }
    function leave() { if (dirty) persist(); cb.onExit && cb.onExit(); }
    function cur() { return k.questions[sel]; }

    function draw() {
      mount.textContent = ''; mount.className = 'editor';
      mount.appendChild(topbar());
      var wrap = h('div', { class: 'ed-wrap' }); mount.appendChild(wrap);
      wrap.appendChild(sidebar()); wrap.appendChild(h('div', { class: 'ed-main', id: 'ed-main' }, questionForm()));
    }

    function topbar() {
      var title = h('input', { class: 'input ed-title', placeholder: 'Quiz title', maxlength: 80, value: k.title, 'aria-label': 'Quiz title' });
      title.oninput = function () { k.title = title.value; touch(); };
      var theme = h('select', { class: 'input small', 'aria-label': 'Theme' }); Object.keys(QL.THEMES).forEach(function (t) { var o = h('option', { value: t, text: t[0].toUpperCase() + t.slice(1) }); if (k.theme === t) o.selected = true; theme.appendChild(o); });
      theme.onchange = function () { k.theme = theme.value; touch(); };
      var vis = h('select', { class: 'input small', 'aria-label': 'Who can see it' }); [['private', 'Private'], ['public', 'Public (anyone with the link)']].forEach(function (p) { var o = h('option', { value: p[0], text: p[1] }); if (k.vis === p[0]) o.selected = true; vis.appendChild(o); });
      vis.onchange = function () { k.vis = vis.value; touch(); };
      var folder = h('input', { class: 'input small', placeholder: 'Folder', maxlength: 30, value: k.folder || '', 'aria-label': 'Folder', list: 'folders' });
      folder.oninput = function () { k.folder = folder.value.trim(); touch(); };
      var dl = h('datalist', { id: 'folders' }); Object.keys(QL.lib.all().reduce(function (o, x) { if (x.folder) o[x.folder] = 1; return o; }, {})).forEach(function (f) { dl.appendChild(h('option', { value: f })); });
      var bad = k.questions.filter(function (q) { return QL.problems(q); }).length;
      return h('div', { class: 'ed-top' },
        h('button', { class: 'btn', text: 'Back', onclick: leave }), title, theme, vis, folder, dl,
        h('button', { class: 'btn', text: 'Details', onclick: details }),
        h('span', { id: 'ed-status', class: 'muted small', text: 'Saved' }),
        h('span', { class: 'hb-sp' }),
        h('button', { class: 'btn', text: 'Preview', onclick: function () { persist(); cb.onPreview(k); } }),
        h('button', { class: 'btn', text: 'Share', onclick: share }),
        h('button', { class: 'btn', text: 'Export', onclick: exporter }),
        h('button', { class: 'btn primary', text: 'Play live', disabled: bad === k.questions.length, title: bad ? bad + ' question(s) are not finished and will be skipped' : '', onclick: function () { persist(); cb.onLive(k); } }));
    }

    function details() {
      var desc = h('textarea', { class: 'input', rows: 3, maxlength: 300, 'aria-label': 'Description', placeholder: 'What is this quiz about?' }); desc.value = k.desc || '';
      var cover = k.cover, prev = h('img', { class: 'cover-prev', alt: '' }); if (cover) prev.src = cover; else prev.hidden = true;
      var url = h('input', { class: 'input', placeholder: 'Cover image link (https://...)', 'aria-label': 'Cover image link' });
      var file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload a cover image' });
      file.onchange = function () { QL.readImage(file.files[0], 700).then(function (d) { cover = d; prev.src = d; prev.hidden = false; }, function (e) { QL.toast(e.message, true); }); };
      url.oninput = function () { cover = url.value.trim(); if (cover) { prev.src = cover; prev.hidden = false; } else prev.hidden = true; };
      QL.modal('Quiz details', h('div', { class: 'stack' }, h('label', { text: 'Description' }), desc, h('label', { text: 'Cover image' }), url, h('div', { class: 'row' }, h('span', { class: 'muted small', text: 'or' }), file), prev),
        [{ label: 'Save', primary: true, fn: function () { k.desc = desc.value.trim(); k.cover = cover || ''; touch(); } }]);
    }

    /* ----- left: the list of questions ----- */
    function sidebar() {
      var list = h('ol', { class: 'qlist' });
      k.questions.forEach(function (q, i) {
        var p = QL.problems(q);
        var li = h('li', { class: 'qitem' + (i === sel ? ' on' : '') + (p ? ' warn' : ''), draggable: true, tabindex: 0, 'aria-label': 'Question ' + (i + 1) },
          h('div', { class: 'qi-n', text: String(i + 1) }),
          h('div', { class: 'qi-b' }, h('b', { text: q.text || 'New question' }), h('small', { text: QL.TYPES[q.type].label + (p ? ' · ' + p : '') })),
          h('div', { class: 'qi-a' },
            h('button', { title: 'Move up', 'aria-label': 'Move up', text: '↑', disabled: i === 0, onclick: function (e) { e.stopPropagation(); move(i, i - 1); } }),
            h('button', { title: 'Move down', 'aria-label': 'Move down', text: '↓', disabled: i === k.questions.length - 1, onclick: function (e) { e.stopPropagation(); move(i, i + 1); } }),
            h('button', { title: 'Duplicate', 'aria-label': 'Duplicate', text: '⧉', onclick: function (e) { e.stopPropagation(); var c = QL.clone(q); c.id = QL.uid(); k.questions.splice(i + 1, 0, c); sel = i + 1; touch(); draw(); } }),
            h('button', { title: 'Delete', 'aria-label': 'Delete', text: '✕', onclick: function (e) { e.stopPropagation(); if (k.questions.length === 1) { k.questions[0] = QL.newQuestion('quiz'); } else k.questions.splice(i, 1); sel = Math.min(sel, k.questions.length - 1); touch(); draw(); } })));
        li.onclick = function () { sel = i; draw(); };
        li.onkeydown = function (e) { if (e.key === 'Enter') { sel = i; draw(); } };
        li.ondragstart = function (e) { e.dataTransfer.setData('text/plain', String(i)); li.classList.add('drag'); };
        li.ondragend = function () { li.classList.remove('drag'); };
        li.ondragover = function (e) { e.preventDefault(); li.classList.add('over'); };
        li.ondragleave = function () { li.classList.remove('over'); };
        li.ondrop = function (e) { e.preventDefault(); var from = Number(e.dataTransfer.getData('text/plain')); if (!isNaN(from)) move(from, i); };
        list.appendChild(li);
      });
      var types = h('div', { class: 'addmenu' });
      Object.keys(QL.TYPES).forEach(function (t) { types.appendChild(h('button', { class: 'addtype', title: QL.TYPES[t].hint, text: QL.TYPES[t].label, onclick: function () { k.questions.push(QL.newQuestion(t)); sel = k.questions.length - 1; touch(); draw(); } })); });
      return h('aside', { class: 'ed-side' }, list, h('h4', { text: 'Add a question' }), types, h('div', { class: 'stack', style: 'margin-top:12px' },
        h('button', { class: 'btn', text: 'Add from the question bank', onclick: fromBank }),
        h('button', { class: 'btn', text: 'Import a spreadsheet (CSV)', onclick: importCsv }),
        h('button', { class: 'btn', text: 'Make questions from text', onclick: generator })));
    }
    function move(a, b) { if (b < 0 || b >= k.questions.length) return; var q = k.questions.splice(a, 1)[0]; k.questions.splice(b, 0, q); sel = b; touch(); draw(); }

    /* ----- right: the form for the chosen question ----- */
    function field(label, el, hint) { return h('div', { class: 'field' }, h('label', { text: label }), el, hint ? h('p', { class: 'muted small', text: hint }) : null); }
    function textInput(obj, key, ph, max, area) {
      var i = area ? h('textarea', { class: 'input', rows: 3, maxlength: max || 200, placeholder: ph }) : h('input', { class: 'input', maxlength: max || 200, placeholder: ph, autocomplete: 'off' });
      i.value = obj[key] == null ? '' : obj[key]; i.oninput = function () { obj[key] = i.value; touch(); syncSide(); }; return i;
    }
    function syncSide() { var q = cur(), li = QL.$$('.qitem')[sel]; if (!li) return; li.querySelector('b').textContent = q.text || 'New question'; var p = QL.problems(q); li.querySelector('small').textContent = QL.TYPES[q.type].label + (p ? ' · ' + p : ''); li.classList.toggle('warn', !!p); }

    function questionForm() {
      var q = cur(), t = q.type, f = h('div', { class: 'qform' });
      f.appendChild(h('div', { class: 'row between' }, h('h3', { text: 'Question ' + (sel + 1) + ': ' + QL.TYPES[t].label }), h('div', { class: 'row' },
        h('button', { class: 'btn small', text: 'Save to bank', onclick: function () { var b = QL.load('bank', []); var c = QL.clone(q); c.id = QL.uid(); b.unshift(c); QL.save('bank', b.slice(0, 500)); QL.toast('Saved to your question bank'); } }),
        changeType(q))));
      f.appendChild(field('Question', textInput(q, 'text', 'Type your question', 240, true)));
      f.appendChild(mediaField(q));
      if (t === 'quiz') f.appendChild(optionsEditor(q, true));
      if (t === 'tf') f.appendChild(tfEditor(q));
      if (t === 'poll') f.appendChild(optionsEditor(q, false));
      if (t === 'type') f.appendChild(typeEditor(q));
      if (t === 'puzzle') f.appendChild(puzzleEditor(q));
      if (t === 'slider') f.appendChild(sliderEditor(q));
      if (t === 'pin') f.appendChild(pinEditor(q));
      f.appendChild(h('div', { class: 'row' }, timeField(q), QL.TYPES[t].scored ? pointsField(q) : null));
      return f;
    }
    function changeType(q) {
      var s = h('select', { class: 'input small', 'aria-label': 'Change the type' }); Object.keys(QL.TYPES).forEach(function (t) { var o = h('option', { value: t, text: QL.TYPES[t].label }); if (q.type === t) o.selected = true; s.appendChild(o); });
      s.onchange = function () { var n = QL.newQuestion(s.value); n.id = q.id; n.text = q.text; n.media = q.media; k.questions[sel] = n; touch(); draw(); };
      return s;
    }
    function timeField(q) {
      var s = h('select', { class: 'input small', 'aria-label': 'Time limit' }); QL.TIMES.forEach(function (n) { var o = h('option', { value: n, text: n >= 60 ? (n / 60) + ' min' : n + ' sec' }); if (q.time === n) o.selected = true; s.appendChild(o); });
      s.onchange = function () { q.time = Number(s.value); touch(); }; return field('Time limit', s);
    }
    function pointsField(q) {
      var s = h('select', { class: 'input small', 'aria-label': 'Points' }); [['standard', 'Standard (up to 1000)'], ['double', 'Double (up to 2000)'], ['none', 'No points']].forEach(function (p) { var o = h('option', { value: p[0], text: p[1] }); if (q.points === p[0]) o.selected = true; s.appendChild(o); });
      s.onchange = function () { q.points = s.value; touch(); }; return field('Points', s);
    }
    function mediaField(q) {
      var url = h('input', { class: 'input', placeholder: 'Image link or YouTube link (optional)', 'aria-label': 'Picture or video link', value: q.media ? (q.media.url.indexOf('data:') === 0 ? '' : q.media.url) : '' });
      var file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload a picture' });
      var prev = h('div', { class: 'media-prev' }); function show() { prev.textContent = ''; var m = QL.mediaEl(q.media, 'thumb'); if (m) prev.appendChild(m); if (q.media) prev.appendChild(h('button', { class: 'link', text: 'Remove the picture or video', onclick: function () { q.media = null; url.value = ''; touch(); show(); } })); }
      url.oninput = function () { var v = url.value.trim(); q.media = v ? QL.mediaFromUrl(v) : null; touch(); show(); };
      file.onchange = function () { QL.readImage(file.files[0], 900).then(function (d) { q.media = { kind: 'image', url: d }; url.value = ''; touch(); show(); }, function (e) { QL.toast(e.message, true); }); };
      show(); return field('Picture or video', h('div', { class: 'stack' }, url, h('div', { class: 'row' }, h('span', { class: 'muted small', text: 'or upload' }), file), prev));
    }
    function optionsEditor(q, scored) {
      var box = h('div', { class: 'opts-ed' });
      function draw2() {
        box.textContent = '';
        q.options.forEach(function (o, i) {
          var inp = h('input', { class: 'input', maxlength: 100, placeholder: 'Answer ' + (i + 1) + (i > 1 ? ' (optional)' : ''), autocomplete: 'off', value: o.t }); inp.oninput = function () { o.t = inp.value; touch(); syncSide(); };
          var row = h('div', { class: 'opt-row', style: 'border-left:6px solid ' + QL.COLORS[i % 6] });
          row.appendChild(h('span', { class: 'shape-dot', style: 'background:' + QL.COLORS[i % 6] }, QL.shape(i, 18)));
          row.appendChild(inp);
          if (scored) {
            var c = h('input', { type: q.multi ? 'checkbox' : 'radio', name: 'right', 'aria-label': 'Right answer ' + (i + 1) }); c.checked = !!o.ok;
            c.onchange = function () { if (!q.multi) q.options.forEach(function (x) { x.ok = false; }); o.ok = c.checked; touch(); syncSide(); draw2(); };
            row.appendChild(h('label', { class: 'rt' }, c, h('span', { text: 'Right' })));
          }
          if (q.options.length > 2) row.appendChild(h('button', { class: 'x', text: '×', 'aria-label': 'Remove this answer', onclick: function () { q.options.splice(i, 1); touch(); draw2(); } }));
          box.appendChild(row);
        });
        var ctl = h('div', { class: 'row' });
        if (q.options.length < 6) ctl.appendChild(h('button', { class: 'btn small', text: 'Add an answer', onclick: function () { q.options.push(scored ? { t: '', ok: false } : { t: '' }); touch(); draw2(); } }));
        if (scored) { var m = h('input', { type: 'checkbox' }); m.checked = !!q.multi; m.onchange = function () { q.multi = m.checked; if (!q.multi) { var seen = false; q.options.forEach(function (x) { if (x.ok && seen) x.ok = false; if (x.ok) seen = true; }); } touch(); draw2(); }; ctl.appendChild(h('label', { class: 'opt' }, m, h('span', { text: 'More than one right answer' }))); }
        box.appendChild(ctl);
      }
      draw2(); return field(scored ? 'Answers' : 'Choices', box);
    }
    function tfEditor(q) {
      var r = h('div', { class: 'row' });
      [0, 1].forEach(function (i) { var c = h('input', { type: 'radio', name: 'tf' }); c.checked = !!q.options[i].ok; c.onchange = function () { q.options[0].ok = i === 0; q.options[1].ok = i === 1; touch(); }; r.appendChild(h('label', { class: 'opt big', style: 'border-left:6px solid ' + QL.COLORS[i] }, c, h('span', { text: q.options[i].t + (i === 0 ? ' is right' : ' is right') }))); });
      return field('The right answer', r);
    }
    function typeEditor(q) {
      var box = h('div', { class: 'stack' });
      function draw2() {
        box.textContent = '';
        q.answers.forEach(function (a, i) {
          var inp = h('input', { class: 'input', maxlength: 100, placeholder: i ? 'Another accepted answer' : 'The accepted answer', value: a, autocomplete: 'off' }); inp.oninput = function () { q.answers[i] = inp.value; touch(); syncSide(); };
          box.appendChild(h('div', { class: 'row' }, inp, q.answers.length > 1 ? h('button', { class: 'x', text: '×', 'aria-label': 'Remove', onclick: function () { q.answers.splice(i, 1); touch(); draw2(); } }) : null));
        });
        if (q.answers.length < 6) box.appendChild(h('button', { class: 'btn small', text: 'Add another accepted answer', onclick: function () { q.answers.push(''); draw2(); } }));
      }
      draw2(); return field('Accepted answers', box, 'Capital letters, accents and punctuation do not matter.');
    }
    function puzzleEditor(q) {
      var box = h('div', { class: 'stack' });
      function draw2() {
        box.textContent = '';
        q.items.forEach(function (a, i) {
          var inp = h('input', { class: 'input', maxlength: 80, placeholder: i === 0 ? 'First' : i === q.items.length - 1 ? 'Last' : 'Next', value: a, autocomplete: 'off' }); inp.oninput = function () { q.items[i] = inp.value; touch(); syncSide(); };
          box.appendChild(h('div', { class: 'row' }, h('b', { class: 'qi-n', text: String(i + 1) }), inp, q.items.length > 2 ? h('button', { class: 'x', text: '×', 'aria-label': 'Remove', onclick: function () { q.items.splice(i, 1); touch(); draw2(); } }) : null));
        });
        if (q.items.length < 6) box.appendChild(h('button', { class: 'btn small', text: 'Add an item', onclick: function () { q.items.push(''); draw2(); } }));
      }
      draw2(); return field('Items in the right order', box, 'Type them in the right order. Players see them mixed up.');
    }
    function sliderEditor(q) {
      function num(key, label) { var i = h('input', { class: 'input small', type: 'number', value: q[key], 'aria-label': label }); i.oninput = function () { q[key] = i.value === '' ? '' : Number(i.value); touch(); syncSide(); }; return field(label, i); }
      var m = h('select', { class: 'input small', 'aria-label': 'How close counts' }); [['low', 'Small (5% of the scale)'], ['medium', 'Medium (10%)'], ['high', 'Large (20%)'], ['all', 'Any answer scores, closer is better']].forEach(function (p) { var o = h('option', { value: p[0], text: p[1] }); if (q.margin === p[0]) o.selected = true; m.appendChild(o); }); m.onchange = function () { q.margin = m.value; touch(); };
      var unit = h('input', { class: 'input small', maxlength: 12, placeholder: 'm, kg, %', value: q.unit || '', 'aria-label': 'Unit' }); unit.oninput = function () { q.unit = unit.value; touch(); };
      return h('div', { class: 'row' }, num('min', 'Smallest'), num('max', 'Largest'), num('step', 'Step'), num('correct', 'Right number'), field('Unit', unit), field('How close counts', m));
    }
    function pinEditor(q) {
      var box = h('div', { class: 'stack' });
      function draw2() {
        box.textContent = '';
        var url = h('input', { class: 'input', placeholder: 'Picture link (https://...)', 'aria-label': 'Picture link', value: q.img && q.img.indexOf('data:') === 0 ? '' : q.img || '' }); url.oninput = function () { q.img = url.value.trim(); touch(); draw2(); };
        var file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload a picture' }); file.onchange = function () { QL.readImage(file.files[0], 1000).then(function (d) { q.img = d; touch(); draw2(); }, function (e) { QL.toast(e.message, true); }); };
        box.appendChild(url); box.appendChild(h('div', { class: 'row' }, h('span', { class: 'muted small', text: 'or upload' }), file));
        if (q.img) {
          var wrap = h('div', { class: 'pinbox edit' }, h('img', { src: q.img, alt: '', referrerpolicy: 'no-referrer' }), h('i', { class: 'pinzone', style: zone() }));
          wrap.onclick = function (e) { var im = wrap.querySelector('img'), rc = im.getBoundingClientRect(); q.area.x = QL.clamp((e.clientX - rc.left) / rc.width, 0, 1); q.area.y = QL.clamp((e.clientY - rc.top) / rc.height, 0, 1); touch(); wrap.querySelector('.pinzone').setAttribute('style', zone()); };
          var r = h('input', { type: 'range', min: 3, max: 40, value: Math.round(q.area.r * 100), 'aria-label': 'Size of the right area' }); r.oninput = function () { q.area.r = Number(r.value) / 100; touch(); wrap.querySelector('.pinzone').setAttribute('style', zone()); };
          box.appendChild(wrap); box.appendChild(h('label', { class: 'muted small', text: 'Click the picture to place the right spot. Size of the area:' })); box.appendChild(r);
        }
      }
      function zone() { return 'left:' + (q.area.x * 100) + '%;top:' + (q.area.y * 100) + '%;width:' + (q.area.r * 200) + '%;aspect-ratio:1'; }
      draw2(); return field('Picture and right spot', box);
    }

    /* ----- the question bank ----- */
    function fromBank() {
      var bank = QL.load('bank', []), list = h('div', { class: 'bank' }), q = h('input', { class: 'input', placeholder: 'Search your bank', 'aria-label': 'Search' });
      var chosen = {};
      function draw2() {
        list.textContent = ''; var s = QL.norm(q.value), n = 0;
        bank.forEach(function (b, i) {
          if (s && QL.norm(b.text).indexOf(s) < 0) return; n++;
          var c = h('input', { type: 'checkbox', 'aria-label': 'Add this question' }); c.checked = !!chosen[i]; c.onchange = function () { chosen[i] = c.checked; };
          list.appendChild(h('label', { class: 'bank-item' }, c, h('span', null, h('b', { text: b.text || '(no text)' }), h('small', { text: QL.TYPES[b.type] ? QL.TYPES[b.type].label : b.type }))));
        });
        if (!n) list.appendChild(h('p', { class: 'muted', text: bank.length ? 'Nothing matches.' : 'Your bank is empty. Use "Save to bank" on any question to keep it here.' }));
      }
      q.oninput = draw2; draw2();
      QL.modal('Question bank', h('div', { class: 'stack' }, q, list), [{ label: 'Add the chosen questions', primary: true, fn: function () { var add = Object.keys(chosen).filter(function (i) { return chosen[i]; }).map(function (i) { var c = QL.clone(bank[i]); c.id = QL.uid(); return c; }); if (!add.length) return false; add.forEach(function (c) { k.questions.push(c); }); sel = k.questions.length - add.length; touch(); draw(); } }]);
    }

    /* ----- import / quick generator ----- */
    function importCsv() {
      var file = h('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Choose a CSV file' });
      var ta = h('textarea', { class: 'input', rows: 6, placeholder: 'or paste rows here', 'aria-label': 'Paste CSV text' });
      var tpl = h('button', { class: 'link', text: 'Download an example spreadsheet', onclick: function () { QL.download('quiz-example.csv', QL.toCsv([QL.CSV_HEAD, ['What is the capital of France?', 'Paris', 'Rome', 'Madrid', 'Berlin', '1', '20', ''], ['Which are prime numbers?', '2', '4', '5', '9', '1;3', '30', '']]), 'text/csv'); } });
      file.onchange = function () { var fr = new FileReader(); fr.onload = function () { ta.value = fr.result; }; fr.readAsText(file.files[0]); };
      QL.modal('Import from a spreadsheet', h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'Columns: Question, Answer 1 to 4, Correct answer(s) as numbers like 1 or 1;3, Time in seconds, Image or video link.' }), tpl, file, ta),
        [{ label: 'Import', primary: true, fn: function () { var qs = QL.csvToQuestions(ta.value); if (!qs.length) { QL.toast('No questions found in that text.', true); return false; } if (k.questions.length === 1 && !k.questions[0].text) k.questions = []; qs.forEach(function (x) { k.questions.push(x); }); sel = Math.max(0, k.questions.length - qs.length); touch(); draw(); QL.toast(qs.length + ' questions added'); } }]);
    }
    function generator() {
      var ta = h('textarea', { class: 'input', rows: 9, placeholder: 'Paste a few paragraphs of notes or an article here', 'aria-label': 'Text to make questions from' });
      var n = h('select', { class: 'input small', 'aria-label': 'How many' }); [3, 5, 8, 10, 20, 30, 50].forEach(function (x) { n.appendChild(h('option', { value: x, text: x + ' questions' })); });
      QL.modal('Make questions from text', h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'This picks sentences and hides a key word, with 3 wrong choices taken from the same text. It does not use AI, so read each question and fix anything odd.' }), ta, n),
        [{ label: 'Make the questions', primary: true, fn: function () { var qs = QL.quickGenerate(ta.value, Number(n.value)); if (!qs.length) { QL.toast('That text is too short. Paste at least a paragraph with full sentences.', true); return false; } if (k.questions.length === 1 && !k.questions[0].text) k.questions = []; qs.forEach(function (x) { k.questions.push(x); }); sel = Math.max(0, k.questions.length - qs.length); touch(); draw(); QL.toast(qs.length + ' questions added. Check them.'); } }]);
    }

    /* ----- sharing and exporting ----- */
    function exporter() {
      var name = (k.title || 'quiz').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'quiz';
      QL.modal('Export', h('div', { class: 'stack' },
        h('button', { class: 'btn', text: 'Download as a quiz file (.json)', onclick: function () { QL.download(name + '.quizblast.json', JSON.stringify(k, null, 1), 'application/json'); } }),
        h('button', { class: 'btn', text: 'Download as a spreadsheet (.csv)', onclick: function () { QL.download(name + '.csv', QL.quizToCsv(k), 'text/csv'); } }),
        h('p', { class: 'muted small', text: 'The spreadsheet keeps quiz and true or false questions. The quiz file keeps everything.' })));
    }
    function share() {
      var out = QL.shareable(k), box = h('div', { class: 'stack' }), link = h('textarea', { class: 'input', rows: 3, readonly: true, 'aria-label': 'Share link' }); link.value = 'Making the link...';
      var ch = h('textarea', { class: 'input', rows: 3, readonly: true, 'aria-label': 'Challenge link' }); ch.value = 'Making the link...';
      var date = h('input', { class: 'input', type: 'date', 'aria-label': 'Challenge deadline' });
      var inbox = 'qbx' + k.id;
      function makeCh() { var u = date.value ? new Date(date.value + 'T23:59:59').getTime() : 0; QL.pack(out.quiz).then(function (p) { ch.value = QL.baseUrl() + '?play=' + p + (u ? '&until=' + u : '') + '&to=' + inbox; }); }
      date.onchange = makeCh;
      QL.pack(out.quiz).then(function (p) { link.value = QL.baseUrl() + '?quiz=' + p; makeCh(); if (link.value.length > 8000) box.appendChild(h('p', { class: 'warn-t', text: 'This link is very long. Chat apps may cut it. Use "Download as a quiz file" for big quizzes.' })); });
      function copy(el) { return h('button', { class: 'btn small', text: 'Copy', onclick: function () { navigator.clipboard && navigator.clipboard.writeText(el.value).then(function () { QL.toast('Copied'); }); } }); }
      box.appendChild(h('h4', { text: 'Share the quiz' })); box.appendChild(h('p', { class: 'muted small', text: 'Anyone who opens this link gets their own copy to edit or host. Paste it into Google Classroom, Microsoft Teams, Zoom chat or an email.' })); box.appendChild(link); box.appendChild(copy(link));
      box.appendChild(h('h4', { text: 'Challenge link (play on their own, any time)' })); box.appendChild(h('p', { class: 'muted small', text: 'Players do the quiz alone and get a result code. Open the Reports page and "Challenge results" to collect them. Optional deadline:' })); box.appendChild(date); box.appendChild(ch); box.appendChild(copy(ch));
      if (out.removed) box.appendChild(h('p', { class: 'warn-t', text: out.removed + ' large uploaded picture(s) were left out of the links to keep them short. Use picture links instead of uploads for shared quizzes.' }));
      QL.modal('Share', box);
    }

    draw();
    return { flush: function () { if (dirty) persist(); } };
  };
})();

/* The app shell: pages (my quizzes, reports, study, join), samples, and the links people open. */
(function () {
  'use strict';
  var QL = window.QL, h = QL.h, root;

  function samples() {
    function q(type, text, extra) { var x = QL.newQuestion(type); x.text = text; for (var k in extra) x[k] = extra[k]; return x; }
    function opts(list, right) { return list.map(function (t, i) { return { t: t, ok: i === right }; }); }
    var a = QL.newKahoot(); a.title = 'Sample: General knowledge'; a.desc = 'One of each kind of question, to try the app.'; a.theme = 'night';
    a.questions = [
      q('quiz', 'Which planet is known as the Red Planet?', { options: opts(['Venus', 'Mars', 'Jupiter', 'Mercury'], 1), time: 15 }),
      q('tf', 'The Great Wall of China is visible from the Moon with the naked eye.', { options: [{ t: 'True', ok: false }, { t: 'False', ok: true }] }),
      q('type', 'What is the chemical symbol for gold?', { answers: ['Au'], time: 20 }),
      q('puzzle', 'Put these in order, smallest to largest.', { items: ['Mouse', 'Cat', 'Horse', 'Elephant'] }),
      q('slider', 'How many bones are in the adult human body?', { min: 100, max: 300, step: 1, correct: 206, margin: 'medium' }),
      q('quiz', 'Which of these are mammals?', { multi: true, options: [{ t: 'Dolphin', ok: true }, { t: 'Shark', ok: false }, { t: 'Bat', ok: true }, { t: 'Penguin', ok: false }], time: 20, points: 'double' }),
      q('poll', 'What would you like to learn next?', { options: [{ t: 'Space' }, { t: 'History' }, { t: 'Music' }, { t: 'Coding' }] }),
      q('cloud', 'Describe your day in one word.', {}),
      q('open', 'What is one thing you learned today?', {}),
      q('brainstorm', 'Give an idea for a class trip.', {})
    ];
    var b = QL.newKahoot(); b.title = 'Sample: Quick maths'; b.theme = 'ocean'; b.desc = 'Fast questions with a streak bonus.';
    b.questions = [
      q('quiz', '7 x 8 = ?', { options: opts(['54', '56', '58', '64'], 1), time: 10 }), q('quiz', '144 / 12 = ?', { options: opts(['10', '11', '12', '14'], 2), time: 10 }),
      q('type', 'What is 15% of 200?', { answers: ['30'], time: 20 }), q('tf', 'Zero is an even number.', { options: [{ t: 'True', ok: true }, { t: 'False', ok: false }], time: 10 }),
      q('slider', 'About what is pi? (to 2 decimals, x100)', { min: 300, max: 330, step: 1, correct: 314, margin: 'low' })
    ];
    return [a, b];
  }

  function page(name) {
    QL.$$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === name); });
    var m = QL.$('#page'); m.textContent = ''; QL.$('#page').hidden = false; QL.$('#stage').hidden = true; QL.$('#tabs').hidden = false; QL.$('#hdr').hidden = false;
    QL.music(false);
    if (name === 'quizzes') library(m);
    else if (name === 'reports') QL.reportsPage(m);
    else if (name === 'study') QL.studyPage(m);
    else if (name === 'join') joinPage(m);
  }
  function full(node) { QL.$('#page').hidden = true; QL.$('#tabs').hidden = true; QL.$('#hdr').hidden = true; var s = QL.$('#stage'); s.hidden = false; s.textContent = ''; s.appendChild(node); return node; }

  /* ---------------- my quizzes ---------------- */
  function library(m) {
    var all = QL.lib.all(), q = h('input', { class: 'input', placeholder: 'Search your quizzes', 'aria-label': 'Search' }), folder = h('select', { class: 'input small', 'aria-label': 'Folder' });
    folder.appendChild(h('option', { value: '', text: 'All folders' })); Object.keys(all.reduce(function (o, k) { if (k.folder) o[k.folder] = 1; return o; }, {})).forEach(function (f) { folder.appendChild(h('option', { value: f, text: f })); });
    m.appendChild(h('div', { class: 'row between' }, h('h2', { text: 'My quizzes' }), h('div', { class: 'row' },
      h('button', { class: 'btn primary', text: 'Create a quiz', onclick: function () { edit(QL.newKahoot()); } }),
      h('button', { class: 'btn', text: 'Import', onclick: importDialog }))));
    m.appendChild(h('div', { class: 'row' }, q, folder));
    var grid = h('div', { class: 'qgrid' }); m.appendChild(grid);
    function draw() {
      grid.textContent = ''; var s = QL.norm(q.value), n = 0;
      QL.lib.all().forEach(function (k) {
        if (folder.value && k.folder !== folder.value) return; if (s && QL.norm(k.title + ' ' + k.desc).indexOf(s) < 0) return; n++;
        var th = QL.THEMES[k.theme] || QL.THEMES.night, ready = k.questions.filter(function (x) { return !QL.problems(x); }).length;
        var cover = h('div', { class: 'qc-cover', style: 'background:linear-gradient(160deg,' + th[0] + ',' + th[1] + ')' });
        if (k.cover) { var im = h('img', { src: k.cover, alt: '', referrerpolicy: 'no-referrer' }); im.onerror = function () { im.remove(); }; cover.appendChild(im); }
        grid.appendChild(h('div', { class: 'qcard' }, cover, h('div', { class: 'qc-b' }, h('h3', { text: k.title || 'Untitled quiz' }), h('p', { class: 'muted small', text: ready + ' of ' + k.questions.length + ' questions ready' + (k.folder ? ' · ' + k.folder : '') + (k.vis === 'public' ? ' · public' : '')  }),
          h('div', { class: 'row' }, h('button', { class: 'btn primary small', text: 'Play live', disabled: !ready, onclick: function () { QL.startLive(k); } }), h('button', { class: 'btn small', text: 'Edit', onclick: function () { edit(k); } }), h('button', { class: 'btn small', text: 'Study', onclick: function () { page('study'); QL.studyPage(QL.$('#page'), k.id); } }), h('button', { class: 'btn small', text: 'Solo', disabled: !ready, onclick: function () { solo(k, 'preview'); } })),
          h('div', { class: 'row' }, h('button', { class: 'link', text: 'Duplicate', onclick: function () { var c = QL.clone(k); c.id = QL.uid(); c.title = (k.title || 'Untitled') + ' (copy)'; c.created = Date.now(); QL.lib.put(c); page('quizzes'); } }), h('button', { class: 'link', text: 'Delete', onclick: function () { if (confirm('Delete "' + (k.title || 'this quiz') + '"?')) { QL.lib.del(k.id); page('quizzes'); } } })))));
      });
      if (!n) grid.appendChild(h('div', { class: 'empty' }, h('p', { class: 'muted', text: QL.lib.all().length ? 'No quiz matches.' : 'You have no quizzes yet. Create one, import one, or add a sample to try the app.' }), QL.lib.all().length ? null : h('button', { class: 'btn primary', text: 'Add the sample quizzes', onclick: function () { samples().forEach(function (k) { QL.lib.put(k); }); page('quizzes'); } })));
    }
    q.oninput = draw; folder.onchange = draw; draw();
  }
  function edit(k) {
    var node = full(h('div', { id: 'edit-root' }));
    QL.editor(k, node, { onExit: function () { page('quizzes'); }, onLive: function (x) { QL.startLive(x); }, onPreview: function (x) { solo(x, 'preview', function () { edit(QL.lib.get(x.id) || x); }); } });
  }
  function solo(k, mode, back) {
    var node = full(h('div', { id: 'solo-root' }));
    QL.soloPlay(k, node, { mode: mode, onExit: back || function () { page('quizzes'); } });
  }
  QL.startLive = function (k) {
    var node = full(h('div', { id: 'host-root' }));
    QL.hostGame(k, node, function () { page('quizzes'); });
  };

  function importDialog() {
    var file = h('input', { type: 'file', accept: '.json,.csv,application/json,text/csv', 'aria-label': 'Choose a file' });
    var ta = h('textarea', { class: 'input', rows: 4, placeholder: 'or paste a share link here', 'aria-label': 'Share link' });
    file.onchange = function () {
      var f = file.files[0]; if (!f) return; var fr = new FileReader();
      fr.onload = function () {
        try {
          if (/\.csv$/i.test(f.name)) { var k = QL.newKahoot(); k.title = f.name.replace(/\.csv$/i, ''); k.questions = QL.csvToQuestions(fr.result); if (!k.questions.length) throw new Error('No questions found.'); QL.lib.put(k); }
          else { var j = JSON.parse(fr.result); if (!j || !Array.isArray(j.questions)) throw new Error('This is not a quiz file.'); j.id = QL.uid(); QL.lib.put(j); }
          QL.toast('Imported'); document.querySelector('.modal-back') && document.querySelector('.modal-back').remove(); page('quizzes');
        } catch (e) { QL.toast(e.message || 'That file could not be read.', true); }
      };
      fr.readAsText(f);
    };
    QL.modal('Import a quiz', h('div', { class: 'stack' }, h('p', { class: 'muted', text: 'A quiz file (.json) or a spreadsheet (.csv).' }), file, ta),
      [{ label: 'Import the link', primary: true, fn: function () { var m = /[?&](?:quiz|play)=([^&\s]+)/.exec(ta.value); if (!m) { QL.toast('Paste a share link.', true); return false; } QL.unpack(m[1]).then(function (j) { j.id = QL.uid(); QL.lib.put(j); QL.toast('Imported'); page('quizzes'); }, function () { QL.toast('That link could not be read.', true); }); } }]);
  }

  /* ---------------- join a game ---------------- */
  function joinPage(m) {
    m.appendChild(h('h2', { text: 'Join a game' })); m.appendChild(h('p', { class: 'muted', text: 'Have a game PIN from a host? Join here, or scan the host\'s code with your phone.' }));
    var box = h('div', { class: 'join-embed' }); m.appendChild(box);
    var node = box; QL.playerApp(node, '');
  }

  /* ---------------- links people open ---------------- */
  function challengeLanding(packed, until, to) {
    var n = full(h('div', { class: 'pscreen join' }));
    QL.unpack(packed).then(function (k) {
      if (!k || !Array.isArray(k.questions)) throw new Error('bad');
      n.textContent = '';
      var late = until && Date.now() > Number(until);
      var name = h('input', { class: 'input big-in', maxlength: 20, placeholder: 'Your name', 'aria-label': 'Your name' }); name.value = QL.load('lastname', '');
      n.appendChild(h('div', { class: 'center-box join' }, h('div', { class: 'logo-mark', text: QL.NAME }), h('h1', { text: k.title || 'Challenge' }), k.desc ? h('p', { class: 'muted', text: k.desc }) : null,
        h('p', { class: 'muted', text: k.questions.length + ' questions' + (until ? '. Open until ' + new Date(Number(until)).toLocaleDateString() : '') }),
        late ? h('p', { class: 'err', text: 'This challenge has closed.' }) : h('div', { class: 'stack' }, name, h('button', { class: 'btn primary big', text: 'Start', onclick: function () { var nm = QL.cleanName(name.value); if (!nm) { QL.toast('Type your name.', true); return; } QL.save('lastname', nm); k.id = k.id || QL.uid(); QL.soloPlay(k, n, { mode: 'challenge', name: nm, sendTo: to || '', onExit: function () { location.href = QL.baseUrl(); } }); } }))));
    }).catch(function () { n.textContent = ''; n.appendChild(h('div', { class: 'center-box' }, h('h1', { text: 'That link did not work' }), h('p', { class: 'muted', text: 'Ask for a new one.' }), h('a', { class: 'btn', href: QL.baseUrl(), text: 'Open ' + QL.NAME }))); });
  }
  function importLink(packed) {
    QL.unpack(packed).then(function (k) {
      if (!k || !Array.isArray(k.questions)) throw new Error('bad');
      boot('quizzes');
      QL.modal('Someone shared a quiz', h('div', { class: 'stack' }, h('h3', { text: k.title || 'Untitled quiz' }), h('p', { class: 'muted', text: k.questions.length + ' questions. Add it to your quizzes?' })),
        [{ label: 'Add to my quizzes', primary: true, fn: function () { k.id = QL.uid(); k.created = Date.now(); QL.lib.put(k); history.replaceState(null, '', QL.baseUrl()); page('quizzes'); } }]);
    }).catch(function () { boot('quizzes'); QL.toast('That share link could not be read.', true); });
  }

  function boot(p) {
    QL.$$('#tabs button').forEach(function (b) { b.onclick = function () { page(b.dataset.p); }; });
    page(p || 'quizzes');
  }
  function start() {
    var q = new URLSearchParams(location.search);
    if (q.get('join')) { QL.$('#page').hidden = true; QL.$('#tabs').hidden = true; QL.$('#hdr').hidden = true; var s = QL.$('#stage'); s.hidden = false; QL.playerApp(s, String(q.get('join')).replace(/\D/g, '').slice(0, 6)); return; }
    if (q.get('play')) return challengeLanding(q.get('play'), q.get('until'), q.get('to'));
    if (q.get('quiz')) return importLink(q.get('quiz'));
    boot('quizzes');
  }
  document.addEventListener('DOMContentLoaded', start);
})();

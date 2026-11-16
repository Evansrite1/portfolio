/* Reports (live games and challenge results) and Study mode (flashcards with spaced review). */
(function () {
  'use strict';
  var QL = window.QL, h = QL.h;

  /* ---------------------------------------------------------------- reports */
  QL.exportReportCsv = function (rep) {
    var head = ['Rank', 'Name', 'Team', 'Score', 'Right answers', 'Best streak'];
    rep.questions.forEach(function (q, i) { head.push('Q' + (i + 1) + ' right', 'Q' + (i + 1) + ' points', 'Q' + (i + 1) + ' seconds'); });
    var rows = [head];
    rep.players.forEach(function (p) {
      var r = [p.rank, p.name, p.team || '', p.score, p.right, p.best];
      rep.questions.forEach(function (q, i) { var a = p.answers[i] || {}; r.push(a.answered ? (a.right ? 'yes' : 'no') : 'no answer', a.pts || 0, a.ms ? Math.round(a.ms / 100) / 10 : ''); });
      rows.push(r);
    });
    rows.push([]); rows.push(['Question', 'Type', 'Answered', 'Right', 'Right %', 'Average seconds', 'Right answer']);
    rep.questions.forEach(function (q, i) { rows.push([(i + 1) + '. ' + q.text, q.type, q.answered, q.right, q.answered ? Math.round(q.right / q.answered * 100) : 0, q.avgMs ? Math.round(q.avgMs / 100) / 10 : '', q.answer]); });
    QL.download((rep.title || 'quiz').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '-results.csv', QL.toCsv(rows), 'text/csv');
  };

  QL.reportsPage = function (mount) {
    mount.textContent = '';
    var reps = QL.load('reports', []), chal = QL.load('challenges', []);
    mount.appendChild(h('h2', { text: 'Reports' }));
    mount.appendChild(h('h3', { text: 'Live games' }));
    if (!reps.length) mount.appendChild(h('p', { class: 'muted', text: 'Finished games appear here, saved on this computer.' }));
    var list = h('div', { class: 'cardlist' });
    reps.forEach(function (r) {
      list.appendChild(h('div', { class: 'rcard' }, h('div', null, h('b', { text: r.title || 'Untitled quiz' }), h('p', { class: 'muted small', text: QL.fmtDate(r.date) + ' · ' + r.players.length + ' players · ' + r.questions.length + ' questions' })),
        h('div', { class: 'row' }, h('button', { class: 'btn small', text: 'Open', onclick: function () { detail(r); } }), h('button', { class: 'btn small', text: 'CSV', onclick: function () { QL.exportReportCsv(r); } }), h('button', { class: 'btn small danger', text: 'Delete', onclick: function () { if (!confirm('Delete this report?')) return; QL.save('reports', reps.filter(function (x) { return x.id !== r.id; })); QL.reportsPage(mount); } }))));
    });
    mount.appendChild(list);

    mount.appendChild(h('h3', { text: 'Challenge results' }));
    var quizzes = QL.lib.all(), pick = h('select', { class: 'input', 'aria-label': 'Which quiz' }); quizzes.forEach(function (q) { pick.appendChild(h('option', { value: q.id, text: q.title || 'Untitled quiz' })); });
    var status = h('p', { class: 'muted small', text: '' }), paste = h('textarea', { class: 'input', rows: 3, placeholder: 'Paste result codes here, one per line', 'aria-label': 'Result codes' });
    var inboxBtn = h('button', { class: 'btn', text: 'Open the inbox for this quiz', onclick: function () { openInbox(pick.value, status, function () { QL.reportsPage(mount); }); } });
    var addBtn = h('button', { class: 'btn primary', text: 'Add the pasted codes', onclick: function () {
      var lines = paste.value.split(/\s+/).filter(function (x) { return x.length > 20; }); if (!lines.length) return QL.toast('Paste at least one code.', true);
      Promise.all(lines.map(function (c) { return QL.unpack(c).then(function (r) { return addResult(r); }, function () { return false; }); })).then(function (rs) { var n = rs.filter(Boolean).length; QL.toast(n + ' result(s) added' + (n < lines.length ? ', ' + (lines.length - n) + ' could not be read' : '')); QL.reportsPage(mount); });
    } });
    mount.appendChild(h('div', { class: 'card' }, h('p', { class: 'muted', text: 'Players of a challenge link get a result code. Either paste the codes below, or open the inbox and keep this page open: results then arrive by themselves.' }), quizzes.length ? h('div', { class: 'row' }, pick, inboxBtn) : h('p', { class: 'muted', text: 'Make a quiz first.' }), status, paste, addBtn));
    var byQuiz = {}; chal.forEach(function (c) { (byQuiz[c.quizId] = byQuiz[c.quizId] || []).push(c); });
    Object.keys(byQuiz).forEach(function (id) {
      var rows = byQuiz[id].sort(function (a, b) { return b.score - a.score; }), t = h('table', { class: 'table' }, h('thead', null, h('tr', null, ['#', 'Name', 'Score', 'Right', 'Best streak', 'When'].map(function (x) { return h('th', { text: x }); }))));
      var tb = h('tbody'); rows.forEach(function (r, i) { tb.appendChild(h('tr', null, [i + 1, r.name, r.score, r.right, r.best, QL.fmtDate(r.date)].map(function (x) { return h('td', { text: String(x) }); }))); }); t.appendChild(tb);
      mount.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('b', { text: rows[0].title || 'Quiz' }), h('div', { class: 'row' }, h('button', { class: 'btn small', text: 'CSV', onclick: function () { QL.download('challenge-results.csv', QL.toCsv([['Rank', 'Name', 'Score', 'Right', 'Best streak', 'Date']].concat(rows.map(function (r, i) { return [i + 1, r.name, r.score, r.right, r.best, QL.fmtDate(r.date)]; }))), 'text/csv'); } }), h('button', { class: 'btn small danger', text: 'Clear', onclick: function () { if (confirm('Clear these results?')) { QL.save('challenges', QL.load('challenges', []).filter(function (c) { return c.quizId !== id; })); QL.reportsPage(mount); } } }))), t));
    });

    function detail(r) {
      var pt = h('table', { class: 'table' }, h('thead', null, h('tr', null, ['#', 'Name', r.team ? 'Team' : null, 'Score', 'Right', 'Best streak'].filter(Boolean).map(function (x) { return h('th', { text: x }); }))));
      var b = h('tbody'); r.players.forEach(function (p) { b.appendChild(h('tr', null, [p.rank, p.name, r.team ? p.team : null, p.score, p.right, p.best].filter(function (x) { return x !== null; }).map(function (x) { return h('td', { text: String(x) }); }))); }); pt.appendChild(b);
      var qt = h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Question', 'Type', 'Right %', 'Avg time', 'Answer'].map(function (x) { return h('th', { text: x }); }))));
      var qb = h('tbody'); r.questions.forEach(function (q, i) { qb.appendChild(h('tr', null, [(i + 1) + '. ' + q.text, QL.TYPES[q.type] ? QL.TYPES[q.type].label : q.type, QL.TYPES[q.type] && QL.TYPES[q.type].scored ? (q.answered ? Math.round(q.right / q.answered * 100) + '%' : '0%') : '-', q.avgMs ? (Math.round(q.avgMs / 100) / 10) + 's' : '-', q.answer || ''].map(function (x) { return h('td', { text: String(x) }); }))); }); qt.appendChild(qb);
      QL.modal((r.title || 'Quiz') + ', ' + QL.fmtDate(r.date), h('div', { class: 'stack' }, h('h4', { text: 'Players' }), h('div', { class: 'scroll-x' }, pt), h('h4', { text: 'Questions' }), h('div', { class: 'scroll-x' }, qt)), [{ label: 'Download CSV', primary: true, keep: true, fn: function () { QL.exportReportCsv(r); } }]);
    }
  };

  function addResult(r) {
    if (!r || r.v !== 1 || typeof r.score !== 'number' || !r.quizId) return false;
    var all = QL.load('challenges', []);
    var key = r.quizId + '|' + QL.norm(r.name) + '|' + r.date;
    if (all.some(function (x) { return x.quizId + '|' + QL.norm(x.name) + '|' + x.date === key; })) return true;
    all.unshift({ quizId: r.quizId, title: String(r.title || '').slice(0, 80), name: String(r.name || 'Player').slice(0, 30), date: Number(r.date) || Date.now(), score: r.score | 0, right: r.right | 0, best: r.best | 0 });
    QL.save('challenges', all.slice(0, 2000)); return true;
  }
  function openInbox(quizId, status, refresh) {
    if (typeof Peer === 'undefined') return status.textContent = 'The connection library did not load.';
    status.textContent = 'Opening the inbox...';
    var p = new Peer('qbx' + quizId, { debug: 0 });
    p.on('open', function () { status.textContent = 'Inbox is open. Keep this page open and results arrive by themselves.'; });
    p.on('error', function (e) { status.textContent = e.type === 'unavailable-id' ? 'This inbox is already open in another tab.' : 'Connection problem (' + e.type + ').'; });
    p.on('connection', function (c) { c.on('data', function (m) { if (m && m.t === 'result' && typeof m.code === 'string') QL.unpack(m.code).then(function (r) { if (addResult(r)) { c.send({ t: 'got' }); QL.toast('A result came in from ' + String(r.name || 'a player').slice(0, 20)); refresh && refresh(); } }, function () {}); }); });
    window.addEventListener('beforeunload', function () { try { p.destroy(); } catch (e) {} });
  }

  /* ---------------------------------------------------------------- study mode */
  var DAYS = [0, 1, 2, 4, 8, 16];
  QL.studyPage = function (mount, quizId) {
    mount.textContent = '';
    var quizzes = QL.lib.all();
    mount.appendChild(h('h2', { text: 'Study' }));
    mount.appendChild(h('p', { class: 'muted', text: 'Practise a quiz with flashcards. Cards you get right come back later, cards you miss come back sooner.' }));
    if (!quizzes.length) return mount.appendChild(h('p', { class: 'muted', text: 'Make a quiz first.' }));
    var pick = h('select', { class: 'input', 'aria-label': 'Which quiz' }); quizzes.forEach(function (q) { var o = h('option', { value: q.id, text: q.title || 'Untitled quiz' }); if (q.id === quizId) o.selected = true; pick.appendChild(o); });
    var area = h('div', { class: 'study-area' }), mode = 'due';
    var modeSel = h('select', { class: 'input small', 'aria-label': 'Which cards' }); [['due', 'Cards that are due'], ['all', 'All cards'], ['hard', 'Cards I missed']].forEach(function (p) { modeSel.appendChild(h('option', { value: p[0], text: p[1] })); });
    var go = h('button', { class: 'btn primary', text: 'Start', onclick: function () { run(QL.lib.get(pick.value), modeSel.value); } });
    mount.appendChild(h('div', { class: 'row' }, pick, modeSel, go)); mount.appendChild(area);

    function cards(k) { return k.questions.filter(function (q) { return QL.TYPES[q.type].scored && !QL.problems(q); }); }
    function run(k, which) {
      var st = QL.load('study', {}), now = Date.now(), all = cards(k);
      var deck = all.filter(function (q) { var s = st[k.id + ':' + q.id]; if (which === 'all') return true; if (which === 'hard') return s && s.miss > 0 && s.box <= 2; return !s || s.due <= now; });
      area.textContent = '';
      if (!all.length) return area.appendChild(h('p', { class: 'muted', text: 'This quiz has no cards yet (it needs finished quiz, true or false, type, puzzle, slider or pin questions).' }));
      if (!deck.length) return area.appendChild(h('div', { class: 'card' }, h('h3', { text: 'All caught up' }), h('p', { class: 'muted', text: 'No cards are due. Pick "All cards" to practise anyway.' })));
      deck = QL.shuffle(deck); var i = 0, known = 0;
      function show() {
        area.textContent = '';
        if (i >= deck.length) return area.appendChild(h('div', { class: 'card center-box' }, h('h3', { text: 'Round finished' }), h('p', { class: 'muted', text: known + ' of ' + deck.length + ' known. Missed cards come back soon.' }), h('button', { class: 'btn primary', text: 'Study again', onclick: function () { run(k, which); } })));
        var q = deck[i], flipped = false;
        var front = h('div', { class: 'fc-front' }, h('p', { class: 'muted small', text: 'Card ' + (i + 1) + ' of ' + deck.length }), h('h2', { text: q.text }), QL.mediaEl(q.media, 'q-media'), q.type === 'quiz' || q.type === 'tf' ? h('ul', { class: 'fc-opts' }, q.options.filter(function (o) { return o.t; }).map(function (o) { return h('li', { text: o.t }); })) : null);
        var back = h('div', { class: 'fc-back', hidden: true }, h('p', { class: 'muted small', text: 'Answer' }), h('h2', { text: QL.answerText(q) }));
        var flip = h('button', { class: 'btn primary big', text: 'Show the answer' });
        var row2 = h('div', { class: 'row center', hidden: true }, h('button', { class: 'btn big', text: 'Not yet', onclick: function () { grade(q, false); } }), h('button', { class: 'btn primary big', text: 'I knew it', onclick: function () { grade(q, true); } }));
        flip.onclick = function () { flipped = true; back.hidden = false; row2.hidden = false; flip.hidden = true; };
        area.appendChild(h('div', { class: 'flash' }, front, back, h('div', { class: 'row center' }, flip), row2));
      }
      function grade(q, ok) {
        var s = QL.load('study', {}), key = k.id + ':' + q.id, c = s[key] || { box: 0, miss: 0 };
        c.box = ok ? Math.min(c.box + 1, 5) : 1; if (!ok) c.miss++; c.due = Date.now() + DAYS[c.box] * 86400000 + (ok ? 0 : 60000);
        s[key] = c; QL.save('study', s); if (ok) known++; i++; show();
      }
      show();
    }
    var k0 = QL.lib.get(pick.value); if (k0) { var st0 = QL.load('study', {}), n = cards(k0).filter(function (q) { var s = st0[k0.id + ':' + q.id]; return !s || s.due <= Date.now(); }).length; area.appendChild(h('p', { class: 'muted', text: n + ' card(s) due in the first quiz. Press Start.' })); }
  };
})();

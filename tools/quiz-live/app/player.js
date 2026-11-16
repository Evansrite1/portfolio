/* The player side: joining a live game with a PIN, and playing alone (challenge links and previews). */
(function () {
  'use strict';
  var QL = window.QL, h = QL.h;

  /* ---------------------------------------------------------------- live player */
  QL.playerApp = function (mount, pinIn) {
    var S = { peer: null, conn: null, pid: '', name: '', pin: '', qi: -1, cd: null, ctl: null };
    function clear(cls) { if (S.cd) { S.cd.stop(); S.cd = null; } mount.textContent = ''; mount.className = 'pscreen ' + (cls || ''); }
    function msg(title, sub, cls, extra) { clear(cls); mount.appendChild(h('div', { class: 'center-box' }, h('h1', { text: title }), sub ? h('p', { class: 'muted', text: sub }) : null, extra || null)); }

    function joinForm(err) {
      clear('join');
      var pin = h('input', { class: 'input big-in', inputmode: 'numeric', maxlength: 6, placeholder: 'Game PIN', autocomplete: 'off', 'aria-label': 'Game PIN' });
      var name = h('input', { class: 'input big-in', maxlength: 20, placeholder: 'Nickname', autocomplete: 'off', 'aria-label': 'Nickname' });
      pin.value = pinIn || ''; pin.oninput = function () { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); };
      var go = h('button', { class: 'btn primary big', text: 'Join the game' }), rnd = h('button', { class: 'link', text: 'Give me a random name', onclick: function () { name.value = QL.nickname(); } });
      go.onclick = function () { if (pin.value.length !== 6) return joinForm('The game PIN has 6 digits.'); if (!QL.cleanName(name.value)) return joinForm('Type a nickname.'); S.pin = pin.value; S.name = QL.cleanName(name.value); connect(); };
      [pin, name].forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); }); });
      mount.appendChild(h('div', { class: 'center-box join' }, h('div', { class: 'logo-mark', text: QL.NAME }), pin, name, err ? h('p', { class: 'err', text: err }) : null, go, rnd));
      var keep = QL.load('lastname', ''); if (keep && !name.value) name.value = keep;
      setTimeout(function () { (pin.value.length === 6 ? name : pin).focus(); }, 60);
    }

    function connect() {
      msg('Joining...', 'Looking for game ' + S.pin);
      QL.save('lastname', S.name);
      try { var kept = sessionStorage.getItem('ql.pid.' + S.pin); S.pid = kept || QL.uid(); sessionStorage.setItem('ql.pid.' + S.pin, S.pid); } catch (e) { S.pid = QL.uid(); }
      if (typeof Peer === 'undefined') return joinForm('The connection library did not load. Check your internet.');
      if (S.peer) { try { S.peer.destroy(); } catch (e) {} }
      var p = S.peer = new Peer({ debug: 0 }), failed = false;
      function fail(m) { if (failed) return; failed = true; joinForm(m); try { p.destroy(); } catch (e) {} }
      var to = setTimeout(function () { if (!S.conn || !S.conn.open) fail('Could not find game ' + S.pin + '. Check the PIN, and that the host is still on the lobby screen.'); }, 15000);
      p.on('error', function (e) { clearTimeout(to); fail(e && e.type === 'peer-unavailable' ? 'No game found with that PIN.' : 'Connection problem (' + (e && e.type) + ').'); });
      p.on('open', function () {
        var c = S.conn = p.connect('qb' + S.pin, { reliable: true });
        c.on('open', function () { clearTimeout(to); c.send({ t: 'join', name: S.name, pid: S.pid }); });
        c.on('data', onData);
        c.on('close', function () { if (!failed && S.state !== 'kicked' && S.state !== 'end') msg('Disconnected', 'The connection to the host was lost.', '', h('button', { class: 'btn primary', text: 'Reconnect', onclick: connect })); });
      });
    }
    function send(m) { try { S.conn && S.conn.open && S.conn.send(m); } catch (e) {} }

    function onData(m) {
      if (!m || !m.t) return;
      S.state = m.t;
      if (m.t === 'refused') { try { S.peer.destroy(); } catch (e) {} return joinForm(m.why); }
      if (m.t === 'joined') { S.name = m.name; return msg('You are in!', 'Look at the big screen. ' + m.name, 'lobbyp'); }
      if (m.t === 'lobby') return msg('You are in!', 'Waiting for the host to start. ' + S.name, 'lobbyp');
      if (m.t === 'kicked') { S.state = 'kicked'; return msg('You were removed', 'The host removed you from the game.', '', h('button', { class: 'btn primary', text: 'Join another game', onclick: function () { joinForm(); } })); }
      if (m.t === 'wait') return msg('Get ready', 'Look at the big screen.', 'waitp');
      if (m.t === 'ready') return msg('Question ' + m.n, 'of ' + m.of, 'readyp', h('p', { class: 'muted', text: QL.TYPES[m.type] ? QL.TYPES[m.type].label : '' }));
      if (m.t === 'question') return showQuestion(m);
      if (m.t === 'ack') return msg('Answer sent', 'Waiting for the others...', 'waitp');
      if (m.t === 'reveal') return showReveal(m);
      if (m.t === 'end') { S.state = 'end'; return showEnd(m); }
    }

    function showQuestion(m) {
      S.qi = m.q; clear('qp');
      var v = m.view;
      if (m.done) return msg('Answer sent', 'Waiting for the others...', 'waitp');
      var cd = QL.countdown(m.secs, null, null); S.cd = cd;
      var top = h('div', { class: 'p-top' }, cd.num, cd.bar);
      var ctl = QL.controls(v, function (a) { send({ t: 'ans', q: S.qi, a: a }); }, { hideText: v.hideText, onMany: function (val) { send({ t: 'ans', q: S.qi, a: val }); } });
      S.ctl = ctl;
      mount.appendChild(top);
      if (v.text) mount.appendChild(h('h2', { class: 'p-q', text: v.text }));
      if (v.media) { var me = QL.mediaEl(v.media, 'p-media'); if (me) mount.appendChild(me); }
      mount.appendChild(ctl.el);
    }

    function showReveal(m) {
      var cls = !m.scored ? 'neutral' : m.right ? 'right' : 'wrong';
      clear('rev ' + cls);
      if (m.scored) QL.sfx(m.right ? 'right' : 'wrong');
      var box = h('div', { class: 'center-box' });
      if (!m.scored) { box.appendChild(h('h1', { text: m.answered ? 'Thanks!' : 'Time is up' })); box.appendChild(h('p', { class: 'muted', text: 'Look at the big screen.' })); }
      else {
        box.appendChild(h('h1', { text: !m.answered ? 'Time is up' : m.right ? 'Correct' : 'Not this time' }));
        if (m.pts) box.appendChild(h('div', { class: 'pts', text: '+' + m.pts }));
        if (m.bonus) box.appendChild(h('p', { class: 'muted', text: 'Includes a streak bonus of ' + m.bonus }));
        if (m.streak >= 2) box.appendChild(h('p', { class: 'streak', text: m.streak + ' in a row' }));
        if (!m.right && m.answerText) box.appendChild(h('p', { class: 'muted', text: 'The answer: ' + m.answerText }));
        box.appendChild(h('p', { class: 'rankline', text: QL.ordinal(m.rank) + ' place, ' + m.score + ' points' }));
        if (m.rank > 1 && m.behind) box.appendChild(h('p', { class: 'muted', text: m.behind + ' points behind the player above' }));
      }
      mount.appendChild(box);
    }
    function showEnd(m) {
      clear('endp'); QL.sfx('win');
      mount.appendChild(h('div', { class: 'center-box' }, h('h1', { text: m.rank === 1 ? 'You won!' : m.rank <= 3 ? 'On the podium!' : 'Game over' }), h('div', { class: 'pts', text: QL.ordinal(m.rank) }), h('p', { class: 'muted', text: 'out of ' + m.of + ' players, ' + m.score + ' points' }), m.streak >= 2 ? h('p', { class: 'streak', text: 'Best streak: ' + m.streak }) : null, m.team ? h('p', { class: 'muted', text: 'Team: ' + m.team }) : null, h('button', { class: 'btn primary', text: 'Join another game', onclick: function () { pinIn = ''; joinForm(); } })));
    }

    if (pinIn && pinIn.length === 6) joinForm(); else joinForm();
  };

  /* ---------------------------------------------------------------- playing alone */
  /* opts: { name, mode: 'challenge'|'preview', until, onExit } */
  QL.soloPlay = function (kahoot, mount, opts) {
    opts = opts || {};
    var qs = QL.clone(kahoot.questions).filter(function (q) { return !QL.problems(q); });
    qs.forEach(function (q) {
      if (q.type === 'quiz' || q.type === 'poll') { q.options = q.options.filter(function (o) { return o.t; }); if (opts.mode === 'challenge') q.options = QL.shuffle(q.options); }
      if (q.type === 'puzzle') { q.items = q.items.filter(Boolean); var idx = q.items.map(function (x, i) { return i; }); q.perm = QL.shuffle(idx); }
    });
    if (opts.mode === 'challenge') qs = QL.shuffle(qs);
    var th = QL.THEMES[kahoot.theme] || QL.THEMES.night;
    mount.textContent = ''; mount.className = 'stage solo'; mount.style.background = 'linear-gradient(160deg,' + th[0] + ',' + th[1] + ')';
    var i = -1, score = 0, streak = 0, best = 0, rec = [], cd = null, body = h('div', { class: 'stage-body solo-body' });
    mount.appendChild(h('div', { class: 'hostbar' }, h('span', { class: 'hb-pin', text: opts.mode === 'preview' ? 'Preview' : 'Challenge' + (opts.name ? ': ' + opts.name : '') }), h('span', { class: 'hb-sp' }), h('button', { class: 'btn small', text: 'Sound ' + (QL.mute() ? 'off' : 'on'), onclick: function () { QL.mute(!QL.mute()); this.textContent = 'Sound ' + (QL.mute() ? 'off' : 'on'); } }), h('button', { class: 'btn small danger', text: 'Close', onclick: function () { if (cd) cd.stop(); opts.onExit && opts.onExit(); } })));
    mount.appendChild(body);

    function next() {
      if (cd) cd.stop();
      i++; if (i >= qs.length) return done();
      var q = qs[i], v = QL.playerView(q, q.perm), answered = false, t0 = Date.now(), ctl;
      body.textContent = '';
      cd = QL.countdown(q.time, function (s) { if (s <= 5 && s > 0) QL.sfx('tick'); }, function () { if (!answered) finish(null); });
      var many = [];
      function finish(a) {
        if (answered) return; answered = true; cd.stop(); if (ctl) ctl.lock();
        var ms = Date.now() - t0, aa = a, orig = a;
        if (q.type === 'puzzle' && Array.isArray(a)) aa = a.map(function (d) { return q.perm[d]; });
        if (q.type === 'cloud' || q.type === 'brainstorm') aa = many;
        var sc = QL.TYPES[q.type].scored && q.points !== 'none' ? (aa == null ? { right: false, total: 0, bonus: 0 } : QL.points(q, aa, ms, streak)) : { right: false, total: 0, bonus: 0 };
        if (QL.TYPES[q.type].scored && q.points !== 'none') { if (sc.right) { streak++; best = Math.max(best, streak); } else streak = 0; score += sc.total; }
        rec.push({ right: sc.right, pts: sc.total, ms: ms, answered: aa != null, a: summarize(aa) });
        feedback(q, sc, aa == null);
      }
      var ctlr = QL.controls(v, finish, { onMany: function (val) { many.push(val); } });
      ctl = ctlr;
      body.appendChild(h('div', { class: 'qscreen' },
        h('div', { class: 'q-top' }, h('div', { class: 'cd-slot' }, cd.num, cd.bar), h('h2', { class: 'q-text', text: q.text }), h('div', { class: 'q-count' }, h('b', { text: (i + 1) + ' of ' + qs.length + '  ·  ' + score + ' points' }))),
        QL.mediaEl(q.media, 'q-media'), ctlr.el));
    }
    function summarize(a) { try { return (typeof a === 'object' ? JSON.stringify(a) : String(a == null ? '' : a)).slice(0, 120); } catch (e) { return ''; } }
    function feedback(q, sc, timeout) {
      var scored = QL.TYPES[q.type].scored && q.points !== 'none';
      if (scored) QL.sfx(sc.right ? 'right' : 'wrong');
      body.textContent = '';
      body.appendChild(h('div', { class: 'center-box big ' + (scored ? (sc.right ? 'right' : 'wrong') : '') },
        h('h1', { text: !scored ? 'Thanks!' : timeout ? 'Time is up' : sc.right ? 'Correct' : 'Not this time' }),
        scored && sc.total ? h('div', { class: 'pts', text: '+' + sc.total }) : null,
        scored && !sc.right ? h('p', { class: 'muted', text: 'The answer: ' + QL.answerText(q) }) : null,
        streak >= 2 && scored ? h('p', { class: 'streak', text: streak + ' in a row' }) : null,
        h('p', { class: 'rankline', text: score + ' points' }),
        h('button', { class: 'btn primary big', text: i === qs.length - 1 ? 'See my result' : 'Next question', onclick: next })));
    }
    function done() {
      QL.sfx('win'); body.textContent = '';
      var scoredN = qs.filter(function (q) { return QL.TYPES[q.type].scored && q.points !== 'none'; }).length, rightN = rec.filter(function (r) { return r.right; }).length;
      var box = h('div', { class: 'center-box big' }, h('h1', { text: 'Finished' }), h('div', { class: 'pts', text: score + ' points' }), h('p', { class: 'muted', text: rightN + ' of ' + scoredN + ' scored questions right. Best streak: ' + best }));
      if (opts.mode === 'challenge') {
        var res = { v: 1, name: opts.name, quizId: kahoot.id, title: kahoot.title, date: Date.now(), score: score, right: rightN, best: best, answers: rec };
        var codeBox = h('textarea', { class: 'input', rows: 3, readonly: true, 'aria-label': 'Result code' }); codeBox.value = 'Making your result code...';
        QL.pack(res).then(function (c) { codeBox.value = c; });
        box.appendChild(h('p', { class: 'muted', text: 'Send this result code to your teacher so your score is counted:' }));
        box.appendChild(codeBox);
        box.appendChild(h('div', { class: 'row center' }, h('button', { class: 'btn primary', text: 'Copy the result code', onclick: function () { navigator.clipboard && navigator.clipboard.writeText(codeBox.value).then(function () { QL.toast('Copied'); }); } })));
        if (opts.sendTo) QL.sendChallengeResult(opts.sendTo, codeBox, box);
      }
      box.appendChild(h('div', { class: 'row center' }, h('button', { class: 'btn', text: opts.mode === 'preview' ? 'Back to the editor' : 'Close', onclick: function () { opts.onExit && opts.onExit(); } })));
      body.appendChild(box);
    }
    next();
    return { stop: function () { if (cd) cd.stop(); } };
  };

  /* A challenge result can also travel straight to the teacher's open Results page. */
  QL.sendChallengeResult = function (hostId, codeBox, box) {
    if (typeof Peer === 'undefined') return;
    var note = h('p', { class: 'muted small', text: 'Trying to send it to your teacher directly...' }); box.appendChild(note);
    try {
      var p = new Peer({ debug: 0 }), to = setTimeout(function () { note.textContent = 'Your teacher is not online. Send the code instead.'; try { p.destroy(); } catch (e) {} }, 8000);
      p.on('error', function () { clearTimeout(to); note.textContent = 'Your teacher is not online. Send the code instead.'; });
      p.on('open', function () {
        var c = p.connect(hostId, { reliable: true });
        c.on('open', function () { var iv = setInterval(function () { if (codeBox.value.length > 40) { clearInterval(iv); c.send({ t: 'result', code: codeBox.value }); } }, 200); });
        c.on('data', function (m) { if (m && m.t === 'got') { clearTimeout(to); note.textContent = 'Sent to your teacher. You are done.'; setTimeout(function () { try { p.destroy(); } catch (e) {} }, 500); } });
      });
    } catch (e) { note.textContent = 'Send the code to your teacher.'; }
  };
})();

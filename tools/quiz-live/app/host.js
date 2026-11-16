/* The live game, host side. The host's browser is the game server: players connect to it directly (PeerJS)
   with a 6 digit PIN. Right answers never leave this page until the question is over. */
(function () {
  'use strict';
  var QL = window.QL, h = QL.h;

  QL.hostGame = function (kahoot, mount, onExit) {
    var G = {
      kahoot: kahoot, pin: '', peer: null, players: {}, phase: 'boot', qi: -1, qs: [], order: [], ans: {}, startedAt: 0, timer: null, prevRank: {},
      opts: QL.load('hostopts', { randQ: false, randA: false, showOnDevice: true, team: false, teams: 2, music: true, friendly: true, nickGen: false, podium: true }),
      log: [], ended: false
    };
    var qbox = QL.$('#host-root') || mount;

    /* ---------------- network ---------------- */
    function openPeer(tries) {
      G.pin = String(Math.floor(100000 + Math.random() * 900000));
      if (typeof Peer === 'undefined') { fatal('The connection library did not load. Check your internet and reload.'); return; }
      var p = new Peer('qb' + G.pin, { debug: 0 }); G.peer = p;
      var opened = false;
      var to = setTimeout(function () { if (!opened) fatal('Could not reach the connection service. Check your internet and try again.'); }, 15000);
      p.on('open', function () { opened = true; clearTimeout(to); G.phase = 'lobby'; render(); });
      p.on('error', function (e) {
        if (e && e.type === 'unavailable-id' && tries < 5) { try { p.destroy(); } catch (x) {} return openPeer(tries + 1); }
        if (!opened) { clearTimeout(to); fatal('Connection problem (' + (e && e.type) + '). Check your internet and try again.'); }
      });
      p.on('disconnected', function () { try { p.reconnect(); } catch (e) {} });
      p.on('connection', function (conn) {
        conn.on('data', function (m) { try { onMsg(conn, m); } catch (e) { /* ignore a bad message */ } });
        conn.on('close', function () { var pl = byConn(conn); if (pl) { pl.on = false; if (G.phase === 'lobby') render(); updateCount(); } });
      });
    }
    function byConn(c) { for (var k in G.players) if (G.players[k].conn === c) return G.players[k]; return null; }
    function send(pl, m) { try { if (pl && pl.conn && pl.conn.open) pl.conn.send(m); } catch (e) {} }
    function all(m) { for (var k in G.players) send(G.players[k], m); }
    function fatal(msg) { G.phase = 'error'; mount.textContent = ''; mount.appendChild(h('div', { class: 'center-box' }, h('h2', { text: 'Could not start the game' }), h('p', { class: 'muted', text: msg }), h('button', { class: 'btn primary', text: 'Back', onclick: exit }))); }

    function onMsg(conn, m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'join') return join(conn, m);
      var pl = byConn(conn); if (!pl) return;
      if (m.t === 'ans') return answer(pl, m);
    }
    function join(conn, m) {
      var name = QL.cleanName(m.name), pid = String(m.pid || '').slice(0, 24), pl = G.players[pid];
      if (pl) { pl.conn = conn; pl.on = true; send(pl, { t: 'joined', pid: pid, name: pl.name, team: pl.team, title: G.kahoot.title }); resend(pl); updateCount(); return; }
      if (G.phase !== 'lobby') return send({ conn: conn }, { t: 'refused', why: 'The game has already started.' }), void 0;
      if (!name) return conn.send({ t: 'refused', why: 'Type a nickname.' });
      if (G.opts.friendly && QL.rude(name)) return conn.send({ t: 'refused', why: 'Please pick a friendlier nickname.' });
      var taken = Object.keys(G.players).some(function (k) { return QL.norm(G.players[k].name) === QL.norm(name); });
      if (taken) return conn.send({ t: 'refused', why: 'That nickname is taken. Try another.' });
      if (Object.keys(G.players).length >= 200) return conn.send({ t: 'refused', why: 'The game is full.' });
      pid = pid || QL.uid();
      pl = G.players[pid] = { pid: pid, name: name, team: -1, conn: conn, on: true, score: 0, streak: 0, best: 0, answers: [] };
      send(pl, { t: 'joined', pid: pid, name: name, title: G.kahoot.title });
      QL.sfx('join'); render();
    }
    function resend(pl) {          /* a player who reloaded gets the screen they should be on */
      if (G.phase === 'answering') send(pl, qMsg(pl));
      else if (G.phase === 'lobby') send(pl, { t: 'lobby' });
      else if (G.phase === 'end') send(pl, endMsg(pl));
      else send(pl, { t: 'wait' });
    }

    /* ---------------- building the game ---------------- */
    function build() {
      var qs = QL.clone(G.kahoot.questions).filter(function (q) { return !QL.problems(q); });
      if (G.opts.randQ) qs = QL.shuffle(qs);
      qs.forEach(function (q) {
        if ((q.type === 'quiz' || q.type === 'poll') && G.opts.randA) q.options = QL.shuffle(q.options);
        if (q.type === 'quiz' || q.type === 'poll') q.options = q.options.filter(function (o) { return o.t; });
        if (q.type === 'puzzle') { q.items = q.items.filter(Boolean); var idx = q.items.map(function (x, i) { return i; }), p; do { p = QL.shuffle(idx); } while (p.length > 1 && p.every(function (v, i) { return v === i; })); q.perm = p; }
      });
      G.qs = qs;
    }
    function start() {
      var ids = Object.keys(G.players); if (!ids.length) return QL.toast('Wait for at least one player.', true);
      build(); if (!G.qs.length) return QL.toast('This quiz has no finished questions.', true);
      if (G.opts.team) { var n = QL.clamp(Number(G.opts.teams) || 2, 2, 4); QL.shuffle(ids).forEach(function (id, i) { G.players[id].team = i % n; }); }
      QL.save('hostopts', G.opts); QL.sfx('start'); QL.music(false);
      all({ t: 'wait' }); G.qi = -1; next();
    }

    /* ---------------- the question loop ---------------- */
    function next() {
      clearTimer(); G.qi++;
      if (G.qi >= G.qs.length) return finish();
      G.ans = {}; G.phase = 'ready'; render();
      all({ t: 'ready', n: G.qi + 1, of: G.qs.length, type: G.qs[G.qi].type });
      G.timer = setTimeout(openQuestion, 3200);
    }
    function qMsg(pl) {
      var q = G.qs[G.qi], v = QL.playerView(q, q.perm);
      if (!G.opts.showOnDevice) { v.text = ''; v.media = null; if (v.options && q.type !== 'poll') v.hideText = true; }
      var left = Math.max(1, Math.round((G.startedAt + q.time * 1000 - Date.now()) / 1000));
      return { t: 'question', q: G.qi, view: v, secs: left, done: !!G.ans[pl.pid] && G.ans[pl.pid].final };
    }
    function openQuestion() {
      var q = G.qs[G.qi]; G.phase = 'answering'; G.startedAt = Date.now(); render();
      for (var k in G.players) send(G.players[k], qMsg(G.players[k]));
      G.cd = QL.countdown(q.time, function (s) { if (s <= 5 && s > 0) QL.sfx('tick'); }, function () { closeQuestion(); });
      var hostBar = QL.$('#cd-slot'); if (hostBar) { hostBar.textContent = ''; hostBar.appendChild(G.cd.num); hostBar.appendChild(G.cd.bar); }
    }
    function connected() { return Object.keys(G.players).filter(function (k) { return G.players[k].on; }); }
    function answeredCount() { return Object.keys(G.ans).filter(function (k) { return G.ans[k].final; }).length; }
    function updateCount() { var el = QL.$('#ans-count'); if (el) el.textContent = answeredCount() + ' of ' + connected().length + ' answered'; var lc = QL.$('#lobby-count'); if (lc && G.phase === 'lobby') render(); }
    function answer(pl, m) {
      if (G.phase !== 'answering' || m.q !== G.qi) return;
      var q = G.qs[G.qi], rec = G.ans[pl.pid] || (G.ans[pl.pid] = { ms: 0, final: false, list: [] });
      if (rec.final) return;
      var ms = Date.now() - G.startedAt; if (ms > q.time * 1000 + 1500) return;
      var a = m.a;
      if (q.type === 'cloud' || q.type === 'brainstorm') {
        if (typeof a === 'string' && a.trim() && rec.list.length < 3) rec.list.push(a.trim().slice(0, q.type === 'cloud' ? 24 : 120));
        if (a === null || rec.list.length >= 3) { rec.final = true; rec.ms = ms; }
      } else if (q.type === 'open') { rec.list = [String(a || '').trim().slice(0, 300)]; rec.final = true; rec.ms = ms; }
      else if (q.type === 'type') { rec.a = String(a || '').slice(0, 200); rec.final = true; rec.ms = ms; }
      else if (q.type === 'slider') { rec.a = Number(a); if (!isFinite(rec.a)) return; rec.final = true; rec.ms = ms; }
      else if (q.type === 'pin') { if (!a || typeof a.x !== 'number' || typeof a.y !== 'number') return; rec.a = { x: QL.clamp(a.x, 0, 1), y: QL.clamp(a.y, 0, 1) }; rec.final = true; rec.ms = ms; }
      else if (q.type === 'puzzle') { if (!Array.isArray(a) || a.length !== q.items.length) return; rec.a = a.map(function (d) { return q.perm[Number(d)]; }); rec.disp = a.map(Number); rec.final = true; rec.ms = ms; }
      else { if (!Array.isArray(a)) return; rec.a = a.map(Number).filter(function (n) { return n >= 0 && n < q.options.length; }); rec.final = true; rec.ms = ms; }
      if (rec.final) send(pl, { t: 'ack', q: G.qi });
      updateCount();
      if (connected().length && connected().every(function (k) { return G.ans[k] && G.ans[k].final; })) closeQuestion();
    }
    function closeQuestion() {
      if (G.phase !== 'answering') return;
      clearTimer(); if (G.cd) G.cd.stop();
      var q = G.qs[G.qi];
      G.prevRank = rankMap();
      var counts = {};
      Object.keys(G.players).forEach(function (k) {
        var pl = G.players[k], rec = G.ans[k], res = { q: G.qi, type: q.type, a: rec ? (rec.a !== undefined ? rec.a : rec.list) : null, ms: rec ? rec.ms : 0, pts: 0, right: false, answered: !!(rec && rec.final) };
        if (QL.TYPES[q.type].scored && q.points !== 'none') {
          var sc = rec && rec.final ? QL.points(q, rec.a, rec.ms, pl.streak) : { right: false, total: 0, base: 0, bonus: 0 };
          res.pts = sc.total; res.right = sc.right; res.bonus = sc.bonus;
          if (sc.right) { pl.streak++; pl.best = Math.max(pl.best, pl.streak); } else pl.streak = 0;
          pl.score += sc.total;
        }
        pl.answers.push(res);
      });
      G.phase = 'reveal'; render();
      var ranks = rankMap(), order = sortedPlayers();
      Object.keys(G.players).forEach(function (k) {
        var pl = G.players[k], last = pl.answers[pl.answers.length - 1], r = ranks[k], ahead = order[r - 2];
        send(pl, { t: 'reveal', q: G.qi, scored: QL.TYPES[q.type].scored && q.points !== 'none', right: last.right, answered: last.answered, pts: last.pts, bonus: last.bonus || 0, score: pl.score, rank: r, of: order.length, streak: pl.streak, behind: ahead ? ahead.score - pl.score : 0, answerText: QL.answerText(q), last: G.qi === G.qs.length - 1 });
      });
    }
    function clearTimer() { if (G.timer) { clearTimeout(G.timer); G.timer = null; } }

    /* ---------------- ranking ---------------- */
    function sortedPlayers() { return Object.keys(G.players).map(function (k) { return G.players[k]; }).sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); }); }
    function rankMap() { var m = {}; sortedPlayers().forEach(function (p, i) { m[p.pid] = i + 1; }); return m; }
    function teamScores() {
      var n = QL.clamp(Number(G.opts.teams) || 2, 2, 4), t = []; for (var i = 0; i < n; i++) t.push({ i: i, name: TEAMS[i], score: 0, n: 0 });
      Object.keys(G.players).forEach(function (k) { var p = G.players[k]; if (p.team >= 0 && t[p.team]) { t[p.team].score += p.score; t[p.team].n++; } });
      t.forEach(function (x) { x.avg = x.n ? Math.round(x.score / x.n) : 0; });
      return t.sort(function (a, b) { return b.avg - a.avg; });
    }
    var TEAMS = ['Red Rockets', 'Blue Waves', 'Gold Stars', 'Green Leaves'];

    function endMsg(pl) { var r = rankMap(); return { t: 'end', rank: r[pl.pid], of: Object.keys(G.players).length, score: pl.score, streak: pl.best, team: G.opts.team && pl.team >= 0 ? TEAMS[pl.team] : '' }; }
    function finish() {
      clearTimer(); G.phase = 'end'; G.ended = true; QL.sfx('win'); saveReport(); render();
      Object.keys(G.players).forEach(function (k) { send(G.players[k], endMsg(G.players[k])); });
    }
    function saveReport() {
      var order = sortedPlayers(), qsum = G.qs.map(function (q, i) {
        var n = 0, right = 0, ms = 0;
        order.forEach(function (p) { var a = p.answers[i]; if (a && a.answered) { n++; ms += a.ms; if (a.right) right++; } });
        return { text: q.text, type: q.type, answered: n, right: right, avgMs: n ? Math.round(ms / n) : 0, answer: QL.answerText(q) };
      });
      var rep = { id: QL.uid(), kind: 'live', quizId: G.kahoot.id, title: G.kahoot.title, date: Date.now(), team: G.opts.team, questions: qsum,
        players: order.map(function (p, i) { return { name: p.name, team: p.team >= 0 ? TEAMS[p.team] : '', rank: i + 1, score: p.score, right: p.answers.filter(function (a) { return a.right; }).length, best: p.best, answers: p.answers.map(function (a) { return { right: a.right, pts: a.pts, ms: a.ms, answered: a.answered, a: summarize(a.a) }; }) }; }) };
      var list = QL.load('reports', []); list.unshift(rep); QL.save('reports', list.slice(0, 60)); G.report = rep;
    }
    function summarize(a) { try { var s = typeof a === 'object' ? JSON.stringify(a) : String(a == null ? '' : a); return s.slice(0, 120); } catch (e) { return ''; } }

    /* ---------------- screens ---------------- */
    function exit() { clearTimer(); if (G.cd) G.cd.stop(); QL.music(false); try { if (G.peer) G.peer.destroy(); } catch (e) {} onExit && onExit(); }
    function joinUrl() { return QL.baseUrl().replace(/\/?(index\.html)?$/, '/') + '?join=' + G.pin; }
    function bar() {
      var b = h('div', { class: 'hostbar' },
        h('span', { class: 'hb-pin', text: 'PIN ' + G.pin }),
        h('span', { class: 'hb-sp' }),
        h('button', { class: 'btn small', text: QL.mute() ? 'Sound off' : 'Sound on', onclick: function () { QL.mute(!QL.mute()); if (!QL.mute() && G.phase === 'lobby' && G.opts.music) QL.music(true); render(); } }),
        h('button', { class: 'btn small', text: 'Full screen', onclick: function () { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) {} } }),
        h('button', { class: 'btn small danger', text: G.phase === 'end' ? 'Close' : 'End game', onclick: function () { if (G.phase === 'end' || G.phase === 'lobby' || confirm('End the game now?')) { if (G.phase !== 'end' && G.phase !== 'lobby') { finish(); } else exit(); } } }));
      return b;
    }
    function render() {
      if (G.phase === 'boot' || G.phase === 'error') { mount.textContent = ''; mount.appendChild(h('div', { class: 'center-box' }, h('h2', { text: 'Starting the game...' }), h('p', { class: 'muted', text: 'Opening a room so players can join.' }))); return; }
      var th = QL.THEMES[G.kahoot.theme] || QL.THEMES.night;
      mount.textContent = ''; mount.className = 'stage'; mount.style.background = 'linear-gradient(160deg,' + th[0] + ',' + th[1] + ')';
      mount.appendChild(bar());
      var body = h('div', { class: 'stage-body' }); mount.appendChild(body);
      ({ lobby: lobby, ready: ready, answering: answering, reveal: reveal, board: board, end: endScreen })[G.phase](body);
    }

    function lobby(body) {
      var url = joinUrl(), list = Object.keys(G.players).map(function (k) { return G.players[k]; });
      var qr = h('div', { class: 'qr', id: 'qr-slot' });
      try { var code = qrcode(0, 'M'); code.addData(url); code.make(); qr.innerHTML = code.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) {}
      var chips = h('div', { class: 'chips' });
      list.forEach(function (p) { chips.appendChild(h('button', { class: 'chip' + (p.on ? '' : ' off'), title: 'Remove ' + p.name, text: p.name, onclick: function () { send(p, { t: 'kicked' }); try { p.conn.close(); } catch (e) {} delete G.players[p.pid]; render(); } })); });
      if (!list.length) chips.appendChild(h('p', { class: 'muted', text: 'Waiting for players. Click a name to remove it.' }));
      function opt(key, label) { var c = h('input', { type: 'checkbox' }); c.checked = !!G.opts[key]; c.onchange = function () { G.opts[key] = c.checked; if (key === 'music') QL.music(c.checked && !QL.mute()); QL.save('hostopts', G.opts); render(); }; return h('label', { class: 'opt' }, c, h('span', { text: label })); }
      var teams = h('select', { class: 'input small', 'aria-label': 'Number of teams' }); [2, 3, 4].forEach(function (n) { var o = h('option', { value: n, text: n + ' teams' }); if (Number(G.opts.teams) === n) o.selected = true; teams.appendChild(o); }); teams.onchange = function () { G.opts.teams = Number(teams.value); QL.save('hostopts', G.opts); };
      body.appendChild(h('div', { class: 'lobby' },
        h('div', { class: 'lobby-join' },
          h('p', { class: 'muted', text: 'Join at' }), h('div', { class: 'join-url', text: url.replace(/^https?:\/\//, '').replace(/\?join=.*/, '') }),
          h('p', { class: 'muted', text: 'with game PIN' }), h('div', { class: 'big-pin', text: G.pin }), qr),
        h('div', { class: 'lobby-main' },
          h('h1', { text: G.kahoot.title || 'Untitled quiz' }),
          h('p', { class: 'muted', id: 'lobby-count', text: list.length + (list.length === 1 ? ' player' : ' players') + ' in the room' }),
          chips,
          h('div', { class: 'opts' }, opt('randQ', 'Shuffle the questions'), opt('randA', 'Shuffle the answers'), opt('showOnDevice', 'Show the question on player devices'), opt('friendly', 'Block rude nicknames'), opt('music', 'Lobby music'), opt('team', 'Team mode'), G.opts.team ? teams : null),
          h('div', { class: 'row' }, h('button', { class: 'btn primary big', text: 'Start the game', disabled: !list.length, onclick: start }), h('button', { class: 'btn', text: 'Copy the join link', onclick: function () { navigator.clipboard && navigator.clipboard.writeText(url).then(function () { QL.toast('Link copied'); }); } })))));
      if (G.opts.music && !QL.mute()) QL.music(true);
    }

    function ready(body) {
      var q = G.qs[G.qi];
      body.appendChild(h('div', { class: 'center-box big' }, h('p', { class: 'muted', text: 'Question ' + (G.qi + 1) + ' of ' + G.qs.length }), h('h1', { class: 'q-big', text: q.text }), QL.mediaEl(q.media, 'q-media'), h('p', { class: 'muted', text: QL.TYPES[q.type].label + (q.points === 'double' ? ' · double points' : '') })));
    }

    function answering(body) {
      var q = G.qs[G.qi];
      body.appendChild(h('div', { class: 'qscreen' },
        h('div', { class: 'q-top' }, h('div', { id: 'cd-slot', class: 'cd-slot' }), h('h2', { class: 'q-text', text: q.text }), h('div', { class: 'q-count' }, h('b', { id: 'ans-count', text: answeredCount() + ' of ' + connected().length + ' answered' }), h('button', { class: 'btn', text: 'Skip', onclick: closeQuestion }))),
        QL.mediaEl(q.media, 'q-media'),
        hostChoices(q, null)));
    }
    function hostChoices(q, counts, rightSet) {
      if (q.type === 'quiz' || q.type === 'tf' || q.type === 'poll') {
        if (counts) return QL.barChart(q.options.map(function (o) { return o.t; }), counts, rightSet);
        var g = h('div', { class: 'ans-grid n' + q.options.length + ' host' });
        q.options.forEach(function (o, i) { g.appendChild(h('div', { class: 'ans', style: 'background:' + QL.COLORS[i % 6] }, QL.shape(i, 34), h('span', { text: o.t }))); });
        return g;
      }
      if (q.type === 'pin') return h('p', { class: 'muted center', text: 'Players are tapping the picture.' });
      if (q.type === 'slider') return h('p', { class: 'muted center', text: 'Players are choosing a number from ' + q.min + ' to ' + q.max + '.' });
      if (q.type === 'puzzle') return h('p', { class: 'muted center', text: 'Players are putting ' + q.items.length + ' items in order.' });
      return h('p', { class: 'muted center', text: 'Players are typing on their devices.' });
    }

    function reveal(body) {
      var q = G.qs[G.qi], recs = Object.keys(G.players).map(function (k) { return G.players[k].answers[G.qi]; }), n = recs.filter(function (r) { return r.answered; }).length;
      var right = recs.filter(function (r) { return r.right; }).length, view;
      if (q.type === 'quiz' || q.type === 'tf' || q.type === 'poll') {
        var counts = q.options.map(function () { return 0; }), ok = [];
        q.options.forEach(function (o, i) { if (o.ok) ok.push(i); });
        recs.forEach(function (r) { if (Array.isArray(r.a)) r.a.forEach(function (i) { if (counts[i] !== undefined) counts[i]++; }); });
        view = QL.barChart(q.options.map(function (o) { return o.t; }), counts, q.type === 'poll' ? null : ok);
      } else if (q.type === 'cloud') { var ws = []; recs.forEach(function (r) { if (Array.isArray(r.a)) ws = ws.concat(r.a); }); view = QL.wordCloud(ws); }
      else if (q.type === 'open' || q.type === 'brainstorm') {
        view = h('div', { class: 'notes' }); var any = false;
        Object.keys(G.players).forEach(function (k) { var r = G.players[k].answers[G.qi]; (Array.isArray(r.a) ? r.a : []).forEach(function (t) { if (t) { any = true; view.appendChild(h('div', { class: 'note' }, h('p', { text: t }), q.type === 'open' ? h('small', { text: G.players[k].name }) : null)); } }); });
        if (!any) view.appendChild(h('p', { class: 'muted', text: 'No answers came in.' }));
      } else if (q.type === 'type') {
        var f = {}; recs.forEach(function (r) { if (r.answered && r.a) { var k = QL.norm(r.a); f[k] = f[k] || { t: r.a, n: 0, ok: r.right }; f[k].n++; } });
        view = h('div', { class: 'type-res' }, h('p', { class: 'big-ans', text: 'Right answer: ' + QL.answerText(q) }), h('ul', null, Object.keys(f).map(function (k) { return f[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8).map(function (x) { return h('li', { class: x.ok ? 'ok' : '', text: x.t + '  x' + x.n }); })));
      } else if (q.type === 'puzzle') {
        view = h('div', { class: 'type-res' }, h('p', { class: 'big-ans', text: 'The right order' }), h('ol', { class: 'puz picked' }, q.items.map(function (t) { return h('li', { text: t }); })));
      } else if (q.type === 'slider') {
        var vals = recs.filter(function (r) { return r.answered && typeof r.a === 'number'; }).map(function (r) { return r.a; });
        var avg = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
        view = h('div', { class: 'type-res' }, h('p', { class: 'big-ans', text: 'Right answer: ' + q.correct + (q.unit ? ' ' + q.unit : '') }), h('p', { class: 'muted', text: vals.length ? 'Average answer: ' + (Math.round(avg * 10) / 10) + '. Closest: ' + vals.slice().sort(function (a, b) { return Math.abs(a - q.correct) - Math.abs(b - q.correct); })[0] : 'No answers.' }));
      } else if (q.type === 'pin') {
        var box = h('div', { class: 'pinbox host' }, h('img', { src: q.img, alt: '', referrerpolicy: 'no-referrer' }), h('i', { class: 'pinzone', style: 'left:' + (q.area.x * 100) + '%;top:' + (q.area.y * 100) + '%;width:' + (q.area.r * 200) + '%;aspect-ratio:1' }));
        recs.forEach(function (r) { if (r.a && typeof r.a.x === 'number') box.appendChild(h('i', { class: 'dot' + (r.right ? ' ok' : ''), style: 'left:' + (r.a.x * 100) + '%;top:' + (r.a.y * 100) + '%' })); });
        view = box;
      }
      var scored = QL.TYPES[q.type].scored && q.points !== 'none';
      body.appendChild(h('div', { class: 'qscreen' },
        h('div', { class: 'q-top' }, h('h2', { class: 'q-text', text: q.text }), h('div', { class: 'q-count' }, h('b', { text: n + ' answered' + (scored ? ', ' + right + ' right' : '') }))),
        view,
        h('div', { class: 'row center' }, h('button', { class: 'btn primary big', text: scored ? 'Show the leaderboard' : (G.qi === G.qs.length - 1 ? 'Finish' : 'Next question'), onclick: function () { if (scored) { G.phase = 'board'; render(); } else next(); } }))));
    }

    function board(body) {
      var order = sortedPlayers(), prev = G.prevRank, last = G.qi === G.qs.length - 1;
      var rows = h('ol', { class: 'board' });
      order.slice(0, 5).forEach(function (p, i) {
        var d = prev[p.pid] ? prev[p.pid] - (i + 1) : 0, a = p.answers[p.answers.length - 1];
        rows.appendChild(h('li', null, h('b', { class: 'bn', text: String(i + 1) }), h('span', { class: 'bname', text: p.name }), h('span', { class: 'bmove', text: d > 0 ? '▲' + d : d < 0 ? '▼' + (-d) : '' }), p.streak >= 2 ? h('span', { class: 'bstreak', text: p.streak + ' in a row' }) : null, h('span', { class: 'bplus', text: a && a.pts ? '+' + a.pts : '' }), h('b', { class: 'bscore', text: String(p.score) })));
      });
      var tm = G.opts.team ? h('div', { class: 'teams' }, teamScores().map(function (t) { return h('div', { class: 'team t' + t.i }, h('b', { text: t.name }), h('span', { text: t.avg + ' avg' })); })) : null;
      body.appendChild(h('div', { class: 'center-box big' }, h('h1', { text: 'Leaderboard' }), tm, rows, h('div', { class: 'row center' }, h('button', { class: 'btn primary big', text: last ? 'See the podium' : 'Next question', onclick: next }))));
    }

    function endScreen(body) {
      var order = sortedPlayers(), top = order.slice(0, 3);
      var pod = h('div', { class: 'podium' });
      [1, 0, 2].forEach(function (i) { var p = top[i]; if (!p) return; pod.appendChild(h('div', { class: 'pod p' + (i + 1) }, h('b', { class: 'pname', text: p.name }), h('span', { text: p.score + ' points' }), h('div', { class: 'pbase', text: String(i + 1) }))); });
      var rest = h('ol', { class: 'board small', start: 4 }); order.slice(3, 12).forEach(function (p) { rest.appendChild(h('li', null, h('span', { class: 'bname', text: p.name }), h('b', { class: 'bscore', text: String(p.score) }))); });
      var tm = G.opts.team ? h('div', { class: 'teams' }, teamScores().map(function (t, i) { return h('div', { class: 'team t' + t.i }, h('b', { text: (i + 1) + '. ' + t.name }), h('span', { text: t.avg + ' avg, ' + t.n + ' players' })); })) : null;
      body.appendChild(h('div', { class: 'center-box big' }, h('h1', { text: G.opts.team ? 'The teams' : 'Podium' }), tm, G.opts.podium ? pod : null, rest,
        h('div', { class: 'row center' },
          h('button', { class: 'btn primary', text: 'Download the results (CSV)', onclick: function () { QL.exportReportCsv(G.report); } }),
          h('button', { class: 'btn', text: 'Play again', onclick: function () { var k = G.kahoot; exit(); setTimeout(function () { QL.startLive(k); }, 50); } }),
          h('button', { class: 'btn', text: 'Back to my quizzes', onclick: exit }))));
    }

    /* ---------------- go ---------------- */
    G.phase = 'boot'; render(); openPeer(0);
    return { exit: exit };
  };
})();

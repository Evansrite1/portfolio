/* QuizBlast core: names, data model, storage, scoring, sounds, sharing, CSV. Everything stays in this browser. */
(function () {
  'use strict';
  var QL = window.QL = { NAME: 'QuizBlast' };

  /* ---------- tiny helpers ---------- */
  QL.$ = function (s, r) { return (r || document).querySelector(s); };
  QL.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  QL.h = function (tag, attrs) {
    var e = document.createElement(tag), i, k, c;
    if (attrs) for (k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) e.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    for (i = 2; i < arguments.length; i++) add(arguments[i]);
    return e;
  };
  QL.uid = function () { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); };
  QL.clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };
  QL.shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  QL.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  QL.norm = function (s) { return String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); };
  QL.fmtDate = function (t) { try { return new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } };
  QL.toast = function (msg, bad) {
    var t = QL.h('div', { class: 'toast' + (bad ? ' bad' : ''), text: msg }); document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 2800);
  };

  /* ---------- storage (this browser only; never throws) ---------- */
  var mem = {};
  QL.load = function (k, d) { try { var v = localStorage.getItem('ql.' + k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? mem[k] : d; } };
  QL.save = function (k, v) { mem[k] = v; try { localStorage.setItem('ql.' + k, JSON.stringify(v)); return true; } catch (e) { QL.toast('This browser is full or blocking storage. Export your quizzes to keep them.', true); return false; } };

  /* ---------- question types ---------- */
  QL.TYPES = {
    quiz: { label: 'Quiz', hint: 'Pick the right answer (or several)', scored: true },
    tf: { label: 'True or false', hint: 'Two choices', scored: true },
    type: { label: 'Type answer', hint: 'Players type the answer', scored: true },
    puzzle: { label: 'Puzzle', hint: 'Put the items in order', scored: true },
    slider: { label: 'Slider', hint: 'Pick a number on a scale', scored: true },
    pin: { label: 'Pin answer', hint: 'Tap the right spot on a picture', scored: true },
    poll: { label: 'Poll', hint: 'No right answer, see the votes', scored: false },
    cloud: { label: 'Word cloud', hint: 'Short words become a cloud', scored: false },
    open: { label: 'Open ended', hint: 'Free text, you read the answers', scored: false },
    brainstorm: { label: 'Brainstorm', hint: 'Collect ideas from everyone', scored: false }
  };
  QL.COLORS = ['#e8486a', '#2f8fe0', '#e8a317', '#2eb872', '#8a5cf0', '#e8742e'];
  QL.SHAPES = ['M12 3l10 18H2z', 'M12 2l10 10-10 10L2 12z', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M4 4h16v16H4z', 'M12 2l3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z', 'M12 2l9 5v10l-9 5-9-5V7z'];

  QL.newQuestion = function (type) {
    var q = { id: QL.uid(), type: type, text: '', media: null, time: 20, points: QL.TYPES[type].scored ? 'standard' : 'none' };
    if (type === 'quiz') { q.multi = false; q.options = [{ t: '', ok: true }, { t: '', ok: false }, { t: '', ok: false }, { t: '', ok: false }]; }
    if (type === 'tf') { q.options = [{ t: 'True', ok: true }, { t: 'False', ok: false }]; }
    if (type === 'type') { q.answers = ['']; q.time = 30; }
    if (type === 'puzzle') { q.items = ['', '', '', '']; q.time = 30; }
    if (type === 'slider') { q.min = 0; q.max = 100; q.step = 1; q.correct = 50; q.margin = 'medium'; q.unit = ''; }
    if (type === 'pin') { q.img = ''; q.area = { x: 0.5, y: 0.5, r: 0.1 }; q.time = 30; }
    if (type === 'poll') { q.options = [{ t: '' }, { t: '' }, { t: '' }, { t: '' }]; }
    if (type === 'cloud') { q.time = 60; }
    if (type === 'open') { q.time = 90; }
    if (type === 'brainstorm') { q.time = 90; }
    return q;
  };
  QL.newKahoot = function () { return { id: QL.uid(), title: '', desc: '', cover: '', theme: 'night', vis: 'private', folder: '', questions: [], created: Date.now(), updated: Date.now() }; };
  QL.THEMES = { night: ['#14122b', '#2b2563'], sunrise: ['#3a1a2e', '#a8431f'], forest: ['#0f2a22', '#1f6a4a'], ocean: ['#0b2238', '#1c6aa8'], candy: ['#2d1245', '#b02f8a'], paper: ['#2a2a2e', '#55555e'] };
  QL.MARGINS = { low: 0.05, medium: 0.1, high: 0.2, all: 1 };
  QL.TIMES = [5, 10, 20, 30, 45, 60, 90, 120, 180, 240];

  /* a problem list for a question (empty when it is ready to play) */
  QL.problems = function (q) {
    var t = q.type, ok = function (s) { return String(s || '').trim().length > 0; };
    if (!ok(q.text)) return 'Type the question';
    if (t === 'quiz' || t === 'tf') {
      var filled = q.options.filter(function (o) { return ok(o.t); });
      if (filled.length < 2) return 'Add at least 2 answers';
      if (q.options.some(function (o) { return o.ok && ok(o.t); }) === false) return 'Mark the right answer';
    }
    if (t === 'poll' && q.options.filter(function (o) { return ok(o.t); }).length < 2) return 'Add at least 2 choices';
    if (t === 'type' && !q.answers.some(ok)) return 'Add the accepted answer';
    if (t === 'puzzle' && q.items.filter(ok).length < 2) return 'Add at least 2 items';
    if (t === 'slider' && !(Number(q.max) > Number(q.min) && Number(q.correct) >= Number(q.min) && Number(q.correct) <= Number(q.max))) return 'The right number must sit between the smallest and largest';
    if (t === 'pin' && !q.img) return 'Add the picture';
    return '';
  };

  /* ---------- scoring ---------- */
  /* returns 0..1: how right the answer is */
  QL.rightness = function (q, a) {
    var t = q.type;
    if (a == null) return 0;
    if (t === 'quiz' || t === 'tf') {
      var want = [], got = (Array.isArray(a) ? a : [a]).map(Number).sort();
      q.options.forEach(function (o, i) { if (o.ok) want.push(i); });
      return want.length === got.length && want.every(function (v, i) { return v === got[i]; }) ? 1 : 0;
    }
    if (t === 'type') { var n = QL.norm(a); return q.answers.some(function (x) { return QL.norm(x) === n && n; }) ? 1 : 0; }
    if (t === 'puzzle') { return Array.isArray(a) && a.length === q.items.length && a.every(function (v, i) { return Number(v) === i; }) ? 1 : 0; }
    if (t === 'slider') {
      var range = Number(q.max) - Number(q.min), m = QL.MARGINS[q.margin] * range, d = Math.abs(Number(a) - Number(q.correct));
      if (q.margin === 'all') return 1 - 0.5 * d / range;
      return d <= m ? (m === 0 ? 1 : 1 - 0.5 * d / m) : 0;
    }
    if (t === 'pin') {
      if (!a || typeof a.x !== 'number') return 0;
      var dd = Math.hypot(a.x - q.area.x, a.y - q.area.y);
      return dd <= q.area.r ? 1 - 0.5 * dd / q.area.r : 0;
    }
    return 0;
  };
  QL.isFullyRight = function (q, a) { return QL.rightness(q, a) >= 0.999; };
  /* points for one answer. ms = time taken, streak = right answers in a row before this one */
  QL.points = function (q, a, ms, streak) {
    if (!QL.TYPES[q.type].scored || q.points === 'none') return { right: false, base: 0, bonus: 0, total: 0, part: 0 };
    var part = QL.rightness(q, a);
    if (part <= 0) return { right: false, base: 0, bonus: 0, total: 0, part: 0 };
    var T = q.time * 1000, mult = q.points === 'double' ? 2 : 1;
    var base = Math.round(1000 * mult * (1 - QL.clamp(ms / T, 0, 1) / 2) * part);
    var bonus = QL.isFullyRight(q, a) ? Math.min(streak || 0, 5) * 100 : 0;
    return { right: part >= 0.999, base: base, bonus: bonus, total: base + bonus, part: part };
  };

  /* what a correct answer looks like, as a sentence */
  QL.answerText = function (q) {
    var t = q.type;
    if (t === 'quiz' || t === 'tf') return q.options.filter(function (o) { return o.ok && o.t; }).map(function (o) { return o.t; }).join(', ');
    if (t === 'type') return q.answers.filter(Boolean).join(' / ');
    if (t === 'puzzle') return q.items.filter(Boolean).join(' > ');
    if (t === 'slider') return q.correct + (q.unit ? ' ' + q.unit : '');
    if (t === 'pin') return 'The marked spot';
    return '';
  };

  /* ---------- nicknames ---------- */
  var ADJ = ['Brave', 'Clever', 'Swift', 'Happy', 'Sunny', 'Lucky', 'Mighty', 'Cosmic', 'Funky', 'Jolly', 'Witty', 'Zesty', 'Bold', 'Calm', 'Epic', 'Fuzzy', 'Gentle', 'Hyper', 'Nimble', 'Proud'];
  var NOUN = ['Panda', 'Falcon', 'Otter', 'Tiger', 'Comet', 'Wizard', 'Koala', 'Rocket', 'Dragon', 'Fox', 'Eagle', 'Llama', 'Robot', 'Shark', 'Owl', 'Moose', 'Gecko', 'Raven', 'Pixel', 'Jaguar'];
  QL.nickname = function () { return ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)] + Math.floor(Math.random() * 90 + 10); };
  var BAD = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'nigg', 'fag', 'slut', 'whore', 'rape', 'nazi', 'porn', 'sex', 'cock', 'ass', 'damn'];
  QL.cleanName = function (s) {
    s = String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
    return s;
  };
  QL.rude = function (s) { var n = QL.norm(s).replace(/ /g, ''); return BAD.some(function (b) { return n.indexOf(b) >= 0; }); };

  /* ---------- sounds (made with the browser, no files) ---------- */
  var ac = null, muted = false, musicTimer = null;
  function ctx() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) { ac = null; } return ac; }
  function tone(f, t0, dur, type, vol) {
    var c = ctx(); if (!c || muted) return;
    var o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, c.currentTime + t0); g.gain.exponentialRampToValueAtTime(vol || 0.12, c.currentTime + t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.05);
  }
  QL.sfx = function (n) {
    if (n === 'tick') tone(880, 0, 0.06, 'square', 0.04);
    else if (n === 'right') { tone(523, 0, 0.12, 'triangle'); tone(659, 0.1, 0.12, 'triangle'); tone(784, 0.2, 0.25, 'triangle'); }
    else if (n === 'wrong') { tone(220, 0, 0.18, 'sawtooth', 0.07); tone(165, 0.15, 0.3, 'sawtooth', 0.07); }
    else if (n === 'join') tone(660, 0, 0.1, 'sine', 0.1);
    else if (n === 'start') { [392, 523, 659, 784].forEach(function (f, i) { tone(f, i * 0.12, 0.2, 'square', 0.07); }); }
    else if (n === 'win') { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, i * 0.14, 0.3, 'triangle', 0.12); }); }
  };
  QL.music = function (on) {
    clearInterval(musicTimer); musicTimer = null;
    if (!on) return;
    var notes = [262, 330, 392, 330, 294, 349, 440, 349], i = 0;
    musicTimer = setInterval(function () { tone(notes[i++ % notes.length], 0, 0.3, 'triangle', 0.05); }, 380);
  };
  QL.mute = function (m) { if (m !== undefined) { muted = !!m; if (muted) QL.music(false); QL.save('muted', muted); } return muted; };
  muted = !!QL.load('muted', false);

  /* ---------- sharing: a quiz becomes a link (compressed text in the address) ---------- */
  function b64u(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  async function pipe(bytes, stream) { var r = new Response(new Blob([bytes]).stream().pipeThrough(stream)); return new Uint8Array(await r.arrayBuffer()); }
  QL.pack = async function (obj) {
    var raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'undefined') return 'r' + b64u(raw);
    return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw')));
  };
  QL.unpack = async function (s) {
    var kind = s[0], bytes = unb64u(s.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  /* a copy with big picture data removed is much shorter to share */
  QL.shareable = function (k) {
    var c = QL.clone(k), big = 0;
    function strip(o, key) { if (o[key] && String(o[key]).indexOf('data:') === 0 && o[key].length > 20000) { o[key] = ''; big++; } }
    strip(c, 'cover');
    c.questions.forEach(function (q) { if (q.media) { if (q.media.url && q.media.url.indexOf('data:') === 0 && q.media.url.length > 20000) { q.media = null; big++; } } strip(q, 'img'); });
    return { quiz: c, removed: big };
  };
  QL.baseUrl = function () { return location.origin + location.pathname; };

  /* ---------- CSV (quiz questions as a spreadsheet) ---------- */
  QL.csvEscape = function (v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  QL.toCsv = function (rows) { return rows.map(function (r) { return r.map(QL.csvEscape).join(','); }).join('\r\n'); };
  QL.parseCsv = function (text) {
    var rows = [], row = [], f = '', q = false, i, c;
    text = String(text).replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(function (x) { return x !== ''; })) rows.push(row); row = []; }
      else f += c;
    }
    row.push(f); if (row.some(function (x) { return x !== ''; })) rows.push(row);
    return rows;
  };
  QL.download = function (name, text, type) {
    var a = document.createElement('a'), b = new Blob([text], { type: type || 'text/plain' });
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  /* Columns: Question, Answer 1..4, Correct (numbers like 1 or 1;3), Time (seconds), Image URL */
  QL.CSV_HEAD = ['Question', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Correct answer(s)', 'Time (seconds)', 'Image or video link'];
  QL.quizToCsv = function (k) {
    var rows = [QL.CSV_HEAD];
    k.questions.forEach(function (q) {
      if (q.type !== 'quiz' && q.type !== 'tf') return;
      var o = q.options.map(function (x) { return x.t; }), ok = [];
      q.options.forEach(function (x, i) { if (x.ok) ok.push(i + 1); });
      rows.push([q.text, o[0] || '', o[1] || '', o[2] || '', o[3] || '', ok.join(';'), q.time, q.media ? q.media.url : '']);
    });
    return QL.toCsv(rows);
  };
  QL.csvToQuestions = function (text) {
    var rows = QL.parseCsv(text), out = [], start = /question/i.test(rows[0] && rows[0][0]) ? 1 : 0, i;
    for (i = start; i < rows.length; i++) {
      var r = rows[i], q = QL.newQuestion('quiz'), txt = String(r[0] || '').trim();
      if (!txt) continue;
      q.text = txt;
      var ok = String(r[5] || '1').split(/[;,\s]+/).map(Number);
      q.options = [1, 2, 3, 4].map(function (n) { return { t: String(r[n] || '').trim(), ok: ok.indexOf(n) >= 0 }; });
      q.multi = ok.filter(Boolean).length > 1;
      var tm = Number(r[6]); if (tm >= 5 && tm <= 240) q.time = tm;
      if (r[7] && /^https?:/i.test(r[7].trim())) q.media = QL.mediaFromUrl(r[7].trim());
      out.push(q);
    }
    return out;
  };
  QL.mediaFromUrl = function (u) {
    var m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/.exec(u);
    return m ? { kind: 'youtube', url: u, id: m[1] } : { kind: 'image', url: u };
  };

  /* ---------- a quick question maker from pasted text (it does not use AI) ---------- */
  QL.quickGenerate = function (text, count) {
    var sents = String(text).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 35 && s.length < 220; });
    var STOP = {}; 'the a an and or but of to in on at for with from by is are was were be been this that these those it its as into than then they them their there which who whom what when where while about also not can could would should have has had will may might very more most other some such only over under after before between during through because'.split(' ').forEach(function (w) { STOP[w] = 1; });
    var pool = {}, out = [];
    sents.forEach(function (s) { (s.match(/\b[A-Z][a-z]{3,}\b|\b\d[\d,.]*\b|\b[a-z]{7,}\b/g) || []).forEach(function (w) { if (!STOP[w.toLowerCase()]) pool[w] = 1; }); });
    var words = Object.keys(pool);
    QL.shuffle(sents).some(function (s) {
      var cands = (s.match(/\b[A-Z][a-z]{3,}\b|\b\d[\d,.]*\b|\b[a-z]{6,}\b/g) || []).filter(function (w) { return !STOP[w.toLowerCase()]; });
      var first = s.split(' ')[0]; cands = cands.filter(function (w) { return w !== first || /\d/.test(w); });
      if (!cands.length) return false;
      var ans = cands[Math.floor(Math.random() * cands.length)];
      var wrong = QL.shuffle(words.filter(function (w) { return w !== ans && (/\d/.test(w) === /\d/.test(ans)) && (/^[A-Z]/.test(w) === /^[A-Z]/.test(ans)); })).slice(0, 3);
      if (wrong.length < 3) return false;
      var q = QL.newQuestion('quiz');
      q.text = s.replace(new RegExp('\\b' + ans.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b'), '________');
      var opts = QL.shuffle([ans].concat(wrong)); q.options = opts.map(function (w) { return { t: w, ok: w === ans }; });
      out.push(q); return out.length >= count;
    });
    return out;
  };
})();

/* Audio mastering: user interface (layout, arrange view, track headers, mixer, plugin racks, transport, menus, dialogs).
   Talks to AM.engine, AM.Midi and AM.Spectral only through the shared contract. */
window.AM = window.AM || {};
(function () {
  'use strict';
  var AMr = window.AM;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(n, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '"><use href="#i-' + n + '"/></svg>'; }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function errText(e) { return (e && (e.message || e.name)) || String(e || 'Unknown problem'); }
  var toastT = 0;
  function toast(t, bad) { var e = $('toast'); if (!e) return; e.textContent = t; e.classList.toggle('bad', !!bad); e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, bad ? 4600 : 2600); }
  function say(t, bad) { var e = $('st-msg'); if (!e) return; e.textContent = t; e.classList.toggle('err', !!bad); }
  function openDlg(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
  function closeDlg(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  function anyDialogOpen() { var ds = document.querySelectorAll('dialog'); for (var i = 0; i < ds.length; i++) if (ds[i].open || ds[i].hasAttribute('open')) return true; return false; }

  /* ------------------------------------------------------------------ engine check */
  var E = AMr.engine;
  if (!E || typeof E.on !== 'function' || !E.project) {
    var f = $('fatal');
    if (f) {
      $('fatal-msg').textContent = 'The audio engine (the file /tools/am/engine.js) did not load, so the workstation cannot play or edit sound. Please reload the page. If this keeps happening, try another browser such as Chrome, Edge, Firefox or Safari.';
      f.hidden = false;
    }
    var g = $('gate'); if (g) g.hidden = true;
    var a = $('app'); if (a) a.setAttribute('aria-hidden', 'true');
    AMr.ui = { ok: false, error: 'engine missing' };
    return;
  }
  function hasMidi() { return !!(AMr.Midi && typeof AMr.Midi === 'object'); }
  function hasSpectral() { return !!(AMr.Spectral && typeof AMr.Spectral === 'object'); }

  /* ------------------------------------------------------------------ state and helpers */
  var TH = 76, RH = 26;
  document.documentElement.style.setProperty('--th', TH + 'px');
  var S = {
    pps: store('am_pps') || 60, x0: 0, sel: new Set(), selTrack: null, tab: 'mixer',
    dockH: store('am_dockh') || Math.max(300, Math.round(window.innerHeight * 0.45)), dockOpen: store('am_dockopen') !== false,
    recording: false, midiRec: false, inputId: null, area: 'arr',
    target: -14, ceiling: -1, match: false, loopPrev: null, fxTarget: null,
    importAt: null
  };
  var drag = null, rulerDrag = null;
  function P() { return E.project || {}; }
  function tracks() { return P().tracks || []; }
  function bpm() { return +P().bpm || 120; }
  function bpb() { var s = P().sig; return (s && +s[0]) || 4; }
  function s2b(t) { return typeof E.secToBeat === 'function' ? E.secToBeat(t) : t * bpm() / 60; }
  function b2s(b) { return typeof E.beatToSec === 'function' ? E.beatToSec(b) : b * 60 / bpm(); }
  function barSec() { return b2s(bpb()) - b2s(0); }
  function dur() { try { return +E.duration() || 0; } catch (e) { return 0; } }
  function now() { try { return +E.time || 0; } catch (e) { return 0; } }
  function playing() { try { return !!E.playing; } catch (e) { return false; } }
  function findTrack(id) { try { return E.findTrack(id) || null; } catch (e) { return null; } }
  function findClip(id) { try { var r = E.findClip(id); return r && r.clip ? r : null; } catch (e) { return null; } }
  function allClips() { var out = []; tracks().forEach(function (t) { (t.clips || []).forEach(function (c) { out.push({ track: t, clip: c }); }); }); return out; }
  function batch(reason, fn) { if (typeof E.batch === 'function') return E.batch(reason, fn); return fn(); }
  function uid(p) { return typeof AMr.uid === 'function' ? AMr.uid(p) : p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
  function ensureCtx() { try { return E.ensure(); } catch (e) { return null; } }
  function gainToDb(g) { return g <= 0.00001 ? -60 : clamp(20 * Math.log10(g), -60, 12); }
  function dbToGain(db) { return db <= -60 ? 0 : Math.pow(10, db / 20); }
  function fmtDb(db) { return db <= -60 ? '-inf dB' : (db > 0 ? '+' : '') + db.toFixed(1) + ' dB'; }
  function fmtSecs(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = t - m * 60; var ss = s.toFixed(3); if (s < 10) ss = '0' + ss; return m + ':' + ss; }
  function fmtShort(t) { t = Math.max(0, t || 0); var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  function fmtBars(t) {
    var b = Math.max(0, s2b(Math.max(0, t))), n = bpb();
    var bar = Math.floor(b / n + 1e-9), beat = Math.floor(b - bar * n + 1e-9), h = Math.floor((b - Math.floor(b + 1e-9)) * 100 + 1e-6);
    return (bar + 1) + '.' + (beat + 1) + '.' + (h < 10 ? '0' : '') + clamp(h, 0, 99);
  }
  function hexA(hex, a) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 'rgba(120,120,130,' + a + ')';
    var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function isTyping(el) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    var t = el.tagName;
    if (t === 'TEXTAREA' || t === 'SELECT') return true;
    if (t === 'INPUT') return !/^(range|checkbox|radio|button|color|file|submit)$/i.test(el.type || 'text');
    return false;
  }

  /* ------------------------------------------------------------------ menus */
  var menuEl = null, menuBtn = null;
  function closeMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); menuBtn = null; }
  }
  function showMenu(x, y, entries, fromBtn) {
    closeMenu();
    var m = mk('div', 'menu'); m.setAttribute('role', 'menu');
    entries.forEach(function (en) {
      if (!en) return;
      if (en.sep) { m.appendChild(document.createElement('hr')); return; }
      if (en.hdr) { m.appendChild(mk('div', 'ml', esc(en.hdr))); return; }
      var b = mk('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.disabled = !!en.off;
      b.innerHTML = (en.icon ? ic(en.icon, 'sm') : '') + '<span>' + esc(en.label) + '</span>' + (en.check ? ic('check', 'sm ck') : '') + (en.key ? '<kbd>' + esc(en.key) + '</kbd>' : '');
      b.onclick = function () { closeMenu(); try { en.fn(); } catch (e) { console.error(e); toast(errText(e), true); } };
      m.appendChild(b);
    });
    document.body.appendChild(m); menuEl = m;
    if (fromBtn) { menuBtn = fromBtn; fromBtn.setAttribute('aria-expanded', 'true'); }
    var w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(x, window.innerWidth - w - 6)) + 'px';
    m.style.top = Math.max(6, Math.min(y, window.innerHeight - h - 6)) + 'px';
  }
  function menuAt(btn, entries) { var r = btn.getBoundingClientRect(); showMenu(r.left, r.bottom + 3, entries, btn); }
  document.addEventListener('mousedown', function (e) { if (menuEl && !menuEl.contains(e.target) && !(menuBtn && menuBtn.contains(e.target))) closeMenu(); }, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('blur', closeMenu);

  /* dialogs: [data-close] buttons and backdrop clicks close them */
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-close]');
    if (c) { var d = c.closest('dialog'); if (d) closeDlg(d); return; }
    if (e.target.tagName === 'DIALOG' && e.target.id !== 'dlg-busy') closeDlg(e.target);
  });

  /* ------------------------------------------------------------------ commands */
  var cmd = {
    newProject: function () {
      if (tracks().length && !window.confirm('Start a new project? The current one will be replaced. You can still undo right after.')) return;
      E.stop(); S.sel.clear(); S.selTrack = null; E.newProject(); S.x0 = 0; syncScroll(); say('New project started.');
    },
    addAudioFiles: function (at) { S.importAt = at || null; var i = $('f-audio'); i.value = ''; i.click(); },
    importMidi: function () { var i = $('f-midi'); i.value = ''; i.click(); },
    save: function () {
      say('Saving...');
      return Promise.resolve().then(function () { return E.saveLocal(); }).then(function () { markSaved(); toast('Saved on this computer'); })
        .catch(function (e) { setSave('Could not save: ' + errText(e), false); toast('Could not save on this computer. ' + errText(e), true); });
    },
    undo: function () { if (E.canUndo === false) { say('Nothing to undo.'); return; } E.undo(); say('Undone.'); },
    redo: function () { if (E.canRedo === false) { say('Nothing to redo.'); return; } E.redo(); say('Redone.'); },
    split: function () {
      var t = now(), ids = [];
      S.sel.forEach(function (id) { var r = findClip(id); if (r && t > r.clip.start + 0.001 && t < r.clip.start + r.clip.length - 0.001) ids.push(id); });
      if (!ids.length && S.selTrack) { var tr = findTrack(S.selTrack); (tr && tr.clips || []).forEach(function (c) { if (t > c.start + 0.001 && t < c.start + c.length - 0.001) ids.push(c.id); }); }
      if (!ids.length) { toast('Put the playhead over a selected clip to split it'); return; }
      var made = [];
      batch('Split', function () { ids.forEach(function (id) { var r = E.splitClip(id, t); if (r && r.length) r.forEach(function (c) { if (c) made.push(c.id); }); }); });
      S.sel = new Set(made.length ? made.slice(-1) : []); say('Split at ' + fmtSecs(t) + '.'); redraw();
    },
    duplicate: function () {
      if (!S.sel.size) { toast('Select a clip first'); return; }
      var made = [];
      batch('Duplicate', function () { Array.from(S.sel).forEach(function (id) { if (findClip(id)) { var c = E.duplicateClip(id); if (c) made.push(c.id); } }); });
      if (made.length) S.sel = new Set(made); say('Duplicated.'); redraw();
    },
    del: function () {
      if (!S.sel.size) { toast('Select a clip first'); return; }
      var ids = Array.from(S.sel); S.sel.clear();
      batch('Delete', function () { ids.forEach(function (id) { if (findClip(id)) E.removeClip(id); }); });
      say(ids.length === 1 ? 'Clip removed.' : ids.length + ' clips removed.'); redraw();
    },
    selectAll: function () { S.sel = new Set(allClips().map(function (r) { return r.clip.id; })); redraw(); say(S.sel.size + ' clips selected.'); },
    addTrack: function (type) {
      var t = E.addTrack({ type: type });
      if (t && t.id) S.selTrack = t.id;
      say(type === 'midi' ? 'MIDI track added. Double click its lane to make a clip.' : 'Audio track added.');
      return t;
    },
    removeTrack: function () {
      var t = findTrack(S.selTrack);
      if (!t) { toast('Click a track first'); return; }
      if ((t.clips || []).length && !window.confirm('Remove the track "' + t.name + '" and its clips? You can undo this.')) return;
      E.removeTrack(t.id); S.selTrack = null; say('Track removed.');
    },
    zoomIn: function () { zoomAt(1.5, viewW() / 2); },
    zoomOut: function () { zoomAt(1 / 1.5, viewW() / 2); },
    fit: function () {
      var d = Math.max(dur(), P().loop && P().loop.on ? P().loop.end : 0, 4);
      S.pps = clamp((viewW() - 30) / d, 1, 3000); S.x0 = 0; store('am_pps', S.pps); syncScroll(); redraw();
    },
    togglePlay: function () {
      ensureCtx();
      if (S.recording || S.midiRec) { cmd.stop(); return; }
      if (playing()) E.pause(); else { E.play(); startTick(); startMeters(); }
      syncTransport();
    },
    stop: function () {
      if (S.midiRec) stopMidiRec();
      E.stop(); updPlayhead(); updClock();
    },
    toStart: function () { E.seek(0); S.x0 = 0; syncScroll(); updPlayhead(); updClock(); redraw(); },
    toEnd: function () { E.seek(dur()); followPlayhead(true); updPlayhead(); updClock(); },
    record: function () {
      ensureCtx();
      if (S.recording || S.midiRec) { cmd.stop(); return; }
      var midiT = recordMidiTrack();
      if (midiT) { startMidiRec(midiT); return; }
      if (S.inputId === null) { openRecDialog(); return; }
      startAudioRec();
    },
    loop: function () {
      var l = P().loop || { on: false, start: 0, end: barSec() * 4 };
      var st = l.start, en = l.end;
      if (!(en > st)) { st = 0; en = barSec() * 4; }
      E.setLoop({ on: !l.on, start: st, end: en }); syncTransport(); redraw();
      say(!l.on ? 'Loop on from ' + fmtSecs(st) + ' to ' + fmtSecs(en) + '.' : 'Loop off.');
    },
    metro: function () { E.metronome = !E.metronome; syncTransport(); say(E.metronome ? 'Metronome on.' : 'Metronome off.'); },
    snap: function () { setProjectField('snap', !P().snap); syncTransport(); say(P().snap ? 'Snap to grid on.' : 'Snap to grid off.'); },
    help: function () { openDlg($('dlg-keys')); },
    exportMidi: function () {
      if (!hasMidi() || typeof AMr.Midi.writeMidiFile !== 'function') { toast('MIDI export is not available because the MIDI part did not load', true); return; }
      var clips = [];
      tracks().forEach(function (t) { if (t.type === 'midi') (t.clips || []).forEach(function (c) { if (c.kind === 'midi') clips.push(c); }); });
      if (!clips.length) { toast('There are no MIDI clips to export'); return; }
      try {
        var bytes = AMr.Midi.writeMidiFile(clips, bpm());
        E.download(new Blob([bytes], { type: 'audio/midi' }), fileBase() + '.mid');
        say('MIDI file saved to your downloads.');
      } catch (e) { toast('MIDI export failed. ' + errText(e), true); }
    }
  };
  AMr.ui = { ok: true, cmd: cmd, state: S };

  function setProjectField(key, val) {
    /* the contract has no setter for these view fields, so they are set on the project and announced as a change */
    P()[key] = val;
    try { E.emit('change', { reason: key }); } catch (e) { onChange({ reason: key }); }
  }
  function fileBase() { return (String(P().name || 'Mix').replace(/[^\w\- ]+/g, '').trim() || 'Mix').replace(/\s+/g, ' '); }

  /* ------------------------------------------------------------------ menubar */
  function fileMenu() {
    return [
      { label: 'New project', icon: 'file', fn: cmd.newProject },
      { label: 'Add audio files...', icon: 'wave', fn: function () { cmd.addAudioFiles(); } },
      { label: 'Import MIDI file...', icon: 'keys', fn: cmd.importMidi },
      { sep: 1 },
      { label: 'Save now', icon: 'save', key: 'Ctrl+S', fn: cmd.save },
      { sep: 1 },
      { label: 'Export mix as WAV', fn: function () { exportMix('wav16'); } },
      { label: 'Export mix as MP3', fn: function () { exportMix('mp3320'); } },
      { label: 'Export MIDI', off: !hasMidi(), fn: cmd.exportMidi }
    ];
  }
  function editMenu() {
    return [
      { label: 'Undo', key: 'Ctrl+Z', off: E.canUndo === false, fn: cmd.undo },
      { label: 'Redo', key: 'Ctrl+Y', off: E.canRedo === false, fn: cmd.redo },
      { sep: 1 },
      { label: 'Split at playhead', key: 'S', fn: cmd.split },
      { label: 'Duplicate', key: 'Ctrl+D', off: !S.sel.size, fn: cmd.duplicate },
      { label: 'Delete', key: 'Del', off: !S.sel.size, fn: cmd.del },
      { sep: 1 },
      { label: 'Select all', key: 'Ctrl+A', fn: cmd.selectAll }
    ];
  }
  function trackMenu() {
    var t = findTrack(S.selTrack);
    return [
      { label: 'Add audio track', icon: 'wave', fn: function () { cmd.addTrack('audio'); } },
      { label: 'Add MIDI track', icon: 'keys', fn: function () { cmd.addTrack('midi'); } },
      { label: 'Remove selected track', icon: 'trash', off: !t, fn: cmd.removeTrack },
      { sep: 1 },
      { label: 'Plugins on selected track...', icon: 'sliders', off: !t, fn: function () { openFx(t.id); } },
      { label: 'Move track up', off: !t, fn: function () { moveTrackBy(t.id, -1); } },
      { label: 'Move track down', off: !t, fn: function () { moveTrackBy(t.id, 1); } },
      { sep: 1 },
      { label: 'Choose recording input...', icon: 'mic', fn: openRecDialog }
    ];
  }
  function viewMenu() {
    return [
      { label: 'Zoom in', icon: 'zin', key: '+', fn: cmd.zoomIn },
      { label: 'Zoom out', icon: 'zout', key: '-', fn: cmd.zoomOut },
      { label: 'Fit project', icon: 'fit', fn: cmd.fit },
      { sep: 1 },
      { label: 'Show mixer', check: S.dockOpen && S.tab === 'mixer', fn: function () { showTab('mixer'); } },
      { label: 'Show piano roll', check: S.dockOpen && S.tab === 'piano', fn: function () { showTab('piano'); } },
      { label: 'Show spectral', check: S.dockOpen && S.tab === 'spectral', fn: function () { showTab('spectral'); } },
      { label: 'Show mastering', check: S.dockOpen && S.tab === 'master', fn: function () { showTab('master'); } },
      { label: S.dockOpen ? 'Hide bottom panel' : 'Show bottom panel', fn: function () { setDockOpen(!S.dockOpen); } },
      { sep: 1 },
      { label: 'Keyboard shortcuts', icon: 'help', key: '?', fn: cmd.help }
    ];
  }
  var MENUS = { file: fileMenu, edit: editMenu, track: trackMenu, view: viewMenu };
  document.querySelectorAll('[data-menu]').forEach(function (b) {
    b.addEventListener('click', function () { if (menuBtn === b) { closeMenu(); return; } menuAt(b, MENUS[b.dataset.menu]()); });
    b.addEventListener('mouseenter', function () { if (menuBtn && menuBtn !== b && menuBtn.hasAttribute('data-menu')) menuAt(b, MENUS[b.dataset.menu]()); });
  });
  function moveTrackBy(id, d) {
    var ts = tracks(), i = ts.findIndex(function (t) { return t.id === id; });
    if (i < 0) return; var j = clamp(i + d, 0, ts.length - 1); if (j !== i) E.moveTrack(id, j);
  }

  /* ------------------------------------------------------------------ transport */
  $('t-start').onclick = cmd.toStart;
  $('t-play').onclick = cmd.togglePlay;
  $('t-stop').onclick = cmd.stop;
  $('t-rec').onclick = cmd.record;
  $('t-loop').onclick = cmd.loop;
  $('t-metro').onclick = cmd.metro;
  $('t-snap').onclick = cmd.snap;
  $('t-zin').onclick = cmd.zoomIn;
  $('t-zout').onclick = cmd.zoomOut;
  $('t-fit').onclick = cmd.fit;
  $('b-help').onclick = cmd.help;
  $('c-add-a').onclick = function () { cmd.addTrack('audio'); };
  $('c-add-m').onclick = function () { cmd.addTrack('midi'); };
  $('e-audio').onclick = function () { cmd.addAudioFiles(); };
  $('e-midi').onclick = function () { cmd.addTrack('midi'); };
  $('e-rec').onclick = cmd.record;
  function applyBpm() {
    var v = parseFloat($('t-bpm').value);
    if (!isFinite(v)) { $('t-bpm').value = bpm(); return; }
    v = clamp(Math.round(v * 100) / 100, 20, 300);
    if (v === bpm()) { $('t-bpm').value = v; return; }
    E.setTempo(v, { stretchAudio: false }); $('t-bpm').value = v; say('Tempo set to ' + v + ' BPM. MIDI follows the new tempo, audio keeps its timing.');
  }
  $('t-bpm').addEventListener('change', applyBpm);
  $('t-bpm').addEventListener('keydown', function (e) { if (e.key === 'Enter') { applyBpm(); e.target.blur(); } });
  $('t-sig').addEventListener('change', function () {
    var p = this.value.split('/'); setProjectField('sig', [+p[0], +p[1]]); this.blur(); say('Time signature set to ' + this.value + '.');
  });
  function syncTransport() {
    var p = P(), pl = playing();
    var pb = $('t-play'); pb.innerHTML = ic(pl ? 'pause' : 'play', 'sm'); pb.setAttribute('aria-label', pl ? 'Pause' : 'Play');
    $('t-rec').setAttribute('aria-pressed', String(!!(S.recording || S.midiRec)));
    $('t-recinfo').hidden = !(S.recording || S.midiRec);
    $('t-loop').setAttribute('aria-pressed', String(!!(p.loop && p.loop.on)));
    $('t-metro').setAttribute('aria-pressed', String(!!E.metronome));
    $('t-snap').setAttribute('aria-pressed', String(!!p.snap));
    if (document.activeElement !== $('t-bpm')) $('t-bpm').value = Math.round(bpm() * 100) / 100;
    var sig = (p.sig || [4, 4]).join('/'), sel = $('t-sig');
    if (!Array.prototype.some.call(sel.options, function (o) { return o.value === sig; })) { var o = mk('option'); o.value = o.textContent = sig; sel.appendChild(o); }
    if (document.activeElement !== sel) sel.value = sig;
  }
  function updClock() { var t = now(); $('t-bars').textContent = fmtBars(t); $('t-secs').textContent = fmtSecs(t); }

  /* ------------------------------------------------------------------ arrange view geometry */
  var vs = $('vs'), lanesW = $('lanesw'), lanes = $('lanes'), ruler = $('ruler'), hs = $('hs'), hsIn = $('hs-in'), ph = $('ph');
  var lctx = lanes.getContext('2d'), rctx = ruler.getContext('2d');
  var W = 600, LH = 200, DPR = 1;
  function viewW() { return W; }
  function xOf(t) { return (t - S.x0) * S.pps; }
  function tOf(x) { return x / S.pps + S.x0; }
  function gridStep() {
    /* the finest grid that keeps lines at least 10 px apart, in beats */
    var beatPx = (b2s(1) - b2s(0)) * S.pps;
    var steps = [0.25, 0.5, 1, bpb(), bpb() * 2, bpb() * 4, bpb() * 8, bpb() * 16, bpb() * 32];
    for (var i = 0; i < steps.length; i++) if (steps[i] * beatPx >= 10) return steps[i];
    return steps[steps.length - 1];
  }
  function snapT(t, ev) {
    if (!P().snap || (ev && ev.altKey)) return Math.max(0, t);
    var st = gridStep(), b = s2b(Math.max(0, t));
    return Math.max(0, b2s(Math.round(b / st) * st));
  }
  function contentEnd() { var l = P().loop || {}; return Math.max(dur(), l.on ? l.end : 0, now()) + 30; }
  function syncScroll() {
    var vSec = W / S.pps;
    S.x0 = Math.max(0, S.x0);
    hsIn.style.width = Math.ceil(Math.max(contentEnd(), S.x0 + vSec) * S.pps) + 'px';
    syncingScroll = true; hs.scrollLeft = S.x0 * S.pps; syncingScroll = false;
  }
  var syncingScroll = false;
  hs.addEventListener('scroll', function () { if (syncingScroll) return; S.x0 = hs.scrollLeft / S.pps; redraw(); updPlayhead(); });
  function zoomAt(factor, x) {
    var t = tOf(x);
    S.pps = clamp(S.pps * factor, 1, 3000); store('am_pps', S.pps);
    S.x0 = Math.max(0, t - x / S.pps); syncScroll(); redraw(); updPlayhead();
  }
  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = Math.max(50, lanesW.clientWidth || (window.innerWidth - 268) || 600);
    var need = tracks().length * TH + TH;
    LH = Math.max(need, (vs.clientHeight || 300));
    lanes.width = Math.round(W * DPR); lanes.height = Math.round(LH * DPR);
    lanes.style.width = W + 'px'; lanes.style.height = LH + 'px';
    ruler.width = Math.round(W * DPR); ruler.height = Math.round(RH * DPR);
    ruler.style.width = W + 'px'; ruler.style.height = RH + 'px';
    syncScroll(); draw(); updPlayhead();
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(function () { resize(); }).observe(vs);
  window.addEventListener('resize', resize);

  /* redraws are batched into one animation frame and only happen after an edit, a scroll, a drag or while playing */
  var drawQueued = false;
  function redraw() { if (drawQueued) return; drawQueued = true; (window.requestAnimationFrame || setTimeout)(function () { drawQueued = false; draw(); }); }

  /* ------------------------------------------------------------------ drawing */
  function clipView(c, trackId) {
    if (drag && drag.moved && drag.view[c.id]) return drag.view[c.id];
    return { start: c.start, offset: c.offset || 0, length: c.length, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0, trackId: trackId, notes: c.notes };
  }
  function draw() {
    drawRuler(); drawLanes();
  }
  function drawGrid(ctx, h, forRuler) {
    var st = gridStep(), b0 = Math.floor(s2b(S.x0) / st) * st, n = bpb(), tEnd = tOf(W);
    var labelEvery = 1; var barPx = barSec() * S.pps; while (barPx > 0 && barPx * labelEvery < 46 && labelEvery < 4096) labelEvery *= 2;
    for (var b = b0, guard = 0; guard < 4000; b += st, guard++) {
      var t = b2s(b); if (t > tEnd) break;
      var x = Math.round(xOf(t)) + 0.5; if (x < -1) continue;
      var isBar = Math.abs(b / n - Math.round(b / n)) < 1e-6;
      var isBeat = Math.abs(b - Math.round(b)) < 1e-6;
      if (forRuler) {
        ctx.strokeStyle = isBar ? '#6a6a73' : '#3a3a41';
        ctx.beginPath(); ctx.moveTo(x, isBar ? 8 : (isBeat ? 17 : 21)); ctx.lineTo(x, h); ctx.stroke();
        var barNo = Math.round(b / n);
        if (isBar && barNo % labelEvery === 0) { ctx.fillStyle = '#b6b6bd'; ctx.fillText(String(barNo + 1), x + 3, 11); }
      } else {
        ctx.strokeStyle = isBar ? '#2e2e35' : (isBeat ? '#222227' : '#1b1b1f');
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
    }
  }
  function drawRuler() {
    var c = rctx; c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = '#1f1f23'; c.fillRect(0, 0, W, RH);
    var l = S.loopPrev || P().loop;
    if (l && l.end > l.start) {
      var a = xOf(l.start), b = xOf(l.end);
      c.fillStyle = (S.loopPrev || l.on) ? 'rgba(76,141,255,.35)' : 'rgba(120,120,130,.2)';
      c.fillRect(a, 0, b - a, RH);
      c.fillStyle = (S.loopPrev || l.on) ? '#4c8dff' : '#5a5a64'; c.fillRect(a, 0, 2, RH); c.fillRect(b - 2, 0, 2, RH);
    }
    c.font = '600 10px ui-monospace,Consolas,monospace'; c.lineWidth = 1;
    drawGrid(c, RH, true);
    c.fillStyle = '#2b2b30'; c.fillRect(0, RH - 1, W, 1);
  }
  function drawLanes() {
    var c = lctx; c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = '#0e0e10'; c.fillRect(0, 0, W, LH);
    var ts = tracks();
    ts.forEach(function (t, i) {
      var y = i * TH;
      c.fillStyle = t.id === S.selTrack ? '#16161b' : (i % 2 ? '#111114' : '#131316'); c.fillRect(0, y, W, TH);
    });
    c.lineWidth = 1; drawGrid(c, LH, false);
    var l = S.loopPrev || P().loop;
    if (l && (l.on || S.loopPrev) && l.end > l.start) { c.fillStyle = 'rgba(76,141,255,.07)'; c.fillRect(xOf(l.start), 0, (l.end - l.start) * S.pps, LH); }
    ts.forEach(function (t, i) { c.fillStyle = '#26262b'; c.fillRect(0, (i + 1) * TH - 1, W, 1); });
    c.font = '600 10.5px system-ui,sans-serif'; c.textBaseline = 'top';
    var later = [];
    ts.forEach(function (t, i) {
      (t.clips || []).forEach(function (cl) {
        var v = clipView(cl, t.id);
        if (v.trackId !== t.id) { later.push([t, cl, v]); return; }
        drawClip(c, t, cl, v, i);
      });
    });
    later.forEach(function (x) { var ti = ts.findIndex(function (tt) { return tt.id === x[2].trackId; }); if (ti >= 0) drawClip(c, x[0], x[1], x[2], ti); });
  }
  function drawClip(c, t, cl, v, ti) {
    var x0 = xOf(v.start), x1 = xOf(v.start + v.length);
    if (x1 < -2 || x0 > W + 2) return;
    var y = ti * TH + 2, h = TH - 5, sel = S.sel.has(cl.id), col = t.color || '#4c8dff';
    var vx0 = Math.max(x0, -2), vx1 = Math.min(x1, W + 2);
    c.fillStyle = hexA(col, sel ? 0.34 : 0.22); c.fillRect(vx0, y, vx1 - vx0, h);
    c.fillStyle = hexA(col, sel ? 0.95 : 0.6); c.fillRect(vx0, y, vx1 - vx0, 14);
    var top = y + 15, hh = h - 16;
    c.save(); c.beginPath(); c.rect(vx0, y, vx1 - vx0, h); c.clip();
    if (cl.kind === 'midi') drawNotes(c, cl, v, x0, x1, top, hh, col);
    else drawWave(c, cl, v, x0, x1, top, hh, sel ? '#ffffff' : hexA('#e8e8ee', 0.85));
    /* fades */
    var fi = v.fadeIn * S.pps, fo = v.fadeOut * S.pps;
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.fillStyle = 'rgba(0,0,0,.35)';
    if (cl.kind !== 'midi') {
      if (fi > 0.5) { c.beginPath(); c.moveTo(x0, y + h); c.lineTo(x0 + fi, top); c.lineTo(x0, top); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x0, y + h); c.lineTo(x0 + fi, top); c.stroke(); }
      if (fo > 0.5) { c.beginPath(); c.moveTo(x1, y + h); c.lineTo(x1 - fo, top); c.lineTo(x1, top); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x1 - fo, top); c.lineTo(x1, y + h); c.stroke(); }
    }
    /* name */
    c.fillStyle = sel ? '#111' : '#fff';
    var label = (cl.name || (cl.kind === 'midi' ? 'MIDI' : 'Audio')) + (cl.reverse ? '  (reversed)' : '') + (cl.rate && cl.rate !== 1 ? '  x' + (+cl.rate).toFixed(2) : '');
    c.fillText(label, Math.max(x0, 0) + 12, y + 2);
    c.restore();
    /* fade handles at the top corners */
    if (cl.kind !== 'midi' && x1 - x0 > 16) {
      c.fillStyle = sel ? '#fff' : 'rgba(255,255,255,.75)';
      c.fillRect(x0 + fi - 3.5 + (fi < 4 ? 3.5 : 0), y, 7, 7);
      c.fillRect(x1 - fo - 3.5 - (fo < 4 ? 3.5 : 0), y, 7, 7);
    }
    c.strokeStyle = sel ? '#ffffff' : hexA(col, 0.9); c.lineWidth = sel ? 1.5 : 1;
    c.strokeRect(x0 + 0.5, y + 0.5, Math.max(1, x1 - x0 - 1), h - 1); c.lineWidth = 1;
  }
  function peakSpp(sr, rate) { var want = sr * rate / S.pps; return Math.max(16, Math.pow(2, Math.round(Math.log2(Math.max(1, want))))); }
  function drawWave(c, cl, v, x0, x1, top, hh, color) {
    var src = E.sources && E.sources.get ? E.sources.get(cl.srcId) : null;
    if (!src || !src.buffer) { c.fillStyle = '#ff9d96'; c.fillText('Audio missing', Math.max(x0, 0) + 6, top + 4); return; }
    var sr = src.buffer.sampleRate, rate = +cl.rate || 1, spp = peakSpp(sr, rate), pk;
    try { pk = E.getPeaks(cl.srcId, spp); } catch (e) { return; }
    if (!pk || !pk.max) return;
    var n = pk.max.length, mid = top + hh / 2, amp = hh / 2 * clamp(cl.gain == null ? 1 : +cl.gain, 0, 4);
    var from = Math.max(0, Math.floor(x0)), to = Math.min(W, Math.ceil(x1)), k = sr / spp;
    c.fillStyle = color; c.beginPath();
    for (var x = from; x < to; x++) {
      var a0 = (x - x0) / S.pps, a1 = (x + 1 - x0) / S.pps, sA, sB;
      if (cl.reverse) { sA = v.offset + (v.length - a1) * rate; sB = v.offset + (v.length - a0) * rate; }
      else { sA = v.offset + a0 * rate; sB = v.offset + a1 * rate; }
      var i0 = Math.floor(sA * k), i1 = Math.max(i0 + 1, Math.ceil(sB * k));
      if (i1 <= 0 || i0 >= n) continue;
      var mn = 1, mx = -1;
      for (var i = Math.max(0, i0), e = Math.min(n, i1); i < e; i++) { if (pk.min[i] < mn) mn = pk.min[i]; if (pk.max[i] > mx) mx = pk.max[i]; }
      if (mx < mn) continue;
      var env = 1, tm = (a0 + a1) / 2;
      if (v.fadeIn > 0 && tm < v.fadeIn) env = tm / v.fadeIn;
      if (v.fadeOut > 0 && tm > v.length - v.fadeOut) env = Math.min(env, (v.length - tm) / v.fadeOut);
      var yA = mid - clamp(mx * amp * env, -hh / 2, hh / 2), yB = mid - clamp(mn * amp * env, -hh / 2, hh / 2);
      c.rect(x, yA, 1, Math.max(1, yB - yA));
    }
    c.fill();
  }
  function drawNotes(c, cl, v, x0, x1, top, hh, col) {
    var notes = v.notes || cl.notes || [];
    if (!notes.length) { c.fillStyle = 'rgba(255,255,255,.45)'; c.fillText('Empty, double click to add notes', Math.max(x0, 0) + 6, top + 4); return; }
    var lo = 127, hi = 0;
    notes.forEach(function (n) { if (n.n < lo) lo = n.n; if (n.n > hi) hi = n.n; });
    lo -= 1; hi += 1; var rows = hi - lo + 1, nh = clamp(hh / rows, 1.5, 6), off = (hh - nh * rows) / 2;
    c.fillStyle = '#fff';
    notes.forEach(function (n) {
      if (n.t + n.d < 0 || n.t > v.length) return;
      var a = x0 + Math.max(0, n.t) * S.pps, b = x0 + Math.min(v.length, n.t + n.d) * S.pps;
      if (b < 0 || a > W) return;
      c.globalAlpha = 0.45 + 0.55 * clamp(n.v == null ? 0.8 : n.v, 0, 1);
      c.fillRect(a, top + off + (hi - n.n) * nh, Math.max(1.5, b - a - 0.5), Math.max(1, nh - 0.5));
    });
    c.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ playhead and follow */
  function updPlayhead() {
    var x = xOf(now());
    ph.hidden = x < 0 || x > W;
    ph.style.transform = 'translateX(' + Math.round(x) + 'px)';
  }
  function followPlayhead(force) {
    var x = xOf(now());
    if (force || x > W * 0.92 || x < 0) { S.x0 = Math.max(0, now() - (W / S.pps) * 0.08); syncScroll(); redraw(); }
  }
  var ticking = false;
  function startTick() { if (ticking) return; ticking = true; (window.requestAnimationFrame || setTimeout)(tick); }
  function tick() {
    if (!(playing() || S.recording || S.midiRec)) { ticking = false; updPlayhead(); updClock(); return; }
    if (!drag) followPlayhead(false);
    updPlayhead(); updClock();
    if (S.recording) redraw();
    (window.requestAnimationFrame || setTimeout)(tick);
  }

  /* ------------------------------------------------------------------ lane interaction */
  function laneAt(y) { var i = Math.floor(y / TH); var ts = tracks(); return i >= 0 && i < ts.length ? { track: ts[i], index: i } : null; }
  function localXY(ev, el) { var r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function hit(x, y) {
    var ln = laneAt(y); if (!ln) return null;
    var t = ln.track, cs = t.clips || [], yTop = ln.index * TH + 2;
    for (var i = cs.length - 1; i >= 0; i--) {
      var c = cs[i], x0 = xOf(c.start), x1 = xOf(c.start + c.length);
      if (x < x0 - 1 || x > x1 + 1) continue;
      var zone = 'move', dy = y - yTop, wpx = x1 - x0;
      if (c.kind !== 'midi' && dy <= 11 && wpx > 16) {
        var fiX = x0 + (c.fadeIn || 0) * S.pps, foX = x1 - (c.fadeOut || 0) * S.pps;
        if (Math.abs(x - fiX) <= 7) zone = 'fadeIn'; else if (Math.abs(x - foX) <= 7) zone = 'fadeOut';
      }
      if (zone === 'move' && wpx > 14) { if (x - x0 <= 6) zone = 'trimL'; else if (x1 - x <= 6) zone = 'trimR'; }
      return { track: t, index: ln.index, clip: c, zone: zone };
    }
    return { track: t, index: ln.index, clip: null, zone: 'lane' };
  }
  var CURSOR = { move: 'grab', trimL: 'ew-resize', trimR: 'ew-resize', fadeIn: 'nesw-resize', fadeOut: 'nwse-resize', lane: 'default' };
  function srcDur(c) { var s = E.sources && E.sources.get ? E.sources.get(c.srcId) : null; return s && s.buffer ? s.buffer.duration : Infinity; }

  lanes.addEventListener('pointermove', function (ev) {
    if (drag) return;
    var p = localXY(ev, lanes), h = hit(p.x, p.y);
    lanes.style.cursor = h ? CURSOR[h.zone] || 'default' : 'default';
  });
  lanes.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return;
    closeMenu();
    var p = localXY(ev, lanes), h = hit(p.x, p.y);
    if (!h) { S.sel.clear(); redraw(); return; }
    selectTrack(h.track.id);
    if (!h.clip) {
      if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) S.sel.clear();
      E.seek(snapT(tOf(p.x), ev)); updPlayhead(); updClock(); redraw();
      return;
    }
    var c = h.clip;
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) { if (S.sel.has(c.id)) S.sel.delete(c.id); else S.sel.add(c.id); }
    else if (!S.sel.has(c.id)) S.sel = new Set([c.id]);
    var others = [];
    if (h.zone === 'move') S.sel.forEach(function (id) { if (id === c.id) return; var r = findClip(id); if (r) others.push({ id: id, start: r.clip.start, trackId: r.track.id, offset: r.clip.offset || 0, length: r.clip.length, fadeIn: r.clip.fadeIn || 0, fadeOut: r.clip.fadeOut || 0, notes: r.clip.notes }); });
    drag = {
      mode: h.zone, id: c.id, kind: c.kind, cx: ev.clientX, cy: ev.clientY, moved: false, grabT: tOf(p.x),
      orig: { start: c.start, offset: c.offset || 0, length: c.length, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0, trackId: h.track.id, notes: c.notes, rate: +c.rate || 1, reverse: !!c.reverse, srcDur: c.kind === 'audio' ? srcDur(c) : Infinity, type: h.track.type },
      others: others, view: {}
    };
    try { lanes.setPointerCapture(ev.pointerId); } catch (e) {}
    lanes.style.cursor = h.zone === 'move' ? 'grabbing' : CURSOR[h.zone];
    redraw();
  });
  lanes.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    if (!drag.moved && Math.abs(ev.clientX - drag.cx) < 3 && Math.abs(ev.clientY - drag.cy) < 3) return;
    drag.moved = true;
    var p = localXY(ev, lanes), o = drag.orig, v = { start: o.start, offset: o.offset, length: o.length, fadeIn: o.fadeIn, fadeOut: o.fadeOut, trackId: o.trackId, notes: o.notes };
    var minLen = Math.max(0.02, 4 / S.pps);
    if (drag.mode === 'move') {
      var ns = snapT(o.start + (tOf(p.x) - drag.grabT), ev);
      v.start = Math.max(0, ns);
      var ln = laneAt(p.y);
      if (ln && ln.track.type === o.type && !drag.others.length) v.trackId = ln.track.id;
      var dt = v.start - o.start;
      drag.others.forEach(function (x) { drag.view[x.id] = { start: Math.max(0, x.start + dt), offset: x.offset, length: x.length, fadeIn: x.fadeIn, fadeOut: x.fadeOut, trackId: x.trackId, notes: x.notes }; });
    } else if (drag.mode === 'trimL') {
      var end = o.start + o.length, nsL = snapT(tOf(p.x), ev);
      var minStart = drag.kind === 'midi' ? 0 : (o.reverse ? o.start - (o.srcDur - (o.offset + o.length * o.rate)) / o.rate : o.start - o.offset / o.rate);
      nsL = clamp(nsL, Math.max(0, minStart), end - minLen);
      var d = nsL - o.start;
      v.start = nsL; v.length = end - nsL;
      if (drag.kind === 'midi') v.notes = (o.notes || []).map(function (n) { return { t: n.t - d, d: n.d, n: n.n, v: n.v }; }).filter(function (n) { return n.t + n.d > 0; });
      else if (!o.reverse) v.offset = Math.max(0, o.offset + d * o.rate);
      v.fadeIn = Math.min(o.fadeIn, v.length); v.fadeOut = Math.min(o.fadeOut, v.length - v.fadeIn);
    } else if (drag.mode === 'trimR') {
      var ne = snapT(tOf(p.x), ev), maxLen = Infinity;
      if (drag.kind !== 'midi') maxLen = o.reverse ? o.length + o.offset / o.rate : (o.srcDur - o.offset) / o.rate;
      v.length = clamp(ne - o.start, minLen, maxLen);
      if (drag.kind !== 'midi' && o.reverse) v.offset = Math.max(0, o.offset - (v.length - o.length) * o.rate);
      v.fadeOut = Math.min(o.fadeOut, v.length); v.fadeIn = Math.min(o.fadeIn, v.length - v.fadeOut);
    } else if (drag.mode === 'fadeIn') {
      v.fadeIn = clamp(tOf(p.x) - o.start, 0, o.length - o.fadeOut);
    } else if (drag.mode === 'fadeOut') {
      v.fadeOut = clamp(o.start + o.length - tOf(p.x), 0, o.length - o.fadeIn);
    }
    drag.view[drag.id] = v;
    if (drag.mode === 'move' || drag.mode === 'trimL' || drag.mode === 'trimR') say(fmtBars(v.start) + '   ' + fmtSecs(v.start) + '   length ' + v.length.toFixed(3) + ' s');
    else say('Fade ' + (drag.mode === 'fadeIn' ? 'in ' + v.fadeIn.toFixed(2) : 'out ' + v.fadeOut.toFixed(2)) + ' s');
    redraw();
  });
  function endDrag(ev, cancel) {
    if (!drag) return;
    var d = drag; drag = null;
    try { lanes.releasePointerCapture(ev.pointerId); } catch (e) {}
    lanes.style.cursor = 'default';
    if (!d.moved || cancel) { redraw(); return; }
    var v = d.view[d.id];
    try {
      if (d.mode === 'move') {
        batch('Move clips', function () {
          if (v.trackId !== d.orig.trackId || Math.abs(v.start - d.orig.start) > 1e-9) E.moveClip(d.id, v.trackId, v.start);
          d.others.forEach(function (x) { var w = d.view[x.id]; if (w && Math.abs(w.start - x.start) > 1e-9) E.moveClip(x.id, x.trackId, w.start); });
        });
        if (v.trackId !== d.orig.trackId) selectTrack(v.trackId);
      } else if (d.mode === 'trimL' || d.mode === 'trimR') {
        var patch = { start: v.start, length: v.length, fadeIn: v.fadeIn, fadeOut: v.fadeOut };
        if (d.kind === 'midi') { if (d.mode === 'trimL') patch.notes = v.notes; }
        else patch.offset = v.offset;
        E.updateClip(d.id, patch);
      } else if (d.mode === 'fadeIn' || d.mode === 'fadeOut') {
        E.updateClip(d.id, { fadeIn: v.fadeIn, fadeOut: v.fadeOut });
      }
    } catch (e) { console.error(e); toast(errText(e), true); }
    redraw();
  }
  lanes.addEventListener('pointerup', function (ev) { endDrag(ev, false); });
  lanes.addEventListener('pointercancel', function (ev) { endDrag(ev, true); });
  lanes.addEventListener('dblclick', function (ev) {
    var p = localXY(ev, lanes), h = hit(p.x, p.y);
    if (!h) return;
    if (h.clip) {
      if (h.clip.kind === 'midi') openPiano(h.track.id, h.clip.id);
      else openSpectral(h.clip.id);
      return;
    }
    if (h.track.type === 'midi') makeMidiClip(h.track.id, snapT(tOf(p.x), ev));
  });
  lanes.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
    var p = localXY(ev, lanes), h = hit(p.x, p.y);
    if (!h) return;
    selectTrack(h.track.id);
    if (!h.clip) {
      var at = snapT(tOf(p.x), ev);
      showMenu(ev.clientX, ev.clientY, h.track.type === 'midi'
        ? [{ label: 'Make a MIDI clip here', icon: 'plus', fn: function () { makeMidiClip(h.track.id, at); } }, { label: 'Plugins on this track...', icon: 'sliders', fn: function () { openFx(h.track.id); } }]
        : [{ label: 'Add audio files here...', icon: 'plus', fn: function () { cmd.addAudioFiles({ trackId: h.track.id, at: at }); } }, { label: 'Plugins on this track...', icon: 'sliders', fn: function () { openFx(h.track.id); } }]);
      return;
    }
    if (!S.sel.has(h.clip.id)) S.sel = new Set([h.clip.id]);
    redraw();
    clipMenu(ev.clientX, ev.clientY, h.track, h.clip);
  });
  function clipMenu(x, y, t, c) {
    var audio = c.kind !== 'midi';
    showMenu(x, y, [
      { hdr: c.name || (audio ? 'Audio clip' : 'MIDI clip') },
      { label: 'Split at playhead', key: 'S', fn: cmd.split },
      { label: 'Duplicate', key: 'Ctrl+D', fn: cmd.duplicate },
      { label: 'Delete', key: 'Del', icon: 'trash', fn: cmd.del },
      { sep: 1 },
      { label: 'Reverse', off: !audio, check: !!c.reverse, fn: function () { E.updateClip(c.id, { reverse: !c.reverse }); say(c.reverse ? 'Clip plays forwards again.' : 'Clip reversed.'); } },
      { label: 'Normalize (set gain to peak)', off: !audio, fn: function () { normalizeClip(c.id); } },
      { label: 'Time stretch...', off: !audio, fn: function () { openStretch(c.id); } },
      { label: 'Rename...', fn: function () { openRename('Rename clip', c.name || '', function (n) { E.updateClip(c.id, { name: n }); }); } },
      { sep: 1 },
      { label: 'Spectral repair', icon: 'wave', off: !audio, fn: function () { openSpectral(c.id); } },
      { label: 'Open in piano roll', icon: 'keys', off: audio, fn: function () { openPiano(t.id, c.id); } }
    ]);
  }
  function makeMidiClip(trackId, at) {
    var len = barSec();
    var c = E.addClip(trackId, { id: uid('c'), kind: 'midi', name: 'MIDI', start: Math.max(0, at || 0), length: len, notes: [] });
    if (c && c.id) { S.sel = new Set([c.id]); openPiano(trackId, c.id); }
    say('Empty MIDI clip made. Click in the piano roll to add notes.');
    return c;
  }
  function normalizeClip(id) {
    var r = findClip(id); if (!r) return;
    var c = r.clip, src = E.sources && E.sources.get(c.srcId);
    if (!src || !src.buffer) { toast('The audio for this clip is missing', true); return; }
    var b = src.buffer, sr = b.sampleRate, rate = +c.rate || 1;
    var s0 = Math.max(0, Math.floor((c.offset || 0) * sr)), s1 = Math.min(b.length, Math.ceil(((c.offset || 0) + c.length * rate) * sr)), peak = 0;
    for (var ch = 0; ch < b.numberOfChannels; ch++) { var d = b.getChannelData(ch); for (var i = s0; i < s1; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a; } }
    if (peak <= 1e-6) { toast('This clip is silent'); return; }
    var g = Math.pow(10, -0.1 / 20) / peak;
    E.updateClip(id, { gain: g });
    say('Clip gain set to ' + fmtDb(20 * Math.log10(g)) + ' so the loudest point is at -0.1 dB.');
  }

  /* wheel: Ctrl zooms around the mouse, Shift or a sideways swipe scrolls the time line */
  function onWheel(ev) {
    var p = localXY(ev, ev.currentTarget);
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); zoomAt(ev.deltaY < 0 ? 1.2 : 1 / 1.2, p.x); return; }
    var dx = ev.shiftKey ? (ev.deltaY || ev.deltaX) : ev.deltaX;
    if (dx) { ev.preventDefault(); S.x0 = Math.max(0, S.x0 + dx / S.pps); syncScroll(); redraw(); updPlayhead(); }
  }
  lanes.addEventListener('wheel', onWheel, { passive: false });
  ruler.addEventListener('wheel', onWheel, { passive: false });

  /* ruler: click to seek, drag to set the loop region */
  ruler.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return;
    var p = localXY(ev, ruler);
    rulerDrag = { cx: ev.clientX, t0: tOf(p.x), moved: false };
    try { ruler.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  ruler.addEventListener('pointermove', function (ev) {
    if (!rulerDrag) return;
    if (!rulerDrag.moved && Math.abs(ev.clientX - rulerDrag.cx) < 4) return;
    rulerDrag.moved = true;
    var t = tOf(localXY(ev, ruler).x), a = snapT(Math.min(t, rulerDrag.t0), ev), b = snapT(Math.max(t, rulerDrag.t0), ev);
    S.loopPrev = { on: true, start: a, end: Math.max(b, a + 0.01) };
    say('Loop ' + fmtSecs(a) + ' to ' + fmtSecs(b)); redraw();
  });
  ruler.addEventListener('pointerup', function (ev) {
    if (!rulerDrag) return;
    var r = rulerDrag; rulerDrag = null;
    try { ruler.releasePointerCapture(ev.pointerId); } catch (e) {}
    if (r.moved && S.loopPrev) {
      var l = S.loopPrev; S.loopPrev = null;
      if (l.end - l.start > 0.02) { E.setLoop({ on: true, start: l.start, end: l.end }); say('Loop set from ' + fmtSecs(l.start) + ' to ' + fmtSecs(l.end) + '.'); }
      syncTransport(); redraw(); return;
    }
    E.seek(Math.max(0, r.t0)); updPlayhead(); updClock();
  });
  ruler.addEventListener('pointercancel', function () { rulerDrag = null; S.loopPrev = null; redraw(); });

  /* ------------------------------------------------------------------ track headers */
  var headEls = new Map();
  function selectTrack(id) {
    if (S.selTrack === id) return;
    S.selTrack = id; renderHeads(); renderMixer(); redraw();
  }
  function makeHead(t) {
    var id = t.id, el = mk('div', 'th'); el.dataset.id = id; el.dataset.type = t.type;
    el.innerHTML =
      '<button class="tc" type="button" title="Track colour" aria-label="Track colour"></button>' +
      '<div class="r1"><span class="tn"></span><input class="nm" type="text" spellcheck="false" maxlength="60" aria-label="Track name">' +
      '<button class="fxb" type="button" title="Plugins (effects) on this track">FX</button></div>' +
      '<div class="r2"><button class="tg m" type="button" title="Mute" aria-pressed="false">M</button><button class="tg s" type="button" title="Solo" aria-pressed="false">S</button><button class="tg r" type="button" title="Arm for recording" aria-pressed="false">R</button>' +
      (t.type === 'midi'
        ? '<select class="ins" title="Instrument" aria-label="Instrument"></select><button class="ib xs pr" type="button" title="Open the piano roll" aria-label="Open the piano roll">' + ic('keys', 'xs') + '</button>'
        : '<span class="kind">Audio</span>') +
      '</div>' +
      '<div class="r3"><input class="vol" type="range" min="-60" max="12" step="0.1" title="Volume (double click for 0 dB)" aria-label="Volume"><span class="vv"></span><input class="pan" type="range" min="-1" max="1" step="0.01" title="Pan (double click for centre)" aria-label="Pan"></div>';
    var q = function (s) { return el.querySelector(s); };
    var tr = function () { return findTrack(id); };
    el.addEventListener('pointerdown', function () { selectTrack(id); });
    el.addEventListener('contextmenu', function (ev) {
      ev.preventDefault(); selectTrack(id);
      showMenu(ev.clientX, ev.clientY, [
        { label: 'Rename...', fn: function () { openRename('Rename track', (tr() || {}).name || '', function (n) { E.updateTrack(id, { name: n }); }); } },
        { label: 'Change colour...', fn: function () { pickColor(id); } },
        { label: 'Plugins...', icon: 'sliders', fn: function () { openFx(id); } },
        { label: 'Move up', icon: 'up', fn: function () { moveTrackBy(id, -1); } },
        { label: 'Move down', icon: 'down', fn: function () { moveTrackBy(id, 1); } },
        { sep: 1 },
        { label: 'Remove track', icon: 'trash', fn: function () { S.selTrack = id; cmd.removeTrack(); } }
      ]);
    });
    q('.tc').onclick = function () { pickColor(id); };
    var nm = q('.nm');
    nm.addEventListener('change', function () { var v = nm.value.trim(); if (v && tr() && v !== tr().name) E.updateTrack(id, { name: v }); else if (tr()) nm.value = tr().name; });
    nm.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Escape') { if (e.key === 'Escape' && tr()) nm.value = tr().name; nm.blur(); } });
    q('.fxb').onclick = function () { openFx(id); };
    q('.m').onclick = function () { var t2 = tr(); if (t2) E.updateTrack(id, { mute: !t2.mute }); };
    q('.s').onclick = function () { var t2 = tr(); if (t2) E.updateTrack(id, { solo: !t2.solo }); };
    q('.r').onclick = function () { var t2 = tr(); if (t2) E.updateTrack(id, { arm: !t2.arm }); };
    var vol = q('.vol'), pan = q('.pan');
    vol.addEventListener('input', function () { E.updateTrack(id, { gain: dbToGain(+vol.value) }); q('.vv').textContent = fmtDb(+vol.value); });
    vol.addEventListener('dblclick', function () { E.updateTrack(id, { gain: 1 }); });
    pan.addEventListener('input', function () { E.updateTrack(id, { pan: +pan.value }); });
    pan.addEventListener('dblclick', function () { E.updateTrack(id, { pan: 0 }); });
    if (t.type === 'midi') {
      var ins = q('.ins');
      fillInstruments(ins);
      ins.addEventListener('change', function () { E.updateTrack(id, { instrument: { type: ins.value, params: {} } }); ins.blur(); say('Instrument changed to ' + ins.options[ins.selectedIndex].textContent + '.'); });
      q('.pr').onclick = function () { openPiano(id); };
    }
    return el;
  }
  function fillInstruments(sel) {
    sel.innerHTML = '';
    var inst = hasMidi() && AMr.Midi.instruments;
    if (!inst) { var o = mk('option'); o.value = ''; o.textContent = 'No instruments'; sel.appendChild(o); sel.disabled = true; sel.title = 'The MIDI part did not load, so MIDI tracks are silent'; return; }
    Object.keys(inst).forEach(function (k) { var o = mk('option'); o.value = k; o.textContent = inst[k].name || k; sel.appendChild(o); });
  }
  function updHead(el, t, i) {
    el.classList.toggle('sel', t.id === S.selTrack);
    el.style.setProperty('--c', t.color || '#555');
    var q = function (s) { return el.querySelector(s); };
    q('.tn').textContent = i + 1;
    var nm = q('.nm'); if (document.activeElement !== nm) nm.value = t.name || '';
    var fx = (t.fx || []).length, fb = q('.fxb'); fb.textContent = fx ? 'FX ' + fx : 'FX'; fb.classList.toggle('has', !!fx);
    q('.m').setAttribute('aria-pressed', String(!!t.mute));
    q('.s').setAttribute('aria-pressed', String(!!t.solo));
    q('.r').setAttribute('aria-pressed', String(!!t.arm));
    var db = gainToDb(t.gain == null ? 1 : +t.gain), vol = q('.vol'), pan = q('.pan');
    if (document.activeElement !== vol) vol.value = db;
    q('.vv').textContent = fmtDb(db);
    if (document.activeElement !== pan) pan.value = t.pan || 0;
    pan.title = 'Pan ' + panText(t.pan || 0) + ' (double click for centre)';
    if (t.type === 'midi') { var ins = q('.ins'); if (document.activeElement !== ins && t.instrument && t.instrument.type) ins.value = t.instrument.type; }
  }
  function panText(p) { return Math.abs(p) < 0.005 ? 'centre' : Math.round(Math.abs(p) * 100) + '% ' + (p < 0 ? 'left' : 'right'); }
  function renderHeads() {
    var host = $('heads'), ts = tracks(), seen = new Set();
    ts.forEach(function (t, i) {
      var el = headEls.get(t.id);
      if (!el || el.dataset.type !== t.type) { if (el) el.remove(); el = makeHead(t); headEls.set(t.id, el); }
      seen.add(t.id);
      if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null);
      updHead(el, t, i);
    });
    headEls.forEach(function (el, id) { if (!seen.has(id)) { el.remove(); headEls.delete(id); } });
  }
  var colorFor = null;
  function pickColor(id) { var t = findTrack(id); if (!t) return; colorFor = id; var c = $('f-color'); c.value = /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : '#4c8dff'; c.click(); }
  $('f-color').addEventListener('input', function () { if (colorFor) E.updateTrack(colorFor, { color: this.value }); });
  $('f-color').addEventListener('change', function () { colorFor = null; });

  /* ------------------------------------------------------------------ mixer */
  var stripEls = new Map();
  function fxName(fx) { var d = AMr.FX && AMr.FX[fx.type]; return (d && d.name) || fx.type; }
  function addFxMenu(btn, target) {
    var defs = AMr.FX || {};
    var keys = Object.keys(defs);
    if (!keys.length) { toast('No built-in plugins are available', true); return; }
    menuAt(btn, [{ hdr: 'Add plugin' }].concat(keys.map(function (k) {
      return { label: defs[k].name || k, fn: function () { var fx = E.addFx(target, k); say((defs[k].name || k) + ' added.'); if (fx && fx.id && $('dlg-fx').open && S.fxTarget === target) setTimeout(function () { var u = $('fx-rack').querySelector('[data-fx="' + fx.id + '"]'); if (u && u.scrollIntoView) u.scrollIntoView({ block: 'nearest' }); }, 0); } };
    })));
  }
  function makeStrip(id) {
    var master = id === 'master';
    var el = mk('div', 'ms' + (master ? ' master' : '')); el.dataset.id = id;
    el.innerHTML =
      '<div class="mn"></div>' +
      '<div class="slots"></div>' +
      '<input class="pan" type="range" min="-1" max="1" step="0.01" aria-label="Pan"' + (master ? ' style="visibility:hidden" tabindex="-1"' : '') + '>' +
      '<div class="mid"><div class="meter"><div><i></i></div><div><i></i></div></div><input class="fad" type="range" min="-60" max="12" step="0.1" aria-label="Volume" title="Volume (double click for 0 dB)"></div>' +
      '<div class="mdb"></div>' +
      '<div class="mbt">' + (master ? '<button class="fxb" type="button" title="Plugins on the master">FX</button>' : '<button class="tg m" type="button" title="Mute" aria-pressed="false">M</button><button class="tg s" type="button" title="Solo" aria-pressed="false">S</button><button class="fxb" type="button" title="Plugins on this track">FX</button>') + '</div>' +
      '<div class="mcol"></div>';
    var q = function (s) { return el.querySelector(s); };
    var fad = q('.fad'), pan = q('.pan');
    fad.addEventListener('input', function () { var g = dbToGain(+fad.value); if (master) setMasterGain(g); else E.updateTrack(id, { gain: g }); q('.mdb').textContent = fmtDb(+fad.value); });
    fad.addEventListener('dblclick', function () { if (master) setMasterGain(1); else E.updateTrack(id, { gain: 1 }); });
    if (!master) {
      pan.addEventListener('input', function () { E.updateTrack(id, { pan: +pan.value }); });
      pan.addEventListener('dblclick', function () { E.updateTrack(id, { pan: 0 }); });
      q('.m').onclick = function () { var t = findTrack(id); if (t) E.updateTrack(id, { mute: !t.mute }); };
      q('.s').onclick = function () { var t = findTrack(id); if (t) E.updateTrack(id, { solo: !t.solo }); };
      el.addEventListener('pointerdown', function (e) { if (!e.target.closest('.slots')) selectTrack(id); });
    }
    q('.fxb').onclick = function () { openFx(id); };
    return el;
  }
  function setMasterGain(g) {
    /* the contract has no master setter; prefer one if the engine adds it, else updateTrack('master') */
    try {
      if (typeof E.updateMaster === 'function') { E.updateMaster({ gain: g }); return; }
      E.updateTrack('master', { gain: g });
    } catch (e) {
      P().master = P().master || { gain: 1, fx: [] }; P().master.gain = g;
      try { E.emit('change', { reason: 'master gain' }); } catch (e2) {}
    }
  }
  function renderSlots(host, target, chain) {
    var sig = chain.map(function (f) { return f.id + (f.on === false ? '0' : '1'); }).join(',');
    if (host.dataset.sig === sig) return;
    host.dataset.sig = sig; host.innerHTML = '';
    chain.forEach(function (fx) {
      var s = mk('div', 'slot' + (fx.on === false ? ' off' : ''));
      s.innerHTML = '<button class="pw" type="button" title="Turn on or off (bypass)" aria-label="Bypass"></button><button class="sn" type="button" title="Open the plugin"></button><button class="sx" type="button" title="Remove" aria-label="Remove">' + ic('x', 'xs') + '</button>';
      s.querySelector('.sn').textContent = fxName(fx);
      s.querySelector('.pw').onclick = function () { E.updateFx(target, fx.id, { on: fx.on === false }); };
      s.querySelector('.sn').onclick = function () { openFx(target, fx.id); };
      s.querySelector('.sx').onclick = function () { E.removeFx(target, fx.id); };
      host.appendChild(s);
    });
    var add = mk('button', 'addslot', '+ Add'); add.type = 'button'; add.title = 'Add a plugin';
    add.onclick = function () { addFxMenu(add, target); };
    host.appendChild(add);
  }
  function updStrip(el, t, master) {
    var q = function (s) { return el.querySelector(s); };
    var g = master ? ((P().master && P().master.gain) == null ? 1 : +P().master.gain) : (t.gain == null ? 1 : +t.gain);
    var db = gainToDb(g), fad = q('.fad');
    q('.mn').textContent = master ? 'Master' : (t.name || 'Track');
    q('.mn').title = master ? 'Master output' : (t.name || '');
    if (document.activeElement !== fad) fad.value = db;
    q('.mdb').textContent = fmtDb(db);
    q('.mcol').style.setProperty('--c', master ? '#ff5b52' : (t.color || '#555'));
    var chain = master ? ((P().master && P().master.fx) || []) : (t.fx || []);
    renderSlots(q('.slots'), master ? 'master' : t.id, chain);
    var fb = q('.fxb'); fb.textContent = chain.length ? 'FX ' + chain.length : 'FX'; fb.classList.toggle('has', !!chain.length);
    if (!master) {
      el.classList.toggle('sel', t.id === S.selTrack);
      var pan = q('.pan'); if (document.activeElement !== pan) pan.value = t.pan || 0; pan.title = 'Pan ' + panText(t.pan || 0);
      q('.m').setAttribute('aria-pressed', String(!!t.mute)); q('.s').setAttribute('aria-pressed', String(!!t.solo));
    }
  }
  function renderMixer() {
    var host = $('mixer'), ts = tracks(), seen = new Set();
    ts.forEach(function (t, i) {
      var el = stripEls.get(t.id);
      if (!el) { el = makeStrip(t.id); stripEls.set(t.id, el); }
      seen.add(t.id);
      if (host.children[i] !== el) host.insertBefore(el, host.children[i] || null);
      updStrip(el, t, false);
    });
    var m = stripEls.get('master'); if (!m) { m = makeStrip('master'); stripEls.set('master', m); }
    seen.add('master'); host.appendChild(m); updStrip(m, null, true);
    stripEls.forEach(function (el, id) { if (!seen.has(id)) { el.remove(); stripEls.delete(id); } });
  }
  /* meters: polled about 20 times a second, only while playing or recording */
  var meterTimer = 0;
  function meterPct(db) { return !isFinite(db) ? 0 : clamp((db + 60) / 66 * 100, 0, 100); }
  function setMeter(el, lv) {
    var is = el.querySelectorAll('.meter i');
    if (is.length < 2) return;
    is[0].style.height = (100 - meterPct(lv ? lv.l : -Infinity)) + '%';
    is[1].style.height = (100 - meterPct(lv ? lv.r : -Infinity)) + '%';
  }
  function readLevel(id) { try { return E.level(id); } catch (e) { return null; } }
  function pollMeters() {
    var active = playing() || S.recording || S.midiRec;
    var showMixer = S.dockOpen && S.tab === 'mixer';
    stripEls.forEach(function (el, id) { setMeter(el, active && showMixer ? readLevel(id) : null); });
    var ml = active ? readLevel('master') : null;
    $('tm-l').style.width = (100 - meterPct(ml ? ml.l : -Infinity)) + '%';
    $('tm-r').style.width = (100 - meterPct(ml ? ml.r : -Infinity)) + '%';
    if (!active) { clearInterval(meterTimer); meterTimer = 0; }
  }
  function startMeters() { if (!meterTimer) meterTimer = setInterval(pollMeters, 50); }

  /* ------------------------------------------------------------------ plugin rack (FX window and mastering tab) */
  function fxChain(target) { if (target === 'master') return (P().master && P().master.fx) || []; var t = findTrack(target); return (t && t.fx) || []; }
  function isLog(p) { return /hz/i.test(p.unit || '') && p.min > 0 && p.max / p.min >= 50; }
  function toSlider(p, v) { return isLog(p) ? Math.round(Math.log(v / p.min) / Math.log(p.max / p.min) * 1000) : v; }
  function fromSlider(p, s) {
    if (!isLog(p)) return +s;
    var v = p.min * Math.pow(p.max / p.min, s / 1000), st = +p.step || 0;
    if (st > 0) v = Math.round(v / st) * st;
    return clamp(v, p.min, p.max);
  }
  function fmtParam(p, v) {
    v = +v; var u = p.unit || '', st = +p.step || 0.01;
    if (/^hz$/i.test(u) && v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' kHz';
    var dec = st >= 1 ? 0 : st >= 0.1 ? 1 : st >= 0.01 ? 2 : 3;
    return v.toFixed(dec) + (u ? ' ' + u : '');
  }
  function paramRow(p, value, onSet) {
    var row = mk('label', 'pr');
    var mn = isLog(p) ? 0 : p.min, mx = isLog(p) ? 1000 : p.max, st = isLog(p) ? 1 : (p.step || 'any');
    row.innerHTML = '<span></span><input type="range"><output></output>';
    row.querySelector('span').textContent = p.label || p.key;
    row.title = (p.label || p.key) + ' (double click to reset)';
    var r = row.querySelector('input'), out = row.querySelector('output');
    r.min = mn; r.max = mx; r.step = st; r.dataset.key = p.key;
    r.value = toSlider(p, value); out.textContent = fmtParam(p, value);
    r.addEventListener('input', function () { var v = fromSlider(p, +r.value); out.textContent = fmtParam(p, v); onSet(p.key, v); });
    r.addEventListener('dblclick', function () { var v = p.def != null ? p.def : p.min; r.value = toSlider(p, v); out.textContent = fmtParam(p, v); onSet(p.key, v); });
    row._p = p; row._r = r; row._o = out;
    return row;
  }
  function paramValue(fx, p) { var v = fx.params && fx.params[p.key]; return v == null ? (p.def != null ? p.def : p.min) : v; }
  function renderRack(host, target) {
    var chain = fxChain(target);
    var sig = target + '|' + chain.map(function (f) { return f.id + ':' + f.type + ':' + (f.on === false ? 0 : 1); }).join(',');
    if (host.dataset.sig === sig) {
      chain.forEach(function (fx) {
        var u = host.querySelector('[data-fx="' + fx.id + '"]'); if (!u) return;
        u.querySelectorAll('.pr').forEach(function (row) {
          if (document.activeElement === row._r) return;
          var v = paramValue(fx, row._p); row._r.value = toSlider(row._p, v); row._o.textContent = fmtParam(row._p, v);
        });
      });
      return;
    }
    host.dataset.sig = sig; host.innerHTML = '';
    if (!chain.length) { host.appendChild(mk('div', 'rk-empty', 'No plugins yet. Use Add plugin to put one in.')); return; }
    chain.forEach(function (fx, i) {
      var def = AMr.FX && AMr.FX[fx.type];
      var u = mk('div', 'unit' + (fx.on === false ? ' off' : '')); u.dataset.fx = fx.id;
      u.innerHTML = '<div class="uh"><span class="gr" draggable="true" title="Drag to change the order">' + ic('grip', 'sm') + '</span>' +
        '<button class="pwr" type="button" aria-label="On or off" title="Turn on or off (bypass)">' + ic('power', 'xs') + '</button>' +
        '<span class="un"></span>' +
        '<button class="ib xs up" type="button" title="Move up" aria-label="Move up">' + ic('up', 'xs') + '</button>' +
        '<button class="ib xs dn" type="button" title="Move down" aria-label="Move down">' + ic('down', 'xs') + '</button>' +
        '<button class="ib xs rm" type="button" title="Remove this plugin" aria-label="Remove">' + ic('trash', 'xs') + '</button></div><div class="ub"></div>';
      u.querySelector('.un').innerHTML = esc((def && def.name) || fx.type) + '<small>' + (i + 1) + ' of ' + chain.length + (fx.on === false ? ', bypassed' : '') + '</small>';
      var pw = u.querySelector('.pwr'); pw.setAttribute('aria-pressed', String(fx.on !== false));
      pw.onclick = function () { E.updateFx(target, fx.id, { on: fx.on === false }); };
      var up = u.querySelector('.up'), dn = u.querySelector('.dn');
      up.disabled = i === 0; dn.disabled = i === chain.length - 1;
      up.onclick = function () { E.moveFx(target, fx.id, i - 1); };
      dn.onclick = function () { E.moveFx(target, fx.id, i + 1); };
      u.querySelector('.rm').onclick = function () { E.removeFx(target, fx.id); say(((def && def.name) || fx.type) + ' removed.'); };
      var body = u.querySelector('.ub');
      if (!def) body.appendChild(mk('p', 'help', 'This plugin type is not available in this version.'));
      else (def.params || []).forEach(function (p) {
        body.appendChild(paramRow(p, paramValue(fx, p), function (key, v) { var o = {}; o[key] = v; E.updateFx(target, fx.id, { params: o }); }));
      });
      var gr = u.querySelector('.gr');
      gr.addEventListener('dragstart', function (e) { try { e.dataTransfer.setData('text/plain', fx.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(u, 20, 14); } catch (x) {} host._dragFx = fx.id; });
      gr.addEventListener('dragend', function () { host._dragFx = null; host.querySelectorAll('.over').forEach(function (x) { x.classList.remove('over'); }); });
      u.addEventListener('dragover', function (e) { if (!host._dragFx) return; e.preventDefault(); u.classList.add('over'); });
      u.addEventListener('dragleave', function () { u.classList.remove('over'); });
      u.addEventListener('drop', function (e) { if (!host._dragFx) return; e.preventDefault(); e.stopPropagation(); u.classList.remove('over'); var from = host._dragFx; host._dragFx = null; if (from !== fx.id) E.moveFx(target, from, i); });
      host.appendChild(u);
    });
  }
  function renderInstrument(host, t) {
    host.innerHTML = '';
    if (!t || t.type !== 'midi') { host.hidden = true; return; }
    host.hidden = false;
    var box = mk('div', 'instbox');
    var insts = hasMidi() && AMr.Midi.instruments;
    if (!insts) { box.innerHTML = '<div class="uh"><span class="un">Instrument</span></div><div class="ub"><p class="help">The MIDI part did not load, so this track has no instrument right now.</p></div>'; host.appendChild(box); return; }
    var spec = t.instrument || { type: Object.keys(insts)[0], params: {} }, def = insts[spec.type];
    box.innerHTML = '<div class="uh"><span class="gr">' + ic('keys', 'sm') + '</span><span class="un">Instrument</span><select aria-label="Instrument"></select></div><div class="ub"></div>';
    var sel = box.querySelector('select'); fillInstruments(sel); sel.value = spec.type;
    sel.onchange = function () { E.updateTrack(t.id, { instrument: { type: sel.value, params: {} } }); };
    var body = box.querySelector('.ub');
    ((def && def.params) || []).forEach(function (p) {
      var v = spec.params && spec.params[p.key]; if (v == null) v = p.def != null ? p.def : p.min;
      body.appendChild(paramRow(p, v, function (key, val) {
        var cur = findTrack(t.id); if (!cur) return;
        var sp = cur.instrument || spec, np = Object.assign({}, sp.params || {}); np[key] = val;
        E.updateTrack(t.id, { instrument: { type: sp.type, params: np } });
      }));
    });
    if (!body.children.length) body.appendChild(mk('p', 'help', 'This instrument has no settings.'));
    host.appendChild(box);
    host.dataset.sig = t.id + ':' + spec.type;
  }
  function openFx(target, focusId) {
    if (target !== 'master' && !findTrack(target)) return;
    S.fxTarget = target;
    var rack = $('fx-rack'); rack.dataset.sig = '';
    renderFxDialog(true);
    openDlg($('dlg-fx'));
    if (focusId) { var u = rack.querySelector('[data-fx="' + focusId + '"]'); if (u && u.scrollIntoView) u.scrollIntoView({ block: 'nearest' }); }
  }
  function renderFxDialog(full) {
    var target = S.fxTarget, t = target === 'master' ? null : findTrack(target);
    if (target !== 'master' && !t) { closeDlg($('dlg-fx')); return; }
    $('fx-title').textContent = 'Plugins on ' + (t ? t.name : 'the master');
    var ih = $('fx-inst');
    var spec = t && t.instrument, isig = t && t.type === 'midi' ? t.id + ':' + (spec && spec.type) : '';
    if (full || ih.dataset.sig !== isig) { ih.dataset.sig = isig; renderInstrument(ih, t); }
    renderRack($('fx-rack'), target);
  }
  $('fx-add').onclick = function () { addFxMenu($('fx-add'), S.fxTarget); };
  $('dlg-fx').addEventListener('close', function () { S.fxTarget = null; });

  /* ------------------------------------------------------------------ bottom dock */
  var dock = $('dock');
  function applyDock() {
    S.dockH = clamp(S.dockH, 120, Math.max(140, window.innerHeight - 220));
    document.documentElement.style.setProperty('--dockh', S.dockH + 'px');
    dock.classList.toggle('shut', !S.dockOpen);
    $('dock-toggle').querySelector('svg').style.transform = S.dockOpen ? '' : 'rotate(180deg)';
  }
  function setDockOpen(open) { S.dockOpen = open; store('am_dockopen', open); applyDock(); setTimeout(resize, 0); }
  $('dock-toggle').onclick = function () { setDockOpen(!S.dockOpen); };
  (function () {
    var g = $('grip'), sy = 0, sh = 0, on = false;
    g.addEventListener('pointerdown', function (e) { on = true; sy = e.clientY; sh = S.dockOpen ? S.dockH : 120; if (!S.dockOpen) { S.dockOpen = true; } try { g.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
    g.addEventListener('pointermove', function (e) { if (!on) return; S.dockH = sh + (sy - e.clientY); applyDock(); });
    g.addEventListener('pointerup', function () { if (!on) return; on = false; store('am_dockh', S.dockH); store('am_dockopen', true); resize(); refreshDockView(); });
  })();
  document.querySelectorAll('.dtabs [data-tab]').forEach(function (b) { b.onclick = function () { showTab(b.dataset.tab); }; });
  function showTab(name, keepClosed) {
    S.tab = name;
    if (!S.dockOpen && !keepClosed) setDockOpen(true);
    document.querySelectorAll('.dtabs [data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === name)); });
    ['mixer', 'piano', 'spectral', 'master'].forEach(function (n) { $('pane-' + n).hidden = n !== name; });
    if (name === 'piano' && !prOpen) openPiano();
    if (name === 'spectral' && !spOpen) openSpectral();
    if (name === 'master') renderMastering();
    if (name === 'mixer') { renderMixer(); if (playing()) startMeters(); }
    refreshDockView();
  }
  function refreshDockView() {
    try {
      if (S.tab === 'piano' && pr && prOpen && typeof pr.refresh === 'function') pr.refresh();
      if (S.tab === 'spectral' && sv && spOpen && typeof sv.refresh === 'function') sv.refresh();
    } catch (e) { console.error(e); }
  }

  /* piano roll */
  var pr = null, prOpen = null, prSig = '';
  function prEmpty(kind) {
    $('pr-host').hidden = true; $('pr-empty').hidden = false;
    var missing = kind === 'missing';
    $('pr-empty-t').textContent = missing ? 'The piano roll is not available' : 'No MIDI clip open';
    $('pr-empty-d').textContent = missing ? 'The MIDI part of this tool did not load. Reload the page to try again. Your MIDI clips are still kept in the project.' : 'Add a MIDI track, then double click its lane to make a clip. Or use the button below.';
    $('pr-make').hidden = missing;
  }
  function firstMidiClip(trackId) {
    var sel = Array.from(S.sel).map(findClip).filter(function (r) { return r && r.clip.kind === 'midi' && (!trackId || r.track.id === trackId); })[0];
    if (sel) return sel;
    var ts = trackId ? [findTrack(trackId)].filter(Boolean) : [findTrack(S.selTrack)].filter(Boolean).concat(tracks());
    for (var i = 0; i < ts.length; i++) {
      if (ts[i].type !== 'midi') continue;
      var cs = ts[i].clips || [];
      for (var j = 0; j < cs.length; j++) if (cs[j].kind === 'midi') return { track: ts[i], clip: cs[j] };
    }
    return null;
  }
  function clipSig(c) { return c ? c.id + ':' + c.start + ':' + c.length + ':' + (c.notes ? JSON.stringify(c.notes) : '') + ':' + (c.srcId || '') + ':' + (c.offset || 0) : ''; }
  function openPiano(trackId, clipId) {
    if (S.tab !== 'piano' || !S.dockOpen) { S.tab = 'piano'; prOpen = prOpen || { pending: true }; showTab('piano'); if (prOpen && prOpen.pending) prOpen = null; }
    var r = clipId ? findClip(clipId) : firstMidiClip(trackId);
    if (!r || r.clip.kind !== 'midi') { prOpen = null; prEmpty('none'); return; }
    if (!hasMidi() || typeof AMr.Midi.PianoRoll !== 'function') { prOpen = null; prEmpty('missing'); return; }
    $('pr-empty').hidden = true; $('pr-host').hidden = false;
    try {
      if (!pr) pr = new AMr.Midi.PianoRoll($('pr-host'), E);
      pr.open(r.track.id, r.clip.id);
      prOpen = { trackId: r.track.id, clipId: r.clip.id }; prSig = clipSig(r.clip);
      say('Editing "' + (r.clip.name || 'MIDI') + '" in the piano roll.');
    } catch (e) { console.error(e); prOpen = null; prEmpty('missing'); toast('The piano roll could not open. ' + errText(e), true); }
  }
  $('pr-make').onclick = function () {
    var t = findTrack(S.selTrack); if (!t || t.type !== 'midi') t = tracks().filter(function (x) { return x.type === 'midi'; })[0];
    if (!t) t = cmd.addTrack('midi');
    if (t && t.id) makeMidiClip(t.id, snapT(now()));
  };

  /* spectral view */
  var sv = null, spOpen = null, spSig = '';
  function spEmpty(kind) {
    $('sp-host').hidden = true; $('sp-empty').hidden = false;
    var missing = kind === 'missing';
    $('sp-empty-t').textContent = missing ? 'The spectral view is not available' : 'No audio clip open';
    $('sp-empty-d').textContent = missing ? 'The spectral part of this tool did not load. Reload the page to try again.' : 'Double click an audio clip to see its sound as a picture and repair noise, hum and clicks.';
  }
  function openSpectral(clipId) {
    if (S.tab !== 'spectral' || !S.dockOpen) { spOpen = spOpen || { pending: true }; showTab('spectral'); if (spOpen && spOpen.pending) spOpen = null; }
    var r = clipId ? findClip(clipId) : null;
    if (!r) { var s = Array.from(S.sel).map(findClip).filter(function (x) { return x && x.clip.kind !== 'midi'; })[0]; r = s || null; }
    if (!r || r.clip.kind === 'midi') { spOpen = null; spEmpty('none'); return; }
    if (!hasSpectral() || typeof AMr.Spectral.View !== 'function') { spOpen = null; spEmpty('missing'); return; }
    $('sp-empty').hidden = true; $('sp-host').hidden = false;
    try {
      if (!sv) sv = new AMr.Spectral.View($('sp-host'), E);
      sv.open(r.clip.id);
      spOpen = { clipId: r.clip.id }; spSig = clipSig(r.clip);
      say('Spectral view of "' + (r.clip.name || 'Audio') + '". Drag a box over a sound to select it.');
    } catch (e) { console.error(e); spOpen = null; spEmpty('missing'); toast('The spectral view could not open. ' + errText(e), true); }
  }
  function checkDockClips() {
    if (prOpen) {
      var r = findClip(prOpen.clipId);
      if (!r) { try { pr && pr.close && pr.close(); } catch (e) {} prOpen = null; prEmpty('none'); }
      else { var s = clipSig(r.clip); if (s !== prSig) { prSig = s; prOpen.trackId = r.track.id; if (S.tab === 'piano') refreshDockView(); } }
    }
    if (spOpen) {
      var q = findClip(spOpen.clipId);
      if (!q) { try { sv && sv.close && sv.close(); } catch (e) {} spOpen = null; spEmpty('none'); }
      else { var s2 = clipSig(q.clip); if (s2 !== spSig) { spSig = s2; if (S.tab === 'spectral' && sv && sv.refresh) { try { sv.refresh(); } catch (e) { console.error(e); } } } }
    }
  }

  /* mastering */
  var PRESETS = [['Streaming', -14], ['YouTube', -14], ['Apple Music', -16], ['Podcast', -16], ['Club', -9]];
  (function () {
    var host = $('ms-presets');
    PRESETS.forEach(function (p) {
      var b = mk('button', 'b sm'); b.type = 'button'; b.textContent = p[0] + ' ' + p[1]; b.title = p[0] + ': ' + p[1] + ' LUFS';
      b.onclick = function () { S.target = p[1]; S.presetName = p[0]; $('ms-target').value = p[1]; syncPresets(); store('am_target', S.target); showLoudNote(); };
      b.dataset.v = p[1]; b.dataset.n = p[0]; host.appendChild(b);
    });
    var st = store('am_target'); if (typeof st === 'number') S.target = st;
    var m = store('am_match'); if (typeof m === 'boolean') S.match = m;
    $('ms-target').value = S.target; $('ms-match').checked = S.match;
    syncPresets();
  })();
  function syncPresets() {
    document.querySelectorAll('#ms-presets button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.v === S.target && (!S.presetName || S.presetName === b.dataset.n))); });
  }
  $('ms-target').addEventListener('change', function () { var v = parseFloat(this.value); if (!isFinite(v)) v = -14; S.target = clamp(v, -30, -5); this.value = S.target; S.presetName = null; syncPresets(); store('am_target', S.target); showLoudNote(); });
  $('ms-ceil').addEventListener('change', function () { var v = parseFloat(this.value); if (!isFinite(v)) v = -1; S.ceiling = clamp(v, -6, 0); this.value = S.ceiling; });
  $('ms-match').addEventListener('change', function () { S.match = this.checked; store('am_match', S.match); });
  $('ms-add').onclick = function () { addFxMenu($('ms-add'), 'master'); };
  function renderMastering() { renderRack($('ms-rack'), 'master'); }
  var lastLoud = null;
  function showLoudNote() {
    var n = $('ld-note');
    if (!lastLoud) { n.textContent = 'Measure to see how loud the whole mix is compared with the target.'; return; }
    var L = lastLoud, diff = S.target - L.lufs, parts = [];
    if (!isFinite(L.lufs)) { n.textContent = 'The mix is silent, so there is nothing to measure.'; return; }
    if (Math.abs(diff) < 0.5) parts.push('The mix is right on the ' + S.target + ' LUFS target.');
    else parts.push('The mix is ' + Math.abs(diff).toFixed(1) + ' dB ' + (diff > 0 ? 'quieter' : 'louder') + ' than the ' + S.target + ' LUFS target.');
    if (isFinite(L.truePeakDb) && L.truePeakDb > S.ceiling) parts.push('Peaks go above ' + S.ceiling + ' dB, so add a Limiter or turn on Match loudness.');
    else if (Math.abs(diff) >= 0.5) parts.push('Turn on Match loudness to fix this when you export.');
    n.textContent = parts.join(' ');
  }
  function fmtNum(v, d) { return isFinite(v) ? (+v).toFixed(d) : '-inf'; }
  $('ms-measure').onclick = function () {
    if (!hasSpectral() || typeof AMr.Spectral.loudness !== 'function') { $('ld-note').textContent = 'The loudness meter is not available because the spectral part did not load.'; return; }
    if (dur() <= 0) { toast('Add some audio first'); return; }
    var btn = this; btn.disabled = true; $('ld-note').textContent = 'Rendering the mix to measure it. This can take a few seconds...'; say('Measuring loudness...');
    ensureCtx();
    Promise.resolve().then(function () { return E.render({ start: 0, end: dur() }); })
      .then(function (buf) { return AMr.Spectral.loudness(buf); })
      .then(function (L) {
        lastLoud = L || null;
        $('ld-lufs').textContent = fmtNum(L.lufs, 1); $('ld-peak').textContent = fmtNum(L.peakDb, 1);
        $('ld-tp').textContent = fmtNum(L.truePeakDb, 1); $('ld-lra').textContent = fmtNum(L.lra, 1);
        showLoudNote(); say('Loudness measured: ' + fmtNum(L.lufs, 1) + ' LUFS.');
      })
      .catch(function (e) { console.error(e); $('ld-note').textContent = 'Could not measure: ' + errText(e); say('Could not measure loudness.', true); })
      .then(function () { btn.disabled = false; });
  };
  document.querySelectorAll('[data-export]').forEach(function (b) { b.onclick = function () { exportMix(b.dataset.export); }; });

  /* export */
  var busy = false;
  function busyDlg(title, text, small, done) {
    $('bz-title').textContent = title;
    $('bz-text').innerHTML = esc(text) + '<small>' + esc(small || '') + '</small>';
    $('bz-foot').hidden = !done;
    var d = $('dlg-busy'); if (!d.open && !d.hasAttribute('open')) openDlg(d);
  }
  function exportMix(fmt) {
    if (busy) return;
    if (dur() <= 0) { toast('Nothing to export yet. Add or record some audio first.'); return; }
    var mp3 = /^mp3/.test(fmt), bits = fmt === 'wav24' ? 24 : 16, kbps = fmt === 'mp3192' ? 192 : 320;
    var match = S.match && hasSpectral() && typeof AMr.Spectral.matchLoudness === 'function';
    var name = fileBase() + (match ? ' ' + S.target + ' LUFS' : '') + (mp3 ? '.mp3' : '.wav');
    busy = true; ensureCtx();
    busyDlg('Export', 'Rendering the mix...', 'Everything happens on this computer. Long songs can take a little while.');
    Promise.resolve().then(function () { return E.render({ start: 0, end: dur() }); })
      .then(function (buf) {
        if (!match) return buf;
        busyDlg('Export', 'Matching loudness to ' + S.target + ' LUFS...', 'Peaks are kept under ' + S.ceiling + ' dB.');
        return AMr.Spectral.matchLoudness(buf, S.target, S.ceiling);
      })
      .then(function (buf) {
        busyDlg('Export', mp3 ? 'Making the MP3 file (' + kbps + ' kbps)...' : 'Making the WAV file (' + bits + ' bit)...', '');
        return mp3 ? E.toMp3(buf, kbps) : E.toWav(buf, bits);
      })
      .then(function (blob) {
        E.download(blob, name);
        busyDlg('Export', 'Done. "' + name + '" is in your downloads.', (blob && blob.size ? (blob.size / 1048576).toFixed(1) + ' MB' : ''), true);
        say('Exported ' + name + '.');
      })
      .catch(function (e) { console.error(e); busyDlg('Export', 'The export did not finish.', errText(e), true); say('Export failed.', true); })
      .then(function () { busy = false; });
    if (S.match && !match) toast('Loudness match is not available, so the mix is exported as it is', true);
  }

  /* ------------------------------------------------------------------ dialogs: time stretch, rename, record */
  var stretchId = null;
  function openStretch(id) {
    var r = findClip(id); if (!r || r.clip.kind === 'midi') return;
    if (typeof E.timeStretch !== 'function') { toast('Time stretch is not available', true); return; }
    stretchId = id;
    $('ts-factor').value = 1; $('ts-len').value = r.clip.length.toFixed(3);
    $('ts-info').textContent = 'Current length: ' + r.clip.length.toFixed(3) + ' s. A factor of 2 makes it twice as long, 0.5 makes it half as long.';
    openDlg($('dlg-stretch')); $('ts-factor').focus();
  }
  $('ts-factor').addEventListener('input', function () { var r = findClip(stretchId); var f = parseFloat(this.value); if (r && isFinite(f)) $('ts-len').value = (r.clip.length * f).toFixed(3); });
  $('ts-len').addEventListener('input', function () { var r = findClip(stretchId); var l = parseFloat(this.value); if (r && isFinite(l) && r.clip.length > 0) $('ts-factor').value = (l / r.clip.length).toFixed(3); });
  $('ts-go').onclick = function () {
    var r = findClip(stretchId), f = parseFloat($('ts-factor').value);
    if (!r) { closeDlg($('dlg-stretch')); return; }
    if (!isFinite(f) || f < 0.5 || f > 2) { toast('Use a factor between 0.5 and 2', true); return; }
    closeDlg($('dlg-stretch'));
    if (Math.abs(f - 1) < 0.001) return;
    busyDlg('Time stretch', 'Stretching the clip...', 'The pitch stays the same. Your original audio is kept.');
    ensureCtx();
    Promise.resolve().then(function () { return E.timeStretch(stretchId, f); })
      .then(function () { closeDlg($('dlg-busy')); say('Clip stretched to ' + (r.clip.length).toFixed(2) + ' s.'); toast('Clip stretched'); })
      .catch(function (e) { busyDlg('Time stretch', 'The stretch did not work.', errText(e), true); });
  };
  var renameFn = null;
  function openRename(title, value, fn) {
    renameFn = fn; $('rn-title').firstChild.textContent = title; $('rn-input').value = value;
    openDlg($('dlg-rename')); $('rn-input').focus(); try { $('rn-input').select(); } catch (e) {}
  }
  function doRename() { var v = $('rn-input').value.trim(); closeDlg($('dlg-rename')); if (v && renameFn) renameFn(v); renameFn = null; }
  $('rn-go').onclick = doRename;
  $('rn-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doRename(); } });

  function openRecDialog() {
    var sel = $('rec-dev');
    openDlg($('dlg-rec'));
    $('rec-info').textContent = 'Looking for microphones and inputs...';
    ensureCtx();
    Promise.resolve().then(function () { return E.inputs(); }).then(function (list) {
      sel.innerHTML = '<option value="">Default microphone</option>';
      (list || []).forEach(function (d, i) { var o = mk('option'); o.value = d.deviceId; o.textContent = d.label || 'Input ' + (i + 1); sel.appendChild(o); });
      if (S.inputId) sel.value = S.inputId;
      $('rec-info').textContent = 'Recording goes into the armed track (the red R), or the selected audio track, or a new track. It starts at the playhead while the other tracks play. Use headphones so the speakers are not recorded too.';
    }).catch(function (e) {
      $('rec-info').textContent = 'Could not list the inputs (' + errText(e) + '). You can still try the default microphone. Your browser will ask for permission.';
    });
  }
  $('rec-go').onclick = function () { S.inputId = $('rec-dev').value || ''; closeDlg($('dlg-rec')); startAudioRec(); };
  function recordMidiTrack() {
    var armed = tracks().filter(function (t) { return t.arm; });
    var m = armed.filter(function (t) { return t.type === 'midi'; })[0];
    if (!m && !armed.length) { var s = findTrack(S.selTrack); if (s && s.type === 'midi') m = s; }
    return m && hasMidi() && typeof AMr.Midi.recordStart === 'function' ? m : null;
  }
  function startMidiRec(t) {
    try {
      AMr.Midi.recordStart(E, t.id); S.midiRec = true;
      if (!playing()) E.play();
      syncTransport(); startTick(); startMeters();
      say('Recording MIDI into "' + t.name + '". Play your MIDI keyboard. Press R or Space to stop.');
    } catch (e) { S.midiRec = false; toast('MIDI recording could not start. ' + errText(e), true); }
  }
  function stopMidiRec() {
    S.midiRec = false;
    try { var c = AMr.Midi.recordStop(); if (c && c.id) S.sel = new Set([c.id]); say(c ? 'MIDI recorded.' : 'No notes were played, so nothing was recorded.'); } catch (e) { toast(errText(e), true); }
    syncTransport();
  }
  function startAudioRec() {
    ensureCtx();
    var armed = tracks().filter(function (t) { return t.arm && t.type === 'audio'; })[0];
    var sel = findTrack(S.selTrack);
    var target = armed || (sel && sel.type === 'audio' ? sel : null);
    var opts = {}; if (S.inputId) opts.deviceId = S.inputId; if (target) opts.trackId = target.id;
    say('Starting the recording...');
    Promise.resolve().then(function () { return E.record(opts); }).catch(function (e) {
      S.recording = false; syncTransport();
      var m = errText(e);
      toast(/denied|allowed|permission/i.test(m) ? 'The browser did not allow the microphone. Allow it in the address bar and try again.' : 'Recording could not start. ' + m, true);
      say('Recording could not start.', true);
    });
  }

  /* ------------------------------------------------------------------ files: pick and drop */
  function importFiles(files, opts) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    var wasEmpty = !allClips().length;
    say('Reading ' + (files.length === 1 ? '"' + files[0].name + '"' : files.length + ' files') + '...');
    ensureCtx();
    Promise.resolve().then(function () { return E.importFiles(files, opts || {}); }).then(function (clips) {
      var n = (clips || []).length;
      if (clips && clips.length) S.sel = new Set(clips.map(function (c) { return c.id; }).filter(Boolean));
      say(n ? 'Added ' + n + (n === 1 ? ' clip.' : ' clips.') + ' Press Space to play.' : 'Nothing was added. The file type may not be supported.', !n);
      if (n && wasEmpty) cmd.fit();
      redraw();
    }).catch(function (e) { console.error(e); toast('Could not open the file. ' + errText(e), true); say('Could not open the file.', true); });
  }
  $('f-audio').addEventListener('change', function () { var at = S.importAt; S.importAt = null; importFiles(this.files, at || {}); });
  $('f-midi').addEventListener('change', function () { importFiles(this.files, {}); });
  var dropDepth = 0;
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  window.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; dropDepth++; $('drop').hidden = false; });
  window.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; dropDepth = Math.max(0, dropDepth - 1); if (!dropDepth) $('drop').hidden = true; });
  window.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dropDepth = 0; $('drop').hidden = true;
    var files = e.dataTransfer.files, opts = {};
    var r = lanes.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      var ln = laneAt(e.clientY - r.top);
      var allAudio = Array.prototype.every.call(files, function (f) { return !/\.midi?$/i.test(f.name); });
      if (ln && ln.track.type === 'audio' && allAudio) opts = { trackId: ln.track.id, at: snapT(tOf(e.clientX - r.left), e) };
    }
    importFiles(files, opts);
  });

  /* ------------------------------------------------------------------ keyboard */
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    S.area = t.closest && t.closest('#pane-piano') ? 'piano' : t.closest && t.closest('#pane-spectral') ? 'spectral' : 'arr';
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (menuEl) { closeMenu(); e.preventDefault(); } return; }
    if (anyDialogOpen() || !$('gate').hidden) return;
    var k = e.key, ctrl = e.ctrlKey || e.metaKey, lower = (k || '').toLowerCase();
    var inPanel = S.area === 'piano' || S.area === 'spectral';
    if (isTyping(e.target)) {
      if (ctrl && lower === 's') { e.preventDefault(); cmd.save(); }
      return;
    }
    if (ctrl) {
      if (lower === 'z' && e.shiftKey) cmd.redo();
      else if (lower === 'z') cmd.undo();
      else if (lower === 'y') cmd.redo();
      else if (lower === 's') cmd.save();
      else if (lower === 'd' && !inPanel) cmd.duplicate();
      else if (lower === 'a' && !inPanel) cmd.selectAll();
      else return;
      e.preventDefault(); return;
    }
    if (e.altKey) return;
    if (k === ' ' || k === 'Spacebar') cmd.togglePlay();
    else if ((k === 'Enter' && !/^(BUTTON|A)$/.test(e.target.tagName || '')) || k === 'Home') cmd.toStart();
    else if (k === 'End') cmd.toEnd();
    else if (lower === 'r') cmd.record();
    else if (lower === 'l') cmd.loop();
    else if (lower === 'm') cmd.metro();
    else if (lower === 's' && !inPanel) cmd.split();
    else if ((k === 'Delete' || k === 'Backspace') && !inPanel) cmd.del();
    else if (k === '+' || k === '=') cmd.zoomIn();
    else if (k === '-' || k === '_') cmd.zoomOut();
    else if (k === '?') cmd.help();
    else return;
    e.preventDefault();
  });

  /* ------------------------------------------------------------------ engine events */
  var uiQueued = false, loading = true, saveT = 0, saveDirty = false;
  function onChange() {
    if (uiQueued) return; uiQueued = true;
    Promise.resolve().then(function () { uiQueued = false; renderAll(); });
    if (!loading) scheduleSave();
  }
  function renderAll() {
    var ids = new Set(allClips().map(function (r) { return r.clip.id; }));
    S.sel.forEach(function (id) { if (!ids.has(id)) S.sel.delete(id); });
    if (S.selTrack && !findTrack(S.selTrack)) S.selTrack = null;
    renderHeads(); renderMixer(); syncTransport(); updEmpty(); updInfo();
    var need = tracks().length * TH + TH;
    if (Math.abs(need - LH) > 1 && (need > LH || LH > (vs.clientHeight || 0) + 1)) resize(); else { syncScroll(); redraw(); }
    if (S.fxTarget && ($('dlg-fx').open || $('dlg-fx').hasAttribute('open'))) renderFxDialog(false);
    if (S.tab === 'master') renderMastering();
    checkDockClips();
  }
  function updEmpty() { $('empty').hidden = tracks().length > 0; }
  function updInfo() {
    var n = tracks().length, d = dur(), sr = P().sampleRate || 48000;
    $('st-info').textContent = n ? n + (n === 1 ? ' track' : ' tracks') + ', ' + fmtShort(d) + ' long, ' + Math.round(sr / 100) / 10 + ' kHz' : '';
  }
  function setSave(text, ok) { var e = $('st-save'); e.textContent = text; e.classList.toggle('ok', !!ok); }
  function markSaved() { saveDirty = false; setSave('Saved on this computer', true); }
  function scheduleSave() {
    saveDirty = true; setSave('Not saved yet', false);
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      if (S.recording) { scheduleSave(); return; }
      setSave('Saving...', false);
      Promise.resolve().then(function () { return E.saveLocal(); }).then(markSaved)
        .catch(function (e) { setSave('Could not save on this computer', false); say('Saving failed: ' + errText(e) + '. Your browser storage may be full.', true); });
    }, 1500);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && saveDirty) { clearTimeout(saveT); Promise.resolve().then(function () { return E.saveLocal(); }).then(markSaved).catch(function () {}); }
  });
  E.on('change', onChange);
  E.on('time', function () { if (!ticking) { updPlayhead(); updClock(); } });
  E.on('play', function () { syncTransport(); startTick(); startMeters(); });
  E.on('stop', function () { syncTransport(); updPlayhead(); updClock(); setTimeout(pollMeters, 60); redraw(); });
  E.on('record', function (a) {
    S.recording = !!(a && a.on); syncTransport();
    if (S.recording) { startTick(); startMeters(); say('Recording. Press R, Space or Stop to finish.'); }
    else { say('Recording finished.'); redraw(); }
  });
  E.on('error', function (m) { var t = typeof m === 'string' ? m : errText(m); toast(t, true); say(t, true); });

  /* ------------------------------------------------------------------ start gate, small screen note, boot */
  function inFull() { return !!document.fullscreenElement; }
  function goFull() { var el = document.documentElement; if (el.requestFullscreen) { var p = el.requestFullscreen(); if (p && p.catch) p.catch(function () { say('Your browser did not allow full screen. Press F11 instead.'); }); } }
  function passGate(full) { $('gate').hidden = true; try { sessionStorage.setItem('am_gate', '1'); } catch (e) {} ensureCtx(); if (full) goFull(); setTimeout(resize, 0); }
  $('gate-fs').onclick = function () { passGate(true); };
  $('gate-win').onclick = function () { passGate(false); };
  (function gate() {
    var mm = window.matchMedia ? function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } } : function () { return false; };
    var standalone = mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || window.navigator.standalone === true;
    var seen = false; try { seen = !!sessionStorage.getItem('am_gate'); } catch (e) {}
    var small = (window.innerWidth || 1200) < 900;
    $('gate-phone').hidden = !small;
    if (small && !store('am_small_ok')) $('small-banner').hidden = false;
    if (!standalone && !seen && !inFull() && !/[?&]nogate=1/.test(location.search)) $('gate').hidden = false;
  })();
  $('small-x').onclick = function () { $('small-banner').hidden = true; store('am_small_ok', true); setTimeout(resize, 0); };

  applyDock();
  showTab('mixer', true);
  resize();
  renderAll();
  updClock();
  say('Opening your last project...');
  Promise.resolve().then(function () { return E.loadLocal(); }).then(function (ok) {
    loading = false; renderAll(); resize();
    if (ok) { markSaved(); say('Opened your last project from this computer.'); if (dur() > 0) cmd.fit(); }
    else { setSave('', false); say('New project. Drop audio files here or press Add audio files to start.'); }
  }).catch(function (e) {
    loading = false; renderAll();
    say('Could not open the last project (' + errText(e) + '). Starting a new one.', true);
  });
})();

/* Song breakdown screen: timeline, playback and the "what you are hearing" panel. Runs in the browser. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var $ = function (id) { return document.getElementById(id); };
  if (!$('kb-bd-btn')) return;
  var K = window.KBKey, B = window.KBBreak, AC = window.AudioContext || window.webkitAudioContext;
  if (!K || !B) return;

  var LANES = [['Sections', 26], ['Chords', 40], ['Lead line', 96], ['Bass', 72], ['Beat hits', 56], ['Loudness', 56]];
  var RULER = 20, GAP = 8, BASS = [28, 55], LEAD = [55, 86];
  var res = null, token = 0, audio = $('kb-bd-audio'), url = null, pps = 40, raf = 0, lastNow = '';
  var cv = $('kb-bd-cv'), scroll = $('kb-bd-scroll'), play = $('kb-bd-playhead');

  function setStatus(t) { $('kb-bd-status').textContent = t; }
  function prog(p) { $('kb-bd-progi').style.width = Math.round(p * 100) + '%'; $('kb-bd-prog').hidden = p >= 1; }
  function fmt(t) { t = Math.max(0, t); return Math.floor(t / 60) + ':' + ('0' + Math.floor(t % 60)).slice(-2); }
  function nm(m, fl) { return K.noteName(m % 12, fl) + (Math.floor(m / 12) - 1); }
  function css(v, d) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d; }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function mod12(n) { return ((n % 12) + 12) % 12; }

  function laneTop(i) { var y = RULER; for (var j = 0; j < i; j++) y += LANES[j][1] + GAP; return y; }
  function totalH() { return laneTop(LANES.length - 1) + LANES[LANES.length - 1][1] + 4; }

  function buildLabels() {
    var box = $('kb-bd-labels');
    box.innerHTML = '';
    box.style.paddingTop = RULER + 'px';
    LANES.forEach(function (l) {
      var d = document.createElement('div');
      d.style.height = l[1] + 'px'; d.style.marginBottom = GAP + 'px';
      d.textContent = l[0];
      box.appendChild(d);
    });
  }

  function draw() {
    if (!res) return;
    var dur = res.duration, w = Math.ceil(dur * pps), h = totalH(), g = cv.getContext('2d'), i;
    cv.width = w; cv.height = h; cv.style.width = w + 'px'; cv.style.height = h + 'px';
    $('kb-bd-content').style.width = w + 'px';
    var ink = css('--ink', '#eee'), soft = css('--soft', '#bbb'), acc = css('--accent', '#ff5b52');
    var fl = K.usesFlats(res.key.tonic, res.key.minor), X = function (t) { return t * pps; };
    g.clearRect(0, 0, w, h);
    g.font = '11px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle';
    g.fillStyle = soft;
    var tick = pps >= 60 ? 5 : pps >= 30 ? 10 : 20;
    for (var t = 0; t <= dur; t += tick) { g.fillRect(Math.round(X(t)), 6, 1, 8); g.fillText(fmt(t), X(t) + 4, 10); }
    for (i = 0; i < LANES.length; i++) { g.fillStyle = 'rgba(128,128,128,0.08)'; g.fillRect(0, laneTop(i), w, LANES[i][1]); }
    g.fillStyle = 'rgba(128,128,128,0.25)';
    for (i = res.down; i < res.beats.length; i += 4) g.fillRect(Math.round(X(res.beats[i])), RULER, 1, totalH() - RULER);
    /* sections */
    var y0 = laneTop(0), pal = ['#6ea8ff', '#ffb347', '#7be0a3', '#d58bff', '#ff8a80', '#5fd0d0'];
    res.sections.forEach(function (s) {
      g.fillStyle = pal[s.group % pal.length]; g.globalAlpha = 0.85;
      g.fillRect(X(s.t0) + 1, y0, Math.max(2, X(s.t1) - X(s.t0) - 2), LANES[0][1]);
      g.globalAlpha = 1; g.fillStyle = '#111';
      if (X(s.t1) - X(s.t0) > 36) g.fillText(s.label + (s.likelyChorus ? ' (chorus?)' : ''), X(s.t0) + 6, y0 + LANES[0][1] / 2);
    });
    /* chords */
    y0 = laneTop(1);
    res.chords.forEach(function (c) {
      var x = X(c.t0), ww = X(c.t1) - X(c.t0);
      g.fillStyle = B.TYPES[c.type].minor ? 'rgba(110,168,255,0.35)' : 'rgba(255,179,71,0.35)';
      g.fillRect(x + 1, y0, Math.max(2, ww - 2), LANES[1][1]);
      if (ww > 26) {
        g.fillStyle = ink; g.font = 'bold 12px system-ui, sans-serif'; g.fillText(B.chordName(c, fl), x + 5, y0 + 13);
        g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = soft; g.fillText(B.chordRoman(c, res.key), x + 5, y0 + 29);
      }
    });
    g.font = '11px ui-monospace, Menlo, Consolas, monospace';
    /* pitched lanes */
    function notes(list, lane, range, color, labels) {
      var top = laneTop(lane), hh = LANES[lane][1], span = range[1] - range[0] + 1, nh = Math.max(3, hh / span);
      g.fillStyle = color;
      list.forEach(function (n) {
        var y = top + hh - (clamp(n.midi, range[0], range[1]) - range[0] + 1) * hh / span, ww = Math.max(2, X(n.t1) - X(n.t0) - 1);
        g.fillRect(X(n.t0), y, ww, nh);
        if (labels && ww > 24) { g.fillStyle = ink; g.fillText(nm(n.midi, fl), X(n.t0) + 3, y - 6 < top ? y + nh + 7 : y - 6); g.fillStyle = color; }
      });
    }
    notes(res.lead, 2, LEAD, '#6ea8ff', pps >= 50);
    notes(res.bass, 3, BASS, '#ffb347', pps >= 30);
    /* beat hits */
    var rows = [['kick', acc], ['snare', ink], ['hat', soft]], rh = LANES[4][1] / 3;
    rows.forEach(function (r, ri) {
      g.fillStyle = r[1];
      res.drums[r[0]].forEach(function (tt) { g.fillRect(Math.round(X(tt)), laneTop(4) + ri * rh + 3, 2, rh - 6); });
    });
    /* loudness */
    if (res.energy) {
      var e = res.energy, top = laneTop(5), hh = LANES[5][1];
      [['low', '#ffb347'], ['mid', '#6ea8ff'], ['high', '#9aa0a6']].forEach(function (b) {
        g.strokeStyle = b[1]; g.lineWidth = 1.5; g.beginPath();
        for (var q = 0; q < e[b[0]].length; q++) { var x = q * e.dt * pps, y = top + hh - e[b[0]][q] * hh; if (q) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      });
    }
    play.style.height = h + 'px';
    movePlayhead();
  }

  function movePlayhead() {
    var x = audio.currentTime * pps;
    play.style.transform = 'translateX(' + x + 'px)';
    if ($('kb-bd-follow').checked && !audio.paused) {
      var l = scroll.scrollLeft, w = scroll.clientWidth;
      if (x < l + w * 0.15 || x > l + w * 0.6) scroll.scrollLeft = Math.max(0, x - w * 0.3);
    }
  }

  function at(list, t) {
    var lo = 0, hi = list.length - 1, r = null;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (list[mid].t0 <= t) { r = list[mid]; lo = mid + 1; } else hi = mid - 1; }
    return r && r.t1 >= t ? r : null;
  }

  var ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
  var INTERVAL = ['the root', 'a flat 2nd', 'a 2nd', 'a minor 3rd', 'a major 3rd', 'a 4th', 'a flat 5th', 'a 5th', 'a flat 6th', 'a 6th', 'a minor 7th', 'a major 7th'];

  function updateNow() {
    if (!res) return;
    var t = audio.currentTime, fl = K.usesFlats(res.key.tonic, res.key.minor), pcs = K.scalePcs(res.key.tonic, res.key.minor), kn = K.keyName(res.key.tonic, res.key.minor);
    var sec = at(res.sections, t), ch = at(res.chords, t), bs = at(res.bass, t), ld = at(res.lead, t), lines = [];
    var cells = [
      ['Section', sec ? sec.label + (sec.likelyChorus ? ' (chorus?)' : '') : '-'],
      ['Chord', ch ? B.chordName(ch, fl) + ' (' + B.chordRoman(ch, res.key) + ')' : '-'],
      ['Bass plays', bs ? nm(bs.midi, fl) : 'rests'],
      ['Lead plays', ld ? nm(ld.midi, fl) : 'rests']
    ];
    var html = cells.map(function (c) { return '<div><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; }).join('');
    if (ch) {
      var cp = B.chordPcs(ch), deg = pcs.indexOf(ch.root);
      lines.push('<b>' + B.chordName(ch, fl) + '</b> is ' + (deg >= 0 ? 'the ' + ORD[deg] + ' chord of ' + kn : 'not from the key of ' + kn + ', so it adds a different colour') + '. Its notes are ' + cp.map(function (p) { return K.noteName(p, fl); }).join(', ') + '.');
      if (bs) {
        var bd = mod12(bs.midi - ch.root);
        lines.push('The bass plays <b>' + K.noteName(bs.midi % 12, fl) + '</b>' + (bd === 0 ? ', the root of the chord. Bass usually anchors the chord this way.' : ', which is ' + INTERVAL[bd] + ' of the chord.'));
      }
      if (ld) {
        var ld2 = mod12(ld.midi - ch.root), inChord = cp.indexOf(ld.midi % 12) >= 0;
        lines.push('The lead is on <b>' + K.noteName(ld.midi % 12, fl) + '</b>, ' + INTERVAL[ld2] + ' of the chord. ' + (inChord ? 'It is a chord note, so it sounds settled.' : 'It is not a chord note, so it sounds a little tense and wants to move.'));
      }
    }
    var sig = html + '|' + lines.join('');
    if (sig !== lastNow) {
      lastNow = sig;
      $('kb-bd-now').innerHTML = html;
      $('kb-bd-explain').innerHTML = lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') || '<p>Press play to follow the song.</p>';
    }
    if (window.KBKeys) window.KBKeys.setNow({ chord: ch ? B.chordPcs(ch) : [], bass: bs ? bs.midi % 12 : null, lead: ld ? ld.midi % 12 : null });
    $('kb-bd-time').textContent = fmt(t) + ' / ' + fmt(res.duration);
  }

  function tick() {
    movePlayhead(); updateNow();
    raf = audio.paused ? 0 : requestAnimationFrame(tick);
  }
  audio.addEventListener('play', function () { $('kb-bd-play').textContent = 'Pause'; if (!raf) raf = requestAnimationFrame(tick); });
  audio.addEventListener('pause', function () { $('kb-bd-play').textContent = 'Play'; movePlayhead(); updateNow(); });
  audio.addEventListener('ended', function () { $('kb-bd-play').textContent = 'Play'; });
  audio.addEventListener('seeked', function () { movePlayhead(); updateNow(); });
  $('kb-bd-play').addEventListener('click', function () { if (audio.paused) audio.play(); else audio.pause(); });
  $('kb-bd-zoom').addEventListener('input', function () {
    if (!res) return;
    var c = (scroll.scrollLeft + scroll.clientWidth / 2) / pps;
    pps = +this.value; draw();
    scroll.scrollLeft = Math.max(0, c * pps - scroll.clientWidth / 2);
  });
  $('kb-bd-content').addEventListener('click', function (e) {
    if (!res) return;
    var r = this.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(res.duration - 0.05, (e.clientX - r.left) / pps));
    updateNow();
  });

  function analyseFile(file) {
    if (!file || !AC) return;
    var my = ++token, dctx;
    audio.pause();
    $('kb-bd').hidden = true; res = null;
    if (window.KBKeys) window.KBKeys.setNow(null);
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(file); audio.src = url;
    try { dctx = new AC(); } catch (e) { setStatus('This browser cannot read audio.'); return; }
    $('kb-bd-btn').disabled = true;
    setStatus('Reading ' + file.name + '...'); prog(0.01);
    file.arrayBuffer().then(function (ab) {
      return new Promise(function (ok, bad) { dctx.decodeAudioData(ab, ok, bad); });
    }).then(function (buf) {
      try { dctx.close(); } catch (e) {}
      return B.analyse(buf, function (p) { if (my === token) { prog(p); setStatus('Listening to the song: ' + Math.round(p * 100) + '%'); } }, function () { return my !== token; });
    }).then(function (r) {
      if (my !== token || !r) return;
      $('kb-bd-btn').disabled = false; prog(1);
      if (!r.key || !r.chords.length) { setStatus('Not enough music was found in that file to break it down.'); return; }
      res = r;
      $('kb-bd').hidden = false;
      $('kb-bd-sum').textContent = K.keyName(r.key.tonic, r.key.minor) + '  |  ' + r.bpm + ' BPM  |  ' + r.sections.length + ' section' + (r.sections.length === 1 ? '' : 's') + '  |  ' + fmt(r.duration);
      var z = $('kb-bd-zoom'); pps = Math.max(8, Math.min(+z.value, Math.floor(28000 / r.duration))); z.value = pps;
      buildLabels(); draw(); scroll.scrollLeft = 0; lastNow = ''; updateNow();
      if (window.KBKeys) window.KBKeys.setScale(r.key.tonic, r.key.minor);
      setStatus('Done: ' + file.name + '. Press play and watch the timeline. Click anywhere on it to jump.');
    }).catch(function () {
      if (my !== token) return;
      try { dctx.close(); } catch (e) {}
      $('kb-bd-btn').disabled = false; prog(1);
      setStatus('This file could not be read. Try an MP3, WAV, M4A or OGG file.');
    });
  }
  $('kb-bd-btn').addEventListener('click', function () { $('kb-bd-file').click(); });
  $('kb-bd-file').addEventListener('change', function () { analyseFile(this.files[0]); this.value = ''; });
  var drop = $('kb-bd-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { analyseFile(e.dataTransfer.files[0]); });
  window.KBBreakUI = { load: analyseFile };
})();

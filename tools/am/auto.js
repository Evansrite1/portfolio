/* auto.js : "Auto edit" for the audio studio.
   Press one button and a recording is cleaned up by itself: long silences are cut down, the start and end are trimmed, the voice is
   brought to a steady level, rumble and loud peaks are controlled, and, if you give it a music file, a music bed is laid under the voice,
   quiet while you speak and louder in the gaps, the intro and the ending. Everything happens in one step, so Undo brings the original back. */
(function () {
  'use strict';
  var AM = window.AM; if (!AM || !AM.engine) return;
  var E = AM.engine;
  function $(id) { return document.getElementById(id); }
  function db(x) { return 20 * Math.log10(Math.max(1e-9, x)); }
  function lin(d) { return Math.pow(10, d / 20); }
  function pct(arr, p) { var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; }); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : -90; }

  /* loudness of every 20 ms of a stretch of a buffer (mono mix) */
  function levels(buf, t0, t1) {
    var sr = buf.sampleRate, a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(buf.length, Math.floor(t1 * sr)), w = Math.round(sr * 0.02), n = Math.max(0, Math.floor((b - a) / w));
    var chs = []; for (var c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    var out = new Float32Array(n), peak = 0;
    for (var i = 0; i < n; i++) {
      var s = 0, from = a + i * w;
      for (var k = 0; k < w; k++) { var v = 0; for (var cc = 0; cc < chs.length; cc++) v += chs[cc][from + k]; v /= chs.length; s += v * v; var av = Math.abs(v); if (av > peak) peak = av; }
      out[i] = db(Math.sqrt(s / w));
    }
    return { db: out, win: 0.02, peak: peak };
  }

  /* the stretches of a clip that carry speech, as [start, end] seconds inside the source, with their pads and the pauses shortened */
  function plan(buf, off, len, o) {
    var L = levels(buf, off, off + len), n = L.db.length;
    if (n < 10) return { segs: [{ a: off, b: off + len }], floor: -70, speech: -30, peak: L.peak };
    var floor = Math.max(-80, pct(L.db, 0.1)), loud = pct(L.db, 0.95);
    var thr = Math.min(loud - 12, Math.max(floor + 10, loud - 32)), v = new Array(n), i;
    for (i = 0; i < n; i++) v[i] = L.db[i] > thr;
    var hang = Math.round(0.25 / L.win), lastOn = -1e9;                   /* keep the tails of words and short pauses between words */
    for (i = 0; i < n; i++) { if (v[i]) lastOn = i; else if (i - lastOn <= hang) v[i] = true; }
    var spans = [], st = -1;
    for (i = 0; i <= n; i++) {
      if (i < n && v[i]) { if (st < 0) st = i; } else if (st >= 0) { if ((i - st) * L.win >= 0.08) spans.push([st * L.win, i * L.win]); st = -1; }
    }
    var keepPause = o.pause, pad = Math.min(0.22, keepPause / 2 + 0.05), segs = [];
    spans.forEach(function (s) {
      var a = Math.max(0, s[0] - pad), b = Math.min(len, s[1] + pad), last = segs[segs.length - 1];
      if (last && a - last.b < keepPause) last.b = b; else segs.push({ a: a, b: b });
    });
    if (!segs.length) segs.push({ a: 0, b: len });
    var sum = 0, cnt = 0; for (i = 0; i < n; i++) if (v[i]) { sum += Math.pow(10, L.db[i] / 10); cnt++; }
    return { segs: segs.map(function (s) { return { a: off + s.a, b: off + s.b }; }), floor: floor, speech: cnt ? 10 * Math.log10(sum / cnt) : -30, peak: L.peak };
  }

  function ensureFx(trackId, type, params, which) {
    var t = E.findTrack(trackId); if (!t) return;
    var have = (t.fx || []).filter(function (f) { return f.type === type && (!which || which(f)); });
    if (!have.length) E.addFx(trackId, type, params);
  }

  /* lays a music bed under the finished voice: low while speaking, higher in long gaps, the intro and the ending */
  function layBed(srcId, voice, total, intro, outro) {
    var src = E.sources.get(srcId); if (!src) return null;
    var buf = src.buffer, dur = buf.duration, bl = levels(buf, 0, Math.min(dur, 60)), s = 0, i;
    for (i = 0; i < bl.db.length; i++) s += Math.pow(10, bl.db[i] / 10);
    var rms = Math.sqrt(s / Math.max(1, bl.db.length));
    var up = Math.min(2.5, lin(-22) / Math.max(rms, 1e-4)), down = Math.min(1.5, lin(-38) / Math.max(rms, 1e-4));
    var tr = E.addTrack({ name: 'Music bed' }), regions = [], T = total + outro;
    regions.push({ a: 0, b: intro, g: up, fi: 0.04 });
    var cur = intro;
    voice.forEach(function (v) { /* v = [start, end] on the finished timeline */
      if (v[0] - cur > 1.6) { regions.push({ a: cur, b: v[0] - 0.4, g: up }); cur = v[0] - 0.4; }
    });
    regions.push({ a: cur, b: total, g: down });
    regions.push({ a: total, b: T, g: up, fo: Math.min(3, outro) });
    var X = 0.6, made = 0;
    regions.forEach(function (r, idx) {
      if (r.b - r.a < 0.05) return;
      var t0 = r.a, end = r.b + (idx < regions.length - 1 ? X : 0);
      while (t0 < end - 0.001) {
        var pos = t0 % dur, piece = Math.min(end - t0, dur - pos);
        E.addClip(tr.id, { kind: 'audio', srcId: srcId, name: 'Music bed', start: t0, offset: pos, length: piece, gain: r.g,
          fadeIn: t0 === r.a ? (r.fi != null ? r.fi : (idx ? X : 0.04)) : 0.04, fadeOut: t0 + piece >= end - 0.001 ? (r.fo != null ? r.fo : (idx < regions.length - 1 ? X : 0.04)) : 0.04 });
        t0 += piece; made++;
      }
    });
    return tr;
  }

  AM.autoEdit = function (opts, onNote) {
    opts = Object.assign({ silence: true, level: true, clean: true, pause: 0.6, intro: 3, outro: 4, bedSrc: null }, opts || {});
    var note = onNote || function () {}, report = { cut: 0, tracks: 0, bed: false };
    var tracks = E.project.tracks.filter(function (t) { return t.type === 'audio' && t.clips.length && !/music bed/i.test(t.name); });
    if (!tracks.length) throw new Error('There is no recording to edit yet. Record or add audio first.');
    var voiceSpans = [], total = 0, shift = opts.bedSrc ? opts.intro : 0;
    E.batch('Auto edit', function () {
      tracks.forEach(function (t) {
        var clips = t.clips.slice().sort(function (a, b) { return a.start - b.start; }), cursor = null, removedBefore = 0;
        clips.forEach(function (c) {
          var src = E.sources.get(c.srcId); if (!src || c.kind !== 'audio') return;
          var rate = c.rate || 1, off = c.offset, len = c.length * rate;
          var p = opts.silence && rate === 1 && !c.reverse ? plan(src.buffer, off, len, opts) : { segs: [{ a: off, b: off + len }], floor: -70, speech: null, peak: 1 };
          var g = c.gain || 1;
          if (opts.level && p.speech != null) g = Math.min(8, Math.max(0.25, lin(-19 - p.speech))) * 1;
          if (opts.level && p.peak * g > 0.97) g = 0.97 / Math.max(p.peak, 1e-6);
          var start = cursor == null ? c.start : Math.max(c.start - removedBefore, cursor);
          var newStart = start, kept = 0;
          E.removeClip(c.id);
          p.segs.forEach(function (s, i) {
            var piece = s.b - s.a; if (piece < 0.05) return;
            var nc = E.addClip(t.id, { kind: 'audio', srcId: c.srcId, name: c.name, start: newStart + shift, offset: s.a, length: piece, gain: g, fadeIn: i === 0 ? Math.min(0.03, c.fadeIn || 0.03) : 0.012, fadeOut: 0.012 });
            if (nc) { voiceSpans.push([nc.start, nc.start + nc.length]); newStart += piece; kept += piece; }
          });
          report.cut += Math.max(0, len - kept); removedBefore += Math.max(0, c.length - kept); cursor = newStart; total = Math.max(total, newStart);
        });
        if (opts.clean) {
          ensureFx(t.id, 'filter', { mode: 1, freq: 85, q: 0.7 }, function (f) { return f.params && f.params.mode === 1; });
          ensureFx(t.id, 'comp', { threshold: -22, ratio: 3, attack: 8, release: 160, knee: 8, makeup: 3 });
          ensureFx(t.id, 'limiter', { ceiling: -1.5 });
        }
        report.tracks++;
      });
      total += shift;
      if (opts.bedSrc) {
        voiceSpans.sort(function (a, b) { return a[0] - b[0]; });
        var merged = []; voiceSpans.forEach(function (s) { var l = merged[merged.length - 1]; if (l && s[0] - l[1] < 0.9) l[1] = Math.max(l[1], s[1]); else merged.push([s[0], s[1]]); });
        layBed(opts.bedSrc, merged, total, opts.intro, opts.outro); report.bed = true;
      }
    });
    note(report);
    return report;
  };

  /* ---------- the button and the dialog ---------- */
  function build() {
    var head = document.querySelector('header.top'); if (!head || $('au-open')) return;
    var btn = document.createElement('button'); btn.type = 'button'; btn.id = 'au-open'; btn.className = 'b sm pri'; btn.textContent = 'Auto edit'; btn.title = 'Clean up a recording by itself: cut silences, even out the volume, add a music bed';
    btn.style.cssText = 'margin-left:6px'; var sp = head.querySelector('.sp'); head.insertBefore(btn, sp || null);
    var d = document.createElement('dialog'); d.id = 'dlg-auto';
    d.innerHTML = '<div class="dlg"><div class="dt">Auto edit<span class="sp"></span><button class="ib flat" type="button" data-close aria-label="Close">x</button></div>'
      + '<div class="dbody"><p class="help">Record your voice or add an audio file first. Then press Edit it for me. Undo brings the original back.</p>'
      + '<label class="row" style="gap:7px;margin:8px 0"><input type="checkbox" id="au-sil" checked> Cut the silences and trim the start and the end</label>'
      + '<label class="row" style="gap:7px;margin:8px 0"><input type="checkbox" id="au-lev" checked> Make the voice steady and loud enough</label>'
      + '<label class="row" style="gap:7px;margin:8px 0"><input type="checkbox" id="au-cln" checked> Remove rumble and control loud peaks</label>'
      + '<div class="f" style="margin:10px 0"><label for="au-pause">Longest pause to keep</label><select id="au-pause"><option value="0.4">Short, fast paced</option><option value="0.6" selected>Natural</option><option value="1">Long, relaxed</option></select></div>'
      + '<div class="f" style="margin:10px 0"><label for="au-bed">Music bed (optional)</label><input type="file" id="au-bed" accept="audio/*"><p class="help">Choose a music file and it is laid under your voice: quiet while you speak, louder in the gaps, the start and the ending, with a fade out.</p></div>'
      + '<label class="row" style="gap:7px;margin:8px 0"><input type="checkbox" id="au-save"> Save the finished audio to my computer when done</label>'
      + '<p class="help" id="au-msg" role="status"></p></div>'
      + '<div class="dfoot"><button class="b" type="button" data-close>Close</button><button class="b pri" type="button" id="au-go">Edit it for me</button></div></div>';
    document.body.appendChild(d);
    btn.onclick = function () { $('au-msg').textContent = ''; if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); };
    d.addEventListener('click', function (e) { if (e.target === d || (e.target.closest && e.target.closest('[data-close]'))) { if (d.close) d.close(); else d.removeAttribute('open'); } });
    $('au-go').onclick = function () {
      var msg = $('au-msg'), go = this, f = $('au-bed').files[0];
      go.disabled = true; msg.textContent = 'Working...';
      Promise.resolve().then(function () { E.ensure(); return f ? E.decodeFile(f) : null; }).then(function (srcId) {
        var r = AM.autoEdit({ silence: $('au-sil').checked, level: $('au-lev').checked, clean: $('au-cln').checked, pause: +$('au-pause').value, bedSrc: srcId }, function () {});
        msg.textContent = 'Done. Cut ' + r.cut.toFixed(1) + ' seconds of silence' + (r.bed ? ' and added the music bed' : '') + '. Press play to listen. Undo (Ctrl+Z) brings the original back.';
        if ($('au-save').checked) { var ex = document.querySelector('[data-export="wav16"]'); if (ex) { d.close && d.close(); ex.click(); } }
      }).catch(function (e) { msg.textContent = (e && e.message) || String(e); }).then(function () { go.disabled = false; });
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();

/* Keyboard with five sounds and a song key finder. Runs in the browser. Nothing is uploaded. */
(function (root) {
  'use strict';

  /* ---------- key detection (also used by the file analyser) ---------- */
  var SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  var FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  var MAJOR_NAME = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  var MINOR_NAME = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  var MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
  var MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
  /* Krumhansl-Kessler and Temperley key profiles. The two are averaged. */
  var KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  var TP_MAJ = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
  var TP_MIN = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

  function mod(n, m) { return ((n % m) + m) % m; }
  function keyName(t, minor) { return (minor ? MINOR_NAME : MAJOR_NAME)[t] + (minor ? ' minor' : ' major'); }
  function usesFlats(t, minor) { return [1, 3, 5, 8, 10].indexOf(minor ? mod(t + 3, 12) : t) >= 0; }
  function noteName(pc, flats) { return (flats ? FLAT : SHARP)[mod(pc, 12)]; }
  function scalePcs(t, minor) { return (minor ? MINOR_SCALE : MAJOR_SCALE).map(function (s) { return mod(t + s, 12); }); }

  function pearson(a, b) {
    var n = a.length, ma = 0, mb = 0, i;
    for (i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    var num = 0, da = 0, db = 0;
    for (i = 0; i < n; i++) { var x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }

  /* Returns all 24 keys, best first: [{tonic, minor, score}] */
  function estimate(chroma) {
    var out = [], t, m, i;
    for (m = 0; m < 2; m++) {
      for (t = 0; t < 12; t++) {
        var kk = [], tp = [];
        for (i = 0; i < 12; i++) {
          var j = mod(i - t, 12);
          kk.push((m ? KK_MIN : KK_MAJ)[j]);
          tp.push((m ? TP_MIN : TP_MAJ)[j]);
        }
        out.push({ tonic: t, minor: !!m, score: (pearson(chroma, kk) + pearson(chroma, tp)) / 2 });
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  function relativeOf(k) { return { tonic: mod(k.tonic + (k.minor ? 3 : 9), 12), minor: !k.minor }; }

  /* How much better the best key is than the best key that is not its relative. 0 to 1. */
  function confidence(list) {
    var best = list[0], rel = relativeOf(best), i;
    for (i = 1; i < list.length; i++) {
      if (list[i].tonic === rel.tonic && list[i].minor === rel.minor) continue;
      return Math.max(0, Math.min(1, (best.score - list[i].score) / 0.14));
    }
    return 0;
  }

  /* ---------- FFT ---------- */
  function makeFFT(n) {
    var levels = Math.round(Math.log(n) / Math.LN2), cosT = new Float64Array(n / 2), sinT = new Float64Array(n / 2), rev = new Uint32Array(n), i;
    for (i = 0; i < n / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / n); sinT[i] = Math.sin(2 * Math.PI * i / n); }
    for (i = 0; i < n; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) << (levels - 1));
    return function (re, im) {
      var i, j, size, half, step, k, l, tre, tim, t;
      for (i = 0; i < n; i++) {
        j = rev[i];
        if (j > i) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (size = 2; size <= n; size <<= 1) {
        half = size >> 1; step = n / size;
        for (i = 0; i < n; i += size) {
          for (j = i, k = 0; j < i + half; j++, k += step) {
            l = j + half;
            tre = re[l] * cosT[k] + im[l] * sinT[k];
            tim = -re[l] * sinT[k] + im[l] * cosT[k];
            re[l] = re[j] - tre; im[l] = im[j] - tim;
            re[j] += tre; im[j] += tim;
          }
        }
      }
    };
  }

  /* ---------- chroma analyser ---------- */
  var SIZE = 16384, FMIN = 70, FMAX = 2000;
  var fftShared = null, winShared = null;

  function Analyzer(sampleRate, decay) {
    if (!fftShared) {
      fftShared = makeFFT(SIZE);
      winShared = new Float32Array(SIZE);
      for (var i = 0; i < SIZE; i++) winShared[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (SIZE - 1));
    }
    this.sr = sampleRate;
    this.decay = decay || 1;
    this.re = new Float64Array(SIZE);
    this.im = new Float64Array(SIZE);
    this.mag = new Float64Array(SIZE / 2);
    this.reset();
  }
  Analyzer.prototype.reset = function () {
    this.chroma = new Float64Array(12);
    this.frames = 0;
    this.tc = 0; this.ts = 0; this.tuning = 0;
  };
  /* Adds one frame of SIZE samples starting at off. */
  Analyzer.prototype.frame = function (samples, off) {
    var re = this.re, im = this.im, mag = this.mag, i, k;
    for (i = 0; i < SIZE; i++) { re[i] = samples[off + i] * winShared[i]; im[i] = 0; }
    fftShared(re, im);
    var binHz = this.sr / SIZE, k0 = Math.max(2, Math.floor(FMIN / binHz)), k1 = Math.min(SIZE / 2 - 2, Math.ceil(FMAX / binHz)), mx = 0;
    for (k = k0 - 1; k <= k1 + 1; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); if (mag[k] > mx) mx = mag[k]; }
    if (mx <= 0) return false;
    var thr = mx * 0.03, c = new Float64Array(12), sum = 0, fc = 0, fs = 0, tuning = this.tuning;
    for (k = k0; k <= k1; k++) {
      var m = mag[k];
      if (m < thr || m <= mag[k - 1] || m < mag[k + 1]) continue;
      var a = Math.log(mag[k - 1] + 1e-12), b = Math.log(m + 1e-12), d = Math.log(mag[k + 1] + 1e-12), den = a - 2 * b + d;
      var delta = den ? 0.5 * (a - d) / den : 0;
      if (delta > 0.5) delta = 0.5; else if (delta < -0.5) delta = -0.5;
      var midi = 69 + 12 * Math.log((k + delta) * binHz / 440) / Math.LN2;
      var w = Math.sqrt(m);
      fc += w * Math.cos(2 * Math.PI * midi); fs += w * Math.sin(2 * Math.PI * midi);
      var x = midi - tuning, r = Math.round(x), dev = x - r, cw = Math.cos(Math.PI * dev);
      c[mod(r, 12)] += w * cw * cw;
      sum += w * cw * cw;
    }
    if (sum <= 0) return false;
    for (i = 0; i < 12; i++) this.chroma[i] = this.chroma[i] * this.decay + c[i] / sum;
    this.tc = this.tc * 0.98 + fc; this.ts = this.ts * 0.98 + fs;
    this.tuning = Math.atan2(this.ts, this.tc) / (2 * Math.PI);
    this.frames++;
    return true;
  };

  function rmsOf(buf, off, len) {
    var s = 0, i;
    for (i = 0; i < len; i++) { var v = buf[off + i]; s += v * v; }
    return Math.sqrt(s / len);
  }

  /* Analyses a decoded AudioBuffer. onProgress(0..1) is called now and then. */
  function analyseBuffer(buffer, onProgress, isCancelled) {
    return new Promise(function (resolve) {
      var n = buffer.length, ch = buffer.numberOfChannels, mono = new Float32Array(n), c, i;
      for (c = 0; c < ch; c++) { var d = buffer.getChannelData(c); for (i = 0; i < n; i++) mono[i] += d[i] / ch; }
      var an = new Analyzer(buffer.sampleRate, 1), pos = 0, hop = SIZE >> 1;
      if (n < SIZE) { var pad = new Float32Array(SIZE); pad.set(mono); mono = pad; n = SIZE; }
      (function step() {
        var t0 = Date.now();
        while (pos + SIZE <= n && Date.now() - t0 < 30) {
          if (rmsOf(mono, pos, SIZE) > 0.004) an.frame(mono, pos);
          pos += hop;
        }
        if (onProgress) onProgress(Math.min(1, pos / n));
        if (isCancelled && isCancelled()) { resolve(null); return; }
        if (pos + SIZE <= n) setTimeout(step, 0); else resolve(an);
      })();
    });
  }

  root.KBKey = { Analyzer: Analyzer, estimate: estimate, confidence: confidence, relativeOf: relativeOf, keyName: keyName, scalePcs: scalePcs, noteName: noteName, usesFlats: usesFlats, analyseBuffer: analyseBuffer, rmsOf: rmsOf, SIZE: SIZE };
})(typeof window !== 'undefined' ? window : globalThis);

(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var $ = function (id) { return document.getElementById(id); };
  var rootEl = $('kb-tool');
  if (!rootEl) return;
  var K = window.KBKey;
  var AC = window.AudioContext || window.webkitAudioContext;

  /* ---------- sound engine ---------- */
  var ctx = null, master = null, volume = 0.7, sound = 'piano';
  function getCtx() {
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume * 0.5;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function osc(c, type, freq, detune) {
    var o = c.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    return o;
  }

  /* Each builder returns {out, oscs, relTime}. out is a gain node that is faded on release. */
  var BUILD = {
    piano: function (c, f, t) {
      var out = c.createGain(), oscs = [], amps = [1, 0.5, 0.32, 0.2, 0.12, 0.07, 0.04];
      var base = Math.max(1.2, Math.min(6, 3.2 * Math.pow(261 / f, 0.4)));
      var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f * 14); lp.Q.value = 0.3;
      lp.frequency.setTargetAtTime(Math.min(3500, f * 6), t, 0.35);
      lp.connect(out);
      for (var n = 1; n <= amps.length; n++) {
        var o = osc(c, 'sine', f * n * (1 + 0.00035 * n * n)), g = c.createGain(), tau = base / Math.pow(n, 0.7);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amps[n - 1] * 0.5, t + 0.004);
        g.gain.setTargetAtTime(0.0001, t + 0.01, tau / 3);
        o.connect(g); g.connect(lp); o.start(t); oscs.push(o);
      }
      return { out: out, oscs: oscs, relTime: 0.14 };
    },
    epiano: function (c, f, t) {
      var out = c.createGain(), oscs = [];
      var car = osc(c, 'sine', f), mod = osc(c, 'sine', f), tine = osc(c, 'sine', f * 14);
      var mg = c.createGain(), tg = c.createGain(), env = c.createGain();
      mg.gain.setValueAtTime(f * 1.6, t); mg.gain.setTargetAtTime(f * 0.18, t, 0.5);
      tg.gain.setValueAtTime(f * 0.7, t); tg.gain.setTargetAtTime(0, t, 0.04);
      mod.connect(mg); mg.connect(car.frequency);
      tine.connect(tg); tg.connect(car.frequency);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.55, t + 0.005); env.gain.setTargetAtTime(0.0001, t + 0.01, 1.6);
      car.connect(env); env.connect(out);
      [car, mod, tine].forEach(function (o) { o.start(t); oscs.push(o); });
      return { out: out, oscs: oscs, relTime: 0.2 };
    },
    organ: function (c, f, t) {
      var out = c.createGain(), oscs = [], bars = [[0.5, 0.3], [1, 0.8], [2, 0.6], [3, 0.5], [4, 0.3], [6, 0.18], [8, 0.14]];
      var env = c.createGain(), lfo = osc(c, 'sine', 6), lg = c.createGain();
      lg.gain.value = 6; lfo.connect(lg);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.32, t + 0.012);
      env.connect(out);
      bars.forEach(function (b) {
        var o = osc(c, 'sine', f * b[0]), g = c.createGain();
        g.gain.value = b[1]; lg.connect(o.detune);
        o.connect(g); g.connect(env); o.start(t); oscs.push(o);
      });
      lfo.start(t); oscs.push(lfo);
      return { out: out, oscs: oscs, relTime: 0.07 };
    },
    synth: function (c, f, t) {
      var out = c.createGain(), oscs = [], env = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.Q.value = 7;
      lp.frequency.setValueAtTime(Math.min(12000, f * 14), t); lp.frequency.setTargetAtTime(Math.max(500, f * 2.6), t, 0.22);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.34, t + 0.01); env.gain.setTargetAtTime(0.2, t + 0.01, 0.3);
      [[ 'sawtooth', 1, -8 ], [ 'sawtooth', 1, 8 ], [ 'square', 0.5, 0 ]].forEach(function (p) {
        var o = osc(c, p[0], f * p[1], p[2]), g = c.createGain();
        g.gain.value = p[0] === 'square' ? 0.5 : 0.7;
        o.connect(g); g.connect(lp); o.start(t); oscs.push(o);
      });
      lp.connect(env); env.connect(out);
      return { out: out, oscs: oscs, relTime: 0.16 };
    },
    strings: function (c, f, t) {
      var out = c.createGain(), oscs = [], env = c.createGain(), lp = c.createBiquadFilter(), lfo = osc(c, 'sine', 5.2), lg = c.createGain();
      lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(Math.min(1500, f * 3), t); lp.frequency.linearRampToValueAtTime(Math.min(5200, f * 7), t + 0.7);
      env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.3, t + 0.4);
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + 0.9); lfo.connect(lg);
      [-11, -4, 4, 11].forEach(function (d) {
        var o = osc(c, 'sawtooth', f, d), g = c.createGain();
        g.gain.value = 0.55; lg.connect(o.detune);
        o.connect(g); g.connect(lp); o.start(t); oscs.push(o);
      });
      lfo.start(t); oscs.push(lfo);
      lp.connect(env); env.connect(out);
      return { out: out, oscs: oscs, relTime: 0.5 };
    }
  };

  function startVoice(midi) {
    var c = getCtx();
    if (!c) return null;
    var t = c.currentTime + 0.005, f = 440 * Math.pow(2, (midi - 69) / 12), v = BUILD[sound](c, f, t);
    v.out.connect(master);
    v.stopped = false;
    v.release = function () {
      if (v.stopped) return;
      v.stopped = true;
      var now = c.currentTime;
      v.out.gain.setTargetAtTime(0, now, v.relTime / 3);
      var end = now + v.relTime * 2.2;
      v.oscs.forEach(function (o) { try { o.stop(end); } catch (e) {} });
      setTimeout(function () { try { v.out.disconnect(); } catch (e) {} }, (v.relTime * 2.4 + 0.1) * 1000);
    };
    return v;
  }

  /* ---------- keyboard ---------- */
  var oct = 4, sustainLatch = false, spaceDown = false, showLabels = true;
  var keysEl = $('kb-keys'), nowEl = $('kb-now');
  var keyEls = {};            // midi -> element
  var voices = {};            // midi -> {v, srcs:{}}
  var held = [];              // voices waiting for sustain to end
  var scaleState = null;      // {tonic, minor}
  var CK = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
  var KEYCAP = {};
  Object.keys(CK).forEach(function (k) { KEYCAP[CK[k]] = k.toUpperCase(); });
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };

  function sustainOn() { return sustainLatch || spaceDown; }
  function midiName(m) { return noteNameFor(m % 12) + (Math.floor(m / 12) - 1); }
  function noteNameFor(pc) { return scaleState ? K.noteName(pc, K.usesFlats(scaleState.tonic, scaleState.minor)) : K.noteName(pc, false); }

  function buildKeys() {
    releaseAll();
    keysEl.innerHTML = '';
    keyEls = {};
    var start = oct * 12, end = start + 36, whites = 0, m;
    for (m = start; m <= end; m++) if (!BLACK[m % 12]) whites++;
    var wi = 0;
    for (m = start; m <= end; m++) {
      var pc = m % 12, el = document.createElement('div'), cap = KEYCAP[m - (oct + 1) * 12];
      el.dataset.m = m;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', midiName(m));
      if (BLACK[pc]) {
        el.className = 'kb-b';
        el.style.left = 'calc(' + (wi * 100 / whites) + '% - ' + (50 / whites * 0.6) + '%)';
        el.style.width = (100 / whites * 0.6) + '%';
      } else {
        el.className = 'kb-w';
        wi++;
      }
      var lab = document.createElement('small');
      lab.textContent = pc === 0 ? midiName(m) : noteNameFor(pc);
      el.appendChild(lab);
      if (cap) { var em = document.createElement('em'); em.textContent = cap; el.appendChild(em); }
      keysEl.appendChild(el);
      keyEls[m] = el;
    }
    $('kb-oct-label').textContent = 'Octave ' + oct;
    applyScale();
  }

  function applyScale() {
    var pcs = scaleState ? K.scalePcs(scaleState.tonic, scaleState.minor) : [];
    Object.keys(keyEls).forEach(function (m) {
      var el = keyEls[m], pc = m % 12;
      el.classList.toggle('scale', pcs.indexOf(pc) >= 0);
      el.classList.toggle('tonic', !!scaleState && pc === scaleState.tonic);
      var lab = el.firstChild;
      lab.textContent = pc === 0 ? midiName(+m) : noteNameFor(pc);
    });
  }

  function refreshNow() {
    var ms = Object.keys(voices).map(Number).sort(function (a, b) { return a - b; });
    nowEl.textContent = ms.length ? 'Playing: ' + ms.map(midiName).join('  ') : '';
  }

  function press(m, src) {
    var e = voices[m];
    if (e && e.srcs[src]) return;
    if (!e) {
      /* a voice for this note may still be ringing on sustain: cut it and play again */
      for (var i = held.length - 1; i >= 0; i--) if (held[i].m === m) { held[i].v.release(); held.splice(i, 1); }
      var v = startVoice(m);
      if (!v) { nowEl.textContent = 'Your browser cannot play audio here.'; return; }
      e = voices[m] = { v: v, srcs: {} };
      if (keyEls[m]) keyEls[m].classList.add('on');
    }
    e.srcs[src] = 1;
    refreshNow();
  }
  function lift(m, src) {
    var e = voices[m];
    if (!e || !e.srcs[src]) return;
    delete e.srcs[src];
    if (Object.keys(e.srcs).length) return;
    delete voices[m];
    if (keyEls[m]) keyEls[m].classList.remove('on');
    if (sustainOn()) held.push({ m: m, v: e.v }); else e.v.release();
    refreshNow();
  }
  function releaseHeld() { held.forEach(function (h) { h.v.release(); }); held = []; }
  function releaseAll() {
    Object.keys(voices).forEach(function (m) { voices[m].v.release(); if (keyEls[m]) keyEls[m].classList.remove('on'); });
    voices = {}; releaseHeld(); refreshNow();
  }
  function syncSustain() {
    var on = sustainOn();
    $('kb-sustain').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on) releaseHeld();
  }

  /* mouse and touch, with sliding across keys */
  var pointers = {};
  function keyAt(x, y) {
    var el = document.elementFromPoint(x, y);
    el = el && el.closest ? el.closest('[data-m]') : null;
    return el && keysEl.contains(el) ? +el.dataset.m : null;
  }
  keysEl.addEventListener('pointerdown', function (e) {
    var m = keyAt(e.clientX, e.clientY);
    if (m === null) return;
    e.preventDefault();
    pointers[e.pointerId] = m;
    press(m, 'p' + e.pointerId);
  });
  window.addEventListener('pointermove', function (e) {
    if (!(e.pointerId in pointers)) return;
    var m = keyAt(e.clientX, e.clientY), cur = pointers[e.pointerId];
    if (m === cur || m === null) return;
    lift(cur, 'p' + e.pointerId);
    pointers[e.pointerId] = m;
    press(m, 'p' + e.pointerId);
  });
  function pointerEnd(e) {
    if (!(e.pointerId in pointers)) return;
    lift(pointers[e.pointerId], 'p' + e.pointerId);
    delete pointers[e.pointerId];
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  keysEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* computer keyboard */
  function typing(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  function setOct(n) { oct = Math.max(1, Math.min(6, n)); buildKeys(); }
  document.addEventListener('keydown', function (e) {
    if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ' ') { e.preventDefault(); if (!spaceDown) { spaceDown = true; syncSustain(); } return; }
    if (e.repeat) { if (k in CK) e.preventDefault(); return; }
    if (k === 'z') { setOct(oct - 1); return; }
    if (k === 'x') { setOct(oct + 1); return; }
    if (k in CK) { e.preventDefault(); press((oct + 1) * 12 + CK[k], 'k' + k); }
  });
  document.addEventListener('keyup', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ' ') { if (!typing(e.target)) e.preventDefault(); spaceDown = false; syncSustain(); return; }
    if (k in CK) lift((oct + 1) * 12 + CK[k], 'k' + k);
  });
  window.addEventListener('blur', function () { spaceDown = false; releaseAll(); syncSustain(); });

  /* controls */
  Array.prototype.forEach.call(document.querySelectorAll('.kb-sounds button'), function (b) {
    b.addEventListener('click', function () {
      sound = b.dataset.sound;
      Array.prototype.forEach.call(document.querySelectorAll('.kb-sounds button'), function (o) { o.setAttribute('aria-checked', o === b ? 'true' : 'false'); });
      press(60, 'demo'); setTimeout(function () { lift(60, 'demo'); }, 350);
    });
  });
  $('kb-vol').addEventListener('input', function () {
    volume = this.value / 100;
    if (master) master.gain.value = volume * 0.5;
  });
  $('kb-oct-down').addEventListener('click', function () { setOct(oct - 1); });
  $('kb-oct-up').addEventListener('click', function () { setOct(oct + 1); });
  $('kb-sustain').addEventListener('click', function () { sustainLatch = !sustainLatch; syncSustain(); });
  $('kb-labels').addEventListener('change', function () { showLabels = this.checked; keysEl.classList.toggle('nolabels', !showLabels); });

  /* ---------- key finder ---------- */
  var statusEl = $('kb-status'), resultEl = $('kb-result'), levelEl = $('kb-level');
  var live = null;            // {stream, actx, timer, an, buf, start}
  var fileToken = 0, lastText = '';

  function setStatus(t) { statusEl.textContent = t; }
  function showButtons(running) {
    $('kb-stop').hidden = !running;
    ['kb-mic', 'kb-tab', 'kb-file-btn'].forEach(function (id) { $(id).disabled = running; });
  }

  function render(an, final) {
    var ch = an.chroma, sum = 0, mx = 0, i;
    for (i = 0; i < 12; i++) { sum += ch[i]; if (ch[i] > mx) mx = ch[i]; }
    if (!sum) return;
    var norm = Array.prototype.map.call(ch, function (v) { return v / sum; });
    var list = K.estimate(norm), best = list[0], rel = K.relativeOf(best);
    var conf = K.confidence(list);
    var seconds = an.frames / 4;
    if (!final) conf *= Math.min(1, seconds / 12);
    resultEl.hidden = false;
    $('kb-key').textContent = K.keyName(best.tonic, best.minor);
    $('kb-rel').textContent = 'Same notes as ' + K.keyName(rel.tonic, rel.minor);
    $('kb-conf-bar').style.width = Math.round(conf * 100) + '%';
    $('kb-conf-txt').textContent = conf > 0.66 ? 'High' : conf > 0.33 ? 'Medium' : 'Low';
    var others = list.filter(function (k) { return !(k.tonic === best.tonic && k.minor === best.minor) && !(k.tonic === rel.tonic && k.minor === rel.minor); }).slice(0, 2);
    var alt = $('kb-alt');
    alt.innerHTML = '';
    var chip = function (label, k) {
      var s = document.createElement('span'), b = document.createElement('b');
      b.textContent = K.keyName(k.tonic, k.minor);
      s.appendChild(document.createTextNode(label + ' ')); s.appendChild(b);
      alt.appendChild(s);
    };
    chip('Or', rel);
    others.forEach(function (k) { chip('Or', k); });
    var flats = K.usesFlats(best.tonic, best.minor), pcs = K.scalePcs(best.tonic, best.minor), cr = $('kb-chroma');
    cr.innerHTML = '';
    for (i = 0; i < 12; i++) {
      var d = document.createElement('div'), bar = document.createElement('i');
      bar.style.height = Math.max(2, Math.round(ch[i] / mx * 100)) + '%';
      d.appendChild(bar); d.appendChild(document.createTextNode(K.noteName(i, flats)));
      if (pcs.indexOf(i) >= 0) d.className = 'in';
      cr.appendChild(d);
    }
    scaleState = { tonic: best.tonic, minor: best.minor };
    applyScale();
    $('kb-reset').disabled = false;
    lastText = 'Key: ' + K.keyName(best.tonic, best.minor) + ' (same notes as ' + K.keyName(rel.tonic, rel.minor) + '). Scale: ' + pcs.map(function (p) { return K.noteName(p, flats); }).join(' ');
  }

  function stopLive(msg) {
    if (!live) return;
    clearInterval(live.timer);
    live.stream.getTracks().forEach(function (t) { t.stop(); });
    try { live.actx.close(); } catch (e) {}
    var had = live.an.frames;
    live = null;
    levelEl.style.width = '0';
    showButtons(false);
    setStatus(msg || (had ? 'Stopped. The result stays on screen.' : 'Stopped.'));
  }

  function startLive(stream, label) {
    var actx = new AC(), src = actx.createMediaStreamSource(stream), analyser = actx.createAnalyser();
    analyser.fftSize = K.SIZE; analyser.smoothingTimeConstant = 0;
    src.connect(analyser);
    if (actx.state === 'suspended') actx.resume();
    var an = new K.Analyzer(actx.sampleRate, 0.992), buf = new Float32Array(K.SIZE);
    live = { stream: stream, actx: actx, an: an, start: Date.now() };
    live.timer = setInterval(function () {
      analyser.getFloatTimeDomainData(buf);
      var r = K.rmsOf(buf, 0, K.SIZE);
      levelEl.style.width = Math.min(100, Math.round(r * 500)) + '%';
      if (r > 0.004) an.frame(buf, 0);
      var secs = Math.round(an.frames / 4);
      if (!an.frames) { setStatus('Listening to ' + label + '. Waiting for sound. Turn the music up or move it closer.'); return; }
      setStatus('Listening to ' + label + ': ' + secs + ' s heard.' + (secs < 10 ? ' About 10 to 20 s gives a reliable answer.' : ''));
      if (an.frames >= 6) render(an, false);
    }, 250);
    stream.getTracks().forEach(function (t) { t.addEventListener('ended', function () { stopLive('The audio source ended.'); }); });
    showButtons(true);
    $('kb-reset').disabled = false;
    setStatus('Listening to ' + label + '...');
  }

  function clearResult() {
    resultEl.hidden = true;
    scaleState = null; applyScale();
    if (live) live.an.reset();
    $('kb-reset').disabled = !live;
    setStatus(live ? 'Started again. Listening...' : 'Waiting. Choose a source above.');
  }

  $('kb-mic').addEventListener('click', function () {
    if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setStatus('This browser cannot use the microphone on this page. Try Chrome, Edge or Safari over https.'); return; }
    setStatus('Waiting for microphone permission...');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
      startLive(s, 'the microphone');
    }, function (err) {
      setStatus(err && err.name === 'NotAllowedError' ? 'Microphone permission was blocked. Allow it in the address bar and try again.' : 'No microphone could be opened.');
    });
  });

  $('kb-tab').addEventListener('click', function () {
    if (!AC || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { setStatus('Listening to a tab works in Chrome and Edge on a computer. Use the microphone or a file here.'); return; }
    setStatus('Choose the tab that is playing the song, and tick Share tab audio...');
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).then(function (s) {
      if (!s.getAudioTracks().length) {
        s.getTracks().forEach(function (t) { t.stop(); });
        setStatus('No audio was shared. Choose a tab and tick Share tab audio, then try again.');
        return;
      }
      startLive(s, 'the shared tab');
    }, function () { setStatus('Sharing was cancelled.'); });
  });

  function analyseFile(file) {
    if (!file) return;
    if (live) stopLive('');
    var token = ++fileToken, dctx;
    try { dctx = new AC(); } catch (e) { setStatus('This browser cannot read audio.'); return; }
    showButtons(true);
    setStatus('Reading ' + file.name + '...');
    file.arrayBuffer().then(function (ab) {
      return new Promise(function (res, rej) { dctx.decodeAudioData(ab, res, rej); });
    }).then(function (buffer) {
      try { dctx.close(); } catch (e) {}
      return K.analyseBuffer(buffer, function (p) {
        if (token === fileToken) { setStatus('Analysing ' + file.name + ': ' + Math.round(p * 100) + '%'); }
      }, function () { return token !== fileToken; });
    }).then(function (an) {
      if (token !== fileToken || !an) return;
      showButtons(false);
      if (!an.frames) { setStatus('That file has no usable sound in it.'); return; }
      render(an, true);
      setStatus('Done. This is the key of the whole file. It stays on screen.');
    }).catch(function () {
      if (token !== fileToken) return;
      try { dctx.close(); } catch (e) {}
      showButtons(false);
      setStatus('This file could not be read. Try an MP3, WAV, M4A or OGG file.');
    });
  }
  $('kb-file-btn').addEventListener('click', function () { $('kb-file').click(); });
  $('kb-file').addEventListener('change', function () { analyseFile(this.files[0]); this.value = ''; });
  var drop = $('kb-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { analyseFile(e.dataTransfer.files[0]); });
  $('kb-stop').addEventListener('click', function () {
    if (live) stopLive(); else { fileToken++; showButtons(false); setStatus('Stopped.'); }
  });
  $('kb-reset').addEventListener('click', clearResult);

  var scaleTimer = null;
  $('kb-play-scale').addEventListener('click', function () {
    if (!scaleState) return;
    clearTimeout(scaleTimer);
    var base = (oct + 1) * 12 + scaleState.tonic, steps = (scaleState.minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12]), i = 0;
    (function next() {
      if (i > 0) lift(base + steps[i - 1], 'scale');
      if (i >= steps.length) return;
      press(base + steps[i], 'scale');
      i++;
      scaleTimer = setTimeout(next, 380);
    })();
  });
  $('kb-copy').addEventListener('click', function () {
    var b = this;
    function done() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy result'; }, 1500); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastText).then(done, function () {});
  });

  buildKeys();
})();

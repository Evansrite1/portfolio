window.AM = window.AM || {};
(function () {
  'use strict';

  /* Audio mastering: MIDI part.
     Instruments made only with Web Audio nodes, MIDI note scheduling for the engine,
     Standard MIDI file reading and writing, Web MIDI keyboard input with recording,
     and a canvas piano roll editor. */

  var AM = window.AM;

  // ---------------------------------------------------------------- helpers

  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }
  function noteName(n) {
    n = Math.round(num(n, 60));
    return NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
  }
  function velCurve(v) { return Math.max(0.02, Math.pow(clamp(num(v, 0.8), 0, 1), 1.2)); }
  function now(ctx) { return num(ctx && ctx.currentTime, 0); }
  function safe(fn) { try { fn(); } catch (e) { /* node already stopped or disconnected */ } }

  function defaultsOf(descs) {
    var o = {};
    descs.forEach(function (d) { o[d.key] = d.def; });
    return o;
  }
  function mergeParams(descs, params) {
    var o = defaultsOf(descs);
    if (params) {
      descs.forEach(function (d) {
        if (params[d.key] !== undefined && params[d.key] !== null && isFinite(+params[d.key])) {
          o[d.key] = clamp(+params[d.key], d.min, d.max);
        }
      });
    }
    return o;
  }

  function makeOsc(ctx, type, freq, t0) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    return o;
  }
  function makeGain(ctx, v) {
    var g = ctx.createGain();
    g.gain.value = v;
    return g;
  }
  function makeFilter(ctx, type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }
  function pluck(param, t0, peak, dur) {
    param.setValueAtTime(Math.max(peak, 0.0002), t0);
    param.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, 0.005));
  }

  // Envelope e = { param, b (start), p (peak), s (sustain), A, D, R, end }.
  // Attack is a linear ramp, decay and release are exponential (setTargetAtTime),
  // which keeps later releases safe to cancel and re-plan.
  function envLevel(e, t0, t) {
    if (t <= t0) return e.b;
    var tA = t0 + e.A;
    if (t < tA) return e.b + (e.p - e.b) * (t - t0) / e.A;
    var tc = Math.max(e.D / 3, 0.001);
    return e.s + (e.p - e.s) * Math.exp(-(t - tA) / tc);
  }
  function planEnv(e, t0, tr) {
    var p = e.param, tA = t0 + e.A, tc = Math.max(e.D / 3, 0.001);
    p.setValueAtTime(e.b, t0);
    if (tr === undefined || tr >= tA) {
      p.linearRampToValueAtTime(e.p, tA);
      p.setTargetAtTime(e.s, tA + 1e-4, tc);
    } else {
      p.linearRampToValueAtTime(envLevel(e, t0, tr), tr);
    }
    if (tr !== undefined) {
      if (tr > tA + 1e-4) p.setValueAtTime(envLevel(e, t0, tr), tr);
      p.setTargetAtTime(e.end, tr, Math.max(e.R / 4, 0.001));
    }
    return tr;
  }
  function liveRelease(e, t0, tr) {
    var p = e.param, tA = t0 + e.A;
    if (tr >= tA + 2e-4) {
      p.cancelScheduledValues(tr);
      p.setValueAtTime(envLevel(e, t0, tr), tr);
    } else if (typeof p.cancelAndHoldAtTime === 'function') {
      p.cancelAndHoldAtTime(tr);
    } else {
      // No cancelAndHold (older Firefox): keep the attack ramp, release right after it.
      tr = tA + 5e-5;
      p.cancelScheduledValues(tr);
    }
    p.setTargetAtTime(e.end, tr, Math.max(e.R / 4, 0.001));
    return tr;
  }

  // ---------------------------------------------------------------- voices

  function Poly(ctx) {
    this.ctx = ctx;
    this.voices = [];
  }
  Poly.prototype.cleanup = function (vo) {
    if (vo.dead) return;
    vo.dead = true;
    var i = this.voices.indexOf(vo);
    if (i >= 0) this.voices.splice(i, 1);
    vo.nodes.forEach(function (nd) { safe(function () { nd.disconnect(); }); });
    if (vo.onDispose) safe(vo.onDispose);
  };
  // spec = { sources (already started at t0), nodes, envs, oneShot, length, choke, onDispose }
  Poly.prototype.add = function (n, v, t0, spec) {
    var self = this;
    var vo = {
      n: n, v: v, t0: t0, off: null, dead: false,
      sources: spec.sources, nodes: spec.nodes.concat(spec.sources),
      envs: spec.envs || [], oneShot: !!spec.oneShot, choke: spec.choke || null,
      onDispose: spec.onDispose || null, stopAt: Infinity
    };
    vo.envs.forEach(function (e) { planEnv(e, t0); });
    if (vo.oneShot) {
      vo.stopAt = t0 + spec.length;
      vo.sources.forEach(function (s) { safe(function () { s.stop(vo.stopAt); }); });
    }
    if (vo.sources[0]) vo.sources[0].onended = function () { self.cleanup(vo); };
    this.voices.push(vo);
    return vo;
  };
  Poly.prototype.release = function (vo, tr) {
    if (!vo || vo.dead || vo.oneShot) return;
    var t = now(this.ctx);
    tr = Math.max(num(tr, t), vo.t0);
    if (vo.off !== null && tr >= vo.off) return;
    var future = vo.t0 >= t;
    if (!future) tr = Math.max(tr, t);
    var stopAt = tr;
    vo.envs.forEach(function (e) {
      var r;
      if (future) {
        e.param.cancelScheduledValues(vo.t0);
        r = planEnv(e, vo.t0, tr);
      } else {
        r = liveRelease(e, vo.t0, tr);
      }
      stopAt = Math.max(stopAt, r + e.R * 1.6 + 0.03);
    });
    vo.off = tr;
    vo.stopAt = stopAt;
    vo.sources.forEach(function (s) { safe(function () { s.stop(stopAt); }); });
  };
  // Stops a voice at time t: a voice that has not started yet is removed,
  // a sounding one is released (drums are faded out fast).
  Poly.prototype.kill = function (vo, t) {
    if (!vo || vo.dead) return;
    t = Math.max(num(t, now(this.ctx)), now(this.ctx));
    if (vo.t0 >= t - 1e-9) {
      vo.sources.forEach(function (s) { safe(function () { s.stop(vo.t0); }); });
      this.cleanup(vo);
    } else if (vo.oneShot) {
      if (t >= vo.stopAt) return;
      if (vo.choke) {
        var g = vo.choke.gain;
        g.setValueAtTime(1, t);
        g.linearRampToValueAtTime(0, t + 0.015);
      }
      var st = t + 0.02;
      vo.stopAt = st;
      vo.sources.forEach(function (s) { safe(function () { s.stop(st); }); });
    } else {
      this.release(vo, t);
    }
  };
  Poly.prototype.noteOff = function (n, when) {
    var t = num(when, now(this.ctx));
    for (var i = this.voices.length - 1; i >= 0; i--) {
      var vo = this.voices[i];
      if (vo.n === n && vo.off === null && !vo.dead && !vo.oneShot && vo.t0 <= t + 1e-9) {
        this.release(vo, t);
        return vo;
      }
    }
    return null;
  };
  Poly.prototype.allOff = function (when) {
    var self = this, t = num(when, now(this.ctx));
    this.voices.slice().forEach(function (vo) { self.kill(vo, t); });
  };
  Poly.prototype.hardStop = function () {
    var self = this;
    this.voices.slice().forEach(function (vo) {
      vo.sources.forEach(function (s) { safe(function () { s.stop(); }); });
      self.cleanup(vo);
    });
  };

  // Builds the public instrument object around a voice builder.
  function makeInstrument(ctx, descs, params, build, extra) {
    var p = mergeParams(descs, params);
    var out = makeGain(ctx, p.volume);
    var poly = new Poly(ctx);
    var state = { p: p, out: out, poly: poly, bus: out };
    if (extra && extra.setup) extra.setup(state);
    var inst = {
      output: out,
      params: p,
      noteOn: function (n, v, when) {
        n = clamp(Math.round(num(n, 60)), 0, 127);
        v = clamp(num(v, 0.8), 0, 1);
        var t0 = Math.max(num(when, now(ctx)), now(ctx));
        if (extra && extra.before) extra.before(state, n, t0);
        var spec = build(state, n, v, t0);
        return poly.add(n, v, t0, spec);
      },
      noteOff: function (n, when) {
        return poly.noteOff(clamp(Math.round(num(n, 60)), 0, 127), when);
      },
      allOff: function (when) { poly.allOff(when); },
      release: function (handle, when) { poly.release(handle, when); },
      cancel: function (handle, when) { poly.kill(handle, when); },
      set: function (params2) {
        var np = mergeParams(descs, params2);
        Object.keys(np).forEach(function (k) { p[k] = np[k]; });
        out.gain.setValueAtTime(p.volume, now(ctx));
        if (extra && extra.update) extra.update(state);
      },
      activeVoices: function () { return poly.voices.length; },
      dispose: function () {
        poly.hardStop();
        if (extra && extra.dispose) safe(function () { extra.dispose(state); });
        safe(function () { out.disconnect(); });
      }
    };
    return inst;
  }

  // ---------------------------------------------------------------- instruments

  var WAVES = ['sine', 'triangle', 'sawtooth', 'square'];

  var SYNTH_PARAMS = [
    { key: 'wave', label: 'Wave', min: 0, max: 3, step: 1, def: 2, unit: '', options: ['Sine', 'Triangle', 'Saw', 'Square'] },
    { key: 'detune', label: 'Detune', min: 0, max: 50, step: 1, def: 8, unit: 'cents' },
    { key: 'cutoff', label: 'Filter cutoff', min: 60, max: 16000, step: 1, def: 2400, unit: 'Hz' },
    { key: 'resonance', label: 'Resonance', min: 0.1, max: 20, step: 0.1, def: 2, unit: '' },
    { key: 'envAmount', label: 'Filter envelope', min: 0, max: 6, step: 0.1, def: 2, unit: 'oct' },
    { key: 'attack', label: 'Attack', min: 0.001, max: 4, step: 0.001, def: 0.01, unit: 's' },
    { key: 'decay', label: 'Decay', min: 0.01, max: 4, step: 0.01, def: 0.3, unit: 's' },
    { key: 'sustain', label: 'Sustain', min: 0, max: 1, step: 0.01, def: 0.6, unit: '' },
    { key: 'release', label: 'Release', min: 0.01, max: 6, step: 0.01, def: 0.3, unit: 's' },
    { key: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01, def: 0.8, unit: '' }
  ];

  function buildSynth(st, n, v, t0) {
    var ctx = st.out.context, p = st.p, f = mtof(n), vc = velCurve(v);
    var type = WAVES[clamp(Math.round(p.wave), 0, 3)];
    var o1 = makeOsc(ctx, type, f, t0), o2 = makeOsc(ctx, type, f, t0);
    o1.detune.setValueAtTime(-p.detune / 2, t0);
    o2.detune.setValueAtTime(p.detune / 2, t0);
    var mix = makeGain(ctx, 0.5);
    var cut = clamp(p.cutoff * Math.pow(2, (n - 60) / 40), 20, 18000);
    var peak = clamp(cut * Math.pow(2, p.envAmount * (0.5 + 0.5 * v)), 20, 18000);
    var filt = makeFilter(ctx, 'lowpass', cut, p.resonance);
    var vca = makeGain(ctx, 0);
    o1.connect(mix); o2.connect(mix); mix.connect(filt); filt.connect(vca); vca.connect(st.bus);
    o1.start(t0); o2.start(t0);
    var amp = 0.22 * vc;
    return {
      sources: [o1, o2], nodes: [mix, filt, vca],
      envs: [
        { param: vca.gain, b: 0, p: amp, s: amp * p.sustain, A: p.attack, D: p.decay, R: p.release, end: 0 },
        { param: filt.frequency, b: cut, p: peak, s: cut + (peak - cut) * p.sustain * 0.5, A: p.attack, D: p.decay, R: p.release, end: cut }
      ]
    };
  }

  var PIANO_PARAMS = [
    { key: 'tone', label: 'Brightness', min: 0, max: 10, step: 0.1, def: 3.5, unit: '' },
    { key: 'bell', label: 'Bell', min: 0, max: 1, step: 0.01, def: 0.35, unit: '' },
    { key: 'decay', label: 'Decay', min: 0.3, max: 10, step: 0.1, def: 3, unit: 's' },
    { key: 'release', label: 'Release', min: 0.02, max: 3, step: 0.01, def: 0.25, unit: 's' },
    { key: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01, def: 0.8, unit: '' }
  ];

  // Electric piano: two operator FM with a short high "tine" modulator, decaying amplitude.
  function buildPiano(st, n, v, t0) {
    var ctx = st.out.context, p = st.p, f = mtof(n), vc = velCurve(v);
    var kt = Math.pow(2, -(n - 60) / 24);
    var car = makeOsc(ctx, 'sine', f, t0);
    var mod = makeOsc(ctx, 'sine', f, t0);
    var modG = makeGain(ctx, 0);
    mod.connect(modG); modG.connect(car.frequency);
    var sources = [car, mod], nodes = [modG];
    var envs = [];
    var index = p.tone * 0.5 * (0.3 + 0.7 * v);
    envs.push({ param: modG.gain, b: 0, p: f * index, s: f * index * 0.12, A: 0.001, D: 1.2 * kt, R: p.release, end: f * index * 0.12 });
    if (p.bell > 0 && f * 14 < 16000) {
      var tine = makeOsc(ctx, 'sine', f * 14, t0);
      var tineG = makeGain(ctx, 0);
      tine.connect(tineG); tineG.connect(car.frequency);
      sources.push(tine); nodes.push(tineG);
      envs.push({ param: tineG.gain, b: 0, p: f * p.bell * 2.5 * v, s: 0, A: 0.001, D: 0.25, R: p.release, end: 0 });
    }
    var vca = makeGain(ctx, 0);
    car.connect(vca); vca.connect(st.bus);
    nodes.push(vca);
    var amp = 0.3 * vc, tc = Math.max(p.decay * kt * 0.5, 0.05);
    envs.push({ param: vca.gain, b: 0, p: amp, s: 0, A: 0.002, D: tc * 3, R: p.release, end: 0 });
    sources.forEach(function (s) { s.start(t0); });
    return { sources: sources, nodes: nodes, envs: envs };
  }

  var BASS_PARAMS = [
    { key: 'wave', label: 'Wave', min: 0, max: 1, step: 1, def: 0, unit: '', options: ['Saw', 'Square'] },
    { key: 'sub', label: 'Sub', min: 0, max: 1, step: 0.01, def: 0.5, unit: '' },
    { key: 'cutoff', label: 'Filter cutoff', min: 40, max: 5000, step: 1, def: 500, unit: 'Hz' },
    { key: 'resonance', label: 'Resonance', min: 0.1, max: 20, step: 0.1, def: 4, unit: '' },
    { key: 'envAmount', label: 'Filter envelope', min: 0, max: 6, step: 0.1, def: 2.5, unit: 'oct' },
    { key: 'decay', label: 'Decay', min: 0.02, max: 2, step: 0.01, def: 0.25, unit: 's' },
    { key: 'sustain', label: 'Sustain', min: 0, max: 1, step: 0.01, def: 0.5, unit: '' },
    { key: 'release', label: 'Release', min: 0.01, max: 2, step: 0.01, def: 0.08, unit: 's' },
    { key: 'drive', label: 'Drive', min: 0, max: 1, step: 0.01, def: 0.2, unit: '' },
    { key: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01, def: 0.8, unit: '' }
  ];

  function driveCurve(amount) {
    var k = amount * 20, len = 1024, c = new Float32Array(len), norm = Math.tanh(1 + k);
    for (var i = 0; i < len; i++) {
      var x = i / (len - 1) * 2 - 1;
      c[i] = Math.tanh(x * (1 + k)) / norm;
    }
    return c;
  }

  function buildBass(st, n, v, t0) {
    var ctx = st.out.context, p = st.p, f = mtof(n), vc = velCurve(v);
    var o1 = makeOsc(ctx, p.wave >= 0.5 ? 'square' : 'sawtooth', f, t0);
    var sub = makeOsc(ctx, 'sine', f / 2, t0);
    var g1 = makeGain(ctx, 1 - p.sub * 0.4), gs = makeGain(ctx, p.sub);
    var cut = clamp(p.cutoff, 20, 18000);
    var peak = clamp(cut * Math.pow(2, p.envAmount * (0.4 + 0.6 * v)), 20, 18000);
    var filt = makeFilter(ctx, 'lowpass', cut, p.resonance);
    var vca = makeGain(ctx, 0);
    o1.connect(g1); g1.connect(filt); sub.connect(gs); gs.connect(vca);
    filt.connect(vca); vca.connect(st.bus);
    o1.start(t0); sub.start(t0);
    var amp = 0.38 * vc;
    return {
      sources: [o1, sub], nodes: [g1, gs, filt, vca],
      envs: [
        { param: vca.gain, b: 0, p: amp, s: amp * Math.max(p.sustain, 0.0), A: 0.003, D: p.decay, R: p.release, end: 0 },
        { param: filt.frequency, b: cut, p: peak, s: cut + (peak - cut) * p.sustain * 0.3, A: 0.002, D: p.decay, R: p.release, end: cut }
      ]
    };
  }

  var PAD_PARAMS = [
    { key: 'spread', label: 'Detune spread', min: 0, max: 60, step: 1, def: 16, unit: 'cents' },
    { key: 'cutoff', label: 'Filter cutoff', min: 200, max: 12000, step: 1, def: 2500, unit: 'Hz' },
    { key: 'resonance', label: 'Resonance', min: 0.1, max: 10, step: 0.1, def: 0.8, unit: '' },
    { key: 'attack', label: 'Attack', min: 0.01, max: 6, step: 0.01, def: 0.9, unit: 's' },
    { key: 'release', label: 'Release', min: 0.05, max: 8, step: 0.01, def: 2, unit: 's' },
    { key: 'motion', label: 'Motion', min: 0, max: 1, step: 0.01, def: 0.3, unit: '' },
    { key: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01, def: 0.8, unit: '' }
  ];

  var PAD_SPREAD = [-1, -0.5, 0, 0.5, 1];

  function buildPad(st, n, v, t0) {
    var ctx = st.out.context, p = st.p, f = mtof(n), vc = velCurve(v);
    var mix = makeGain(ctx, 1 / PAD_SPREAD.length);
    var sources = PAD_SPREAD.map(function (k) {
      var o = makeOsc(ctx, 'sawtooth', f, t0);
      o.detune.setValueAtTime(k * p.spread, t0);
      o.connect(mix);
      return o;
    });
    var filt = makeFilter(ctx, 'lowpass', clamp(p.cutoff, 20, 18000), p.resonance);
    var vca = makeGain(ctx, 0);
    mix.connect(filt); filt.connect(vca); vca.connect(st.bus);
    var lfoG = st.lfoGain;
    if (lfoG) lfoG.connect(filt.detune);
    sources.forEach(function (s) { s.start(t0); });
    var amp = 0.2 * vc;
    return {
      sources: sources, nodes: [mix, filt, vca],
      envs: [{ param: vca.gain, b: 0, p: amp, s: amp * 0.8, A: p.attack, D: 1.5, R: p.release, end: 0 }],
      onDispose: function () { if (lfoG) safe(function () { lfoG.disconnect(filt.detune); }); }
    };
  }

  var DRUM_PARAMS = [
    { key: 'tune', label: 'Tune', min: -12, max: 12, step: 1, def: 0, unit: 'st' },
    { key: 'decay', label: 'Decay', min: 0.3, max: 2, step: 0.01, def: 1, unit: 'x' },
    { key: 'tone', label: 'Tone', min: 0, max: 1, step: 0.01, def: 0.5, unit: '' },
    { key: 'volume', label: 'Volume', min: 0, max: 1.5, step: 0.01, def: 0.9, unit: '' }
  ];

  var DRUM_NAMES = {
    35: 'Kick 2', 36: 'Kick', 37: 'Rim', 38: 'Snare', 39: 'Clap', 40: 'Snare 2', 41: 'Low tom 2',
    42: 'Closed hat', 43: 'Low tom', 44: 'Pedal hat', 45: 'Mid tom 2', 46: 'Open hat', 47: 'Mid tom',
    48: 'High tom 2', 49: 'Crash', 50: 'High tom', 51: 'Ride', 53: 'Ride bell', 56: 'Cowbell', 57: 'Crash 2', 59: 'Ride 2'
  };
  var TOMS = { 41: 70, 43: 85, 45: 100, 47: 120, 48: 140, 50: 165 };
  var HATS = { 42: 1, 44: 1, 46: 1 };
  var METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

  function buildDrum(st, n, v, t0) {
    var ctx = st.out.context, p = st.p, vc = velCurve(v);
    var T = Math.pow(2, p.tune / 12), dm = p.decay;
    var hit = makeGain(ctx, vc), choke = makeGain(ctx, 1);
    hit.connect(choke); choke.connect(st.bus);
    var sources = [], nodes = [hit, choke], len = 0.3;

    function noise(dest) {
      var s = ctx.createBufferSource();
      s.buffer = st.noise;
      s.loop = true;
      s.connect(dest);
      s.start(t0, Math.random() * 1.5);
      sources.push(s);
      return s;
    }
    function tone(type, freq, dest) {
      var o = makeOsc(ctx, type, freq, t0);
      o.connect(dest);
      o.start(t0);
      sources.push(o);
      return o;
    }
    function gainTo(dest, v0) { var g = makeGain(ctx, v0 === undefined ? 0 : v0); g.connect(dest); nodes.push(g); return g; }
    function filt(type, f, q, dest) { var b = makeFilter(ctx, type, f, q); b.connect(dest); nodes.push(b); return b; }
    function metal(dest, mul) {
      var mg = gainTo(dest, 1 / METAL.length);
      METAL.forEach(function (fr) { tone('square', fr * T * (mul || 1), mg); });
    }

    var g, f, o, d;
    if (n === 35 || n === 36) {
      d = 0.45 * dm;
      g = gainTo(hit);
      o = tone('sine', 160 * T, g);
      o.frequency.setValueAtTime(160 * T * (n === 35 ? 0.9 : 1), t0);
      o.frequency.exponentialRampToValueAtTime(48 * T, t0 + 0.09);
      pluck(g.gain, t0, 1, d);
      var cg = gainTo(hit);
      noise(filt('highpass', 1500 + p.tone * 2000, 0.7, cg));
      pluck(cg.gain, t0, 0.35 + p.tone * 0.3, 0.012);
      len = d + 0.02;
    } else if (n === 38 || n === 40) {
      d = 0.22 * dm;
      g = gainTo(hit);
      o = tone('triangle', 185 * T, g);
      o.frequency.exponentialRampToValueAtTime(160 * T, t0 + 0.05);
      pluck(g.gain, t0, 0.6, 0.12 * dm);
      var ng = gainTo(hit);
      noise(filt('highpass', 900 + p.tone * 1500, 0.7, ng));
      pluck(ng.gain, t0, 0.8, d);
      len = d + 0.02;
    } else if (n === 37) {
      g = gainTo(hit);
      tone('triangle', 820 * T, g);
      noise(filt('bandpass', 3000, 1.5, g));
      pluck(g.gain, t0, 0.7, 0.035);
      len = 0.06;
    } else if (n === 39) {
      d = 0.18 * dm;
      g = gainTo(hit);
      noise(filt('bandpass', 1100 * T + p.tone * 600, 1.2, g));
      var gp = g.gain;
      [0, 0.011, 0.022].forEach(function (k) {
        gp.setValueAtTime(0.9, t0 + k);
        gp.exponentialRampToValueAtTime(0.05, t0 + k + 0.01);
      });
      gp.setValueAtTime(0.8, t0 + 0.033);
      gp.exponentialRampToValueAtTime(0.0001, t0 + 0.033 + d);
      len = 0.033 + d + 0.02;
    } else if (HATS[n]) {
      d = (n === 46 ? 0.4 : (n === 44 ? 0.07 : 0.05)) * dm;
      g = gainTo(hit);
      var hp = filt('highpass', 5000 + p.tone * 4000, 0.7, g);
      var bp = filt('bandpass', 10000, 0.8, hp);
      metal(bp);
      var hn = gainTo(hp, 0.25);
      noise(hn);
      pluck(g.gain, t0, 0.55, d);
      len = d + 0.02;
    } else if (n === 49 || n === 57) {
      d = 1.6 * dm;
      g = gainTo(hit);
      noise(filt('highpass', 4000 + p.tone * 2000, 0.7, g));
      var mg2 = gainTo(hit);
      metal(filt('highpass', 5000, 0.7, mg2), n === 57 ? 1.1 : 1);
      pluck(g.gain, t0, 0.5, d);
      pluck(mg2.gain, t0, 0.3, d * 0.7);
      len = d + 0.02;
    } else if (n === 51 || n === 59 || n === 53) {
      d = (n === 53 ? 0.9 : 1.2) * dm;
      g = gainTo(hit);
      metal(filt('bandpass', (n === 53 ? 2600 : 3500) + p.tone * 1500, 0.8, g), n === 59 ? 0.95 : 1);
      var rn = gainTo(hit);
      noise(filt('highpass', 6000, 0.7, rn));
      pluck(g.gain, t0, n === 53 ? 0.6 : 0.4, d);
      pluck(rn.gain, t0, 0.12, d * 0.6);
      len = d + 0.02;
    } else if (TOMS[n]) {
      d = 0.45 * dm;
      var fr = TOMS[n] * T;
      g = gainTo(hit);
      o = tone('sine', fr * 1.6, g);
      o.frequency.exponentialRampToValueAtTime(fr, t0 + 0.06);
      pluck(g.gain, t0, 0.9, d);
      var tn = gainTo(hit);
      noise(filt('bandpass', 2000, 1, tn));
      pluck(tn.gain, t0, 0.15, 0.02);
      len = d + 0.02;
    } else if (n === 56) {
      d = 0.3 * dm;
      g = gainTo(hit);
      var cb = filt('bandpass', 900, 2, g);
      tone('square', 545 * T, cb); tone('square', 815 * T, cb);
      pluck(g.gain, t0, 0.5, d);
      len = d + 0.02;
    } else {
      d = 0.15 * dm;
      g = gainTo(hit);
      o = tone('sine', mtof(n), g);
      o.frequency.exponentialRampToValueAtTime(mtof(n) * 0.7, t0 + d);
      pluck(g.gain, t0, 0.5, d);
      len = d + 0.02;
    }
    return { sources: sources, nodes: nodes, oneShot: true, length: len, choke: choke };
  }

  var instruments = {
    synth: {
      name: 'Synth', params: SYNTH_PARAMS,
      create: function (ctx, params) { return makeInstrument(ctx, SYNTH_PARAMS, params, buildSynth); }
    },
    piano: {
      name: 'Electric piano', params: PIANO_PARAMS,
      create: function (ctx, params) { return makeInstrument(ctx, PIANO_PARAMS, params, buildPiano); }
    },
    bass: {
      name: 'Bass', params: BASS_PARAMS,
      create: function (ctx, params) {
        return makeInstrument(ctx, BASS_PARAMS, params, buildBass, {
          setup: function (st) {
            st.shaper = st.out.context.createWaveShaper();
            st.shaper.curve = driveCurve(st.p.drive);
            st.shaper.oversample = '2x';
            st.bus = makeGain(st.out.context, 1);
            st.bus.connect(st.shaper);
            st.shaper.connect(st.out);
            st.lastDrive = st.p.drive;
          },
          update: function (st) {
            if (st.lastDrive !== st.p.drive) { st.shaper.curve = driveCurve(st.p.drive); st.lastDrive = st.p.drive; }
          },
          dispose: function (st) { st.bus.disconnect(); st.shaper.disconnect(); }
        });
      }
    },
    pad: {
      name: 'Pad', params: PAD_PARAMS,
      create: function (ctx, params) {
        return makeInstrument(ctx, PAD_PARAMS, params, buildPad, {
          setup: function (st) {
            var c = st.out.context;
            st.lfo = makeOsc(c, 'sine', 0.15, now(c));
            st.lfoGain = makeGain(c, st.p.motion * 1200);
            st.lfo.connect(st.lfoGain);
            st.lfo.start(now(c));
          },
          update: function (st) { st.lfoGain.gain.setValueAtTime(st.p.motion * 1200, now(st.out.context)); },
          dispose: function (st) { safe(function () { st.lfo.stop(); }); st.lfo.disconnect(); st.lfoGain.disconnect(); }
        });
      }
    },
    drums: {
      name: 'Drum kit', params: DRUM_PARAMS, noteNames: DRUM_NAMES,
      create: function (ctx, params) {
        return makeInstrument(ctx, DRUM_PARAMS, params, buildDrum, {
          setup: function (st) {
            var c = st.out.context, sr = num(c.sampleRate, 44100), len = Math.floor(sr * 2);
            st.noise = c.createBuffer(1, len, sr);
            var data = st.noise.getChannelData(0), seed = 22222;
            for (var i = 0; i < len; i++) {
              seed = (seed * 1103515245 + 12345) & 0x7fffffff;
              data[i] = seed / 0x3fffffff - 1;
            }
          },
          before: function (st, n, t0) {
            if (!HATS[n]) return;
            st.poly.voices.slice().forEach(function (vo) {
              if (HATS[vo.n] && vo.t0 < t0 && vo.stopAt > t0) st.poly.kill(vo, t0);
            });
          }
        });
      }
    }
  };

  function instrumentDefaults(type) {
    var def = instruments[type] || instruments.synth;
    return defaultsOf(def.params);
  }

  // ---------------------------------------------------------------- per track instrument cache

  var cache = new WeakMap(); // ctx -> Map(trackId -> { type, json, inst, dest })
  var watched = new WeakSet();

  function specOf(track) {
    var spec = (track && track.instrument) || {};
    var type = instruments[spec.type] ? spec.type : 'synth';
    return { type: type, params: spec.params || {} };
  }

  function getInstrument(ctx, track, dest) {
    if (!ctx || !track) return null;
    watchEngine();
    var map = cache.get(ctx);
    if (!map) { map = new Map(); cache.set(ctx, map); }
    var spec = specOf(track), json = JSON.stringify(spec.params);
    var e = map.get(track.id);
    if (e && e.type !== spec.type) {
      var old = e.inst;
      safe(function () { old.dispose(); });
      e = null;
      map.delete(track.id);
    }
    if (!e) {
      e = { type: spec.type, json: json, inst: instruments[spec.type].create(ctx, spec.params), dest: null };
      map.set(track.id, e);
    } else if (e.json !== json) {
      e.inst.set(spec.params);
      e.json = json;
    }
    var target = dest || e.dest || ctx.destination;
    if (target && e.dest !== target) {
      if (e.dest) { var prev = e.dest; safe(function () { e.inst.output.disconnect(prev); }); }
      e.inst.output.connect(target);
      e.dest = target;
    }
    return e.inst;
  }

  function forgetTrack(ctx, trackId) {
    var map = ctx && cache.get(ctx);
    if (!map) return;
    var e = map.get(trackId);
    if (e) { safe(function () { e.inst.dispose(); }); map.delete(trackId); }
  }

  // Keeps cached live instruments in step with instrument edits made in the project.
  function watchEngine() {
    var eng = AM.engine;
    if (!eng || typeof eng.on !== 'function' || watched.has(eng)) return;
    watched.add(eng);
    eng.on('change', function () {
      var ctx = eng.ctx, map = ctx && cache.get(ctx);
      if (!map || !eng.project || !eng.project.tracks) return;
      var ids = {};
      eng.project.tracks.forEach(function (t) {
        ids[t.id] = 1;
        var e = map.get(t.id);
        if (!e) return;
        var spec = specOf(t);
        if (spec.type !== e.type) { forgetTrack(ctx, t.id); return; }
        var json = JSON.stringify(spec.params);
        if (json !== e.json) { e.inst.set(spec.params); e.json = json; }
      });
      Array.from(map.keys()).forEach(function (id) { if (!ids[id]) forgetTrack(ctx, id); });
    });
  }

  // ---------------------------------------------------------------- scheduling

  var LOOKAHEAD = 2.5, PUMP_MS = 120;

  function schedule(ctx, track, clip, when, offsetInClip, dest) {
    var inst = getInstrument(ctx, track, dest);
    if (!inst || !clip || !Array.isArray(clip.notes)) return { stop: function () {} };
    var offset = Math.max(0, num(offsetInClip, 0));
    var len = clip.length > 0 ? clip.length : Infinity;
    var base = num(when, now(ctx));
    var items = [];
    clip.notes.forEach(function (nt) {
      var t = num(nt.t, 0), d = Math.max(0, num(nt.d, 0));
      var s = Math.max(t, offset), e = Math.min(t + d, len);
      if (t >= len || e <= offset || e <= s) return;
      items.push({ start: base + (s - offset), end: base + (e - offset), n: nt.n, v: num(nt.v, 0.8) });
    });
    items.sort(function (a, b) { return a.start - b.start || a.n - b.n; });

    var idx = 0, handles = [], timer = null, stopped = false;
    function pump(limit) {
      var t = now(ctx);
      while (idx < items.length && items[idx].start < limit) {
        var it = items[idx++];
        if (it.end <= t) continue;
        var h = inst.noteOn(it.n, it.v, Math.max(it.start, t));
        inst.noteOff(it.n, it.end);
        if (h) handles.push(h);
      }
      if (handles.length > 256) handles = handles.filter(function (h) { return !h.dead; });
    }
    var offline = typeof ctx.startRendering === 'function';
    if (offline) {
      pump(Infinity);
    } else {
      pump(now(ctx) + LOOKAHEAD);
      if (idx < items.length) {
        timer = setInterval(function () {
          if (stopped || idx >= items.length) { clearInterval(timer); timer = null; return; }
          pump(now(ctx) + LOOKAHEAD);
        }, PUMP_MS);
      }
    }
    return {
      stop: function (w) {
        if (stopped) return;
        stopped = true;
        if (timer) { clearInterval(timer); timer = null; }
        var t = Math.max(num(w, now(ctx)), now(ctx));
        pump(t);
        handles.forEach(function (h) {
          if (typeof inst.cancel === 'function') inst.cancel(h, t);
        });
        if (typeof inst.cancel !== 'function') inst.allOff(t);
        handles = [];
      }
    };
  }

  var previewCache = new WeakMap();
  function preview(ctx, spec, n, v, dur) {
    if (!ctx) return;
    spec = spec || {};
    var type = instruments[spec.type] ? spec.type : 'synth';
    var m = previewCache.get(ctx);
    if (!m) { m = {}; previewCache.set(ctx, m); }
    var inst = m[type];
    if (!inst) {
      inst = instruments[type].create(ctx, spec.params || {});
      inst.output.connect(ctx.destination);
      m[type] = inst;
    } else {
      inst.set(spec.params || {});
    }
    var t = now(ctx);
    inst.noteOn(n, v === undefined || v === null ? 0.8 : v, t);
    inst.noteOff(n, t + (dur > 0 ? dur : 0.4));
  }

  // ---------------------------------------------------------------- MIDI files

  function toBytes(buf) {
    if (buf instanceof Uint8Array) return buf;
    if (ArrayBuffer.isView(buf)) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return new Uint8Array(buf);
  }

  function parseMidiFile(buf) {
    var u = toBytes(buf), pos = 0;
    function str4(p) { return String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]); }
    function u32(p) { return ((u[p] << 24) >>> 0) + (u[p + 1] << 16) + (u[p + 2] << 8) + u[p + 3]; }
    function u16(p) { return (u[p] << 8) | u[p + 1]; }

    // Find the header (also handles RIFF RMID wrappers).
    var h = -1;
    for (var i = 0; i + 14 <= u.length && i < 4096; i++) {
      if (u[i] === 0x4d && str4(i) === 'MThd') { h = i; break; }
    }
    if (h < 0) throw new Error('This is not a MIDI file.');
    var hlen = u32(h + 4);
    var format = u16(h + 8), ntrks = u16(h + 10), division = u16(h + 12);
    var smpte = (division & 0x8000) !== 0;
    var ppq = smpte ? 0 : (division || 480);
    var secPerTickSmpte = 0;
    if (smpte) {
      var fps = 256 - (division >> 8);
      if (fps === 29) fps = 29.97;
      secPerTickSmpte = 1 / (fps * ((division & 0xff) || 1));
    }
    pos = h + 8 + hlen;

    var rawTracks = [], tempos = [], sig = null;
    while (pos + 8 <= u.length && rawTracks.length < Math.max(ntrks, 1) + 64) {
      var id = str4(pos), clen = u32(pos + 4), start = pos + 8, end = Math.min(start + clen, u.length);
      pos = start + clen;
      if (id !== 'MTrk') continue;
      rawTracks.push(readTrack(start, end));
    }

    function readTrack(p, end) {
      var tick = 0, running = 0, name = '', notes = [], open = {}, program = {};
      function vlq() {
        var v = 0, b, k = 0;
        do { b = u[p++]; v = (v << 7) | (b & 0x7f); k++; } while ((b & 0x80) && p < end && k < 5);
        return v;
      }
      function close(key, at) {
        var q = open[key];
        if (!q || !q.length) return;
        var on = q.shift();
        notes.push({ tick: on.tick, endTick: Math.max(at, on.tick), n: on.n, vel: on.vel, ch: on.ch });
      }
      while (p < end) {
        tick += vlq();
        if (p >= end) break;
        var b = u[p];
        if (b === 0xff) {
          var type = u[p + 1];
          p += 2;
          var l = vlq();
          var dStart = p;
          p += l;
          if (type === 0x51 && l >= 3) {
            tempos.push({ tick: tick, us: (u[dStart] << 16) | (u[dStart + 1] << 8) | u[dStart + 2] });
          } else if (type === 0x03 && !name) {
            var s = '';
            for (var k = dStart; k < dStart + l && k < end; k++) s += String.fromCharCode(u[k]);
            name = s.replace(/[\u0000-\u001f]/g, '').trim();
          } else if (type === 0x58 && l >= 2 && !sig) {
            sig = [u[dStart], Math.pow(2, u[dStart + 1])];
          } else if (type === 0x2f) {
            break;
          }
        } else if (b === 0xf0 || b === 0xf7) {
          p++;
          p += vlq();
        } else {
          var status;
          if (b & 0x80) { status = b; p++; if (status < 0xf0) running = status; else continue; }
          else { status = running; if (!status) { p++; continue; } }
          var hi = status & 0xf0, ch = status & 0x0f;
          var d1 = u[p++], d2 = (hi === 0xc0 || hi === 0xd0) ? 0 : u[p++];
          var key = ch * 128 + d1;
          if (hi === 0x90 && d2 > 0) {
            (open[key] = open[key] || []).push({ tick: tick, n: d1, vel: d2, ch: ch });
          } else if (hi === 0x80 || hi === 0x90) {
            close(key, tick);
          } else if (hi === 0xc0) {
            if (program[ch] === undefined) program[ch] = d1;
          }
        }
      }
      Object.keys(open).forEach(function (key) { while (open[key].length) close(key, tick); });
      return { name: name, notes: notes, program: program };
    }

    // Tempo map.
    tempos.sort(function (a, b) { return a.tick - b.tick; });
    var segs = [{ tick: 0, sec: 0, us: 500000 }];
    tempos.forEach(function (tp) {
      if (tp.us <= 0) return;
      var last = segs[segs.length - 1];
      if (tp.tick <= last.tick) { last.us = tp.us; return; }
      segs.push({ tick: tp.tick, sec: last.sec + (tp.tick - last.tick) * last.us / 1e6 / ppq, us: tp.us });
    });
    function sec(tick) {
      if (smpte) return tick * secPerTickSmpte;
      var s = segs[0];
      for (var j = 1; j < segs.length && segs[j].tick <= tick; j++) s = segs[j];
      return s.sec + (tick - s.tick) * s.us / 1e6 / ppq;
    }

    var out = [], duration = 0;
    rawTracks.forEach(function (rt, ti) {
      if (!rt.notes.length) return;
      var byCh = {};
      rt.notes.forEach(function (nt) { (byCh[nt.ch] = byCh[nt.ch] || []).push(nt); });
      var chans = Object.keys(byCh).map(Number).sort(function (a, b) { return a - b; });
      chans.forEach(function (ch) {
        var notes = byCh[ch].map(function (nt) {
          var t = sec(nt.tick), e = sec(nt.endTick);
          duration = Math.max(duration, e);
          return { t: t, d: Math.max(e - t, 0.005), n: nt.n, v: Math.round(nt.vel / 127 * 1000) / 1000 };
        }).sort(function (a, b) { return a.t - b.t || a.n - b.n; });
        var nm = rt.name || ('Track ' + (out.length + 1));
        if (chans.length > 1) nm += ' channel ' + (ch + 1);
        out.push({ name: nm, notes: notes, channel: ch, drums: ch === 9, program: rt.program[ch] === undefined ? null : rt.program[ch], index: ti });
      });
    });

    var bpm = smpte ? 120 : Math.round(60e6 / segs[0].us * 100) / 100;
    return {
      bpm: bpm,
      tempos: smpte ? [{ t: 0, bpm: 120 }] : segs.map(function (s) { return { t: s.sec, bpm: Math.round(60e6 / s.us * 1000) / 1000 }; }),
      sig: sig || [4, 4],
      format: format,
      ppq: ppq,
      duration: duration,
      tracks: out
    };
  }

  function writeMidiFile(clips, bpm, opts) {
    opts = opts || {};
    clips = clips || [];
    var PPQ = 960;
    bpm = num(bpm, 120) > 0 ? num(bpm, 120) : 120;
    var tempos = (opts.tempos && opts.tempos.length ? opts.tempos.slice() : [{ t: 0, bpm: bpm }])
      .filter(function (x) { return num(x.bpm, 0) > 0; })
      .sort(function (a, b) { return a.t - b.t; });
    if (!tempos.length || tempos[0].t > 0) tempos.unshift({ t: 0, bpm: bpm });
    var segs = [];
    tempos.forEach(function (tp) {
      var spt = 60 / (tp.bpm * PPQ);
      if (!segs.length) { segs.push({ tick: 0, sec: 0, spt: spt, bpm: tp.bpm }); return; }
      var last = segs[segs.length - 1];
      var tick = Math.round(last.tick + (Math.max(tp.t, last.sec) - last.sec) / last.spt);
      if (tick === last.tick) { last.spt = spt; last.bpm = tp.bpm; return; }
      segs.push({ tick: tick, sec: last.sec + (tick - last.tick) * last.spt, spt: spt, bpm: tp.bpm });
    });
    function tickOf(s) {
      var g = segs[0];
      for (var j = 1; j < segs.length && segs[j].sec <= s + 1e-9; j++) g = segs[j];
      return Math.max(0, Math.round(g.tick + (s - g.sec) / g.spt));
    }

    var bytes = [];
    function push() { for (var i = 0; i < arguments.length; i++) bytes.push(arguments[i] & 0xff); }
    function vlq(v, arr) {
      v = Math.max(0, Math.floor(v));
      var stack = [v & 0x7f];
      while ((v >>= 7) > 0) stack.push((v & 0x7f) | 0x80);
      while (stack.length) arr.push(stack.pop());
    }
    function textBytes(s) {
      var out = [];
      s = String(s || '');
      for (var i = 0; i < s.length && out.length < 120; i++) {
        var c = s.charCodeAt(i);
        out.push(c < 128 ? c : 63);
      }
      return out;
    }
    function chunk(id, data) {
      push(id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3));
      var l = data.length;
      push(l >>> 24, l >>> 16, l >>> 8, l);
      for (var i = 0; i < data.length; i++) bytes.push(data[i]);
    }
    function trackData(events) {
      events.sort(function (a, b) { return a.tick - b.tick || a.order - b.order; });
      var d = [], last = 0;
      events.forEach(function (ev) {
        vlq(ev.tick - last, d);
        last = ev.tick;
        for (var i = 0; i < ev.data.length; i++) d.push(ev.data[i] & 0xff);
      });
      d.push(0, 0xff, 0x2f, 0);
      return d;
    }

    var sig = opts.sig || [4, 4];
    var denPow = Math.round(Math.log(sig[1] || 4) / Math.LN2);
    var conductor = [];
    var nm = textBytes(opts.name || 'Audio mastering');
    conductor.push({ tick: 0, order: 0, data: [0xff, 0x03, nm.length].concat(nm) });
    conductor.push({ tick: 0, order: 1, data: [0xff, 0x58, 4, sig[0] || 4, denPow, 24, 8] });
    segs.forEach(function (s, i) {
      var us = Math.round(60e6 / s.bpm);
      conductor.push({ tick: s.tick, order: 2 + i, data: [0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] });
    });

    push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1);
    var ntr = clips.length + 1;
    push(ntr >> 8, ntr, PPQ >> 8, PPQ);
    chunk('MTrk', trackData(conductor));

    clips.forEach(function (clip, ci) {
      var events = [];
      var tn = textBytes(clip.name || ('Clip ' + (ci + 1)));
      events.push({ tick: 0, order: -1, data: [0xff, 0x03, tn.length].concat(tn) });
      var ch = clip.channel !== undefined && clip.channel !== null ? clamp(clip.channel | 0, 0, 15) : (clip.drums ? 9 : 0);
      var baseT = opts.relative ? 0 : num(clip.start, 0);
      var len = clip.length > 0 ? clip.length : Infinity;
      (clip.notes || []).forEach(function (nt) {
        var t = num(nt.t, 0), e = Math.min(t + Math.max(0, num(nt.d, 0)), len);
        if (t < 0 || t >= len || e <= t) return;
        var on = tickOf(baseT + t), off = tickOf(baseT + e);
        if (off <= on) off = on + 1;
        var n = clamp(Math.round(nt.n), 0, 127);
        var vel = clamp(Math.round(num(nt.v, 0.8) * 127), 1, 127);
        events.push({ tick: on, order: 1, data: [0x90 | ch, n, vel] });
        events.push({ tick: off, order: 0, data: [0x80 | ch, n, 64] });
      });
      chunk('MTrk', trackData(events));
    });
    return new Uint8Array(bytes);
  }

  // ---------------------------------------------------------------- Web MIDI input, monitoring, recording

  var midiAccess = null, listeners = [], live = {}, sustain = false, sustained = {}, rec = null;
  var api = { monitor: true };

  function engineRef() { return (rec && rec.engine) || AM.engine || null; }
  function liveTrack(eng) {
    if (!eng || !eng.project) return null;
    if (rec) return eng.findTrack ? eng.findTrack(rec.trackId) : null;
    var tracks = eng.project.tracks || [];
    for (var i = 0; i < tracks.length; i++) if (tracks[i].type === 'midi' && tracks[i].arm) return tracks[i];
    return null;
  }
  function liveCtx(eng) {
    if (!eng) return null;
    if (eng.ctx) return eng.ctx;
    try { return eng.ensure ? eng.ensure() : null; } catch (e) { return null; }
  }
  function perfNow() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function recPos(msgTime) {
    var eng = rec.engine, lat = 0;
    if (msgTime > 0) {
      var dl = (perfNow() - msgTime) / 1000;
      if (dl > 0 && dl < 0.5) lat = dl;
    }
    if (eng.playing === undefined || eng.playing) {
      var t = num(eng.time, 0);
      if (t !== rec.lastEngineTime || eng.playing) { rec.lastEngineTime = t; return t - lat; }
    }
    return rec.startTime + (perfNow() - rec.wall) / 1000 - lat;
  }

  function soundOff(n) {
    var h = live[n];
    if (!h) return;
    delete live[n];
    var ctx = h.ctx;
    if (h.inst && h.handle) h.inst.release(h.handle, now(ctx));
    if (rec) {
      var held = rec.held[n];
      if (held) {
        delete rec.held[n];
        var end = recPos(0);
        rec.notes.push({ pos: held.pos, end: Math.max(end, held.pos + 0.01), n: n, v: held.v });
      }
    }
  }

  // Feeds one note message (from a MIDI keyboard or the screen) to monitoring and recording.
  function input(msg) {
    if (!msg) return;
    var n = clamp(Math.round(num(msg.n, 60)), 0, 127);
    if (msg.type === 'on') {
      var v = clamp(num(msg.v, 0.8), 0, 1);
      if (live[n]) soundOff(n);
      delete sustained[n];
      var eng = engineRef(), track = liveTrack(eng), ctx = null, inst = null, handle = null;
      if (track && api.monitor) {
        ctx = liveCtx(eng);
        inst = ctx ? getInstrument(ctx, track) : null;
        if (inst) handle = inst.noteOn(n, v, now(ctx));
      }
      live[n] = { ctx: ctx, inst: inst, handle: handle };
      if (rec) rec.held[n] = { pos: recPos(msg.time), v: v };
    } else if (msg.type === 'off') {
      if (sustain) { sustained[n] = 1; return; }
      soundOff(n);
    } else if (msg.type === 'sustain') {
      sustain = !!msg.on;
      if (!sustain) {
        Object.keys(sustained).forEach(function (k) { soundOff(+k); });
        sustained = {};
      }
    }
  }

  function onRaw(e) {
    var d = e.data;
    if (!d || d.length < 2) return;
    var hi = d[0] & 0xf0, t = e.timeStamp || 0;
    var msg = null;
    if (hi === 0x90 && d[2] > 0) msg = { type: 'on', n: d[1], v: d[2] / 127, time: t };
    else if (hi === 0x80 || hi === 0x90) msg = { type: 'off', n: d[1], v: 0, time: t };
    else if (hi === 0xb0 && d[1] === 64) { input({ type: 'sustain', on: d[2] >= 64 }); return; }
    else if (hi === 0xb0 && (d[1] === 123 || d[1] === 120)) { Object.keys(live).forEach(function (k) { soundOff(+k); }); return; }
    if (!msg) return;
    input(msg);
    listeners.forEach(function (fn) { safe(function () { fn({ type: msg.type, n: msg.n, v: msg.v }); }); });
  }

  function inputNames() {
    var names = [];
    if (midiAccess) midiAccess.inputs.forEach(function (inp) { names.push(inp.name || 'MIDI input'); });
    return names;
  }
  function attachAll() {
    if (!midiAccess) return;
    midiAccess.inputs.forEach(function (inp) { inp.onmidimessage = onRaw; });
  }

  function enableInput(onMessage) {
    if (typeof onMessage === 'function' && listeners.indexOf(onMessage) < 0) listeners.push(onMessage);
    var nav = typeof navigator !== 'undefined' ? navigator : null;
    if (midiAccess) { attachAll(); return Promise.resolve(inputNames()); }
    if (!nav || typeof nav.requestMIDIAccess !== 'function') {
      return Promise.reject(new Error('This browser cannot use MIDI keyboards. Try Chrome or Edge.'));
    }
    return nav.requestMIDIAccess({ sysex: false }).then(function (access) {
      midiAccess = access;
      access.onstatechange = function () {
        attachAll();
        if (typeof api.onDevicesChange === 'function') safe(function () { api.onDevicesChange(inputNames()); });
      };
      attachAll();
      return inputNames();
    }, function () {
      throw new Error('MIDI keyboard access was blocked. Allow MIDI for this site and try again.');
    });
  }

  function disableInput(onMessage) {
    if (onMessage) listeners = listeners.filter(function (f) { return f !== onMessage; });
    else listeners = [];
  }

  function recordStart(engine, trackId) {
    if (rec) recordStop();
    engine = engine || AM.engine;
    if (!engine) return false;
    var t = num(engine.time, 0);
    rec = { engine: engine, trackId: trackId, startTime: t, wall: perfNow(), lastEngineTime: t, notes: [], held: {} };
    return true;
  }

  function recordStop() {
    if (!rec) return null;
    var r = rec;
    Object.keys(r.held).forEach(function (k) {
      var held = r.held[k];
      r.notes.push({ pos: held.pos, end: Math.max(recPos(0), held.pos + 0.01), n: +k, v: held.v });
    });
    rec = null;
    if (!r.notes.length) return null;
    var eng = r.engine, proj = eng.project || {};
    var bpm = num(proj.bpm, 120), sig = proj.sig || [4, 4];
    var barSec = 60 / bpm * sig[0] * 4 / (sig[1] || 4);
    var start = r.startTime;
    r.notes.forEach(function (nt) { if (nt.pos < start) start = nt.pos; });
    start = Math.max(0, start);
    var notes = r.notes.map(function (nt) {
      var t = Math.max(0, nt.pos - start);
      return { t: Math.round(t * 1e4) / 1e4, d: Math.round(Math.max(0.01, nt.end - Math.max(nt.pos, start)) * 1e4) / 1e4, n: nt.n, v: Math.round(nt.v * 1000) / 1000 };
    }).sort(function (a, b) { return a.t - b.t || a.n - b.n; });
    var maxEnd = 0;
    notes.forEach(function (nt) { maxEnd = Math.max(maxEnd, nt.t + nt.d); });
    var length = Math.max(barSec, Math.ceil((maxEnd - 1e-6) / barSec) * barSec);
    var track = eng.findTrack ? eng.findTrack(r.trackId) : null;
    var clip = {
      kind: 'midi',
      name: (track && track.name ? track.name : 'MIDI') + ' take',
      start: start, length: length, notes: notes
    };
    if (typeof AM.uid === 'function') clip.id = AM.uid('c');
    var added = eng.addClip ? eng.addClip(r.trackId, clip) : null;
    return added || clip;
  }

  // ---------------------------------------------------------------- piano roll

  var C_BG = '#161618', C_LINE = '#2b2b30', C_TEXT = '#b6b6bd', C_ACCENT = '#ff5b52', C_NOTE = '#4c8dff';
  var GRID_DENS = [1, 2, 4, 8, 16];
  var KEY_W = 56, RULER_H = 22;

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var BTN_CSS = 'background:' + C_BG + ';color:' + C_TEXT + ';border:1px solid ' + C_LINE + ';border-radius:4px;padding:2px 8px;font:inherit;cursor:pointer;line-height:18px;';

  function PianoRoll(containerEl, engine) {
    this.container = containerEl;
    this.engine = engine;
    this.trackId = null;
    this.clipId = null;
    this.notes = [];
    this.sel = new Set();
    this.pxPerQ = 64;
    this.rowH = 12;
    this.scrollT = 0;
    this.scrollY = 0;
    this.gridDen = 8;
    this.snap = true;
    this.lastVel = 0.8;
    this.playhead = num(engine && engine.time, 0);
    this.drag = null;
    this.pressedKey = -1;
    this.lastCommit = null;
    this._raf = 0;
    this._build();
    var self = this;
    this._onTime = function (t) {
      var v = typeof t === 'number' ? t : (t && typeof t.time === 'number' ? t.time : num(self.engine && self.engine.time, 0));
      self._follow(v);
      self.playhead = v;
      self._queue();
    };
    this._onChange = function () { if (!self.drag) self.refresh(); else self._pendingRefresh = true; };
    if (engine && typeof engine.on === 'function') {
      engine.on('time', this._onTime);
      engine.on('change', this._onChange);
      engine.on('stop', this._onTime);
    }
    this.draw();
  }

  PianoRoll.prototype._build = function () {
    var self = this;
    var root = el('div', 'display:flex;flex-direction:column;width:100%;height:100%;min-height:180px;background:' + C_BG + ';color:' + C_TEXT + ';font:12px system-ui,-apple-system,Segoe UI,sans-serif;user-select:none;-webkit-user-select:none;box-sizing:border-box;');
    root.className = 'am-pianoroll';
    var bar = el('div', 'display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid ' + C_LINE + ';flex:none;flex-wrap:wrap;min-height:28px;box-sizing:border-box;');
    this.titleEl = el('span', 'font-weight:600;color:#fff;margin-right:6px;white-space:nowrap;', 'No clip open');
    bar.appendChild(this.titleEl);

    bar.appendChild(el('span', 'opacity:.8;', 'Grid'));
    var gridSel = el('select', BTN_CSS + 'padding:2px 4px;');
    gridSel.title = 'Grid size. New notes use this length.';
    GRID_DENS.forEach(function (d) {
      var o = el('option', '', '1/' + d);
      o.value = String(d);
      if (d === self.gridDen) o.selected = true;
      gridSel.appendChild(o);
    });
    gridSel.addEventListener('change', function () { self.gridDen = +gridSel.value || 8; self.draw(); });
    this.gridSel = gridSel;
    bar.appendChild(gridSel);

    function btn(label, title, fn) {
      var b = el('button', BTN_CSS, label);
      b.type = 'button';
      b.title = title;
      b.addEventListener('click', function (e) { fn(e); self.canvas.focus(); });
      bar.appendChild(b);
      return b;
    }
    this.snapBtn = btn('Snap', 'Turn snap to grid on or off. Hold Alt while dragging to skip it.', function () {
      self.snap = !self.snap;
      self._syncToolbar();
    });
    btn('Quantize', 'Move the selected notes to the nearest grid line. With nothing selected, all notes move.', function () { self.quantize(); });
    btn('Down', 'Move the selected notes down one semitone. Hold Shift for one octave.', function (e) { self.transpose(e.shiftKey ? -12 : -1); });
    btn('Up', 'Move the selected notes up one semitone. Hold Shift for one octave.', function (e) { self.transpose(e.shiftKey ? 12 : 1); });
    btn('Zoom out', 'Zoom out. You can also hold Ctrl and use the mouse wheel.', function () { self.zoomX(1 / 1.4); });
    btn('Zoom in', 'Zoom in. You can also hold Ctrl and use the mouse wheel.', function () { self.zoomX(1.4); });
    var help = el('span', 'flex:1;min-width:120px;text-align:right;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
      'Click to add a note. Drag to move. Drag the right edge to change length. Right click or Delete removes. Shift drag selects. Ctrl wheel zooms across, Shift wheel zooms up and down.');
    bar.appendChild(help);

    var wrap = el('div', 'position:relative;flex:1;min-height:0;overflow:hidden;');
    var canvas = el('canvas', 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;outline:none;cursor:default;');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Piano roll note editor');
    wrap.appendChild(canvas);
    root.appendChild(bar);
    root.appendChild(wrap);
    this.container.appendChild(root);
    this.root = root;
    this.wrap = wrap;
    this.canvas = canvas;
    try { this.g = canvas.getContext('2d'); } catch (e) { this.g = null; }
    this._syncToolbar();

    this._down = function (e) { self._onDown(e); };
    this._move = function (e) { self._onMove(e); };
    this._up = function (e) { self._onUp(e); };
    this._hover = function (e) { if (!self.drag) self._onHover(e); };
    this._key = function (e) { self._onKey(e); };
    this._wheel = function (e) { self._onWheel(e); };
    this._ctx = function (e) { e.preventDefault(); };
    canvas.addEventListener('mousedown', this._down);
    canvas.addEventListener('mousemove', this._hover);
    canvas.addEventListener('keydown', this._key);
    canvas.addEventListener('wheel', this._wheel, { passive: false });
    canvas.addEventListener('contextmenu', this._ctx);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self.draw(); });
      this._ro.observe(wrap);
    } else {
      this._resize = function () { self.draw(); };
      window.addEventListener('resize', this._resize);
    }
  };

  PianoRoll.prototype._syncToolbar = function () {
    this.snapBtn.style.borderColor = this.snap ? C_ACCENT : C_LINE;
    this.snapBtn.style.color = this.snap ? C_ACCENT : C_TEXT;
    this.snapBtn.setAttribute('aria-pressed', this.snap ? 'true' : 'false');
  };

  // ---- model access

  PianoRoll.prototype._clip = function () {
    if (!this.clipId || !this.engine || !this.engine.findClip) return null;
    var f = this.engine.findClip(this.clipId);
    return f && f.clip ? f.clip : null;
  };
  PianoRoll.prototype._track = function () {
    if (!this.engine) return null;
    if (this.trackId && this.engine.findTrack) return this.engine.findTrack(this.trackId);
    var f = this.clipId && this.engine.findClip ? this.engine.findClip(this.clipId) : null;
    return f ? f.track : null;
  };
  PianoRoll.prototype._proj = function () {
    var p = (this.engine && this.engine.project) || {};
    var bpm = num(p.bpm, 120) > 0 ? num(p.bpm, 120) : 120;
    var sig = Array.isArray(p.sig) && p.sig[0] > 0 && p.sig[1] > 0 ? p.sig : [4, 4];
    var q = 60 / bpm, beat = q * 4 / sig[1];
    return { bpm: bpm, sig: sig, q: q, beat: beat, bar: beat * sig[0] };
  };
  PianoRoll.prototype.gridSec = function () { return this._proj().q * 4 / this.gridDen; };
  PianoRoll.prototype._size = function () {
    var w = this.wrap.clientWidth || 0, h = this.wrap.clientHeight || 0;
    if (!w || !h) { w = w || 800; h = h || 320; }
    var velH = h < 240 ? 44 : 70;
    return { W: w, H: h, velH: velH, gridBottom: h - velH };
  };
  PianoRoll.prototype._pps = function () { return this.pxPerQ / this._proj().q; };
  PianoRoll.prototype.timeToX = function (t) { return KEY_W + (t - this.scrollT) * this._pps(); };
  PianoRoll.prototype.xToTime = function (x) { return this.scrollT + (x - KEY_W) / this._pps(); };
  PianoRoll.prototype.noteToY = function (n) { return RULER_H + (127 - n) * this.rowH - this.scrollY; };
  PianoRoll.prototype.yToNote = function (y) { return clamp(127 - Math.floor((y - RULER_H + this.scrollY) / this.rowH), 0, 127); };
  PianoRoll.prototype._clampScroll = function () {
    var s = this._size();
    var maxY = Math.max(0, 128 * this.rowH - (s.gridBottom - RULER_H));
    this.scrollY = clamp(this.scrollY, 0, maxY);
    if (this.scrollT < 0) this.scrollT = 0;
  };

  function cloneNotes(arr) {
    return (arr || []).map(function (n) { return { t: num(n.t, 0), d: num(n.d, 0.1), n: clamp(Math.round(num(n.n, 60)), 0, 127), v: clamp(num(n.v, 0.8), 0, 1) }; });
  }

  PianoRoll.prototype.open = function (trackId, clipId) {
    this.trackId = trackId || null;
    this.clipId = clipId || null;
    var clip = this._clip();
    if (!clip) { this.close(); return; }
    if (!this.trackId) { var tr = this._track(); this.trackId = tr ? tr.id : null; }
    this.notes = cloneNotes(clip.notes);
    this.sel = new Set();
    this.lastCommit = JSON.stringify(this.notes);
    var pr = this._proj();
    this.scrollT = Math.max(0, num(clip.start, 0) - pr.beat * 0.25);
    var s = this._size(), mid = 60;
    if (this.notes.length) {
      var lo = 127, hi = 0;
      this.notes.forEach(function (n) { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); });
      mid = (lo + hi) / 2;
    }
    var gridH = s.gridBottom - RULER_H;
    this.scrollY = (127 - mid) * this.rowH - gridH / 2;
    this._clampScroll();
    this.titleEl.textContent = clip.name || 'MIDI clip';
    this.draw();
  };

  PianoRoll.prototype.close = function () {
    this.clipId = null;
    this.trackId = null;
    this.notes = [];
    this.sel = new Set();
    this.drag = null;
    this.titleEl.textContent = 'No clip open';
    this.draw();
  };

  PianoRoll.prototype.refresh = function () {
    this._pendingRefresh = false;
    if (this.clipId) {
      var clip = this._clip();
      if (!clip) { this.close(); return; }
      var json = JSON.stringify(cloneNotes(clip.notes));
      if (json !== this.lastCommit && json !== JSON.stringify(this.notes)) {
        this.notes = cloneNotes(clip.notes);
        this.sel = new Set();
      }
      this.lastCommit = json;
      this.titleEl.textContent = clip.name || 'MIDI clip';
    }
    this.draw();
  };

  PianoRoll.prototype.destroy = function () {
    var e = this.engine;
    if (e && typeof e.off === 'function') {
      e.off('time', this._onTime);
      e.off('change', this._onChange);
      e.off('stop', this._onTime);
    }
    if (this._ro) this._ro.disconnect();
    if (this._resize) window.removeEventListener('resize', this._resize);
    window.removeEventListener('mousemove', this._move);
    window.removeEventListener('mouseup', this._up);
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
  };

  // Sorts notes, keeps the selection and sends the edit to the engine as one undo step.
  PianoRoll.prototype.commit = function () {
    var clip = this._clip();
    if (!clip) return;
    var self = this;
    var tagged = this.notes.map(function (n, i) { return { n: n, s: self.sel.has(i) }; });
    tagged.sort(function (a, b) { return a.n.t - b.n.t || a.n.n - b.n.n; });
    this.notes = tagged.map(function (x) { return x.n; });
    this.sel = new Set();
    tagged.forEach(function (x, i) { if (x.s) self.sel.add(i); });
    var pr = this._proj();
    var maxEnd = 0;
    this.notes.forEach(function (n) { maxEnd = Math.max(maxEnd, n.t + n.d); });
    var length = num(clip.length, 0);
    if (maxEnd > length + 1e-6) {
      var start = num(clip.start, 0);
      length = Math.ceil((start + maxEnd - 1e-6) / pr.bar) * pr.bar - start;
      if (length < maxEnd) length += pr.bar;
    }
    if (!(length > 0)) length = pr.bar;
    var notes = cloneNotes(this.notes);
    this.lastCommit = JSON.stringify(notes);
    this.engine.updateClip(this.clipId, { notes: notes, length: length });
    this.draw();
  };

  // ---- editing commands

  PianoRoll.prototype._targets = function () {
    if (this.sel.size) return Array.from(this.sel);
    return this.notes.map(function (_, i) { return i; });
  };
  PianoRoll.prototype.quantize = function () {
    var clip = this._clip();
    if (!clip || !this.notes.length) return;
    var g = this.gridSec(), start = num(clip.start, 0), self = this;
    this._targets().forEach(function (i) {
      var n = self.notes[i];
      n.t = Math.max(0, Math.round((start + n.t) / g) * g - start);
    });
    this.commit();
  };
  PianoRoll.prototype.transpose = function (k) {
    if (!this._clip() || !this.sel.size) return;
    var self = this, idx = Array.from(this.sel), lo = 127, hi = 0;
    idx.forEach(function (i) { lo = Math.min(lo, self.notes[i].n); hi = Math.max(hi, self.notes[i].n); });
    k = clamp(k, -lo, 127 - hi);
    if (!k) return;
    idx.forEach(function (i) { self.notes[i].n += k; });
    if (idx.length === 1) this._preview(this.notes[idx[0]].n, this.notes[idx[0]].v);
    this.commit();
  };
  PianoRoll.prototype.removeSelected = function () {
    if (!this.sel.size) return;
    var self = this;
    this.notes = this.notes.filter(function (_, i) { return !self.sel.has(i); });
    this.sel = new Set();
    this.commit();
  };
  PianoRoll.prototype.selectAll = function () {
    this.sel = new Set(this.notes.map(function (_, i) { return i; }));
    this.draw();
  };
  PianoRoll.prototype.zoomX = function (f, anchorX) {
    var s = this._size();
    var ax = anchorX === undefined ? KEY_W + (s.W - KEY_W) / 2 : anchorX;
    var t = this.xToTime(ax);
    this.pxPerQ = clamp(this.pxPerQ * f, 6, 800);
    this.scrollT = t - (ax - KEY_W) / this._pps();
    this._clampScroll();
    this.draw();
  };
  PianoRoll.prototype.zoomY = function (f, anchorY) {
    var s = this._size();
    var ay = anchorY === undefined ? (RULER_H + s.gridBottom) / 2 : anchorY;
    var rows = (ay - RULER_H + this.scrollY) / this.rowH;
    this.rowH = clamp(this.rowH * f, 5, 36);
    this.scrollY = rows * this.rowH - (ay - RULER_H);
    this._clampScroll();
    this.draw();
  };

  PianoRoll.prototype._preview = function (n, v) {
    var eng = this.engine;
    if (!eng) return;
    try {
      var ctx = eng.ctx || (eng.ensure ? eng.ensure() : null);
      var tr = this._track();
      if (ctx) preview(ctx, tr && tr.instrument, n, v === undefined ? 0.8 : v, 0.3);
    } catch (e) { /* audio not available yet */ }
  };

  // ---- mouse

  PianoRoll.prototype._pos = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - (r.left || 0), y: e.clientY - (r.top || 0) };
  };
  PianoRoll.prototype._hit = function (x, y) {
    var clip = this._clip();
    if (!clip) return null;
    var start = num(clip.start, 0);
    for (var i = this.notes.length - 1; i >= 0; i--) {
      var n = this.notes[i];
      var x1 = this.timeToX(start + n.t), x2 = this.timeToX(start + n.t + n.d), y1 = this.noteToY(n.n);
      if (x >= x1 && x <= Math.max(x2, x1 + 3) && y >= y1 && y < y1 + this.rowH) {
        var edge = x >= x2 - Math.min(6, Math.max(2, (x2 - x1) / 3));
        return { i: i, edge: edge };
      }
    }
    return null;
  };
  PianoRoll.prototype._velHits = function (x) {
    var clip = this._clip(), out = [];
    if (!clip) return out;
    var start = num(clip.start, 0);
    for (var i = 0; i < this.notes.length; i++) {
      if (Math.abs(this.timeToX(start + this.notes[i].t) + 1.5 - x) <= 4) out.push(i);
    }
    return out;
  };
  PianoRoll.prototype._velFromY = function (y) {
    var s = this._size();
    var top = s.gridBottom + 8, bottom = s.H - 4;
    return clamp((bottom - y) / Math.max(1, bottom - top), 0.01, 1);
  };

  PianoRoll.prototype._onDown = function (e) {
    var self = this;
    if (this.canvas.focus) this.canvas.focus();
    var clip = this._clip();
    if (!clip) return;
    var p = this._pos(e), s = this._size();
    var inGrid = p.x >= KEY_W && p.y >= RULER_H && p.y < s.gridBottom;
    if (e.button === 2) {
      e.preventDefault();
      if (inGrid) {
        var h2 = this._hit(p.x, p.y);
        if (h2) {
          if (this.sel.has(h2.i) && this.sel.size > 1) { this.removeSelected(); return; }
          this.notes.splice(h2.i, 1);
          this.sel = new Set();
          this.commit();
        }
      }
      return;
    }
    if (e.button !== 0 && e.button !== undefined) return;
    e.preventDefault();
    var drag = null;
    if (p.x < KEY_W && p.y >= RULER_H && p.y < s.gridBottom) {
      var kn = this.yToNote(p.y);
      this.pressedKey = kn;
      this._preview(kn, 0.8);
      drag = { type: 'key' };
    } else if (p.y < RULER_H) {
      drag = { type: 'pan', x0: p.x, t0: this.scrollT };
    } else if (p.y >= s.gridBottom) {
      if (p.x >= KEY_W) {
        var hits = this._velHits(p.x);
        var group = hits.some(function (i) { return self.sel.has(i); }) && this.sel.size > 1;
        drag = { type: 'vel', group: group, changed: false };
        this._applyVel(drag, p.x, p.y);
      }
    } else if (inGrid) {
      var h = this._hit(p.x, p.y);
      if (h) {
        if (e.shiftKey) {
          if (this.sel.has(h.i)) { this.sel.delete(h.i); this.draw(); return; }
          this.sel.add(h.i);
        } else if (!this.sel.has(h.i)) {
          this.sel = new Set([h.i]);
        }
        var an = this.notes[h.i];
        this.lastVel = an.v;
        this._preview(an.n, an.v);
        drag = this._startNoteDrag(h.edge ? 'resize' : 'move', h.i, p, false);
      } else if (e.shiftKey) {
        drag = { type: 'box', x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: new Set(this.sel) };
      } else {
        var g = this.gridSec(), start = num(clip.start, 0);
        var abs = this.xToTime(p.x);
        if (this.snap && !e.altKey) abs = Math.floor((abs + 1e-9) / g) * g;
        var t = Math.max(0, abs - start);
        var note = { t: t, d: g, n: this.yToNote(p.y), v: this.lastVel };
        this.notes.push(note);
        var i = this.notes.length - 1;
        this.sel = new Set([i]);
        this._preview(note.n, note.v);
        drag = this._startNoteDrag('move', i, p, true);
      }
    }
    if (drag) {
      this.drag = drag;
      window.addEventListener('mousemove', this._move);
      window.addEventListener('mouseup', this._up);
    }
    this.draw();
  };

  PianoRoll.prototype._startNoteDrag = function (type, anchor, p, added) {
    var self = this;
    return {
      type: type, anchor: anchor, x0: p.x, y0: p.y, added: added, moved: false,
      orig: Array.from(this.sel).map(function (i) { var n = self.notes[i]; return { i: i, t: n.t, d: n.d, n: n.n }; }),
      lastN: this.notes[anchor].n
    };
  };

  PianoRoll.prototype._applyVel = function (drag, x, y) {
    var self = this, v = this._velFromY(y), hits = this._velHits(x);
    if (!hits.length) return;
    var targets = drag.group ? Array.from(this.sel) : hits;
    targets.forEach(function (i) { self.notes[i].v = Math.round(v * 1000) / 1000; });
    this.lastVel = v;
    drag.changed = true;
  };

  PianoRoll.prototype._onMove = function (e) {
    var d = this.drag;
    if (!d) return;
    var p = this._pos(e), clip = this._clip(), self = this;
    if (!clip) return;
    var noSnap = !this.snap || e.altKey;
    var g = this.gridSec(), start = num(clip.start, 0), pps = this._pps();
    if (d.type === 'move' || d.type === 'resize') {
      if (!d.moved && Math.abs(p.x - d.x0) < 3 && Math.abs(p.y - d.y0) < 3) return;
      d.moved = true;
      var a = null;
      d.orig.forEach(function (o) { if (o.i === d.anchor) a = o; });
      if (!a) return;
      var dt = (p.x - d.x0) / pps;
      if (d.type === 'move') {
        var ns = start + a.t + dt;
        if (!noSnap) ns = Math.round(ns / g) * g;
        var delta = ns - (start + a.t);
        var minT = Infinity, lo = 127, hi = 0;
        d.orig.forEach(function (o) { minT = Math.min(minT, o.t); lo = Math.min(lo, o.n); hi = Math.max(hi, o.n); });
        delta = Math.max(delta, -minT);
        var dn = clamp(this.yToNote(p.y) - this.yToNote(d.y0), -lo, 127 - hi);
        d.orig.forEach(function (o) {
          var n = self.notes[o.i];
          n.t = o.t + delta;
          n.n = o.n + dn;
        });
        var an = this.notes[d.anchor];
        if (an.n !== d.lastN) { d.lastN = an.n; this._preview(an.n, an.v); }
      } else {
        var ne = start + a.t + a.d + dt;
        if (!noSnap) ne = Math.round(ne / g) * g;
        var dd = ne - (start + a.t + a.d);
        var minLen = noSnap ? 0.01 : g;
        d.orig.forEach(function (o) {
          self.notes[o.i].d = Math.max(o.d + dd, minLen);
        });
      }
    } else if (d.type === 'box') {
      d.x1 = p.x; d.y1 = p.y;
      var x1 = Math.min(d.x0, d.x1), x2 = Math.max(d.x0, d.x1), y1 = Math.min(d.y0, d.y1), y2 = Math.max(d.y0, d.y1);
      var sel = new Set(d.base);
      this.notes.forEach(function (n, i) {
        var nx1 = self.timeToX(start + n.t), nx2 = self.timeToX(start + n.t + n.d), ny = self.noteToY(n.n);
        if (nx2 >= x1 && nx1 <= x2 && ny + self.rowH >= y1 && ny <= y2) sel.add(i);
      });
      this.sel = sel;
    } else if (d.type === 'vel') {
      this._applyVel(d, p.x, p.y);
    } else if (d.type === 'key') {
      var kn = this.yToNote(p.y);
      if (kn !== this.pressedKey) { this.pressedKey = kn; this._preview(kn, 0.8); }
    } else if (d.type === 'pan') {
      this.scrollT = Math.max(0, d.t0 - (p.x - d.x0) / pps);
    }
    this.draw();
  };

  PianoRoll.prototype._onUp = function () {
    var d = this.drag;
    window.removeEventListener('mousemove', this._move);
    window.removeEventListener('mouseup', this._up);
    this.drag = null;
    this.pressedKey = -1;
    if (d) {
      if ((d.type === 'move' || d.type === 'resize') && (d.added || d.moved)) this.commit();
      else if (d.type === 'vel' && d.changed) this.commit();
    }
    if (this._pendingRefresh) this.refresh();
    else this.draw();
  };

  PianoRoll.prototype._onHover = function (e) {
    var p = this._pos(e), s = this._size(), cur = 'default';
    if (this._clip()) {
      if (p.x < KEY_W && p.y >= RULER_H && p.y < s.gridBottom) cur = 'pointer';
      else if (p.y < RULER_H) cur = 'grab';
      else if (p.y >= s.gridBottom) cur = 'ns-resize';
      else {
        var h = this._hit(p.x, p.y);
        cur = h ? (h.edge ? 'ew-resize' : 'move') : 'crosshair';
      }
    }
    this.canvas.style.cursor = cur;
  };

  PianoRoll.prototype._onKey = function (e) {
    if (!this._clip()) return;
    var k = e.key, handled = true, mod = e.ctrlKey || e.metaKey;
    if (k === 'Delete' || k === 'Backspace') this.removeSelected();
    else if (mod && (k === 'a' || k === 'A')) this.selectAll();
    else if (k === 'Escape') { this.sel = new Set(); this.draw(); }
    else if (k === 'ArrowUp') this.transpose(e.shiftKey ? 12 : 1);
    else if (k === 'ArrowDown') this.transpose(e.shiftKey ? -12 : -1);
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && this.sel.size) {
      var g = this.gridSec() * (k === 'ArrowLeft' ? -1 : 1), self = this, idx = Array.from(this.sel), minT = Infinity;
      idx.forEach(function (i) { minT = Math.min(minT, self.notes[i].t); });
      g = Math.max(g, -minT);
      if (g) { idx.forEach(function (i) { self.notes[i].t += g; }); this.commit(); }
    } else if (k === 'q' || k === 'Q') { if (!mod) this.quantize(); else handled = false; }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  };

  PianoRoll.prototype._onWheel = function (e) {
    e.preventDefault();
    var p = this._pos(e), unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? 200 : 1);
    var dy = (e.deltaY || 0) * unit, dx = (e.deltaX || 0) * unit;
    if (e.ctrlKey || e.metaKey) {
      this.zoomX(Math.exp(-(dy || dx) * 0.0015), Math.max(p.x, KEY_W));
    } else if (e.shiftKey) {
      this.zoomY(Math.exp(-(dy || dx) * 0.0015), clamp(p.y, RULER_H, this._size().gridBottom));
    } else if (p.y < RULER_H || Math.abs(dx) > Math.abs(dy)) {
      this.scrollT = Math.max(0, this.scrollT + (Math.abs(dx) > Math.abs(dy) ? dx : dy) / this._pps());
      this.draw();
    } else {
      this.scrollY += dy;
      this._clampScroll();
      this.draw();
    }
  };

  PianoRoll.prototype._follow = function (t) {
    if (this.drag || !this._clip()) return;
    var s = this._size(), x = this.timeToX(t), px = this.timeToX(this.playhead);
    if (t > this.playhead && px >= KEY_W && px <= s.W && x > s.W - 16) {
      this.scrollT = t - (s.W - KEY_W) * 0.1 / this._pps();
    }
  };

  // ---- drawing

  PianoRoll.prototype._queue = function () {
    var self = this;
    if (this._raf) return;
    if (typeof requestAnimationFrame === 'function') {
      this._raf = requestAnimationFrame(function () { self._raf = 0; self.draw(); });
    } else {
      this.draw();
    }
  };

  PianoRoll.prototype.draw = function () {
    var c = this.g;
    if (!c) return;
    var s = this._size(), W = s.W, H = s.H, dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var cw = Math.round(W * dpr), ch = Math.round(H * dpr);
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = C_BG;
    c.fillRect(0, 0, W, H);
    c.font = '11px system-ui, -apple-system, Segoe UI, sans-serif';
    c.textBaseline = 'middle';
    var clip = this._clip();
    if (!clip) {
      c.fillStyle = C_TEXT;
      c.textAlign = 'center';
      c.fillText('Open a MIDI clip to edit its notes here.', W / 2, H / 2);
      c.textAlign = 'left';
      return;
    }
    this._clampScroll();
    var self = this, pr = this._proj(), start = num(clip.start, 0), len = num(clip.length, 0);
    var gb = s.gridBottom, rowH = this.rowH, pps = this._pps();
    var nTop = this.yToNote(RULER_H), nBot = this.yToNote(gb - 1);
    var tL = this.scrollT, tR = this.xToTime(W);

    // grid area
    c.save();
    c.beginPath();
    c.rect(KEY_W, RULER_H, W - KEY_W, gb - RULER_H);
    c.clip();
    var n, y;
    for (n = nTop; n >= nBot; n--) {
      y = this.noteToY(n);
      if (BLACK[n % 12]) { c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(KEY_W, y, W - KEY_W, rowH); }
      c.fillStyle = C_LINE;
      c.globalAlpha = n % 12 === 0 ? 1 : 0.45;
      c.fillRect(KEY_W, Math.round(y + rowH) - 1, W - KEY_W, 1);
      c.globalAlpha = 1;
    }
    var g = this.gridSec();
    while (g * pps < 6) g *= 2;
    function isMul(t, step) { var r = t / step; return Math.abs(r - Math.round(r)) < 1e-6; }
    var k0 = Math.floor(tL / g), k1 = Math.ceil(tR / g), k, t, x;
    for (k = k0; k <= k1; k++) {
      t = k * g;
      x = Math.round(this.timeToX(t)) + 0.5;
      if (isMul(t, pr.bar)) { c.strokeStyle = C_TEXT; c.globalAlpha = 0.3; }
      else if (isMul(t, pr.beat)) { c.strokeStyle = C_LINE; c.globalAlpha = 1; }
      else { c.strokeStyle = C_LINE; c.globalAlpha = 0.5; }
      c.beginPath(); c.moveTo(x, RULER_H); c.lineTo(x, gb); c.stroke();
    }
    c.globalAlpha = 1;
    // outside the clip is dimmed
    var cx1 = this.timeToX(start), cx2 = this.timeToX(start + len);
    c.fillStyle = 'rgba(0,0,0,0.38)';
    if (cx1 > KEY_W) c.fillRect(KEY_W, RULER_H, cx1 - KEY_W, gb - RULER_H);
    if (cx2 < W) c.fillRect(Math.max(cx2, KEY_W), RULER_H, W - Math.max(cx2, KEY_W), gb - RULER_H);
    c.strokeStyle = C_TEXT; c.globalAlpha = 0.5;
    [cx1, cx2].forEach(function (xx) {
      if (xx >= KEY_W && xx <= W) { c.beginPath(); c.moveTo(Math.round(xx) + 0.5, RULER_H); c.lineTo(Math.round(xx) + 0.5, gb); c.stroke(); }
    });
    c.globalAlpha = 1;
    // notes
    this.notes.forEach(function (nt, i) {
      var x1 = self.timeToX(start + nt.t), x2 = self.timeToX(start + nt.t + nt.d);
      if (x2 < KEY_W || x1 > W || nt.n > nTop || nt.n < nBot) return;
      var ny = self.noteToY(nt.n), w = Math.max(2, x2 - x1 - 1);
      c.globalAlpha = 0.45 + 0.55 * nt.v;
      c.fillStyle = C_NOTE;
      c.fillRect(x1 + 0.5, ny + 1, w, rowH - 2);
      c.globalAlpha = 1;
      if (self.sel.has(i)) {
        c.strokeStyle = '#ffffff';
        c.lineWidth = 1.5;
        c.strokeRect(x1 + 1, ny + 1.5, Math.max(1, w - 1), rowH - 3);
        c.lineWidth = 1;
      }
      if (w > 30 && rowH >= 11) {
        c.fillStyle = C_BG;
        c.fillText(noteName(nt.n), x1 + 4, ny + rowH / 2);
      }
    });
    if (this.drag && this.drag.type === 'box') {
      var d = this.drag;
      c.fillStyle = 'rgba(255,91,82,0.12)';
      c.strokeStyle = C_ACCENT;
      c.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      c.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    }
    c.restore();

    // ruler
    c.fillStyle = C_BG;
    c.fillRect(KEY_W, 0, W - KEY_W, RULER_H);
    c.fillStyle = C_LINE;
    c.fillRect(0, RULER_H - 1, W, 1);
    var barPx = pr.bar * pps, every = 1;
    while (barPx * every < 44) every *= 2;
    var b0 = Math.floor(tL / pr.bar), b1 = Math.ceil(tR / pr.bar);
    c.save();
    c.beginPath(); c.rect(KEY_W, 0, W - KEY_W, RULER_H); c.clip();
    for (k = b0; k <= b1; k++) {
      x = Math.round(this.timeToX(k * pr.bar)) + 0.5;
      c.strokeStyle = C_TEXT; c.globalAlpha = 0.4;
      c.beginPath(); c.moveTo(x, RULER_H * 0.45); c.lineTo(x, RULER_H); c.stroke();
      c.globalAlpha = 1;
      if (k % every === 0 && k >= 0) { c.fillStyle = C_TEXT; c.fillText(String(k + 1), x + 4, RULER_H / 2); }
      if (pr.beat * pps >= 12) {
        for (var bt = 1; bt < pr.sig[0]; bt++) {
          var bx = Math.round(this.timeToX(k * pr.bar + bt * pr.beat)) + 0.5;
          c.strokeStyle = C_LINE;
          c.beginPath(); c.moveTo(bx, RULER_H * 0.7); c.lineTo(bx, RULER_H); c.stroke();
        }
      }
    }
    c.restore();

    // keyboard
    c.save();
    c.beginPath(); c.rect(0, RULER_H, KEY_W, gb - RULER_H); c.clip();
    for (n = nTop; n >= nBot; n--) {
      y = this.noteToY(n);
      var black = BLACK[n % 12], pressed = n === this.pressedKey;
      c.fillStyle = C_TEXT;
      c.fillRect(0, y, KEY_W, rowH);
      if (black) {
        c.fillStyle = pressed ? C_ACCENT : C_BG;
        c.fillRect(0, y, KEY_W * 0.6, rowH);
      } else if (pressed) {
        c.fillStyle = C_ACCENT;
        c.fillRect(0, y, KEY_W, rowH);
      }
      if (!black && (n % 12 === 4 || n % 12 === 11)) { c.fillStyle = C_LINE; c.fillRect(0, Math.round(y) , KEY_W, 1); }
      if (n % 12 === 0) {
        c.fillStyle = C_LINE; c.fillRect(0, Math.round(y + rowH) - 1, KEY_W, 1);
        if (rowH >= 8) { c.fillStyle = C_BG; c.textAlign = 'right'; c.fillText(noteName(n), KEY_W - 4, y + rowH / 2); c.textAlign = 'left'; }
      }
    }
    c.restore();
    c.fillStyle = C_LINE;
    c.fillRect(KEY_W - 1, RULER_H, 1, gb - RULER_H);
    c.fillStyle = C_BG;
    c.fillRect(0, 0, KEY_W, RULER_H - 1);

    // velocity lane
    c.fillStyle = C_BG;
    c.fillRect(0, gb, W, H - gb);
    c.fillStyle = C_LINE;
    c.fillRect(0, gb, W, 1);
    c.fillStyle = C_TEXT;
    c.fillText('Velocity', 6, gb + 12);
    c.save();
    c.beginPath(); c.rect(KEY_W, gb + 1, W - KEY_W, H - gb - 1); c.clip();
    var vTop = gb + 8, vBot = H - 4;
    this.notes.forEach(function (nt, i) {
      var vx = self.timeToX(start + nt.t);
      if (vx < KEY_W - 4 || vx > W) return;
      var vh = nt.v * (vBot - vTop);
      c.fillStyle = self.sel.has(i) ? '#ffffff' : C_NOTE;
      c.fillRect(vx, vBot - vh, 3, vh);
      c.fillRect(vx - 1, vBot - vh, 5, 2);
    });
    c.restore();

    // play position
    var px = this.timeToX(this.playhead);
    if (px >= KEY_W && px <= W) {
      c.fillStyle = C_ACCENT;
      c.fillRect(Math.round(px), 0, 1, H);
      c.beginPath(); c.moveTo(px - 5, 0); c.lineTo(px + 5, 0); c.lineTo(px, 7); c.closePath(); c.fill();
    }
  };

  // ---------------------------------------------------------------- export

  AM.Midi = {
    instruments: instruments,
    instrumentDefaults: instrumentDefaults,
    drumNames: DRUM_NAMES,
    schedule: schedule,
    getInstrument: getInstrument,
    forgetTrack: forgetTrack,
    preview: preview,
    parseMidiFile: parseMidiFile,
    writeMidiFile: writeMidiFile,
    enableInput: enableInput,
    disableInput: disableInput,
    inputNames: inputNames,
    input: input,
    recordStart: recordStart,
    recordStop: recordStop,
    isRecording: function () { return !!rec; },
    PianoRoll: PianoRoll,
    noteName: noteName,
    mtof: mtof
  };
  Object.defineProperty(AM.Midi, 'monitor', {
    get: function () { return api.monitor; },
    set: function (v) { api.monitor = !!v; },
    enumerable: true
  });
  Object.defineProperty(AM.Midi, 'onDevicesChange', {
    get: function () { return api.onDevicesChange || null; },
    set: function (fn) { api.onDevicesChange = fn; },
    enumerable: true
  });
})();

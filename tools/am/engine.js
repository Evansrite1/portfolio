/* Audio mastering: engine. Project model, playback, recording, FX, tempo, render, export, undo and saving.
   Everything runs in the browser. Nothing is uploaded. */
(function () {
  'use strict';
  window.AM = window.AM || {};
  const AM = window.AM;

  /* ---------- small helpers ---------- */
  const MB_URL = '/tools/vendor/mediabunny/mediabunny.min.mjs';
  const MP3_URL = '/tools/vendor/mediabunny/mp3-encoder.min.mjs';
  const DB_NAME = 'ae-audio-mastering';
  const COLORS = ['#4c8dff', '#ff6b6b', '#2fc48d', '#f5a524', '#a77bff', '#22c1d6', '#ff7ac6', '#9bd14b'];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, def, lo, hi) => { v = +v; if (!isFinite(v)) v = def; return clamp(v, lo, hi); };
  const dbToLin = (db) => Math.pow(10, db / 20);
  const linToDb = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const sleep0 = () => new Promise((r) => setTimeout(r, 0));
  const baseName = (n) => String(n || 'Audio').replace(/\.[^.]+$/, '') || 'Audio';

  let uidN = 0;
  AM.uid = function (prefix) {
    uidN++;
    const r = Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
    return (prefix || 'id') + Date.now().toString(36) + uidN.toString(36) + r;
  };

  function makeBuffer(ctx, nch, len, sr) {
    nch = Math.max(1, nch | 0); len = Math.max(1, len | 0);
    if (typeof AudioBuffer === 'function') {
      try { return new AudioBuffer({ numberOfChannels: nch, length: len, sampleRate: sr }); } catch (e) { /* fall back */ }
    }
    return ctx.createBuffer(nch, len, sr);
  }
  function writeChannel(buf, data, ch) {
    if (buf.copyToChannel) buf.copyToChannel(data, ch);
    else buf.getChannelData(ch).set(data);
  }
  function off() {
    for (let i = 0; i < arguments.length; i++) {
      const n = arguments[i];
      if (n) { try { n.disconnect(); } catch (e) { /* not connected */ } }
    }
  }
  function req(r) {
    return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  function txDone(tx) {
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Save was cancelled')); });
  }

  /* ---------- project model ---------- */
  function defaultProject() {
    return {
      name: 'Untitled', bpm: 120, sig: [4, 4], sampleRate: 48000,
      loop: { on: false, start: 0, end: 8 },
      tracks: [],
      master: { gain: 1, fx: [] },
      snap: true
    };
  }
  function fxDefaults(type) {
    const d = AM.FX[type], o = {};
    if (d) d.params.forEach((p) => { o[p.key] = p.def; });
    return o;
  }
  function withDefaults(type, p) { return Object.assign(fxDefaults(type), p || {}); }
  function normFx(f) {
    if (!f || !f.type) return null;
    return { id: f.id || AM.uid('f'), type: f.type, on: f.on !== false, params: withDefaults(f.type, f.params) };
  }
  function normNote(n) {
    return { t: Math.max(0, +n.t || 0), d: Math.max(0.001, +n.d || 0.25), n: clamp(Math.round(+n.n || 60), 0, 127), v: n.v == null ? 0.8 : num(n.v, 0.8, 0, 1) };
  }
  function normClip(c, kind) {
    const k = c.kind === 'midi' || c.kind === 'audio' ? c.kind : kind;
    const base = Object.assign({}, c, { id: c.id || AM.uid('c'), kind: k, start: Math.max(0, +c.start || 0) });
    if (k === 'midi') {
      base.name = c.name || 'MIDI';
      base.length = Math.max(0.01, +c.length || 2);
      base.notes = (c.notes || []).map(normNote);
      return base;
    }
    base.name = c.name || 'Audio';
    base.srcId = c.srcId;
    base.offset = Math.max(0, +c.offset || 0);
    base.length = Math.max(0.001, +c.length || 1);
    base.gain = c.gain == null ? 1 : num(c.gain, 1, 0, 16);
    base.fadeIn = num(c.fadeIn, 0, 0, base.length);
    base.fadeOut = num(c.fadeOut, 0, 0, base.length);
    base.reverse = !!c.reverse;
    base.rate = num(c.rate, 1, 0.25, 4);
    return base;
  }
  function normTrack(t, i) {
    const type = t.type === 'midi' ? 'midi' : 'audio';
    const out = Object.assign({}, t, {
      id: t.id || AM.uid('t'), type,
      name: t.name || (type === 'midi' ? 'MIDI ' : 'Audio ') + (i + 1),
      color: t.color || COLORS[i % COLORS.length],
      gain: num(t.gain, 1, 0, 4), pan: num(t.pan, 0, -1, 1),
      mute: !!t.mute, solo: !!t.solo, arm: !!t.arm,
      fx: (t.fx || []).map(normFx).filter(Boolean),
      clips: (t.clips || []).map((c) => normClip(c, type)).filter((c) => c.kind === type)
    });
    if (type === 'midi') out.instrument = t.instrument && t.instrument.type ? { type: t.instrument.type, params: Object.assign({}, t.instrument.params) } : { type: 'synth', params: {} };
    else delete out.instrument;
    return out;
  }
  function normProject(p) {
    const d = defaultProject();
    p = p || {};
    return {
      name: p.name || d.name,
      bpm: num(p.bpm, 120, 20, 400),
      sig: Array.isArray(p.sig) && p.sig.length === 2 ? [clamp(p.sig[0] | 0 || 4, 1, 32), clamp(p.sig[1] | 0 || 4, 1, 32)] : d.sig,
      sampleRate: num(p.sampleRate, 48000, 8000, 192000),
      loop: { on: !!(p.loop && p.loop.on), start: Math.max(0, +(p.loop && p.loop.start) || 0), end: Math.max(0.05, +(p.loop && p.loop.end) || 8) },
      tracks: (p.tracks || []).map(normTrack),
      master: { gain: num(p.master && p.master.gain, 1, 0, 4), fx: ((p.master && p.master.fx) || []).map(normFx).filter(Boolean) },
      snap: p.snap !== false
    };
  }

  /* ---------- FX building blocks ---------- */
  function stereoIn(ctx) {
    const g = ctx.createGain();
    try { g.channelCount = 2; g.channelCountMode = 'explicit'; g.channelInterpretation = 'speakers'; } catch (e) { /* older engines */ }
    return g;
  }
  // set an AudioParam, smoothly when the node is already running
  function sp(ctx, param, v, live) {
    v = +v;
    if (!param || !isFinite(v)) return;
    if (live) { try { param.setTargetAtTime(v, ctx.currentTime, 0.012); return; } catch (e) { /* fall through */ } }
    try { param.value = v; } catch (e) { /* read only */ }
  }
  function setCurve(shaper, curve) { try { shaper.curve = curve; } catch (e) { /* engine refused a second curve */ } }
  function curveOf(fn, n) {
    n = n || 4097;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
    return c;
  }
  const absCurve = () => curveOf((x) => Math.abs(x));
  // the envelope is scaled so the threshold sits at 0.125 of the shaper input range
  const ENV_AT = 0.125, RECT_MEAN = 0.637;
  function gateCurve(floor) {
    return curveOf((x) => {
      if (x <= 0) return floor;
      const r = x / ENV_AT;
      return r >= 1 ? 1 : Math.max(floor, r * r * r * r);
    });
  }
  function reduceCurve(floor, ratio) {
    const k = 1 - 1 / ratio;
    return curveOf((x) => {
      if (x <= 0) return 1;
      const r = x / ENV_AT;
      return r <= 1 ? 1 : Math.max(floor, Math.pow(r, -k));
    });
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // generated room impulse: decaying noise, darker as it fades, the same every time
  function makeImpulse(ctx, decay, tone) {
    const sr = ctx.sampleRate, len = Math.max(256, Math.round(sr * clamp(decay, 0.1, 10)));
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch), rand = rng(9173 + ch * 7919);
      const fade = Math.max(1, Math.round(sr * 0.002));
      let y = 0, a = 0;
      for (let i = 0; i < len; i++) {
        if ((i & 63) === 0) {
          const fc = tone * Math.pow(0.25, i / len);
          a = Math.exp((-2 * Math.PI * Math.min(fc, sr * 0.45)) / sr);
        }
        const x = rand() * 2 - 1;
        y = (1 - a) * x + a * y;
        let env = Math.exp((-6.91 * i) / len);
        if (i < fade) env *= i / fade;
        d[i] = y * env;
      }
    }
    return buf;
  }
  // wraps the common FX plumbing: input/output nodes, defaults, smooth updates, cleanup
  function makeFx(type, ctx, params, setup) {
    const input = stereoIn(ctx), output = ctx.createGain();
    const parts = setup(ctx, input, output);
    let live = false;
    const api = {
      input, output,
      set(p) { parts.set(withDefaults(type, p), live); },
      dispose() {
        (parts.oscs || []).forEach((o) => { try { o.stop(); } catch (e) { /* already stopped */ } });
        off.apply(null, [input, output].concat(parts.nodes || []));
      }
    };
    if (parts.meter) api.meter = parts.meter;
    api.set(params || {});
    live = true;
    return api;
  }
  const P = (key, label, min, max, step, def, unit, extra) => Object.assign({ key, label, min, max, step, def, unit: unit || '' }, extra || {});
  const reductionOf = (c) => { const r = c.reduction; return typeof r === 'number' ? r : (r && typeof r.value === 'number' ? r.value : 0); };

  /* ---------- FX registry ---------- */
  const FX = AM.FX = {};

  FX.eq = {
    name: 'EQ',
    params: [
      P('low', 'Low', -18, 18, 0.5, 0, 'dB'), P('lowFreq', 'Low freq', 30, 500, 1, 100, 'Hz', { scale: 'log' }),
      P('mid', 'Mid', -18, 18, 0.5, 0, 'dB'), P('midFreq', 'Mid freq', 100, 10000, 1, 1000, 'Hz', { scale: 'log' }),
      P('q', 'Mid width (Q)', 0.2, 6, 0.1, 0.9),
      P('high', 'High', -18, 18, 0.5, 0, 'dB'), P('highFreq', 'High freq', 1500, 16000, 10, 8000, 'Hz', { scale: 'log' })
    ],
    create(ctx, params) {
      return makeFx('eq', ctx, params, (ctx, i, o) => {
        const lo = ctx.createBiquadFilter(), mi = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
        lo.type = 'lowshelf'; mi.type = 'peaking'; hi.type = 'highshelf';
        i.connect(lo); lo.connect(mi); mi.connect(hi); hi.connect(o);
        return {
          nodes: [lo, mi, hi],
          set(p, live) {
            sp(ctx, lo.gain, p.low, live); sp(ctx, lo.frequency, p.lowFreq, live);
            sp(ctx, mi.gain, p.mid, live); sp(ctx, mi.frequency, p.midFreq, live); sp(ctx, mi.Q, p.q, live);
            sp(ctx, hi.gain, p.high, live); sp(ctx, hi.frequency, p.highFreq, live);
          }
        };
      });
    }
  };

  FX.comp = {
    name: 'Compressor',
    params: [
      P('threshold', 'Threshold', -60, 0, 0.5, -18, 'dB'), P('ratio', 'Ratio', 1, 20, 0.1, 4, ':1'),
      P('attack', 'Attack', 0, 200, 1, 10, 'ms'), P('release', 'Release', 10, 1000, 1, 150, 'ms'),
      P('knee', 'Knee', 0, 40, 1, 6, 'dB'), P('makeup', 'Makeup gain', 0, 24, 0.5, 0, 'dB')
    ],
    create(ctx, params) {
      return makeFx('comp', ctx, params, (ctx, i, o) => {
        const c = ctx.createDynamicsCompressor(), mk = ctx.createGain();
        i.connect(c); c.connect(mk); mk.connect(o);
        return {
          nodes: [c, mk],
          set(p, live) {
            sp(ctx, c.threshold, p.threshold, live); sp(ctx, c.ratio, p.ratio, live); sp(ctx, c.knee, p.knee, live);
            sp(ctx, c.attack, clamp(p.attack / 1000, 0, 1), live); sp(ctx, c.release, clamp(p.release / 1000, 0.01, 1), live);
            sp(ctx, mk.gain, dbToLin(p.makeup), live);
          },
          meter: () => reductionOf(c)
        };
      });
    }
  };

  FX.gate = {
    name: 'Noise gate',
    params: [
      P('threshold', 'Threshold', -90, 0, 0.5, -50, 'dB'), P('reduction', 'Reduction', 0, 90, 1, 40, 'dB'),
      P('release', 'Release', 20, 500, 1, 80, 'ms')
    ],
    create(ctx, params) {
      return makeFx('gate', ctx, params, (ctx, i, o) => {
        const dly = ctx.createDelay(0.1), vca = ctx.createGain();
        const rect = ctx.createWaveShaper(), env = ctx.createBiquadFilter(), pre = ctx.createGain(), shp = ctx.createWaveShaper();
        vca.gain.value = 0;
        setCurve(rect, absCurve());
        env.type = 'lowpass'; env.Q.value = 0.5;
        i.connect(dly); dly.connect(vca); vca.connect(o);
        i.connect(rect); rect.connect(env); env.connect(pre); pre.connect(shp); shp.connect(vca.gain);
        let lastRed = null;
        return {
          nodes: [dly, vca, rect, env, pre, shp],
          set(p, live) {
            sp(ctx, pre.gain, ENV_AT / (dbToLin(p.threshold) * RECT_MEAN), live);
            const rel = clamp(p.release, 20, 500) / 1000;
            sp(ctx, env.frequency, clamp(0.35 / rel, 0.5, 200), live);
            sp(ctx, dly.delayTime, Math.min(0.05, rel * 0.3), false);
            if (p.reduction !== lastRed) { lastRed = p.reduction; setCurve(shp, gateCurve(dbToLin(-p.reduction))); }
          }
        };
      });
    }
  };

  FX.limiter = {
    name: 'Limiter',
    params: [
      P('gain', 'Input gain', 0, 24, 0.5, 0, 'dB'), P('ceiling', 'Ceiling', -12, 0, 0.1, -1, 'dB'),
      P('release', 'Release', 10, 1000, 1, 80, 'ms')
    ],
    create(ctx, params) {
      return makeFx('limiter', ctx, params, (ctx, i, o) => {
        const pre = ctx.createGain(), c = ctx.createDynamicsCompressor(), clip = ctx.createWaveShaper();
        c.knee.value = 0; c.ratio.value = 20; c.attack.value = 0.001;
        clip.oversample = '4x';
        i.connect(pre); pre.connect(c); c.connect(clip); clip.connect(o);
        let lastCeil = null;
        return {
          nodes: [pre, c, clip],
          set(p, live) {
            sp(ctx, pre.gain, dbToLin(p.gain), live);
            sp(ctx, c.threshold, p.ceiling - 0.5, live);
            sp(ctx, c.release, clamp(p.release / 1000, 0.01, 1), live);
            if (p.ceiling !== lastCeil) {
              lastCeil = p.ceiling;
              const lim = dbToLin(p.ceiling);
              setCurve(clip, curveOf((x) => clamp(x, -lim, lim)));
            }
          },
          meter: () => reductionOf(c)
        };
      });
    }
  };

  FX.reverb = {
    name: 'Reverb',
    params: [
      P('mix', 'Mix', 0, 1, 0.01, 0.25), P('decay', 'Decay', 0.2, 10, 0.1, 2, 's'),
      P('predelay', 'Pre delay', 0, 200, 1, 10, 'ms'), P('tone', 'Tone', 1000, 16000, 10, 6000, 'Hz', { scale: 'log' })
    ],
    create(ctx, params) {
      return makeFx('reverb', ctx, params, (ctx, i, o) => {
        const pre = ctx.createDelay(1), conv = ctx.createConvolver(), wet = ctx.createGain(), dry = ctx.createGain();
        conv.normalize = true;
        i.connect(dry); dry.connect(o);
        i.connect(pre); pre.connect(conv); conv.connect(wet); wet.connect(o);
        let irKey = '';
        return {
          nodes: [pre, conv, wet, dry],
          set(p, live) {
            const k = p.decay + '|' + p.tone;
            if (k !== irKey) { irKey = k; conv.buffer = makeImpulse(ctx, p.decay, p.tone); }
            sp(ctx, pre.delayTime, clamp(p.predelay, 0, 200) / 1000, live);
            sp(ctx, dry.gain, Math.cos(clamp(p.mix, 0, 1) * Math.PI / 2), live);
            sp(ctx, wet.gain, Math.sin(clamp(p.mix, 0, 1) * Math.PI / 2), live);
          }
        };
      });
    }
  };

  FX.delay = {
    name: 'Delay',
    params: [
      P('time', 'Time', 10, 2000, 1, 375, 'ms'), P('feedback', 'Feedback', 0, 0.95, 0.01, 0.35),
      P('mix', 'Echo level', 0, 1, 0.01, 0.3), P('tone', 'Tone', 500, 16000, 10, 5000, 'Hz', { scale: 'log' })
    ],
    create(ctx, params) {
      return makeFx('delay', ctx, params, (ctx, i, o) => {
        const d = ctx.createDelay(2.5), lp = ctx.createBiquadFilter(), fb = ctx.createGain(), wet = ctx.createGain();
        lp.type = 'lowpass';
        i.connect(o);
        i.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(o);
        return {
          nodes: [d, lp, fb, wet],
          set(p, live) {
            sp(ctx, d.delayTime, clamp(p.time, 10, 2000) / 1000, live);
            sp(ctx, fb.gain, clamp(p.feedback, 0, 0.95), live);
            sp(ctx, lp.frequency, p.tone, live);
            sp(ctx, wet.gain, clamp(p.mix, 0, 1), live);
          }
        };
      });
    }
  };

  FX.chorus = {
    name: 'Chorus',
    params: [
      P('rate', 'Rate', 0.05, 8, 0.05, 0.8, 'Hz'), P('depth', 'Depth', 0, 10, 0.1, 3, 'ms'),
      P('delay', 'Delay', 2, 30, 0.5, 12, 'ms'), P('mix', 'Mix', 0, 1, 0.01, 0.5)
    ],
    create(ctx, params) {
      return makeFx('chorus', ctx, params, (ctx, i, o) => {
        const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
        const dl = ctx.createDelay(0.1), dr = ctx.createDelay(0.1), lfo = ctx.createOscillator();
        const gl = ctx.createGain(), gr = ctx.createGain(), wet = ctx.createGain();
        lfo.type = 'sine';
        i.connect(o);
        i.connect(split); split.connect(dl, 0); split.connect(dr, 1);
        dl.connect(merge, 0, 0); dr.connect(merge, 0, 1); merge.connect(wet); wet.connect(o);
        lfo.connect(gl); lfo.connect(gr); gl.connect(dl.delayTime); gr.connect(dr.delayTime);
        lfo.start();
        return {
          nodes: [split, merge, dl, dr, lfo, gl, gr, wet], oscs: [lfo],
          set(p, live) {
            const depth = clamp(p.depth, 0, 10) / 1000, base = Math.max(clamp(p.delay, 2, 30) / 1000, depth + 0.001);
            sp(ctx, dl.delayTime, base, live); sp(ctx, dr.delayTime, base, live);
            sp(ctx, gl.gain, depth, live); sp(ctx, gr.gain, -depth, live);
            sp(ctx, lfo.frequency, p.rate, live);
            sp(ctx, wet.gain, clamp(p.mix, 0, 1), live);
          }
        };
      });
    }
  };

  const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch'];
  FX.filter = {
    name: 'Filter',
    params: [
      P('mode', 'Type', 0, 3, 1, 0, '', { options: ['Low pass', 'High pass', 'Band pass', 'Notch'] }),
      P('freq', 'Frequency', 20, 20000, 1, 1000, 'Hz', { scale: 'log' }), P('q', 'Resonance (Q)', 0.1, 20, 0.1, 0.7)
    ],
    create(ctx, params) {
      return makeFx('filter', ctx, params, (ctx, i, o) => {
        const f = ctx.createBiquadFilter();
        i.connect(f); f.connect(o);
        return {
          nodes: [f],
          set(p, live) {
            const t = FILTER_TYPES[clamp(Math.round(p.mode) || 0, 0, 3)];
            if (f.type !== t) f.type = t;
            sp(ctx, f.frequency, clamp(p.freq, 20, 20000), live); sp(ctx, f.Q, p.q, live);
          }
        };
      });
    }
  };

  FX.distortion = {
    name: 'Distortion',
    params: [
      P('drive', 'Drive', 0, 40, 0.5, 12, 'dB'), P('tone', 'Tone', 500, 16000, 10, 8000, 'Hz', { scale: 'log' }),
      P('mix', 'Mix', 0, 1, 0.01, 1), P('output', 'Output', -24, 6, 0.5, -6, 'dB')
    ],
    create(ctx, params) {
      return makeFx('distortion', ctx, params, (ctx, i, o) => {
        const sh = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(), wet = ctx.createGain(), dry = ctx.createGain();
        sh.oversample = '4x'; lp.type = 'lowpass';
        i.connect(dry); dry.connect(o);
        i.connect(sh); sh.connect(lp); lp.connect(wet); wet.connect(o);
        let lastDrive = null;
        return {
          nodes: [sh, lp, wet, dry],
          set(p, live) {
            if (p.drive !== lastDrive) {
              lastDrive = p.drive;
              const k = dbToLin(p.drive), n = Math.tanh(k);
              setCurve(sh, curveOf((x) => Math.tanh(k * x) / n));
            }
            const mix = clamp(p.mix, 0, 1);
            sp(ctx, lp.frequency, p.tone, live);
            sp(ctx, wet.gain, mix * dbToLin(p.output), live);
            sp(ctx, dry.gain, 1 - mix, live);
          }
        };
      });
    }
  };

  FX.deesser = {
    name: 'De-esser',
    params: [
      P('freq', 'Frequency', 2000, 12000, 10, 6000, 'Hz', { scale: 'log' }),
      P('threshold', 'Threshold', -60, 0, 0.5, -30, 'dB'), P('amount', 'Max reduction', 0, 24, 0.5, 8, 'dB')
    ],
    create(ctx, params) {
      return makeFx('deesser', ctx, params, (ctx, i, o) => {
        const mk = (type) => { const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = Math.SQRT1_2; return f; };
        const lp1 = mk('lowpass'), lp2 = mk('lowpass'), hp1 = mk('highpass'), hp2 = mk('highpass');
        const vca = ctx.createGain(), rect = ctx.createWaveShaper(), env = ctx.createBiquadFilter(), pre = ctx.createGain(), shp = ctx.createWaveShaper();
        vca.gain.value = 0;
        setCurve(rect, absCurve());
        env.type = 'lowpass'; env.frequency.value = 35; env.Q.value = 0.5;
        // Linkwitz-Riley split: the two bands add back to a flat response
        i.connect(lp1); lp1.connect(lp2); lp2.connect(o);
        i.connect(hp1); hp1.connect(hp2); hp2.connect(vca); vca.connect(o);
        hp2.connect(rect); rect.connect(env); env.connect(pre); pre.connect(shp); shp.connect(vca.gain);
        let lastAmt = null;
        return {
          nodes: [lp1, lp2, hp1, hp2, vca, rect, env, pre, shp],
          set(p, live) {
            [lp1, lp2, hp1, hp2].forEach((f) => sp(ctx, f.frequency, p.freq, live));
            sp(ctx, pre.gain, ENV_AT / (dbToLin(p.threshold) * RECT_MEAN), live);
            if (p.amount !== lastAmt) { lastAmt = p.amount; setCurve(shp, reduceCurve(dbToLin(-p.amount), 4)); }
          }
        };
      });
    }
  };

  FX.stereo = {
    name: 'Stereo width',
    params: [P('width', 'Width', 0, 2, 0.01, 1, '', { hint: '0 is mono, 1 is unchanged, 2 is extra wide' })],
    create(ctx, params) {
      return makeFx('stereo', ctx, params, (ctx, i, o) => {
        const split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
        const mL = ctx.createGain(), mR = ctx.createGain(), sL = ctx.createGain(), sR = ctx.createGain();
        const mid = ctx.createGain(), side = ctx.createGain(), inv = ctx.createGain();
        mL.gain.value = 0.5; mR.gain.value = 0.5; sL.gain.value = 0.5; sR.gain.value = -0.5; inv.gain.value = -1;
        i.connect(split);
        split.connect(mL, 0); split.connect(mR, 1); split.connect(sL, 0); split.connect(sR, 1);
        mL.connect(mid); mR.connect(mid); sL.connect(side); sR.connect(side);
        mid.connect(merge, 0, 0); mid.connect(merge, 0, 1);
        side.connect(merge, 0, 0); side.connect(inv); inv.connect(merge, 0, 1);
        merge.connect(o);
        return {
          nodes: [split, merge, mL, mR, sL, sR, mid, side, inv],
          set(p, live) { sp(ctx, side.gain, clamp(p.width, 0, 2), live); }
        };
      });
    }
  };

  /* ---------- time stretch (WSOLA, keeps pitch) ---------- */
  // channels: Float32Array[]; factor 2 = twice as long. Generator so long files can yield to the page.
  function* wsolaGen(chs, factor, sr) {
    const nCh = chs.length, inLen = chs[0].length;
    const outLen = Math.max(1, Math.round(inLen * factor));
    if (Math.abs(factor - 1) < 1e-4) return chs.map((c) => new Float32Array(c));
    if (inLen < 256) {
      return chs.map((c) => {
        const o = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) { const x = (i / factor), a = Math.floor(x), f = x - a; o[i] = (c[a] || 0) * (1 - f) + (c[a + 1] || 0) * f; }
        return o;
      });
    }
    let N = Math.round(sr * 0.03); N += N % 2;
    const Hs = N / 2, Ha = Hs / factor, tol = Math.round(sr * 0.01);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const pad = tol + N, padLen = inLen + 2 * pad + N + Hs + 4;
    const pc = chs.map((c) => { const p = new Float32Array(padLen); p.set(c, pad); return p; });
    const mono = new Float32Array(padLen);
    for (let c = 0; c < nCh; c++) { const p = pc[c]; for (let i = 0; i < padLen; i++) mono[i] += p[i] / nCh; }
    const outs = chs.map(() => new Float32Array(outLen + N)), wsum = new Float32Array(outLen + N);
    const coarse = Math.max(2, Math.round(sr / 8000));
    const score = (c, nat, step) => {
      let s = 0; const bc = pad + c, bn = pad + nat;
      for (let i = 0; i < N; i += step) s += mono[bc + i] * mono[bn + i];
      return s;
    };
    let prev = 0;
    for (let k = 0; ; k++) {
      const op = k * Hs;
      if (op >= outLen) break;
      const nominal = Math.round(k * Ha);
      let best = nominal;
      if (k > 0) {
        const nat = prev + Hs;
        let bs = score(nominal, nat, coarse);
        for (let d = -tol; d <= tol; d += coarse) {
          const s = score(nominal + d, nat, coarse);
          if (s > bs + 1e-12) { bs = s; best = nominal + d; }
        }
        const c0 = best;
        let fs = score(c0, nat, 2);
        for (let d = 1 - coarse; d < coarse; d++) {
          const c = c0 + d;
          if (d === 0 || c < nominal - tol || c > nominal + tol) continue;
          const s = score(c, nat, 2);
          if (s > fs + 1e-12) { fs = s; best = c; }
        }
      }
      const base = pad + best;
      for (let c = 0; c < nCh; c++) {
        const src = pc[c], o = outs[c];
        for (let i = 0; i < N; i++) o[op + i] += win[i] * src[base + i];
      }
      for (let i = 0; i < N; i++) wsum[op + i] += win[i];
      prev = best;
      if ((k & 15) === 15) yield op / outLen;
    }
    return outs.map((o) => {
      const r = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) { const w = wsum[i]; r[i] = w > 1e-3 ? o[i] / w : 0; }
      return r;
    });
  }
  function wsola(chs, factor, sr) {
    const g = wsolaGen(chs, factor, sr);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }
  async function wsolaAsync(chs, factor, sr, onProgress) {
    const g = wsolaGen(chs, factor, sr);
    let r = g.next(), t = nowMs();
    while (!r.done) {
      if (nowMs() - t > 30) { if (onProgress) onProgress(r.value); await sleep0(); t = nowMs(); }
      r = g.next();
    }
    return r.value;
  }

  /* ---------- WAV encoding ---------- */
  function encodeWav(buf, bits) {
    bits = bits === 24 ? 24 : bits === 32 ? 32 : 16;
    const nCh = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate, bps = bits / 8;
    const dataLen = len * nCh * bps, out = new Uint8Array(44 + dataLen), dv = new DataView(out.buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
    str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, bits === 32 ? 3 : 1, true);
    dv.setUint16(22, nCh, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * nCh * bps, true);
    dv.setUint16(32, nCh * bps, true); dv.setUint16(34, bits, true);
    str(36, 'data'); dv.setUint32(40, dataLen, true);
    const cs = [];
    for (let c = 0; c < nCh; c++) cs.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        let v = cs[c][i];
        if (!(v === v)) v = 0;
        if (bits === 32) { dv.setFloat32(o, v, true); o += 4; continue; }
        v = v > 1 ? 1 : v < -1 ? -1 : v;
        if (bits === 16) { dv.setInt16(o, Math.round(v < 0 ? v * 32768 : v * 32767), true); o += 2; }
        else { const n = Math.round(v < 0 ? v * 8388608 : v * 8388607); out[o] = n & 255; out[o + 1] = (n >> 8) & 255; out[o + 2] = (n >> 16) & 255; o += 3; }
      }
    }
    return out;
  }

  /* ---------- recorder worklet (inlined, loaded from a blob URL) ---------- */
  const REC_WORKLET = [
    'class AmRec extends AudioWorkletProcessor {',
    '  constructor() { super(); this.size = 4096; this.buf = null; this.n = 0; this.t = 0; this.on = true;',
    '    this.port.onmessage = (e) => { if (e.data === "flush") { this.send(); this.on = false; this.port.postMessage({ done: true }); } }; }',
    '  send() { if (this.buf && this.n) this.port.postMessage({ t: this.t, ch: this.buf.map((b) => b.slice(0, this.n)) }); this.buf = null; this.n = 0; }',
    '  process(inputs) {',
    '    if (!this.on) return false;',
    '    const inp = inputs[0];',
    '    if (inp && inp.length) {',
    '      const L = inp[0].length;',
    '      if (this.buf && this.buf.length !== inp.length) this.send();',
    '      if (!this.buf) { this.buf = inp.map(() => new Float32Array(this.size)); this.t = currentTime; this.n = 0; }',
    '      for (let c = 0; c < inp.length; c++) this.buf[c].set(inp[c], this.n);',
    '      this.n += L;',
    '      if (this.n + L > this.size) this.send();',
    '    }',
    '    return true;',
    '  }',
    '}',
    'registerProcessor("am-recorder", AmRec);'
  ].join('\n');

  /* ---------- Engine ---------- */
  class Engine {
    constructor() {
      this.ctx = null;
      this.project = defaultProject();
      this.sources = new Map();
      this.metronome = false;
      this.monitor = false;          // hear the input through the track while recording
      this.latencyOffsetMs = 0;      // extra shift for recorded takes, positive moves takes earlier
      this.autosave = true;
      this.maxUndo = 200;
      this.lastSaved = 0;
      this._ev = new Map();
      this._undo = []; this._redo = [];
      this._snap = JSON.stringify(this.project);
      this._lastKey = null; this._lastKeyTime = 0;
      this._batchDepth = 0; this._batchDirty = false;
      this._pos = 0; this._pl = null; this._timer = 0; this._lastTimeEmit = 0;
      this._g = null; this._clickOut = null;
      this._rec = null; this._recModule = null;
      this._peaks = new Map(); this._rev = new Map();
      this._saveChain = Promise.resolve(); this._saveTimer = 0; this._saveErrShown = false; this._loading = false;
      // any 'change' (from the engine or from a UI that edited project directly) re-syncs live audio and autosaves
      this.on('change', () => { this._onChanged(); this._scheduleAutosave(); });
    }

    /* events */
    on(ev, fn) { if (!this._ev.has(ev)) this._ev.set(ev, new Set()); this._ev.get(ev).add(fn); return fn; }
    off(ev, fn) { const s = this._ev.get(ev); if (s) s.delete(fn); }
    emit(ev, arg) {
      const s = this._ev.get(ev);
      if (!s) return;
      Array.from(s).forEach((fn) => { try { fn(arg); } catch (e) { if (typeof console !== 'undefined') console.error(e); } });
    }

    /* audio context */
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.emit('error', 'This browser does not support Web Audio, so sound cannot play here.'); return null; }
        try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
      }
      if (this.ctx.state === 'suspended' && this.ctx.resume) { try { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed yet */ } }
      return this.ctx;
    }
    _live() {
      const ctx = this.ensure();
      if (!ctx) return null;
      if (!this._g) {
        this._g = this._buildGraph(ctx, ctx.destination, {});
        this._clickOut = ctx.createGain();
        this._clickOut.gain.value = 0.5;
        this._clickOut.connect(ctx.destination);
      }
      return this._g;
    }

    /* undo and change tracking */
    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }
    get undoLabel() { return this._undo.length ? this._undo[this._undo.length - 1].reason : ''; }
    get redoLabel() { return this._redo.length ? this._redo[this._redo.length - 1].reason : ''; }
    commit(reason) { this._commit(reason || 'Edit'); }
    _commit(reason, key) {
      if (this._batchDepth > 0) { this._batchDirty = true; return; }
      const snap = JSON.stringify(this.project);
      if (snap === this._snap) return;
      const t = Date.now();
      const merge = key && key === this._lastKey && t - this._lastKeyTime < 800 && this._undo.length;
      if (!merge) {
        this._undo.push({ snap: this._snap, reason });
        if (this._undo.length > this.maxUndo) this._undo.shift();
      }
      this._redo.length = 0;
      this._snap = snap;
      this._lastKey = key || null; this._lastKeyTime = t;
      this._changed(reason);
    }
    // a change that is saved but does not get its own undo step (loop region, snap)
    _touch(reason) {
      if (this._batchDepth > 0) { this._batchDirty = true; return; }
      this._snap = JSON.stringify(this.project);
      this._changed(reason);
    }
    _changed(reason) { this.emit('change', { reason }); }
    batch(reason, fn) {
      this._batchDepth++;
      try { return fn(); } finally {
        this._batchDepth--;
        if (this._batchDepth === 0 && this._batchDirty) { this._batchDirty = false; this._commit(reason || 'Edit'); }
      }
    }
    _restoreSnap(snap, reason) {
      this.project = normProject(JSON.parse(snap));
      this._snap = JSON.stringify(this.project);
      this._lastKey = null;
      this._changed(reason);
    }
    undo() {
      if (this._batchDepth || !this._undo.length) return false;
      const e = this._undo.pop();
      this._redo.push({ snap: this._snap, reason: e.reason });
      this._restoreSnap(e.snap, 'undo');
      return true;
    }
    redo() {
      if (this._batchDepth || !this._redo.length) return false;
      const e = this._redo.pop();
      this._undo.push({ snap: this._snap, reason: e.reason });
      this._restoreSnap(e.snap, 'redo');
      return true;
    }

    /* sources */
    addSource(buffer, name) {
      const id = AM.uid('s');
      this.sources.set(id, { id, name: name || 'Audio', buffer });
      return id;
    }
    async decodeFile(file) {
      const ctx = this.ensure();
      if (!ctx) throw new Error('No Web Audio');
      const ab = await file.arrayBuffer();
      const buf = await new Promise((res, rej) => {
        const p = ctx.decodeAudioData(ab, res, rej);
        if (p && p.then) p.then(res, rej);
      });
      return this.addSource(buf, baseName(file.name));
    }
    sliceSource(srcId, start, end) {
      const s = this.sources.get(srcId);
      if (!s) return null;
      const b = s.buffer, sr = b.sampleRate;
      const a = clamp(Math.round((start || 0) * sr), 0, b.length - 1);
      const e = clamp(Math.round((end == null ? b.duration : end) * sr), a + 1, b.length);
      const out = makeBuffer(this.ctx, b.numberOfChannels, e - a, sr);
      for (let c = 0; c < b.numberOfChannels; c++) writeChannel(out, b.getChannelData(c).subarray(a, e), c);
      return out;
    }
    _reversed(s) {
      let r = this._rev.get(s.id);
      if (r) return r;
      const b = s.buffer, n = b.length;
      r = makeBuffer(this.ctx, b.numberOfChannels, n, b.sampleRate);
      for (let c = 0; c < b.numberOfChannels; c++) {
        const src = b.getChannelData(c), d = new Float32Array(n);
        for (let i = 0; i < n; i++) d[i] = src[n - 1 - i];
        writeChannel(r, d, c);
      }
      this._rev.set(s.id, r);
      return r;
    }
    getPeaks(srcId, samplesPerPixel) {
      const spp = Math.max(1, Math.round(+samplesPerPixel || 1));
      const s = this.sources.get(srcId);
      if (!s || !s.buffer) return { min: new Float32Array(0), max: new Float32Array(0) };
      let cache = this._peaks.get(srcId);
      if (!cache) { cache = new Map(); this._peaks.set(srcId, cache); }
      const hit = cache.get(spp);
      if (hit) { cache.delete(spp); cache.set(spp, hit); return hit; }
      const b = s.buffer, n = b.length, cnt = Math.max(1, Math.ceil(n / spp));
      const mn = new Float32Array(cnt), mx = new Float32Array(cnt);
      let baseSpp = 0, base = null;
      cache.forEach((v, k) => { if (k < spp && spp % k === 0 && k > baseSpp) { baseSpp = k; base = v; } });
      if (base) {
        const r = spp / baseSpp, bl = base.min.length;
        for (let i = 0; i < cnt; i++) {
          let lo = Infinity, hi = -Infinity;
          for (let j = i * r, e = Math.min(bl, (i + 1) * r); j < e; j++) { if (base.min[j] < lo) lo = base.min[j]; if (base.max[j] > hi) hi = base.max[j]; }
          if (lo === Infinity) lo = hi = 0;
          mn[i] = lo; mx[i] = hi;
        }
      } else {
        const nch = b.numberOfChannels, chs = [];
        for (let c = 0; c < nch; c++) chs.push(b.getChannelData(c));
        const inv = 1 / nch;
        for (let i = 0; i < cnt; i++) {
          const a = i * spp, e = Math.min(n, a + spp);
          let lo = Infinity, hi = -Infinity;
          for (let j = a; j < e; j++) {
            let v = 0;
            for (let c = 0; c < nch; c++) v += chs[c][j];
            v *= inv;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          if (lo === Infinity) lo = hi = 0;
          mn[i] = lo; mx[i] = hi;
        }
      }
      const res = { min: mn, max: mx };
      cache.set(spp, res);
      while (cache.size > 12) cache.delete(cache.keys().next().value);
      return res;
    }
    async importFiles(fileList, opts) {
      opts = opts || {};
      const files = Array.from(fileList || []);
      const at = Math.max(0, +opts.at || 0);
      const items = [];
      for (const f of files) {
        const name = baseName(f.name);
        if (/\.(mid|midi)$/i.test(f.name || '') || /midi/i.test(f.type || '')) {
          if (!AM.Midi || typeof AM.Midi.parseMidiFile !== 'function') { this.emit('error', 'MIDI files need the MIDI part of the app, which has not loaded.'); continue; }
          try { items.push({ name, midi: AM.Midi.parseMidiFile(await f.arrayBuffer()) }); } catch (e) { this.emit('error', 'Could not read the MIDI file ' + f.name + '.'); }
        } else {
          try { items.push({ name, srcId: await this.decodeFile(f) }); } catch (e) { this.emit('error', 'Could not open ' + f.name + '. The browser could not decode its audio.'); }
        }
      }
      if (!items.length) return [];
      const made = [];
      this.batch('Import', () => {
        const tgt = opts.trackId ? this.findTrack(opts.trackId) : null;
        let pos = at;
        const empty = !this.project.tracks.some((t) => t.clips.length);
        for (const it of items) {
          if (it.srcId) {
            const len = this.sources.get(it.srcId).buffer.duration;
            const clip = { kind: 'audio', srcId: it.srcId, name: it.name, offset: 0, length: len };
            if (tgt && tgt.type === 'audio') { made.push(this.addClip(tgt.id, Object.assign(clip, { start: pos }))); pos += len; }
            else { const t = this.addTrack({ type: 'audio', name: it.name }); made.push(this.addClip(t.id, Object.assign(clip, { start: at }))); }
            continue;
          }
          const m = it.midi || {};
          if (empty && m.bpm > 0) this.project.bpm = num(m.bpm, 120, 20, 400);
          const spBar = (60 / this.project.bpm) * this.project.sig[0];
          const parts = (m.tracks || []).filter((mt) => mt.notes && mt.notes.length);
          const lenOf = (notes) => Math.max(spBar, Math.ceil(notes.reduce((e, n) => Math.max(e, n.t + n.d), 0) / spBar - 1e-9) * spBar);
          if (tgt && tgt.type === 'midi') {
            const notes = [].concat.apply([], parts.map((mt) => mt.notes));
            if (notes.length) made.push(this.addClip(tgt.id, { kind: 'midi', name: it.name, start: pos, length: lenOf(notes), notes }));
            continue;
          }
          parts.forEach((mt, i) => {
            const t = this.addTrack({ type: 'midi', name: mt.name || (it.name + (parts.length > 1 ? ' ' + (i + 1) : '')) });
            made.push(this.addClip(t.id, { kind: 'midi', name: mt.name || it.name, start: at, length: lenOf(mt.notes), notes: mt.notes }));
          });
        }
      });
      return made;
    }

    /* tracks */
    findTrack(trackId) { return this.project.tracks.find((t) => t.id === trackId) || null; }
    findClip(clipId) {
      for (const track of this.project.tracks) {
        const clip = track.clips.find((c) => c.id === clipId);
        if (clip) return { track, clip };
      }
      return null;
    }
    duration() {
      let end = 0;
      this.project.tracks.forEach((t) => t.clips.forEach((c) => { end = Math.max(end, c.start + c.length); }));
      return end;
    }
    addTrack(opts) {
      opts = opts || {};
      const p = this.project, type = opts.type === 'midi' ? 'midi' : 'audio';
      const n = p.tracks.filter((t) => t.type === type).length + 1;
      const t = normTrack({
        id: AM.uid('t'), type, name: opts.name || (type === 'midi' ? 'MIDI ' : 'Audio ') + n,
        color: opts.color || COLORS[p.tracks.length % COLORS.length],
        instrument: opts.instrument ? clone(opts.instrument) : undefined
      }, p.tracks.length);
      const idx = opts.index == null ? p.tracks.length : clamp(opts.index | 0, 0, p.tracks.length);
      p.tracks.splice(idx, 0, t);
      this._commit('Add track');
      return t;
    }
    removeTrack(trackId) {
      const i = this.project.tracks.findIndex((t) => t.id === trackId);
      if (i < 0) return false;
      this.project.tracks.splice(i, 1);
      this._commit('Delete track');
      return true;
    }
    updateTrack(trackId, patch) {
      patch = patch || {};
      if (trackId === 'master') {
        if (patch.gain != null) this.project.master.gain = num(patch.gain, 1, 0, 4);
        this._commit('Master volume', 'trk:master');
        return this.project.master;
      }
      const t = this.findTrack(trackId);
      if (!t) return null;
      const keys = Object.keys(patch);
      if ('name' in patch) t.name = String(patch.name || t.name);
      if ('color' in patch) t.color = String(patch.color || t.color);
      if ('gain' in patch) t.gain = num(patch.gain, t.gain, 0, 4);
      if ('pan' in patch) t.pan = num(patch.pan, t.pan, -1, 1);
      ['mute', 'solo', 'arm'].forEach((k) => { if (k in patch) t[k] = !!patch[k]; });
      if ('instrument' in patch && t.type === 'midi' && patch.instrument) {
        const type = patch.instrument.type || t.instrument.type;
        const keep = type === t.instrument.type ? t.instrument.params : {};
        t.instrument = { type, params: Object.assign({}, keep, patch.instrument.params) };
      }
      const smooth = keys.length && keys.every((k) => k === 'gain' || k === 'pan');
      const ipar = keys.length === 1 && keys[0] === 'instrument';
      this._commit('Track ' + keys.join(', '), smooth ? 'trk:' + trackId + ':' + keys.sort().join() : ipar ? 'ins:' + trackId : null);
      return t;
    }
    updateMaster(patch) { return this.updateTrack('master', patch || {}); }
    moveTrack(trackId, newIndex) {
      const ts = this.project.tracks, i = ts.findIndex((t) => t.id === trackId);
      if (i < 0) return false;
      const [t] = ts.splice(i, 1);
      ts.splice(clamp(newIndex | 0, 0, ts.length), 0, t);
      this._commit('Move track');
      return true;
    }

    /* clips */
    _fitSource(c) {
      if (c.kind !== 'audio') return;
      const s = this.sources.get(c.srcId);
      if (!s || !s.buffer) return;
      const D = s.buffer.duration;
      if (c.offset > D - 0.001) c.offset = Math.max(0, D - 0.001);
      const maxLen = (D - c.offset) / c.rate;
      if (c.length > maxLen + 1e-9) c.length = Math.max(0.001, maxLen);
      c.fadeIn = clamp(c.fadeIn, 0, c.length);
      c.fadeOut = clamp(c.fadeOut, 0, c.length);
    }
    addClip(trackId, clip) {
      const t = this.findTrack(trackId);
      if (!t) return null;
      const c = normClip(Object.assign({}, clip, { kind: t.type }), t.type);
      if (!clip.id || this.findClip(clip.id)) c.id = AM.uid('c');
      if (c.kind === 'audio' && !c.srcId) return null;
      this._fitSource(c);
      t.clips.push(c);
      this._commit('Add clip');
      return c;
    }
    updateClip(clipId, patch) {
      const f = this.findClip(clipId);
      if (!f) return null;
      const c = f.clip;
      patch = Object.assign({}, patch || {});
      delete patch.id; delete patch.kind;
      Object.assign(c, patch);
      Object.assign(c, normClip(c, c.kind));
      c.id = clipId;
      this._fitSource(c);
      const keys = Object.keys(patch).sort();
      this._commit('Edit clip', keys.indexOf('notes') >= 0 ? null : 'clip:' + clipId + ':' + keys.join());
      return c;
    }
    removeClip(clipId) {
      const f = this.findClip(clipId);
      if (!f) return false;
      f.track.clips.splice(f.track.clips.indexOf(f.clip), 1);
      this._commit('Delete clip');
      return true;
    }
    splitClip(clipId, time) {
      const f = this.findClip(clipId);
      if (!f) return null;
      const c = f.clip, at = +time - c.start;
      if (!(at > 0.001 && at < c.length - 0.001)) return null;
      const right = clone(c);
      right.id = AM.uid('c');
      right.start = c.start + at;
      right.length = c.length - at;
      if (c.kind === 'audio') {
        if (c.reverse) { c.offset = c.offset + right.length * c.rate; }
        else { right.offset = c.offset + at * c.rate; }
        right.fadeIn = 0; right.fadeOut = Math.min(c.fadeOut, right.length);
        c.fadeOut = 0; c.fadeIn = Math.min(c.fadeIn, at);
      } else {
        right.notes = c.notes.filter((n) => n.t >= at).map((n) => Object.assign({}, n, { t: n.t - at }));
        c.notes = c.notes.filter((n) => n.t < at).map((n) => Object.assign({}, n, { d: Math.min(n.d, at - n.t) }));
      }
      c.length = at;
      f.track.clips.splice(f.track.clips.indexOf(c) + 1, 0, right);
      this._commit('Split');
      return [c, right];
    }
    duplicateClip(clipId) {
      const f = this.findClip(clipId);
      if (!f) return null;
      const d = clone(f.clip);
      d.id = AM.uid('c');
      d.start = f.clip.start + f.clip.length;
      f.track.clips.push(d);
      this._commit('Duplicate');
      return d;
    }
    moveClip(clipId, trackId, start) {
      const f = this.findClip(clipId);
      if (!f) return null;
      const c = f.clip;
      let to = f.track;
      if (trackId && trackId !== f.track.id) {
        to = this.findTrack(trackId);
        if (!to) return null;
        if (to.type !== c.kind) { this.emit('error', c.kind === 'midi' ? 'MIDI clips can only go on MIDI tracks.' : 'Audio clips can only go on audio tracks.'); return null; }
        f.track.clips.splice(f.track.clips.indexOf(c), 1);
        to.clips.push(c);
      }
      if (start != null) c.start = Math.max(0, +start || 0);
      this._commit('Move clip', 'move:' + clipId);
      return c;
    }

    /* FX chains */
    _chain(target) {
      if (target === 'master') return this.project.master.fx;
      const t = this.findTrack(target);
      return t ? t.fx : null;
    }
    addFx(target, type, params) {
      const chain = this._chain(target);
      if (!chain) return null;
      if (!AM.FX[type]) { this.emit('error', 'Unknown effect: ' + type); return null; }
      const fx = { id: AM.uid('f'), type, on: true, params: withDefaults(type, params) };
      chain.push(fx);
      this._commit('Add ' + AM.FX[type].name);
      return fx;
    }
    updateFx(target, fxId, patch) {
      const chain = this._chain(target);
      const fx = chain && chain.find((f) => f.id === fxId);
      if (!fx) return null;
      patch = patch || {};
      if ('on' in patch) fx.on = !!patch.on;
      if (patch.params) {
        Object.keys(patch.params).forEach((k) => { const v = patch.params[k]; fx.params[k] = typeof v === 'number' && !isFinite(v) ? fx.params[k] : v; });
      }
      const keys = patch.params ? Object.keys(patch.params).sort().join() : '';
      this._commit('Edit ' + (AM.FX[fx.type] ? AM.FX[fx.type].name : 'effect'), 'on' in patch ? null : 'fx:' + fxId + ':' + keys);
      return fx;
    }
    removeFx(target, fxId) {
      const chain = this._chain(target);
      const i = chain ? chain.findIndex((f) => f.id === fxId) : -1;
      if (i < 0) return false;
      chain.splice(i, 1);
      this._commit('Remove effect');
      return true;
    }
    moveFx(target, fxId, newIndex) {
      const chain = this._chain(target);
      const i = chain ? chain.findIndex((f) => f.id === fxId) : -1;
      if (i < 0) return false;
      const [fx] = chain.splice(i, 1);
      chain.splice(clamp(newIndex | 0, 0, chain.length), 0, fx);
      this._commit('Move effect');
      return true;
    }
    fxMeter(target, fxId) {
      const g = this._g;
      if (!g) return 0;
      const n = target === 'master' ? g.master : g.tracks.get(target);
      const x = n && n.fx.find((e) => e.id === fxId);
      return x && x.inst && x.inst.meter ? x.inst.meter() : 0;
    }

    /* project settings */
    updateProject(patch) {
      const p = this.project;
      patch = patch || {};
      if ('name' in patch) p.name = String(patch.name || 'Untitled');
      if (Array.isArray(patch.sig) && patch.sig.length === 2) p.sig = [clamp(patch.sig[0] | 0 || 4, 1, 32), clamp(patch.sig[1] | 0 || 4, 1, 32)];
      if ('sampleRate' in patch) p.sampleRate = num(patch.sampleRate, p.sampleRate, 8000, 192000);
      if ('snap' in patch) { p.snap = !!patch.snap; if (Object.keys(patch).length === 1) { this._touch('snap'); return p; } }
      this._commit('Project settings', 'proj');
      return p;
    }
    setLoop(patch) {
      const l = this.project.loop;
      patch = patch || {};
      if ('on' in patch) l.on = !!patch.on;
      if ('start' in patch) l.start = Math.max(0, +patch.start || 0);
      if ('end' in patch) l.end = Math.max(0, +patch.end || 0);
      if (l.end < l.start) { const t = l.start; l.start = l.end; l.end = t; }
      if (l.end - l.start < 0.05) l.end = l.start + 0.05;
      this._touch('loop');
      return l;
    }
    secToBeat(t) { return (t * this.project.bpm) / 60; }
    beatToSec(b) { return (b * 60) / this.project.bpm; }
    async setTempo(bpm, opts) {
      opts = opts || {};
      bpm = num(bpm, this.project.bpm, 20, 400);
      const old = this.project.bpm;
      if (Math.abs(bpm - old) < 1e-9) return;
      const ratio = old / bpm;
      const stretched = new Map();
      if (opts.stretchAudio) {
        for (const t of this.project.tracks) {
          for (const c of t.clips) {
            if (c.kind !== 'audio') continue;
            const r = await this._stretchRegion(c, ratio);
            if (r) stretched.set(c.id, r);
          }
        }
      }
      this.batch('Tempo', () => {
        const p = this.project;
        p.bpm = bpm;
        p.tracks.forEach((t) => t.clips.forEach((c) => {
          if (c.kind === 'midi') {
            c.start *= ratio; c.length *= ratio;
            c.notes.forEach((n) => { n.t *= ratio; n.d *= ratio; });
          } else if (stretched.has(c.id)) {
            const r = stretched.get(c.id);
            if (r.key !== c.srcId + '|' + c.offset + '|' + c.length + '|' + c.rate) return;
            c.start *= ratio; c.srcId = r.srcId; c.offset = 0; c.length *= ratio; c.fadeIn *= ratio; c.fadeOut *= ratio;
          }
        }));
        p.loop.start *= ratio; p.loop.end *= ratio;
        this._batchDirty = true;
      });
    }
    async _stretchRegion(c, factor, onProgress) {
      const s = this.sources.get(c.srcId);
      if (!s || !s.buffer) return null;
      const b = s.buffer, sr = b.sampleRate;
      const a = clamp(Math.round(c.offset * sr), 0, b.length - 1);
      const e = clamp(Math.round((c.offset + c.length * c.rate) * sr), a + 1, b.length);
      const chs = [];
      for (let ch = 0; ch < b.numberOfChannels; ch++) chs.push(b.getChannelData(ch).subarray(a, e));
      const out = await wsolaAsync(chs, factor, sr, onProgress);
      const nb = makeBuffer(this.ctx, out.length, out[0].length, sr);
      out.forEach((d, ch) => writeChannel(nb, d, ch));
      return { srcId: this.addSource(nb, s.name + ' stretched'), key: c.srcId + '|' + c.offset + '|' + c.length + '|' + c.rate };
    }
    async timeStretch(clipId, factor, onProgress) {
      factor = num(factor, 1, 0.5, 2);
      const f = this.findClip(clipId);
      if (!f) throw new Error('Clip not found');
      if (f.clip.kind === 'midi') {
        this.batch('Time stretch', () => {
          const c = f.clip;
          c.length *= factor;
          c.notes.forEach((n) => { n.t *= factor; n.d *= factor; });
          this._batchDirty = true;
        });
        return f.clip;
      }
      const r = await this._stretchRegion(f.clip, factor, onProgress);
      if (!r) throw new Error('The audio for this clip is missing');
      const cur = this.findClip(clipId);
      if (!cur) return null;
      const c = cur.clip;
      if (r.key !== c.srcId + '|' + c.offset + '|' + c.length + '|' + c.rate) {
        this.emit('error', 'The clip changed while it was being stretched, so the stretch was not applied.');
        return c;
      }
      this.batch('Time stretch', () => {
        c.srcId = r.srcId; c.offset = 0; c.length *= factor; c.fadeIn *= factor; c.fadeOut *= factor;
        this._fitSource(c);
        this._batchDirty = true;
      });
      return c;
    }

    /* graph builder, shared by live playback and offline render */
    _buildGraph(ctx, dest, opts) {
      opts = opts || {};
      const g = { ctx, offline: !!opts.offline, meters: !opts.offline, only: opts.tracks ? new Set(opts.tracks) : null, tracks: new Map() };
      const m = g.master = { input: stereoIn(ctx), post: ctx.createGain(), fx: [], fxKey: null, meter: null, ready: false };
      m.post.connect(dest);
      if (g.meters) m.meter = this._makeMeter(ctx, m.post);
      this._syncGraph(g);
      return g;
    }
    _makeMeter(ctx, node) {
      const split = ctx.createChannelSplitter(2), aL = ctx.createAnalyser(), aR = ctx.createAnalyser();
      aL.fftSize = 1024; aR.fftSize = 1024;
      node.connect(split); split.connect(aL, 0); split.connect(aR, 1);
      return { split, aL, aR, buf: new Float32Array(1024) };
    }
    _makeTrackNode(g) {
      const ctx = g.ctx;
      const n = { input: stereoIn(ctx), post: ctx.createGain(), mute: ctx.createGain(), pan: null, fx: [], fxKey: null, meter: null, ready: false };
      n.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      n.post.connect(n.mute); n.mute.connect(n.pan); n.pan.connect(g.master.input);
      if (g.meters) n.meter = this._makeMeter(ctx, n.pan);
      return n;
    }
    _disposeNode(n) {
      n.fx.forEach((x) => { if (x.inst) { try { x.inst.dispose(); } catch (e) { /* ignore */ } } });
      off(n.input, n.post, n.mute, n.pan);
      if (n.meter) off(n.meter.split, n.meter.aL, n.meter.aR);
    }
    _disposeGraph(g) {
      g.tracks.forEach((n) => this._disposeNode(n));
      g.tracks.clear();
      this._disposeNode(g.master);
    }
    _syncGraph(g) {
      const ctx = g.ctx, p = this.project, anySolo = p.tracks.some((t) => t.solo);
      const seen = new Set();
      p.tracks.forEach((t) => {
        seen.add(t.id);
        let n = g.tracks.get(t.id);
        if (!n) { n = this._makeTrackNode(g); g.tracks.set(t.id, n); }
        const live = !g.offline && n.ready;
        const audible = !t.mute && (!anySolo || t.solo) && (!g.only || g.only.has(t.id));
        sp(ctx, n.post.gain, t.gain, live);
        sp(ctx, n.mute.gain, audible ? 1 : 0, live);
        if (n.pan.pan) sp(ctx, n.pan.pan, t.pan, live);
        this._syncChain(g, n, t.fx);
        n.ready = true;
      });
      g.tracks.forEach((n, id) => { if (!seen.has(id)) { this._disposeNode(n); g.tracks.delete(id); } });
      sp(ctx, g.master.post.gain, p.master.gain, !g.offline && g.master.ready);
      this._syncChain(g, g.master, p.master.fx);
      g.master.ready = true;
    }
    _syncChain(g, n, list) {
      const ctx = g.ctx, key = list.map((f) => f.id + ':' + f.type).join(',');
      let rewire = false;
      if (key !== n.fxKey) {
        const old = new Map(n.fx.map((x) => [x.id, x]));
        n.fx = list.map((f) => {
          const x = old.get(f.id);
          if (x && x.type === f.type) { old.delete(f.id); return x; }
          let inst = null;
          const def = AM.FX[f.type];
          if (def) { try { inst = def.create(ctx, withDefaults(f.type, f.params)); } catch (e) { this.emit('error', 'Could not start the ' + def.name + ' effect.'); } }
          return { id: f.id, type: f.type, inst, on: null, pkey: JSON.stringify(f.params) };
        });
        old.forEach((x) => { if (x.inst) { try { x.inst.dispose(); } catch (e) { /* ignore */ } } });
        n.fxKey = key;
        rewire = true;
      }
      list.forEach((f, i) => {
        const x = n.fx[i];
        const pk = JSON.stringify(f.params);
        if (pk !== x.pkey && x.inst) { x.pkey = pk; x.inst.set(withDefaults(f.type, f.params)); }
        const on = f.on !== false && !!x.inst;
        if (on !== x.on) { x.on = on; rewire = true; }
      });
      if (rewire) {
        off(n.input);
        n.fx.forEach((x) => { if (x.inst) off(x.inst.output); });
        let cur = n.input;
        n.fx.forEach((x) => { if (x.on) { cur.connect(x.inst.input); cur = x.inst.output; } });
        cur.connect(n.post);
      }
    }
    // clip gain with fades as an automation curve, positions are seconds inside the clip
    _envelope(param, c, e0, e1, at, declickIn, declickOut) {
      const L = c.length, g = c.gain == null ? 1 : c.gain;
      const fi = clamp(c.fadeIn || 0, 0, L), fo = clamp(c.fadeOut || 0, 0, L);
      const val = (p) => {
        let v = g;
        if (fi > 0 && p < fi) v *= p / fi;
        if (fo > 0 && p > L - fo) v *= (L - p) / fo;
        return Math.max(0, v);
      };
      const ps = [e0, e1];
      [fi, L - fo].forEach((p) => { if (p > e0 && p < e1) ps.push(p); });
      if (fi > 0 && fo > 0 && fi > L - fo) {
        for (let k = 1; k < 8; k++) { const p = (L - fo) + ((fi - (L - fo)) * k) / 8; if (p > e0 && p < e1) ps.push(p); }
      }
      const dc = 0.004;
      if (declickIn && e1 - e0 > dc * 3) ps.push(e0 + dc);
      if (declickOut && e1 - e0 > dc * 3) ps.push(e1 - dc);
      ps.sort((a, b) => a - b);
      const pts = ps.filter((p, i) => i === 0 || p - ps[i - 1] > 1e-6).map((p) => ({ p, v: val(p) }));
      if (declickIn && e1 - e0 > dc * 3) pts[0].v = 0;
      if (declickOut && e1 - e0 > dc * 3) pts[pts.length - 1].v = 0;
      param.value = pts[0].v;
      param.setValueAtTime(pts[0].v, at);
      for (let i = 1; i < pts.length; i++) param.linearRampToValueAtTime(pts[i].v, at + (pts[i].p - e0));
    }
    // schedules every clip in timeline [a, b) to start at context time `when`; returns stop handles
    _scheduleSegment(g, a, b, when) {
      const ctx = g.ctx, p = this.project, handles = [];
      const anySolo = p.tracks.some((t) => t.solo);
      p.tracks.forEach((t) => {
        const n = g.tracks.get(t.id);
        if (!n) return;
        if (g.offline && (t.mute || (anySolo && !t.solo) || (g.only && !g.only.has(t.id)))) return;
        t.clips.forEach((c) => {
          const cs = c.start, ce = c.start + c.length;
          if (c.length <= 0 || ce <= a || cs >= b) return;
          const from = Math.max(a, cs), to = Math.min(b, ce), at = when + (from - a);
          if (c.kind === 'midi') {
            if (t.type !== 'midi' || !AM.Midi || typeof AM.Midi.schedule !== 'function') return;
            try {
              const h = AM.Midi.schedule(ctx, t, c, at, from - cs, n.input);
              if (h) {
                if (to < ce) { try { h.stop(when + (to - a)); } catch (e) { /* ignore */ } }
                handles.push(h);
              }
            } catch (e) { if (typeof console !== 'undefined') console.error(e); }
            return;
          }
          const s = this.sources.get(c.srcId);
          if (!s || !s.buffer) return;
          const rate = c.rate > 0 ? c.rate : 1, D = s.buffer.duration;
          const buf = c.reverse ? this._reversed(s) : s.buffer;
          const e0 = from - cs, e1 = to - cs;
          let off0 = c.reverse ? D - (c.offset + (c.length - e0) * rate) : c.offset + e0 * rate;
          let startAt = at;
          if (off0 < 0) { startAt += -off0 / rate; off0 = 0; }
          const dur = (e1 - e0) * rate - (startAt - at) * rate;
          if (dur <= 0.0005 || off0 >= buf.duration) return;
          const src = ctx.createBufferSource(), gn = ctx.createGain();
          src.buffer = buf;
          src.playbackRate.value = rate;
          src.connect(gn); gn.connect(n.input);
          this._envelope(gn.gain, c, e0, e1, at, from > cs + 0.0005, to < ce - 0.0005);
          src.start(Math.max(startAt, 0), off0, dur);
          src.onended = () => off(gn);
          handles.push({
            stop(tm) {
              tm = Math.max(tm == null ? ctx.currentTime : tm, ctx.currentTime);
              try {
                if (gn.gain.cancelAndHoldAtTime) gn.gain.cancelAndHoldAtTime(tm); else gn.gain.cancelScheduledValues(tm);
                gn.gain.setTargetAtTime(0, tm, 0.004);
              } catch (e) { /* ignore */ }
              try { src.stop(tm + 0.03); } catch (e) { /* already stopped */ }
            }
          });
        });
      });
      return handles;
    }
    _structSig() {
      const p = this.project;
      return JSON.stringify([p.tracks.map((t) => [t.id, t.type, t.instrument ? t.instrument.type : '', t.clips]), p.loop]);
    }
    _onChanged() {
      if (this._g) this._syncGraph(this._g);
      if (this._pl && this._structSig() !== this._pl.sig) this._restart();
    }

    /* transport */
    get playing() { return !!this._pl; }
    get recording() { return !!this._rec; }
    get time() { return this._pl ? this._timeAt(this.ctx.currentTime) : this._pos; }
    _timeAt(ct) {
      const pl = this._pl;
      let it = pl.its[0];
      for (let i = 1; i < pl.its.length; i++) if (pl.its[i].when <= ct) it = pl.its[i];
      return Math.min(it.b, it.a + Math.max(0, ct - it.when));
    }
    _startAt(pos, when, opts) {
      opts = opts || {};
      const g = this._live();
      if (!g) return false;
      const lp = this.project.loop;
      const loopOn = !opts.noLoop && !this._rec && lp.on && lp.end - lp.start >= 0.05 && pos < lp.end;
      const it = { a: pos, b: loopOn ? lp.end : Infinity, when };
      it.handles = this._scheduleSegment(g, it.a, it.b, when);
      this._pl = {
        its: [it], loop: loopOn ? { start: lp.start, end: lp.end } : null,
        startPos: opts.startPos == null ? pos : opts.startPos,
        clickCursor: Math.max(when, opts.clickCursor || 0), sig: this._structSig()
      };
      if (!this._timer) this._timer = setInterval(() => this._tick(), 25);
      this._tick();
      return true;
    }
    _stopSources(at) {
      const pl = this._pl;
      if (!pl) return;
      pl.its.forEach((it) => it.handles.forEach((h) => { try { h.stop(at); } catch (e) { /* ignore */ } }));
      this._pl = null;
      if (this._timer) { clearInterval(this._timer); this._timer = 0; }
    }
    _restart() {
      const pl = this._pl, ctx = this.ctx;
      if (!pl || !ctx) return;
      const when = ctx.currentTime + 0.06, pos = this._timeAt(when);
      this._stopSources(when);
      this._startAt(pos, when, { startPos: pl.startPos, clickCursor: pl.clickCursor, noLoop: !!this._rec });
    }
    _tick() {
      const pl = this._pl, ctx = this.ctx;
      if (!pl || !ctx) return;
      const ct = ctx.currentTime;
      if (pl.loop) {
        let last = pl.its[pl.its.length - 1];
        while (last.when + (last.b - last.a) < ct + 1.5) {
          const w = last.when + (last.b - last.a);
          const it = { a: pl.loop.start, b: pl.loop.end, when: w };
          it.handles = this._scheduleSegment(this._g, it.a, it.b, w);
          pl.its.push(it);
          last = it;
        }
        while (pl.its.length > 1 && pl.its[0].when + (pl.its[0].b - pl.its[0].a) < ct - 0.5 && pl.its[1].when <= ct) pl.its.shift();
      }
      if (this.metronome) this._scheduleClicks(ct + 0.3);
      else pl.clickCursor = Math.max(pl.clickCursor, ct);
      const t = this._timeAt(ct), now = nowMs();
      if (now - this._lastTimeEmit > 32) { this._lastTimeEmit = now; this.emit('time', t); }
      if (!pl.loop && !this._rec && t > this.duration() + 1.5) this.pause();
    }
    _scheduleClicks(until) {
      const pl = this._pl, ctx = this.ctx;
      const spb = 60 / this.project.bpm, bpb = this.project.sig[0] || 4;
      const from = Math.max(pl.clickCursor, ctx.currentTime);
      if (until <= from) return;
      pl.its.forEach((it) => {
        const s = Math.max(from, it.when), e = Math.min(until, it.when + (it.b - it.a));
        if (e <= s) return;
        const ta = it.a + (s - it.when), tb = it.a + (e - it.when);
        for (let k = Math.ceil(ta / spb - 1e-9); k * spb < tb; k++) this._click(it.when + (k * spb - it.a), k % bpb === 0);
      });
      pl.clickCursor = until;
    }
    _click(t, accent) {
      const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = accent ? 1600 : 1000;
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(accent ? 0.9 : 0.55, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g); g.connect(this._clickOut);
      o.start(t); o.stop(t + 0.07);
      o.onended = () => off(o, g);
    }
    play(from) {
      if (this._rec) return;
      const ctx = this.ensure();
      if (!ctx) return;
      const pos = from != null && isFinite(+from) ? Math.max(0, +from) : this.time;
      if (this._pl) this._stopSources(ctx.currentTime);
      if (this._startAt(pos, ctx.currentTime + 0.05, {})) { this.emit('play'); this.emit('time', pos); }
    }
    pause() {
      if (this._rec) { this.stop(); return; }
      if (!this._pl) return;
      this._pos = this.time;
      this._stopSources();
      this.emit('stop');
      this.emit('time', this._pos);
    }
    // stop: halts playback and recording, the playhead goes back to where playback started (or to 0 when already stopped)
    stop() {
      const wasRec = !!this._rec;
      if (this._pl) {
        this._pos = this._pl.startPos;
        this._stopSources();
        this.emit('stop');
      } else if (!wasRec) this._pos = 0;
      if (wasRec) this._finishRecording().catch((e) => this.emit('error', 'The recording could not be saved: ' + (e && e.message ? e.message : e)));
      this.emit('time', this._pos);
    }
    seek(t) {
      t = Math.max(0, +t || 0);
      if (this._rec) return;
      if (this._pl) {
        const startPos = this._pl.startPos, ctx = this.ctx;
        this._stopSources(ctx.currentTime);
        this._startAt(t, ctx.currentTime + 0.05, { startPos });
      } else this._pos = t;
      this.emit('time', t);
    }

    /* levels */
    level(target) {
      const g = this._g, none = { l: -Infinity, r: -Infinity };
      if (!g) return none;
      const n = target === 'master' ? g.master : g.tracks.get(target);
      if (!n || !n.meter) return none;
      const m = n.meter, peak = (a) => {
        let mx = 0;
        if (a.getFloatTimeDomainData) {
          a.getFloatTimeDomainData(m.buf);
          for (let i = 0; i < m.buf.length; i++) { const v = Math.abs(m.buf[i]); if (v > mx) mx = v; }
        } else {
          const b = new Uint8Array(a.fftSize);
          a.getByteTimeDomainData(b);
          for (let i = 0; i < b.length; i++) { const v = Math.abs(b[i] - 128) / 128; if (v > mx) mx = v; }
        }
        return linToDb(mx);
      };
      return { l: peak(m.aL), r: peak(m.aR) };
    }

    /* recording */
    async inputs() {
      const md = navigator.mediaDevices;
      if (!md || !md.enumerateDevices) return [];
      const list = async () => (await md.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      let devs = await list();
      if (devs.length && devs.every((d) => !d.label) && md.getUserMedia) {
        try { const s = await md.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); devs = await list(); } catch (e) { /* permission refused, keep unnamed list */ }
      }
      return devs.map((d, i) => ({ deviceId: d.deviceId, label: d.label || 'Input ' + (i + 1) }));
    }
    async record(opts) {
      opts = opts || {};
      if (this._rec) return { trackId: this._rec.trackId };
      const ctx = this.ensure();
      if (!ctx) throw new Error('No Web Audio');
      const md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) {
        const m = 'Recording needs microphone access, which this browser does not offer on this page.';
        this.emit('error', m); throw new Error(m);
      }
      let stream;
      try {
        const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
        if (opts.deviceId) audio.deviceId = { exact: opts.deviceId };
        stream = await md.getUserMedia({ audio });
      } catch (e) {
        const m = 'Microphone access was blocked or no input was found. Allow the microphone for this page and try again.';
        this.emit('error', m); throw new Error(m);
      }
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* ignore */ } }
      let track = opts.trackId ? this.findTrack(opts.trackId) : null;
      if (!track || track.type !== 'audio') track = this.project.tracks.find((t) => t.arm && t.type === 'audio') || null;
      if (!track) track = this.addTrack({ type: 'audio', name: 'Recording ' + (this.project.tracks.filter((t) => t.type === 'audio').length + 1) });
      const pos = this.time;
      if (this._pl) this._stopSources(ctx.currentTime);
      const mt = stream.getAudioTracks()[0];
      const settings = (mt && mt.getSettings && mt.getSettings()) || {};
      const srcNode = ctx.createMediaStreamSource(stream);
      const nch = clamp(settings.channelCount || 1, 1, 2);
      const rec = {
        stream, srcNode, nch, trackId: track.id, pos, when: 0, sampleRate: ctx.sampleRate,
        chunks: [[], []], frames: 0, t0: null, node: null, sink: null, worklet: false, flushed: null,
        latency: (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + (settings.latency || 0) + (this.latencyOffsetMs || 0) / 1000
      };
      try { await this._startCapture(ctx, rec); } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        const m = 'Recording could not start in this browser.';
        this.emit('error', m); throw new Error(m);
      }
      this._rec = rec;
      const g = this._live();
      if (this.monitor && g.tracks.get(track.id)) srcNode.connect(g.tracks.get(track.id).input);
      rec.when = ctx.currentTime + 0.1;
      this._startAt(pos, rec.when, { noLoop: true });
      this.emit('play');
      this.emit('record', { on: true, trackId: track.id });
      return { trackId: track.id };
    }
    async _startCapture(ctx, rec) {
      rec.sink = ctx.createGain();
      rec.sink.gain.value = 0;
      rec.sink.connect(ctx.destination);
      if (ctx.audioWorklet && typeof AudioWorkletNode === 'function') {
        try {
          if (!this._recModule) {
            const url = URL.createObjectURL(new Blob([REC_WORKLET], { type: 'application/javascript' }));
            this._recModule = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
          }
          await this._recModule;
          const node = new AudioWorkletNode(ctx, 'am-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: rec.nch, channelCountMode: 'explicit' });
          node.port.onmessage = (e) => this._recData(rec, e.data);
          rec.srcNode.connect(node); node.connect(rec.sink);
          rec.node = node; rec.worklet = true;
          return;
        } catch (e) { this._recModule = null; }
      }
      const size = 4096, sp2 = ctx.createScriptProcessor(size, rec.nch, rec.nch);
      sp2.onaudioprocess = (e) => {
        const ib = e.inputBuffer, ch = [];
        for (let c = 0; c < ib.numberOfChannels; c++) ch.push(new Float32Array(ib.getChannelData(c)));
        this._recData(rec, { t: (e.playbackTime || ctx.currentTime) - size / ctx.sampleRate, ch });
      };
      rec.srcNode.connect(sp2); sp2.connect(rec.sink);
      rec.node = sp2;
    }
    _recData(rec, d) {
      if (d.done) { if (rec.flushed) rec.flushed(); return; }
      if (!d.ch || !d.ch.length) return;
      if (rec.t0 == null) rec.t0 = d.t;
      for (let c = 0; c < rec.nch; c++) rec.chunks[c].push(d.ch[Math.min(c, d.ch.length - 1)]);
      rec.frames += d.ch[0].length;
    }
    async _finishRecording() {
      const rec = this._rec;
      if (!rec) return null;
      this._rec = null;
      if (rec.worklet) {
        await new Promise((res) => { rec.flushed = res; try { rec.node.port.postMessage('flush'); } catch (e) { res(); } setTimeout(res, 500); });
      }
      off(rec.srcNode, rec.node, rec.sink);
      rec.stream.getTracks().forEach((t) => t.stop());
      const done = (clip) => { this.emit('record', { on: false, clip: clip || null }); return clip || null; };
      if (!rec.frames || rec.t0 == null) { this.emit('error', 'Nothing was recorded. Check the input and its level.'); return done(null); }
      const sr = rec.sampleRate, buf = makeBuffer(this.ctx, rec.nch, rec.frames, sr);
      for (let c = 0; c < rec.nch; c++) {
        const d = new Float32Array(rec.frames);
        let o = 0;
        rec.chunks[c].forEach((ch) => { d.set(ch.subarray(0, Math.min(ch.length, rec.frames - o)), o); o += ch.length; });
        writeChannel(buf, d, c);
      }
      const total = rec.frames / sr;
      const raw = rec.pos + (rec.t0 - rec.when) - rec.latency;
      let start = raw, offset = 0;
      if (start < rec.pos) { offset = rec.pos - start; start = rec.pos; }
      if (offset >= total - 0.01) { this.emit('error', 'The recording was too short to keep.'); return done(null); }
      let track = this.findTrack(rec.trackId);
      const srcId = this.addSource(buf, (track ? track.name : 'Recording') + ' take');
      let clip = null;
      this.batch('Record', () => {
        if (!track) track = this.addTrack({ type: 'audio', name: 'Recording' });
        clip = this.addClip(track.id, { kind: 'audio', srcId, name: track.name + ' take ' + (track.clips.length + 1), start, offset, length: total - offset });
      });
      return done(clip);
    }

    /* offline render and export */
    async render(opts) {
      opts = opts || {};
      const p = this.project;
      const start = Math.max(0, +opts.start || 0);
      const end = opts.end != null ? +opts.end : this.duration();
      const sr = Math.round(opts.sampleRate || p.sampleRate || 48000);
      if (!(end > start)) throw new Error('There is nothing to render. Add some audio or MIDI first.');
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC) throw new Error('This browser cannot render audio offline.');
      const len = Math.max(1, Math.ceil((end - start) * sr));
      let ctx;
      try { ctx = new OAC({ numberOfChannels: 2, length: len, sampleRate: sr }); } catch (e) { ctx = new OAC(2, len, sr); }
      const g = this._buildGraph(ctx, ctx.destination, { offline: true, tracks: opts.tracks || null });
      this._scheduleSegment(g, start, end, 0);
      const buf = await new Promise((res, rej) => {
        ctx.oncomplete = (e) => res(e.renderedBuffer);
        const r = ctx.startRendering();
        if (r && r.then) r.then(res, rej);
      });
      this._disposeGraph(g);
      return buf;
    }
    encodeWav(audioBuffer, bits) { return encodeWav(audioBuffer, bits || 16); }
    toWav(audioBuffer, bits) { return new Blob([encodeWav(audioBuffer, bits || 16)], { type: 'audio/wav' }); }
    async toMp3(audioBuffer, kbps) {
      kbps = kbps || 192;
      const mb = await import(MB_URL);
      const enc = await import(MP3_URL);
      enc.registerMp3Encoder();
      const nCh = Math.min(2, audioBuffer.numberOfChannels);
      const out = new mb.Output({ format: new mb.Mp3OutputFormat(), target: new mb.BufferTarget() });
      const source = new mb.AudioBufferSource({ codec: 'mp3', bitrate: kbps * 1000 });
      out.addAudioTrack(source);
      await out.start();
      const sr = audioBuffer.sampleRate, step = sr * 4;
      for (let a = 0; a < audioBuffer.length; a += step) {
        const n = Math.min(step, audioBuffer.length - a), ab = makeBuffer(this.ctx, nCh, n, sr);
        for (let k = 0; k < nCh; k++) writeChannel(ab, audioBuffer.getChannelData(k).subarray(a, a + n), k);
        await source.add(ab);
      }
      source.close();
      await out.finalize();
      return new Blob([new Uint8Array(out.target.buffer)], { type: 'audio/mpeg' });
    }
    download(blob, filename) {
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename || 'audio';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    /* saving in this browser (IndexedDB) */
    _db() {
      if (this._dbp) return this._dbp;
      this._dbp = new Promise((res, rej) => {
        if (typeof indexedDB === 'undefined' || !indexedDB) { rej(new Error('This browser has no local storage for projects.')); return; }
        const r = indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          if (!db.objectStoreNames.contains('sources')) db.createObjectStore('sources');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      this._dbp.catch(() => { this._dbp = null; });
      return this._dbp;
    }
    _usedSources(project) {
      const used = new Set();
      project.tracks.forEach((t) => t.clips.forEach((c) => { if (c.kind === 'audio' && c.srcId) used.add(c.srcId); }));
      return used;
    }
    saveLocal() {
      const run = () => this._doSave();
      this._saveChain = this._saveChain.then(run, run);
      return this._saveChain;
    }
    async _doSave() {
      const db = await this._db();
      const used = this._usedSources(this.project);
      const have = new Set(await req(db.transaction('sources', 'readonly').objectStore('sources').getAllKeys()));
      const tx = db.transaction(['kv', 'sources'], 'readwrite');
      const kv = tx.objectStore('kv'), st = tx.objectStore('sources');
      used.forEach((id) => {
        if (have.has(id)) return;
        const s = this.sources.get(id);
        if (!s || !s.buffer) return;
        const b = s.buffer, channels = [];
        for (let c = 0; c < b.numberOfChannels; c++) channels.push(b.getChannelData(c));
        st.put({ id, name: s.name, sampleRate: b.sampleRate, length: b.length, channels }, id);
      });
      have.forEach((id) => { if (!used.has(id)) st.delete(id); });
      kv.put({ project: JSON.stringify(this.project), savedAt: Date.now() }, 'project');
      await txDone(tx);
      this.lastSaved = Date.now();
      this.emit('saved', { at: this.lastSaved });
    }
    _scheduleAutosave() {
      if (!this.autosave || this._loading) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        this.saveLocal().then(() => { this._saveErrShown = false; }, (e) => {
          if (this._saveErrShown) return;
          this._saveErrShown = true;
          this.emit('error', 'The project could not be saved in this browser. ' + (e && e.message ? e.message : ''));
        });
      }, 1200);
    }
    async loadLocal() {
      this._loading = true;
      try {
        const db = await this._db();
        const rec = await req(db.transaction('kv', 'readonly').objectStore('kv').get('project'));
        if (!rec || !rec.project) return false;
        const project = normProject(JSON.parse(rec.project));
        const ids = Array.from(this._usedSources(project));
        const st = db.transaction('sources', 'readonly').objectStore('sources');
        const rows = await Promise.all(ids.map((id) => req(st.get(id))));
        if (this._rec) await this._finishRecording();
        if (this._pl) { this._stopSources(); this.emit('stop'); }
        this.sources.clear(); this._peaks.clear(); this._rev.clear();
        rows.forEach((r) => {
          if (!r || !r.channels || !r.channels.length) return;
          const b = makeBuffer(this.ctx, r.channels.length, r.length, r.sampleRate);
          r.channels.forEach((d, c) => writeChannel(b, d, c));
          this.sources.set(r.id, { id: r.id, name: r.name, buffer: b });
        });
        this.project = project;
        this._snap = JSON.stringify(project);
        this._undo = []; this._redo = []; this._lastKey = null;
        this._pos = 0;
        this.lastSaved = rec.savedAt || 0;
        this._changed('load');
        this.emit('time', 0);
        return true;
      } catch (e) {
        return false;
      } finally {
        this._loading = false;
      }
    }
    newProject() {
      if (this._rec) this.stop();
      if (this._pl) { this._stopSources(); this.emit('stop'); }
      this.project = defaultProject();
      this.sources.clear(); this._peaks.clear(); this._rev.clear();
      this._undo = []; this._redo = []; this._lastKey = null;
      this._snap = JSON.stringify(this.project);
      this._pos = 0;
      this._changed('new');
      this.emit('time', 0);
    }
  }

  // pure helpers, shared so other parts and tests can use them
  Engine.wsola = wsola;
  Engine.wsolaAsync = wsolaAsync;
  Engine.encodeWav = encodeWav;
  Engine.normProject = normProject;
  Engine.dbToLin = dbToLin;
  Engine.linToDb = linToDb;

  AM.Engine = Engine;
  AM.engine = new Engine();
})();

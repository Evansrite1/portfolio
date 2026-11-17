'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const E2E = /[?&]e2e=1/.test(location.search);
  const isMac = /Mac/.test(navigator.platform), isWin = /Win/.test(navigator.platform);
  let kind = 'screen', sources = [], chosen = null;
  const dbg = [], pending = [];
  let recorder = null, streams = [], ctx = null, timer = null, startedAt = 0, pausedAt = 0, pausedTotal = 0, saved = null, busy = false;

  $('key').textContent = (isMac ? 'Cmd' : 'Ctrl') + '+Shift+R';
  if (!isWin) { $('sys').disabled = true; $('sys-note').textContent = 'Recording the computer sound is available on Windows only. The microphone works everywhere.'; }

  function notice(t) { const n = $('notice'); n.textContent = t; n.classList.toggle('hide', !t); }

  async function loadSources() {
    const p = await window.sr.perm();
    if (p.screen === 'denied') notice('Allow Screen Recording for this app in System Settings, Privacy and Security, then open the app again.');
    sources = await window.sr.sources();
    draw();
  }

  function draw() {
    const g = $('grid'); g.innerHTML = '';
    const list = sources.filter((s) => s.kind === kind);
    $('empty').hidden = list.length > 0;
    list.forEach((s) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'src' + (chosen && chosen.id === s.id ? ' on' : ''); b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', chosen && chosen.id === s.id ? 'true' : 'false');
      const im = document.createElement('img'); im.alt = ''; if (s.thumb) im.src = s.thumb;
      const sp = document.createElement('span'); sp.textContent = s.name;
      b.append(im, sp); b.onclick = () => { chosen = s; draw(); updateRec(); };
      g.appendChild(b);
    });
  }

  function updateRec() {
    const b = $('rec');
    if (recorder) { b.textContent = 'Stop recording'; b.disabled = false; return; }
    b.disabled = !chosen;
    b.textContent = chosen ? 'Record ' + (chosen.kind === 'screen' ? 'this screen' : 'this window') : 'Choose what to record';
  }

  document.querySelectorAll('.tabs button').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === t));
    kind = t.dataset.k; if (chosen && chosen.kind !== kind) chosen = null; draw(); updateRec();
  }));
  $('refresh').onclick = loadSources;
  $('folder').onclick = () => window.sr.folder();
  $('open-file').onclick = () => saved && window.sr.open(saved);
  $('show-file').onclick = () => saved && window.sr.show(saved);

  async function loadMics() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const s = $('mic-dev'); s.innerHTML = '';
      devs.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || ('Microphone ' + (i + 1)); s.appendChild(o); });
    } catch (e) { /* ignore */ }
  }
  $('mic').onchange = async () => {
    const on = $('mic').checked;
    ['mic-dev', 'mic-l'].forEach((i) => $(i).classList.toggle('hide', !on));
    if (on) { await window.sr.askMic(); await loadMics(); }
  };

  function pickMime(fmt) {
    const list = fmt === 'mp4'
      ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const m of list) if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext: fmt };
    const f = ['video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    return { mime: f, ext: 'webm' };
  }

  async function buildStream(o) {
    const q = Number(o.q), maxW = q === 720 ? 1280 : q === 1080 ? 1920 : 7680, maxH = q === 720 ? 720 : q === 1080 ? 1080 : 4320;
    const video = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: chosen.id, maxWidth: maxW, maxHeight: maxH, maxFrameRate: Number(o.fps), minFrameRate: Math.min(15, Number(o.fps)) } };
    let screenStream;
    if (o.sys && isWin) {
      try { screenStream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video }); }
      catch (e) { screenStream = await navigator.mediaDevices.getUserMedia({ audio: false, video }); notice('Computer sound could not be recorded here, so the video has no computer sound.'); }
    } else screenStream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    streams.push(screenStream);
    const tracks = [screenStream.getVideoTracks()[0]];
    const audios = screenStream.getAudioTracks();
    let micTrack = null;
    if (o.mic) {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: o.micDev ? { exact: o.micDev } : undefined, echoCancellation: true, noiseSuppression: true }, video: false });
        streams.push(ms); micTrack = ms.getAudioTracks()[0];
      } catch (e) { notice('The microphone could not be opened, so it is not recorded.'); }
    }
    if (audios.length && micTrack) {
      ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(new MediaStream([audios[0]])).connect(dest);
      ctx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
      tracks.push(dest.stream.getAudioTracks()[0]);
    } else if (audios.length) tracks.push(audios[0]);
    else if (micTrack) tracks.push(micTrack);
    return new MediaStream(tracks);
  }

  function fmtTime(ms) { const s = Math.floor(ms / 1000), p = (n) => String(n).padStart(2, '0'); return (s >= 3600 ? p(Math.floor(s / 3600)) + ':' : '') + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60); }
  function elapsed() { return Date.now() - startedAt - pausedTotal - (pausedAt ? Date.now() - pausedAt : 0); }

  async function start() {
    if (busy || recorder || !chosen) return;
    busy = true; notice(''); $('saved-card').hidden = true;
    const o = { q: $('q').value, fps: $('fps').value, fmt: $('fmt').value, sys: $('sys').checked, mic: $('mic').checked, micDev: $('mic-dev').value };
    try {
      if ($('cd').checked && !E2E) {
        for (let n = 3; n > 0; n--) { $('rec').textContent = 'Starting in ' + n + '...'; $('rec').disabled = true; await new Promise((r) => setTimeout(r, 1000)); }
      }
      const stream = await buildStream(o);
      const pm = pickMime(o.fmt);
      if (o.fmt === 'mp4' && pm.ext !== 'mp4') notice('MP4 is not available on this computer, so the video is saved as WebM.');
      await window.sr.start({ ext: pm.ext });
      recorder = new MediaRecorder(stream, { mimeType: pm.mime, videoBitsPerSecond: Number(o.q) === 720 ? 4e6 : 8e6, audioBitsPerSecond: 160000 });
      recorder.ondataavailable = (e) => { dbg.push(e.data ? e.data.size : -1); if (e.data && e.data.size) pending.push(e.data.arrayBuffer().then((b) => window.sr.chunk(b))); };
      recorder.onstop = finish;
      stream.getVideoTracks()[0].addEventListener('ended', () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); });
      recorder.start(1000);
      startedAt = Date.now(); pausedTotal = 0; pausedAt = 0;
      timer = setInterval(() => window.sr.tick({ text: fmtTime(elapsed()), paused: !!pausedAt }), 500);
      window.sr.tick({ text: '00:00', paused: false });
    } catch (e) {
      cleanup();
      notice('Could not start: ' + (e && e.message ? e.message : e) + (isMac ? ' Check that Screen Recording is allowed for this app in System Settings.' : ''));
    }
    busy = false; updateRec();
  }

  function cleanup() {
    clearInterval(timer); timer = null;
    streams.forEach((s) => s.getTracks().forEach((t) => t.stop())); streams = [];
    if (ctx) { ctx.close(); ctx = null; }
    recorder = null;
  }

  async function finish() {
    const secs = Math.round(elapsed() / 1000);
    cleanup();
    await Promise.all(pending.splice(0));   // every piece must be handed over before the file is closed
    const r = await window.sr.stop();
    saved = r.path;
    $('saved-path').textContent = r.path + '  (' + (r.bytes / 1048576).toFixed(1) + ' MB, ' + fmtTime(secs * 1000) + ')';
    $('saved-card').hidden = false;
    updateRec();
    if (E2E) { const size = await window.sr.e2eSize(r.path); window.sr.e2eResult({ ok: size > 1000, size, path: r.path, secs, chunks: dbg, type: recorder === null ? 'done' : '' }); }
  }

  function stop() { if (recorder && recorder.state !== 'inactive') recorder.stop(); }
  function pause() {
    if (!recorder) return;
    if (recorder.state === 'recording') { recorder.pause(); pausedAt = Date.now(); }
    else if (recorder.state === 'paused') { recorder.resume(); pausedTotal += Date.now() - pausedAt; pausedAt = 0; }
  }

  $('rec').onclick = () => (recorder ? stop() : start());
  window.sr.onCmd((c) => { if (c === 'stop') stop(); else if (c === 'pause') pause(); else if (c === 'toggle') (recorder ? stop() : start()); });

  loadSources().then(async () => {
    if (E2E) {
      chosen = sources.find((s) => s.kind === 'screen') || sources[0];
      $('fmt').value = (/fmt=webm/.test(location.search)) ? 'webm' : 'mp4';
      await start();
      setTimeout(stop, 3500);
    }
  });
})();

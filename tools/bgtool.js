/* bgtool.js : the Remove Background page. Runs in the browser, nothing is uploaded. */
(function () {
  'use strict';
  var root = document.getElementById('bg-tool');
  if (!root || !window.BGRemove) return;
  var $ = function (id) { return document.getElementById(id); };
  var B = window.BGRemove;

  var st = { src: null, mask: null, info: null, result: null, method: '', view: 'result', job: 0, name: 'image' };

  function status(t, err) { var s = $('bg-status'); s.textContent = t || ''; s.className = 'help' + (err ? ' err' : ''); s.style.color = err ? 'var(--accent)' : ''; }
  function toggleButtons(on) { root.querySelectorAll('[data-needs-result]').forEach(function (b) { b.disabled = !on; }); }

  /* ---------- drawing ---------- */
  function paint() {
    var cv = $('bg-canvas'), box = $('bg-box');
    if (!st.src) { box.classList.add('empty'); return; }
    box.classList.remove('empty');
    var show = st.view === 'original' || !st.result ? st.src : st.result;
    cv.width = show.width; cv.height = show.height;
    var ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    if (show === st.result && $('bg-out').value === 'color') { ctx.fillStyle = $('bg-color').value; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.drawImage(show, 0, 0);
  }
  function setView(v) {
    st.view = v;
    $('bg-view-result').setAttribute('aria-pressed', v === 'result' ? 'true' : 'false');
    $('bg-view-orig').setAttribute('aria-pressed', v === 'original' ? 'true' : 'false');
    paint();
  }

  /* ---------- processing ---------- */
  function applyAi() {
    st.result = B.maskToCanvas(st.src, st.mask, { threshold: parseInt($('bg-th').value, 10) / 100, soften: parseInt($('bg-soft').value, 10) });
    paint(); toggleButtons(true);
  }
  function run() {
    if (!st.src) return;
    var job = ++st.job, mode = $('bg-mode').value;
    toggleButtons(false);
    if (mode === 'auto' && B.hasAlpha(st.src)) { st.result = st.src; st.method = 'already transparent'; status('This image already has a transparent background.'); paint(); toggleButtons(true); return; }
    var info = st.info || (st.info = B.analyze(st.src));
    var method = mode === 'auto' ? (info.flat ? 'color' : 'ai') : mode;
    st.method = method;
    $('bg-adv-color').hidden = method !== 'color';
    $('bg-adv-ai').hidden = method !== 'ai';
    if (method === 'color') {
      status('Removing the background color...');
      setTimeout(function () {
        if (job !== st.job) return;
        st.result = B.colorKey(st.src, info.bg, parseInt($('bg-tol').value, 10));
        status('Done. A plain background was detected and removed exactly.'); paint(); toggleButtons(true);
      }, 20);
      return;
    }
    if (st.mask) { applyAi(); status('Done.'); return; }
    B.aiMask(st.src, function (t) { if (job === st.job) status(t); }).then(function (m) {
      if (job !== st.job) return;
      st.mask = m; applyAi(); status('Done. The background was removed with the AI cutout.');
    }, function () { status('The AI engine could not load. Check your connection and try again, or choose the plain background method.', true); });
  }

  /* ---------- loading an image ---------- */
  function load(file) {
    if (!file || !/^image\//.test(file.type)) { status('Choose an image file (PNG, JPG or WebP).', true); return; }
    status('Reading the image...');
    st.name = (file.name || 'image').replace(/\.[^.]+$/, '');
    B.fileToCanvas(file, 1600).then(function (c) {
      st.src = c; st.mask = null; st.info = null; st.result = null; st.view = 'result';
      $('bg-view').hidden = false; $('bg-controls').hidden = false; setView('result'); run();
    }, function (e) { status(e.message, true); });
  }
  $('bg-file').addEventListener('change', function () { load(this.files[0]); this.value = ''; });
  var drop = $('bg-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function (e) { var f = e.clipboardData && e.clipboardData.files; if (f && f.length) load(f[0]); });

  /* ---------- controls ---------- */
  var t = null;
  function later(fn) { clearTimeout(t); t = setTimeout(fn, 140); }
  $('bg-mode').addEventListener('change', function () { st.result = null; run(); });
  $('bg-tol').addEventListener('input', function () { later(function () { if (st.method === 'color') run(); }); });
  $('bg-th').addEventListener('input', function () { later(function () { if (st.method === 'ai' && st.mask) applyAi(); }); });
  $('bg-soft').addEventListener('input', function () { later(function () { if (st.method === 'ai' && st.mask) applyAi(); }); });
  $('bg-out').addEventListener('change', function () { $('bg-color').hidden = this.value !== 'color'; paint(); });
  $('bg-color').addEventListener('input', paint);
  $('bg-view-result').addEventListener('click', function () { setView('result'); });
  $('bg-view-orig').addEventListener('click', function () { setView('original'); });

  /* ---------- downloads ---------- */
  function save(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function flatten(color) {
    var c = document.createElement('canvas'); c.width = st.result.width; c.height = st.result.height;
    var x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); x.drawImage(st.result, 0, 0); return c;
  }
  function flash(btn, text) { var old = btn.getAttribute('data-label') || btn.textContent; btn.setAttribute('data-label', old); btn.textContent = text; setTimeout(function () { btn.textContent = old; }, 1600); }
  $('bg-png').addEventListener('click', function () {
    if (!st.result) return;
    var src = $('bg-out').value === 'color' ? flatten($('bg-color').value) : st.result;
    src.toBlob(function (b) { save(b, st.name + '-no-background.png'); }, 'image/png');
  });
  $('bg-jpg').addEventListener('click', function () {
    if (!st.result) return;
    flatten($('bg-out').value === 'color' ? $('bg-color').value : '#ffffff').toBlob(function (b) { save(b, st.name + '-no-background.jpg'); }, 'image/jpeg', 0.93);
  });
  $('bg-copy').addEventListener('click', function () {
    var btn = this;
    if (!st.result || !navigator.clipboard || !window.ClipboardItem) { flash(btn, 'Not supported here'); return; }
    var src = $('bg-out').value === 'color' ? flatten($('bg-color').value) : st.result;
    src.toBlob(function (b) { navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(function () { flash(btn, 'Copied'); }, function () { flash(btn, 'Blocked by browser'); }); }, 'image/png');
  });
  $('bg-reset').addEventListener('click', function () {
    st.job++; st.src = st.mask = st.info = st.result = null; $('bg-view').hidden = true; $('bg-controls').hidden = true; toggleButtons(false); status('');
  });
})();

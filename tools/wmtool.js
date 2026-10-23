/* Watermark maker. Text or logo watermark on one or many images. Runs in the browser. Nothing is uploaded. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = $('wm-tool');
  if (!root) return;

  var items = [];       // {id, file, name, thumb, out, outName, url, error}
  var nextId = 1;
  var current = null;   // item being previewed
  var curBmp = null;    // decoded bitmap of the previewed item
  var logoBmp = null;
  var pos = 8;          // 0..8 in the 3x3 grid, 8 = bottom right
  var tiled = false;
  var mode = 'text';
  var building = false;
  var raf = 0;
  var loadToken = 0;

  function status(msg, bad) {
    var el = $('wm-status');
    el.textContent = msg || '';
    el.className = 'help' + (bad ? ' err' : '');
  }
  function yieldUi() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function toBlob(c, t, q) { return new Promise(function (res) { c.toBlob(res, t, q); }); }
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB'; }

  /* ---------- settings ---------- */
  function opts() {
    return {
      mode: mode,
      text: $('wm-text').value,
      font: $('wm-font').value,
      bold: $('wm-bold').checked,
      outline: $('wm-outline').checked,
      size: parseFloat($('wm-size').value) / 100,
      color: $('wm-color').value,
      opacity: parseInt($('wm-opacity').value, 10) / 100,
      rot: parseInt($('wm-rot').value, 10),
      margin: parseFloat($('wm-margin').value) / 100,
      gap: parseFloat($('wm-gap').value) / 100,
      pos: pos,
      tiled: tiled
    };
  }

  function luma(hex) {
    var n = parseInt(hex.slice(1), 16);
    return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  }

  /* ---------- drawing (same code for preview and export, all sizes scale with image width) ---------- */
  function measure(ctx, o, w) {
    if (o.mode === 'logo') {
      if (!logoBmp) return null;
      var lw = Math.max(1, w * o.size), lh = lw * logoBmp.height / logoBmp.width;
      return { w: lw, h: lh };
    }
    var t = o.text;
    if (!t) return null;
    var fs = Math.max(4, w * o.size);
    ctx.font = (o.bold ? 'bold ' : '') + fs + 'px ' + o.font;
    var m = ctx.measureText(t);
    return { w: m.width, h: fs * 1.15, fs: fs };
  }
  function drawMark(ctx, o, box, cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(o.rot * Math.PI / 180);
    ctx.globalAlpha = o.opacity;
    if (o.mode === 'logo') {
      ctx.drawImage(logoBmp, -box.w / 2, -box.h / 2, box.w, box.h);
    } else {
      ctx.font = (o.bold ? 'bold ' : '') + box.fs + 'px ' + o.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (o.outline) {
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(1, box.fs * 0.09);
        ctx.strokeStyle = luma(o.color) > 140 ? '#000000' : '#ffffff';
        ctx.strokeText(o.text, 0, 0);
      }
      ctx.fillStyle = o.color;
      ctx.fillText(o.text, 0, 0);
    }
    ctx.restore();
  }
  function drawWatermark(ctx, w, h, o) {
    var box = measure(ctx, o, w);
    if (!box) return false;
    var rad = o.rot * Math.PI / 180, cs = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
    var rw = box.w * cs + box.h * sn, rh = box.w * sn + box.h * cs;
    if (o.tiled) {
      var gapPx = Math.max(0, w * o.gap);
      var stepX = box.w + gapPx, stepY = box.h + gapPx;
      var diag = Math.sqrt(w * w + h * h);
      var nx = Math.ceil(diag / stepX / 2) + 1, ny = Math.ceil(diag / stepY / 2) + 1;
      if (nx * ny > 5000) return true;
      for (var j = -ny; j <= ny; j++) {
        for (var i = -nx; i <= nx; i++) {
          // position in the rotated frame; stagger every second row for a pattern look
          var px = i * stepX + (j % 2 ? stepX / 2 : 0), py = j * stepY;
          var x = w / 2 + px * Math.cos(rad) - py * Math.sin(rad);
          var y = h / 2 + px * Math.sin(rad) + py * Math.cos(rad);
          if (x < -rw || y < -rh || x > w + rw || y > h + rh) continue;
          drawMark(ctx, o, box, x, y);
        }
      }
      return true;
    }
    var m = Math.min(w, h) * o.margin;
    var col = o.pos % 3, row = Math.floor(o.pos / 3);
    var cx = col === 0 ? m + rw / 2 : col === 1 ? w / 2 : w - m - rw / 2;
    var cy = row === 0 ? m + rh / 2 : row === 1 ? h / 2 : h - m - rh / 2;
    drawMark(ctx, o, box, cx, cy);
    return true;
  }

  /* ---------- preview ---------- */
  function renderPreview() {
    raf = 0;
    var cv = $('wm-canvas');
    if (!curBmp) { cv.width = cv.height = 0; return; }
    var scale = Math.min(1, 900 / curBmp.width);
    var w = Math.max(1, Math.round(curBmp.width * scale)), h = Math.max(1, Math.round(curBmp.height * scale));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(curBmp, 0, 0, w, h);
    var ok = drawWatermark(ctx, w, h, opts());
    var msg = '';
    if (!ok) msg = mode === 'logo' ? 'Choose a logo image to see it on the picture.' : 'Type some text to see it on the picture.';
    $('wm-hint').textContent = msg;
  }
  function schedulePreview() { if (!raf) raf = requestAnimationFrame(renderPreview); invalidate(); }

  // results are stale once any setting changes
  function invalidate() {
    var had = items.some(function (i) { return i.out; });
    if (!had) return;
    items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); it.url = null; it.out = null; it.error = ''; });
    renderList();
    updateButtons();
  }

  function decodeFile(file) {
    return createImageBitmap(file).catch(function () {
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file), im = new Image();
        im.onload = function () { res(createImageBitmap(im).then(function (b) { URL.revokeObjectURL(url); return b; })); };
        im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('This file could not be read as an image.')); };
        im.src = url;
      });
    });
  }
  function select(it) {
    current = it;
    var token = ++loadToken;
    renderList();
    if (!it) { if (curBmp && curBmp.close) curBmp.close(); curBmp = null; renderPreview(); $('wm-stage').classList.add('empty'); return; }
    decodeFile(it.file).then(function (b) {
      if (token !== loadToken) { b.close && b.close(); return; }
      if (curBmp && curBmp.close) curBmp.close();
      curBmp = b;
      $('wm-stage').classList.remove('empty');
      renderPreview();
    }, function (e) { status(e.message || 'Could not open this image.', true); });
  }

  /* ---------- list ---------- */
  function renderList() {
    var ul = $('wm-list');
    ul.innerHTML = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'wm-row' + (it === current ? ' on' : '');
      var img = document.createElement('img');
      img.alt = ''; img.width = 44; img.height = 44; img.src = it.thumb;
      var pick = document.createElement('button');
      pick.type = 'button'; pick.className = 'wm-pick';
      pick.setAttribute('aria-label', 'Preview ' + it.name);
      pick.setAttribute('aria-pressed', it === current ? 'true' : 'false');
      var nm = document.createElement('b'); nm.textContent = it.out ? it.outName : it.name;
      var sm = document.createElement('small');
      sm.textContent = it.error ? it.error : it.out ? fmtSize(it.out.size) : fmtSize(it.file.size);
      if (it.error) sm.className = 'wm-bad';
      pick.appendChild(img); var d = document.createElement('span'); d.appendChild(nm); d.appendChild(sm); pick.appendChild(d);
      pick.addEventListener('click', function () { if (it !== current) select(it); });
      li.appendChild(pick);
      if (it.out) {
        var dl = document.createElement('button');
        dl.type = 'button'; dl.className = 'btn'; dl.textContent = 'Download';
        dl.addEventListener('click', function () { saveBlob(it.out, it.outName); });
        li.appendChild(dl);
      }
      var rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'btn'; rm.textContent = 'Remove'; rm.setAttribute('aria-label', 'Remove ' + it.name);
      rm.addEventListener('click', function () { removeItem(it); });
      li.appendChild(rm);
      ul.appendChild(li);
    });
    $('wm-files').hidden = !items.length;
  }
  function updateButtons() {
    var n = items.length, done = items.filter(function (i) { return i.out; }).length;
    $('wm-apply').disabled = !n || building;
    $('wm-apply').textContent = n > 1 ? 'Apply to all ' + n + ' images' : 'Apply watermark';
    $('wm-zip').disabled = done < 1 || building;
    $('wm-zip').hidden = done < 1;
  }

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function thumbFor(file) {
    return createImageBitmap(file, { resizeWidth: 88, resizeQuality: 'medium' }).then(function (b) {
      var c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
      c.getContext('2d').drawImage(b, 0, 0); b.close();
      var u = c.toDataURL('image/jpeg', 0.7); c.width = c.height = 0; return u;
    }).catch(function () { return 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; });
  }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []).filter(function (f) { return /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name); });
    if (!files.length) { status('Please add image files such as PNG, JPG or WebP.', true); return; }
    status('');
    Promise.all(files.map(function (f) {
      return thumbFor(f).then(function (t) {
        return { id: nextId++, file: f, name: f.name || 'pasted-image.png', thumb: t, out: null, error: '' };
      });
    })).then(function (added) {
      added.forEach(function (it) { items.push(it); });
      invalidate();
      if (!current) select(added[0]); else renderList();
      updateButtons();
    });
  }
  function removeItem(it) {
    if (it.url) URL.revokeObjectURL(it.url);
    items = items.filter(function (i) { return i !== it; });
    if (current === it) select(items[0] || null); else renderList();
    updateButtons();
  }
  function clearAll() {
    items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); });
    items = [];
    select(null);
    updateButtons();
    status('');
  }

  /* ---------- build outputs ---------- */
  function outNames(type) {
    var ext = type === 'image/jpeg' ? 'jpg' : 'png', used = {};
    items.forEach(function (it) {
      var base = it.name.replace(/\.[^.]+$/, '') || 'image', n = base + '-watermarked.' + ext, i = 2;
      while (used[n.toLowerCase()]) n = base + '-watermarked-' + (i++) + '.' + ext;
      used[n.toLowerCase()] = 1; it.outName = n;
    });
  }
  function applyAll() {
    var o = opts();
    if (o.mode === 'text' && !o.text) { status('Type the watermark text first.', true); return; }
    if (o.mode === 'logo' && !logoBmp) { status('Choose a logo image first.', true); return; }
    building = true; updateButtons();
    var type = $('wm-out').value, q = parseInt($('wm-q').value, 10) / 100;
    outNames(type);
    items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); it.url = null; it.out = null; it.error = ''; });
    var chain = Promise.resolve(), n = items.length, k = 0, bad = 0;
    items.forEach(function (it) {
      chain = chain.then(function () {
        k++;
        status('Adding the watermark to ' + k + ' of ' + n + '...');
        return yieldUi().then(function () { return decodeFile(it.file); }).then(function (b) {
          var c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
          var ctx = c.getContext('2d');
          if (type === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
          ctx.drawImage(b, 0, 0);
          b.close && b.close();
          drawWatermark(ctx, c.width, c.height, o);
          return toBlob(c, type, q).then(function (blob) {
            c.width = c.height = 0;
            if (!blob) throw new Error('The picture is too large for this browser.');
            it.out = blob;
          });
        }).catch(function (e) { bad++; it.error = (e && e.message) || 'Could not process this image.'; });
      });
    });
    chain.then(function () {
      building = false;
      renderList(); updateButtons();
      status(bad ? bad + ' image' + (bad > 1 ? 's' : '') + ' could not be processed.' : 'Done. ' + (n - bad) + ' image' + (n - bad > 1 ? 's are' : ' is') + ' ready to download.', !!bad);
    });
  }
  function downloadZip() {
    var done = items.filter(function (i) { return i.out; });
    if (!done.length) return;
    if (!window.fflate) { status('The ZIP tool did not load. Download the files one by one.', true); return; }
    status('Building the ZIP...');
    var files = {};
    Promise.all(done.map(function (it) { return it.out.arrayBuffer().then(function (b) { files[it.outName] = new Uint8Array(b); }); }))
      .then(yieldUi).then(function () {
        saveBlob(new Blob([window.fflate.zipSync(files, { level: 0 })], { type: 'application/zip' }), 'watermarked-images.zip');
        status('ZIP downloaded with ' + done.length + ' image' + (done.length > 1 ? 's' : '') + '.');
      }).catch(function () { status('Could not build the ZIP.', true); });
  }

  /* ---------- controls ---------- */
  function syncMode() {
    mode = $('wm-mode').value;
    $('wm-text-box').hidden = mode !== 'text';
    $('wm-logo-box').hidden = mode !== 'logo';
  }
  function syncLabels() {
    $('wm-size-v').textContent = $('wm-size').value + '%';
    $('wm-opacity-v').textContent = $('wm-opacity').value + '%';
    $('wm-rot-v').textContent = $('wm-rot').value + ' deg';
    $('wm-margin-v').textContent = $('wm-margin').value + '%';
    $('wm-gap-v').textContent = $('wm-gap').value + '%';
    $('wm-q-row').hidden = $('wm-out').value !== 'image/jpeg';
  }
  function syncPos() {
    var bs = $('wm-pos').querySelectorAll('button');
    Array.prototype.forEach.call(bs, function (b, i) { b.setAttribute('aria-pressed', !tiled && i === pos ? 'true' : 'false'); b.disabled = tiled; });
    $('wm-tile').checked = tiled;
    $('wm-gap-row').hidden = !tiled;
    $('wm-margin-row').hidden = tiled;
  }
  var posNames = ['top left', 'top center', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom center', 'bottom right'];
  (function buildGrid() {
    var g = $('wm-pos');
    for (var i = 0; i < 9; i++) {
      (function (i) {
        var b = document.createElement('button');
        b.type = 'button'; b.setAttribute('aria-label', 'Position ' + posNames[i]); b.title = posNames[i];
        b.innerHTML = '<i></i>';
        b.addEventListener('click', function () { pos = i; syncPos(); schedulePreview(); });
        g.appendChild(b);
      })(i);
    }
  })();

  ['wm-text', 'wm-font', 'wm-bold', 'wm-outline', 'wm-size', 'wm-color', 'wm-opacity', 'wm-rot', 'wm-margin', 'wm-gap'].forEach(function (id) {
    $(id).addEventListener('input', function () { syncLabels(); schedulePreview(); });
    $(id).addEventListener('change', function () { syncLabels(); schedulePreview(); });
  });
  $('wm-mode').addEventListener('change', function () { syncMode(); schedulePreview(); });
  $('wm-tile').addEventListener('change', function () { tiled = $('wm-tile').checked; syncPos(); schedulePreview(); });
  $('wm-out').addEventListener('change', function () { syncLabels(); invalidate(); });
  $('wm-q').addEventListener('input', invalidate);
  $('wm-logo').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    createImageBitmap(f).then(function (b) {
      if (logoBmp && logoBmp.close) logoBmp.close();
      logoBmp = b;
      $('wm-logo-name').textContent = f.name;
      schedulePreview();
    }, function () { status('That logo could not be read. Try a PNG, JPG, WebP or SVG image.', true); });
  });
  $('wm-pickimg').addEventListener('click', function () { $('wm-file').click(); });
  $('wm-file').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  var drop = $('wm-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer && e.dataTransfer.files); });
  document.addEventListener('paste', function (e) {
    var fs = e.clipboardData && e.clipboardData.files;
    if (fs && fs.length) addFiles(fs);
  });
  $('wm-apply').addEventListener('click', applyAll);
  $('wm-zip').addEventListener('click', downloadZip);
  $('wm-clear').addEventListener('click', clearAll);
  window.addEventListener('pagehide', function () { items.forEach(function (it) { if (it.url) URL.revokeObjectURL(it.url); }); });

  syncMode(); syncLabels(); syncPos(); updateButtons();
  $('wm-stage').classList.add('empty');
})();

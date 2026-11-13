'use strict';
/* The File Share screen. File names and messages are always put on the page with textContent. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { me: null, files: [], sending: false, links: [], sent: {}, peers: [], pairPeer: null, offer: null, running: false, bytes: {}, fileState: {}, done: false };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function size(n) {
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1024 && i < 4) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)) + ' ' + u[i];
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function osName(p) { return p === 'win32' ? 'Windows' : p === 'darwin' ? 'Mac' : p === 'linux' ? 'Linux' : ''; }

  var alertTimer = null, peersHintTimer = null;
  function showError(msg) {
    var a = $('alert'); a.textContent = msg; a.hidden = false;
    clearTimeout(alertTimer); alertTimer = setTimeout(function () { a.hidden = true; }, 12000);
  }
  function clearError() { $('alert').hidden = true; }
  function guard(fn) { return function () { var r; try { r = fn.apply(this, arguments); } catch (e) { showError(e.message || String(e)); return; } if (r && r.catch) r.catch(function (e) { showError(cleanMsg(e)); }); }; }
  function cleanMsg(e) { return String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }

  /* ------------------------------------------------------------ tabs */
  function tab(which) {
    var send = which === 'send';
    $('tab-send').setAttribute('aria-selected', send); $('tab-recv').setAttribute('aria-selected', !send);
    $('view-send').hidden = !send; $('view-recv').hidden = send;
    clearError();
    if (Date.now() - netChecked > 8000) runNetCheck();
    clearTimeout(peersHintTimer); $('peers-hint').hidden = true;
    if (!send) peersHintTimer = setTimeout(function () { if (!state.peers.length) $('peers-hint').hidden = false; }, 15000);
  }
  $('tab-send').onclick = function () { tab('send'); };
  $('tab-recv').onclick = function () { tab('recv'); };

  /* ------------------------------------------------------------ send: choosing */
  function fileRow(f, opts) {
    var li = el('li', 'file'); li.dataset.id = f.id;
    li.appendChild(el('span', 'name', f.name)); li.lastChild.title = f.name;
    var right = el('span', 'meta', size(f.size));
    if (opts && opts.remove) {
      var x = el('button', 'x', '×'); x.title = 'Remove'; x.setAttribute('aria-label', 'Remove ' + f.name);
      x.onclick = guard(function () { return window.api.remove(f.id).then(setFiles); });
      right.appendChild(document.createTextNode(' ')); right.appendChild(x);
    }
    li.appendChild(right);
    if (opts && opts.bar) { var b = el('div', 'bar'); var fl = el('div', 'fill'); b.appendChild(fl); li.appendChild(b); }
    return li;
  }
  function setFiles(files) {
    state.files = files || [];
    var ul = $('send-list'); ul.textContent = '';
    state.files.forEach(function (f) { ul.appendChild(fileRow(f, { remove: true })); });
    var total = state.files.reduce(function (a, f) { return a + f.size; }, 0);
    $('send-count').textContent = plural(state.files.length, 'file', 'files') + ', ' + size(total);
    $('send-list-wrap').hidden = !state.files.length;
    $('drop').hidden = !!state.files.length;
  }
  function added(r) {
    if (!r) return;
    setFiles(r.files || r);
    if (r.skipped) showError(r.skipped + ' item' + (r.skipped === 1 ? ' was' : 's were') + ' left out (links, unreadable files or too many files).');
  }
  $('pick-files').onclick = guard(function () { return window.api.pick('files').then(added); });
  $('pick-folder').onclick = guard(function () { return window.api.pick('folder').then(added); });
  $('send-clear').onclick = guard(function () { return window.api.clear().then(setFiles); });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); if (!state.sending) drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  document.addEventListener('drop', guard(function (e) {
    if (state.sending || !e.dataTransfer || !e.dataTransfer.files.length) return;
    tab('send');
    var paths = window.api.pathsFor(e.dataTransfer.files);
    if (!paths.length) { showError('Those items could not be read. Use the Choose buttons instead.'); return; }
    return window.api.add(paths).then(added);
  }));

  /* ------------------------------------------------------------ send: sharing */
  var expTimer = null;
  function formatCode(c) { return c.slice(0, 3) + ' ' + c.slice(3); }
  $('start').onclick = guard(function () {
    clearError();
    if (Date.now() - netChecked > 8000) runNetCheck();
    return window.api.startShare().then(function (r) {
      state.sending = true; state.sent = {}; state.links = r.links;
      $('code').textContent = formatCode(r.code);
      var sel = $('link-pick'); sel.textContent = '';
      r.links.forEach(function (l, i) { var o = el('option', null, l.ip); o.value = i; sel.appendChild(o); });
      sel.hidden = r.links.length < 2;
      $('link').value = r.links.length ? r.links[0].url : 'No network found. Connect to Wi-Fi or a cable first.';
      $('copy-link').disabled = !r.links.length;
      var ul = $('live-list'); ul.textContent = '';
      r.files.forEach(function (f) { ul.appendChild(fileRow(f, { bar: true })); });
      $('send-pick').hidden = true; $('send-live').hidden = false;
      setSendStatus('Waiting for the other computer...', '');
      clearInterval(expTimer);
      function left() { var m = Math.max(0, Math.round((r.expiresAt - Date.now()) / 60000)); $('expires').textContent = 'Sharing ends by itself in ' + (m >= 60 ? plural(Math.round(m / 60), 'hour', 'hours') : plural(m, 'minute', 'minutes')) + '.'; }
      left(); expTimer = setInterval(left, 30000);
    });
  });
  function setSendStatus(t, cls) { var s = $('send-status'); s.textContent = t; s.className = 'status ' + (cls || ''); }
  $('link-pick').onchange = function () { var l = state.links[Number(this.value)]; if (l) $('link').value = l.url; };
  $('copy-link').onclick = guard(function () { return window.api.copy($('link').value).then(function () { $('copy-link').textContent = 'Copied'; setTimeout(function () { $('copy-link').textContent = 'Copy link'; }, 1800); }); });
  $('stop').onclick = guard(function () { return window.api.stopShare(); });
  function endShare(reason) {
    state.sending = false; clearInterval(expTimer);
    $('send-live').hidden = true; $('send-pick').hidden = false;
    if (reason === 'expired') showError('Sharing ended because it was open for too long. Press Start sharing to begin again.');
  }
  window.api.on('share:ended', function (d) { endShare(d && d.reason); });
  window.api.on('share:client', function (d) { setSendStatus('Connected: ' + d.ip, 'ok'); });
  window.api.on('share:paired', function (d) { setSendStatus('The code was accepted from ' + d.ip + '.', 'ok'); });
  window.api.on('share:wrong-code', function (d) { setSendStatus('A wrong code was typed (' + d.left + ' tries left before this share locks).', 'bad'); });
  window.api.on('share:error', function (d) { showError(d.message); });
  window.api.on('share:progress', function (d) {
    Object.keys(d.sent).forEach(function (id) {
      var li = document.querySelector('#live-list li[data-id="' + id + '"]'); if (!li) return;
      var f = state.files.find(function (x) { return x.id === id; }); if (!f) return;
      var p = f.size ? Math.min(100, d.sent[id] / f.size * 100) : 100;
      var fill = li.querySelector('.fill'); fill.style.width = p + '%'; fill.className = 'fill' + (p >= 100 ? ' ok' : '');
    });
  });

  /* ------------------------------------------------------------ receive: finding */
  function renderPeers() {
    var ul = $('peers'); ul.textContent = '';
    state.peers.forEach(function (p) {
      var li = el('li', 'peer'); var left = el('div'); var b = el('b', null, p.name); left.appendChild(b);
      left.appendChild(el('span', 'muted small', (osName(p.platform) ? osName(p.platform) + ', ' : '') + plural(p.files, 'file', 'files') + ', ' + size(p.bytes)));
      var go = el('button', 'btn primary', 'Choose'); go.onclick = function () { state.pairPeer = p; $('pair-name').textContent = p.name; $('pair').hidden = false; $('code-in').value = ''; $('code-in').focus(); };
      li.appendChild(left); li.appendChild(go); ul.appendChild(li);
    });
    $('peers-empty').hidden = state.peers.length > 0;
    if (state.pairPeer && !state.peers.some(function (p) { return p.id === state.pairPeer.id; })) { state.pairPeer = null; $('pair').hidden = true; }
  }
  window.api.on('peers', function (list) { state.peers = list; renderPeers(); });
  function cleanCode(v) { return String(v || '').replace(/\D+/g, '').slice(0, 6); }
  ['code-in', 'target-code'].forEach(function (id) { $(id).addEventListener('input', function () { var c = cleanCode(this.value); this.value = c.length > 3 ? c.slice(0, 3) + ' ' + c.slice(3) : c; }); });
  $('pair-cancel').onclick = function () { state.pairPeer = null; $('pair').hidden = true; };
  function connect(args) { clearError(); return window.api.connect(args).then(showOffer); }
  $('pair-go').onclick = guard(function () { return connect({ peerId: state.pairPeer && state.pairPeer.id, code: cleanCode($('code-in').value) }); });
  $('code-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('pair-go').click(); });
  $('target-go').onclick = guard(function () { return connect({ target: $('target').value, code: cleanCode($('target-code').value) }); });

  /* ------------------------------------------------------------ receive: downloading */
  function showOffer(o) {
    state.offer = o; state.bytes = {}; state.fileState = {}; state.done = false;
    $('recv-find').hidden = true; $('recv-offer').hidden = false;
    $('offer-title').textContent = plural(o.files.length, 'file', 'files') + ' from ' + (o.name || 'the sender') + ', ' + size(o.total);
    var ul = $('offer-list'); ul.textContent = '';
    o.files.forEach(function (f) { ul.appendChild(fileRow(f, { bar: true })); });
    $('dest').textContent = o.dest; $('dest').title = o.dest;
    $('download').hidden = false; $('download').disabled = false; $('cancel').hidden = true; $('open-dest').hidden = true; $('total-bar').hidden = true;
    $('recv-status').textContent = ''; $('recv-status').className = 'status';
  }
  $('offer-back').onclick = guard(function () { if (state.running) return window.api.cancel(); state.offer = null; $('recv-offer').hidden = true; $('recv-find').hidden = false; $('pair').hidden = true; });
  $('dest-change').onclick = guard(function () { return window.api.chooseDest().then(function (p) { if (p) { $('dest').textContent = p; $('dest').title = p; } }); });
  $('download').onclick = guard(function () {
    return window.api.download().then(function (r) {
      state.running = true; state.bytes = {};
      $('download').hidden = true; $('cancel').hidden = false; $('dest-change').disabled = true; $('total-bar').hidden = false; $('total-fill').style.width = '0%';
      $('recv-status').textContent = 'Downloading...'; $('recv-status').className = 'status';
      $('dest').textContent = r.dest;
    });
  });
  $('cancel').onclick = guard(function () { return window.api.cancel(); });
  $('open-dest').onclick = guard(function () { return window.api.openDest(); });

  function paint() {
    if (!state.offer) return;
    var total = state.offer.total || 0, got = 0;
    state.offer.files.forEach(function (f) {
      var n = Math.min(f.size, state.bytes[f.id] || 0); got += n;
      var li = document.querySelector('#offer-list li[data-id="' + f.id + '"]'); if (!li) return;
      var st = state.fileState[f.id], p = f.size ? n / f.size * 100 : (st === 'done' ? 100 : 0);
      var fill = li.querySelector('.fill'); fill.style.width = (st === 'done' ? 100 : p) + '%'; fill.className = 'fill' + (st === 'done' ? ' ok' : '');
      var meta = li.querySelector('.meta'); var label = st === 'done' ? 'Saved' : st === 'checking' ? 'Checking...' : st === 'retrying' ? 'Reconnecting...' : st === 'failed' ? 'Failed' : st === 'cancelled' ? 'Stopped' : (st === 'downloading' ? Math.round(p) + '%' : '');
      meta.textContent = size(f.size) + (label ? '  ' + label : '');
    });
    $('total-fill').style.width = (total ? Math.min(100, got / total * 100) : 0) + '%';
  }
  window.api.on('recv:progress', function (d) { Object.assign(state.bytes, d.bytes); paint(); });
  window.api.on('recv:file', function (d) { state.fileState[d.id] = d.state; if (d.state === 'failed') { var li = document.querySelector('#offer-list li[data-id="' + d.id + '"] .name'); if (li) li.title = d.error || ''; } paint(); });
  window.api.on('recv:done', function (d) {
    state.running = false; $('cancel').hidden = true; $('dest-change').disabled = false;
    paint();
    var s = $('recv-status');
    if (d.cancelled) { s.textContent = 'Stopped. ' + plural(d.done.length, 'file was', 'files were') + ' saved.'; s.className = 'status bad'; $('download').hidden = false; $('download').textContent = 'Download again'; }
    else if (d.failed.length) {
      s.textContent = plural(d.done.length, 'file', 'files') + ' saved, ' + d.failed.length + ' failed: ' + d.failed.map(function (f) { return (f.name ? f.name + ': ' : '') + f.error; }).slice(0, 3).join('; ');
      s.className = 'status bad'; $('download').hidden = false; $('download').textContent = 'Try again';
    } else {
      $('total-fill').style.width = '100%'; $('total-fill').className = 'fill ok';
      s.textContent = 'Done. ' + plural(d.done.length, 'file', 'files') + ' saved and checked.'; s.className = 'status ok';
    }
    if (d.done.length) $('open-dest').hidden = false;
  });


  /* ------------------------------------------------------------ connection check */
  var netShowAll = false, lastNet = null, netBusy = false, netChecked = 0;
  function renderNet(res) {
    lastNet = res;
    var items = netShowAll ? res.items : res.items.filter(function (i) { return !i.ok; });
    var box = $('net'); var ul = $('net-list'); ul.textContent = '';
    box.hidden = !items.length;
    $('net-title').textContent = res.allOk ? 'Connection check: everything is ready' : 'Before you start: the other computer may not be able to reach this one';
    items.forEach(function (i) {
      var li = el('li', 'net-item ' + (i.ok ? 'ok' : 'warn'));
      li.appendChild(el('span', 'net-dot'));
      var mid = el('div'); mid.appendChild(el('b', null, i.title)); mid.appendChild(el('span', 'detail', i.detail || '')); li.appendChild(mid);
      if (i.fix) {
        var b = el('button', 'btn primary', i.fix.label);
        b.onclick = function () {
          if (netBusy) return; netBusy = true; b.disabled = true; b.textContent = 'Waiting for your permission...';
          var old = li.querySelector('.net-msg'); if (old) old.remove();
          window.api.netFix(i.id).then(function (r) {
            netBusy = false;
            if (!r.result.ok) { renderNet(r.check); var w = document.querySelector('#net-list .net-item.warn'); if (w) w.appendChild(el('p', 'net-msg', r.result.message || 'It did not work.')); }
            else renderNet(r.check);
          }).catch(function (e) { netBusy = false; b.disabled = false; b.textContent = i.fix.label; showError(cleanMsg(e)); });
        };
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
  }
  function runNetCheck() {
    netChecked = Date.now();
    return window.api.netCheck().then(renderNet).catch(function () {});
  }
  $('net-toggle').onclick = function () { netShowAll = !netShowAll; if (lastNet) renderNet(lastNet); else runNetCheck(); if (netShowAll) $('net').hidden = false; };

  /* ------------------------------------------------------------ start */
  window.api.info().then(function (i) {
    runNetCheck();
    state.me = i; $('me').textContent = i.name + (osName(i.platform) ? ', ' + osName(i.platform) : '') + ', version ' + i.version;
    $('me2').textContent = i.name;
    setFiles(i.files);
  });
  window.__fileShare = { state: state, added: added, setFiles: setFiles };       /* handy for tests */
})();

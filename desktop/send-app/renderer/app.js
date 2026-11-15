'use strict';
/* The File Share screen: a home with two big choices, then a guided flow with live checks.
   File names and messages are always put on the page with textContent. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  document.documentElement.dataset.platform = window.platform || '';

  var FLOWS = {
    send: [['wifi', 'Connect to Wi-Fi'], ['allow', 'Allow File Share'], ['choose', 'Choose files'], ['share', 'Share the code']],
    recv: [['wifi', 'Connect to Wi-Fi'], ['allow', 'Allow File Share'], ['find', 'Find the sender'], ['get', 'Download']]
  };
  var state = { me: null, flow: null, step: null, net: null, fw: null, files: [], sending: false, links: [], peers: [], pairPeer: null, offer: null, running: false, bytes: {}, fileState: {} };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function size(n) {
    var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
    while (n >= 1024 && i < 4) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)) + ' ' + u[i];
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function osName(p) { return p === 'win32' ? 'Windows' : p === 'darwin' ? 'Mac' : p === 'linux' ? 'Linux' : ''; }
  function cleanMsg(e) { return String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }

  var alertTimer = null;
  function showError(msg) { var a = $('alert'); a.textContent = msg; a.hidden = false; clearTimeout(alertTimer); alertTimer = setTimeout(function () { a.hidden = true; }, 12000); }
  function clearError() { $('alert').hidden = true; }
  function guard(fn) { return function () { var r; try { r = fn.apply(this, arguments); } catch (e) { showError(cleanMsg(e)); return; } if (r && r.catch) r.catch(function (e) { showError(cleanMsg(e)); }); }; }

  /* ------------------------------------------------------------ home and flow switching */
  function showHome() {
    stopWifiPoll(); clearTimeout(peersHintTimer);
    state.flow = null; state.step = null;
    $('flow').hidden = true; $('home').hidden = false; $('tb-home').hidden = true; clearError();
  }
  function startFlow(flow) {
    clearError(); state.flow = flow;
    $('home').hidden = true; $('flow').hidden = false; $('tb-home').hidden = false;
    $('flow-title').textContent = flow === 'send' ? 'Send files' : 'Receive files';
    go('wifi');
  }
  $('go-send').onclick = function () { startFlow('send'); };
  $('go-recv').onclick = function () { startFlow('recv'); };
  $('tb-home').onclick = guard(function () {
    if (state.sending) return window.api.stopShare().then(showHome);
    if (state.running) return window.api.cancel().then(showHome);
    showHome();
  });
  $('tb-home').addEventListener('mouseenter', function () { if (state.sending) this.textContent = 'Stop sharing and go home'; });
  $('tb-home').addEventListener('mouseleave', function () { this.textContent = 'Home'; });

  function drawSteps() {
    var list = FLOWS[state.flow], idx = list.findIndex(function (s) { return s[0] === state.step; });
    var ol = $('steps'); ol.textContent = '';
    list.forEach(function (s, i) {
      var li = el('li', i < idx ? 'done' : i === idx ? 'now' : '');
      li.appendChild(el('b', null, i < idx ? '✓' : String(i + 1))); li.appendChild(el('span', null, s[1]));
      if (i < idx && s[0] !== 'share' && s[0] !== 'get') li.onclick = function () { go(s[0]); };
      ol.appendChild(li);
    });
  }

  /* the buttons under each step */
  function nav(o) {
    var back = $('back'), next = $('next'), skip = $('skip');
    back.hidden = !o.back; back.onclick = o.back || null;
    next.hidden = !o.next;
    if (o.next) { next.textContent = o.next.label; next.disabled = !o.next.enabled; next.className = 'btn ' + (o.next.danger ? 'danger' : 'primary'); next.onclick = guard(o.next.click); }
    skip.hidden = !o.skip; skip.onclick = o.skip || null;
    $('navbar').hidden = !o.back && !o.next && !o.skip;
  }

  function go(id) {
    var panels = ['wifi', 'allow', 'choose', 'share', 'find', 'get'];
    panels.forEach(function (p) { $('p-' + p).hidden = p !== id; });
    state.step = id; drawSteps(); clearError();
    var list = FLOWS[state.flow], idx = list.findIndex(function (s) { return s[0] === id; });
    var prev = idx > 0 ? function () { go(list[idx - 1][0]); } : showHome;
    stopWifiPoll(); clearTimeout(peersHintTimer);
    if (id === 'wifi') { startWifiPoll(); renderWifi(state.net); nav({ back: showHome, next: { label: 'Next', enabled: !!(state.net && state.net.ok), click: function () { go('allow'); } } }); }
    else if (id === 'allow') { prepAllow(); runFullCheck(); renderAllow(); }
    else if (id === 'choose') { nav({ back: prev, next: { label: 'Start sharing', enabled: state.files.length > 0, click: startSharing } }); }
    else if (id === 'share') { nav({ next: { label: 'Stop sharing', enabled: true, danger: true, click: function () { return window.api.stopShare(); } } }); }
    else if (id === 'find') {
      nav({ back: prev }); renderPeers();
      $('peers-hint').hidden = true; peersHintTimer = setTimeout(function () { if (!state.peers.length) $('peers-hint').hidden = false; }, 15000);
    }
    else if (id === 'get') { nav({}); }
  }

  /* ------------------------------------------------------------ step 1: Wi-Fi */
  var wifiTimer = null, peersHintTimer = null;
  function stopWifiPoll() { clearInterval(wifiTimer); wifiTimer = null; }
  function startWifiPoll() {
    function tick() { window.api.netQuick().then(function (r) { state.net = r.network; if (state.step === 'wifi') renderWifi(r.network); }).catch(function () {}); }
    tick(); wifiTimer = setInterval(tick, 2500);
  }
  function wifiSteps() {
    var p = window.platform;
    if (p === 'win32') return ['Click the Wi-Fi icon at the bottom right of your screen, next to the clock.', 'If Airplane mode is on, turn it off. Then turn Wi-Fi on.', 'Pick your Wi-Fi network and press Connect. Or plug in a network cable.', 'This screen turns green by itself when you are connected.'];
    if (p === 'darwin') return ['Click the Wi-Fi icon in the menu bar at the top right of your screen.', 'Turn Wi-Fi on, then pick your network. Or plug in a network cable.', 'This screen turns green by itself when you are connected.'];
    return ['Click the network icon in the top bar of your screen.', 'Turn Wi-Fi on, then pick your network. Or plug in a network cable.', 'This screen turns green by itself when you are connected.'];
  }
  function renderWifi(net) {
    var box = $('wifi-status'), ok = !!(net && net.ok);
    box.className = 'check ' + (net ? (ok ? 'ok' : 'warn') : '');
    $('wifi-title').textContent = !net ? 'Checking...' : ok ? 'Connected' : 'Not connected to a network';
    $('wifi-detail').textContent = !net ? '' : ok ? net.name + ', ' + net.ip : 'No Wi-Fi or cable connection was found on this computer.';
    $('wifi-help').hidden = !net || ok;
    var ul = $('wifi-steps'); if (!ul.children.length) wifiSteps().forEach(function (t) { ul.appendChild(el('li', null, t)); });
    $('wifi-open').hidden = !(state.me && state.me.wifiSettings);
    if (state.step === 'wifi') { var n = $('next'); n.disabled = !ok; }
  }
  $('wifi-open').onclick = guard(function () { return window.api.openWifi(); });

  /* ------------------------------------------------------------ step 2: the firewall */
  function prepAllow() {
    var p = window.platform;
    $('allow-intro').textContent = p === 'win32' ? 'Windows Firewall hides this computer from others by default. File Share needs one permission so the other computer can send or receive.'
      : p === 'darwin' ? 'The Mac firewall can block other computers. File Share asks for one permission so the other computer can reach this one.'
      : 'A firewall on this computer can block other computers. File Share asks for one permission so the other computer can reach this one.';
  }
  function runFullCheck() {
    return window.api.netCheck().then(function (res) {
      state.fw = res.items.find(function (i) { return i.id === 'firewall'; }) || { ok: true, title: 'Ready', detail: '' };
      var n = res.items.find(function (i) { return i.id === 'network'; }); if (n) state.net = n.ok ? state.net || { ok: true, name: '', ip: '' } : { ok: false };
      renderAllow();
    }).catch(function () {});
  }
  function renderAllow() {
    if (state.step !== 'allow') return;
    var f = state.fw, ok = !!(f && f.ok);
    $('allow-status').className = 'check ' + (f ? (ok ? 'ok' : 'warn') : '');
    $('allow-title').textContent = f ? f.title : 'Checking...'; $('allow-detail').textContent = f ? f.detail : '';
    var b = $('allow-fix'); b.hidden = !(f && f.fix); if (f && f.fix) { b.textContent = f.fix.label; b.disabled = false; }
    var list = FLOWS[state.flow], idx = list.findIndex(function (s) { return s[0] === 'allow'; });
    nav({ back: function () { go('wifi'); }, next: { label: 'Next', enabled: ok, click: function () { go(list[idx + 1][0]); } }, skip: ok ? null : function () { go(list[idx + 1][0]); } });
  }
  var fixBusy = false;
  $('allow-fix').onclick = function () {
    if (fixBusy) return; fixBusy = true; var b = this; b.disabled = true; b.textContent = 'Waiting for your permission...'; $('allow-msg').hidden = true;
    window.api.netFix('firewall').then(function (r) {
      fixBusy = false;
      var f = r.check.items.find(function (i) { return i.id === 'firewall'; }); state.fw = f; renderAllow();
      if (!r.result.ok) { var m = $('allow-msg'); m.textContent = r.result.message || 'It did not work.'; m.hidden = false; }
    }).catch(function (e) { fixBusy = false; b.disabled = false; showError(cleanMsg(e)); });
  };

  /* ------------------------------------------------------------ step 3 (send): choosing */
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
    if (opts && opts.bar) { var b = el('div', 'bar'); b.appendChild(el('div', 'fill')); li.appendChild(b); }
    return li;
  }
  function setFiles(files) {
    state.files = files || [];
    var ul = $('send-list'); ul.textContent = '';
    state.files.forEach(function (f) { ul.appendChild(fileRow(f, { remove: true })); });
    var total = state.files.reduce(function (a, f) { return a + f.size; }, 0);
    $('send-count').textContent = plural(state.files.length, 'file', 'files') + ', ' + size(total);
    $('send-list-wrap').hidden = !state.files.length; $('drop').hidden = !!state.files.length;
    if (state.step === 'choose') $('next').disabled = !state.files.length;
  }
  function added(r) {
    if (!r) return; setFiles(r.files || r);
    if (r.skipped) showError(r.skipped + ' item' + (r.skipped === 1 ? ' was' : 's were') + ' left out (links, unreadable files or too many files).');
  }
  $('pick-files').onclick = guard(function () { return window.api.pick('files').then(added); });
  $('pick-folder').onclick = guard(function () { return window.api.pick('folder').then(added); });
  $('send-more').onclick = guard(function () { return window.api.pick('files').then(added); });
  $('send-clear').onclick = guard(function () { return window.api.clear().then(setFiles); });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); if (state.step === 'choose') drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { document.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  document.addEventListener('drop', guard(function (e) {
    if (state.step !== 'choose' || !e.dataTransfer || !e.dataTransfer.files.length) return;
    var paths = window.api.pathsFor(e.dataTransfer.files);
    if (!paths.length) { showError('Those items could not be read. Use the Choose buttons instead.'); return; }
    return window.api.add(paths).then(added);
  }));

  /* ------------------------------------------------------------ step 4 (send): sharing */
  var expTimer = null;
  function formatCode(c) { return c.slice(0, 3) + ' ' + c.slice(3); }
  function setSendStatus(t, cls) { var s = $('send-status'); s.textContent = t; s.className = 'status ' + (cls || ''); }
  function startSharing() {
    clearError();
    return window.api.startShare().then(function (r) {
      state.sending = true; state.links = r.links;
      $('code').textContent = formatCode(r.code);
      var sel = $('link-pick'); sel.textContent = '';
      r.links.forEach(function (l, i) { var o = el('option', null, l.ip); o.value = i; sel.appendChild(o); });
      sel.hidden = r.links.length < 2;
      $('link').value = r.links.length ? r.links[0].url : 'No network found. Connect to Wi-Fi first.';
      $('copy-link').disabled = !r.links.length;
      var ul = $('live-list'); ul.textContent = ''; r.files.forEach(function (f) { ul.appendChild(fileRow(f, { bar: true })); });
      setSendStatus('Waiting for the other computer...', '');
      clearInterval(expTimer);
      function left() { var m = Math.max(0, Math.round((r.expiresAt - Date.now()) / 60000)); $('expires').textContent = 'Sharing ends by itself in ' + (m >= 60 ? plural(Math.round(m / 60), 'hour', 'hours') : plural(m, 'minute', 'minutes')) + '.'; }
      left(); expTimer = setInterval(left, 30000);
      go('share');
    });
  }
  $('link-pick').onchange = function () { var l = state.links[Number(this.value)]; if (l) $('link').value = l.url; };
  $('copy-link').onclick = guard(function () { return window.api.copy($('link').value).then(function () { $('copy-link').textContent = 'Copied'; setTimeout(function () { $('copy-link').textContent = 'Copy link'; }, 1800); }); });
  window.api.on('share:ended', function (d) {
    state.sending = false; clearInterval(expTimer);
    if (state.flow === 'send' && state.step === 'share') go('choose');
    if (d && d.reason === 'expired') showError('Sharing ended because it was open for too long. Press Start sharing to begin again.');
  });
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

  /* ------------------------------------------------------------ step 3 (receive): finding the sender */
  function renderPeers() {
    var ul = $('peers'); ul.textContent = '';
    state.peers.forEach(function (p) {
      var li = el('li', 'peer'); var left = el('div'); left.appendChild(el('b', null, p.name));
      left.appendChild(el('span', 'muted small', (osName(p.platform) ? osName(p.platform) + ', ' : '') + plural(p.files, 'file', 'files') + ', ' + size(p.bytes)));
      var go2 = el('button', 'btn primary', 'Choose'); go2.onclick = function () { state.pairPeer = p; $('pair-name').textContent = p.name; $('pair').hidden = false; $('code-in').value = ''; $('code-in').focus(); };
      li.appendChild(left); li.appendChild(go2); ul.appendChild(li);
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

  /* ------------------------------------------------------------ step 4 (receive): downloading */
  function showOffer(o) {
    state.offer = o; state.bytes = {}; state.fileState = {};
    go('get');
    $('offer-title').textContent = plural(o.files.length, 'file', 'files') + ' from ' + (o.name || 'the sender') + ', ' + size(o.total);
    var ul = $('offer-list'); ul.textContent = ''; o.files.forEach(function (f) { ul.appendChild(fileRow(f, { bar: true })); });
    $('dest').textContent = o.dest; $('dest').title = o.dest;
    $('download').hidden = false; $('download').disabled = false; $('download').textContent = 'Download all'; $('cancel').hidden = true; $('open-dest').hidden = true; $('total-bar').hidden = true;
    $('recv-status').textContent = ''; $('recv-status').className = 'status';
  }
  $('offer-back').onclick = guard(function () { if (state.running) return window.api.cancel(); state.offer = null; go('find'); });
  $('dest-change').onclick = guard(function () { return window.api.chooseDest().then(function (p) { if (p) { $('dest').textContent = p; $('dest').title = p; } }); });
  $('download').onclick = guard(function () {
    return window.api.download().then(function (r) {
      state.running = true; state.bytes = {};
      $('download').hidden = true; $('cancel').hidden = false; $('dest-change').disabled = true; $('total-bar').hidden = false; $('total-fill').style.width = '0%'; $('total-fill').className = 'fill';
      $('recv-status').textContent = 'Downloading...'; $('recv-status').className = 'status'; $('dest').textContent = r.dest;
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
      var label = st === 'done' ? 'Saved' : st === 'checking' ? 'Checking...' : st === 'retrying' ? 'Reconnecting...' : st === 'failed' ? 'Failed' : st === 'cancelled' ? 'Stopped' : (st === 'downloading' ? Math.round(p) + '%' : '');
      li.querySelector('.meta').textContent = size(f.size) + (label ? '  ' + label : '');
    });
    $('total-fill').style.width = (total ? Math.min(100, got / total * 100) : 0) + '%';
  }
  window.api.on('recv:progress', function (d) { Object.assign(state.bytes, d.bytes); paint(); });
  window.api.on('recv:file', function (d) { state.fileState[d.id] = d.state; if (d.state === 'failed') { var li = document.querySelector('#offer-list li[data-id="' + d.id + '"] .name'); if (li) li.title = d.error || ''; } paint(); });
  window.api.on('recv:done', function (d) {
    state.running = false; $('cancel').hidden = true; $('dest-change').disabled = false; paint();
    var s = $('recv-status');
    if (d.cancelled) { s.textContent = 'Stopped. ' + plural(d.done.length, 'file was', 'files were') + ' saved.'; s.className = 'status bad'; $('download').hidden = false; $('download').textContent = 'Download again'; }
    else if (d.failed.length) { s.textContent = plural(d.done.length, 'file', 'files') + ' saved, ' + d.failed.length + ' failed: ' + d.failed.map(function (f) { return (f.name ? f.name + ': ' : '') + f.error; }).slice(0, 3).join('; '); s.className = 'status bad'; $('download').hidden = false; $('download').textContent = 'Try again'; }
    else { $('total-fill').style.width = '100%'; $('total-fill').className = 'fill ok'; s.textContent = 'Done. ' + plural(d.done.length, 'file', 'files') + ' saved and checked.'; s.className = 'status ok'; }
    if (d.done.length) $('open-dest').hidden = false;
  });

  /* ------------------------------------------------------------ updates */
  var updMode = 'manual';
  window.api.on('update:available', function (d) {
    updMode = d.mode; $('update').hidden = false;
    $('update-text').textContent = 'Version ' + d.version + ' of File Share is ready.';
    var b = $('update-btn'); b.disabled = false; b.textContent = d.mode === 'auto' ? 'Update now' : 'Download it';
  });
  window.api.on('update:progress', function (d) { $('update-text').textContent = 'Downloading the update... ' + d.percent + '%'; $('update-btn').disabled = true; });
  window.api.on('update:ready', function () { $('update-text').textContent = 'The update is ready. File Share will restart to finish.'; var b = $('update-btn'); b.textContent = 'Restart now'; b.disabled = false; b.dataset.ready = '1'; });
  $('update-btn').onclick = guard(function () {
    var b = this; if (b.dataset.ready) return window.api.updateInstall();
    if (updMode === 'auto') { b.disabled = true; $('update-text').textContent = 'Downloading the update...'; }
    return window.api.updateNow();
  });

  /* ------------------------------------------------------------ start */
  window.api.info().then(function (i) {
    state.me = i; $('me2').textContent = i.name; $('version').textContent = ' Version ' + i.version + ', ' + i.name + (osName(i.platform) ? ' (' + osName(i.platform) + ')' : '') + '.';
    setFiles(i.files);
    window.api.netQuick().then(function (r) { state.net = r.network; });
  });
  window.__fileShare = { state: state, added: added, setFiles: setFiles, go: go, startFlow: startFlow };       /* handy for tests */
})();

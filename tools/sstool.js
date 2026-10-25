/* Second screen presenter: the control side. Talks to every open display window over a BroadcastChannel.
   Files never leave this browser; they are handed to the display window on this same computer. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var DISPLAY_URL = '/tools/second-screen-presenter/display/';
  var bc = new BroadcastChannel('ae-second-screen');

  var items = [], uid = 1, liveId = null, cueId = null, black = false;
  var opts = { fade: true, fit: 'contain', nextOnEnd: false, auto: false, autoSecs: 8, loop: false, volume: 1 };
  var displays = {}, vstat = null, autoTimer = null, popup = null, screenDetails = null, dragId = null;

  function send(o) { try { bc.postMessage(o); } catch (e) { msg('The display could not be reached. Open it again.', true); } }
  function msg(t, bad) { var m = $('ss-msg'); m.textContent = t || ''; m.classList.toggle('err', !!bad); }
  function fmt(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
  function idx(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return i; return -1; }

  /* ---------- link parsing ---------- */
  function ytId(u) { var m = String(u).match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
  function vimeoId(u) { var m = String(u).match(/vimeo\.com\/(?:video\/)?(\d+)/); return m ? m[1] : null; }
  function linkItem(raw) {
    var u = String(raw).trim(); if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    var url; try { url = new URL(u); } catch (e) { return null; }
    var path = url.pathname.toLowerCase(), y = ytId(u), v = vimeoId(u);
    if (y) return { kind: 'link', sub: 'youtube', url: u, name: 'YouTube video', thumb: 'https://i.ytimg.com/vi/' + y + '/mqdefault.jpg', playable: true };
    if (v) return { kind: 'link', sub: 'vimeo', url: u, name: 'Vimeo video', thumb: '', playable: true };
    if (/\.(jpe?g|png|gif|webp|avif|svg)$/.test(path)) return { kind: 'image', url: u, name: decodeURIComponent(path.split('/').pop()), thumb: u };
    if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return { kind: 'video', url: u, name: decodeURIComponent(path.split('/').pop()), thumb: '' };
    if (/docs\.google\.com\/presentation/.test(u)) return { kind: 'link', sub: 'slides', url: u, name: 'Google Slides', thumb: '' };
    return { kind: 'link', sub: 'web', url: u, name: url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 ? url.pathname : ''), thumb: '' };
  }

  /* ---------- adding items ---------- */
  function videoThumb(file) {
    return new Promise(function (res) {
      var v = document.createElement('video'), url = URL.createObjectURL(file), done = false;
      var finish = function (thumb, dur) { if (done) return; done = true; URL.revokeObjectURL(url); res({ thumb: thumb, dur: dur }); };
      v.muted = true; v.preload = 'metadata'; v.src = url;
      v.onloadedmetadata = function () { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = function () {
        try { var c = document.createElement('canvas'); c.width = 192; c.height = 108; var g = c.getContext('2d'); var s = Math.max(192 / v.videoWidth, 108 / v.videoHeight); g.drawImage(v, (192 - v.videoWidth * s) / 2, (108 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s); finish(c.toDataURL('image/jpeg', 0.7), v.duration); }
        catch (e) { finish('', v.duration); }
      };
      v.onerror = function () { finish(null, 0); };
      setTimeout(function () { finish('', v.duration || 0); }, 8000);
    });
  }
  function addFiles(list) {
    var files = [].slice.call(list || []), bad = 0;
    var jobs = files.map(function (f) {
      var isImg = /^image\//.test(f.type), isVid = /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name);
      if (!isImg && !isVid) { bad++; return Promise.resolve(); }
      var it = { id: 'i' + uid++, kind: isImg ? 'image' : 'video', file: f, name: f.name, thumb: '' };
      if (isImg) { it.thumbUrl = URL.createObjectURL(f); it.thumb = it.thumbUrl; items.push(it); return Promise.resolve(); }
      items.push(it); render();
      return videoThumb(f).then(function (r) {
        if (r.thumb === null) { items.splice(idx(it.id), 1); bad++; return; }
        it.thumb = r.thumb; it.dur = r.dur;
      });
    });
    Promise.all(jobs).then(function () {
      render();
      if (bad) msg(bad + (bad > 1 ? ' files were' : ' file was') + ' skipped. Use photos (JPG, PNG, WebP, GIF) or videos your browser can play (MP4 or WebM).', true);
      else if (files.length) msg(files.length + (files.length > 1 ? ' items added.' : ' item added.') + ' Your files stay on this computer.');
    });
  }
  function addLink() {
    var it = linkItem($('ss-url').value);
    if (!it) { msg('That does not look like a link. Paste the full address, for example https://youtu.be/...', true); return; }
    it.id = 'i' + uid++; items.push(it); $('ss-url').value = ''; render();
    msg(it.sub === 'web' ? 'Link added. Some websites refuse to be shown inside another page; if the screen stays blank, use Open page directly.' : 'Link added.');
  }
  function addText() {
    var t = $('ss-text').value.trim(); if (!t) { msg('Type the words for the slide first.', true); return; }
    items.push({ id: 'i' + uid++, kind: 'text', text: t, style: $('ss-tstyle').value, name: t.split('\n')[0].slice(0, 60) });
    $('ss-text').value = ''; render(); msg('Text slide added.');
  }

  /* ---------- the list ---------- */
  var KIND = { image: 'Photo', video: 'Video', text: 'Text', link: 'Link' };
  function label(it) { return it.kind === 'link' ? ({ youtube: 'YouTube', vimeo: 'Vimeo', slides: 'Slides', web: 'Web page' })[it.sub] : KIND[it.kind]; }
  function render() {
    var ol = $('ss-list');
    $('ss-empty').hidden = items.length > 0;
    ol.innerHTML = items.map(function (it, i) {
      var th = it.kind === 'text' ? '<span class="ss-th ss-tt ' + it.style + '">Aa</span>'
        : it.thumb ? '<span class="ss-th" style="background-image:url(\'' + esc(it.thumb) + '\')"></span>'
        : '<span class="ss-th ss-ti">' + label(it) + '</span>';
      return '<li class="ss-item' + (it.id === liveId ? ' live' : '') + (it.id === cueId ? ' cue' : '') + '" draggable="true" data-id="' + it.id + '">' +
        '<span class="ss-n">' + (i + 1) + '</span>' + th +
        '<span class="ss-meta"><b>' + esc(it.name) + '</b><small>' + label(it) + (it.dur ? ' &middot; ' + fmt(it.dur) : '') + (it.id === liveId ? ' &middot; <em>On screen</em>' : '') + '</small></span>' +
        '<span class="ss-acts"><button type="button" class="btn primary ss-go" data-act="go">' + (it.id === liveId ? 'Showing' : 'Show') + '</button>' +
        '<button type="button" class="ss-ic" data-act="up" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
        '<button type="button" class="ss-ic" data-act="down" aria-label="Move down"' + (i === items.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '<button type="button" class="ss-ic" data-act="del" aria-label="Remove">&times;</button></span></li>';
    }).join('');
    renderMonitor();
  }
  $('ss-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'), li = e.target.closest('.ss-item'); if (!li) return;
    var id = li.dataset.id, i = idx(id);
    if (!b) { cueId = id; render(); return; }
    var a = b.dataset.act;
    if (a === 'go') goLive(id);
    else if (a === 'up' && i > 0) { items.splice(i - 1, 0, items.splice(i, 1)[0]); render(); }
    else if (a === 'down' && i < items.length - 1) { items.splice(i + 1, 0, items.splice(i, 1)[0]); render(); }
    else if (a === 'del') {
      var it = items[i]; if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
      items.splice(i, 1); if (cueId === id) cueId = null; render();
    }
  });
  $('ss-list').addEventListener('dblclick', function (e) { var li = e.target.closest('.ss-item'); if (li && !e.target.closest('[data-act]')) goLive(li.dataset.id); });
  $('ss-list').addEventListener('dragstart', function (e) { var li = e.target.closest('.ss-item'); if (li) { dragId = li.dataset.id; e.dataTransfer.effectAllowed = 'move'; li.classList.add('drag'); } });
  $('ss-list').addEventListener('dragend', function () { dragId = null; render(); });
  $('ss-list').addEventListener('dragover', function (e) {
    if (!dragId) return; e.preventDefault();
    var li = e.target.closest('.ss-item'); if (!li || li.dataset.id === dragId) return;
    var from = idx(dragId), to = idx(li.dataset.id); if (from < 0 || to < 0) return;
    items.splice(to, 0, items.splice(from, 1)[0]); render();
    var d = $('ss-list').querySelector('[data-id="' + dragId + '"]'); if (d) d.classList.add('drag');
  });

  /* ---------- going live ---------- */
  function payload(it) {
    var o = { id: it.id, kind: it.kind, name: it.name };
    if (it.file) o.file = it.file; if (it.url) o.url = it.url; if (it.text) { o.text = it.text; o.style = it.style; }
    return o;
  }
  function liveOpts() { return { fade: opts.fade, fit: opts.fit, loop: opts.loop, volume: opts.volume }; }
  function goLive(id) {
    var it = get(id); if (!it) return;
    if (!Object.keys(liveDisplays()).length) msg('Open the display screen first, then press Show again.', true);
    liveId = id; cueId = id; vstat = null; black = false;
    send({ type: 'black', on: false });
    send({ type: 'show', item: payload(it), opts: liveOpts() });
    render(); armAuto();
  }
  function step(dir) {
    if (!items.length) return;
    var i = idx(liveId);
    var j = i < 0 ? (dir > 0 ? 0 : items.length - 1) : i + dir;
    if (j < 0 || j >= items.length) { msg(dir > 0 ? 'That was the last item.' : 'That is the first item.'); return; }
    goLive(items[j].id);
  }
  function armAuto() {
    clearTimeout(autoTimer); autoTimer = null;
    var it = get(liveId);
    if (opts.auto && it && (it.kind === 'image' || it.kind === 'text')) autoTimer = setTimeout(function () { if (idx(liveId) < items.length - 1) step(1); }, Math.max(2, opts.autoSecs) * 1000);
  }
  function setBlack(on) { black = on; send({ type: 'black', on: on }); $('ss-black').setAttribute('aria-pressed', on); $('ss-black').textContent = on ? 'Show again' : 'Black screen'; renderMonitor(); }

  /* ---------- monitor and media controls ---------- */
  var monVideo = null;
  function renderMonitor() {
    var it = get(liveId), mon = $('ss-mon');
    var playable = it && (it.kind === 'video' || (it.kind === 'link' && it.playable));
    $('ss-media').hidden = !playable;
    $('ss-black').disabled = !it;
    mon.classList.toggle('black', black);
    $('ss-now').textContent = it ? (black ? 'Black screen. ' : '') + 'Showing ' + (idx(liveId) + 1) + ' of ' + items.length + ': ' + it.name : '';
    if (!it) { if (monVideo) { monVideo.pause(); monVideo = null; } mon.innerHTML = '<span>Nothing on screen</span>'; mon.dataset.id = ''; $('ss-web').hidden = true; return; }
    if (mon.dataset.id === it.id) return;
    mon.dataset.id = it.id;
    if (monVideo) { monVideo.pause(); monVideo = null; }
    if (it.kind === 'image') mon.innerHTML = '<img alt="" src="' + esc(it.thumbUrl || it.url) + '">';
    else if (it.kind === 'video') {
      mon.innerHTML = ''; monVideo = document.createElement('video'); monVideo.muted = true; monVideo.playsInline = true;
      monVideo.src = it.file ? (it.monUrl || (it.monUrl = URL.createObjectURL(it.file))) : it.url; mon.appendChild(monVideo);
    } else if (it.kind === 'text') mon.innerHTML = '<div class="ss-mtxt ' + it.style + '">' + esc(it.text) + '</div>';
    else mon.innerHTML = (it.thumb ? '<img alt="" src="' + esc(it.thumb) + '">' : '') + '<span class="ss-mlink">' + esc(label(it)) + '<br><small>' + esc(it.url) + '</small></span>';
    $('ss-web').hidden = !(it.kind === 'link' && (it.sub === 'web' || it.sub === 'slides'));
  }
  function onStatus(s) {
    if (s.live !== liveId || s.t == null) return;
    vstat = s;
    $('ss-play').textContent = s.paused ? 'Play' : 'Pause';
    $('ss-time').textContent = fmt(s.t) + ' / ' + fmt(s.dur);
    var sk = $('ss-seek'); if (!sk.matches(':active')) { sk.max = Math.max(1, s.dur || 1); sk.value = s.t; }
    if (monVideo) {
      if (Math.abs(monVideo.currentTime - s.t) > 0.6) monVideo.currentTime = s.t;
      if (s.paused && !monVideo.paused) monVideo.pause(); else if (!s.paused && monVideo.paused) monVideo.play().catch(function () {});
    }
    if (s.ended && opts.nextOnEnd && !opts.loop) { var it = get(liveId); if (it && it._endedAt !== it.id + s.dur) { it._endedAt = it.id + s.dur; step(1); } }
  }
  $('ss-play').onclick = function () { send({ type: 'control', cmd: vstat && !vstat.paused ? 'pause' : 'play' }); if (!vstat) $('ss-play').textContent = 'Pause'; };
  $('ss-restart').onclick = function () { send({ type: 'control', cmd: 'restart' }); };
  $('ss-seek').addEventListener('input', function () { send({ type: 'control', cmd: 'seek', value: +this.value }); $('ss-time').textContent = fmt(+this.value) + ' / ' + fmt(+this.max); });
  $('ss-vol').addEventListener('input', function () { opts.volume = +this.value / 100; send({ type: 'control', cmd: 'volume', value: opts.volume }); });
  $('ss-loop').onchange = function () { opts.loop = this.checked; send({ type: 'control', cmd: 'loop', value: opts.loop }); };
  $('ss-web').onclick = function () {
    var it = get(liveId); if (!it || !it.url) return;
    var f = 'popup,width=1280,height=720', s = targetScreen();
    if (s) f = 'popup,left=' + s.availLeft + ',top=' + s.availTop + ',width=' + s.availWidth + ',height=' + s.availHeight;
    var w = window.open(it.url, 'ae_second_screen_web', f);
    msg(w ? 'The page opened in its own window on the display. Press F11 there for full screen, and close it when you are done.' : 'Your browser blocked the window. Allow pop-ups for this site and try again.', !w);
  };

  /* ---------- displays ---------- */
  function liveDisplays() { var o = {}, now = Date.now(); for (var k in displays) if (now - displays[k].last < 6000) o[k] = displays[k]; return o; }
  function renderStatus() {
    var d = liveDisplays(), n = Object.keys(d).length, any = n ? d[Object.keys(d)[0]] : null;
    $('ss-dot').className = 'ss-dot' + (n ? ' on' : '');
    $('ss-st').textContent = n ? (n > 1 ? n + ' display screens connected' : 'Display screen connected') : 'Display not open';
    var needs = Object.keys(d).some(function (k) { return d[k].needSound; });
    $('ss-st2').textContent = !n ? 'Connect your TV or projector, set it to extend your screen, then open the display.'
      : needs ? 'Click the display screen once so the browser allows sound.'
      : any.fs ? 'Full screen and ready.' : 'Click the display screen once to make it full screen.';
    $('ss-open').textContent = n ? 'Open another display' : 'Open display screen';
    $('ss-ident').hidden = !n;
  }
  bc.onmessage = function (e) {
    var m = e.data || {}; if (!m.id) return;
    if (m.type === 'hello') {
      displays[m.id] = { last: Date.now(), fs: false };
      var it = get(liveId);
      if (it) send({ type: 'show', to: m.id, item: payload(it), opts: liveOpts() });
      if (black) send({ type: 'black', to: m.id, on: true });
    } else if (m.type === 'bye') delete displays[m.id];
    else if (m.type === 'beat' || m.type === 'status') {
      var d = displays[m.id] || (displays[m.id] = {}); d.last = Date.now();
      if (m.fs != null) d.fs = m.fs;
      if (m.type === 'status') { d.needSound = m.needSound; onStatus(m); }
    }
    renderStatus();
  };
  setInterval(renderStatus, 2000);
  send({ type: 'ping' });

  /* ---------- opening the display on the extended screen ---------- */
  function targetScreen() {
    if (!screenDetails) return null;
    var sel = $('ss-screen'), list = screenDetails.screens;
    if (sel.value !== '' && list[+sel.value]) return list[+sel.value];
    for (var i = 0; i < list.length; i++) if (list[i] !== screenDetails.currentScreen) return list[i];
    return null;
  }
  function fillScreens() {
    if (!screenDetails) return;
    var list = screenDetails.screens, sel = $('ss-screen'), keep = sel.value;
    sel.innerHTML = list.map(function (s, i) { return '<option value="' + i + '">' + esc(s.label || ('Screen ' + (i + 1))) + ' (' + s.width + ' x ' + s.height + (s === screenDetails.currentScreen ? ', this screen' : '') + ')</option>'; }).join('');
    var t = targetScreen(); sel.value = keep !== '' && list[+keep] ? keep : String(list.indexOf(t) >= 0 ? list.indexOf(t) : 0);
    sel.hidden = list.length < 2; $('ss-move').hidden = list.length < 2;
    if (list.length < 2) msg('Only one screen was found. Connect your TV or projector and set it to extend (not mirror) your desktop.', true);
  }
  function loadScreens(prompt) {
    if (!('getScreenDetails' in window)) return Promise.resolve(null);
    var go = function () { return window.getScreenDetails().then(function (d) { screenDetails = d; d.addEventListener('screenschange', fillScreens); fillScreens(); return d; }); };
    if (prompt) return go().catch(function () { return null; });
    if (!navigator.permissions) return Promise.resolve(null);
    return navigator.permissions.query({ name: 'window-management' }).then(function (p) { return p.state === 'granted' ? go() : null; }).catch(function () { return null; });
  }
  function placePopup(w) {
    var s = targetScreen(); if (!w || w.closed || !s) return false;
    try { w.moveTo(s.availLeft, s.availTop); w.resizeTo(s.availWidth, s.availHeight); return true; } catch (e) { return false; }
  }
  $('ss-open').onclick = function () {
    var s = targetScreen();
    var feat = s ? 'popup,left=' + s.availLeft + ',top=' + s.availTop + ',width=' + s.availWidth + ',height=' + s.availHeight : 'popup,width=1280,height=720';
    var name = Object.keys(liveDisplays()).length ? 'ae_second_screen_' + Date.now() : 'ae_second_screen';
    popup = window.open(DISPLAY_URL, name, feat);
    if (!popup) { msg('Your browser blocked the display window. Allow pop-ups for this site, then press Open display screen again.', true); return; }
    if (s) { msg('The display opened on ' + (s.label || 'your second screen') + '. Click it once to make it full screen.'); return; }
    if ('getScreenDetails' in window) {
      msg('Allow this site to use your screens so the display can open on the TV or projector.');
      loadScreens(true).then(function (d) {
        if (d && placePopup(popup)) msg('The display moved to your second screen. Click it once to make it full screen.');
        else if (d && d.screens.length > 1) msg('Choose the screen and press Move to selected screen.');
        else msg('Drag the display window onto your TV or projector, then click it once to make it full screen.');
      });
    } else msg('Drag the display window onto your TV or projector, then click it once to make it full screen.');
  };
  $('ss-move').onclick = function () {
    if (popup && !popup.closed) msg(placePopup(popup) ? 'Moved. Click the display once to make it full screen.' : 'The display could not be moved. Drag it to the screen yourself.', false);
    else msg('Open the display screen first.', true);
  };
  $('ss-ident').onclick = function () { send({ type: 'identify' }); };
  loadScreens(false);

  /* ---------- inputs and options ---------- */
  $('ss-pick').onclick = function (e) { e.stopPropagation(); $('ss-file').click(); };
  $('ss-file').onchange = function () { addFiles(this.files); this.value = ''; };
  var drop = $('ss-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { if (dragId) return; e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  $('ss-addurl').onclick = addLink;
  $('ss-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });
  $('ss-addtext').onclick = addText;
  $('ss-prev').onclick = function () { step(-1); };
  $('ss-next').onclick = function () { step(1); };
  $('ss-black').onclick = function () { setBlack(!black); };
  $('ss-fade').onchange = function () { opts.fade = this.checked; };
  $('ss-fill').onchange = function () { opts.fit = this.checked ? 'cover' : 'contain'; send({ type: 'fit', value: opts.fit }); };
  $('ss-onend').onchange = function () { opts.nextOnEnd = this.checked; };
  $('ss-auto').onchange = function () { opts.auto = this.checked; armAuto(); };
  $('ss-secs').addEventListener('input', function () { opts.autoSecs = Math.max(2, +this.value || 8); armAuto(); });
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
    else if (e.key === ' ' && get(liveId) && !$('ss-media').hidden) { e.preventDefault(); $('ss-play').click(); }
    else if (e.key === 'b' || e.key === 'B' || e.key === '.') { if (get(liveId)) setBlack(!black); }
  });
  window.addEventListener('beforeunload', function (e) { if (items.length) { e.preventDefault(); e.returnValue = ''; } });

  if (!('BroadcastChannel' in window)) msg('This browser is too old for the presenter. Use a current Chrome, Edge or Firefox on a computer.', true);
  render(); renderStatus();
  window.__ss = { items: items, addFiles: addFiles, goLive: goLive, step: step, displays: displays, get liveId() { return liveId; }, get vstat() { return vstat; }, linkItem: linkItem };
})();

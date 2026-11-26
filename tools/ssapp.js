/* Presenter: library, service, preview and live, slides.
   Talks to the display and stage windows on this computer over a BroadcastChannel, sends cameras and screens to the display over a local WebRTC link,
   and talks to a phone remote over PeerJS. Files never leave this computer: they are handed to the display window directly. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var BASE = '/tools/second-screen-presenter/';
  var DESK = window.presenterDesktop || null; /* set when this page runs inside the Presenter desktop app */
  var bc = new BroadcastChannel('ae-second-screen');
  var opId = 'op' + Math.random().toString(36).slice(2, 9);

  var items = [], live2Id = null, live2Slide = 0, split = { on: false, side: 0, active: 0 }, songsOpen = true, uid = 1, selId = null, selSlide = 0, liveId = null, liveSlide = 0, black = false, logoOn = false, logoFile = null, stageMsg = '';
  var opts = { fade: true, fit: 'contain', nextOnEnd: false, auto: false, autoSecs: 8, loop: true, volume: 1, studio: false };
  var displays = {}, stages = {}, vstat = null, autoTimer = null, popup = null, screenDetails = null, dragId = null, editingSong = null, bbVer = 'kjv';
  var bibles = {}, bibleIndex = [], media = [], mFilter = 'all', songBg = null, autoRun = false, autoFired = {};
  var colBk = null, bbBook = null, bbCh = 0, bbVs = null, bbSel = [], bbLast = 0, bbFound = null, bbVers = [], bbCatalogue = null;
  var bset = { per: 4, look: 0 };
  var LOOKS = [
    { n: 'White on black', style: 'dark', color: null, sw: 'linear-gradient(135deg,#000 50%,#fff 50%)' },
    { n: 'Black on white', style: 'light', color: null, sw: 'linear-gradient(135deg,#fff 50%,#111 50%)' },
    { n: 'Navy and coral', style: 'coral', color: null, sw: 'linear-gradient(135deg,#14213d 50%,#e8453c 50%)' },
    { n: 'Yellow on black', style: 'dark', color: '#ffe14d', sw: 'linear-gradient(135deg,#000 50%,#ffe14d 50%)' },
    { n: 'Cyan on black', style: 'dark', color: '#7fe0ff', sw: 'linear-gradient(135deg,#000 50%,#7fe0ff 50%)' }
  ];
  var COLORS = [{ n: 'Default', c: '' }, { n: 'White', c: '#ffffff' }, { n: 'Black', c: '#111111' }, { n: 'Yellow', c: '#ffe14d' }, { n: 'Cyan', c: '#7fe0ff' }, { n: 'Coral', c: '#ff9d96' }];

  /* ------------------------------------------------------------------ helpers */
  function send(o) { try { bc.postMessage(o); } catch (e) { say('The display could not be reached. Open it again.', true); } }
  function say(t, bad) { var m = $('msg'); m.textContent = t || ''; m.classList.toggle('err', !!bad); if (t) toast(t, bad); }
  var toastT;
  function toast(t, bad) { var e = $('toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, bad ? 4600 : 2600); }
  function fmt(s) { s = Math.max(0, s || 0); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = Math.floor(s % 60); return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }
  function idx(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return i; return -1; }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function alive(map) { var o = {}, now = Date.now(); for (var k in map) if (now - map[k].last < 6000) o[k] = map[k]; return o; }
  /* grey completion text inside a search box: the typed letters stay invisible, the rest of the suggestion shows after them */
  function ghost(el, typed, rest) { if (el) el.innerHTML = rest ? '<i>' + esc(typed) + '</i>' + esc(rest) : ''; }
  function restOf(sug, typed) {
    var need = String(typed).toLowerCase().replace(/[^a-z0-9]/g, ''), k = 0, i = 0;
    if (!need) return null;
    for (; i < sug.length && k < need.length; i++) { var c = sug[i].toLowerCase(); if (!/[a-z0-9]/.test(c)) continue; if (c !== need[k]) return null; k++; }
    return k < need.length ? null : sug.slice(i);
  }
  function ic(n, cls) { return '<svg class="i' + (cls ? ' ' + cls : '') + '"><use href="#i-' + n + '"/></svg>'; }
  var KIND = { image: 'Photo', video: 'Video', pdf: 'PDF', bible: 'Scripture', song: 'Song', timer: 'Countdown', link: 'Link', camera: 'Camera', screen: 'Screen' };
  function label(it) { if (it.audio) return 'Audio'; return it.kind === 'link' ? ({ youtube: 'YouTube', vimeo: 'Vimeo', slides: 'Slides', web: 'Web page' })[it.sub] : KIND[it.kind]; }
  function firstLine(s) { s = String(s || '').split('\n')[0]; return s.length > 46 ? s.slice(0, 44) + '...' : s; }
  function section(l) { l = String(l || '').toLowerCase(); return /pre-?chorus/.test(l) ? 'prechorus' : /verse/.test(l) ? 'verse' : /chorus|refrain|hook/.test(l) ? 'chorus' : /bridge/.test(l) ? 'bridge' : /intro|outro|tag|ending|interlude|vamp/.test(l) ? 'intro' : 'other'; }
  /* only songs go live with one click; everything else needs a double click (or Go live) */
  function isSong(it) { return !!it && it.kind === 'song'; }
  function isMedia(it) { return !!it && !isSong(it) && it.kind !== 'bible' && it.kind !== 'timer'; }
  var lastClick = { k: '', t: 0 };
  function isDouble(k) { var n = Date.now(), d = lastClick.k === k && n - lastClick.t < 450; lastClick = { k: d ? '' : k, t: n }; return d; }
  function openDlg(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
  function closeDlg(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-close]'); if (c) { var d = c.closest('dialog'); if (d) closeDlg(d); return; }
    if (e.target.tagName === 'DIALOG') closeDlg(e.target);
  });
  function clock(at) { if (!at) return ''; var p = at.split(':'), h = +p[0], m = p[1]; return (h % 12 || 12) + ':' + m + (h < 12 ? ' am' : ' pm'); }
  function atMs(at) { var p = at.split(':'), d = new Date(); d.setHours(+p[0], +p[1], 0, 0); return d.getTime(); }

  /* popup menu (service items, preview options) */
  var menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function showMenu(x, y, entries) {
    closeMenu();
    var m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu');
    entries.forEach(function (en) {
      if (en.sep) { m.appendChild(document.createElement('hr')); return; }
      if (en.hdr) { var h = document.createElement('div'); h.className = 'ml'; h.textContent = en.hdr; m.appendChild(h); return; }
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.disabled = !!en.off;
      b.innerHTML = (en.icon ? ic(en.icon, 'sm') : '') + '<span>' + esc(en.label) + '</span>' + (en.check ? ic('check', 'ck') : '');
      b.onclick = function () { closeMenu(); en.fn(); };
      m.appendChild(b);
    });
    document.body.appendChild(m); menuEl = m;
    var w = m.offsetWidth, h2 = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(x, window.innerWidth - w - 6)) + 'px';
    m.style.top = Math.max(6, Math.min(y, window.innerHeight - h2 - 6)) + 'px';
  }
  function menuAt(btn, entries) { var r = btn.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, entries); }
  document.addEventListener('mousedown', function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('resize', closeMenu);

  /* ------------------------------------------------------------------ saved things (kept in this browser) */
  var idb = {
    db: null,
    open: function () {
      if (idb.db) return Promise.resolve(idb.db);
      return new Promise(function (res, rej) {
        if (!window.indexedDB) { rej(new Error('no idb')); return; }
        var r = indexedDB.open('ae-presenter', 2);
        r.onupgradeneeded = function () { ['bg', 'media', 'bibles'].forEach(function (n) { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); }); };
        r.onsuccess = function () { idb.db = r.result; res(idb.db); };
        r.onerror = function () { rej(r.error); };
      });
    },
    put: function (k, v, st) { st = st || 'bg'; return idb.open().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction(st, 'readwrite'); t.objectStore(st).put(v, k); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }).catch(function () {}); },
    get: function (k, st) { st = st || 'bg'; return idb.open().then(function (db) { return new Promise(function (res) { var r = db.transaction(st).objectStore(st).get(k); r.onsuccess = function () { res(r.result || null); }; r.onerror = function () { res(null); }; }); }).catch(function () { return null; }); },
    all: function (st) { return idb.open().then(function (db) { return new Promise(function (res) { var r = db.transaction(st).objectStore(st).getAll(); r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { res([]); }; }); }).catch(function () { return []; }); },
    del: function (k, st) { st = st || 'bg'; return idb.open().then(function (db) { return new Promise(function (res) { var t = db.transaction(st, 'readwrite'); t.objectStore(st).delete(k); t.oncomplete = res; t.onerror = res; }); }).catch(function () {}); }
  };

  /* ------------------------------------------------------------------ links */
  function ytId(u) { var m = String(u).match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : null; }
  function vimeoId(u) { var m = String(u).match(/vimeo\.com\/(?:video\/)?(\d+)/); return m ? m[1] : null; }
  function linkItem(raw) {
    var u = String(raw).trim(); if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    var url; try { url = new URL(u); } catch (e) { return null; }
    if (!/\./.test(url.hostname)) return null;
    var path = url.pathname.toLowerCase(), y = ytId(u), v = vimeoId(u);
    if (y) return { kind: 'link', sub: 'youtube', url: u, name: 'YouTube video', thumb: 'https://i.ytimg.com/vi/' + y + '/mqdefault.jpg', playable: true };
    if (v) return { kind: 'link', sub: 'vimeo', url: u, name: 'Vimeo video', thumb: '', playable: true };
    if (/\.(jpe?g|png|gif|webp|avif|svg)$/.test(path)) return { kind: 'image', url: u, name: decodeURIComponent(path.split('/').pop()), thumb: u };
    if (/\.(mp3|m4a|wav|oga|flac|aac)$/.test(path)) return { kind: 'video', audio: true, url: u, name: decodeURIComponent(path.split('/').pop()), thumb: '' };
    if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return { kind: 'video', url: u, name: decodeURIComponent(path.split('/').pop()), thumb: '' };
    if (/docs\.google\.com\/presentation/.test(u)) return { kind: 'link', sub: 'slides', url: u, name: 'Google Slides', thumb: '' };
    return { kind: 'link', sub: 'web', url: u, name: url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 ? url.pathname : ''), thumb: '' };
  }

  /* ------------------------------------------------------------------ media files, PDFs */
  function videoThumb(file) {
    return new Promise(function (res) {
      var v = document.createElement('video'), url = URL.createObjectURL(file), done = false;
      var finish = function (thumb, dur) { if (done) return; done = true; URL.revokeObjectURL(url); res({ thumb: thumb, dur: dur }); };
      v.muted = true; v.preload = 'metadata'; v.src = url;
      v.onloadedmetadata = function () { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
      v.onseeked = function () {
        try { var c = document.createElement('canvas'); c.width = 320; c.height = 180; var g = c.getContext('2d'); var s = Math.max(320 / v.videoWidth, 180 / v.videoHeight); g.drawImage(v, (320 - v.videoWidth * s) / 2, (180 - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s); finish(c.toDataURL('image/jpeg', 0.7), v.duration); }
        catch (e) { finish('', v.duration); }
      };
      v.onerror = function () { finish(null, 0); };
      setTimeout(function () { finish('', v.duration || 0); }, 8000);
    });
  }
  function verAtLeast(v, want) { var a = String(v || '0').split('.').map(Number); return a[0] > want[0] || (a[0] === want[0] && (a[1] || 0) >= want[1]); } /* the 1.1 desktop shell cannot serve audio files in place */
  function audioMeta(file) {
    return new Promise(function (res) {
      var a = new Audio(), url = URL.createObjectURL(file), done = false;
      var fin = function (thumb, dur) { if (done) return; done = true; URL.revokeObjectURL(url); res({ thumb: thumb, dur: dur }); };
      a.preload = 'metadata'; a.src = url;
      a.onloadedmetadata = function () { fin('', a.duration); };
      a.onerror = function () { fin(null, 0); };
      setTimeout(function () { fin('', a.duration || 0); }, 6000);
    });
  }
  function readPdf(file, rec) {
    say('Reading ' + file.name + '...');
    return import('/tools/vendor/pdfjs/pdf.min.mjs').then(function (pdfjs) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/tools/vendor/pdfjs/pdf.worker.min.mjs';
      return file.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: buf }).promise; });
    }).then(function (doc) {
      var total = Math.min(doc.numPages, 300), p = Promise.resolve();
      function page(n) {
        return doc.getPage(n).then(function (pg) {
          var v1 = pg.getViewport({ scale: 1 }), sc = Math.min(2.5, 1600 / v1.width), vp = pg.getViewport({ scale: sc });
          var c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
            return new Promise(function (res) {
              c.toBlob(function (blob) {
                var t = document.createElement('canvas'); t.width = 480; t.height = Math.round(480 * c.height / c.width); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
                rec.slides.push({ label: 'Page ' + n, img: blob, thumb: t.toDataURL('image/jpeg', 0.75), text: 'Page ' + n }); if (rec.slides.length === 1) { rec.thumb = rec.slides[0].thumb; renderMedia(); } res();
              }, 'image/jpeg', 0.88);
            });
          });
        });
      }
      for (var n = 1; n <= total; n++) (function (k) { p = p.then(function () { say('Reading ' + file.name + ': page ' + k + ' of ' + total); return page(k); }); })(n);
      return p.then(function () { if (doc.numPages > total) say('Only the first 300 pages were added.'); return rec; });
    });
  }

  /* ------------------------------------------------------------------ media library (photos, videos, PDFs and links, kept on this computer) */
  function mid() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function saveMedia(m) { if (m.loading) return; var r = {}; for (var k in m) if (k !== 'thumbUrl') r[k] = m[k]; idb.put(m.id, r, 'media'); }
  function findMedia(id) { for (var i = 0; i < media.length; i++) if (media[i].id === id) return media[i]; return null; }
  function addFiles(list) {
    var files = [].slice.call(list || []), bad = [], added = [], work = Promise.resolve();
    files.forEach(function (f) {
      work = work.then(function () {
        var n = f.name || '', isAud = /^audio\//.test(f.type) || /\.(mp3|m4a|wav|ogg|oga|opus|flac|aac|wma)$/i.test(n), isImg = /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif|bmp|svg|ico|tiff?|heic)$/i.test(n), isVid = /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv)$/i.test(n), isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(n);
        var keep = function (m) { media.push(m); added.push(m); saveMedia(m); renderMedia(); };
        if (isPdf) {
          /* the PDF shows in Media straight away and its pages fill in one by one */
          var rec = { id: mid(), kind: 'pdf', name: n, slides: [], thumb: '', added: Date.now(), loading: true };
          media.push(rec); added.push(rec); renderMedia();
          readPdf(f, rec).then(function () { delete rec.loading; saveMedia(rec); syncPdfItems(rec); renderMedia(); say(n + ': all ' + rec.slides.length + ' pages are ready.'); }).catch(function (e) {
            if (window.console) console.error(e); var k = media.indexOf(rec); if (k >= 0) media.splice(k, 1); if (mSel === rec.id) mSel = null; renderMedia(); say(n + ' could not be read as a PDF.', true);
          });
          return;
        }
        if (/\.(pptx?|key|odp|docx?)$/i.test(n)) { bad.push(n + ' is a presentation or document. Save it as a PDF first, then add the PDF.'); return; }
        if (!isImg && !isVid && !isAud) { bad.push(n + ' is not a photo, video, audio file or PDF.'); return; }
        var m = { id: mid(), kind: isImg ? 'image' : 'video', file: f, name: n, thumb: '', added: Date.now() };
        if (isAud && !isVid) m.audio = true; /* a song or sermon: plays through the app like a video, with the name on a plain screen */
        if (isImg) { m.thumbUrl = URL.createObjectURL(f); keep(m); return; }
        var vp = DESK && DESK.pathFor ? DESK.pathFor(f) : '';
        if (vp && (!m.audio || verAtLeast(DESK.version, [1, 2]))) { m.url = 'pmedia://f/' + encodeURIComponent(vp); m.path = vp; delete m.file; } /* played straight from its folder */
        keep(m); /* in Media at once; the picture and length fill in a moment later */
        (m.audio ? audioMeta(f) : videoThumb(f)).then(function (r) {
          if (r.thumb === null) { var k = media.indexOf(m); if (k >= 0) media.splice(k, 1); idb.del(m.id, 'media'); if (mSel === m.id) mSel = null; renderMedia(); say(n + ' is a video this browser cannot play. Try an MP4.', true); return; }
          m.thumb = r.thumb; m.dur = r.dur; saveMedia(m); renderMedia(); renderMDet();
        });
        return;
      });
    });
    return work.then(function () {
      if (added.length) { mSel = added[added.length - 1].id; $('m-addbox').hidden = true; }
      renderMedia();
      if (bad.length) say(bad[0] + (bad.length > 1 ? ' (and ' + (bad.length - 1) + ' more skipped)' : ''), true);
      else if (added.length) say(added.length + (added.length > 1 ? ' files added to Media.' : ' file added to Media.') + ' Double click one to show it now, or press Add to service. Your files stay where they are on this computer.');
      return added;
    });
  }
  function addLink() {
    var li = linkItem($('m-url').value);
    if (!li) { say('That does not look like a link. Paste the full address, for example https://youtu.be/...', true); return; }
    $('m-url').value = '';
    var m = { id: mid(), kind: li.kind, sub: li.sub, url: li.url, name: li.name, thumb: li.thumb || '', playable: li.playable, added: Date.now() };
    media.push(m); saveMedia(m); mSel = m.id; $('m-addbox').hidden = true; renderMedia();
    say('Link added to Media. Press Add to service below to put it in the service.' + (li.sub === 'web' ? ' Some websites refuse to be shown inside another page; for those, share the window from the Capture tab.' : ''));
  }
  function mediaToItem(m) {
    var it = { mediaId: m.id, kind: m.kind, name: m.name, thumb: m.thumb || '', style: 'dark' };
    if (m.audio) it.audio = true;
    if (m.kind === 'pdf') it.slides = m.slides.map(function (s) { return { label: s.label, img: s.img, thumb: s.thumb, text: s.text }; });
    else if (m.kind === 'link') { it.sub = m.sub; it.url = m.url; it.playable = m.playable; }
    else if (m.file) { it.file = m.file; it.dur = m.dur; if (m.kind === 'image') { it.thumbUrl = URL.createObjectURL(m.file); it.thumb = it.thumbUrl; } }
    else if (m.url) { it.url = m.url; if (m.kind === 'image') it.thumb = m.url; else it.dur = m.dur; }
    return it;
  }
  var mSel = null;
  function syncPdfItems(rec) { items.forEach(function (x) { if (x.mediaId === rec.id && x.kind === 'pdf') x.slides = rec.slides.map(function (s) { return { label: s.label, img: s.img, thumb: s.thumb, text: s.text }; }); }); renderSlides(); render(); }
  function addMedia(id) { var m = findMedia(id); if (m) addItem(mediaToItem(m), false); }
  function removeMedia(id) {
    var m = findMedia(id); if (!m) return;
    if (m.thumbUrl) URL.revokeObjectURL(m.thumbUrl);
    media.splice(media.indexOf(m), 1); idb.del(id, 'media'); renderMedia();
    say('Removed from Media. Anything already in the service stays there.');
  }
  function renderMedia() {
    var list = media.filter(function (m) { return mFilter === 'all' || (mFilter === 'audio' ? !!m.audio : mFilter === 'video' ? m.kind === 'video' && !m.audio : m.kind === mFilter); }).slice().reverse();
    var h = '<button type="button" class="mt add" data-act="add" aria-label="Add photos, videos or PDFs" title="Add photos, videos or PDFs">' + ic('plus') + '</button>';
    h += list.map(function (m) {
      var pic = m.kind === 'image' ? (m.thumbUrl || m.thumb || m.url) : m.thumb;
      var kind = m.audio ? 'Audio' : m.kind === 'link' ? ({ youtube: 'YouTube', vimeo: 'Vimeo', slides: 'Slides', web: 'Web' })[m.sub] : KIND[m.kind];
      return '<div class="mt' + (pic ? '' : ' fileic') + (m.id === mSel ? ' sel' : '') + '" role="button" aria-pressed="' + (m.id === mSel) + '" tabindex="0" data-id="' + m.id + '" title="' + esc(m.name) + '">' + (pic ? '<img alt="" src="' + esc(pic) + '">' : ic(m.audio ? 'music' : m.kind === 'video' ? 'film' : m.kind === 'link' ? 'link' : 'file')) +
        '<span class="k">' + esc(kind) + '</span><span class="nm">' + esc(m.name) + '</span><button type="button" class="rm" data-rm="' + m.id + '" aria-label="Remove ' + esc(m.name) + '">' + ic('x', 'sm') + '</button></div>';
    }).join('');
    $('m-grid').innerHTML = h;
    renderMDet();
  }
  function renderMDet() {
    var m = null, box = $('m-det'); /* taps now act straight away, so the details box is not used */
    if (!m) { mSel = null; box.hidden = true; box.innerHTML = ''; return; }
    var pic = m.kind === 'image' ? (m.thumbUrl || m.thumb || m.url) : m.thumb;
    var kind = m.kind === 'link' ? ({ youtube: 'YouTube link', vimeo: 'Vimeo link', slides: 'Google Slides link', web: 'Web link' })[m.sub] : ({ image: 'Photo', video: 'Video', pdf: 'PDF' })[m.kind] || m.kind;
    var extra = m.kind === 'pdf' && m.slides ? ', ' + m.slides.length + (m.loading ? ' pages so far, reading the rest...' : m.slides.length > 1 ? ' pages' : ' page') : m.kind === 'video' && m.dur ? ', ' + fmt(m.dur) : '';
    box.hidden = false;
    box.innerHTML = '<div class="mp"><div class="mpic">' + (pic ? '<img alt="" src="' + esc(pic) + '">' : ic(m.audio ? 'music' : m.kind === 'video' ? 'film' : m.kind === 'link' ? 'link' : 'file')) + '</div><div class="mi"><b>' + esc(m.name) + '</b><span class="help">' + esc(kind + extra) + '</span></div></div>' +
      '<div class="row wrap"><button class="b pri" type="button" data-m="add">Add to service</button><button class="b" type="button" data-m="show">Show now</button><button class="b" type="button" data-m="rm">Remove from Media</button></div>';
  }
  function pickMedia(t) {
    $('m-addbox').hidden = true;
    if (t === 'link') { $('m-linkrow').hidden = false; $('m-link').setAttribute('aria-pressed', 'true'); $('m-url').focus(); return; }
    $('m-file').accept = t === 'image' ? 'image/*' : t === 'video' ? 'video/*,.mov,.mkv,.avi,.wmv,.flv,.3gp,.m4v,.mpg,.mpeg,.ts' : t === 'audio' ? 'audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.opus,.wma' : t === 'pdf' ? 'application/pdf,.pdf' : 'image/*,video/*,audio/*,application/pdf,.pdf,.heic,.tif,.tiff,.bmp,.avif,.mov,.mkv,.avi,.wmv,.flv,.3gp,.m4v,.mpg,.mpeg,.ts';
    $('m-file').click();
  }
  function loadMedia() {
    return idb.all('media').then(function (rows) {
      rows.sort(function (a, b) { return (a.added || 0) - (b.added || 0); });
      rows.forEach(function (m) { if (m.kind === 'image' && m.file) m.thumbUrl = URL.createObjectURL(m.file); media.push(m); });
      renderMedia();
    });
  }

  function addItem(it, showNow, temp) {
    if (temp) it.temp = true; /* shown on the screen only, it is not listed in the service */
    it.id = 'i' + uid++; items.push(it);
    select(it.id, 0, false);
    render();
    if (showNow) goLive(it.id, 0); else say('"' + it.name + '" added to the service.');
    pruneTemp();
    if (!temp && $('app').dataset.view === 'lib' && window.innerWidth <= 900) { $('app').dataset.view = 'service'; syncMtabs(); }
    return it;
  }
  function pruneTemp() {
    for (var i = items.length - 1; i >= 0; i--) { var x = items[i]; if (x.temp && x.id !== liveId && x.id !== live2Id && x.id !== selId) items.splice(i, 1); }
  }

  /* ------------------------------------------------------------------ backgrounds */
  function effBg(it) {
    if (!it || it.bg === false) return null;
    if (it.bg) return it.bg;
    if (it.kind === 'song') return songBg || defaultBg();
    if (it.kind === 'bible') return bbBg.bg;
    return null;
  }
  /* the default song background is the logo (when one was chosen), otherwise plain black */
  function defaultBg() { return logoFile && logoFile.file ? { type: 'image', file: logoFile.file, name: 'Logo', thumb: logoFile.url || '', dflt: true } : null; }
  function bgSig(it) { var b = effBg(it); return (b ? b.type + ':' + (b.name || b.key || '') : '-') + ':' + (it && it.color || ''); }
  function mediaBgs() {
    return media.filter(function (x) { return (x.kind === 'image' && x.file) || (x.kind === 'video' && x.file && !x.audio); }).map(function (x) { return { type: x.kind, file: x.file, name: x.name, thumb: x.kind === 'image' ? (x.thumbUrl || '') : (x.thumb || '') }; });
  }
  function makePicker(box, onChange, noCam) {
    var p = { bg: null, onChange: onChange };
    function draw() {
      var t = p.bg ? p.bg.type : 'none';
      box.innerHTML = '<div class="seg" role="group" aria-label="Background">' + [['none', 'None'], ['image', 'Photo'], ['video', 'Video'], ['camera', 'Camera']].filter(function (x) { return !(noCam && x[0] === 'camera'); }).map(function (x) { return '<button type="button" data-bg="' + x[0] + '" aria-pressed="' + (t === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        (p.bg && p.bg.name ? '<span class="bgname">' + esc(p.bg.name) + '</span>' : '') +
        (t === 'camera' ? '<select aria-label="Which camera">' + capItems().map(function (c) { return '<option value="' + c.id + '"' + (p.bg && p.bg.srcId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>' : '');
    }
    p.set = function (bg) { p.bg = bg; draw(); };
    p.redraw = draw;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-bg]'); if (!b) return;
      var t = b.dataset.bg;
      if (t === 'none') { p.set(null); p.onChange && p.onChange(); return; }
      if (t === 'camera') {
        var c = capItems()[0];
        if (!c) { say('Start a camera first: open the Capture tab, press Find cameras, then Start.', true); return; }
        p.set({ type: 'camera', srcId: c.id, name: c.name, key: c.id }); p.onChange && p.onChange(); return;
      }
      pickBgFile(t, function (bg) { p.set(bg); p.onChange && p.onChange(); });
    });
    box.addEventListener('change', function (e) {
      if (e.target.tagName === 'SELECT' && p.bg && p.bg.type === 'camera') { var c = get(e.target.value); p.bg = { type: 'camera', srcId: c.id, name: c.name, key: c.id }; draw(); p.onChange && p.onChange(); }
    });
    draw();
    return p;
  }
  var bgCb = null;
  function pickBgFile(type, cb) { bgCb = cb; var f = $('bg-file'); f.accept = type === 'image' ? 'image/*' : 'video/*'; f.dataset.type = type; f.click(); }
  $('bg-file').onchange = function () {
    var f = this.files[0], type = this.dataset.type; this.value = ''; if (!f || !bgCb) return;
    var ok = type === 'image' ? /^image\//.test(f.type) : /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name);
    if (!ok) { say('Choose a ' + (type === 'image' ? 'photo' : 'video') + ' file.', true); return; }
    var cb = bgCb;
    if (type === 'image') { cb({ type: 'image', file: f, name: f.name, thumb: URL.createObjectURL(f) }); }
    else videoThumb(f).then(function (r) { if (r.thumb === null) { say('That video could not be played here. Try an MP4.', true); return; } cb({ type: 'video', file: f, name: f.name, thumb: r.thumb }); });
  };
  function cloneBg(bg) { return bg ? { type: bg.type, file: bg.file, name: bg.name, thumb: bg.thumb, srcId: bg.srcId, key: bg.key } : null; }

  /* one background for every song, and one for scripture */
  var bbBgBox = document.createElement('div'); bbBgBox.className = 'bgpick';
  var bbBg = makePicker(bbBgBox, function () {
    if (bbBg.bg && bbBg.bg.file) idb.put('scripture-bg', { file: bbBg.bg.file, type: bbBg.bg.type, name: bbBg.bg.name, thumb: bbBg.bg.type === 'video' ? bbBg.bg.thumb : '' }); else idb.del('scripture-bg');
    bgChanged();
  }, true);
  function drawSongBg() {
    var p = $('sbg-prev');
    if (!songBg) p.innerHTML = '<span>No background. Songs show on a plain colour.</span>';
    else if (songBg.type === 'image' || songBg.thumb) p.innerHTML = '<img alt="" src="' + esc(songBg.thumb) + '">';
    else p.innerHTML = '<span>' + esc(songBg.name || 'Video') + '</span>';
    $('song-bg').classList.toggle('on', !!songBg);
    drawSongGal();
  }
  /* every picture and moving background that is in the app, shown in a grid: tap one to use it behind all songs */
  function drawSongGal() {
    var gal = mediaBgs(), box = $('sbg-gal'); if (!box) return;
    $('sbg-gl').hidden = !gal.length;
    box.innerHTML = gal.map(function (x, i) { return '<button type="button" data-gal="' + i + '" aria-pressed="' + !!(songBg && songBg.name === x.name) + '" title="' + esc(x.name) + '">' + (x.thumb ? '<img alt="" src="' + esc(x.thumb) + '">' : '<span>' + esc(x.name) + '</span>') + '</button>'; }).join('');
    box.onclick = function (e) { var b = e.target.closest('[data-gal]'); if (b) setSongBg(gal[+b.dataset.gal]); };
  }
  function setSongBg(bg) {
    songBg = bg; drawSongBg();
    if (bg && bg.file) idb.put('song-bg', { file: bg.file, type: bg.type, name: bg.name, thumb: bg.type === 'video' ? bg.thumb : '' }); else idb.del('song-bg');
    bgChanged();
  }
  function bgChanged() {
    preKey = ''; liveKey = ''; renderSlides(); renderMonitors();
    var it = get(liveId); if (it && it.slides && !logoOn && !black) { ensureStream(needKey(it)); send({ type: 'show', item: payload(it, liveSlide), opts: { fade: false, fit: opts.fit } }); }
    mirrorSoon();
  }
  $('song-bg').onclick = function () { drawSongBg(); openDlg($('dlg-sbg')); };
  $('sbg-img').onclick = function () { pickBgFile('image', setSongBg); };
  $('sbg-vid').onclick = function () { pickBgFile('video', setSongBg); };
  $('sbg-none').onclick = function () { setSongBg(null); };
  /* ------------------------------------------------------------------ Bible */
  var BOOKS = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
    'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'];
  var CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];
  var ALIAS = { jn: 'John', jhn: 'John', ps: 'Psalms', psa: 'Psalms', psalm: 'Psalms', pss: 'Psalms', sos: 'Song of Solomon', song: 'Song of Solomon', songofsongs: 'Song of Solomon', canticles: 'Song of Solomon', phil: 'Philippians', php: 'Philippians', phm: 'Philemon', philem: 'Philemon', jud: 'Jude', judg: 'Judges', jdg: 'Judges', jas: 'James', jam: 'James', ezr: 'Ezra', eze: 'Ezekiel', ezk: 'Ezekiel', mt: 'Matthew', mk: 'Mark', mr: 'Mark', lk: 'Luke', rom: 'Romans', rm: 'Romans', gn: 'Genesis', ex: 'Exodus', lv: 'Leviticus', nu: 'Numbers', nm: 'Numbers', dt: 'Deuteronomy', jos: 'Joshua', josh: 'Joshua', jg: 'Judges', ru: 'Ruth', est: 'Esther', jb: 'Job', pr: 'Proverbs', prov: 'Proverbs', ecc: 'Ecclesiastes', eccl: 'Ecclesiastes', qoh: 'Ecclesiastes', is: 'Isaiah', isa: 'Isaiah', jer: 'Jeremiah', la: 'Lamentations', lam: 'Lamentations', dn: 'Daniel', dan: 'Daniel', ho: 'Hosea', jl: 'Joel', am: 'Amos', ob: 'Obadiah', jon: 'Jonah', mic: 'Micah', na: 'Nahum', hab: 'Habakkuk', zep: 'Zephaniah', zeph: 'Zephaniah', hag: 'Haggai', zec: 'Zechariah', zech: 'Zechariah', mal: 'Malachi', ac: 'Acts', gal: 'Galatians', ga: 'Galatians', eph: 'Ephesians', col: 'Colossians', tit: 'Titus', heb: 'Hebrews', rev: 'Revelation', re: 'Revelation', revelations: 'Revelation' };
  var NORM = BOOKS.map(function (b) { return b.toLowerCase().replace(/[^a-z0-9]/g, ''); });
  function normFrag(s) { return s.toLowerCase().replace(/^\s*(first|1st|i)\s+/, '1').replace(/^\s*(second|2nd|ii)\s+/, '2').replace(/^\s*(third|3rd|iii)\s+/, '3').replace(/[^a-z0-9]/g, ''); }
  function findBook(s) {
    var n = normFrag(s);
    if (!n) return -1;
    var num = n.match(/^[123]/) ? n[0] : '', rest = num ? n.slice(1) : n;
    if (ALIAS[rest]) { var nm = (num ? num + ' ' : '') + ALIAS[rest]; var k = BOOKS.indexOf(nm); if (k >= 0) return k; }
    var exact = NORM.indexOf(n); if (exact >= 0) return exact;
    for (var i = 0; i < NORM.length; i++) if (NORM[i].indexOf(n) === 0) return i;
    return -1;
  }
  function exactBook(s) {
    var n = normFrag(s); if (!n) return -1;
    var num = n.match(/^[123]/) ? n[0] : '', rest = num ? n.slice(1) : n;
    if (ALIAS[rest]) { var k = BOOKS.indexOf((num ? num + ' ' : '') + ALIAS[rest]); if (k >= 0) return k; }
    return NORM.indexOf(n);
  }
  function matchBooks(frag) {
    var n = normFrag(frag), out = [];
    if (!n) return out;
    for (var i = 0; i < NORM.length; i++) if (NORM[i].indexOf(n) === 0) out.push(i);
    var num = n.match(/^[123]/) ? n[0] : '', rest = num ? n.slice(1) : n;
    if (rest) for (var a in ALIAS) if (a.indexOf(rest) === 0) { var k = BOOKS.indexOf((num ? num + ' ' : '') + ALIAS[a]); if (k >= 0 && out.indexOf(k) < 0) out.push(k); }
    out.sort(function (x, y) { return x - y; });
    return out;
  }
  function parseRef(raw) {
    var m = String(raw).trim().match(/^((?:[123]|first|second|third|i{1,3})?\s*[a-z][a-z .]*?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-\u2013]\s*(\d+))?)?\s*$/i);
    if (!m) return null;
    var b = findBook(m[1]); if (b < 0) return null;
    return { book: b, ch: +m[2], v1: m[3] ? +m[3] : null, v2: m[4] ? +m[4] : (m[3] ? +m[3] : null) };
  }
  /* "john chapter 3 verse 16", "first corinthians 13", "psalm twenty three" and similar, as the browser writes them */
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  function spokenToRef(t) {
    var s = ' ' + String(t).toLowerCase().replace(/[.,]/g, ' ').replace(/\bst\b/g, '') + ' ';
    s = s.replace(/\b(1st|first)\b/g, ' 1 ').replace(/\b(2nd|second)\b/g, ' 2 ').replace(/\b(3rd|third)\b/g, ' 3 ');
    s = s.replace(/\bchapter\b/g, ' ').replace(/\bverses?\b/g, ' : ').replace(/\bcolon\b/g, ' : ').replace(/\b(to|through|thru|until)\b/g, ' - ');
    s = s.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g, function (m, a, b) { return String(NUMW[a] + NUMW[b]); });
    s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, function (m) { return String(NUMW[m]); });
    s = s.replace(/\s+/g, ' ').trim();
    var m = s.match(/^(.*?[a-z])\s*(\d+)\s*(?::\s*)?(\d+)?(?:\s*-\s*(\d+))?$/);
    if (!m) return s;
    return m[1] + ' ' + m[2] + (m[3] ? ':' + m[3] + (m[4] ? '-' + m[4] : '') : '');
  }

  var USFM = '1 GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ').slice(1);
  var VER_MAX = 12, API = 'https://bible.helloao.org';
  function setMsg(t) { $('bb-msg').textContent = t || ''; }
  function loadBible(id) {
    if (bibles[id]) return Promise.resolve(bibles[id]);
    var local = bibleIndex.some(function (b) { return b.id === id; }), p;
    if (local) {
      setMsg('Loading the Bible text (about 1 MB, first time only)...');
      p = fetch('/tools/vendor/bible/' + id + '.json').then(function (r) { if (!r.ok) throw new Error('load'); return r.json(); });
    } else p = idb.get('bible:' + id, 'bibles').then(function (d) { if (!d) throw new Error('missing'); return d; });
    return p.then(function (d) { bibles[id] = d; setMsg(''); return d; });
  }
  function range(a, b) { var o = []; for (var i = a; i <= b; i++) o.push(i); return o; }
  function refRanges(nums) {
    var out = [], a = nums[0], b = a;
    for (var i = 1; i < nums.length; i++) { if (nums[i] === b + 1) b = nums[i]; else { out.push(a === b ? String(a) : a + '-' + b); a = b = nums[i]; } }
    out.push(a === b ? String(a) : a + '-' + b);
    return out.join(', ');
  }
  function refText(f) { return BOOKS[f.book] + ' ' + f.ch + ':' + refRanges(f.verses.map(function (v) { return v.n; })); }
  function clearPassage() { bbBook = null; bbVs = null; bbSel = []; bbFound = null; $('bb-vsw').hidden = true; bbPreview(); renderCols(); }
  function updateFound() {
    var nums = bbSel.slice().sort(function (a, b) { return a - b; });
    bbFound = nums.length && bbVs ? { book: bbBook, ch: bbCh, verses: nums.map(function (n) { return { n: n, t: bbVs[n - 1] }; }), tr: (bibles[bbVer] || {}).abbr || bbVer.toUpperCase() } : null;
    renderVerses(); bbPreview(); renderCols();
    setMsg(bbFound ? '' : bbBook != null ? 'Tap one verse, or tap several to show them together. Hold Shift to pick a range.' : '');
  }
  function renderVerses() {
    if (bbBook == null || !bbVs) { $('bb-vsw').hidden = true; return; }
    $('bb-vsw').hidden = false;
    var h = '', set = {}; bbSel.forEach(function (n) { set[n] = true; });
    for (var v = 1; v <= bbVs.length; v++) h += '<button type="button" data-v="' + v + '" aria-pressed="' + (!!set[v]) + '" aria-label="' + esc(BOOKS[bbBook]) + ' ' + bbCh + ' verse ' + v + '">' + v + '</button>';
    $('bb-vs').innerHTML = h;
    $('bb-all').textContent = bbSel.length === bbVs.length ? 'None' : 'All';
  }
  function bibleFind(all) {
    var r = parseRef($('bb-ref').value);
    if (!r) { setMsg('Type a book and chapter, for example John 3:16-18, Psalm 23 or 1 Cor 13.'); clearPassage(); return Promise.resolve(); }
    return loadBible(bbVer).then(function (d) {
      var chs = d.books[r.book] || [], vs = chs[r.ch - 1];
      if (!vs || !vs.length) { setMsg(chs.length ? BOOKS[r.book] + ' has ' + chs.length + ' chapters.' : BOOKS[r.book] + ' is not in this version.'); clearPassage(); return; }
      if (r.v1 && r.v1 > vs.length) { setMsg(BOOKS[r.book] + ' ' + r.ch + ' has ' + vs.length + ' verses.'); clearPassage(); return; }
      bbBook = r.book; bbCh = r.ch; bbVs = vs; colBk = r.book; vwCenter = true;
      if (r.v1) bbSel = range(r.v1, Math.max(r.v1, Math.min(r.v2 || r.v1, vs.length)));
      else bbSel = all === false ? [] : range(1, vs.length);
      bbLast = bbSel[0] || 0;
      $('bb-sug').innerHTML = ''; $('bb-ch').innerHTML = ''; $('bb-chw').hidden = true;
      updateFound();
    }).catch(function (er) { if (window.console) console.error('Bible', er); setMsg('The Bible text could not be loaded. Check your connection and try again.'); });
  }
  function bbPreview() {
    var box = $('bb-prev'); $('bb-add').disabled = $('bb-show').disabled = !bbFound;
    if (!bbFound) { box.innerHTML = ''; return; }
    box.innerHTML = '<b>' + esc(refText(bbFound)) + ' (' + esc(bbFound.tr) + ')</b>' + bbFound.verses.map(function (v) { return '<p><sup>' + v.n + '</sup> ' + esc(v.t) + '</p>'; }).join('');
  }
  function bibleItem(f) {
    f = f || bbFound; var per = bset.per || 1, look = LOOKS[bset.look] || LOOKS[0], slides = [];
    for (var i = 0; i < f.verses.length; i += per) {
      var chunk = f.verses.slice(i, i + per), nums = chunk.map(function (v) { return v.n; });
      slides.push({ label: 'Verse ' + refRanges(nums), text: chunk.map(function (v) { return (chunk.length > 1 ? v.n + ' ' : '') + v.t; }).join(' '), ref: BOOKS[f.book] + ' ' + f.ch + ':' + refRanges(nums) + ' (' + f.tr + ')' });
    }
    var it = { kind: 'bible', name: refText(f) + ' ' + f.tr, slides: slides, style: look.style };
    if (look.color) it.color = look.color;
    return it;
  }
  /* look up a typed or spoken passage without touching the screen (used by the phone) */
  function lookupRef(raw, ver) {
    var r = parseRef(spokenToRef(raw)) || parseRef(raw); if (!r) return Promise.resolve(null);
    return loadBible(ver || bbVer).then(function (d) {
      var vs = (d.books[r.book] || [])[r.ch - 1]; if (!vs || !vs.length) return null;
      var a = r.v1 || 1, b = Math.min(r.v2 || vs.length, vs.length); if (a > vs.length) return null;
      return { book: r.book, ch: r.ch, verses: range(a, Math.max(a, b)).map(function (n) { return { n: n, t: vs[n - 1] }; }), tr: d.abbr };
    }).catch(function () { return null; });
  }
  /* the phone asks for a whole chapter (with the asked verses marked) or a word search, and gets the text back to read first */
  function chapterLookup(raw, ver) {
    var r = parseRef(spokenToRef(raw)) || parseRef(raw); if (!r) return Promise.resolve(null);
    return loadBible(ver || bbVer).then(function (d) {
      var vs = (d.books[r.book] || [])[r.ch - 1]; if (!vs || !vs.length) return null;
      var a = r.v1 || 0; if (a > vs.length) return null;
      return { book: r.book, ch: r.ch, tr: d.abbr, vs: vs, a: a, b: a ? Math.max(a, Math.min(r.v2 || a, vs.length)) : 0 };
    }).catch(function () { return null; });
  }
  function searchVerses(q, ver) {
    q = q.toLowerCase();
    return loadBible(ver || bbVer).then(function (d) {
      var out = [];
      for (var b = 0; b < d.books.length && out.length < 40; b++) for (var c = 0; c < d.books[b].length && out.length < 40; c++) for (var v = 0; v < d.books[b][c].length; v++) {
        var t = d.books[b][c][v]; if (t.toLowerCase().indexOf(q) >= 0) { out.push({ r: BOOKS[b] + ' ' + (c + 1) + ':' + (v + 1), t: t.length > 200 ? t.slice(0, 200) + '...' : t }); if (out.length >= 40) break; }
      }
      return { tr: d.abbr, list: out };
    }).catch(function () { return { tr: '', list: [] }; });
  }
  function bibleSearch() {
    var q = $('bb-q').value.trim().toLowerCase(), box = $('bb-res'); if (q.length < 3) { box.innerHTML = '<p class="help">Type at least 3 letters.</p>'; return; }
    $('bb-qmsg').textContent = 'Searching ' + ((bibles[bbVer] || {}).abbr || bbVer.toUpperCase()) + '...';
    loadBible(bbVer).then(function (d) {
      var out = [];
      for (var b = 0; b < d.books.length && out.length < 60; b++) for (var c = 0; c < d.books[b].length && out.length < 60; c++) for (var v = 0; v < d.books[b][c].length; v++) {
        var t = d.books[b][c][v]; if (t.toLowerCase().indexOf(q) >= 0) { out.push({ r: BOOKS[b] + ' ' + (c + 1) + ':' + (v + 1), t: t }); if (out.length >= 60) break; }
      }
      $('bb-qmsg').textContent = out.length ? 'Tap a result to open it.' : 'Nothing found.';
      box.innerHTML = out.length ? out.map(function (o) { return '<button type="button" class="hit" data-ref="' + esc(o.r) + '"><b>' + esc(o.r) + '</b> ' + esc(o.t.length > 140 ? o.t.slice(0, 140) + '...' : o.t) + '</button>'; }).join('') + (out.length >= 60 ? '<p class="help">Showing the first 60 matches.</p>' : '') : '';
    });
  }
  /* as you type: book names, then chapters */
  function refHints0() {
    var v = $('bb-ref').value, sug = $('bb-sug'), chs = $('bb-ch');
    var m = v.match(/^\s*((?:[123]|first|second|third|1st|2nd|3rd|i{1,3})?\s*[a-z][a-z .]*?)\s*(\d.*)?$/i);
    sug.innerHTML = ''; chs.innerHTML = ''; $('bb-chw').hidden = true;
    $('bb-ref').setAttribute('aria-expanded', 'false');
    if (!m || !m[1].trim()) return;
    if (m[2]) return;
    var ex = exactBook(m[1]), list = matchBooks(m[1]);
    if (ex >= 0 && (/\s$/.test(v) || normFrag(m[1]) === NORM[ex])) {
      var n = CHAPTERS[ex], h = '';
      for (var c = 1; c <= n; c++) h += '<button type="button" data-ch="' + c + '" data-bk="' + ex + '" aria-label="' + esc(BOOKS[ex]) + ' chapter ' + c + '">' + c + '</button>';
      chs.innerHTML = h; $('bb-chw').hidden = false; return;
    }
    if (list.length) { sug.innerHTML = list.slice(0, 14).map(function (i) { return '<button type="button" role="option" data-bk="' + i + '">' + esc(BOOKS[i]) + '</button>'; }).join(''); $('bb-ref').setAttribute('aria-expanded', 'true'); }
    else sug.innerHTML = '<span class="help">No book starts with that.</span>';
  }
  function refGhost() {
    var inp = $('bb-ref'), v = inp.value, rest = '';
    if (v && !/\s$/.test(v) && v.indexOf(':') < 0) {
      var mc = v.match(/^\s*(.*?[a-z.])\s*(\d+)\s*$/i);
      if (mc) { if (findBook(mc[1]) >= 0) rest = ':'; }
      else if (/^\s*(?:[123]\s*)?[a-z][a-z .]*$/i.test(v)) { var bl = matchBooks(v.trim()); if (bl.length) rest = restOf(BOOKS[bl[0]], v.trim()) || ''; }
    }
    ghost($('bb-ghost'), v, rest);
    return rest;
  }
  function refHints() {
    refHints0();
    var m = $('bb-ref').value.match(/^\s*((?:[123]|first|second|third)?\s*[a-z][a-z .]*?)\s*\d*\s*(?::.*)?$/i);
    if (m) { var ex = exactBook(m[1]); if (ex >= 0) colBk = ex; }
    renderCols(); refGhost();
  }
  function setVersion(id) {
    bbVer = id; store('ae_ss_tr', id); renderVers();
    if (bbBook == null) return;
    loadBible(id).then(function (d) {
      var vs = (d.books[bbBook] || [])[bbCh - 1];
      if (!vs || !vs.length) { setMsg(BOOKS[bbBook] + ' ' + bbCh + ' is not in ' + d.abbr + '.'); clearPassage(); return; }
      bbVs = vs; bbSel = bbSel.filter(function (n) { return n <= vs.length; }); vwCenter = true; updateFound();
    }).catch(function () { setMsg('That version could not be opened.'); });
  }
  var listening = null;
  function voiceSearch() {
    if (listening) { listening.stop(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('This computer cannot use a microphone here. Type the passage instead.', true); return; }
    if (typeof vl !== 'undefined' && vl.on) { say('Press Stop on Listen first, then use the microphone to search.', true); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, channelCount: 1 } }).then(function (st) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(st), proc = ctx.createScriptProcessor(4096, 1, 1);
      var chunks = [], len = 0, spoke = false, quiet = 0, t0 = Date.now(), done = false, rate = ctx.sampleRate;
      $('bb-mic').classList.add('on'); setMsg('Listening... say a passage, for example "John 3 16".');
      function finish() {
        if (done) return; done = true; listening = null;
        try { proc.disconnect(); st.getTracks().forEach(function (t) { t.stop(); }); ctx.close(); } catch (e) { /* closed */ }
        $('bb-mic').classList.remove('on');
        if (!spoke) { setMsg('I did not hear anything. Try again.'); return; }
        setMsg(vl.loaded ? 'Working out what you said...' : 'Getting the listener ready (first time only)...');
        var audio = down16(chunks, len, rate); ensureWorker(); vl.busy = true;
        vl.cb = function (text) {
          vl.busy = false;
          if (text == null) { setMsg('Voice search did not work. Type the passage instead.', true); return; }
          var heardT = String(text).trim(), pick = null, c = [heardT].concat(findRefs(heardT));
          for (var k = 0; k < c.length && !pick; k++) { var ref = k === 0 ? spokenToRef(c[k]) : c[k]; if (ref && parseRef(ref)) pick = ref; }
          if (!pick) { setMsg('Heard "' + heardT + '" but could not find that passage. Try again.'); return; }
          $('bb-ref').value = pick; refHints();
          bibleFind().then(function () { if (bbFound) { addItem(bibleItem(), false); setMsg('Heard: "' + heardT + '"'); } else setMsg('Heard "' + heardT + '" but could not find that passage. Try again.'); });
        };
        vl.worker.postMessage({ type: 'run', audio: audio, language: 'en' });
      }
      listening = { stop: finish };
      proc.onaudioprocess = function (e) {
        if (done) return;
        var d = e.inputBuffer.getChannelData(0), sum = 0, i; for (i = 0; i < d.length; i++) sum += d[i] * d[i];
        chunks.push(new Float32Array(d)); len += d.length;
        if (Math.sqrt(sum / d.length) > 0.012) { spoke = true; quiet = 0; } else if (spoke) { quiet += d.length / rate; if (quiet > 1.2) finish(); }
        if (Date.now() - t0 > 9000) finish();
      };
      src.connect(proc); proc.connect(ctx.destination);
    }).catch(function () { say('Allow the microphone, then try again.', true); });
  }

  /* Bible versions: the bar at the bottom holds up to six; the plus button searches a free catalogue */
  function renderVers() {
    $('bb-vbar').innerHTML = bbVers.map(function (v) {
      return '<span class="vb"><button type="button" class="v" data-ver="' + esc(v.id) + '" aria-pressed="' + (v.id === bbVer) + '" title="' + esc(v.name) + '">' + esc(v.abbr) + '</button>' +
        (bbVers.length > 1 ? '<button type="button" class="vx" data-rmver="' + esc(v.id) + '" aria-label="Remove ' + esc(v.abbr) + ' from the bar">&times;</button>' : '') + '</span>';
    }).join('') + '<button type="button" class="ib" id="bb-addver" title="Add a Bible version" aria-label="Add a Bible version">' + ic('plus') + '</button>';
  }
  function saveVers() { store('ae_ss_vers', bbVers); }
  function convertBible(src, meta) {
    var out = { id: meta.id, abbr: meta.abbr, name: meta.name, books: USFM.map(function () { return []; }) }, total = 0;
    var piece = function (p) { return typeof p === 'string' ? p : (p && p.text) || ''; };
    (src.books || []).forEach(function (bk) {
      var bi = USFM.indexOf(String(bk.id || '').toUpperCase()); if (bi < 0) return;
      var chs = out.books[bi];
      (bk.chapters || []).forEach(function (c) {
        var ch = c.chapter || c, n = ch.number || (chs.length + 1), vs = [];
        (ch.content || []).forEach(function (x) {
          if (!x || x.type !== 'verse' || !x.number) return;
          var t = Array.isArray(x.text) ? x.text.map(piece).join(' ') : x.text != null ? x.text : Array.isArray(x.content) ? x.content.map(piece).join(' ') : '';
          vs[x.number - 1] = String(t).replace(/\s+/g, ' ').trim(); total++;
        });
        for (var i = 0; i < vs.length; i++) if (vs[i] == null) vs[i] = '';
        chs[n - 1] = vs;
      });
      for (var j = 0; j < chs.length; j++) if (!chs[j]) chs[j] = [];
    });
    if (!total) throw new Error('empty');
    return out;
  }
  function loadCatalogue() {
    if (bbCatalogue) return Promise.resolve(bbCatalogue);
    return fetch(API + '/api/available_translations.json').then(function (r) { if (!r.ok) throw new Error('catalogue'); return r.json(); }).then(function (d) {
      var arr = Array.isArray(d) ? d : d.translations || [];
      bbCatalogue = arr.filter(function (t) { return t.simpleCompleteTranslationApiLink; }).map(function (t) {
        var lic = t.license || {};
        return { id: t.id, name: t.name || t.englishName || t.id, en: t.englishName || '', abbr: t.shortName || t.id, lang: t.languageEnglishName || t.languageName || t.language || '', langName: t.languageName || '', pd: !!lic.publicDomain, credit: lic.attribution === 'required', url: t.licenseUrl || '', link: t.simpleCompleteTranslationApiLink, n: t.totalNumberOfVerses || 0, rtl: t.textDirection === 'rtl' };
      });
      return bbCatalogue;
    });
  }
  function renderVerList() {
    var q = $('ver-q').value.trim().toLowerCase(), box = $('ver-list');
    if (!bbCatalogue) return;
    var have = {}; bbVers.forEach(function (v) { have[v.id] = true; });
    var list = bbCatalogue.filter(function (t) { return !q || (t.name + ' ' + t.en + ' ' + t.abbr + ' ' + t.id + ' ' + t.lang + ' ' + t.langName).toLowerCase().indexOf(q) >= 0; });
    if (!q) list.sort(function (a, b) { return (b.lang === 'English') - (a.lang === 'English') || a.name.localeCompare(b.name); });
    var more = list.length > 80; list = list.slice(0, 80);
    $('ver-msg').textContent = bbVers.length >= VER_MAX ? 'Your bar is full (' + VER_MAX + ' versions). Remove one with the x on it, then add another.' : (q ? list.length + (more ? '+' : '') + ' versions found.' : bbCatalogue.length + ' versions available. Search by name or language.');
    box.innerHTML = list.length ? list.map(function (t) {
      return '<div class="vrow"><div class="vi"><b>' + esc(t.name) + (t.pd ? '<span class="lic">Public domain</span>' : '<span class="lic cr">' + (t.credit ? 'Free, credit required' : 'Free to use') + '</span>') + '</b><small>' + esc((t.en && t.en !== t.name ? t.en + ' | ' : '')) + esc(t.lang) + (t.n ? ' | ' + t.n.toLocaleString() + ' verses' : '') + (t.url ? ' | <a href="' + esc(t.url) + '" target="_blank" rel="noopener" style="color:inherit">licence</a>' : '') + '</small></div>' +
        '<button type="button" class="b sm" data-addver="' + esc(t.id) + '"' + (have[t.id] || bbVers.length >= VER_MAX ? ' disabled' : '') + '>' + (have[t.id] ? 'Added' : 'Add') + '</button></div>';
    }).join('') : '<p class="help">No version matches that.</p>';
  }
  function openVersions() {
    openDlg($('dlg-ver'));
    if (bbCatalogue) { renderVerList(); return; }
    $('ver-msg').textContent = 'Loading the list of versions...'; $('ver-list').innerHTML = '';
    loadCatalogue().then(renderVerList).catch(function () { $('ver-msg').textContent = 'The list could not be loaded. Check your internet connection and open this again.'; });
  }
  function addVersion(id, btn) {
    var t = (bbCatalogue || []).filter(function (x) { return x.id === id; })[0]; if (!t) return;
    if (bbVers.length >= VER_MAX) { $('ver-msg').textContent = 'Your bar is full. Remove one first.'; return; }
    btn.disabled = true; btn.textContent = 'Downloading...';
    fetch(API + t.link).then(function (r) { if (!r.ok) throw new Error('get'); return r.json(); }).then(function (src) {
      var d = convertBible(src, { id: 'x-' + t.id, abbr: t.abbr, name: t.name });
      bibles['x-' + t.id] = d; idb.put('bible:x-' + t.id, d, 'bibles');
      bbVers.push({ id: 'x-' + t.id, abbr: t.abbr, name: t.name }); saveVers(); setVersion('x-' + t.id); renderVerList();
      toast(t.name + ' added to the bar.');
    }).catch(function (er) { if (window.console) console.error(er); btn.disabled = false; btn.textContent = 'Add'; $('ver-msg').textContent = 'That version could not be downloaded. Check your internet connection and try again.'; });
  }

  /* the three scripture settings icons */
  var popOpen = null;
  function setPop(which) {
    var pop = $('bb-pop');
    if (popOpen === which) which = null;
    popOpen = which;
    [].forEach.call(document.querySelectorAll('.iconrow [data-set]'), function (x) { x.setAttribute('aria-expanded', x.dataset.set === which); });
    if (!which) { pop.hidden = true; return; }
    pop.hidden = false; pop.innerHTML = '';
    if (which === 'per') {
      pop.innerHTML = '<span class="lbl">Most verses on one slide</span><div class="pcards">' + [1, 2, 3, 4, 6].map(function (n) { var l = ''; for (var i = 0; i < n; i++) l += '<i></i>'; return '<button type="button" class="pcard" data-per="' + n + '" aria-pressed="' + (bset.per === n) + '" title="Up to ' + n + ' verse' + (n > 1 ? 's' : '') + ' on one slide"><span class="ln">' + l + '</span>' + n + '</button>'; }).join('') + '</div><p class="help">Pick several verses in the list and they show together, up to this many on each slide.</p>';
    } else if (which === 'color') {
      var bgh = bgHtml({ kind: 'bible' });
      pop.innerHTML = '<span class="lbl">Colours, shown on your current background</span><div class="lcards">' + LOOKS.map(function (l, i) {
        return '<button type="button" class="lcard" data-look="' + i + '" aria-pressed="' + (bset.look === i) + '" aria-label="' + esc(l.n) + '"><div class="scr"><div class="sl ' + l.style + (bgh ? ' hasbg' : '') + '"' + (l.color ? ' style="color:' + l.color + '"' : '') + '>' + bgh + '<div>For God so loved the world<small>John 3:16</small></div></div></div><span>' + esc(l.n) + '</span></button>';
      }).join('') + '</div>';
    } else {
      pop.innerHTML = '<span class="lbl">Background behind every Bible verse</span>'; pop.appendChild(bbBgBox); bbBg.redraw();
      var gal = mediaBgs();
      var g = document.createElement('div');
      g.innerHTML = gal.length ? '<span class="lbl">Your photos and videos in Media (tap one)</span><div class="gal">' + gal.map(function (x, i) { return '<button type="button" data-gal="' + i + '" aria-pressed="' + !!(bbBg.bg && bbBg.bg.name === x.name) + '" title="' + esc(x.name) + '">' + (x.thumb ? '<img alt="" src="' + esc(x.thumb) + '">' : '') + '</button>'; }).join('') + '</div>' : '<p class="help">Photos you add in the Media tab appear here to pick from. The background you choose is remembered.</p>';
      g.className = 'bgpick'; g.addEventListener('click', function (e) { var x = e.target.closest('[data-gal]'); if (!x) return; bbBg.set(gal[+x.dataset.gal]); bbBg.onChange(); setPop(null); setPop('bg'); });
      pop.appendChild(g);
    }
  }
  document.addEventListener('mousedown', function (e) { if (popOpen && !e.target.closest('#bb-pop') && !e.target.closest('.iconrow') && !e.target.closest('#bb-more') && !e.target.closest('dialog')) setPop(null); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popOpen) setPop(null); });
  /* ------------------------------------------------------------------ songs */
  var SECTION = /^\s*[\[(]?\s*((?:verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|interlude|hook|vamp)(?:\s*\d+)?)\s*[\])]?\s*:?\s*$/i;
  function titleCase(s) { return s.replace(/\s+/g, ' ').trim().replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function parseSong(raw, per) {
    var lines = String(raw).replace(/\r/g, '').split('\n'), sections = [], cur = null, seen = {};
    lines.forEach(function (ln) {
      var m = ln.match(SECTION);
      if (m) { cur = { label: titleCase(m[1]), blocks: [[]] }; sections.push(cur); return; }
      if (!ln.trim()) { if (cur && cur.blocks[cur.blocks.length - 1].length) cur.blocks.push([]); return; }
      if (!cur) { cur = { label: 'Verse ' + (sections.length + 1), blocks: [[]] }; sections.push(cur); }
      cur.blocks[cur.blocks.length - 1].push(ln.trim());
    });
    var slides = [];
    sections.forEach(function (s) {
      var blocks = s.blocks.filter(function (b) { return b.length; }), key = s.label.toLowerCase();
      if (!blocks.length && seen[key]) blocks = seen[key]; else if (blocks.length) seen[key] = blocks;
      blocks.forEach(function (b) { var step = per > 0 ? per : b.length; for (var i = 0; i < b.length; i += step) slides.push({ label: s.label, text: b.slice(i, i + step).join('\n') }); });
    });
    return slides;
  }

  /* ------------------------------------------------------------------ text layout (songs and scripture) */
  var TSD = { font: '', size: 100, align: 'center', vpos: 'middle', refpos: 'below', bold: true };
  function tsKey(it) { return it && it.kind === 'song' ? 'song' : it && it.kind === 'bible' ? 'verse' : null; }
  function tsGet(k) { var all = store('ae_ss_ts') || {}, t = {}, key; for (key in TSD) t[key] = all[k] && all[k][key] != null ? all[k][key] : TSD[key]; return t; }
  function tsFor(it) { var k = tsKey(it); if (!k) return null; var t = tsGet(k); return Object.keys(TSD).every(function (x) { return t[x] === TSD[x]; }) ? null : t; }
  var txKind = 'verse';
  function txSet(patch) { var all = store('ae_ss_ts') || {}; all[txKind] = Object.assign(tsGet(txKind), patch); store('ae_ss_ts', all); txDraw(); resendLive(); }
  function txDraw() {
    var t = tsGet(txKind), song = txKind === 'song';
    $('tx-head').textContent = song ? 'Text layout for songs' : 'Text layout for scripture';
    [].forEach.call($('tx-for').children, function (b) { b.setAttribute('aria-pressed', b.dataset.v === txKind); });
    [].forEach.call($('tx-align').children, function (b) { b.setAttribute('aria-pressed', b.dataset.v === t.align); });
    [].forEach.call($('tx-vpos').children, function (b) { b.setAttribute('aria-pressed', b.dataset.v === t.vpos); });
    $('tx-font').value = t.font; $('tx-size').value = t.size; $('tx-sizev').textContent = t.size + '%'; $('tx-ref').value = t.refpos; $('tx-bold').checked = t.bold !== false; $('tx-reff').hidden = song;
    var J = { left: 'start', center: 'center', right: 'end' }, V = { top: 'start', middle: 'center', bottom: 'end' }, abs = !song && t.refpos !== 'below', p = t.refpos.split('-');
    var ref = song ? '' : '<small style="' + (abs ? 'position:absolute;margin:0;' + p[0] + ':4cqw;' + (p[1] === 'left' ? 'left:4cqw' : p[1] === 'right' ? 'right:4cqw' : 'left:50%;transform:translateX(-50%)') : 'text-align:' + t.align) + '">John 3:16</small>';
    $('tx-prev').innerHTML = '<div class="sl dark" style="justify-items:' + J[t.align] + ';align-items:' + V[t.vpos] + ';text-align:' + t.align + (t.font ? ';font-family:' + t.font.replace(/"/g, "'") : '') + (t.bold === false ? ';font-weight:500' : '') + '"><div style="font-size:' + (6.4 * t.size / 100) + 'cqw">' + (song ? 'Amazing grace, how sweet\nthe sound' : 'For God so loved the world, that he gave his only Son') + (abs ? '' : ref) + '</div>' + (abs ? ref : '') + '</div>';
  }
  function txOpen(k) { txKind = k; txDraw(); openDlg($('dlg-text')); }
  $('tx-for').onclick = function (e) { var b = e.target.closest('[data-v]'); if (b) { txKind = b.dataset.v; txDraw(); } };
  $('tx-align').onclick = function (e) { var b = e.target.closest('[data-v]'); if (b) txSet({ align: b.dataset.v }); };
  $('tx-vpos').onclick = function (e) { var b = e.target.closest('[data-v]'); if (b) txSet({ vpos: b.dataset.v }); };
  $('tx-font').onchange = function () { txSet({ font: this.value }); };
  $('tx-ref').onchange = function () { txSet({ refpos: this.value }); };
  $('tx-bold').onchange = function () { txSet({ bold: this.checked }); };
  $('tx-size').oninput = function () { txSet({ size: +this.value }); };
  $('tx-reset').onclick = function () { var all = store('ae_ss_ts') || {}; delete all[txKind]; store('ae_ss_ts', all); txDraw(); resendLive(); };
  $('song-ts').onclick = function () { txOpen('song'); };
  $('bb-ts').onclick = function () { txOpen('verse'); };

  function songLib() { return store('ae_ss_songs') || []; }
  function songRecItem(s) { return { kind: 'song', name: s.title, slides: s.titleOnly ? [{ label: 'Title', text: s.title }] : parseSong(s.lyrics, s.per != null ? s.per : 4), style: s.style || 'dark' }; }
  function lyricHit(l, q) { var i = l.toLowerCase().indexOf(q); if (i < 0) return ''; var a = Math.max(0, i - 18); return (a ? '...' : '') + l.slice(a, i + q.length + 30).replace(/\s+/g, ' '); }
  function renderSongs() {
    var lib = songLib(), q = $('song-q').value.trim().toLowerCase(), box = $('song-list');
    var shown = lib.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return !q || x.s.title.toLowerCase().indexOf(q) >= 0 || x.s.lyrics.toLowerCase().indexOf(q) >= 0; });
    box.innerHTML = shown.length ? shown.map(function (x) {
      var hit = q && x.s.title.toLowerCase().indexOf(q) < 0 ? lyricHit(x.s.lyrics, q) : '';
      return '<li><span data-sg="pick" data-i="' + x.i + '" style="cursor:pointer" title="Double tap to show it on the screen">' + esc(x.s.title) + (hit ? '<small class="help" style="display:block;overflow:hidden;text-overflow:ellipsis">' + esc(hit) + '</small>' : '') + '</span>' +
        '<button type="button" class="ib flat" data-sg="edit" data-i="' + x.i + '" aria-label="Edit ' + esc(x.s.title) + '" title="Edit">' + ic('edit', 'sm') + '</button>' +
        '<button type="button" class="b sm" data-sg="use" data-i="' + x.i + '" aria-label="Add ' + esc(x.s.title) + ' to the service">' + ic('plus', 'sm') + 'Add</button></li>';
    }).join('') : '<li style="border:0;background:none"><span class="help" style="white-space:normal">' + (lib.length ? 'No songs match.' : 'No songs yet. Press New song, type the words and save it. Your songs stay on this computer.') + '</span></li>';
    remoteLib(); songGhost();
  }
  function songSuggest() {
    var q = $('song-q').value; if (!q.trim()) return '';
    var lq = q.toLowerCase(), lib = songLib();
    for (var i = 0; i < lib.length; i++) if (lib[i].title.toLowerCase().indexOf(lq) === 0 && lib[i].title.length > q.length) return lib[i].title;
    return '';
  }
  function songGhost() { var q = $('song-q').value, s = songSuggest(); ghost($('song-ghost'), q, s ? s.slice(q.length) : ''); }
  $('song-q').addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || e.shiftKey) return;
    var s = songSuggest(); if (!s) return;
    e.preventDefault(); this.value = s; renderSongs();
  });
  function songPreview() {
    var sl = parseSong($('sg-lyrics').value, +$('sg-per').value), box = $('sg-slides');
    $('sg-count').textContent = sl.length ? 'Slides: ' + sl.length : 'Slides';
    var colors = { verse: '#3a6fd8', chorus: '#d9433a', bridge: '#8a52e0', prechorus: '#d98a1c', intro: '#4a8f6a', other: '#5a5a64' };
    box.innerHTML = sl.map(function (s, n) { return '<div style="--c:' + colors[section(s.label)] + '"><b>' + (n + 1) + '. ' + esc(s.label) + '</b>' + esc(s.text) + '</div>'; }).join('');
  }
  function openEditor(i) {
    var s = i == null ? null : songLib()[i]; editingSong = s ? s.title : null;
    $('sg-head').textContent = s ? 'Edit song' : 'New song';
    sgClear(); $('sg-title').value = s ? s.title : ''; $('sg-lyrics').value = s ? s.lyrics : ''; $('sg-del').hidden = !s;
    $('sg-per').value = s && s.per != null ? String(s.per) : '4'; $('sg-style').value = (s && s.style) || 'dark'; $('sg-titleonly').checked = !!(s && s.titleOnly);
    songPreview(); openDlg($('dlg-song')); $('sg-title').focus();
  }
  function sgClear() { $('sg-err').hidden = true; $('sg-title').classList.remove('bad'); $('sg-lyrics').classList.remove('bad'); }
  function sgFail(msg, id) { sgClear(); $('sg-err').textContent = msg; $('sg-err').hidden = false; $(id).classList.add('bad'); $(id).focus(); toast(msg, true); return null; }
  ['sg-title', 'sg-lyrics'].forEach(function (id) { $(id).addEventListener('input', sgClear); });
  function saveSong() {
    var t = $('sg-title').value.trim(), l = $('sg-lyrics').value.trim();
    var to = $('sg-titleonly').checked;
    if (!t) return sgFail('You did not type a title. Type the title of the song first.', 'sg-title');
    if (!l && !to) return sgFail('You did not type any lyrics. Type the words, or tick "Show only the title on the screen".', 'sg-lyrics');
    var clash = songLib().some(function (x) { return x.title.toLowerCase() === t.toLowerCase() && x.title !== editingSong; });
    if (clash) return sgFail('You already have a song called "' + t + '". Change the title, or open that song from the list and edit it.', 'sg-title');
    sgClear();
    var lib = songLib().filter(function (s) { return s.title !== editingSong; });
    var rec = { title: t, lyrics: l, per: +$('sg-per').value, style: $('sg-style').value, titleOnly: to };
    lib.push(rec); lib.sort(function (a, b) { return a.title.localeCompare(b.title); });
    store('ae_ss_songs', lib); editingSong = t; renderSongs(); say('"' + t + '" saved to your songs on this computer.'); return rec;
  }
  ['input', 'keyup', 'change', 'paste', 'search', 'cut'].forEach(function (ev) { $('song-q').addEventListener(ev, function () { setTimeout(renderSongs, 0); }); });
  $('song-new').onclick = function () { openEditor(null); };
  $('song-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sg]'); if (!b) return; var s = songLib()[+b.dataset.i]; if (!s) return;
    if (b.dataset.sg === 'edit') openEditor(+b.dataset.i);
    else if (b.dataset.sg === 'use') { var it = songRecItem(s); if (it.slides.length) addItem(it, false); }
    else if (isDouble('lib:' + b.dataset.i)) { var it2 = songRecItem(s); if (it2.slides.length) addItem(it2, true, true); } /* straight to the screen, not added to the service */
    else toast('Double tap a song to show it on the screen. Press Add to put it in the service. Tap the pen to edit it.');
  });
  ['sg-lyrics', 'sg-per'].forEach(function (id) { $(id).addEventListener('input', songPreview); $(id).addEventListener('change', songPreview); });
  $('sg-save').onclick = function () { if (saveSong()) closeDlg($('dlg-song')); };
  $('sg-add').onclick = function () { var rec = saveSong(); if (!rec) return; var it = songRecItem(rec); if (it.slides.length) { closeDlg($('dlg-song')); addItem(it, false); } };
  $('sg-del').onclick = function () {
    if (!editingSong || !window.confirm('Delete "' + editingSong + '" from your songs?')) return;
    store('ae_ss_songs', songLib().filter(function (s) { return s.title !== editingSong; })); editingSong = null; closeDlg($('dlg-song')); renderSongs();
  };


  /* one text file can hold many songs: separate them with a line of dashes or equals signs, or start each with Title: */
  function parseSongFile(text, fname) {
    var lines = String(text).replace(/\r/g, '').replace(/^\uFEFF/, '').split('\n'), blocks = [], cur = { t: '', l: [] };
    var SEP = /^\s*[-=_*#~]{3,}\s*$/, TITLE = /^\s*(?:title|song)\s*[:\-]\s*(.+?)\s*$/i;
    function flush() { if (cur.l.some(function (x) { return x.trim(); }) || cur.t) blocks.push(cur); cur = { t: '', l: [] }; }
    lines.forEach(function (ln) {
      if (SEP.test(ln)) { flush(); return; }
      var m = ln.match(TITLE); if (m) { flush(); cur.t = m[1]; return; }
      cur.l.push(ln);
    });
    flush();
    var out = [], base = String(fname || 'Song').replace(/\.[^.]+$/, '');
    blocks.forEach(function (b, i) {
      var l = b.l.slice(), t = b.t;
      while (l.length && !l[0].trim()) l.shift();
      if (!t) {
        if (l.length && (l[0].trim().length <= 70) && (blocks.length > 1 || (l[1] !== undefined && !l[1].trim()))) { t = l.shift().trim().replace(/^\d+[.)]\s*/, ''); }
        else t = blocks.length > 1 ? base + ' ' + (i + 1) : base;
      }
      var lyr = l.join('\n').replace(/^\s+|\s+$/g, '');
      if (t && lyr) out.push({ title: t.trim(), lyrics: lyr, per: 4, style: 'dark' });
    });
    return out;
  }
  $('song-text').onclick = function () { $('song-text-file').click(); };
  $('song-text-file').onchange = function () {
    var fs = [].slice.call(this.files || []); this.value = ''; if (!fs.length) return;
    Promise.all(fs.map(function (f) { return f.text().then(function (t) { return parseSongFile(t, f.name); }); })).then(function (all) {
      var songs = [].concat.apply([], all), lib = songLib(), by = {}; lib.forEach(function (x) { by[x.title.toLowerCase()] = x; });
      songs.forEach(function (s) { by[s.title.toLowerCase()] = s; });
      var outl = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.title.localeCompare(b.title); });
      store('ae_ss_songs', outl); renderSongs();
      say(songs.length ? songs.length + (songs.length === 1 ? ' song' : ' songs') + ' added from your text file.' : 'No songs found in that file. Put a line of dashes (---) between songs, or start each with Title: and the name.', !songs.length);
    }).catch(function () { say('That file could not be read.', true); });
  };
  window.__parseSongFile = parseSongFile;
  $('song-hymns').onclick = function () {
    fetch('/tools/second-screen-presenter/hymns.json').then(function (r) { return r.json(); }).then(function (d) {
      var lib = songLib(), have = {}; lib.forEach(function (x) { have[x.title.toLowerCase()] = true; });
      var n = 0; d.songs.forEach(function (x) { if (!have[x.title.toLowerCase()]) { lib.push(x); n++; } });
      lib.sort(function (a, b) { return a.title.localeCompare(b.title); }); store('ae_ss_songs', lib); renderSongs();
      say(n ? n + ' starter hymns added. They are public domain, so they are free to use.' : 'The starter hymns are already in your songs.');
    }).catch(function () { say('The hymns could not be loaded. Check your internet connection.', true); });
  };
  $('song-export').onclick = function () {
    var data = { app: 'presenter', version: 1, savedOn: new Date().toISOString(), songs: songLib(), scripture: bset };
    var a = document.createElement('a'), d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = 'presenter-songs-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    say('Backup saved to your Downloads folder (' + songLib().length + ' songs).');
  };
  $('song-import').onclick = function () { $('song-import-file').click(); };
  $('song-import-file').onchange = function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    f.text().then(function (t) {
      var d = JSON.parse(t), inc = d && d.songs;
      if (!Array.isArray(inc)) throw new Error('shape');
      var lib = songLib(), by = {}; lib.forEach(function (x) { by[x.title.toLowerCase()] = x; });
      var n = 0; inc.forEach(function (x) { if (x && x.title && (x.lyrics || x.titleOnly)) { by[String(x.title).toLowerCase()] = { title: String(x.title), lyrics: String(x.lyrics || ''), per: x.per != null ? +x.per : 4, style: x.style || 'dark', titleOnly: !!x.titleOnly }; n++; } });
      var out = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.title.localeCompare(b.title); });
      store('ae_ss_songs', out); renderSongs(); say(n + (n === 1 ? ' song' : ' songs') + ' restored from the backup.');
    }).catch(function () { say('That file is not a Presenter songs backup.', true); });
  };
  /* ------------------------------------------------------------------ countdown */
  var tmMode = 'for', tmBg = 'black';
  function openTimer(mode) {
    tmMode = mode; $('tm-head').textContent = mode === 'for' ? 'Count down for a length of time' : 'Count down to a time of day';
    $('tm-forbox').hidden = mode !== 'for'; $('tm-tobox').hidden = mode !== 'until';
    openDlg($('dlg-timer'));
  }
  function timerItem() {
    var mode = tmMode;
    var it = { kind: 'timer', mode: mode, label: $('tm-label').value.trim(), endText: $('tm-end').value.trim(), bg: tmBg, style: tmBg === 'color' ? $('tm-style').value : 'dark', showTime: $('tm-clock').checked };
    if (tmBg === 'logo' && !(logoFile && logoFile.file)) { say('No logo chosen yet. Choose one in Media, under Logo. The countdown will use a black background until then.', true); }
    if (mode === 'for') { it.secs = (+$('tm-min').value || 0) * 60 + (+$('tm-sec').value || 0); if (it.secs <= 0) { say('Set how long the countdown runs.', true); return null; } it.name = 'Countdown ' + fmt(it.secs); }
    else { it.until = $('tm-until').value; if (!it.until) { say('Pick the time to count down to.', true); return null; } it.name = 'Countdown to ' + it.until; }
    it.end = timerEnd(it);
    return it;
  }
  function timerEnd(it) {
    if (it.mode === 'clock') return 0;
    if (it.mode === 'for') return Date.now() + it.secs * 1000;
    var p = it.until.split(':'), d = new Date(); d.setHours(+p[0], +p[1], 0, 0); if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  /* ------------------------------------------------------------------ cameras, capture cards and screens */
  function capItems() { return items.filter(function (x) { return (x.kind === 'camera' || x.kind === 'screen') && x.stream && !x.ended; }); }
  function capMsg(t, bad) { $('cap-msg').textContent = t || ''; $('cap-msg').style.color = bad ? '#ff9d96' : ''; }
  function listCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { capMsg('This browser cannot use cameras here. Use Chrome or Edge on a computer.', true); return; }
    capMsg('Asking for permission to see your cameras...');
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(function (s) {
      s.getTracks().forEach(function (t) { t.stop(); });
      return navigator.mediaDevices.enumerateDevices();
    }).then(function (devs) {
      var cams = devs.filter(function (d) { return d.kind === 'videoinput'; });
      $('cap-list').innerHTML = cams.length ? cams.map(function (d, i) { return '<li><span>' + esc(d.label || ('Camera ' + (i + 1))) + '</span><button type="button" class="b sm" data-cam="' + esc(d.deviceId) + '" data-name="' + esc(d.label || ('Camera ' + (i + 1))) + '">Start</button></li>'; }).join('') : '<li style="border:0;background:none"><span class="help">No cameras found. Plug in a camera or capture card and press Find cameras again.</span></li>';
      capMsg(cams.length ? 'Pick the camera or capture card to show. A capture card shows another laptop or a video mixer.' : '');
    }).catch(function (e) { capMsg(e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this site (the icon in the address bar), then try again.' : 'Cameras could not be opened: ' + (e && e.message ? e.message : e), true); });
  }
  function startCamera(deviceId, name) {
    var existing = items.filter(function (x) { return x.kind === 'camera' && x.deviceId === deviceId && !x.ended; })[0];
    if (existing) { select(existing.id, 0, false); say('That camera is already in the service.'); return Promise.resolve(); }
    return navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).then(function (stream) {
      var it = { kind: 'camera', name: name || 'Camera', stream: stream, deviceId: deviceId, thumb: '' };
      stream.getVideoTracks()[0].addEventListener('ended', function () { it.ended = true; say('"' + it.name + '" was disconnected.', true); render(); });
      addItem(it, false); refreshPickers();
    }).catch(function (e) { capMsg('That camera could not be started: ' + (e && e.message ? e.message : e) + '. It may be in use by another app.', true); });
  }
  function startScreen() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) { capMsg('Sharing a screen needs Chrome or Edge on a computer.', true); return; }
    navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }).then(function (stream) {
      var it = { kind: 'screen', name: 'Shared screen or window', stream: stream, thumb: '' };
      stream.getVideoTracks()[0].addEventListener('ended', function () { it.ended = true; say('Screen sharing stopped.'); render(); });
      addItem(it, false); refreshPickers();
    }).catch(function (e) { if (!e || e.name !== 'NotAllowedError') capMsg('Screen sharing could not start: ' + (e && e.message ? e.message : e), true); });
  }
  function addStreamItem(stream, name, kind) { var it = { kind: kind || 'camera', name: name || 'Test camera', stream: stream, thumb: '' }; addItem(it, false); return it; }

  /* sending a picture to the display windows over WebRTC (all on this computer) */
  var rtc = {};
  function needKey(it) { if (!it) return null; if (it.kind === 'camera' || it.kind === 'screen') return it.id; var eb = effBg(it); if (eb && eb.type === 'camera') return eb.srcId; return null; }
  function startPc(key, did) {
    var src = get(key); if (!src || !src.stream || !window.RTCPeerConnection) return;
    var id = key + ':' + did; if (rtc[id]) { try { rtc[id].close(); } catch (e) {} }
    var pc = new RTCPeerConnection({ iceServers: [] }); rtc[id] = pc;
    src.stream.getTracks().forEach(function (t) { pc.addTrack(t, src.stream); });
    pc.onicecandidate = function (e) { if (e.candidate) send({ type: 'stream-ice', to: did, key: key, cand: e.candidate.toJSON() }); };
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () {
      send({ type: 'stream-offer', to: did, from: opId, key: key, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    }).catch(function (e) { if (window.console) console.error('stream', e); });
  }
  function ensureStream(key) {
    if (!key) return;
    Object.keys(displays).filter(function (d) { return Date.now() - displays[d].last < 120000; }).forEach(function (did) { var pc = rtc[key + ':' + did]; if (!pc || pc.connectionState === 'failed' || pc.connectionState === 'closed') startPc(key, did); });
  }
  function onStreamMsg(m) {
    if (m.to !== opId) return;
    var pc = rtc[m.key + ':' + m.id];
    if (!pc) return;
    if (m.type === 'stream-answer') pc.setRemoteDescription(m.sdp).catch(function () {});
    else if (m.type === 'stream-ice') pc.addIceCandidate(m.cand).catch(function () {});
  }


  /* ------------------------------------------------------------------ painting slides and monitors */
  function bgHtml(it) {
    var b = effBg(it); if (!b) return '';
    if ((b.type === 'image' || b.type === 'video') && b.thumb) return '<div class="bgl"><img alt="" src="' + esc(b.thumb) + '"></div>';
    return '<div class="bgl" data-cam="' + esc(b.key || '') + '"></div>';
  }
  function slStyle(it) {
    var t = tsFor(it), st = [];
    if (it.color) st.push('color:' + esc(it.color));
    if (t) {
      st.push('justify-items:' + ({ left: 'start', center: 'center', right: 'end' }[t.align] || 'center'), 'align-items:' + ({ top: 'start', middle: 'center', bottom: 'end' }[t.vpos] || 'center'), 'text-align:' + (t.align || 'center'));
      if (t.font) st.push('font-family:' + t.font.replace(/"/g, "'")); if (t.bold === false) st.push('font-weight:500');
    }
    return st.length ? ' style="' + st.join(';') + '"' : '';
  }
  function slideHtml(it, n) {
    var s = it.slides[n] || it.slides[0];
    if (s.img) return '<div class="pg"><img alt="" src="' + esc(s.thumb) + '"></div>';
    return '<div class="sl ' + (it.style || 'dark') + (effBg(it) ? ' hasbg' : '') + '"' + slStyle(it) + '>' + bgHtml(it) + '<div>' + esc(s.text) + (s.ref ? '<small>' + esc(s.ref) + '</small>' : '') + '</div></div>';
  }
  /* shrink long text until it fits its slide (previews and thumbnails) */
  function fitSlides(root) {
    [].forEach.call(root.querySelectorAll('.sl:not(.cd)'), function (sl) {
      var d = sl.lastElementChild; if (!d || !sl.clientWidth) return;
      d.style.fontSize = '';
      var hi = parseFloat(getComputedStyle(d).fontSize) || 12, lo = 4, avail = sl.clientHeight - 2 * (parseFloat(getComputedStyle(sl).paddingTop) || 0);
      if (d.scrollHeight <= avail) return;
      for (var i = 0; i < 9; i++) { var mid = (lo + hi) / 2; d.style.fontSize = mid + 'px'; if (d.scrollHeight <= avail) lo = mid; else hi = mid; }
      d.style.fontSize = lo + 'px';
    });
  }
  var fitT; window.addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(function () { fitSlides(document); }, 150); });
  function nowText() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function paint(box, it, n, isLive) {
    if (box.__stop) { box.__stop(); box.__stop = null; }
    if (!it) { box.innerHTML = '<span>' + (isLive ? 'Nothing on screen' : 'Select an item') + '</span>'; return null; }
    if (it.slides) {
      box.innerHTML = slideHtml(it, n); fitSlides(box);
      var cb = box.querySelector('[data-cam]'); var src = cb && get(cb.dataset.cam);
      if (cb && src && src.stream) { var v = document.createElement('video'); v.muted = true; v.autoplay = true; v.playsInline = true; v.srcObject = src.stream; v.style.cssText = 'width:100%;height:100%;object-fit:cover'; cb.appendChild(v); }
      return null;
    }
    if (it.kind === 'timer') {
      var tick = function () {
        var lg = it.bg === 'logo' && logoFile ? '<div class="bgl"><img alt="" src="' + esc(logoFile.url) + '"></div>' : '', nt = it.showTime ? '<span class="nowt">' + nowText() + '</span>' : '', cls = 'sl ' + (it.style || 'dark') + (lg ? ' hasbg' : '') + ' cd';
        if (it.mode === 'clock') { box.innerHTML = '<div class="' + cls + '">' + lg + '<div><small>' + esc(it.label) + '</small>' + nowText() + '</div></div>'; return; }
        if (!it.end) it.end = timerEnd(it); var left = Math.ceil((it.end - Date.now()) / 1000);
        box.innerHTML = '<div class="' + cls + '">' + lg + nt + '<div><small>' + esc(it.label) + '</small>' + (left > 0 ? fmt(left) : esc(it.endText || '0:00')) + '</div></div>'; };
      tick(); var t = setInterval(tick, 500); box.__stop = function () { clearInterval(t); }; return null;
    }
    if (it.kind === 'camera' || it.kind === 'screen') {
      box.innerHTML = ''; var cv = document.createElement('video'); cv.muted = true; cv.autoplay = true; cv.playsInline = true; cv.srcObject = it.stream; box.appendChild(cv);
      if (cv.play) cv.play().catch(function () {}); return null;
    }
    if (it.kind === 'image') { box.innerHTML = '<img alt="" src="' + esc(it.thumbUrl || it.url) + '">'; return null; }
    if (it.kind === 'video') {
      if (isLive) {
        box.innerHTML = ''; var vv = document.createElement('video'); vv.playsInline = true; vv.autoplay = true; vv.loop = !!opts.loop && !it.audio; vv.muted = hasDisplay(); /* the TV window carries the sound when it is open; otherwise this picture does */
        ['loadedmetadata', 'timeupdate', 'play', 'pause', 'ended', 'seeked'].forEach(function (ev) { vv.addEventListener(ev, function () { if (!hasDisplay() && vv === monVideo) onStatus({ live: liveId, t: vv.currentTime || 0, dur: isFinite(vv.duration) ? vv.duration : 0, paused: vv.paused, ended: vv.ended }); }); });
        vv.addEventListener('error', function () { box.innerHTML = '<span>This video could not be played here. Try an MP4 (H.264) or WebM file.</span>'; });
        vv.src = it.file ? (it.monUrl || (it.monUrl = URL.createObjectURL(it.file))) : it.url; box.appendChild(vv); var pp = vv.play(); if (pp && pp.catch) pp.catch(function () { vv.muted = true; vv.play().catch(function () {}); });
        if (it.audio) box.insertAdjacentHTML('beforeend', '<span style="position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:5cqw;padding:4cqw;text-align:center;background:#000">' + esc(it.name) + '</span>');
        return vv;
      }
      box.innerHTML = it.thumb ? '<img alt="" src="' + esc(it.thumb) + '">' : '<span>' + (it.audio ? 'Audio: ' + esc(it.name) : 'Video') + '</span>'; return null;
    }
    box.innerHTML = it.thumb ? '<img alt="" src="' + esc(it.thumb) + '">' : '<span>' + esc(label(it)) + '</span>';
    return null;
  }
  var monVideo = null, liveKey = '', preKey = '';
  function renderMonitors() {
    var pit = get(selId), lit = get(liveId);
    var pk = (pit ? pit.id : '') + ':' + selSlide + ':' + (pit ? pit.style : '') + ':' + (pit && pit.slides ? pit.slides.length : '') + ':' + bgSig(pit);
    if (pk !== preKey) { preKey = pk; paint($('m-pre'), pit, selSlide, false); }
    var lit2 = split.on && live2Id ? get(live2Id) : null;
    var lk = (lit ? lit.id : '') + ':' + liveSlide + ':' + (lit ? lit.style : '') + ':' + (logoOn ? 'L' : '') + ':' + bgSig(lit) + (lit2 ? '|' + lit2.id + ':' + live2Slide + ':' + bgSig(lit2) : '');
    if (lk !== liveKey) {
      liveKey = lk;
      if (monVideo) { try { monVideo.pause(); } catch (e) {} monVideo = null; }
      var ml = $('m-live'); if (ml.__sub) { ml.__sub.forEach(function (b) { if (b.__stop) { b.__stop(); b.__stop = null; } }); ml.__sub = null; }
      if (logoOn && logoFile) { if (ml.__stop) ml.__stop(); ml.innerHTML = '<img alt="" src="' + esc(logoFile.url) + '">'; }
      else if (lit2 && lit) {
        if (ml.__stop) { ml.__stop(); ml.__stop = null; }
        ml.innerHTML = '<div class="two"><div></div><div></div></div>'; var hv = ml.querySelectorAll('.two>div'); ml.__sub = [hv[0], hv[1]];
        monVideo = paint(hv[0], lit, liveSlide, true); paint(hv[1], lit2, live2Slide, false);
      }
      else monVideo = paint(ml, lit, liveSlide, true);
    }
    $('m-live').classList.toggle('blk', black);
    var pn = pit && pit.slides && pit.slides.length > 1 ? ', ' + (selSlide + 1) + '/' + pit.slides.length : '', ln = lit && lit.slides && lit.slides.length > 1 ? ', ' + (liveSlide + 1) + '/' + lit.slides.length : '';
    $('cap-pre').textContent = pit ? pit.name + pn : '';
    $('cap-live').textContent = logoOn ? 'Logo' : lit ? lit.name + ln + (lit2 ? ' + ' + lit2.name : '') : '';
    $('go').disabled = !pit; $('go').title = pit ? 'Show the preview on the display (Enter)' : '';
    var playable = lit && !logoOn && (lit.kind === 'video' || (lit.kind === 'link' && lit.playable));
    $('media').hidden = !playable;
    $('black').setAttribute('aria-pressed', black); $('black').textContent = black ? 'Show again' : 'Black';
    $('logo').setAttribute('aria-pressed', logoOn);
  }
  function renderSlides() {
    var it = get(selId), grid = $('sgrid');
    $('sl-hint').hidden = !!it;
    $('sl-title').textContent = it ? it.name + (it.slides ? ' (' + it.slides.length + ' ' + (it.kind === 'pdf' ? 'page' : 'slide') + (it.slides.length === 1 ? '' : 's') + ')' : '') : 'Slides';
    if (!it) { grid.innerHTML = ''; return; }
    var html = '', dbl = !isSong(it) && !opts.studio, tapTxt = 'Double-click to show live';
    if (it.slides) {
      it.slides.forEach(function (s, n) {
        var sec = it.kind === 'bible' ? 'bible' : it.kind === 'pdf' ? 'page' : section(s.label), isLive = it.id === liveId && n === liveSlide && !logoOn, isPre = n === selSlide;
        html += '<button type="button" class="card sec-' + sec + (isPre ? ' pre' : '') + (isLive ? ' live' : '') + '" data-n="' + n + '"><span class="lab">' + esc(s.label || 'Slide ' + (n + 1)) + '</span>' + (isLive ? '<span class="badge">LIVE</span>' : '') +
          '<div class="scr">' + slideHtml(it, n) + '</div><span class="num">' + (n + 1) + '</span>' + (dbl && isPre && !isLive ? '<span class="tap">' + tapTxt + '</span>' : '') + '</button>';
      });
    } else {
      var isLiveOne = it.id === liveId && !logoOn;
      html = '<button type="button" class="card one' + (isLiveOne ? ' live' : ' pre') + '" data-n="0"><span class="lab" style="--c:var(--' + ({ image: 'amber', video: 'purple', link: 'cyan', timer: 'acc', camera: 'acc', screen: 'acc' }[it.kind] || 'faint') + ')">' + esc(label(it)) + '</span>' + (isLiveOne ? '<span class="badge">LIVE</span>' : '') + '<div class="scr" id="one-box"></div>' + (dbl && !isLiveOne ? '<span class="tap">' + tapTxt + '</span>' : '') + '</button>';
    }
    grid.innerHTML = html; fitSlides(grid);
    var ob = $('one-box'); if (ob) paint(ob, it, 0, false);
    var cur = grid.querySelector('.pre, .live'); if (cur && cur.scrollIntoView && it.slides && it.slides.length > 12) cur.scrollIntoView({ block: 'nearest' });
  }
  /* the order shown in the service: every song sits inside one Songs drop down, placed where the first song is */
  function svcOrder() {
    var vis = items.filter(function (x) { return !x.temp; }), out = [], did = false;
    vis.forEach(function (x) { if (isSong(x)) { if (!did) { did = true; vis.forEach(function (s) { if (isSong(s)) out.push(s); }); } } else out.push(x); });
    return out;
  }
  function svcRow(it, num, sub) {
    var waiting = autoRun && it.at && !autoFired[it.id];
    return '<li class="si k-' + it.kind + (sub ? ' sub' : '') + (it.id === selId ? ' sel' : '') + (it.id === liveId || it.id === live2Id ? ' live' : '') + '" draggable="true" data-id="' + it.id + '"><span class="n">' + num + '</span><span><b>' + esc(it.name) + '</b><small><span class="tag">' + esc(label(it)) + '</span>' +
      (it.at ? ' | <span class="at">' + (waiting ? 'waiting for ' : '') + clock(it.at) + '</span>' : '') +
      (it.dur ? ' | ' + fmt(it.dur) : '') + (it.slides && it.slides.length > 1 ? ' | ' + it.slides.length + (it.kind === 'pdf' ? ' pages' : ' slides') : '') + (it.secs ? ' | ' + it.secs + 's each' : '') + (it.ended ? ' | disconnected' : '') + (it.id === liveId || it.id === live2Id ? ' | <span style="color:var(--acc);font-weight:700">LIVE</span>' : '') + '</small></span>' +
      '<button type="button" class="ib flat" data-act="menu" aria-label="Options for ' + esc(it.name) + '" title="Edit, start time, move, remove">' + ic('more') + '</button></li>';
  }
  function renderService() {
    var ol = $('svc'), order = svcOrder(), h = '', n = 0, did = false;
    $('svc-empty').hidden = order.length > 0;
    var songs = order.filter(isSong);
    order.forEach(function (it) {
      if (isSong(it)) {
        if (did) return; did = true; n++;
        var live = songs.some(function (s) { return s.id === liveId || s.id === live2Id; });
        h += '<li class="sgrp" data-grp="songs" role="button" tabindex="0" aria-expanded="' + songsOpen + '"><span class="n">' + n + '</span><span class="caret">' + ic('down', 'sm') + '</span><b>Songs</b><small>' + songs.length + (songs.length === 1 ? ' song' : ' songs') + (live && !songsOpen ? ' | <span style="color:var(--acc);font-weight:700">LIVE</span>' : '') + '</small></li>';
        if (songsOpen) songs.forEach(function (s, k) { h += svcRow(s, k + 1, true); });
        return;
      }
      n++; h += svcRow(it, n, false);
    });
    ol.innerHTML = h;
  }
  function toggleSongs() { songsOpen = !songsOpen; renderService(); }
  $('svc').addEventListener('click', function (e) { if (e.target.closest('.sgrp')) toggleSongs(); });
  $('svc').addEventListener('keydown', function (e) { var g = e.target.closest && e.target.closest('.sgrp'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSongs(); } });
  function serial(x) {
    if (x.stream || x.temp) return null;
    if (!x.mediaId && (x.file || (x.slides && x.slides[0] && x.slides[0].img))) return null;
    var o = {}; for (var k in x) if (!/^(end|monUrl|_endedAt|thumbUrl|stream|file|id|ended)$/.test(k)) o[k] = x[k];
    if (x.mediaId) { delete o.thumb; if (x.kind === 'pdf') delete o.slides; }
    if (o.bg && (o.bg.file || o.bg.type === 'camera')) delete o.bg;
    return o;
  }
  var saveT;
  function render() {
    renderService(); renderMonitors(); renderStatus(); pushState();
    clearTimeout(saveT); saveT = setTimeout(function () { store('ae_ss_service', items.map(serial).filter(Boolean)); }, 400);
  }

  /* ------------------------------------------------------------------ selecting and going live */
  function select(id, n, live) {
    var it = get(id); if (!it) return;
    selId = id; selSlide = Math.max(0, Math.min(n || 0, it.slides ? it.slides.length - 1 : 0));
    renderSlides(); renderService(); renderMonitors(); syncFit();
    if (live) goLive(id, selSlide);
  }
  function payload(it, n) {
    var b = effBg(it), bg = null;
    if (b) bg = b.type === 'camera' ? { type: 'camera', key: b.srcId } : { type: b.type, file: b.file };
    if (it.slides) {
      var s = it.slides[n] || it.slides[0];
      if (s.img) return { id: it.id + ':' + n, kind: 'image', file: s.img, name: it.name };
      var tsx = tsFor(it); return { id: it.id + ':' + n + ':' + (s.text || '').length + (tsx ? ':' + JSON.stringify(tsx) : ''), kind: 'slide', text: s.text, ref: s.ref || '', style: it.style || 'dark', color: it.color || '', bg: bg, ts: tsx };
    }
    if (it.kind === 'timer') return { id: it.id, kind: 'timer', mode: it.mode, end: it.end, label: it.label, endText: it.endText, style: it.style, showTime: !!it.showTime, logo: it.bg === 'logo' && logoFile ? logoFile.file : null };
    if (it.kind === 'camera' || it.kind === 'screen') return { id: it.id, kind: it.kind, key: it.id, name: it.name };
    var o = { id: it.id, kind: it.kind, name: it.name }; if (it.audio) o.audio = true;
    if (it.file) o.file = it.file; if (it.url) o.url = it.url;
    return o;
  }
  function fitFor(it) { return it && isMedia(it) && it.fill ? 'cover' : 'contain'; }
  function liveOpts() { return { fade: opts.fade, fit: opts.fit, loop: opts.loop, volume: opts.volume }; }
  function payload2() { var r = split.on && live2Id ? get(live2Id) : null; return r ? payload(r, live2Slide) : null; }
  function setSide(s) { split.side = s; [].forEach.call($('split-seg').querySelectorAll('[data-side]'), function (b) { b.setAttribute('aria-pressed', +b.dataset.side === s); }); }
  function goRight(id, n) {
    var it = get(id); if (!it) return;
    var changed = id !== live2Id;
    live2Id = id; live2Slide = Math.max(0, Math.min(n || 0, it.slides ? it.slides.length - 1 : 0)); selId = id; selSlide = live2Slide; split.active = 1;
    if (changed && black) setBlack(false, true);
    logoOn = false; ensureStream(needKey(it));
    send({ type: 'show', item: payload(get(liveId), liveSlide), item2: payload2(), opts: { fade: false, fit: 'contain' } });
    if (changed) setSide(0);
    renderSlides(); render(); mirrorSoon();
  }
  function goLive(id, n) {
    var it = get(id); if (!it) return;
    if (split.on && liveId && get(liveId)) {
      if (id === live2Id || (id !== liveId && split.side === 1)) { goRight(id, n); return; }
    }
    if (!Object.keys(alive(displays)).length) say('Open the TV screen first (top right), then press Go live again.', true);
    var same = id === liveId && !logoOn;
    liveId = id; liveSlide = Math.max(0, Math.min(n || 0, it.slides ? it.slides.length - 1 : 0)); selId = id; selSlide = liveSlide; if (!same) vstat = null;
    if (isMedia(it)) opts.fit = fitFor(it); else if (!same) opts.fit = 'contain';
    syncFit();
    logoOn = false;
    if (it.kind === 'timer' && it.mode !== 'clock' && !it.end) it.end = timerEnd(it);
    if (black) setBlack(false, true);
    ensureStream(needKey(it));
    split.active = 0; if (split.on && !same) setSide(1);
    var two = payload2();
    send({ type: 'show', item: payload(it, liveSlide), item2: two, opts: two ? { fade: false, fit: 'contain' } : (it.slides && same ? { fade: false, fit: opts.fit } : liveOpts()) });
    pruneTemp(); renderSlides(); render(); armAuto(); mirrorSoon();
  }
  function fitTarget() { var s = get(selId); return s && isMedia(s) ? s : get(liveId); }
  function syncFit() {
    var it = fitTarget(), b = $('fit'); if (!b) return;
    var can = !!it && isMedia(it) && it.kind !== 'camera' && it.kind !== 'screen' && it.kind !== 'link';
    b.hidden = !can; b.setAttribute('aria-pressed', !!(it && it.fill));
    b.textContent = it && it.fill ? 'Original shape' : 'Expand to fill';
  }
  function resendLive() { var it = get(liveId); if (it && !logoOn) { preKey = liveKey = ''; send({ type: 'show', item: payload(it, liveSlide), item2: payload2(), opts: { fade: false, fit: payload2() ? 'contain' : opts.fit } }); } renderSlides(); render(); mirrorSoon(); }
  function step(dir) {
    if (!items.length) return;
    if (split.on && live2Id && split.active === 1) { var r2 = get(live2Id), j2 = live2Slide + dir; if (r2 && r2.slides && j2 >= 0 && j2 < r2.slides.length) goRight(live2Id, j2); return; } /* the right side was used last, so the arrows move it */
    var it = get(liveId);
    if (it && !logoOn && it.slides) { var j = liveSlide + dir; if (j >= 0 && j < it.slides.length) { goLive(it.id, j); return; } }
    var L = svcOrder(), cur = get(liveId), i = cur ? L.indexOf(cur) : -1, k = i < 0 ? (dir > 0 ? 0 : L.length - 1) : i + dir;
    if (k < 0 || k >= L.length) { say(dir > 0 ? 'That was the last slide.' : 'That is the first slide.'); return; }
    var nx = L[k]; goLive(nx.id, dir < 0 && nx.slides ? nx.slides.length - 1 : 0);
  }
  /* moving on by itself: each item can have its own slide speed, and the whole service can run on start times */
  function autoNext(force) {
    var it = get(liveId); if (!it) return;
    if (it.slides && liveSlide + 1 < it.slides.length) { goLive(it.id, liveSlide + 1); return; }
    if (!(autoRun || opts.auto || force)) return;
    var nx = items[idx(liveId) + 1]; if (!nx) return;
    if (autoRun && nx.at && !autoFired[nx.id]) return;
    goLive(nx.id, 0);
  }
  function armAuto() {
    clearTimeout(autoTimer); autoTimer = null;
    var it = get(liveId); if (!it || logoOn || !(it.slides || it.kind === 'image')) return;
    var secs = it.secs > 0 ? it.secs : (opts.auto ? opts.autoSecs : 0);
    if (secs > 0) autoTimer = setTimeout(function () { autoNext(false); }, Math.max(1, secs) * 1000);
  }
  function setBlack(on, quiet) { black = on; send({ type: 'black', on: on }); mirrorSoon(); if (!quiet) render(); }
  function toggleLogo() {
    if (!logoFile) { $('logo-file').click(); say('Choose your logo image first, then press Logo again.'); return; }
    if (logoOn) { logoOn = false; var it = get(liveId); if (it) send({ type: 'show', item: payload(it, liveSlide), opts: liveOpts() }); else send({ type: 'clear' }); }
    else { logoOn = true; send({ type: 'show', item: { id: 'logo', kind: 'image', file: logoFile.file }, opts: liveOpts() }); }
    render(); mirrorSoon();
  }

  /* the service on a timetable */
  function setAuto(on) {
    autoRun = on; autoFired = {};
    if (on) items.forEach(function (it) { if (it.at && atMs(it.at) <= Date.now()) autoFired[it.id] = true; });
    $('autobar').classList.toggle('on', on);
    $('auto-toggle').innerHTML = on ? ic('stop', 'sm') + 'Stop' : ic('bolt', 'sm') + 'Run automatically';
    autoTick(); renderService(); armAuto();
    if (on) say('Automatic mode is on. Items with a start time appear on the screen by themselves at that time.');
  }
  var lastAutoTxt = '';
  function autoTick() {
    var now = Date.now(), timed = items.filter(function (it) { return it.at; });
    if (autoRun) {
      var due = -1;
      items.forEach(function (it, i) { if (it.at && !autoFired[it.id] && atMs(it.at) <= now) due = i; });
      if (due >= 0) { items.forEach(function (it, i) { if (it.at && i <= due) autoFired[it.id] = true; }); goLive(items[due].id, 0); }
    }
    var txt;
    if (!autoRun) txt = timed.length ? 'Manual. ' + timed.length + (timed.length > 1 ? ' items have' : ' item has') + ' a start time. Press Run automatically to follow them.' : 'Manual. You choose what shows.';
    else {
      var next = timed.filter(function (it) { return !autoFired[it.id]; }).sort(function (a, b) { return atMs(a.at) - atMs(b.at); })[0];
      txt = next ? 'Automatic. Next: ' + next.name + ' at ' + clock(next.at) : timed.length ? 'Automatic. All start times have passed.' : 'Automatic. Set start times from each item\'s menu.';
    }
    if (txt !== lastAutoTxt) { lastAutoTxt = txt; $('autotxt').textContent = txt; }
  }
  setInterval(autoTick, 1000);

  /* ------------------------------------------------------------------ drawing the live screen: recording and the phone mirror */
  var imgCache = {}, camEls = {};
  function cachedImg(key, src) { var c = imgCache[key]; if (c && c.__src === src) return c; var im = new Image(); im.__src = src; im.src = src; imgCache[key] = im; return im; }
  function camVideo(key) {
    var v = camEls[key], src = get(key); if (!src || !src.stream) return null;
    if (!v || v.srcObject !== src.stream) { v = document.createElement('video'); v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = src.stream; if (v.play) v.play().catch(function () {}); camEls[key] = v; }
    return v;
  }
  function drawFit(g, el, W, H, cover) {
    var w = el.videoWidth || el.naturalWidth || el.width, h = el.videoHeight || el.naturalHeight || el.height; if (!w || !h) return;
    var s = cover ? Math.max(W / w, H / h) : Math.min(W / w, H / h);
    try { g.drawImage(el, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s); } catch (e) { /* not ready */ }
  }
  function wrapLines(g, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(/\s+/), line = '';
      words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
      out.push(line);
    });
    return out;
  }
  function drawText(g, W, H, text, small, color, size) {
    var s = W / 1280, fs = Math.round(size * s), lines;
    g.font = '800 ' + fs + 'px system-ui,Segoe UI,Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines = wrapLines(g, text, W * 0.84);
    while (lines.length * fs * 1.2 > H * 0.74 && fs > 12) { fs -= 2; g.font = '800 ' + fs + 'px system-ui,Segoe UI,Arial,sans-serif'; lines = wrapLines(g, text, W * 0.84); }
    var total = lines.length * fs * 1.2 + (small ? fs * 0.9 : 0), y = (H - total) / 2 + fs * 0.6;
    g.fillStyle = color; g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8 * s;
    lines.forEach(function (ln) { g.fillText(ln, W / 2, y); y += fs * 1.2; });
    if (small) { g.font = '600 ' + Math.round(fs * 0.5) + 'px system-ui,Segoe UI,Arial,sans-serif'; g.globalAlpha = 0.85; g.fillText(small, W / 2, y + fs * 0.1); g.globalAlpha = 1; }
    g.shadowBlur = 0;
  }
  function drawLive(g, W, H) {
    if (!g) return;
    var r2 = split.on && live2Id ? get(live2Id) : null, l1 = get(liveId);
    if (r2 && l1 && !black && !logoOn) {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      [[l1, liveSlide, 0], [r2, live2Slide, 1]].forEach(function (q) { g.save(); g.translate(q[2] * W / 2, 0); g.beginPath(); g.rect(1, 0, W / 2 - 2, H); g.clip(); drawLive1(g, W / 2, H, q[0], q[1]); g.restore(); });
      return;
    }
    drawLive1(g, W, H, l1, liveSlide);
  }
  function drawLive1(g, W, H, it, liveSlide) {
    var s = W / 1280;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (black) return;
    if (logoOn && logoFile) { drawFit(g, cachedImg('logo', logoFile.url), W, H); return; }
    if (!it) return;
    if (it.slides) {
      var sl = it.slides[liveSlide] || it.slides[0];
      if (sl.img) { drawFit(g, cachedImg('pg:' + it.id + ':' + liveSlide, sl.url || (sl.url = URL.createObjectURL(sl.img))), W, H); return; }
      var b = effBg(it), light = it.style === 'light';
      if (it.style === 'coral') { var gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#14213d'); gr.addColorStop(1, '#e8453c'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      else { g.fillStyle = light ? '#fff' : '#000'; g.fillRect(0, 0, W, H); }
      if (b) {
        if (b.type === 'camera') { var cv = camVideo(b.srcId); if (cv) drawFit(g, cv, W, H, true); }
        else if (b.thumb) drawFit(g, cachedImg('bg:' + (b.name || ''), b.thumb), W, H, true);
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, W, H);
      }
      drawText(g, W, H, sl.text, sl.ref, it.color || (light && !b ? '#111' : '#fff'), 64);
      return;
    }
    if (it.kind === 'image') { drawFit(g, cachedImg('im:' + it.id, it.thumbUrl || it.url), W, H); return; }
    if (it.kind === 'video') { if (monVideo) drawFit(g, monVideo, W, H); return; }
    if (it.kind === 'camera' || it.kind === 'screen') { var v = camVideo(it.id); if (v) drawFit(g, v, W, H); return; }
    if (it.kind === 'timer') {
      if (!it.end && it.mode !== 'clock') it.end = timerEnd(it);
      var left = Math.ceil(((it.end || 0) - Date.now()) / 1000);
      var gr2 = g.createLinearGradient(0, 0, W, H); gr2.addColorStop(0, it.style === 'light' ? '#fff' : it.style === 'dark' ? '#000' : '#14213d'); gr2.addColorStop(1, it.style === 'light' ? '#fff' : it.style === 'dark' ? '#000' : '#e8453c');
      g.fillStyle = gr2; g.fillRect(0, 0, W, H);
      drawText(g, W, H, it.mode === 'clock' ? nowText() : left > 0 ? fmt(left) : (it.endText || '0:00'), it.label, it.style === 'light' ? '#111' : '#fff', 190);
      return;
    }
    if (it.thumb) drawFit(g, cachedImg('th:' + it.id, it.thumb), W, H);
    drawText(g, W, H, it.name, '', '#fff', 40 * s * 1);
  }
  var recorder = null, recStream = null, recDraw = null, recT = null, recT0 = 0, recChunks = [];
  function toggleRec() {
    if (recorder) { try { recorder.stop(); } catch (e) { /* already stopped */ } return; }
    var cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    if (!window.MediaRecorder || !cv.captureStream) { say('Recording needs a current Chrome, Edge or Firefox on a computer.', true); return; }
    var g = cv.getContext('2d'); drawLive(g, 1280, 720);
    recDraw = setInterval(function () { drawLive(g, 1280, 720); }, 40);
    recStream = cv.captureStream(25);
    var mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0] || '';
    try { recorder = mime ? new MediaRecorder(recStream, { mimeType: mime, videoBitsPerSecond: 5000000 }) : new MediaRecorder(recStream); }
    catch (e) { clearInterval(recDraw); say('Recording could not start in this browser.', true); return; }
    recChunks = [];
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = function () {
      clearInterval(recDraw); clearInterval(recT); recorder = null;
      recStream.getTracks().forEach(function (t) { t.stop(); });
      $('rec').classList.remove('on'); $('rec').innerHTML = ic('rec'); $('rectime').hidden = true; $('rec').title = 'Record what is on the screen';
      var blob = new Blob(recChunks, { type: mime || 'video/webm' }), a = document.createElement('a'), d = new Date(), pad = function (n) { return (n < 10 ? '0' : '') + n; };
      a.href = URL.createObjectURL(blob); a.download = 'presenter-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + (/mp4/.test(mime) ? '.mp4' : '.webm');
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      say('Recording saved to your Downloads folder.');
    };
    recorder.start(1000); recT0 = Date.now();
    $('rec').classList.add('on'); $('rec').innerHTML = ic('stop'); $('rec').title = 'Stop recording'; $('rectime').hidden = false; $('rectime').textContent = '0:00';
    recT = setInterval(function () { $('rectime').textContent = fmt((Date.now() - recT0) / 1000); }, 500);
    say('Recording the screen. Press the red button again to stop. Sound is not recorded.');
  }
  var mirCv = null, lastMir = '', mirT = null;
  function mirrorFrame() {
    if (!conns.length) return;
    try {
      if (!mirCv) { mirCv = document.createElement('canvas'); mirCv.width = 640; mirCv.height = 360; }
      var g = mirCv.getContext('2d'); if (!g) return;
      drawLive(g, 640, 360);
      var url = mirCv.toDataURL('image/jpeg', 0.6);
      if (url !== lastMir) { lastMir = url; remoteSend({ type: 'frame', img: url }); }
    } catch (e) { /* canvas not ready */ }
  }
  function mirrorSoon() { clearTimeout(mirT); mirT = setTimeout(mirrorFrame, 250); }
  setInterval(mirrorFrame, 1000);

  /* ------------------------------------------------------------------ stage display and shared state */
  function describe(it, n) {
    if (!it) return null;
    if (it.slides) { var s = it.slides[n] || it.slides[0]; return { label: (it.kind === 'song' ? it.name + ', ' : '') + (s.label || ''), text: s.text || (s.label || ''), ref: s.ref || '' }; }
    if (it.kind === 'timer') return { label: 'Countdown', text: it.label || it.name };
    return { label: label(it), text: it.name };
  }
  function nextOf() {
    var it = get(liveId);
    if (it && it.slides && liveSlide + 1 < it.slides.length) return describe(it, liveSlide + 1);
    var i = idx(liveId); return describe(items[i + 1] || (i < 0 ? items[0] : null), 0);
  }
  function state() {
    var it = get(liveId);
    return {
      now: describe(it, liveSlide), next: nextOf(), black: black, msg: stageMsg,
      timer: it && it.kind === 'timer' ? { end: it.end, label: it.label } : null,
      live: liveId ? { id: liveId, slide: liveSlide } : null,
      items: items.filter(function (x) { return !x.temp; }).map(function (x) { return { id: x.id, name: x.name, kind: label(x), at: x.at || '', slides: x.slides ? x.slides.map(function (s) { return s.label || firstLine(s.text); }) : null, texts: x.slides ? x.slides.map(function (s) { return String(s.text || '').slice(0, 240); }) : null }; })
    };
  }
  function pushState() { var s = state(); send({ type: 'stage', state: s }); remoteSend({ type: 'state', state: s }); }


  /* ------------------------------------------------------------------ service list: click rules, menus, editing */
  function removeItem(id) {
    var it = get(id); if (!it) return;
    if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl); if (it.monUrl) URL.revokeObjectURL(it.monUrl);
    if (it.stream) it.stream.getTracks().forEach(function (t) { t.stop(); });
    send({ type: 'stream-close', key: id });
    items.splice(idx(id), 1); delete autoFired[id];
    if (live2Id === id) { live2Id = null; if (liveId && !logoOn) resendLive(); }
    if (selId === id) { selId = null; selSlide = 0; } if (liveId === id) { liveId = null; liveSlide = 0; send({ type: 'clear' }); }
    refreshPickers(); renderSlides(); render(); mirrorSoon();
  }
  function moveItem(id, d) { var i = idx(id), j = i + d; if (j < 0 || j >= items.length) return; items.splice(j, 0, items.splice(i, 1)[0]); render(); }
  function dupItem(id) {
    var it = get(id); if (!it || it.stream) return;
    var c = {}; for (var k in it) if (!/^(id|end|monUrl|_endedAt|thumbUrl)$/.test(k)) c[k] = it[k];
    if (it.slides) c.slides = it.slides.map(function (s) { return { label: s.label, text: s.text, ref: s.ref, img: s.img, thumb: s.thumb }; });
    if (it.kind === 'image' && it.file) { c.thumbUrl = URL.createObjectURL(it.file); c.thumb = c.thumbUrl; }
    c.id = 'i' + uid++; items.splice(idx(id) + 1, 0, c); render();
  }
  /* put a text item over a camera, a screen or a photo from Media */
  function combineMenu(id) {
    var it = get(id); if (!it) return;
    var set = function (bg) { if (bg === undefined) delete it.bg; else it.bg = bg; preKey = liveKey = ''; if (liveId === id) { ensureStream(needKey(it)); resendLive(); } else { renderSlides(); render(); } say(bg ? '"' + it.name + '" now shows over ' + (bg.name || 'the picture') + '.' : 'Background removed.'); };
    var ents = [{ hdr: 'Show "' + it.name + '" over' }];
    capItems().forEach(function (c) { ents.push({ label: c.name, icon: c.kind === 'camera' ? 'camera' : 'monitor', fn: function () { set({ type: 'camera', srcId: c.id, name: c.name, key: c.id }); } }); });
    mediaBgs().slice(0, 12).forEach(function (x) { ents.push({ label: x.name, icon: x.type === 'image' ? 'image' : 'film', fn: function () { set(x); } }); });
    if (ents.length === 1) ents.push({ label: 'Nothing to pick yet. Start a camera in Capture or add photos in Media.', off: true, fn: function () {} });
    ents.push({ sep: true }, { label: 'No background', icon: 'x', fn: function () { set(false); } }, { label: 'Use the general background', icon: 'image', fn: function () { set(undefined); } });
    var b = document.querySelector('#svc [data-id="' + id + '"] [data-act="menu"]') || $('more'); menuAt(b, ents);
  }
  function itemEntries(id) {
    var it = get(id), i = idx(id), canSpeed = it && (it.slides || it.kind === 'image');
    return [
      { label: 'Edit', icon: 'edit', fn: function () { openEdit(id); } },
      { label: it.at ? 'Start time: ' + clock(it.at) : 'Set a start time', icon: 'clock', fn: function () { openEdit(id, 'ed-at'); } },
      { label: 'Slide speed', icon: 'sliders', off: !canSpeed, fn: function () { openEdit(id, 'ed-secs'); } },
      { label: 'Put over a camera, screen or photo', icon: 'camera', off: !(it.slides && !it.slides[0].img), fn: function () { combineMenu(id); } },
      { label: 'Restart the countdown', icon: 'clock', off: !(it.kind === 'timer' && it.mode === 'for'), fn: function () { it.end = timerEnd(it); if (liveId === id) resendLive(); else { preKey = ''; render(); renderSlides(); } } },
      { label: 'Duplicate', icon: 'copy', off: !!it.stream, fn: function () { dupItem(id); } },
      { sep: true },
      { label: 'Move up', icon: 'up', off: i === 0, fn: function () { moveItem(id, -1); } },
      { label: 'Move down', icon: 'down', off: i === items.length - 1, fn: function () { moveItem(id, 1); } },
      { sep: true },
      { label: 'Remove from service', icon: 'trash', fn: function () { removeItem(id); } }
    ];
  }
  $('svc').addEventListener('click', function (e) {
    var li = e.target.closest('.si'); if (!li) return;
    var id = li.dataset.id, it = get(id), b = e.target.closest('[data-act]');
    if (b && b.dataset.act === 'menu') { menuAt(b, itemEntries(id)); return; }
    if (window.innerWidth <= 900) { $('app').dataset.view = 'show'; syncMtabs(); }
    var dbl = isDouble('s:' + id);
    if (dbl) goLive(id, 0);
    else select(id, 0, false);
  });
  $('svc').addEventListener('dblclick', function (e) { var li = e.target.closest('.si'); if (li && !e.target.closest('[data-act]') && !(liveId === li.dataset.id && liveSlide === 0 && !logoOn)) goLive(li.dataset.id, 0); });
  $('svc').addEventListener('contextmenu', function (e) { var li = e.target.closest('.si'); if (!li) return; e.preventDefault(); showMenu(e.clientX, e.clientY, itemEntries(li.dataset.id)); });
  $('svc').addEventListener('dragstart', function (e) { var li = e.target.closest('.si'); if (li) { dragId = li.dataset.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} li.classList.add('drag'); } });
  $('svc').addEventListener('dragend', function () { dragId = null; renderService(); });
  $('svc').addEventListener('dragover', function (e) {
    if (!dragId) return; e.preventDefault();
    var li = e.target.closest('.si'); if (!li || li.dataset.id === dragId) return;
    var from = idx(dragId), to = idx(li.dataset.id); if (from < 0 || to < 0) return;
    items.splice(to, 0, items.splice(from, 1)[0]); renderService();
    var d = $('svc').querySelector('[data-id="' + dragId + '"]'); if (d) d.classList.add('drag');
  });
  $('svc-menu').onclick = function () {
    menuAt($('svc-menu'), [
      { label: autoRun ? 'Stop running automatically' : 'Run automatically', icon: 'bolt', fn: function () { setAuto(!autoRun); } },
      { label: 'Clear all start times', icon: 'clock', off: !items.some(function (x) { return x.at; }), fn: function () { items.forEach(function (x) { delete x.at; }); autoFired = {}; render(); autoTick(); } },
      { sep: true },
      { label: 'Remove everything from the service', icon: 'trash', off: !items.length, fn: function () {
        if (!window.confirm('Remove everything from the service? Your saved songs and Media are kept.')) return;
        items.slice().forEach(function (it) { if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl); if (it.monUrl) URL.revokeObjectURL(it.monUrl); if (it.stream) it.stream.getTracks().forEach(function (t) { t.stop(); }); send({ type: 'stream-close', key: it.id }); });
        items.length = 0; selId = liveId = live2Id = null; selSlide = liveSlide = 0; autoFired = {}; send({ type: 'clear' }); refreshPickers(); renderSlides(); render(); mirrorSoon();
      } }
    ]);
  };
  $('auto-toggle').onclick = function () { setAuto(!autoRun); };

  /* the edit window for one service item */
  var edId = null, edBgv, edColor = '', edSlides = [];
  var EDLOOKS = [['dark', 'White on black'], ['light', 'Black on white'], ['coral', 'Navy and coral']];
  function syncEd() { [].forEach.call(document.querySelectorAll('#ed-slides textarea'), function (t) { if (edSlides[+t.dataset.n]) edSlides[+t.dataset.n].text = t.value; }); }
  function drawEdSlides() {
    var box = $('ed-slides'); if (!box) return;
    box.innerHTML = edSlides.map(function (s, n) {
      return '<div class="edslide"><label for="ed-s' + n + '">' + (n + 1) + '. ' + esc(s.label || 'Slide') + '</label><textarea id="ed-s' + n + '" data-n="' + n + '" rows="3">' + esc(s.text) + '</textarea><button type="button" class="b sm" data-rms="' + n + '" style="justify-self:start">Remove this slide</button></div>';
    }).join('');
  }
  function drawEdBg() {
    var m = $('ed-bgm'); if (!m) return;
    var cur = edBgv === undefined ? 'default' : edBgv === false ? 'none' : edBgv.type;
    [].forEach.call(m.children, function (b) { b.setAttribute('aria-pressed', b.dataset.m === cur); });
    var it = get(edId);
    $('ed-bgn').textContent = cur === 'default' ? 'Uses the general ' + (it && it.kind === 'song' ? 'song' : 'scripture') + ' background.' : cur === 'none' ? 'No background for this item.' : (edBgv.name || '');
  }
  function drawEdColors() { [].forEach.call(document.querySelectorAll('#ed-colors button'), function (b) { b.setAttribute('aria-pressed', b.dataset.c === edColor); }); }
  function openEdit(id, focusId) {
    var it = get(id); if (!it) return; edId = id; edBgv = it.bg; edColor = it.color || '';
    var textual = it.slides && !it.slides[0].img;
    edSlides = textual ? it.slides.map(function (s) { return { label: s.label, text: s.text, ref: s.ref }; }) : [];
    $('it-head').textContent = 'Edit: ' + it.name;
    var h = '<div class="f"><label for="ed-name">Name</label><input id="ed-name" type="text" value="' + esc(it.name) + '"></div>';
    h += '<div class="r2"><div class="f"><label for="ed-at">Start time (for automatic mode)</label><div class="row"><input id="ed-at" type="time" value="' + esc(it.at || '') + '"><button class="b sm" type="button" id="ed-atx">Clear</button></div></div>';
    if (it.slides || it.kind === 'image') h += '<div class="f"><label for="ed-secs">Seconds on each slide (0 = I move on myself)</label><input id="ed-secs" type="number" min="0" max="3600" value="' + (it.secs || 0) + '"></div>';
    h += '</div>';
    if (it.kind === 'timer') {
      h += '<div class="r2"><div class="f"><label for="ed-tl">Words above the clock</label><input id="ed-tl" type="text" value="' + esc(it.label || '') + '"></div><div class="f"><label for="ed-te">When it reaches zero</label><input id="ed-te" type="text" value="' + esc(it.endText || '') + '"></div></div>';
    }
    if (textual || it.kind === 'timer') h += '<div class="f"><label for="ed-look">Slide colours</label><select id="ed-look">' + EDLOOKS.map(function (l) { return '<option value="' + l[0] + '"' + ((it.style || 'dark') === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></div>';
    if (textual) {
      h += '<div class="f"><span class="lbl">Text colour</span><div class="sw" id="ed-colors">' + COLORS.map(function (c) { return '<button type="button" data-c="' + c.c + '" title="' + c.n + '" aria-label="' + c.n + '" style="background:' + (c.c || 'linear-gradient(135deg,#fff 50%,#111 50%)') + '"></button>'; }).join('') + '</div></div>';
      h += '<div class="f"><span class="lbl">Background</span><div class="seg" id="ed-bgm" role="group" aria-label="Background">' + [['default', 'General'], ['none', 'None'], ['image', 'Photo'], ['video', 'Video'], ['camera', 'Camera']].map(function (x) { return '<button type="button" data-m="' + x[0] + '" aria-pressed="false">' + x[1] + '</button>'; }).join('') + '</div><span class="bgname" id="ed-bgn"></span></div>';
      h += '<div class="f"><span class="lbl">Words on each slide</span><div id="ed-slides" style="display:grid;gap:10px"></div><button class="b sm" type="button" id="ed-addslide" style="justify-self:start">' + ic('plus', 'sm') + 'Add a slide</button><p class="help">Changes here apply to this service only. To change the saved song, edit it in the Library.</p></div>';
    }
    $('it-body').innerHTML = h;
    drawEdSlides(); drawEdBg(); drawEdColors();
    openDlg($('dlg-item'));
    var f = focusId && $(focusId); if (f) f.focus();
  }
  $('it-body').addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('#ed-atx')) { $('ed-at').value = ''; return; }
    var c = t.closest('#ed-colors [data-c]'); if (c) { edColor = c.dataset.c; drawEdColors(); return; }
    var m = t.closest('#ed-bgm [data-m]');
    if (m) {
      var k = m.dataset.m;
      if (k === 'default') { edBgv = undefined; drawEdBg(); }
      else if (k === 'none') { edBgv = false; drawEdBg(); }
      else if (k === 'camera') { var cam = capItems()[0]; if (!cam) { say('Start a camera first: open the Capture tab, press Find cameras, then Start.', true); return; } edBgv = { type: 'camera', srcId: cam.id, name: cam.name, key: cam.id }; drawEdBg(); }
      else pickBgFile(k, function (bg) { edBgv = bg; drawEdBg(); });
      return;
    }
    var rm = t.closest('[data-rms]'); if (rm) { syncEd(); if (edSlides.length > 1) { edSlides.splice(+rm.dataset.rms, 1); drawEdSlides(); } else say('An item needs at least one slide.', true); return; }
    if (t.closest('#ed-addslide')) { syncEd(); edSlides.push({ label: (edSlides[edSlides.length - 1] || {}).label || 'Slide', text: '' }); drawEdSlides(); var ta = $('ed-s' + (edSlides.length - 1)); if (ta) ta.focus(); }
  });
  $('it-save').onclick = function () {
    var it = get(edId); if (!it) { closeDlg($('dlg-item')); return; }
    it.name = $('ed-name').value.trim() || it.name;
    var at = $('ed-at').value; if (at) it.at = at; else delete it.at;
    delete autoFired[it.id]; if (autoRun && it.at && atMs(it.at) <= Date.now()) autoFired[it.id] = true;
    if ($('ed-secs')) { var sc = Math.max(0, +$('ed-secs').value || 0); if (sc > 0) it.secs = sc; else delete it.secs; }
    if (it.kind === 'timer') { it.label = $('ed-tl').value.trim(); it.endText = $('ed-te').value.trim(); }
    if ($('ed-look')) it.style = $('ed-look').value;
    if (it.slides && !it.slides[0].img) {
      syncEd();
      var kept = edSlides.filter(function (s) { return String(s.text).trim(); });
      if (!kept.length) { say('Type some words on at least one slide.', true); return; }
      it.slides = kept.map(function (s) { var o = { label: s.label, text: s.text }; if (s.ref) o.ref = s.ref; return o; });
      if (edColor) it.color = edColor; else delete it.color;
      if (edBgv === undefined) delete it.bg; else it.bg = edBgv;
      if (selId === it.id) selSlide = Math.min(selSlide, it.slides.length - 1);
      if (liveId === it.id) liveSlide = Math.min(liveSlide, it.slides.length - 1);
    }
    closeDlg($('dlg-item'));
    preKey = liveKey = '';
    if (liveId === it.id) resendLive(); else { renderSlides(); render(); }
    autoTick(); say('Saved.');
  };

  /* ------------------------------------------------------------------ slide grid and show controls */
  $('sgrid').addEventListener('click', function (e) {
    var c = e.target.closest('.card'); if (!c || !selId) return;
    var it = get(selId), n = +c.dataset.n, dbl = isDouble('c:' + selId + ':' + n);
    if (isSong(it)) { if (opts.studio && !dbl) { selSlide = n; renderSlides(); renderMonitors(); } else goLive(selId, n); return; }
    if (dbl) { goLive(selId, n); return; }
    selSlide = n; renderSlides(); renderMonitors();
  });
  $('sgrid').addEventListener('dblclick', function (e) { var c = e.target.closest('.card'); if (c && selId && !(liveId === selId && liveSlide === +c.dataset.n && !logoOn)) goLive(selId, +c.dataset.n); });
  $('go').onclick = function () { if (selId) goLive(selId, selSlide); };
  /* split screen: two things side by side */
  $('split').onclick = function () {
    split.on = !split.on; this.setAttribute('aria-pressed', split.on); $('split-seg').hidden = !split.on;
    if (split.on) { setSide(get(liveId) ? 1 : 0); say(get(liveId) ? 'Split screen is on. What you show next goes on the right.' : 'Split screen is on. The first item goes on the left, the next on the right.'); }
    else { live2Id = null; split.active = 0; if (liveId && !logoOn) resendLive(); say('Split screen is off.'); }
    render(); mirrorSoon();
  };
  $('split-seg').addEventListener('click', function (e) { var b = e.target.closest('[data-side]'); if (b) setSide(+b.dataset.side); });
  $('prev').onclick = function () { step(-1); };
  $('next').onclick = function () { step(1); };
  $('black').onclick = function () { setBlack(!black); };
  $('logo').onclick = toggleLogo;
  $('logo-pick').onclick = function () { $('logo-file').click(); };
  $('logo-file').onchange = function () {
    var f = this.files[0]; this.value = ''; if (!f || !/^image\//.test(f.type)) return;
    if (logoFile) URL.revokeObjectURL(logoFile.url); logoFile = { file: f, url: URL.createObjectURL(f) }; idb.put('logo', { file: f, name: f.name }); $('logo-name').textContent = f.name; bgChanged(); say('Logo ready. Press Logo to show it.');
  };
  $('rec').onclick = toggleRec;
  $('live-btn').onclick = function () { openDlg($('dlg-live')); };
  $('more').onclick = function () {
    var it = get(liveId), web = it && it.kind === 'link' && (it.sub === 'web' || it.sub === 'slides');
    var speeds = [0, 5, 8, 15, 30];
    menuAt($('more'), [
      { hdr: 'While you present' },
      { label: 'Check first (Studio mode)', icon: 'monitor', check: opts.studio, fn: function () { opts.studio = !opts.studio; renderSlides(); say(opts.studio ? 'Studio mode on. Songs also wait in Preview. Pick a slide, then press Go live.' : 'Studio mode off. Songs show on one click. Everything else shows on a double click.'); } },
      { label: 'Fade between slides', check: opts.fade, fn: function () { opts.fade = !opts.fade; } },
      { label: 'Fill the whole screen with photos', check: opts.fit === 'cover', fn: function () { opts.fit = opts.fit === 'cover' ? 'contain' : 'cover'; send({ type: 'fit', value: opts.fit }); } },
      { label: 'Next item when a video ends', check: opts.nextOnEnd, fn: function () { opts.nextOnEnd = !opts.nextOnEnd; } },
      { label: 'Move on every slide: ' + (opts.auto ? opts.autoSecs + ' seconds' : 'off'), icon: 'clock', check: opts.auto, fn: function () { var k = opts.auto ? speeds.indexOf(opts.autoSecs) : 0; k = (k + 1) % speeds.length; opts.auto = speeds[k] > 0; if (opts.auto) opts.autoSecs = speeds[k]; armAuto(); say(opts.auto ? 'Every slide now moves on after ' + opts.autoSecs + ' seconds.' : 'Slides wait for you.'); } },
      { label: 'Edit the previewed item', icon: 'edit', off: !selId, fn: function () { openEdit(selId); } },
      { label: 'Put the previewed item over a camera or photo', icon: 'camera', off: !(get(selId) && get(selId).slides && !get(selId).slides[0].img), fn: function () { combineMenu(selId); } },
      { sep: true },
      { hdr: 'Screens' },
      { label: 'Check screens and fix the TV', icon: 'monitor', fn: function () { if ('getScreenDetails' in window && !screenDetails) loadScreens(true).then(function () { showScreens(); }); else showScreens(); } },
      { label: 'Show which screen is which', icon: 'monitor', fn: function () { send({ type: 'identify' }); } },
      { label: 'Open this web page in its own window', icon: 'link', off: !web, fn: function () {
        var w = openOnScreen(it.url, 'ae_second_screen_web');
        say(w ? 'The page opened in its own window. Press F11 there for full screen, and close it when you are done.' : 'Your browser blocked the window. Allow pop-ups for this site and try again.', !w);
      } },
      { label: document.fullscreenElement ? 'Leave full screen' : 'Full screen', icon: 'expand', fn: function () { $('fs').click(); } }
    ]);
  };

  /* ------------------------------------------------------------------ live video controls */
  function onStatus(s) {
    if (s.live !== liveId || s.t == null) return;
    vstat = s;
    $('play').textContent = s.paused ? 'Play' : 'Pause';
    $('time').textContent = fmt(s.t) + ' / ' + fmt(s.dur);
    var sk = $('seek'); if (!sk.matches(':active')) { sk.max = Math.max(1, s.dur || 1); sk.value = s.t; }
    if (monVideo) {
      if (Math.abs(monVideo.currentTime - s.t) > 0.6) monVideo.currentTime = s.t;
      if (s.paused && !monVideo.paused) monVideo.pause(); else if (!s.paused && monVideo.paused) monVideo.play().catch(function () {});
    }
    if (s.ended && (opts.nextOnEnd || autoRun) && !opts.loop) { var it = get(liveId); if (it && it._endedAt !== it.id + s.dur) { it._endedAt = it.id + s.dur; autoNext(true); } }
  }
  function hasDisplay() { return Object.keys(alive(displays)).length > 0; }
  function control(o) {
    if (hasDisplay() || !monVideo) { send(o); return; }
    var v = monVideo;
    if (o.cmd === 'play') { v.muted = false; v.play().catch(function () { v.muted = true; v.play().catch(function () {}); }); }
    else if (o.cmd === 'pause') v.pause();
    else if (o.cmd === 'seek') v.currentTime = Math.max(0, o.value);
    else if (o.cmd === 'volume') v.volume = Math.max(0, Math.min(1, o.value));
    else if (o.cmd === 'loop') v.loop = !!o.value;
    else if (o.cmd === 'restart') { v.currentTime = 0; v.play().catch(function () {}); }
  }
  function playPause() { control({ type: 'control', cmd: vstat && !vstat.paused ? 'pause' : 'play' }); if (!vstat) $('play').textContent = 'Pause'; }
  $('play').onclick = playPause;
  $('restart').onclick = function () { control({ type: 'control', cmd: 'restart' }); };
  function skip(d) { var t = vstat ? vstat.t || 0 : 0, dur = vstat ? vstat.dur || 0 : 0, v = Math.max(0, dur ? Math.min(dur, t + d) : t + d); control({ type: 'control', cmd: 'seek', value: v }); }
  $('b10').onclick = function () { skip(-10); }; $('b5').onclick = function () { skip(-5); }; $('f5').onclick = function () { skip(5); }; $('f10').onclick = function () { skip(10); };
  $('seek').addEventListener('input', function () { control({ type: 'control', cmd: 'seek', value: +this.value }); $('time').textContent = fmt(+this.value) + ' / ' + fmt(+this.max); });
  $('vol').addEventListener('input', function () { opts.volume = +this.value / 100; control({ type: 'control', cmd: 'volume', value: opts.volume }); });

  /* ------------------------------------------------------------------ stage display, status and the display windows */
  function renderStatus() {
    var d = alive(displays), n = Object.keys(d).length, any = n ? d[Object.keys(d)[0]] : null, sn = Object.keys(alive(stages)).length;
    var needs = Object.keys(d).some(function (k) { return d[k].needSound; });
    $('p-disp').classList.toggle('on', n > 0); $('p-remote').classList.toggle('on', conns.length > 0);
    $('p-disp-t').textContent = DESK ? (n ? (needs ? 'click it for sound' : 'on the TV screen') : DESK.displays > 1 ? 'starting...' : 'no second screen') : !n ? 'not open' : needs ? 'click it for sound' : (any.fs || tvFull()) ? 'full screen' : tvEl ? 'click it to send to the TV' : 'click it for full screen';
    $('p-remote-t').textContent = conns.length ? conns.length + (conns.length > 1 ? ' phones' : ' phone') : 'off';
  }
  bc.onmessage = function (e) {
    var m = e.data || {};
    if (m.type === 'stream-answer' || m.type === 'stream-ice') { if (m.to === opId) onStreamMsg(m); return; }
    if (!m.id) return;
    if (m.type === 'stage-hello') { stages[m.id] = { last: Date.now() }; send({ type: 'stage', to: m.id, state: state() }); }
    else if (m.type === 'stage-beat') { stages[m.id] = { last: Date.now() }; }
    else if (m.type === 'hello') {
      displays[m.id] = { last: Date.now(), fs: false };
      if (tvFull()) send({ type: 'tvfs', on: true, to: m.id });
      var it = get(liveId);
      if (logoOn && logoFile) send({ type: 'show', to: m.id, item: { id: 'logo', kind: 'image', file: logoFile.file }, opts: liveOpts() });
      else if (it) { ensureStream(needKey(it)); send({ type: 'show', to: m.id, item: payload(it, liveSlide), item2: payload2(), opts: liveOpts() }); }
      if (black) send({ type: 'black', to: m.id, on: true });
    } else if (m.type === 'bye') {
      delete displays[m.id]; delete stages[m.id];
      Object.keys(rtc).forEach(function (k) { if (k.slice(-m.id.length - 1) === ':' + m.id) { try { rtc[k].close(); } catch (e) {} delete rtc[k]; } });
    }
    else if (m.type === 'beat' || m.type === 'status') {
      var d = displays[m.id] || (displays[m.id] = {}); d.last = Date.now();
      if (m.fs != null) d.fs = m.fs;
      if (m.type === 'status') { d.needSound = m.needSound; onStatus(m); }
    }
    renderStatus();
  };
  setInterval(function () { renderStatus(); var k = needKey(get(liveId)); if (k) ensureStream(k); }, 2000);
  send({ type: 'ping' });

  function targetScreen() {
    if (!screenDetails) return null;
    var sel = $('screen'), list = screenDetails.screens;
    if (sel.value !== '' && list[+sel.value]) return list[+sel.value];
    for (var i = 0; i < list.length; i++) if (list[i] !== screenDetails.currentScreen) return list[i];
    return null;
  }
  function fillScreens() {
    if (!screenDetails) return;
    var list = screenDetails.screens, sel = $('screen'), keep = sel.value;
    sel.innerHTML = list.map(function (s, i) { return '<option value="' + i + '">' + esc(s.label || ('Screen ' + (i + 1))) + ' (' + s.width + 'x' + s.height + (s === screenDetails.currentScreen ? ', this screen' : '') + ')</option>'; }).join('');
    var t = targetScreen(); sel.value = keep !== '' && list[+keep] ? keep : String(list.indexOf(t) >= 0 ? list.indexOf(t) : 0);
    sel.hidden = list.length < 2; $('move').hidden = list.length < 2;
    if (list.length < 2) say('Only one screen was found. Connect your TV or projector and set it to extend (not mirror) your desktop.', true);
    else if (popup && !popup.closed && fillScreens.last === 1) { placePopup(popup); toast('A second screen was found. The TV screen moved there.'); }
    fillScreens.last = list.length;
  }
  function loadScreens(prompt) {
    if (!('getScreenDetails' in window)) return Promise.resolve(null);
    var go = function () { return window.getScreenDetails().then(function (d) { screenDetails = d; d.addEventListener('screenschange', fillScreens); fillScreens(); return d; }); };
    if (prompt) return go().catch(function () { return null; });
    if (!navigator.permissions) return Promise.resolve(null);
    return navigator.permissions.query({ name: 'window-management' }).then(function (p) { return p.state === 'granted' ? go() : null; }).catch(function () { return null; });
  }
  function openOnScreen(url, name, small) {
    var s = small ? null : targetScreen();
    var feat = s ? 'popup,left=' + s.availLeft + ',top=' + s.availTop + ',width=' + s.availWidth + ',height=' + s.availHeight : 'popup,width=' + (small ? 1024 : 1280) + ',height=' + (small ? 640 : 720);
    return window.open(url, name, feat);
  }
  function placePopup(w) {
    var s = targetScreen(); if (!w || w.closed || !s) return false;
    try { w.moveTo(s.availLeft, s.availTop); w.resizeTo(s.availWidth, s.availHeight); return true; } catch (e) { return false; }
  }
  /* finding the TV or projector: ask the browser for the screen list first (that needs the click),
     then open the window there; if the computer itself sees only one screen, explain how to fix it */
  var screenAsked = false;
  function screenCount() {
    if (DESK) return DESK.displays;
    if (screenDetails) return screenDetails.screens.length;
    if (window.screen && window.screen.isExtended === true) return 2;
    if (window.screen && window.screen.isExtended === false) return 1;
    return 0;
  }
  function showScreens(note) {
    var n = screenCount(), list = screenDetails ? screenDetails.screens : null, h = '';
    if (note) h += '<p style="margin:0;color:var(--amber)">' + esc(note) + '</p>';
    h += '<p style="margin:0"><b>' + (n === 0 ? 'This browser cannot tell how many screens are connected.' : n === 1 ? 'Your computer can only see one screen right now.' : 'Your computer can see ' + n + ' screens.') + '</b></p>';
    if (list) h += '<ul class="list">' + list.map(function (s, i) { return '<li><span>' + esc(s.label || ('Screen ' + (i + 1))) + ' (' + s.width + ' x ' + s.height + ')' + (s === screenDetails.currentScreen ? ', this laptop screen' : '') + '</span></li>'; }).join('') + '</ul>';
    if (n < 2) h += '<p class="help" style="margin:0">If a TV or projector is plugged in, it is either copying this screen (mirror) or the computer has not noticed it. A web page can only use a screen that the computer itself can see. Try these, one at a time:</p>' +
      '<ol class="steps">' +
      '<li><b>Windows:</b> press the Windows key and P together, then choose <b>Extend</b>. If the TV is not listed, open Settings, System, Display, and press <b>Detect</b> under Multiple displays.</li>' +
      '<li><b>Mac:</b> open System Settings, Displays. If the TV shows as a mirror, change it to <b>Extended display</b>.</li>' +
      '<li><b>HDMI to VGA adapter:</b> a VGA projector needs an active adapter (a small box, often with a USB power lead). Plug in its power, then pick the input called <b>VGA</b>, <b>PC</b> or <b>Computer</b> on the projector.</li>' +
      '<li>Turn the projector on first, then plug the cable in, wait about 5 seconds and press <b>Detect again</b> below.</li>' +
      '<li>If it still does not appear, try another cable, another adapter or another port. When the computer sees the screen, this page will too.</li></ol>';
    else h += '<p class="help" style="margin:0">Press the TV screen button and the show goes full screen on the other screen.</p>';
    if (!('getScreenDetails' in window)) h += '<p class="help" style="margin:0">This browser cannot place windows on another screen by itself. Use Chrome or Edge for that, or drag the TV screen window across and click it once.</p>';
    $('scr-body').innerHTML = h;
    openDlg($('dlg-screens'));
  }
  function doOpen(afterPrompt) {
    var s = targetScreen(), name = Object.keys(alive(displays)).length ? 'ae_second_screen_' + Date.now() : 'ae_second_screen';
    popup = openOnScreen(BASE + 'display/', name);
    if (!popup) {
      if (afterPrompt) showScreens('The browser needs one more click to open the window. Press Open TV screen below.');
      else { armOpen(); say('Click anywhere on this page and the TV screen opens on the TV. To skip this click next time, allow pop-ups for this site.', true); }
      return;
    }
    closeDlg($('dlg-screens'));
    if (s) { setTimeout(function () { placePopup(popup); }, 300); say('The TV screen opened on ' + (s.label || 'your second screen') + '. Click it once there to make it full screen.'); return; }
    say('Drag the TV screen window onto your TV or projector, then click it once to make it full screen.');
  }
  function openDisplay(force) {
    if (force !== true && !screenDetails && window.screen && window.screen.isExtended === false) { showScreens(); return; }
    if (force !== true && !screenDetails && 'getScreenDetails' in window && !screenAsked) {
      screenAsked = true;
      say('Allow this site to use your screens, so the TV screen can open on the TV or projector.');
      loadScreens(true).then(function (d) {
        if (d && d.screens.length < 2) { showScreens(); return; }
        doOpen(true);
      });
      return;
    }
    doOpen(false);
  }
  if (window.screen && window.screen.addEventListener) window.screen.addEventListener('change', function () {
    if (window.screen.isExtended) { toast('A second screen was connected.'); loadScreens(false).then(function () { if (popup && !popup.closed) placePopup(popup); else autoOpen(); }); }
  });
  /* the TV screen opens by itself on the extended screen when the app starts. A browser only lets a page open a
     window after a click (unless pop-ups are allowed for the site), so a blocked try waits for the first click */
  var openArmed = false, tvSkip = false;
  function armOpen() {
    if (openArmed) return; openArmed = true;
    var go = function (e) {
      if (e.target && e.target.closest && e.target.closest('dialog, #p-disp, #gate')) return;
      openArmed = false; document.removeEventListener('pointerdown', go, true); document.removeEventListener('keydown', go, true);
      if (!tvSkip) startTV();
    };
    document.addEventListener('pointerdown', go, true); document.addEventListener('keydown', go, true);
  }
  function autoOpen() {
    if (DESK || tvFull() || (popup && !popup.closed) || tvSkip) return;
    var one = screenDetails ? screenDetails.screens.length < 2 : (window.screen && window.screen.isExtended === false);
    if (one) { say('Only one screen found. Connect your TV or projector and set it to extend (not mirror). The show goes there by itself.', true); return; }
    armOpen(); say('Click anywhere on this page to send the show to the TV screen.');
  }

  /* The TV screen lives inside this page as a hidden frame. One click sends it, full screen and without any window frame,
     to the extended screen, so nothing has to be dragged. Browsers without screen placement fall back to the pop-up window. */
  var tvEl = null, tvWas = false;
  function tvFull() { return !!tvEl && document.fullscreenElement === tvEl; }
  function ensureTV() {
    if (tvEl) return tvEl;
    tvEl = document.createElement('div'); tvEl.id = 'tv-fs';
    var f = document.createElement('iframe'); f.src = BASE + 'display/?embed=1'; f.title = 'TV screen'; f.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
    tvEl.appendChild(f); document.body.appendChild(tvEl); return tvEl;
  }
  function startTV() {
    tvSkip = false;
    if (DESK) {
      DESK.showTV().then(function (r) { if (r && !r.ok) say('Only one screen found. Connect your TV or projector and set it to extend (not mirror). The show goes there by itself.', true); else say('The TV screen is on your second screen.'); });
      return;
    }
    if (tvFull()) { send({ type: 'unmute' }); say('The TV screen is already showing.'); return; }
    if (!('getScreenDetails' in window) || !document.documentElement.requestFullscreen) { openDisplay(); return; }
    (screenDetails ? Promise.resolve(screenDetails) : loadScreens(true)).then(function (dd) {
      if (!dd) { say('Allow "use your screens" in the browser, then press the TV screen button again.', true); return; }
      var s = targetScreen();
      if (!s) { showScreens(); return; }
      if (popup && !popup.closed) { try { popup.close(); } catch (e) { /* already closed */ } }
      var el = ensureTV();
      return el.requestFullscreen({ screen: s }).then(function () { say('The TV screen is on ' + (s.label || 'your second screen') + '. Press Esc there to leave full screen.'); })
        .catch(function () { armOpen(); say('The browser needs one more click to send the show to the TV. Click anywhere on this page.', true); });
    });
  }
  document.addEventListener('fullscreenchange', function () {
    var on = tvFull(); send({ type: 'tvfs', on: on });
    if (tvWas && !on && tvEl) { toast('The TV screen left full screen. Press the TV screen button to send it back.'); armOpen(); }
    tvWas = on; renderStatus();
  });
  $('scr-detect').onclick = function () { if (DESK) { deskScreens(); return; } loadScreens(true).then(function () { showScreens(); }); };
  $('scr-open').onclick = function () { doOpen(false); };
  function deskScreens(note) {
    if (!DESK || !DESK.listDisplays) { startTV(); return; }
    DESK.listDisplays().then(function (list) {
      var h = note ? '<p style="margin:0;color:var(--amber)">' + esc(note) + '</p>' : '';
      h += '<p style="margin:0"><b>' + (list.length < 2 ? 'Your computer can only see one screen right now.' : 'Choose which screen shows the service to the people.') + '</b></p>';
      h += '<ul class="list">' + list.map(function (d, i) {
        return '<li><span>' + esc(d.label || ('Screen ' + (i + 1))) + ' (' + d.w + ' x ' + d.h + ')' + (d.control ? ', the screen with your controls' : '') + (d.tv ? ', the service is showing here' : '') + '</span>' +
          (d.control ? '' : '<button type="button" class="b sm' + (d.tv ? '' : ' pri') + '" data-tvid="' + d.id + '"' + (d.tv ? ' disabled' : '') + '>' + (d.tv ? 'Showing' : 'Show here') + '</button>') + '</li>';
      }).join('') + '</ul>';
      if (list.length < 2) h += '<p class="help" style="margin:0">Plug in the TV, projector or a USB-C or HDMI display. On Windows press the Windows key and P and choose Extend. On a Mac open System Settings, Displays, and turn off mirroring. It appears here by itself.</p>';
      $('scr-body').innerHTML = h; $('scr-open').hidden = true; openDlg($('dlg-screens'));
    });
  }
  $('scr-body').addEventListener('click', function (e) { var b = e.target.closest('[data-tvid]'); if (b && DESK && DESK.setTV) DESK.setTV(+b.dataset.tvid).then(function () { deskScreens(); say('The service now shows on that screen.'); }); });
  $('p-disp').onclick = function () { if (DESK) deskScreens(); else startTV(); };
  $('move').onclick = function () { if (popup && !popup.closed) say(placePopup(popup) ? 'Moved. Click the display once to make it full screen.' : 'The display could not be moved. Drag it to the screen yourself.'); else say('Open the display screen first.', true); };
  loadScreens(false).then(function () { setTimeout(autoOpen, 900); });
  if (DESK) {
    DESK.onDisplays(function (i) { renderStatus(); if ($('dlg-screens').open) deskScreens(); if (i.displays < 2) say('Only one screen found. Connect your TV or projector and set it to extend (not mirror). The show goes there by itself.', true); else if (i.tvOpen) say('The TV screen is on your second screen.'); });
    DESK.onUpdate(function (u) {
      if (u.state === 'web') updOffer(u);
      else if (u.state === 'web-progress') { $('upd-bar').hidden = false; $('upd-fill').style.width = Math.round((u.p || 0) * 100) + '%'; }
      else if (u.state === 'ready') toast('A new version of the Presenter app is ready. It installs when you close the app.');
      else if (u.state === 'manual') say('A new version of the Presenter app is available. Download it from the Presenter website.');
    });
  }
  /* in-app update: the new pages are downloaded here, inside the app, and it restarts on them; no website, no new installer */
  function updOffer(u) {
    if (!DESK || !DESK.applyWebUpdate || $('dlg-upd').open) return;
    var mb = u.bytes ? Math.max(0.1, u.bytes / 1048576).toFixed(1) + ' MB' : 'a small update';
    $('upd-msg').textContent = 'A new version of the Presenter is ready (' + mb + '). Press Update now: it installs inside the app in a few seconds, then closes and opens again by itself. Your songs and service are kept.';
    $('upd-bar').hidden = true; $('upd-fill').style.width = '0'; $('upd-go').disabled = false; $('upd-later').disabled = false; openDlg($('dlg-upd'));
  }
  $('upd-later').onclick = function () { closeDlg($('dlg-upd')); };
  $('upd-go').onclick = function () {
    this.disabled = true; $('upd-later').disabled = true; $('upd-bar').hidden = false; $('upd-msg').textContent = 'Updating... please keep the app open.';
    DESK.applyWebUpdate().then(function (r) {
      if (r && r.ok) { $('upd-msg').textContent = 'Done. The app is closing and opening again...'; return; }
      $('upd-msg').textContent = 'The update could not finish (' + ((r && r.reason) || 'no connection') + '). Check your internet and try again, or press Later.'; $('upd-go').disabled = false; $('upd-later').disabled = false;
    });
  };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(function () { /* offline copy is optional */ });
  /* the speech model is saved on the computer the first time the app is open online, so listening also works without internet */
  var VOICE_FILES = ['/tools/whisper-worker.js', '/tools/vendor/transformers/transformers.min.js', '/tools/vendor/transformers/ort-wasm-simd-threaded.jsep.mjs', '/tools/vendor/transformers/ort-wasm-simd-threaded.jsep.wasm',
    '/tools/vendor/whisper/tiny/config.json', '/tools/vendor/whisper/tiny/generation_config.json', '/tools/vendor/whisper/tiny/preprocessor_config.json', '/tools/vendor/whisper/tiny/tokenizer.json', '/tools/vendor/whisper/tiny/tokenizer_config.json',
    '/tools/vendor/whisper/tiny/onnx/encoder_model_quantized.onnx', '/tools/vendor/whisper/tiny/onnx/decoder_model_merged_quantized.onnx'];
  function voiceSW() { return 'serviceWorker' in navigator && location.protocol !== 'file:' ? navigator.serviceWorker.register('/tools/voice-sw.js', { scope: '/tools/' }).catch(function () { return null; }) : Promise.resolve(null); }
  function prefetchVoice() {
    if (!navigator.onLine || !window.caches || store('ae_ss_voice_ready') === 2) return;
    voiceSW().then(function () { return caches.open('voice-v1'); }).then(function (c) {
      var p = Promise.resolve();
      VOICE_FILES.forEach(function (u) { p = p.then(function () { return c.match(u).then(function (hit) { if (!hit) return c.add(u); }); }); });
      return p;
    }).then(function () { store('ae_ss_voice_ready', 2); }).catch(function () { /* tried again next time */ });
  }
  setTimeout(prefetchVoice, 25000);


  function refreshPickers() { bbBg.redraw(); }

  /* ------------------------------------------------------------------ phone: live mirror, service control and library (PeerJS: the free PeerJS server only introduces the phone; then it talks directly) */
  var peer = null, conns = [];
  var ICE_LIST = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }];
  function linkRoute(c, cb) {
    /* which road the phone link took: host to host means the same Wi-Fi (fast and local), anything else goes over the internet */
    var pc = c && c.peerConnection; if (!pc || !pc.getStats) return;
    pc.getStats().then(function (rep) {
      var pair = null, all = {}; rep.forEach(function (r) { all[r.id] = r; });
      rep.forEach(function (r) { if (r.type === 'transport' && r.selectedCandidatePairId) pair = all[r.selectedCandidatePairId]; });
      if (!pair) rep.forEach(function (r) { if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r; });
      if (!pair) return;
      var a = all[pair.localCandidateId], b = all[pair.remoteCandidateId]; if (!a || !b) return;
      var priv = function (c) { var ip = String(c.address || c.ip || ''); return /\.local$/i.test(ip) || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|f[cd][0-9a-f]{2}:|fe80:)/i.test(ip); };
      cb(a.candidateType === 'relay' || b.candidateType === 'relay' ? 'relay' : (a.candidateType === 'host' && b.candidateType === 'host') || (priv(a) && priv(b)) ? 'local' : 'internet');
    }).catch(function () { /* unknown route */ });
  }
  var ROUTE_TEXT = { local: 'same Wi-Fi, fast', internet: 'over the internet', relay: 'over the internet, through a relay' };

  function remoteSend(o) { conns.forEach(function (c) { if (c.open) { try { c.send(o); } catch (e) { /* dropped */ } } }); }
  function remoteLib(c) {
    if (!conns.length) return;
    var m = { type: 'lib', songs: songLib().map(function (s, i) { return { i: i, title: s.title }; }), vers: bbVers.map(function (v) { return { id: v.id, abbr: v.abbr }; }), ver: bbVer };
    if (c) { try { c.send(m); } catch (e) { /* dropped */ } } else remoteSend(m);
  }
  /* the phone code is drawn as round dots on a round white disc */
  function dotQr(q) {
    var n = q.getModuleCount(), s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ' + (n + 2) + ' ' + (n + 2) + '" role="img" aria-label="Code to scan with your phone"><rect x="-1" y="-1" width="' + (n + 2) + '" height="' + (n + 2) + '" fill="#fff"/><g fill="#111">';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) s += '<circle cx="' + (c + 0.5) + '" cy="' + (r + 0.5) + '" r="0.48"/>';
    return s + '</g></svg>';
  }
  function remoteStatus(t) { $('rm-st').textContent = t; }
  function startRemote() {
    if (peer) return;
    if (!window.Peer) { var s = document.createElement('script'); s.src = '/tools/vendor/peerjs/peerjs.min.js'; s.onload = startRemote; s.onerror = function () { remoteStatus('The remote could not load. Check your internet connection.'); }; document.head.appendChild(s); return; }
    var rid = store('ae_ss_remote_id');
    if (!rid) { rid = 'aess-' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); store('ae_ss_remote_id', rid); }
    remoteStatus('Starting the remote...');
    peer = new window.Peer(rid, { debug: 0, config: { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }], iceCandidatePoolSize: 4 } });
    peer.on('open', function (id) {
      var url = location.origin + BASE + 'remote/#' + id;
      try { var q = window.qrcode(0, 'M'); q.addData(url); q.make(); $('rm-qr').innerHTML = dotQr(q); } catch (e) { $('rm-qr').textContent = ''; }
      remoteStatus(conns.length ? conns.length + ' phone connected.' : 'Scan the code with your phone camera.');
    });
    peer.on('connection', function (c) {
      if (conns.length >= 2) { c.on('open', function () { try { c.send({ type: 'toast', text: 'Two phones are already connected.' }); } catch (e) { /* dropped */ } setTimeout(function () { try { c.close(); } catch (e) { /* closed */ } }, 500); }); return; }
      c.on('open', function () {
        conns.push(c); remoteStatus(conns.length + (conns.length > 1 ? ' phones connected.' : ' phone connected.'));
        c.send({ type: 'state', state: state() }); remoteLib(c); lastMir = ''; mirrorFrame(); renderStatus(); toast('Phone connected');
        setTimeout(function () { linkRoute(c, function (r) { remoteStatus(conns.length + (conns.length > 1 ? ' phones connected' : ' phone connected') + ' (' + ROUTE_TEXT[r] + ').'); toast('Phone connected, ' + ROUTE_TEXT[r]); }); }, 1500);
      });
      c.on('data', function (d) {
        if (!d || !d.cmd) return;
        if (d.cmd === 'next') step(1); else if (d.cmd === 'prev') step(-1);
        else if (d.cmd === 'black') setBlack(!black);
        else if (d.cmd === 'go') goLive(d.id, d.slide || 0);
        else if (d.cmd === 'play') playPause();
        else if (d.cmd === 'msg') { stageMsg = String(d.text || '').slice(0, 200); pushState(); }
        else if (d.cmd === 'lib') remoteLib(c);
        else if (d.cmd === 'addsong') { var s = songLib()[+d.i]; if (s) { var it = songRecItem(s); if (it.slides.length) addItem(it, !!d.show); } }
        else if (d.cmd === 'bible') {
          chapterLookup(String(d.ref || ''), d.ver).then(function (p) {
            if (!p) { try { c.send({ type: 'toast', text: 'Could not find that passage.' }); } catch (e) { /* dropped */ } return; }
            var picked = Array.isArray(d.verses) ? d.verses.map(Number).filter(function (n) { return n >= 1 && n <= p.vs.length; }).sort(function (a, b) { return a - b; }) : [];
            var nums = picked.length ? picked : range(p.a || 1, p.a ? p.b : p.vs.length);
            var f = { book: p.book, ch: p.ch, verses: nums.map(function (n) { return { n: n, t: p.vs[n - 1] }; }), tr: p.tr };
            addItem(bibleItem(f), !!d.show); try { c.send({ type: 'toast', text: refText(f) + ' ' + f.tr + (d.show ? ' is on the screen.' : ' added to the service.') }); } catch (e) { /* dropped */ }
          });
        }
        else if (d.cmd === 'bq') {
          var q = String(d.q || '').trim().slice(0, 80); if (!q) return;
          var reply = function (o) { try { c.send(o); } catch (e) { /* dropped */ } };
          chapterLookup(q, d.ver).then(function (p) {
            if (p) { reply({ type: 'bpassage', book: BOOKS[p.book], ch: p.ch, tr: p.tr, verses: p.vs, a: p.a, b: p.b }); return; }
            if (q.length < 3) { reply({ type: 'bresults', q: q, list: [], tr: '', short: true, nav: !!d.nav }); return; }
            searchVerses(q, d.ver).then(function (r) { reply({ type: 'bresults', q: q, list: r.list, tr: r.tr, nav: !!d.nav }); });
          });
        }
        else if (d.cmd === 'ver') { if (bbVers.some(function (v) { return v.id === d.id; })) setVersion(d.id); remoteLib(); }
      });
      c.on('close', function () { conns = conns.filter(function (x) { return x !== c; }); remoteStatus(conns.length ? conns.length + ' phone connected.' : 'Phone disconnected. Scan again to reconnect.'); renderStatus(); });
    });
    peer.on('disconnected', function () { try { peer.reconnect(); } catch (e) { /* retry later */ } });
    peer.on('error', function (er) {
      if (er && er.type === 'unavailable-id') { store('ae_ss_remote_id', ''); peer.destroy(); peer = null; startRemote(); return; }
      remoteStatus('Remote problem: ' + (er && er.type ? er.type : er) + '. Check your internet connection and try again.');
    });
  }
  /* a phone as a wireless camera: scan, press Start camera on the phone, and its picture arrives here (Wi-Fi or internet) */
  var pcPeer = null, pcN = 0;
  function startPhoneCam() {
    if (pcPeer && !pcPeer.destroyed) return;
    if (!window.Peer) { var sc = document.createElement('script'); sc.src = '/tools/vendor/peerjs/peerjs.min.js'; sc.onload = startPhoneCam; sc.onerror = function () { $('pc-st').textContent = 'Could not load. Check your internet connection.'; }; document.head.appendChild(sc); return; }
    $('pc-st').textContent = 'Getting the code ready...';
    var id = 'aeps-cam-' + Array.from(crypto.getRandomValues(new Uint8Array(10))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    pcPeer = new window.Peer(id, { debug: 0, config: { iceServers: ICE_LIST, iceCandidatePoolSize: 4 } });
    pcPeer.on('open', function (pid) {
      var url = location.origin + BASE + 'camera/#' + pid; $('pc-qr').dataset.url = url;
      try { var q = window.qrcode(0, 'M'); q.addData(url); q.make(); $('pc-qr').innerHTML = dotQr(q); } catch (e) { $('pc-qr').textContent = ''; }
      $('pc-st').textContent = 'Scan the code with your phone camera.';
    });
    pcPeer.on('call', function (call) {
      call.answer();
      var got = false;
      call.on('stream', function (st) {
        if (got) return; got = true; pcN++;
        addStreamItem(st, 'Phone camera' + (pcN > 1 ? ' ' + pcN : ''), 'camera');
        $('pc-st').textContent = 'Phone connected. Its camera is in your Capture list.'; toast('Phone camera connected');
        try { closeDlg($('dlg-pcam')); } catch (e) { /* already closed */ }
      });
      call.on('close', function () { toast('Phone camera disconnected'); });
    });
    pcPeer.on('error', function (er) { $('pc-st').textContent = 'Problem: ' + (er && er.type ? er.type : er) + '. Check your internet connection and try again.'; try { pcPeer.destroy(); } catch (e) { /* closed */ } pcPeer = null; });
  }
  $('cap-phone').onclick = function () { openDlg($('dlg-pcam')); startPhoneCam(); };
  $('p-remote').onclick = function () { openDlg($('rm-dialog')); startRemote(); };

  /* ------------------------------------------------------------------ library tabs, media, capture, scripture, countdown */
  function setTab(name) {
    [].forEach.call($('tabs').children, function (x) { x.setAttribute('aria-selected', x.dataset.tab === name); });
    document.querySelectorAll('.pane[data-pane]').forEach(function (p) { p.hidden = p.dataset.pane !== name; });
    if (name === 'capture' && !$('cap-list').children.length) capMsg('Press Find cameras to see what is connected.');
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

  $('m-file').onchange = function () { addFiles(this.files); this.value = ''; };
  $('m-chips').addEventListener('click', function (e) {
    var b = e.target.closest('.chip'); if (!b) return;
    if (b.id === 'm-link') { var open = $('m-linkrow').hidden; $('m-linkrow').hidden = !open; b.setAttribute('aria-pressed', open); if (open) $('m-url').focus(); return; }
    mFilter = b.dataset.f; [].forEach.call($('m-chips').querySelectorAll('[data-f]'), function (x) { x.setAttribute('aria-pressed', x === b); }); renderMedia();
  });
  $('m-grid').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rm]'); if (rm) { e.stopPropagation(); if (mSel === rm.dataset.rm) mSel = null; removeMedia(rm.dataset.rm); return; }
    if (e.target.closest('[data-act="add"]')) { mSel = null; $('m-addbox').hidden = true; pickMedia('any'); return; }
    var t = e.target.closest('.mt[data-id]');
    if (t) {
      var dbl = isDouble('m:' + t.dataset.id);
      mSel = t.dataset.id; $('m-addbox').hidden = true;
      var m = findMedia(mSel), have = null; items.forEach(function (x) { if (m && x.mediaId === m.id && !x.temp) have = x; });
      if (m) {
        if (dbl) { if (have) { select(have.id, 0, false); goLive(have.id, 0); } else addItem(mediaToItem(m), true); } /* two taps: on the screen (and in the service) */
        else if (!have) addItem(mediaToItem(m), false); /* one tap: into the service */
        else { select(have.id, 0, false); toast('Already in the service. Tap twice to show it on the screen.'); }
      }
      renderMedia();
    }
  });
  $('m-grid').addEventListener('keydown', function (e) { var t = e.target.closest && e.target.closest('.mt[data-id]'); if (t && (e.key === 'Enter' || e.key === ' ') && e.target === t) { e.preventDefault(); mSel = t.dataset.id; $('m-addbox').hidden = true; renderMedia(); var f = $('m-grid').querySelector('.mt.sel'); if (f) f.focus(); } });
  $('m-det').addEventListener('click', function (e) {
    var b = e.target.closest('[data-m]'); if (!b || !mSel) return; var m = findMedia(mSel); if (!m) return;
    if (b.dataset.m === 'add') addItem(mediaToItem(m), false);
    else if (b.dataset.m === 'show') addItem(mediaToItem(m), true);
    else if (b.dataset.m === 'rm') { mSel = null; removeMedia(m.id); }
  });
  $('m-addbox').addEventListener('click', function (e) { var b = e.target.closest('[data-pick]'); if (b) pickMedia(b.dataset.pick); });
  document.addEventListener('dragover', function (e) { if (!dragId && e.dataTransfer && e.dataTransfer.types && [].indexOf.call(e.dataTransfer.types, 'Files') >= 0) e.preventDefault(); });
  document.addEventListener('drop', function (e) { if (!dragId && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length && !e.defaultPrevented) { e.preventDefault(); setTab('media'); addFiles(e.dataTransfer.files); } });
  $('m-addurl').onclick = addLink;
  $('m-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });

  $('cap-find').onclick = listCameras;
  $('cap-screen').onclick = startScreen;
  $('cap-list').addEventListener('click', function (e) { var b = e.target.closest('[data-cam]'); if (b) startCamera(b.dataset.cam, b.dataset.name); });

  /* scripture */
  fetch('/tools/vendor/bible/index.json').then(function (r) { return r.json(); }).then(function (list) {
    bibleIndex = list;
    var saved = store('ae_ss_vers');
    bbVers = Array.isArray(saved) && saved.length ? saved.filter(function (v) { return v && v.id && v.abbr; }).slice(0, VER_MAX) : [];
    if (!bbVers.length) bbVers = list.map(function (b) { return { id: b.id, abbr: b.abbr, name: b.name }; });
    var keep = store('ae_ss_tr'); bbVer = bbVers.some(function (v) { return v.id === keep; }) ? keep : bbVers[0].id;
    renderVers();
  }).catch(function () { setMsg('The list of Bibles could not be loaded.'); });
  document.querySelector('.iconrow').addEventListener('click', function (e) { var b = e.target.closest('[data-set]'); if (b) setPop(b.dataset.set); });
  $('bb-pop').addEventListener('click', function (e) {
    var p = e.target.closest('[data-per]'), l = e.target.closest('[data-look]');
    if (p) { bset.per = +p.dataset.per; store('ae_ss_bset', bset); setPop(null); setPop('per'); if (bbFound) bbPreview(); }
    else if (l) { bset.look = +l.dataset.look; store('ae_ss_bset', bset); setPop(null); setPop('color'); }
  });
  $('bb-vbar').addEventListener('click', function (e) {
    var rm = e.target.closest('[data-rmver]'), v = e.target.closest('[data-ver]');
    if (e.target.closest('#bb-addver')) { openVersions(); return; }
    if (rm) { bbVers = bbVers.filter(function (x) { return x.id !== rm.dataset.rmver; }); saveVers(); if (bbVer === rm.dataset.rmver) setVersion(bbVers[0].id); else renderVers(); remoteLib(); return; }
    if (v) { setVersion(v.dataset.ver); remoteLib(); }
  });
  $('ver-q').addEventListener('input', renderVerList);
  $('ver-list').addEventListener('click', function (e) { var b = e.target.closest('[data-addver]'); if (b && !b.disabled) addVersion(b.dataset.addver, b); });
  $('bb-go').onclick = function () { bibleFind(); };
  function commitPassage() {
    clearTimeout(liveFindT); $('bb-drop').hidden = true;
    return bibleFind().then(function () {
      if (!bbFound) return;
      commitFound(); $('bb-ref').select();
    });
  }
  var liveFindT;
  $('bb-ref').addEventListener('input', function () {
    clearPassage(); refHints(); wordDrop($('bb-ref'));
    clearTimeout(liveFindT); liveFindT = setTimeout(function () { if (parseRef($('bb-ref').value)) bibleFind(false); }, 260);
  });
  $('bb-ref').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); commitPassage(); return; }
    if (e.key === 'Escape') { $('bb-drop').hidden = true; return; }
    var space = e.key === ' ' && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (space) { if (this.selectionStart !== this.value.length || this.value.indexOf(':') >= 0) return; }
    else if (e.key !== 'Tab' || e.shiftKey) return;
    var v = this.value.trim(); if (!v) return;
    var m = v.match(/^(.*?[a-z.])\s*(\d+)(\s*:\s*(\d+(?:\s*-\s*\d+)?)?)?$/i), self = this;
    if (!m) {
      var bm = matchBooks(v), bi = exactBook(v) >= 0 ? exactBook(v) : (bm[0] != null && (!space || bm.length === 1) ? bm[0] : -1);
      if (bi < 0) return;
      e.preventDefault(); self.value = BOOKS[bi] + ' '; colBk = bi; $('bb-drop').hidden = true; clearPassage(); refHints(); return;
    }
    var bk = findBook(m[1]); if (bk < 0) return;
    if (space && !/\d$/.test(this.value)) return;
    e.preventDefault(); $('bb-drop').hidden = true;
    if (!m[4]) { var keep = BOOKS[bk] + ' ' + m[2]; self.value = keep; clearTimeout(liveFindT); bibleFind(false).then(function () { self.value = keep + ':'; refGhost(); }); }
    else commitPassage();
  });
  /* words typed instead of a verse: the matching verses drop down under the box */
  var dropT;
  function hl(t, q) { var i = t.toLowerCase().indexOf(q); if (i < 0) return esc(t); return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); }
  function wordDrop(src) {
    src = src || $('bb-ref'); var words = src.id === 'bb-words';
    var v = src.value.trim(), box = $('bb-drop'); clearTimeout(dropT);
    if (v.length < 3 || (!words && ((/\d/.test(v) && parseRef(spokenToRef(v))) || (/^\S+$/.test(v) && matchBooks(v).length) || /^\s*[123]?\s*[a-z. ]+\s+\d/i.test(v)))) { box.hidden = true; box.innerHTML = ''; return; }
    dropT = setTimeout(function () {
      var q = v.toLowerCase();
      searchVerses(q).then(function (r) {
        if (src.value.trim() !== v) return;
        box.hidden = false; $('bb-sug').innerHTML = '';
        box.innerHTML = r.list.length ? r.list.map(function (o) { return '<button type="button" class="hit" role="option" data-ref="' + esc(o.r) + '"><b>' + esc(o.r) + '</b> ' + hl(o.t, q) + '</button>'; }).join('') : '<p class="help" style="padding:6px 8px;margin:0">No verse has those words in ' + esc(r.tr || 'this version') + '.</p>';
      });
    }, 180);
  }
  $('bb-drop').addEventListener('click', function (e) { var h = e.target.closest('[data-ref]'); if (!h) return; $('bb-drop').hidden = true; $('bb-ref').value = h.dataset.ref; refHints(); bibleFind().then(function () { $('bb-ref').focus(); $('bb-ref').select(); }); });
  $('bb-search').onclick = function () {
    var open = $('bb-wbox').hidden; $('bb-wbox').hidden = !open; this.setAttribute('aria-expanded', open);
    if (open) $('bb-words').focus(); else { $('bb-drop').hidden = true; $('bb-words').value = ''; }
  };
  $('bb-words').addEventListener('input', function () { wordDrop(this); });
  $('bb-words').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var f = $('bb-drop').querySelector('[data-ref]'); if (f) f.click(); } else if (e.key === 'Escape') { $('bb-drop').hidden = true; } });
  $('bb-more').onclick = function () { var open = $('bb-set').hidden; $('bb-set').hidden = !open; this.setAttribute('aria-expanded', open); if (!open) setPop(null); };
  document.addEventListener('mousedown', function (e) { if (!e.target.closest('#bb-drop') && e.target !== $('bb-ref')) $('bb-drop').hidden = true; }, true);

  /* three clickable columns: book, chapter, verse */
  /* the verses of the chapter in a window five rows tall: the verse being shown sits in the middle, scroll to reach the others */
  var vwCenter = false;
  function renderCols() {
    var box = $('bb-cols'); if (!box) return;
    if (!bbVs || bbBook == null) { delete box.dataset.key; box.innerHTML = '<span class="none">Type a passage above, for example John 3. Its verses show here.</span>'; return; }
    var old = box.scrollTop, set = {}; bbSel.forEach(function (n) { set[n] = true; });
    var key = bbBook + ':' + bbCh + ':' + bbVer + ':' + bbVs.length;
    if (box.dataset.key === key && !vwCenter) { [].forEach.call(box.children, function (b) { b.setAttribute('aria-pressed', !!set[+b.dataset.cv]); }); return; } /* same chapter: only the highlight changes */
    box.dataset.key = key;
    var h = ''; for (var v = 1; v <= bbVs.length; v++) h += '<button type="button" role="option" data-cv="' + v + '" aria-pressed="' + (!!set[v]) + '"><b>' + v + '</b><span>' + esc(bbVs[v - 1]) + '</span></button>';
    box.innerHTML = h;
    if (vwCenter) {
      vwCenter = false;
      var first = bbSel.length ? Math.min.apply(null, bbSel) : 1, row = box.children[first - 1];
      box.scrollTop = row ? Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2 - box.firstElementChild.offsetTop) : 0;
    } else box.scrollTop = old;
  }
  function pickVerse(v, e) {
    if (e && e.shiftKey && bbLast) { bbSel = range(Math.min(bbLast, v), Math.max(bbLast, v)); }
    else if (e && (e.ctrlKey || e.metaKey)) { var i = bbSel.indexOf(v); if (i >= 0) bbSel.splice(i, 1); else bbSel.push(v); bbLast = v; }
    else { bbSel = [v]; bbLast = v; }
    updateFound();
  }
  function commitFound() {
    if (!bbFound) return;
    var it = bibleItem(), have = null; items.forEach(function (x) { if (x.kind === 'bible' && !x.temp && x.name === it.name) have = x; });
    if (have) { select(have.id, 0, false); goLive(have.id, 0); } else addItem(it, true);
  }
  $('bb-cols').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cv]'); if (!b || !bbVs) return;
    var v = +b.dataset.cv, dbl = isDouble('vw:' + v);
    if (dbl) { if (bbSel.length !== 1 || bbSel[0] !== v) { bbSel = [v]; bbLast = v; updateFound(); } commitFound(); return; }
    pickVerse(v, e);
  });
  $('bb-sug').addEventListener('click', function (e) { var b = e.target.closest('[data-bk]'); if (!b) return; $('bb-ref').value = BOOKS[+b.dataset.bk] + ' '; $('bb-ref').focus(); refHints(); });
  $('bb-ch').addEventListener('click', function (e) { var b = e.target.closest('[data-ch]'); if (!b) return; $('bb-ref').value = BOOKS[+b.dataset.bk] + ' ' + b.dataset.ch; bibleFind(false); });
  $('bb-all').onclick = function () { if (!bbVs) return; bbSel = bbSel.length === bbVs.length ? [] : range(1, bbVs.length); updateFound(); };
  $('bb-mic').onclick = voiceSearch;
  $('bb-add').onclick = function () { if (bbFound) addItem(bibleItem(), false); };
  $('bb-show').onclick = function () { commitFound(); };

  /* import a Bible the church is licensed to use (a text file with one verse per line, or a json file) */
  function importBible(file) {
    var base = (file.name || 'Bible').replace(/\.[^.]+$/, ''), abbr = (base.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)) || 'MYBIBL';
    return file.text().then(function (t) {
      var d, total = 0, books = USFM.map(function () { return []; });
      if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(t)) {
        var j = JSON.parse(t);
        if (j && Array.isArray(j.books) && j.books[0] && Array.isArray(j.books[0]) && Array.isArray(j.books[0][0])) { books = j.books; abbr = j.abbr || abbr; base = j.name || base; }
        else if (j && Array.isArray(j.books) && Array.isArray(j.books[0]) && typeof j.books[0][0] === 'string') { j.books.forEach(function (bk) { var bi = findBook(bk[0]); if (bi >= 0) books[bi] = bk[1]; }); abbr = j.abbr || abbr; base = j.name || base; }
        else { var cv = convertBible(j, { id: 'x-imp-' + abbr.toLowerCase(), abbr: abbr, name: base }); books = cv.books; }
      } else {
        t.replace(/\r/g, '').split('\n').forEach(function (ln) {
          var m = ln.match(/^\s*((?:[123]|I{1,3})?\s*[A-Za-z][A-Za-z .]*?)\s+(\d+)\s*[:.]\s*(\d+)\s*[\t \-]+(.+?)\s*$/); if (!m) return;
          var bi = findBook(m[1]); if (bi < 0) return;
          var chs = books[bi], ci = +m[2] - 1; if (!chs[ci]) chs[ci] = [];
          chs[ci][+m[3] - 1] = m[4];
        });
      }
      books.forEach(function (chs) { for (var i = 0; i < chs.length; i++) { if (!chs[i]) chs[i] = []; for (var k = 0; k < chs[i].length; k++) { if (chs[i][k] == null) chs[i][k] = ''; else total++; } } });
      if (total < 100) throw new Error('empty');
      var id = 'x-imp-' + abbr.toLowerCase();
      d = { id: id, abbr: abbr, name: base, books: books };
      bibles[id] = d; idb.put('bible:' + id, d, 'bibles');
      bbVers = bbVers.filter(function (v) { return v.id !== id; });
      if (bbVers.length >= VER_MAX) bbVers.pop();
      bbVers.push({ id: id, abbr: abbr, name: base }); saveVers(); setVersion(id); renderVerList();
      toast(base + ' imported (' + total.toLocaleString() + ' verses).');
    });
  }
  $('ver-import').onclick = function () { $('ver-import-file').click(); };
  $('ver-import-file').onchange = function () {
    var f = this.files[0]; this.value = ''; if (!f) return;
    importBible(f).catch(function (er) { if (window.console) console.error(er); $('ver-msg').textContent = 'That file could not be read as a Bible. Use one verse per line, like "John 3:16 For God so loved the world..."'; });
  };

  /* black or light */
  var SKINS = [
    { id: 'dark', n: 'Black', d: 'The default', c: ['#0e0e10', '#1f1f23', '#ff5b52'] },
    { id: 'light', n: 'Light', d: 'Bright and clean', c: ['#eef0f3', '#ffffff', '#d93a30'] },
    { id: 'classic', n: 'Classic', d: 'Cream and burgundy', c: ['#f1e9da', '#e6dcc7', '#8a2b2b'] },
    { id: 'halloween', n: 'Halloween', d: 'Purple and orange', c: ['#120a1a', '#25142f', '#ff7a18'] },
    { id: 'christmas', n: 'Christmas', d: 'Green, red and gold', c: ['#0b1d12', '#16391f', '#e5383b'] },
    { id: 'celebration', n: 'Celebration', d: 'Bright and festive', c: ['#190d2d', '#2c1a58', '#ff4fa3'] },
    { id: 'toys', n: 'Toys', d: 'Playful and colourful', c: ['#fff1c1', '#ffd93d', '#ef476f'] },
    { id: 'ocean', n: 'Ocean', d: 'Deep blue and aqua', c: ['#06202d', '#0f3b50', '#2ec4d6'] },
    { id: 'space', n: 'Space', d: 'Deep space and nebulas', c: ['#05060f', '#141233', '#8b5cff'] },
    { id: 'contrast', n: 'Contrast', d: 'Highest contrast, easy to read', c: ['#000000', '#000000', '#ffe600'] },
    { id: 'aquatic', n: 'Aquatic', d: 'Clear water and bubbles', c: ['#022b3a', '#0b4f66', '#37e0d0'] },
    { id: 'desert', n: 'Desert', d: 'Warm sand and terracotta', c: ['#f1d7a1', '#fbefd2', '#b5451b'] },
    { id: 'dusk', n: 'Dusk', d: 'Purple sky fading to orange', c: ['#2b1055', '#4b2475', '#f08a5d'] },
    { id: 'nightsky', n: 'Night sky', d: 'Moon and stars', c: ['#070b1d', '#111a3f', '#ffe9a8'] },
    { id: 'planets', n: 'Planets', d: 'Ringed worlds in the dark', c: ['#0a0a1c', '#1b1840', '#ff9f5a'] },
    { id: 'geometry', n: 'Geometry', d: 'Clean shapes and angles', c: ['#f5f6fb', '#ffffff', '#ff6b35'] },
    { id: 'ninja', n: 'Ninja', d: 'Charcoal and crimson', c: ['#0b0b0d', '#1a1a1f', '#e01b24'] },
    { id: 'glow', n: 'Glow', d: 'Neon edges', c: ['#07070f', '#13132a', '#00f0ff'] },
    { id: 'mocap', n: 'Motion capture', d: 'Tracking grid and markers', c: ['#050b0d', '#0c1a1d', '#39ff14'] },
    { id: 'sunrise', n: 'Sunrise', d: 'Soft gold and rose', c: ['#ffd9b0', '#fff4e6', '#e4572e'] },
    { id: 'cars', n: 'Cars', d: 'Asphalt, stripes and flags', c: ['#16181c', '#262a31', '#e10600'] },
    { id: 'sponge', n: 'Sea Sponge', d: 'Sunny yellow under the sea', c: ['#6fcdf2', '#fff3a6', '#e8590c'] }
  ];
  function skinOk(t) { return SKINS.some(function (s) { return s.id === t; }); }
  function setTheme(t) {
    if (!skinOk(t)) t = 'dark';
    document.documentElement.setAttribute('data-theme', t); store('ae_ss_theme', t); $('theme').setAttribute('aria-pressed', t === 'light'); $('theme').title = t === 'light' ? 'Switch to black' : 'Switch to light';
    [].forEach.call($('skin-list').querySelectorAll('[data-skin]'), function (b) { b.setAttribute('aria-pressed', b.dataset.skin === t); });
  }
  $('skin-list').innerHTML = SKINS.map(function (s) { return '<button type="button" class="skin" data-skin="' + s.id + '" aria-pressed="false"><span class="sw" style="background:' + s.c[0] + '"><i style="background:' + s.c[1] + '"></i><i style="background:' + s.c[2] + '"></i></span>' + esc(s.n) + '<small>' + esc(s.d) + '</small></button>'; }).join('');
  $('skin-list').addEventListener('click', function (e) { var b = e.target.closest('[data-skin]'); if (b) setTheme(b.dataset.skin); });
  $('skin').onclick = function () { openDlg($('dlg-skin')); };
  $('theme').onclick = function () { setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); };
  setTheme(store('ae_ss_theme'));

  /* photos and videos keep their own shape; this stretches one to fill the screen */
  $('fit').onclick = function () {
    var it = fitTarget(); if (!it || !isMedia(it)) return;
    it.fill = !it.fill;
    if (it.id === liveId) { opts.fit = fitFor(it); send({ type: 'fit', value: opts.fit }); }
    syncFit(); render();
  };

  /* ---- listen to the message: finds verses the speaker reads or names, offline (Whisper runs on this computer) */
  var heardAt = {}, vl = { on: false, worker: null, busy: false, buf: [], len: 0, tail: null, timer: null, stream: null, ctx: null, proc: null, loaded: false };
  function normTxt(s) { return ' ' + String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function verseIndex(id) {
    var d = bibles[id]; if (!d) return null; if (d._ix) return d._ix;
    var ix = []; d.books.forEach(function (chs, b) { chs.forEach(function (vs, c) { vs.forEach(function (t, v) { if (t) ix.push({ b: b, c: c + 1, v: v + 1, n: normTxt(t) }); }); }); });
    Object.defineProperty(d, '_ix', { value: ix, enumerable: false }); return ix;
  }
  function numWords(s) {
    return s.replace(/\b(?:one\s+)?hundred(?:\s+and)?(?:\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))?(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))?\b/g, function (m, t, u) { return String(100 + (t ? NUMW[t] : 0) + (u ? NUMW[u] : 0)); });
  }
  var BOOK_RX = null, REF_TOK = /^(\d+|chapter|verse|verses|colon|to|through|thru|and|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)$/;
  function findRefs(text) {
    if (!BOOK_RX) {
      var names = BOOKS.map(function (b) { return b.toLowerCase().replace(/^[123] /, ''); }).concat(['psalm', 'revelations', 'song of songs']);
      names = names.filter(function (n, i) { return names.indexOf(n) === i; }).sort(function (a, b) { return b.length - a.length; });
      BOOK_RX = new RegExp('\\b(?:(first|second|third|1st|2nd|3rd|1|2|3)\\s+)?(' + names.join('|') + ')\\b', 'g');
    }
    var s = String(text).toLowerCase().replace(/[.,;!?]/g, ' '), out = [], m;
    BOOK_RX.lastIndex = 0;
    while ((m = BOOK_RX.exec(s))) {
      var pre = m[1] ? ({ first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3 }[m[1]] || +m[1]) : '', nm = m[2].replace(/ /g, '');
      if (nm === 'psalm') nm = 'psalms'; if (nm === 'revelations') nm = 'revelation'; if (nm === 'songofsongs') nm = 'songofsolomon';
      var bi = NORM.indexOf((pre ? pre : '') + nm); if (bi < 0) bi = NORM.indexOf(nm); if (bi < 0) continue;
      var tail = numWords(s.slice(BOOK_RX.lastIndex)).trim().split(/\s+/), take = [];
      for (var k = 0; k < tail.length && k < 11; k++) { if (REF_TOK.test(tail[k])) take.push(tail[k]); else break; }
      while (take.length && /^(to|through|thru|and)$/.test(take[take.length - 1])) take.pop();
      if (!take.length) continue;
      var ref = spokenToRef(BOOKS[bi] + ' ' + take.join(' '));
      if (parseRef(ref)) out.push(ref);
    }
    return out;
  }
  function findQuote(text) {
    var ix = verseIndex(bbVer); if (!ix) return null;
    var w = normTxt(text).trim().split(' '); if (w.length < 7) return null;
    var votes = {}, best = null, bv = 0;
    for (var i = 0; i + 7 <= w.length; i += 2) {
      var ph = ' ' + w.slice(i, i + 7).join(' ') + ' ', hit = [];
      for (var k = 0; k < ix.length && hit.length < 4; k++) if (ix[k].n.indexOf(ph) >= 0) hit.push(k);
      if (!hit.length || hit.length > 3) continue;
      hit.forEach(function (k2) { votes[k2] = (votes[k2] || 0) + 1 / hit.length; if (votes[k2] > bv) { bv = votes[k2]; best = ix[k2]; } });
    }
    return best ? BOOKS[best.b] + ' ' + best.c + ':' + best.v : null;
  }
  function addHeard(label, how) {
    var box = $('bb-heard'); box.hidden = false;
    var r = document.createElement('div'); r.className = 'hr'; r.innerHTML = '<span><b>' + esc(label) + '</b> <small class="help">' + esc(how) + '</small></span>';
    box.insertBefore(r, box.firstChild); while (box.children.length > 4) box.removeChild(box.lastChild);
  }
  function heard(ref, how) {
    if (heardAt[ref] && Date.now() - heardAt[ref] < 90000) return; heardAt[ref] = Date.now();
    lookupRef(ref).then(function (f) {
      if (!f) return;
      addItem(bibleItem(f), false);
      addHeard(refText(f) + ' ' + f.tr, how === 'ref' ? 'named by the speaker' : 'read from the Bible');
    });
  }
  function normW(t) { return ' ' + String(t).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  var songNorm = null, songSig = '', songHeardAt = {};
  function songIndex() {
    var lib = songLib(), sig = lib.length + ':' + (lib[0] ? lib[0].title : '');
    if (songNorm && songSig === sig) return songNorm; songSig = sig;
    songNorm = lib.map(function (s) {
      return { s: s, t: normW(s.title), lines: String(s.lyrics || '').split(/\n+/).map(normW).filter(function (l) { return l.trim().split(' ').length >= 5; }) };
    });
    return songNorm;
  }
  function scanSongs(text) {
    var n = normW(text); if (n.trim().split(' ').length < 4) return;
    songIndex().forEach(function (x) {
      var hit = x.t.trim().split(' ').length >= 2 && n.indexOf(x.t) >= 0;
      for (var li = 0; li < x.lines.length && !hit; li++) { var w = x.lines[li].trim().split(' '); for (var i = 0; i + 5 <= w.length; i += 2) if (n.indexOf(' ' + w.slice(i, i + 5).join(' ') + ' ') >= 0) { hit = true; break; } }
      if (!hit || (songHeardAt[x.s.title] && Date.now() - songHeardAt[x.s.title] < 600000)) return;
      songHeardAt[x.s.title] = Date.now();
      var it = songRecItem(x.s); if (it.slides.length) { addItem(it, false); addHeard(x.s.title, 'song heard, added to the service'); }
    });
  }
  function scan(text) {
    scanSongs(text);
    findRefs(text).forEach(function (r) { heard(r, 'ref'); });
    if (!findRefs(text).length) { var q = findQuote(text); if (q) heard(q, 'quote'); }
  }
  function setListenUi(on, msg) {
    $('bb-listen').setAttribute('aria-pressed', on); $('bb-listen').querySelector('span').textContent = on ? 'Stop' : 'Listen'; $('bb-listen-box').hidden = !on;
    if (msg) setMsg(msg);
  }
  function stopListen() {
    vl.on = false; clearInterval(vl.timer);
    try { if (vl.proc) vl.proc.disconnect(); if (vl.stream) vl.stream.getTracks().forEach(function (t) { t.stop(); }); if (vl.ctx) vl.ctx.close(); } catch (e) { /* already closed */ }
    vl.proc = vl.stream = vl.ctx = null; vl.buf = []; vl.len = 0; setListenUi(false, 'Stopped listening.');
  }
  function down16(chunks, len, rate) {
    var all = new Float32Array(len), o = 0; chunks.forEach(function (c) { all.set(c, o); o += c.length; });
    var f = rate / 16000, n = Math.floor(all.length / f), out = new Float32Array(n);
    for (var i = 0; i < n; i++) { var a = Math.floor(i * f), b = Math.max(a + 1, Math.floor((i + 1) * f)), s = 0; for (var k = a; k < b && k < all.length; k++) s += all[k]; out[i] = s / (b - a); }
    return out;
  }
  function ensureWorker() {
    if (vl.worker) return vl.worker;
    vl.worker = new Worker('/tools/whisper-worker.js', { type: 'module' });
    vl.worker.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === 'load' && m.data && m.data.status === 'progress' && m.data.total) setMsg('Getting the listener ready: ' + Math.round(m.data.loaded / m.data.total * 100) + '%');
      else if (m.type === 'listening') { vl.loaded = true; if (vl.on) setMsg('Listening to the message.'); }
      else if (m.type === 'done') { vl.busy = false; var t = (m.data && m.data.text) || ''; if (vl.cb) { var f = vl.cb; vl.cb = null; f(t); } else if (t.trim()) scan(t); }
      else if (m.type === 'error') { vl.busy = false; setMsg('The listener had a problem: ' + m.data, true); if (vl.cb) { var f2 = vl.cb; vl.cb = null; f2(null); } }
    };
    return vl.worker;
  }
  function startListen() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('This computer cannot use a microphone here.', true); return; }
    loadBible(bbVer).then(function () { verseIndex(bbVer); });
    voiceSW();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, channelCount: 1 } }).then(function (st) {
      vl.stream = st; vl.on = true; setListenUi(true, vl.loaded ? 'Listening to the message.' : 'Getting the listener ready (first time only)...');
      var ctx = new (window.AudioContext || window.webkitAudioContext)(); vl.ctx = ctx;
      var src = ctx.createMediaStreamSource(st), proc = ctx.createScriptProcessor(4096, 1, 1); vl.proc = proc;
      proc.onaudioprocess = function (e) { if (!vl.on) return; vl.buf.push(new Float32Array(e.inputBuffer.getChannelData(0))); vl.len += 4096; };
      src.connect(proc); proc.connect(ctx.destination);
      ensureWorker();
      vl.timer = setInterval(function () {
        if (!vl.on || vl.busy || !vl.len) return;
        var chunks = vl.buf, len = vl.len; vl.buf = []; vl.len = 0;
        var a = down16(chunks, len, ctx.sampleRate), rms = 0; for (var i = 0; i < a.length; i += 8) rms += a[i] * a[i]; rms = Math.sqrt(rms / (a.length / 8));
        if (rms < 0.006) return;
        var audio = a; if (vl.tail) { audio = new Float32Array(vl.tail.length + a.length); audio.set(vl.tail, 0); audio.set(a, vl.tail.length); }
        vl.tail = a.slice(Math.max(0, a.length - 24000));
        vl.busy = true; vl.worker.postMessage({ type: 'run', audio: audio, language: 'en' });
      }, 6000);
    }).catch(function () { say('Allow the microphone, then press Listen again.', true); });
  }
  $('bb-listen').onclick = function () { if (vl.on) stopListen(); else startListen(); };
  renderCols();

  /* countdown */
  $('tm-for').onclick = function () { openTimer('for'); };
  $('tm-to').onclick = function () { openTimer('until'); };
  $('tm-bgseg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-bg]'); if (!b) return; tmBg = b.dataset.bg;
    [].forEach.call($('tm-bgseg').querySelectorAll('[data-bg]'), function (x) { x.setAttribute('aria-pressed', x === b); });
    $('tm-stylebox').hidden = tmBg !== 'color';
  });
  $('tm-add').onclick = function () { var it = timerItem(); if (it) { closeDlg($('dlg-timer')); addItem(it, false); } };
  $('tm-show').onclick = function () { var it = timerItem(); if (it) { closeDlg($('dlg-timer')); addItem(it, true); } };

  /* ------------------------------------------------------------------ full screen, install, mobile tabs and keys */
  function inFull() { return !!document.fullscreenElement; }
  function goFull() { if (tvFull()) { say('The TV screen is using full screen. Press F11 to make this window full screen.', true); return Promise.resolve(); } var el = document.documentElement; if (el.requestFullscreen) return el.requestFullscreen().catch(function () { say('Your browser did not allow full screen. Press F11 instead.', true); }); return Promise.resolve(); }
  $('fs').onclick = function () { if (inFull()) document.exitFullscreen(); else goFull(); };
  var installEvt = null;
  (function gate() {
    /* The Presenter runs as an installed app. In an ordinary browser tab only the download screen is shown. */
    var dev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]nogate=1/.test(location.search);
    if (DESK || dev) return;
    $('gate').hidden = false;
    try { $('app').inert = true; $('app').setAttribute('aria-hidden', 'true'); } catch (e) {}
    if (window.PresenterDownload) { var os = window.PresenterDownload.apply($('gate-dl'), 'gate-other'); $('gate-tip').textContent = window.PresenterDownload.tip(os); $('gate-tip').style.whiteSpace = 'pre-line'; }
  })();

  function syncMtabs() { [].forEach.call($('mtabs').children, function (b) { b.setAttribute('aria-selected', b.dataset.view === $('app').dataset.view); }); }
  $('mtabs').addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (!b) return; $('app').dataset.view = b.dataset.view; syncMtabs(); });
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox' && e.target.type !== 'radio') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('gate').hidden) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Enter' && selId && !/BUTTON|A/.test(e.target.tagName)) { e.preventDefault(); goLive(selId, selSlide); }
    else if (e.key === ' ' && !$('media').hidden) { e.preventDefault(); playPause(); }
    else if (e.key === 'b' || e.key === 'B' || e.key === '.') setBlack(!black);
  });
  window.addEventListener('beforeunload', function (e) { if (recorder || items.some(function (x) { return x.stream; })) { e.preventDefault(); e.returnValue = ''; } });


  /* drag the edges between Library, Service and the preview to make them wider, narrower, taller or shorter */
  (function () {
    var main = document.querySelector('.main'), center = $('center'), saved = store('ae_ss_sizes') || {};
    function apply(k, v) { if (k === 'pv') center.style.setProperty('--pv', v + 'px'); else main.style.setProperty('--' + k, v + 'px'); }
    ['c1', 'c2', 'pv'].forEach(function (k) { if (saved[k]) apply(k, saved[k]); });
    function wire(id, k, lo, hi, axis) {
      var g = $(id);
      g.addEventListener('pointerdown', function (e) {
        e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add('on');
        var start = axis === 'x' ? e.clientX : e.clientY, cs = getComputedStyle(k === 'pv' ? center : main);
        var base = k === 'pv' ? center.firstElementChild.getBoundingClientRect().height : parseFloat(cs.getPropertyValue('--' + k)) || (k === 'c1' ? 340 : 270);
        var other = k === 'c1' ? parseFloat(cs.getPropertyValue('--c2')) || 270 : k === 'c2' ? parseFloat(cs.getPropertyValue('--c1')) || 340 : 0;
        function mv(ev) {
          var d = (axis === 'x' ? ev.clientX : ev.clientY) - start, v = Math.round(base + d), max = hi;
          if (k !== 'pv') max = Math.min(hi, main.clientWidth - other - 380);
          v = Math.max(lo, Math.min(max, v)); apply(k, v); saved[k] = v; fitSlides(document);
        }
        function up() { g.classList.remove('on'); g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); store('ae_ss_sizes', saved); }
        g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
      });
      g.addEventListener('dblclick', function () { delete saved[k]; if (k === 'pv') center.style.removeProperty('--pv'); else main.style.removeProperty('--' + k); store('ae_ss_sizes', saved); fitSlides(document); });
    }
    function placeG3() { var f = center.firstElementChild.getBoundingClientRect(), c = center.getBoundingClientRect(); $('gut3').style.top = Math.round(f.bottom - c.top - 2) + 'px'; }
    if (window.ResizeObserver) new ResizeObserver(placeG3).observe(center.firstElementChild); window.addEventListener('resize', placeG3); setTimeout(placeG3, 400);
    wire('gut1', 'c1', 220, 620, 'x'); wire('gut2', 'c2', 190, 520, 'x'); wire('gut3', 'pv', 150, 700, 'y');
  })();

  /* ------------------------------------------------------------------ start */
  if (!('BroadcastChannel' in window)) say('This browser is too old for the presenter. Use a current Chrome, Edge or Firefox on a computer.', true);
  (function () { var sb = store('ae_ss_bset'); if (sb && sb.per) bset.per = sb.per; if (sb && sb.look != null && LOOKS[sb.look]) bset.look = sb.look; })();
  function restoreService() {
    var saved = store('ae_ss_service'), n = 0;
    if (saved && saved.length) {
      saved.forEach(function (x) {
        var it = x;
        if (x.mediaId) {
          var m = findMedia(x.mediaId); if (!m) return;
          it = mediaToItem(m);
          for (var k in x) if (k !== 'slides' && k !== 'thumb' && k !== 'file') it[k] = x[k];
        }
        if (it.kind === 'timer' && it.mode !== 'clock') it.end = timerEnd(it);
        it.id = 'i' + uid++; items.push(it); n++;
      });
      if (n) { selId = items[0].id; setTimeout(function () { say('Your last service was restored.' + (n < saved.length ? ' Cameras and screens need starting again.' : '')); }, 300); }
    }
    renderSlides(); render(); autoTick();
  }
  idb.get('song-bg').then(function (r) { if (r && r.file) { songBg = { type: r.type, file: r.file, name: r.name, thumb: r.type === 'image' ? URL.createObjectURL(r.file) : (r.thumb || '') }; drawSongBg(); bgChanged(); } });
  idb.get('scripture-bg').then(function (r) { if (r && r.file) { bbBg.set({ type: r.type, file: r.file, name: r.name, thumb: r.type === 'image' ? URL.createObjectURL(r.file) : (r.thumb || '') }); bgChanged(); } });
  idb.get('logo').then(function (r) { if (r && r.file) { logoFile = { file: r.file, url: URL.createObjectURL(r.file) }; $('logo-name').textContent = r.name || 'Logo'; bgChanged(); } });
  /* a starter pack: twelve geometric pictures and three moving backgrounds, made for this app */
  function addStarter(silent) {
    return fetch('/tools/second-screen-presenter/backgrounds/index.json').then(function (r) { return r.json(); }).then(function (list) {
      var have = {}; media.forEach(function (m) { have[m.name] = true; });
      return Promise.all(list.map(function (o) {
        var ext = o.f.split('.').pop(), nm = o.n + '.' + ext; if (have[nm]) return null;
        return fetch('/tools/second-screen-presenter/backgrounds/' + o.f).then(function (r) { return r.blob(); }).then(function (b) { return new File([b], nm, { type: ext === 'webm' ? 'video/webm' : ext === 'mp4' ? 'video/mp4' : 'image/jpeg' }); });
      })).then(function (fs) { fs = fs.filter(Boolean); store('ae_ss_starter', 2); if (!fs.length) { if (!silent) say('The starter backgrounds are already in Media.'); return; } return addFiles(fs).then(function () { if (!silent) say('Starter backgrounds added to Media. Use them behind songs and verses.'); }); });
    }).catch(function () { if (!silent) say('The starter backgrounds could not be loaded. Check your internet connection.', true); });
  }
  $('m-starter').onclick = function () { addStarter(false); };
  loadMedia().then(function () { restoreService(); if (store('ae_ss_starter') !== 2) addStarter(true); }, restoreService);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (ok) { if (ok) $('save-note').textContent = 'Your songs, Media and Bible versions are saved in this browser on this computer and the browser is asked to keep them. Use Back up to keep a copy or move them to another computer.'; }).catch(function () {});
  renderSongs(); renderMedia(); drawSongBg(); renderSlides(); render(); syncMtabs();
  window.__ss = { splitState: function () { return { split: split, live2Id: live2Id, live2Slide: live2Slide }; }, svcOrder: svcOrder, refGhost: refGhost, restOf: restOf, commitPassage: commitPassage, findRefs: findRefs, scan: scan, findQuote: findQuote, items: items, media: media, addFiles: addFiles, addMedia: addMedia, goLive: goLive, step: step, select: select, displays: displays, stages: stages, parseRef: parseRef, spokenToRef: spokenToRef, matchBooks: matchBooks, parseSong: parseSong, linkItem: linkItem, state: state, bibleFind: bibleFind, bibleItem: bibleItem, lookupRef: lookupRef, bibles: bibles, addStreamItem: addStreamItem, refHints: refHints, rtc: rtc, effBg: effBg, setAuto: setAuto, autoTick: autoTick, openEdit: openEdit, setSongBg: setSongBg, convertBible: convertBible, drawLive: drawLive,
    get liveId() { return liveId; }, get liveSlide() { return liveSlide; }, get selId() { return selId; }, get selSlide() { return selSlide; }, get vstat() { return vstat; }, get conns() { return conns; }, get peer() { return peer; }, get opId() { return opId; }, get bbFound() { return bbFound; }, get bbSel() { return bbSel; }, get bbVers() { return bbVers; }, get autoRun() { return autoRun; }, get songBg() { return songBg; }, get opts() { return opts; } };
})();

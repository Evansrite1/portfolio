/* keys.js : shared keyboard shortcuts for the single-purpose tool pages.
   Ctrl or Cmd + Enter runs the main action, Ctrl or Cmd + S does the same for tools that make a file,
   / jumps to the first field, ? opens the list. Pages with their own full key maps do not load this file. */
(function () {
  'use strict';
  var slug = (location.pathname.match(/\/tools\/([^\/]+)\//) || [])[1] || '';
  /* the main action of each tool, in priority order: the first one that is visible and enabled wins */
  var MAIN = {
    'qr-code-generator': ['btn-png'], 'wifi-qr-code-generator': ['btn-png'], 'remove-background': ['bg-png'],
    'qr-code-scanner': ['scan-start', 'scan-open'], 'whatsapp-link-generator': ['wa-copy'], 'currency-calculator': ['fx-copy'],
    'color-picker': ['cp-copy-css', 'cp-save'], 'image-converter': ['ic-zip', 'ic-pick'], 'invoice-generator': ['dg-pdf'],
    'receipt-generator': ['dg-pdf'], 'pdf-converter': ['pc-to-go', 'pc-from-go', 'pc-edit-go'],
    'screen-recorder': ['sr-stop', 'sr-dl', 'sr-start'], 'video-compressor': ['vc-go', 'vc-pick'],
    'video-converter': ['cv-go', 'cv-pick'], 'video-trimmer': ['vt-go', 'vt-pick'], 'watermark-maker': ['wm-apply', 'wm-pickimg']
  };
  /* the buttons that hand you a finished file, for Ctrl or Cmd + S */
  var SAVE = { 'qr-code-generator': ['btn-png'], 'wifi-qr-code-generator': ['btn-png'], 'remove-background': ['bg-png'], 'image-converter': ['ic-zip'],
    'invoice-generator': ['dg-pdf'], 'receipt-generator': ['dg-pdf'], 'pdf-converter': ['pc-to-go', 'pc-from-go', 'pc-edit-go'],
    'screen-recorder': ['sr-dl'], 'video-compressor': ['vc-go'], 'video-converter': ['cv-go'], 'video-trimmer': ['vt-go'], 'watermark-maker': ['wm-apply'] };
  var ids = MAIN[slug];
  if (!ids) return;
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  var MOD = mac ? 'Cmd' : 'Ctrl';

  function usable(el) { return el && !el.disabled && !el.hidden && el.getClientRects().length > 0 && !el.closest('[hidden]'); }
  function firstUsable(list) {
    for (var i = 0; i < list.length; i++) { var el = document.getElementById(list[i]); if (usable(el)) return el; }
    return null;
  }
  function mainButton() { return firstUsable(ids); }
  function saveButton() { return SAVE[slug] ? firstUsable(SAVE[slug]) : null; }
  /* nothing is ready to run yet: take the person to where they start */
  function getStarted() {
    var f = firstField();
    if (f) { f.focus(); return true; }
    var fi = document.querySelector('.tool input[type=file]');
    if (fi) { fi.click(); return true; }
    return false;
  }
  function label(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function typing(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  function firstField() {
    var list = document.querySelectorAll('.tool input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=hidden]), .tool textarea');
    for (var i = 0; i < list.length; i++) if (usable(list[i])) return list[i];
    return null;
  }

  /* ---------- help panel ---------- */
  var css = document.createElement('style');
  css.textContent =
    '.ks-fab{position:fixed;left:14px;bottom:14px;z-index:60;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;cursor:pointer;border:1px solid var(--line,#333);background:var(--raised,#161616);color:var(--soft,#aaa);padding:0}' +
    '.ks-fab:hover,.ks-fab:focus-visible{color:var(--ink,#fff);border-color:var(--accent,#e8412e)}.ks-fab svg{width:22px;height:22px}' +
    '.ks-back{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.6);display:grid;place-items:center;padding:16px}.ks-back[hidden]{display:none}' +
    '.ks-box{width:min(460px,100%);background:var(--raised,#161616);color:var(--ink,#fff);border:1px solid var(--line,#333);border-radius:16px;padding:22px 22px 18px;box-shadow:0 30px 80px rgba(0,0,0,.5)}' +
    '.ks-box h2{margin:0 0 12px;font-size:1.1rem}.ks-box table{width:100%;border-collapse:collapse}.ks-box td{padding:8px 0;border-top:1px solid var(--line,#333);font-size:.92rem;vertical-align:top}' +
    '.ks-box td:first-child{white-space:nowrap;padding-right:16px}.ks-box kbd{font:inherit;font-size:.8rem;border:1px solid var(--line,#444);border-bottom-width:2px;border-radius:6px;padding:2px 7px;background:var(--paper,#0d0d0d)}' +
    '.ks-box .ks-x{margin-top:14px}@media print{.ks-fab{display:none}}';
  document.head.appendChild(css);

  var fab = document.createElement('button');
  fab.type = 'button'; fab.className = 'ks-fab'; fab.title = 'Keyboard shortcuts (press ?)'; fab.setAttribute('aria-label', 'Keyboard shortcuts');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.2"/><path d="M6 10h1.5M10.5 10H12M15 10h3M6 14h2M16 14h2M9.5 14h5"/></svg>';
  var back = document.createElement('div');
  back.className = 'ks-back'; back.hidden = true;
  var last = null;
  function kbd(s) { return s.split(' + ').map(function (k) { return '<kbd>' + k + '</kbd>'; }).join(' + '); }
  function rows() {
    var r = [], primary = mainButton() || document.getElementById(ids[0]);
    r.push([MOD + ' + Enter', primary ? label(primary) || 'Run the main action' : 'Run the main action']);
    if (SAVE[slug]) r.push([MOD + ' + S', 'Save the finished file, when there is one']);
    if (firstField()) r.push(['/', 'Jump to the first field']);
    r.push(['Esc', 'Leave the field you are typing in, or close this list']);
    r.push(['?', 'Show or hide this list']);
    return r;
  }
  function open() {
    last = document.activeElement;
    back.innerHTML = '<div class="ks-box" role="dialog" aria-modal="true" aria-labelledby="ks-title"><h2 id="ks-title">Keyboard shortcuts</h2><table>' +
      rows().map(function (r) { return '<tr><td>' + kbd(r[0]) + '</td><td>' + r[1] + '</td></tr>'; }).join('') +
      '</table><button type="button" class="btn ks-x">Close</button></div>';
    back.hidden = false;
    back.querySelector('.ks-x').focus();
  }
  function close() { back.hidden = true; if (last && last.focus) last.focus(); }
  back.addEventListener('click', function (e) { if (e.target === back || (e.target.classList && e.target.classList.contains('ks-x'))) close(); });
  fab.addEventListener('click', function () { back.hidden ? open() : close(); });
  document.body.appendChild(fab); document.body.appendChild(back);

  /* ---------- keys ---------- */
  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey, help = e.key === '?' || (e.key === '/' && e.shiftKey);
    if (!back.hidden) {
      if (e.key === 'Escape' || help) { e.preventDefault(); close(); }
      else if (e.key === 'Tab') { e.preventDefault(); var x = back.querySelector('.ks-x'); if (x) x.focus(); }
      return;
    }
    if (mod && !e.altKey && e.key === 'Enter') {
      var b = mainButton();
      e.preventDefault();
      if (b) b.click(); else getStarted();
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S') && SAVE[slug]) {
      var sb = saveButton();
      if (sb) { e.preventDefault(); sb.click(); }
      return;
    }
    if (mod || e.altKey) return;
    var t = e.target;
    if (e.key === 'Escape') { if (typing(t) && t.blur) t.blur(); return; }
    if (typing(t)) return;
    if (help) { e.preventDefault(); open(); }
    else if (e.key === '/') { var f = firstField(); if (f) { e.preventDefault(); f.focus(); if (f.select) f.select(); } }
  }, true);
})();

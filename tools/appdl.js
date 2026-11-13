/* appdl.js: one download helper for the installed apps (Presenter, Video Editor desktop app, IG Scout, File Share).
   AppDL({ base, files: { win, macArm, macIntel, linux, linuxAlt } }) works out the visitor's system and builds the right link.
   Every app is offered for Windows and for Mac (Apple chip and Intel). An app that also lists "linux" (an installer such as a
   .deb, and optionally "linuxAlt" such as an AppImage) is offered for Linux too; apps without it behave exactly as before.
   The files are installers: a Setup program for Windows, a .pkg installer for Mac, a .deb installer for Linux. */
(function () {
  'use strict';
  function detect() {
    var ua = navigator.userAgent || '', p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iphone|ipad|ipod|android|cros/i.test(ua) || (/mac/i.test(p) && navigator.maxTouchPoints > 1)) return null;
    if (/win/i.test(p) || /windows/i.test(ua)) return 'win';
    if (/mac/i.test(p) || /macintosh|mac os x/i.test(ua)) return 'mac';
    if (/linux|x11/i.test(p) || /linux|x11/i.test(ua)) return 'linux';
    return null;
  }
  window.AppDL = function (cfg) {
    var arch = 'arm'; /* most Macs since 2020 have an Apple chip; Chrome and Edge can tell us exactly */
    var hasLinux = !!(cfg.files && cfg.files.linux);
    var ready = (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)
      ? navigator.userAgentData.getHighEntropyValues(['architecture']).then(function (v) { arch = /x86/i.test(v.architecture || '') ? 'intel' : 'arm'; }).catch(function () {})
      : Promise.resolve();
    function link(key) { return cfg.base + cfg.files[key]; }
    function macKey() { return arch === 'intel' ? 'macIntel' : 'macArm'; }
    function a(key, label) { return '<a href="' + link(key) + '" download>' + label + '</a>'; }
    function linuxName(key) { return /\.deb$/i.test(cfg.files[key]) ? 'Linux installer (.deb)' : /\.rpm$/i.test(cfg.files[key]) ? 'Linux installer (.rpm)' : 'Linux (AppImage, no install)'; }
    function linuxLinks() { return hasLinux ? ' | ' + a('linux', linuxName('linux')) + (cfg.files.linuxAlt ? ' | ' + a('linuxAlt', linuxName('linuxAlt')) : '') : ''; }
    function apply(el, extraId) {
      var os = detect();
      if (os === 'linux' && !hasLinux) os = null;
      return ready.then(function () {
        var other = extraId && document.getElementById(extraId);
        if (!el) return os;
        if (!os) {
          el.textContent = cfg.name + ' is for ' + (hasLinux ? 'Windows, Mac and Linux' : 'Windows and Mac') + ' computers';
          el.removeAttribute('href'); el.setAttribute('aria-disabled', 'true');
          if (other) other.innerHTML = 'On a computer: ' + a('win', 'Windows') + ' | ' + a('macArm', 'Mac, Apple chip') + ' | ' + a('macIntel', 'Mac, Intel') + linuxLinks();
          return null;
        }
        if (os === 'win') {
          el.textContent = 'Download for Windows'; el.href = link('win');
          if (other) other.innerHTML = 'Using a Mac? ' + a('macArm', 'Apple chip') + ' | ' + a('macIntel', 'Intel') + (hasLinux ? '. Linux: ' + a('linux', linuxName('linux')) + (cfg.files.linuxAlt ? ' | ' + a('linuxAlt', linuxName('linuxAlt')) : '') : '');
        } else if (os === 'mac') {
          el.textContent = 'Download for Mac' + (arch === 'intel' ? ' (Intel)' : ' (Apple chip)'); el.href = link(macKey());
          var o = arch === 'intel' ? 'macArm' : 'macIntel';
          if (other) other.innerHTML = (arch === 'intel' ? 'Apple chip Mac? ' : 'Intel Mac? ') + a(o, 'Download the ' + (arch === 'intel' ? 'Apple chip' : 'Intel') + ' version') + ' | ' + a('win', 'Windows') + linuxLinks();
        } else {
          el.textContent = 'Download for Linux'; el.href = link('linux');
          if (other) other.innerHTML = (cfg.files.linuxAlt ? a('linuxAlt', linuxName('linuxAlt')) + ' | ' : '') + a('win', 'Windows') + ' | ' + a('macArm', 'Mac, Apple chip') + ' | ' + a('macIntel', 'Mac, Intel');
        }
        el.setAttribute('download', ''); el.removeAttribute('aria-disabled');
        return os;
      });
    }
    function tip(os) {
      if (os === 'win') return 'Open the downloaded Setup file and it installs by itself. If Windows shows "Windows protected your PC", press More info, then Run anyway.';
      if (os === 'mac') return 'Open the downloaded installer and follow the steps. If your Mac says it cannot be opened, right-click it, press Open, then press Open again.';
      if (os === 'linux') return 'Open the downloaded .deb file with your software installer, or run sudo apt install ./file.deb in a terminal. The AppImage needs no install: allow it to run as a program, then double-click it.';
      return '';
    }
    return { detect: detect, apply: apply, tip: tip };
  };
})();

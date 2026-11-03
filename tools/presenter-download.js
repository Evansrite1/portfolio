/* Presenter app download: picks the Windows or Mac file by itself. The files live on the GitHub releases of this site's repository. */
(function () {
  'use strict';
  var BASE = 'https://github.com/Evansrite1/portfolio/releases/latest/download/';
  var FILES = { win: 'Presenter-Setup.exe', mac: 'Presenter-mac.dmg' };
  var NAMES = { win: 'Windows', mac: 'Mac' };

  function detect() {
    var ua = navigator.userAgent || '', p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iphone|ipad|ipod|android|cros/i.test(ua) || (/mac/i.test(p) && navigator.maxTouchPoints > 1)) return null;
    if (/win/i.test(p) || /windows/i.test(ua)) return 'win';
    if (/mac/i.test(p) || /macintosh|mac os x/i.test(ua)) return 'mac';
    return null;
  }
  function url(os) { return BASE + FILES[os]; }

  /* turns a link or button into "Download for Windows" or "Download for Mac"; returns the system it found */
  function apply(el, extraId) {
    var os = detect();
    if (!el) return os;
    if (!os) {
      el.textContent = 'Presenter app is for Windows and Mac computers';
      el.removeAttribute('href'); el.setAttribute('aria-disabled', 'true');
      return null;
    }
    el.textContent = 'Download for ' + NAMES[os];
    el.href = url(os); el.setAttribute('download', '');
    var other = extraId && document.getElementById(extraId);
    if (other) {
      var o = os === 'win' ? 'mac' : 'win';
      other.innerHTML = 'Not ' + NAMES[os] + '? <a href="' + url(o) + '" download>Download for ' + NAMES[o] + '</a>';
    }
    return os;
  }
  function tip(os) {
    if (os === 'win') return 'If Windows shows "Windows protected your PC", press More info, then Run anyway. The app is safe, it is just new.';
    if (os === 'mac') return 'If your Mac says the app cannot be opened, right-click it, press Open, then press Open again.';
    return '';
  }

  window.PresenterDownload = { detect: detect, url: url, apply: apply, tip: tip };
})();

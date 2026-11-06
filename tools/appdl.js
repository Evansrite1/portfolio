/* appdl.js: one download helper for the installed apps (Presenter, Video Editor desktop app, IG Scout).
   AppDL({ base, files: { win, macArm, macIntel } }) works out the visitor's system and builds the right link.
   Every app is offered for Windows and for Mac (Apple chip and Intel). */
(function () {
  'use strict';
  function detect() {
    var ua = navigator.userAgent || '', p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/iphone|ipad|ipod|android|cros/i.test(ua) || (/mac/i.test(p) && navigator.maxTouchPoints > 1)) return null;
    if (/win/i.test(p) || /windows/i.test(ua)) return 'win';
    if (/mac/i.test(p) || /macintosh|mac os x/i.test(ua)) return 'mac';
    return null;
  }
  window.AppDL = function (cfg) {
    var arch = 'arm'; /* most Macs since 2020 have an Apple chip; Chrome and Edge can tell us exactly */
    var ready = (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues)
      ? navigator.userAgentData.getHighEntropyValues(['architecture']).then(function (v) { arch = /x86/i.test(v.architecture || '') ? 'intel' : 'arm'; }).catch(function () {})
      : Promise.resolve();
    function link(key) { return cfg.base + cfg.files[key]; }
    function macKey() { return arch === 'intel' ? 'macIntel' : 'macArm'; }
    function apply(el, extraId) {
      var os = detect();
      return ready.then(function () {
        var other = extraId && document.getElementById(extraId);
        if (!el) return os;
        if (!os) {
          el.textContent = cfg.name + ' is for Windows and Mac computers';
          el.removeAttribute('href'); el.setAttribute('aria-disabled', 'true');
          if (other) other.innerHTML = 'On a computer: <a href="' + link('win') + '" download>Windows</a> | <a href="' + link('macArm') + '" download>Mac, Apple chip</a> | <a href="' + link('macIntel') + '" download>Mac, Intel</a>';
          return null;
        }
        if (os === 'win') {
          el.textContent = 'Download for Windows'; el.href = link('win');
          if (other) other.innerHTML = 'Using a Mac? <a href="' + link('macArm') + '" download>Apple chip</a> | <a href="' + link('macIntel') + '" download>Intel</a>';
        } else {
          el.textContent = 'Download for Mac' + (arch === 'intel' ? ' (Intel)' : ' (Apple chip)'); el.href = link(macKey());
          var o = arch === 'intel' ? 'macArm' : 'macIntel';
          if (other) other.innerHTML = (arch === 'intel' ? 'Apple chip Mac? ' : 'Intel Mac? ') + '<a href="' + link(o) + '" download>Download the ' + (arch === 'intel' ? 'Apple chip' : 'Intel') + ' version</a> | <a href="' + link('win') + '" download>Windows</a>';
        }
        el.setAttribute('download', ''); el.removeAttribute('aria-disabled');
        return os;
      });
    }
    function tip(os) {
      if (os === 'win') return 'If Windows shows "Windows protected your PC", press More info, then Run anyway. The app is safe, it is just new.';
      if (os === 'mac') return 'If your Mac says the app cannot be opened, right-click it, press Open, then press Open again.';
      return '';
    }
    return { detect: detect, apply: apply, tip: tip };
  };
})();

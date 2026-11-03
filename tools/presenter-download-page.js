(function () {
  'use strict';
  if (!window.PresenterDownload) return;
  var os = window.PresenterDownload.apply(document.getElementById('ss-dl'), 'ss-dl-other');
  var tip = document.getElementById('ss-dl-tip');
  if (tip) tip.textContent = window.PresenterDownload.tip(os);
})();

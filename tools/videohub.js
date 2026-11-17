/* Video tools: three buttons (Compressor, Converter, Trimmer) share one page. The address ends in #compress, #convert or #trim. */
(function () {
  'use strict';
  var tabs = [].slice.call(document.querySelectorAll('.vh-tab')), panels = [].slice.call(document.querySelectorAll('.vh-panel'));
  if (!tabs.length) return;
  var names = tabs.map(function (t) { return t.dataset.p; });
  function show(p, push) {
    if (names.indexOf(p) < 0) p = names[0];
    tabs.forEach(function (t) { var on = t.dataset.p === p; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    panels.forEach(function (x) { x.hidden = x.dataset.p !== p; });
    if (push) { try { history.replaceState(null, '', '#' + p); } catch (e) {} }
    try { localStorage.setItem('vh.tab', p); } catch (e) {}
  }
  tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.dataset.p, true); }); });
  window.addEventListener('hashchange', function () { show(location.hash.slice(1), false); });
  var start = location.hash.slice(1);
  if (names.indexOf(start) < 0) { try { start = localStorage.getItem('vh.tab'); } catch (e) {} }
  show(start, false);
})();

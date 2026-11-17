/* Currency pair pages: fills the one-line answer and the quick table from the same rates the calculator uses. */
(function () {
  'use strict';
  var tool = document.getElementById('fx-tool');
  if (!tool || !tool.dataset.from) return;
  var from = tool.dataset.from, to = tool.dataset.to;
  function fmt(n) {
    var d = n >= 100 ? 2 : n >= 1 ? 4 : 6;
    try { return n.toLocaleString('en', { maximumFractionDigits: d }); } catch (e) { return String(n); }
  }
  var last = '';
  function fill() {
    var st = window.fxState;
    if (!st || !st.rates || !st.rates[from] || !st.rates[to]) return;
    var r = st.rates[to] / st.rates[from], key = from + to + r + st.source;
    if (key === last) return;
    last = key;
    var one = document.getElementById('fx-oneline');
    if (one) one.textContent = '1 ' + from + ' = ' + fmt(r) + ' ' + to + (st.kind === 'bundled' ? ' (approximate, the live rates could not be loaded)' : '') + '. 1 ' + to + ' = ' + fmt(1 / r) + ' ' + from + '.';
    document.querySelectorAll('#fx-quick [data-amt]').forEach(function (td) { td.textContent = fmt(Number(td.dataset.amt) * r) + ' ' + to; });
  }
  fill();
  setInterval(fill, 800);
})();

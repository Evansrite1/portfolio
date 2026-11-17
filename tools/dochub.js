/* Invoice and receipt generator: one page, two documents. The address ends in #invoice or #receipt.
   Both documents use the same engine and the same element names, so the page shows one at a time. Switching reloads the page. */
(function () {
  'use strict';
  var k = location.hash.slice(1);
  if (k !== 'invoice' && k !== 'receipt') { try { k = localStorage.getItem('dh.kind'); } catch (e) {} }
  if (k !== 'invoice' && k !== 'receipt') k = 'invoice';
  try { localStorage.setItem('dh.kind', k); } catch (e) {}
  if (location.hash.slice(1) !== k) { try { history.replaceState(null, '', '#' + k); } catch (e) {} }
  document.querySelectorAll('.vh-tab').forEach(function (b) {
    var on = b.dataset.k === k;
    b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.addEventListener('click', function () { if (b.dataset.k === k) return; location.hash = b.dataset.k; location.reload(); });
  });
  var t = document.getElementById('tpl-' + k), mount = document.getElementById('dh-mount');
  mount.appendChild(t.content.cloneNode(true));
  document.querySelectorAll('template').forEach(function (x) { x.remove(); });
  var h1 = document.querySelector('h1'); if (h1) h1.textContent = k === 'invoice' ? 'Invoice generator' : 'Receipt generator';
  document.title = (k === 'invoice' ? 'Free Invoice Generator' : 'Free Receipt Generator') + ': PDF, No Watermark, No Sign-up';
  function load(list) {
    if (!list.length) return;
    var s = document.createElement('script'); s.src = '/tools/' + list[0]; s.async = false;
    s.onload = function () { load(list.slice(1)); };
    document.body.appendChild(s);
  }
  load(['docgen.js', k === 'invoice' ? 'invoicetool.js' : 'receipttool.js']);
})();

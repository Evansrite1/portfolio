(function () {
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var revealTargets = document.querySelectorAll(
    '.section-head, .about-photo, .about-grid > div, .facts, .service, ' +
    '.process-list li, .work-card, .rate-banner, .case-shot, .case-meta > div, ' +
    '.case-body h2, .case-body p, .case-body ul, .banner-shot'
  );

  revealTargets.forEach(function (el) { el.classList.add('reveal'); });

  if (prefersReduced || !('IntersectionObserver' in window)) {
    revealTargets.forEach(function (el) { el.classList.add('in'); });
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry, i) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var delay = (i % 6) * 60;
          setTimeout(function () { el.classList.add('in'); }, delay);
          io.unobserve(el);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  revealTargets.forEach(function (el) { io.observe(el); });

  // ---- Price estimate modal ----
  var modal = document.getElementById('price-modal');
  var openBtn = document.getElementById('open-price-modal');
  if (!modal || !openBtn) return;

  var closeEls = modal.querySelectorAll('[data-close]');
  var form = document.getElementById('price-form');
  var calcBtn = document.getElementById('calc-btn');
  var resultBox = document.getElementById('price-result');
  var prLow = document.getElementById('pr-low');
  var prHigh = document.getElementById('pr-high');
  var rangeField = document.getElementById('pf-range');
  var autoField = document.getElementById('pf-autoresponse');
  var statusEl = document.getElementById('pf-status');
  var sendBtn = document.getElementById('send-btn');

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  openBtn.addEventListener('click', openModal);
  closeEls.forEach(function (el) { el.addEventListener('click', closeModal); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  function selectedScore(id) {
    var el = document.getElementById(id);
    return Number(el.options[el.selectedIndex].dataset.score || 0);
  }

  function calculate() {
    // Each factor contributes 0..1 (its score / its own max), scaled to a
    // budget so the full combination spans roughly $500 to $10,000.
    var contribution =
      (selectedScore('pf-screens') / 3) * 2400 +
      (selectedScore('pf-integrations') / 3) * 2000 +
      (selectedScore('pf-complexity') / 3) * 2400 +
      (selectedScore('pf-timeline') / 2) * 1400 +
      (selectedScore('pf-engagement') / 1) * 1300;

    var base = 500;
    var mid = base + contribution;
    var low = Math.round((mid * 0.82) / 50) * 50;
    var high = Math.round((mid * 1.22) / 50) * 50;
    low = Math.max(500, Math.min(low, 9500));
    high = Math.max(low + 400, Math.min(high, 10000));

    prLow.textContent = low.toLocaleString();
    prHigh.textContent = high.toLocaleString();
    rangeField.value = '$' + low.toLocaleString() + ' to $' + high.toLocaleString();
    autoField.value =
      "Thanks for checking! Based on what you told us, your project's estimated range is $" +
      low.toLocaleString() + ' to $' + high.toLocaleString() +
      ". This is a starting point, not a final quote, Evans will follow up to scope it properly.";

    resultBox.hidden = false;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  calcBtn.addEventListener('click', calculate);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!rangeField.value) { calculate(); }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    statusEl.hidden = true;

    var data = new FormData(form);
    fetch('https://formsubmit.co/ajax/ademiluaolufemi@gmail.com', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: data
    })
      .then(function (res) { if (!res.ok) throw new Error('bad response'); return res.json(); })
      .then(function () {
        statusEl.hidden = false;
        statusEl.textContent = 'Sent — check your inbox for the estimate.';
        statusEl.classList.remove('pf-error');
        sendBtn.textContent = 'Sent ✓';
      })
      .catch(function () {
        statusEl.hidden = false;
        statusEl.classList.add('pf-error');
        var email = encodeURIComponent(document.getElementById('pf-email').value || '');
        var body = encodeURIComponent('My estimated range: ' + rangeField.value);
        statusEl.innerHTML = 'Could not send automatically. <a href="mailto:ademiluaolufemi@gmail.com?subject=Price%20estimate%20request&body=' + body + '">Email it directly instead</a>.';
        sendBtn.disabled = false;
        sendBtn.textContent = 'Email me this estimate';
      });
  });
})();

(function () {
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var revealTargets = document.querySelectorAll(
    '.section-head, .about-photo, .about-text, .fact-card, .service, ' +
    '.process-list li, .work-card, .rate-banner, .case-shot, .case-meta > div, ' +
    '.case-body h2, .case-body p, .case-body ul, .banner-shot, .review-card'
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
  var fieldsBox = document.getElementById('pf-fields');
  var calcBtn = document.getElementById('calc-btn');
  var resultBox = document.getElementById('price-result');
  var rangeField = document.getElementById('pf-range');
  var autoField = document.getElementById('pf-autoresponse');
  var statusEl = document.getElementById('pf-status');
  var sendBtn = document.getElementById('send-btn');
  var emailInput = document.getElementById('pf-email');

  function resetModal() {
    fieldsBox.hidden = false;
    resultBox.hidden = true;
    statusEl.hidden = true;
    statusEl.classList.remove('pf-error');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send me my estimate';
    emailInput.disabled = false;
    rangeField.value = '';
    autoField.value = '';
  }

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
  openBtn.addEventListener('click', function () { resetModal(); openModal(); });
  closeEls.forEach(function (el) { el.addEventListener('click', closeModal); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  function selectedScore(id) {
    var el = document.getElementById(id);
    return Number(el.options[el.selectedIndex].dataset.score || 0);
  }

  // Computes the estimate silently and stores it in the hidden form fields.
  // The number itself is never shown on screen, it only ever reaches the
  // visitor through the email so the whole thing reads as a proper quote,
  // not a toy calculator.
  function calculate() {
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

    rangeField.value = '$' + low.toLocaleString() + ' to $' + high.toLocaleString();
    autoField.value =
      "Thanks for checking! Based on what you told us, your project's estimated range is $" +
      low.toLocaleString() + ' to $' + high.toLocaleString() +
      ". This is a starting point, not a final quote, Evans will follow up to scope it properly.";
  }

  calcBtn.addEventListener('click', function () {
    calculate();
    fieldsBox.hidden = true;
    resultBox.hidden = false;
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    emailInput.focus();
  });

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
        statusEl.textContent = 'Sent. Check your inbox, your estimate is on its way.';
        statusEl.classList.remove('pf-error');
        sendBtn.textContent = 'Sent';
        emailInput.disabled = true;
      })
      .catch(function () {
        statusEl.hidden = false;
        statusEl.classList.add('pf-error');
        var body = encodeURIComponent('My estimated range: ' + rangeField.value);
        statusEl.innerHTML = 'Could not send automatically. <a href="mailto:ademiluaolufemi@gmail.com?subject=Price%20estimate%20request&body=' + body + '">Email it directly instead</a>.';
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send me my estimate';
      });
  });
})();

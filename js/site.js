(function () {
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var revealTargets = document.querySelectorAll(
    '.section-head, .about-photo, .about-grid > div, .facts, .service, ' +
    '.process-list li, .work-card, .rate-banner, .case-shot, .case-meta > div, ' +
    '.case-body h2, .case-body p, .case-body ul'
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
})();

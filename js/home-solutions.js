
/* round 2 interactions: tilting photo, glowing buttons with ripples, booking form */
(function () {
  /* the photo tilts toward the pointer and catches the light */
  var pic = document.getElementById('about-pic');
  if (pic && matchMedia('(pointer: fine)').matches) {
    var card = pic.querySelector('.about-card'), chips = [].slice.call(pic.querySelectorAll('.about-chip'));
    pic.addEventListener('pointermove', function (e) {
      var r = pic.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = 'rotateY(' + (x * 22) + 'deg) rotateX(' + (-y * 22) + 'deg) scale(1.03)';
      card.style.setProperty('--mx', (x + .5) * 100 + '%'); card.style.setProperty('--my', (y + .5) * 100 + '%');
      card.querySelector('.about-shine').style.setProperty('--mx', (x + .5) * 100 + '%');
      card.querySelector('.about-shine').style.setProperty('--my', (y + .5) * 100 + '%');
      chips.forEach(function (c, i) { c.style.translate = (x * (14 + i * 8)) + 'px ' + (y * (14 + i * 8)) + 'px'; });
    });
    pic.addEventListener('pointerleave', function () { card.style.transform = ''; chips.forEach(function (c) { c.style.translate = ''; }); });
  }
  /* glow that follows the pointer, and a ripple on click */
  [].slice.call(document.querySelectorAll('.cbtn')).forEach(function (b) {
    b.addEventListener('pointermove', function (e) { var r = b.getBoundingClientRect(); b.style.setProperty('--mx', (e.clientX - r.left) + 'px'); b.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
    b.addEventListener('pointerdown', function (e) { var r = b.getBoundingClientRect(), s = document.createElement('span'); s.className = 'rip'; s.style.left = (e.clientX - r.left) + 'px'; s.style.top = (e.clientY - r.top) + 'px'; b.appendChild(s); setTimeout(function () { s.remove(); }, 750); });
  });
  /* the four solutions slide in one after another */
  var cards = [].slice.call(document.querySelectorAll('.hsol'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: .15 });
    cards.forEach(function (c) { io.observe(c); });
  } else cards.forEach(function (c) { c.classList.add('in'); });
  /* booking: choose a day and a time, then it opens an email to Evans with everything filled in */
  var form = document.getElementById('book-form'); if (!form) return;
  var days = document.getElementById('bf-days'), times = document.getElementById('bf-times'), note = document.getElementById('bf-note');
  var chosen = { day: '', time: '' }, fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  for (var i = 1, n = 0; n < 7; i++) {
    var d = new Date(); d.setDate(d.getDate() + i); if (d.getDay() === 0) continue;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = fmt.format(d); b.dataset.v = d.toDateString(); days.appendChild(b); n++;
  }
  function pick(box, key) { box.addEventListener('click', function (e) { var c = e.target.closest('.chip'); if (!c) return; [].forEach.call(box.querySelectorAll('.chip'), function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); }); chosen[key] = c.textContent; }); }
  pick(days, 'day'); pick(times, 'time');
  document.getElementById('bf-audit').addEventListener('change', function (e) { document.getElementById('bf-link-wrap').hidden = !e.target.checked; });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements, name = f.name.value.trim(), email = f.email.value.trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { note.textContent = 'Please add your name and a valid email.'; return; }
    if (!chosen.day || !chosen.time) { note.textContent = 'Please choose a day and a time.'; return; }
    var lines = ['Name: ' + name, 'Email: ' + email, 'Preferred day: ' + chosen.day, 'Preferred time: ' + chosen.time + ' (' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'my local time') + ')', '', 'What I want built:', f.project.value.trim() || '(not said yet)'];
    if (f.audit.checked) lines.push('', 'Please send me a free audit of: ' + (f.link.value.trim() || '(link to follow)'));
    location.href = 'mailto:ademiluaolufemi2@gmail.com?subject=' + encodeURIComponent('Meeting request from ' + name) + '&body=' + encodeURIComponent(lines.join('\n'));
    note.textContent = 'Your email app should open with the request filled in. Press send and I will confirm a time.';
  });
})();

/* LinkedIn: show a sample message to copy, then open LinkedIn */
(function () {
  var modal = document.getElementById('li-modal'); if (!modal) return;
  var ta = document.getElementById('li-text'), note = document.getElementById('li-note'), last = null;
  function open(from) { last = from || null; modal.hidden = false; note.textContent = ''; document.getElementById('li-copy').focus(); }
  function close() { modal.hidden = true; if (last && last.focus) last.focus(); }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-li]');
    if (a) { e.preventDefault(); open(a); }
  });
  document.getElementById('li-close').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });
  document.getElementById('li-copy').addEventListener('click', function () {
    function ok() { note.textContent = 'Copied. Paste it into your message to me on LinkedIn.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(ok, function () { ta.select(); document.execCommand('copy'); ok(); });
    else { ta.select(); document.execCommand('copy'); ok(); }
  });
})();

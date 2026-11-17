(function () {
  const t = document.getElementById('t'), bar = document.getElementById('bar'), p = document.getElementById('p');
  window.sr.onTick((s) => { t.textContent = s.text; bar.classList.toggle('paused', !!s.paused); p.textContent = s.paused ? 'Resume' : 'Pause'; });
  p.onclick = () => window.sr.ctl('pause');
  document.getElementById('s').onclick = () => window.sr.ctl('stop');
})();

/* Shared behaviour for every NAVA KW page. */
export const EMAIL = ''; /* her email address goes here; the email buttons stay hidden until it is set */
export const IG = 'navanaiils';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(hover: none)').matches;
export {reduce, coarse};

/* smooth scroll */
export function smoothScroll() {
  if (reduce || !window.Lenis) return null;
  const lenis = new Lenis({duration: 1.15, smoothWheel: true});
  if (window.ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href')); if (!t) return;
    e.preventDefault(); lenis.scrollTo(t, {offset: 0, duration: 1.4});
  }));
  return lenis;
}

/* custom cursor */
export function cursor() {
  const cur = document.getElementById('cur'); if (!cur || coarse) return {big() {}};
  const cx = gsap.quickTo(cur, 'x', {duration: .25, ease: 'power3'}), cy = gsap.quickTo(cur, 'y', {duration: .25, ease: 'power3'});
  addEventListener('pointermove', e => { cx(e.clientX); cy(e.clientY); });
  document.querySelectorAll('a,button,.svc-row,.tile,.sib a').forEach(el => {
    el.addEventListener('pointerenter', () => cur.classList.add('big'));
    el.addEventListener('pointerleave', () => cur.classList.remove('big'));
  });
  return {big(on) { cur.classList.toggle('big', on); }};
}

/* the mouse moves the whole picture: layers with data-depth drift with the pointer */
export function parallax() {
  if (reduce || coarse) return;
  const els = [...document.querySelectorAll('[data-depth]')]; if (!els.length) return;
  const q = els.map(el => ({x: gsap.quickTo(el, 'x', {duration: .9, ease: 'power3'}), y: gsap.quickTo(el, 'y', {duration: .9, ease: 'power3'}), d: parseFloat(el.dataset.depth)}));
  addEventListener('pointermove', e => {
    const mx = e.clientX / innerWidth - .5, my = e.clientY / innerHeight - .5;
    q.forEach(o => { o.x(-mx * o.d); o.y(-my * o.d * .7); });
  });
}

/* split words for reveals */
export function splitWords() {
  document.querySelectorAll('[data-split]').forEach(el => {
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w'; const i = document.createElement('span'); i.textContent = tok; w.appendChild(i); frag.appendChild(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
    });
    walk(el);
  });
}

/* scroll reveals */
export function reveals() {
  document.querySelectorAll('.rv:not(.hero .rv)').forEach(el => gsap.to(el, {opacity: 1, y: 0, duration: 1, ease: 'power3.out', scrollTrigger: {trigger: el, start: 'top 90%', once: true}}));
  document.querySelectorAll('[data-split]').forEach(el => {
    const s = el.querySelectorAll('.w>span'); gsap.set(s, {yPercent: 115});
    gsap.to(s, {yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: .045, scrollTrigger: {trigger: el, start: 'top 88%', once: true}});
  });
}

/* contact buttons: Instagram message always, email only when an address is set */
export function contacts() {
  document.querySelectorAll('[data-ig]').forEach(a => { a.href = `https://ig.me/m/${IG}`; a.target = '_blank'; a.rel = 'noopener'; });
  document.querySelectorAll('[data-email]').forEach(a => {
    if (EMAIL) { a.href = `mailto:${EMAIL}?subject=${encodeURIComponent('Booking request')}`; a.hidden = false; } else a.hidden = true;
  });
}

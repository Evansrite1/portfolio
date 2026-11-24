import {createNailScene} from './nail3d.js';
import {smoothScroll, cursor, parallax, splitWords, reveals, contacts, reduce} from './site.js';

/* Boot for the dedicated service pages: same loader idea as home (nail starts blurry, sharpens, locks, then the page appears). */
export async function bootPage({design = 'nudeGlaze', shape = 'almond', canvasId = 'gl'} = {}) {
  gsap.registerPlugin(ScrollTrigger);
  contacts(); splitWords(); smoothScroll();
  const cur = cursor(); parallax(); reveals();
  const pre = document.getElementById('pre'), canvas = document.getElementById(canvasId);
  const intro = () => gsap.timeline()
    .to('#pre', {opacity: 0, duration: .8, ease: 'power2.out'})
    .fromTo('.nav', {y: -40, opacity: 0}, {y: 0, opacity: 1, duration: .8, ease: 'power3.out'}, '-=.4')
    .to('.dp-hero .rv', {opacity: 1, y: 0, duration: 1, stagger: .12, ease: 'power3.out'}, '-=.5')
    .set('#pre', {display: 'none'});
  let scene = null;
  if (canvas) {
    try { scene = createNailScene(canvas, {mode: 'page', design, shape, satellites: false}); scene.onHover(on => cur.big(on)); }
    catch (e) { console.warn('WebGL unavailable', e); canvas.style.display = 'none'; }
  }
  if (!scene || reduce) { gsap.set('.nav', {opacity: 1}); pre && (pre.style.display = 'none'); document.querySelectorAll('.rv').forEach(e => { e.style.opacity = 1; e.style.transform = 'none'; }); return; }
  scene.startLoading();
  gsap.to('#preFirst', {opacity: 0, duration: .4, onComplete: () => document.getElementById('preFirst') && document.getElementById('preFirst').remove()});
  const bar = document.getElementById('preBar'), num = document.getElementById('preN');
  const p = {v: 0};
  await new Promise(res => gsap.to(p, {v: 1, duration: 1.9, ease: 'power1.inOut', onUpdate: () => { scene.setProgress(p.v); bar.style.width = (p.v * 100) + '%'; num.textContent = String(Math.round(p.v * 100)).padStart(3, '0'); }, onComplete: res}));
  await new Promise(res => scene.onLocked(res));
  await new Promise(r => setTimeout(r, 450));
  intro();
}

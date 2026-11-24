import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------------------------------------------------------------- shapes */
const SHAPES = {
  almond:   {tip: 1.5,  w: .56, mid: .44},
  stiletto: {tip: 1.95, w: .52, mid: .32},
  short:    {tip: 1.1,  w: .6,  mid: .52}
};

function nailGeometry(kind) {
  const P = SHAPES[kind] || SHAPES.almond, b = -1.15, bw = .42;
  const s = new THREE.Shape();
  s.moveTo(-bw, b);
  s.bezierCurveTo(-P.w, -.4, -P.mid, .55, -.09, P.tip - .16);
  s.quadraticCurveTo(0, P.tip + .05, .09, P.tip - .16);
  s.bezierCurveTo(P.mid, .55, P.w, -.4, bw, b);
  s.quadraticCurveTo(0, b - .16, -bw, b);
  let g = new THREE.ExtrudeGeometry(s, {depth: .035, bevelEnabled: true, bevelThickness: .05, bevelSize: .04, bevelSegments: 12, curveSegments: 110});
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  g.center();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i); let z = p.getZ(i);
    z *= 1 - .38 * smooth(.1, P.tip, y);          /* thinner toward the free edge */
    z += -.58 * x * x + .08 * Math.max(0, y) ** 2; /* C curve and a little tip lift */
    p.setZ(i, z);
  }
  g.computeVertexNormals();
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y); }
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - mnx) / (mxx - mnx); uv[i * 2 + 1] = (p.getY(i) - mny) / (mxy - mny); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/* ------------------------------------------------- her designs, painted */
/* Colours are taken from the NAVA KW Instagram: red French, orange French, navy cat eye,
   nude glaze, lilac grey ombre, chrome tip and lime chrome. */
const FINISH = {
  gloss:  {rough: .05, clear: 1,   clearR: .02, env: 1.0, sheen: .25},
  matte:  {rough: .64, clear: 0,   clearR: .5,  env: .65, sheen: .9},
  satin:  {rough: .26, clear: .4,  clearR: .22, env: .85, sheen: .5},
  chrome: {rough: .06, clear: .6,  clearR: .05, env: 1.5, sheen: 0}
};
export const DESIGNS = {
  redFrench:    {finish: 'gloss',  label: 'Red French'},
  orangeFrench: {finish: 'matte',  label: 'Orange French, matte'},
  catEye:       {finish: 'gloss',  label: 'Cat Eye'},
  nudeGlaze:    {finish: 'gloss',  label: 'Nude Glaze'},
  nudeMatte:    {finish: 'matte',  label: 'Nude, matte'},
  lilacOmbre:   {finish: 'satin',  label: 'Lilac Ombre'},
  chromeTip:    {finish: 'chrome', label: 'Chrome Tip'},
  limeChrome:   {finish: 'chrome', label: 'Lime Chrome'}
};

function canvas2d(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function paint(kind) {
  const W = 1024, H = 2048;
  const [c, g] = canvas2d(W, H);
  const [mc, mg] = canvas2d(W, H); /* metalness mask */
  mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H);
  const lin = (a, b) => { const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  const tipPath = (ctx, y0, y1) => { ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(W + 20, -20); ctx.lineTo(W + 20, H * y0); ctx.quadraticCurveTo(W / 2, H * y1, -20, H * y0); ctx.closePath(); };
  const tipFill = (y0, y1, fill, blur = 7) => { g.save(); g.filter = `blur(${blur}px)`; tipPath(g, y0, y1); g.fillStyle = fill; g.fill(); g.restore(); };

  const NUDE = ['#d3a69c', '#ecc7bd'];
  if (kind === 'redFrench') {
    lin(...NUDE);
    const r = g.createLinearGradient(0, 0, 0, H * .3); r.addColorStop(0, '#b30f1d'); r.addColorStop(1, '#7e0a15');
    tipFill(.11, .25, r);
  } else if (kind === 'orangeFrench') {
    lin(...NUDE);
    const r = g.createLinearGradient(0, 0, 0, H * .3); r.addColorStop(0, '#ff7a1f'); r.addColorStop(1, '#e8530a');
    tipFill(.1, .22, r);
  } else if (kind === 'catEye') {
    lin('#060e1b', '#142640');
    g.save(); g.translate(W * .55, H * .5); g.rotate(-.5);
    const b = g.createLinearGradient(-W, 0, W, 0);
    b.addColorStop(.36, 'rgba(110,150,225,0)'); b.addColorStop(.5, 'rgba(185,212,255,.95)'); b.addColorStop(.64, 'rgba(110,150,225,0)');
    g.fillStyle = b; g.fillRect(-W, -H, W * 2, H * 2); g.restore();
    g.globalAlpha = .07; for (let i = 0; i < 240; i++) { g.fillStyle = '#9fc0ff'; g.fillRect(Math.random() * W, 0, 1.2, H); } g.globalAlpha = 1;
  } else if (kind === 'nudeGlaze' || kind === 'nudeMatte') {
    lin('#cfa296', '#e8c3b8');
    const s = g.createRadialGradient(W * .32, H * .32, 20, W * .32, H * .32, W * .75); s.addColorStop(0, 'rgba(255,255,255,.35)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
  } else if (kind === 'lilacOmbre') {
    lin('#a8979f', '#d5cbe0');
  } else if (kind === 'chromeTip') {
    lin(...NUDE);
    const m = g.createLinearGradient(0, 0, W, H * .3); m.addColorStop(0, '#f4eaf2'); m.addColorStop(.5, '#8f8399'); m.addColorStop(1, '#d9cfe2');
    tipFill(.13, .27, m, 5);
    mg.save(); mg.filter = 'blur(5px)'; tipPath(mg, .13, .27); mg.fillStyle = '#fff'; mg.fill(); mg.restore();
  } else { /* limeChrome */
    lin(...NUDE);
    const m = g.createLinearGradient(0, 0, W, H * .3); m.addColorStop(0, '#efe5ee'); m.addColorStop(.5, '#8a7e95'); m.addColorStop(1, '#d6ccdf');
    tipFill(.14, .28, m, 5);
    mg.save(); mg.filter = 'blur(5px)'; tipPath(mg, .14, .28); mg.fillStyle = '#fff'; mg.fill(); mg.restore();
    g.fillStyle = '#d8ff3a'; g.fillRect(0, H * .31, W * .46, H * .15);
  }
  /* natural nail details: white free edge, milky crescent near the cuticle, soft fine noise */
  const fe = g.createLinearGradient(0, 0, 0, H * .09); fe.addColorStop(0, 'rgba(255,255,255,.22)'); fe.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fe; g.fillRect(0, 0, W, H * .09);
  const lu = g.createRadialGradient(W / 2, H, 10, W / 2, H, W * .55); lu.addColorStop(0, 'rgba(255,240,236,.28)'); lu.addColorStop(1, 'rgba(255,240,236,0)');
  g.fillStyle = lu; g.fillRect(0, H * .78, W, H * .22);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 5; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const metal = (kind === 'chromeTip' || kind === 'limeChrome') ? new THREE.CanvasTexture(mc) : null;
  return {tex, metal};
}

let bumpTex = null;
function matteBump() {
  if (bumpTex) return bumpTex;
  const [c, g] = canvas2d(256, 256); const im = g.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) { const v = 120 + Math.random() * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0);
  bumpTex = new THREE.CanvasTexture(c); bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping; bumpTex.repeat.set(5, 9);
  return bumpTex;
}

const matCache = {};
function materialFor(kind) {
  if (matCache[kind]) return matCache[kind];
  const d = DESIGNS[kind], f = FINISH[d.finish], {tex, metal} = paint(kind);
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: tex, roughness: f.rough, metalness: metal ? 1 : 0, metalnessMap: metal || null,
    clearcoat: f.clear, clearcoatRoughness: f.clearR, sheen: f.sheen, sheenRoughness: .5, sheenColor: new THREE.Color(0xe9b9b0),
    envMapIntensity: f.env, iridescence: d.finish === 'gloss' ? .12 : 0, iridescenceIOR: 1.4
  });
  if (d.finish === 'matte') { m.bumpMap = matteBump(); m.bumpScale = .35; }
  return (matCache[kind] = m);
}

/* ------------------------------------------------------------------ scene */
export function createNailScene(canvas, opt = {}) {
  const {mode = 'hero', design = 'redFrench', shape = 'almond', satellites = true} = opt;
  const VW = () => Math.max(1, innerWidth), VH = () => Math.max(1, innerHeight);
  const dpr = Math.min(devicePixelRatio || 1, 2);

  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
  renderer.setPixelRatio(dpr); renderer.setSize(VW(), VH(), false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .86;
  renderer.setClearColor(0x050507, 1);

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), .035).texture;
  scene.fog = new THREE.FogExp2(0x050507, .04);

  const camera = new THREE.PerspectiveCamera(32, VW() / VH(), .1, 100);
  const base = new THREE.Vector3(0, 0, 9);
  const fit = () => { const a = VW() / VH(); camera.aspect = a; base.set(0, 0, a < 1 ? 9 * Math.min(2.1, 1.15 / a) : 9); camera.updateProjectionMatrix(); };
  fit();

  const hero = new THREE.Group(); scene.add(hero);
  const geoms = {almond: nailGeometry('almond'), stiletto: nailGeometry('stiletto'), short: nailGeometry('short')};
  const nail = new THREE.Mesh(geoms[shape], materialFor(design)); nail.scale.setScalar(1.45); hero.add(nail);

  const ringMat = new THREE.MeshBasicMaterial({color: new THREE.Color(2.3, 2.2, 2.1), toneMapped: false});
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.45, .014, 24, 320), ringMat); hero.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.0, .007, 16, 320), new THREE.MeshBasicMaterial({color: new THREE.Color(1.7, .9, 1.1), toneMapped: false, transparent: true, opacity: .6})); ring2.rotation.x = 1.25; hero.add(ring2);
  const ring3 = new THREE.Mesh(new THREE.TorusGeometry(3.5, .006, 16, 320), new THREE.MeshBasicMaterial({color: new THREE.Color(.7, 1.1, 2.1), toneMapped: false, transparent: true, opacity: .45})); ring3.rotation.set(1.2, .5, 0); hero.add(ring3);

  const [gc, gx] = canvas2d(256, 256); const gr = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(.35, 'rgba(233,181,194,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 256, 256);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(gc), transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false}));
  glow.position.z = -1.8; hero.add(glow);

  const sats = [];
  if (satellites) [['chromeTip', 'stiletto', 3.2, 0, .5], ['nudeMatte', 'short', 3.8, 2.1, .42], ['catEye', 'almond', 2.8, 4, .4], ['orangeFrench', 'almond', 3.5, 5.2, .36]].forEach(([k, sh, r, ph, s]) => {
    const m = new THREE.Mesh(geoms[sh], materialFor(k)); m.scale.setScalar(s); hero.add(m); sats.push({m, r, ph});
  });

  const N = 520, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const r = 3 + Math.random() * 7, a = Math.random() * TAU; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - .5) * 9; pos[i * 3 + 2] = Math.sin(a) * r - 3; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({color: 0xffe8ee, size: .02, transparent: true, opacity: .6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false})); scene.add(dust);

  scene.add(new THREE.AmbientLight(0xffffff, .14));
  const key = new THREE.DirectionalLight(0xfff4ee, .8); key.position.set(3, 4, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb8d0ff, .7); rim.position.set(-5, 2, -3); scene.add(rim);
  const pl1 = new THREE.PointLight(0xe9b5c2, 20, 18, 2); scene.add(pl1);
  const pl2 = new THREE.PointLight(0x8db6ff, 16, 18, 2); scene.add(pl2);

  const rt = new THREE.WebGLRenderTarget(VW() * dpr, VH() * dpr, {type: THREE.HalfFloatType, samples: 4});
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(dpr); composer.setSize(VW(), VH());
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(VW(), VH()), .34, .6, .93);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  /* state: S is driven by scroll on the home page */
  const S = {x: mode === 'page' ? (innerWidth > 900 ? 2.3 : 0) : 0, y: mode === 'page' && innerWidth <= 900 ? 1.2 : 0, s: mode === 'page' ? .95 : 1, rot: 0, tilt: 0, ringS: 1, glow: .16};
  const L = {active: false, p: 0, spin: 0, settling: false, free: 1, done: true};
  const mouse = {x: 0, y: 0, tx: 0, ty: 0};
  const hover = {on: false, z: 0, pos: new THREE.Vector3(), cb: null};
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ptr = {x: 0, y: 0, has: false}; let fcount = 0;
  addEventListener('pointermove', e => { mouse.tx = e.clientX / VW() - .5; mouse.ty = e.clientY / VH() - .5; ptr.x = e.clientX; ptr.y = e.clientY; ptr.has = true; });
  addEventListener('pointerleave', () => { ptr.has = false; });
  function pick() {
    if (!ptr.has || L.active) { if (hover.on) { hover.on = false; hover.cb && hover.cb(false); } return; }
    ndc.set(ptr.x / VW() * 2 - 1, -(ptr.y / VH()) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([nail, ...sats.map(s => s.m)], false)[0];
    const on = !!hit; if (on) hover.pos.copy(hit.object.getWorldPosition(new THREE.Vector3()));
    if (on !== hover.on) { hover.on = on; hover.cb && hover.cb(on); }
  }

  const clock = new THREE.Clock(); let elapsed = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), .05); elapsed += dt; const t = elapsed;
    if ((fcount++ & 1) === 0) pick();
    mouse.x += (mouse.tx - mouse.x) * .06; mouse.y += (mouse.ty - mouse.y) * .06;
    hover.z += ((hover.on && !L.active ? 1 : 0) - hover.z) * Math.min(1, dt * 4);

    let rotY;
    if (L.active) {
      /* loading: the nail spins fast and blurry, then slows, sharpens and locks facing front */
      const k = 1 - L.p;
      if (!L.settling) { L.spin += dt * (16 * k * k + .35); }
      else { const target = Math.ceil((L.spin - .001) / TAU) * TAU; L.spin += (target - L.spin) * Math.min(1, dt * 5); if (Math.abs(target - L.spin) < .002) { L.spin = target; L.active = false; L.done = true; L.free = 0; canvas.style.filter = 'none'; L.onLocked && L.onLocked(); } }
      canvas.style.filter = L.active ? `blur(${(Math.pow(k, 1.7) * 26).toFixed(2)}px)` : 'none';
      rotY = L.spin;
    } else {
      L.free = Math.min(1, L.free + dt * .9); const w = smooth(0, 1, L.free);
      rotY = S.rot + (Math.sin(t * .35) * .42 + mouse.x * .7) * w;
    }
    const w2 = L.active ? 0 : smooth(0, 1, L.free);
    hero.position.set(S.x + mouse.x * .45 * w2, S.y - mouse.y * .3 * w2 + Math.sin(t * .8) * .07, 0);
    hero.scale.setScalar(S.s * (1 + hover.z * .06));
    nail.rotation.set(S.tilt + mouse.y * .35 * w2 + Math.sin(t * .5) * .05 * w2, rotY, Math.sin(t * .4) * .04 * w2);
    const rs = S.ringS * (L.active ? .92 + .08 * L.p : 1);
    ring.scale.setScalar(rs); ring.rotation.z = t * .05;
    ring2.scale.setScalar(rs); ring2.rotation.z = t * .08; ring2.rotation.y = Math.sin(t * .3) * .3;
    ring3.scale.setScalar(rs); ring3.rotation.z = -t * .06; ring3.rotation.x = 1.2 + Math.sin(t * .25) * .2;
    glow.material.opacity = S.glow * (L.active ? .4 + .6 * L.p : 1); glow.scale.setScalar(S.ringS * .9);
    sats.forEach((o, i) => { const a = t * (.2 + i * .06) + o.ph; o.m.position.set(Math.cos(a) * o.r * S.ringS, Math.sin(a * 1.3) * .9, Math.sin(a) * o.r * .45); o.m.rotation.set(t * .5 + i, t * .4, t * .3); });
    dust.rotation.y = t * .015;
    pl1.position.set(Math.cos(t * .6) * 5, Math.sin(t * .4) * 3, 3 + Math.sin(t * .5) * 2);
    pl2.position.set(Math.cos(t * .5 + 3) * 5, Math.cos(t * .35) * 3, 3 + Math.cos(t * .4) * 2);

    /* camera: mouse moves the whole picture, hovering a nail zooms toward it */
    const z = smooth(0, 1, hover.z);
    const tgt = new THREE.Vector3(hover.pos.x * .62, hover.pos.y * .62, Math.max(4.6, base.z * .5));
    camera.position.lerpVectors(base, tgt, z);
    camera.position.x += mouse.x * 1.3 * w2 * (1 - z * .6); camera.position.y += -mouse.y * .9 * w2 * (1 - z * .6);
    camera.lookAt(hover.pos.x * .8 * z, hover.pos.y * .8 * z, 0);
    composer.render();
  }
  renderer.setAnimationLoop(frame);
  /* paint the remaining designs one at a time while the loader runs, so scrolling never stutters */
  Object.keys(DESIGNS).forEach((k, i) => setTimeout(() => materialFor(k), 500 + i * 300));

  addEventListener('resize', () => { renderer.setSize(VW(), VH(), false); composer.setSize(VW(), VH()); rt.setSize(VW() * dpr, VH() * dpr); fit(); });

  return {
    S, L, hero, nail, DESIGNS, hover,
    setDesign(kind) { nail.material = materialFor(kind); },
    onHover(cb) { hover.cb = cb; },
    /* loading sequence: call start(), then setProgress(0..1); at 1 the nail settles and locks, then onLocked fires */
    startLoading() { L.active = true; L.p = 0; L.spin = 0; L.settling = false; L.done = false; },
    setProgress(p) { L.p = Math.min(1, Math.max(0, p)); if (L.p >= 1) L.settling = true; },
    onLocked(cb) { L.onLocked = cb; }
  };
}

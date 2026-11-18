/* MPAD QC Lab — cinematic scroll story (prototype).
   One fixed full-screen WebGL stage; each chapter is one of the lab's procedural test
   scenes. Scroll drives (a) which scene is on stage, (b) the camera move through it and
   (c) the test itself (p = 0..1), so every chapter plays like a short film. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DEMOS } from './lab3d.js';

const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;
const root = document.querySelector('[data-story]');
if (root) init();

function init() {
  const stage = root.querySelector('.st-stage'), host = root.querySelector('.st-canvas'), veil = root.querySelector('.st-veil');
  const chapters = [...root.querySelectorAll('.st-ch')];
  const readK = root.querySelector('.st-read .k'), readV = root.querySelector('.st-read b'), readU = root.querySelector('.st-read i'), readS = root.querySelector('.st-read .s');
  const railEls = [...root.querySelectorAll('.st-rail i')], countEl = root.querySelector('.st-count b'), nameEl = root.querySelector('.st-count span');
  const coarse = matchMedia('(pointer: coarse)').matches, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .55;
  scene.fog = new THREE.Fog(0x0a1426, 14, 34);
  const key = new THREE.DirectionalLight(0xffe7c4, 2.6); key.position.set(-5, 9, 6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 34 }); key.shadow.bias = -.0003; key.shadow.normalBias = .02; key.shadow.radius = 4; scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 1.4); rim.position.set(6, 5, -6); scene.add(rim);
  const fill = new THREE.HemisphereLight(0xdfe9ff, 0x1a2234, .35); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 120);

  // dark stage disc with a soft light pool, shared by every scene
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); const gr = g.createRadialGradient(256, 256, 10, 256, 256, 256); gr.addColorStop(0, 'rgba(70,96,150,.55)'); gr.addColorStop(.45, 'rgba(30,46,80,.35)'); gr.addColorStop(1, 'rgba(10,20,38,0)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = -.21; scene.add(pool);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.ShadowMaterial({ opacity: .45 })); catcher.rotation.x = -Math.PI / 2; catcher.position.y = -.2; catcher.receiveShadow = true; scene.add(catcher);
  const dust = (() => { const n = 260, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 18; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - .5) * 18; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd58a, size: .025, transparent: true, opacity: .55, depthWrite: false })); })();
  scene.add(dust);
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: .55, metalness: .25 });

  // build every chapter's scene once (only the active one is visible / rendered)
  const items = chapters.map(el => {
    const d = DEMOS[el.dataset.demo]();
    d.group.traverse(o => { if (o.userData && o.userData.floor) { o.material = plinthMat; o.receiveShadow = true; } });
    d.group.visible = false; scene.add(d.group);
    const T = new THREE.Vector3(...d.cam[1]), P0 = new THREE.Vector3(...d.cam[0]).sub(T).multiplyScalar((d.zoom || 1.32) * 1.05 * (+el.dataset.k || 1));
    return { el, d, T, off: P0, sy: +el.dataset.sy || 0, side: el.dataset.side || 'right', reveal: [...el.querySelectorAll('[data-r]')] };
  });

  let W = 1, H = 1, mobile = false;
  function resize() {
    W = innerWidth; H = innerHeight; mobile = W < 820;
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = mobile ? 40 : 30; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  let pS = -1, active = -1, frame = 0;
  const tmp = new THREE.Vector3(), cp = new THREE.Vector3(), ct = new THREE.Vector3();
  function progress() { const r = root.getBoundingClientRect(); return clamp01(-r.top / Math.max(1, root.offsetHeight - innerHeight)); }
  function setActive(i) {
    if (i === active) return;
    if (active >= 0) items[active].d.group.visible = false;
    active = i; const it = items[i]; it.d.group.visible = true;
    chapters.forEach((c, k) => c.classList.toggle('is-on', k === i));
    railEls.forEach((r, k) => { r.classList.toggle('on', k === i); r.classList.toggle('done', k < i); });
    if (countEl) countEl.textContent = String(i + 1).padStart(2, '0');
    if (nameEl) nameEl.textContent = it.el.dataset.name || '';
    renderer.shadowMap.needsUpdate = true;
  }
  const N = items.length;
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(.1, (now - last) / 1000); last = now; const t = now / 1000;
    const pr = progress();
    if (pS < 0) pS = pr; pS += (pr - pS) * (reduce ? 1 : 1 - Math.exp(-dt * 7));
    const x = pS * N, i = Math.min(N - 1, Math.floor(x)), u = clamp01(x - i);
    setActive(i);
    const it = items[i];
    // the test plays through the middle of the chapter
    const p = reduce ? 1 : clamp01((u - .1) / .72);
    it.d.update(p, t);
    // reveal choreography
    it.reveal.forEach(el => { const a = +el.dataset.r || 0; const k = smooth(clamp01((u - .04 - a * .06) / .1)) * (1 - smooth(clamp01((u - .9) / .08))); el.style.opacity = k.toFixed(3); el.style.transform = `translate3d(0,${((1 - k) * 34).toFixed(1)}px,0)`; });
    if (readV) { const r = it.d.read(p); readK.textContent = r.k; readV.textContent = r.v; readU.textContent = r.u; readS.textContent = r.ok || r.sub; }
    root.style.setProperty('--u', u.toFixed(4));
    // cut through darkness between chapters (like a film edit)
    const fadeIn = 1 - smooth(clamp01(u / .07)), fadeOut = smooth(clamp01((u - .93) / .07));
    veil.style.opacity = (i === 0 ? fadeOut : Math.max(fadeIn, i === N - 1 ? 0 : fadeOut)).toFixed(3);
    // camera: slow orbit + dolly-in through the chapter, entering from above
    const e = smooth(u), az = lerp(-.42, .38, e), lift = lerp(.55, -.05, smooth(clamp01(u / .35))), dolly = lerp(1.28, .9, e);
    tmp.copy(it.off).applyAxisAngle(new THREE.Vector3(0, 1, 0), az); tmp.y += lift * it.off.length() * .5; tmp.multiplyScalar(dolly);
    ct.copy(it.T); cp.copy(it.T).add(tmp);
    if (mobile) cp.addScaledVector(tmp.normalize(), .35 * it.off.length());
    camera.position.copy(cp); camera.lookAt(ct);
    // frame the model away from the words (desktop) / below them (phone)
    const sx = mobile ? 0 : (it.side === 'right' ? -.2 : it.side === 'left' ? .2 : 0), sy = mobile ? -.16 : it.sy;
    camera.setViewOffset(W, H, sx * W, sy * H, W, H);
    it.d.group.rotation.y = Math.sin(t * .15) * .02;
    dust.rotation.y = t * .02; dust.position.y = Math.sin(t * .3) * .1;
    if (frame++ % 8 === 0) renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.autoUpdate = true;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
  root.classList.add('is-live');
}

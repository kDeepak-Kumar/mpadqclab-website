/* MPAD QC Lab — "Explore the site": interactive 3D construction-site atlas.
   Architectural-maquette art direction: matte white clay, graphite metal, hatched soil
   sections, ink hairlines, amber only for the zone being explained.
   Procedural geometry only (no external 3D assets).
   Build: npx esbuild src/atlas.js --bundle --minify --format=iife --outfile=js/atlas.js */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPeople } from './people.js';

const root = document.querySelector('[data-atlas]');
if (root) boot(root);

function webglOK() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}

function boot(section) {
  if (!webglOK()) { section.classList.add('atlas--static'); return; }
  section.classList.add('atlas--live'); // layout must be live before we measure
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const stage = section.querySelector('.atlas-stage');
  const host = section.querySelector('.atlas-canvas');
  const chapters = [...section.querySelectorAll('.atlas-ch')];
  const N = chapters.length;
  const intro = section.querySelector('.atlas-intro'), wrap = section.querySelector('.atlas-ch-wrap');
  function placeIntro() { // phones: hero copy sits above the 3D stage
    const m = innerWidth <= 900;
    if (m && !intro.classList.contains('atlas-intro-m')) { section.insertBefore(intro, stage); intro.classList.add('atlas-intro-m'); }
    else if (!m && intro.classList.contains('atlas-intro-m')) { wrap.insertBefore(intro, wrap.firstChild); intro.classList.remove('atlas-intro-m'); }
  }
  placeIntro();
  const introOffset = () => intro.classList.contains('atlas-intro-m') ? intro.offsetHeight : 0;

  /* ---------------- renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.5 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.62;

  const camera = new THREE.PerspectiveCamera(24, 1, 1, 600);
  const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
  key.position.set(-30, 52, 34); key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 5, far: 160 });
  key.shadow.bias = -0.00025; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 0.6); rim.position.set(34, 20, -30); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xeef5ff, 0x8a7a62, 0.55));

  const world = new THREE.Group(); scene.add(world);

  const V = (x, y, z) => new THREE.Vector3(x, y, z), V3 = V;
  /* ---------------- palette + materials ---------------- */
  const C = {
    clay: 0xcdcac3, clay2: 0xbab6ae, clay3: 0xa9a59d, joint: 0xd8d0c2,
    graphite: 0x2a3140, graphite2: 0x3b4352, steel: 0x6a707a, glass: 0xdfe8f2,
    asphalt: 0x222428, asphalt2: 0x34363b, ink: 0x0a1424,
    brick: 0xa8522f, rust: 0x7b4a33, ply: 0xd9a55c, prop: 0xe2622b, yellow: 0xf2b81e, red: 0xc8392b, blue: 0x2f6db5, orange: 0xe8742a, sand: 0xd6ad6a, agg: 0x8e8b85, msand: 0xc4a274, green: 0x5f9a4a, green2: 0x4a8240, wood: 0xa8743f,
  };
  const AMBER = new THREE.Color(0xf2b01e);
  const zoneMats = {}, zoneEdges = {}, xrayMats = [];
  const matCache = {};
  function reg(zone, m) { (zoneMats[zone] = zoneMats[zone] || []).push(m); return m; }
  function mat(color, zone = 'base', o = {}) {
    const k = color + '|' + zone + '|' + JSON.stringify(o);
    if (matCache[k]) return matCache[k];
    const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, metalness: 0, emissive: 0x000000, emissiveIntensity: 0, envMapIntensity: 1 }, o));
    return (matCache[k] = reg(zone, m));
  }
  const metal = (color, zone) => mat(color, zone, { roughness: 0.42, metalness: 0.65 });
  const edgeCache = {};
  function edgeMat(zone) {
    if (edgeCache[zone]) return edgeCache[zone];
    const m = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.1, depthWrite: false });
    (zoneEdges[zone] = zoneEdges[zone] || []).push(m);
    return (edgeCache[zone] = m);
  }
  function addEdges(mesh, zone, thr = 25) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, thr), edgeMat(zone));
    e.raycast = () => {}; mesh.add(e);
  }
  // build phases: every object belongs to a group that grows in when the tour reaches its chapter
  let cur = null; const PHASES = [];
  function phase(a, b = Infinity, grow = 'y', d = 0.5) { const g = new THREE.Group(); world.add(g); PHASES.push({ g, a, b, grow, d, e: -1 }); cur = g; return g; }
  function endPhase() { cur = world; }
  function place(mesh, x, y, z, zone, edges = true, cast = true) {
    mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true;
    mesh.userData.zone = zone; if (edges) addEdges(mesh, zone);
    (cur || world).add(mesh); return mesh;
  }
  const box = (w, h, d, m, x, y, z, zone, edges = true) => place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z, zone, edges);
  const cyl = (rt, rb, h, m, x, y, z, zone, seg = 24, edges = false) => place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), x, y, z, zone, edges);

  function canvasTex(w, h, draw, rx = 1, ry = 1) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  }
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  // architectural section hatching for soil strata
  function hatch(base, line, kind) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = hex(base); g.fillRect(0, 0, w, h); g.strokeStyle = hex(line); g.fillStyle = hex(line);
      if (kind === 'diag') { g.lineWidth = 2; for (let i = -h; i < w; i += 22) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } }
      if (kind === 'dots') { for (let i = 0; i < 380; i++) { const r = ((i * 37) % 7) / 3 + 1; g.beginPath(); g.arc((i * 97) % w, (i * 53 + (i % 11) * 17) % h, r, 0, 7); g.fill(); } }
      if (kind === 'cross') { g.lineWidth = 1.5; for (let i = -h; i < w; i += 26) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); } }
      if (kind === 'rock') { g.lineWidth = 2; for (let i = 0; i < 26; i++) { const x = (i * 71) % w, y = (i * 43) % h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24, y + 8); g.lineTo(x + 14, y + 26); g.closePath(); g.stroke(); } }
    }, 6, 1);
  }
  const masonry = (rx, ry) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex(C.joint); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
      const v = ((r * 7 + c * 5) % 5) * 7;
      g.fillStyle = `rgb(${176 - v},${86 - v * .5},${52 - v * .3})`;
      g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 2, r * 32 + 2, 60, 28);
    }
  }, rx, ry);
  const pavers = (rx, ry) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex(C.joint); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { const k = (r + c) % 3; g.fillStyle = k === 0 ? '#9c5a3c' : k === 1 ? '#8d8a85' : '#a7a29a'; g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 2, r * 32 + 2, 60, 28); }
  }, rx, ry);

  /* ---------------- plinth: ground with hatched soil strata ---------------- */
  const GX = 48, GZ = 36, GZ0 = -16;
  const strata = [
    [0, -0.9, 0x8a6544, 0x6d4e33, 'dots', 'Topsoil'],
    [-0.9, -2.9, 0xb7663d, 0x96502e, 'diag', 'Red soil / murrum'],
    [-2.9, -4.8, 0xa3988a, 0x857a6c, 'rock', 'Weathered rock'],
    [-4.8, -6.8, 0x767b82, 0x5d6168, 'cross', 'Hard rock'],
  ];
  const strataLabels = [];
  strata.forEach(([top, bot, base, line, kind, label]) => {
    const m = reg('geo', new THREE.MeshStandardMaterial({ map: hatch(base, line, kind), roughness: 0.96, transparent: true, emissiveIntensity: 0 }));
    m.map.repeat.set(GX / 7, (top - bot) / 7 * 2);
    xrayMats.push(m);
    place(new THREE.Mesh(new THREE.BoxGeometry(GX, top - bot, GZ), m), 0, (top + bot) / 2, GZ0 + GZ / 2, 'geo', true, false);
    strataLabels.push({ text: label, pos: new THREE.Vector3(-GX / 2, (top + bot) / 2, GZ0 + GZ) });
  });
  const surfMat = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, map: canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#d9c7a3'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = (i * 37) % 9; g.fillStyle = `rgba(${120 + v * 6},${92 + v * 5},${60 + v * 3},.18)`; g.fillRect((i * 97) % w, (i * 61 + (i % 13) * 7) % h, 3 + (i % 3), 3 + (i % 2)); } }, 3, 2) });
  xrayMats.push(surfMat);
  const surf = new THREE.Mesh(new THREE.BoxGeometry(GX, 0.08, GZ), surfMat);
  surf.position.set(0, 0.04, GZ0 + GZ / 2); surf.receiveShadow = true; world.add(surf);
  // soft contact shadow under the plinth (fake AO)
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(GX * 1.7, GZ * 1.7), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
  ao.rotation.x = -Math.PI / 2; ao.position.set(0, -6.9, GZ0 + GZ / 2); ao.material.opacity = 0.5; world.add(ao);

  /* ---------------- building: rises floor by floor as the tour advances ---------------- */
  const XS = [-5, 2, 9], ZS = [-8, -3, 2], FH = 3.3, COL = 0.6;
  const mConc = mat(C.clay, 'concrete'), mConc2 = mat(C.clay2, 'concrete'), mNdt = mat(C.clay, 'ndt');
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const mBar = mat(C.rust, 'steel', { roughness: .55, metalness: .45 });
  const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
  // excavation pits + footings (steel chapter)
  phase(5.75, Infinity, 'y', 0.35);
  XS.forEach(x => ZS.forEach(z => { box(2.4, 0.08, 2.4, mConc2, x, 0.1, z, 'concrete'); box(0.8, 0.5, 0.8, mConc2, x, 0.35, z, 'concrete'); }));
  // column cages with ties (steel chapter)
  phase(6.0, Infinity, 'y', 0.45);
  const spots = []; XS.forEach(x => ZS.forEach(z => [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a2, b2]) => spots.push([x + a2 * 0.2, z + b2 * 0.2]))));
  const TOP = 2 * FH + 3.4, BOT = 0.1;
  const bars = new THREE.InstancedMesh(barGeo, mBar, spots.length);
  spots.forEach(([x, z], i) => { P.set(x, (TOP + BOT) / 2, z); S.set(1, TOP - BOT, 1); M4.compose(P, Q.identity(), S); bars.setMatrixAt(i, M4); });
  bars.castShadow = true; bars.userData.zone = 'steel'; cur.add(bars);
  const tieGeo = new THREE.BoxGeometry(0.44, 0.02, 0.02); const ties = [];
  XS.forEach(x => ZS.forEach(z => { for (let y = BOT + 0.3; y < TOP - 0.2; y += 0.45) ties.push([x, y, z]); }));
  const tieMesh = new THREE.InstancedMesh(tieGeo, mBar, ties.length * 4); let ti = 0;
  ties.forEach(([x, y, z]) => [[0, 0.2, 0], [0, -0.2, 0], [0.2, 0, Math.PI / 2], [-0.2, 0, Math.PI / 2]].forEach(([dx, dz, r]) => { P.set(x + dx, y, z + dz); Q.setFromAxisAngle(UP, r); S.set(1, 1, 1); M4.compose(P, Q, S); tieMesh.setMatrixAt(ti++, M4); }));
  tieMesh.userData.zone = 'steel'; cur.add(tieMesh);
  // rebar bundle delivered on site
  phase(5.5, Infinity, 'xyz', 0.4);
  const bundle = new THREE.InstancedMesh(barGeo, mBar, 42);
  for (let i = 0; i < 42; i++) { P.set(2.6 + (i % 7) * 0.12, 0.2 + Math.floor(i / 7) * 0.09, 9.4); Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); S.set(1, 7, 1); M4.compose(P, Q, S); bundle.setMatrixAt(i, M4); }
  bundle.castShadow = true; bundle.userData.zone = 'steel'; cur.add(bundle);
  [6.6, 12.2].forEach(z => box(1.2, 0.16, 0.24, mat(C.wood, 'steel'), 3, 0.08, z, 'steel'));
  // concrete chapter: ground-floor columns → first slab → first-floor columns → second slab → deck for the next floor
  const colsFloor = f => XS.forEach(x => ZS.forEach(z => { const ndt = x === 9 && z === 2 && f === 0; box(COL, FH, COL, ndt ? mNdt : mConc, x, f * FH + FH / 2, z, ndt ? 'ndt' : 'concrete'); }));
  const slab = f => { const y = f * FH;
    box(XS[2] - XS[0] + 1.6, 0.24, ZS[2] - ZS[0] + 1.6, mConc, (XS[0] + XS[2]) / 2, y - 0.12, (ZS[0] + ZS[2]) / 2, 'concrete');
    ZS.forEach(z => box(XS[2] - XS[0], 0.46, 0.32, mConc2, (XS[0] + XS[2]) / 2, y - 0.46, z, 'concrete', false));
    XS.forEach(x => box(0.32, 0.46, ZS[2] - ZS[0], mConc2, x, y - 0.46, (ZS[0] + ZS[2]) / 2, 'concrete', false)); };
  phase(6.62, Infinity, 'y', 0.22); colsFloor(0);
  phase(6.78, Infinity, 'y', 0.16); slab(1);
  for (let st = 0; st < 11; st++) box(1.4, 0.3, 0.28, mConc2, XS[1] + 2.6, st * 0.3 + 0.15, ZS[0] + 1.2 + st * 0.28, 'concrete', false);
  phase(6.95, Infinity, 'y', 0.18); colsFloor(1);
  phase(7.08, Infinity, 'y', 0.14); slab(2);
  phase(7.25, Infinity, 'y', 0.2);
  XS.forEach(x => ZS.forEach(z => box(COL, 1.8, COL, mat(C.clay, 'steel'), x, 2 * FH + 0.9, z, 'steel')));
  const mPly = mat(C.ply, 'steel');
  box(7.6, 0.06, 10.6, mPly, 5.5, 3 * FH - 0.03, -3, 'steel');
  for (let px = 2.5; px <= 8.5; px += 2) for (let pz = -7.5; pz <= 1.5; pz += 3) cyl(0.045, 0.045, FH - 0.1, mat(C.prop, 'steel', { roughness: .6 }), px, 2 * FH + (FH - 0.1) / 2, pz, 'steel', 6);
  endPhase();

  // masonry chapter: pallets arrive, then walls rise course by course
  function wall(w, h, d, x, y, z) {
    const m = reg('brick', new THREE.MeshStandardMaterial({ map: masonry(Math.max(w, d) / 1.4, h / 1.4), roughness: 0.95, emissiveIntensity: 0 }));
    return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z, 'brick');
  }
  const bay = (z0, z1, f, hgt) => { const len = Math.abs(z1 - z0) - COL, h = hgt || FH - 0.46; wall(0.24, h, len, XS[0], f * FH + h / 2, (z0 + z1) / 2); };
  phase(7.7, Infinity, 'xyz', 0.35);
  const mPal = mat(C.wood, 'brick');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box(0.9, 0.4, 0.9, mat(j === 2 ? 0xeceae4 : i === 1 ? 0xb25a34 : 0x9e4b2a, 'brick'), -8.6 + j * 1.0, 0.3 + i * 0.42, -2, 'brick');
  box(3.1, 0.12, 1.1, mPal, -7.6, 0.06, -2, 'brick');
  phase(7.95, Infinity, 'y', 0.3);
  bay(ZS[0], ZS[1], 0); bay(ZS[1], ZS[2], 0);
  [[XS[0], XS[1]], [XS[1], XS[2]]].forEach(([a2, b2]) => { const len = b2 - a2 - COL, h = FH - 0.46; wall(len, h, 0.24, (a2 + b2) / 2, h / 2, ZS[0]); });
  phase(8.12, Infinity, 'y', 0.25);
  bay(ZS[0], ZS[1], 1); bay(ZS[1], ZS[2], 1, 1.3);
  phase(8.2, Infinity, 'y', 0.3);
  const pav = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 10), reg('brick', new THREE.MeshStandardMaterial({ map: pavers(1.4, 4.4), roughness: .95, emissiveIntensity: 0 })));
  place(pav, 5.5, 0.1, 8.6, 'brick', false);
  endPhase();

  /* ---------------- water: overhead tank, curing drum, sample bottles ---------------- */
  phase(5, Infinity, 'y', 0.45);
  const TX = -15, TZ = -9, mG = metal(0x4a5160, 'water');
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => box(0.16, 4.2, 0.16, mG, TX + a * 1.1, 2.1, TZ + b * 1.1, 'water', false));
  [1.4, 2.8].forEach(y => { box(2.36, 0.08, 0.08, mG, TX, y, TZ - 1.1, 'water', false); box(0.08, 0.08, 2.36, mG, TX - 1.1, y, TZ, 'water', false); });
  box(2.6, 0.14, 2.6, mG, TX, 4.27, TZ, 'water');
  cyl(1.15, 1.2, 2.3, mat(C.blue, 'water', { roughness: .55 }), TX, 5.5, TZ, 'water', 48, true);
  for (let y = 4.75; y < 6.6; y += 0.45) cyl(1.215, 1.215, 0.05, mat(0x245a98, 'water'), TX, y, TZ, 'water', 48);
  cyl(0.45, 0.45, 0.24, mG, TX, 6.77, TZ, 'water', 32);
  cyl(0.05, 0.05, 4.6, mG, TX + 1.3, 2.4, TZ, 'water', 8);
  cyl(0.55, 0.55, 1.1, mat(0x2f8fc9, 'water', { roughness: .5 }), -10.6, 0.55, -7.8, 'water', 32, true);
  // field test table: pH meter, sample bottles, cool box
  box(1.6, 0.06, 0.8, mat(0xf2f2ee, 'water'), -12.5, 0.86, -6.6, 'water'); [[-.72, -.32], [.72, -.32], [-.72, .32], [.72, .32]].forEach(([a, b]) => box(0.05, 0.82, 0.05, mG, -12.5 + a, 0.45, -6.6 + b, 'water', false));
  box(0.34, 0.12, 0.24, mat(0x2a3140, 'water'), -12.0, 0.95, -6.7, 'water'); box(0.22, 0.01, 0.12, new THREE.MeshBasicMaterial({ color: 0x5fd38a }), -12.0, 1.012, -6.66, 'water', false);
  box(0.6, 0.4, 0.4, mat(0x2f8fc9, 'water'), -10.9, 0.26, -5.9, 'water'); box(0.62, 0.06, 0.42, mat(0xf2f2ee, 'water'), -10.9, 0.49, -5.9, 'water');
  const mGlass = reg('water', new THREE.MeshPhysicalMaterial({ color: C.glass, roughness: 0.08, transmission: 0.6, thickness: 0.2, emissiveIntensity: 0 }));
  for (let i = 0; i < 3; i++) { cyl(0.07, 0.075, 0.26, mGlass, -13.0 + i * 0.22, 1.02, -6.5, 'water', 16); cyl(0.06, 0.06, 0.12, mat([0x7fc4e8, 0xc9b07a, 0x9ad0a8][i], 'water', { roughness: .2, transparent: true, opacity: .85 }), -13.0 + i * 0.22, 0.96, -6.5, 'water', 16); cyl(0.04, 0.04, 0.05, mat(0x1f8fd1, 'water'), -13.0 + i * 0.22, 1.17, -6.5, 'water', 10); }
  // tap at the tank stand
  cyl(0.03, 0.03, 0.4, metal(0xc9d0d8, 'water'), TX + 1.1, 1.0, TZ + 1.1, 'water', 8).rotation.x = Math.PI / 2;

  endPhase();
  /* ---------------- stockpiles ---------------- */
  phase(4, Infinity, 'xyz', 0.45);
  function pile(x, z, r, h, color, seed) {
    const g = new THREE.ConeGeometry(r, h, 56, 8, true); const pos = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const tt = (v.y + h / 2) / h; if (tt > 0.02 && tt < 0.98) { const n = 1 + Math.sin(v.x * 2.3 + seed) * Math.cos(v.z * 1.9 + seed) * 0.045 * (1 - tt); v.x *= n; v.z *= n; } pos.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    return place(new THREE.Mesh(g, mat(color, 'aggregate', { roughness: 1, side: THREE.DoubleSide })), x, h / 2 + 0.06, z, 'aggregate', false);
  }
  pile(-17, 5, 3.2, 2.3, C.sand, 1); pile(-11, 9.2, 2.6, 2.0, C.agg, 2); pile(-18.5, 11.5, 2.4, 1.7, C.msand, 3);
  const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.08, 0), mat(0x77746e, 'aggregate'), 90);
  for (let i = 0; i < 90; i++) { const a = i * 2.4, rr = 2.5 + (i % 7) * 0.12; P.set(-11 + Math.cos(a) * rr, 0.1, 9.2 + Math.sin(a) * rr); Q.setFromEuler(new THREE.Euler(a, a * 2, 0)); S.setScalar(0.7 + (i % 5) * 0.15); M4.compose(P, Q, S); stone.setMatrixAt(i, M4); }
  stone.userData.zone = 'aggregate'; stone.castShadow = true; (cur || world).add(stone);
  for (let i = 0; i < 5; i++) cyl(0.42, 0.42, 0.13, metal(i === 4 ? 0x8a6a3a : 0xc9a24a, 'aggregate'), -13.6, 0.14 + i * 0.14, 13.6, 'aggregate', 32);

  endPhase();
  /* ---------------- concrete: mixer, test bench with cubes + slump cone ---------------- */
  phase(6.85, 8.75, 'xyz', 0.35);
  // transit mixer truck (drum turns in the concrete chapter)
  const truck = new THREE.Group(); truck.position.set(-5.4, 0.06, 9.2); (cur || world).add(truck);
  const tPart = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; o.userData.zone = 'concrete'; truck.add(o); addEdges(o, 'concrete', 40); return o; };
  tPart(new THREE.BoxGeometry(6.2, 0.35, 1.9), metal(0x2b2f36, 'concrete'), 0.3, 0.75, 0);
  tPart(new THREE.BoxGeometry(1.5, 1.55, 2.0), mat(0xf4f4f0, 'concrete', { roughness: .5 }), -2.45, 1.65, 0);
  tPart(new THREE.BoxGeometry(0.06, 0.62, 1.7), mat(0x9ec3e6, 'concrete', { roughness: .1, metalness: .2 }), -3.21, 1.95, 0);
  tPart(new THREE.BoxGeometry(1.52, 0.2, 2.02), mat(C.blue, 'concrete'), -2.45, 1.05, 0);
  [-2.5, 0.9, 2.3].forEach(x => [-1, 1].forEach(sd => { const w = tPart(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 22), mat(0x1c1d20, 'concrete'), x, 0.46, sd * 0.86); w.rotation.x = Math.PI / 2; }));
  const drumPivot = new THREE.Group(); drumPivot.position.set(0.9, 2.05, 0); drumPivot.rotation.z = -Math.PI / 2 + 0.2; truck.add(drumPivot);
  const drumTex = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#e8742a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f6efe2'; g.lineWidth = 10; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 64, h); g.lineTo(i * 64 + 64, 0); g.stroke(); } }, 2, 1);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.05, 3.6, 40, 1, false), reg('concrete', new THREE.MeshStandardMaterial({ map: drumTex, roughness: .55, emissiveIntensity: 0 })));
  drum.userData.zone = 'concrete'; drum.userData.dyn = true; drumPivot.add(drum);
  const chute = tPart(new THREE.BoxGeometry(1.4, 0.06, 0.34), metal(0x8a929c, 'concrete'), 3.6, 2.2, 0); chute.rotation.z = -0.45;
  // slump test plate + cone (the cone is lifted by the technician)
  box(1.0, 0.04, 1.0, metal(0x8a929c, 'concrete'), 1.2, 0.08, 7.6, 'concrete');
  const slumped = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.3, 28), mat(0x9d9a94, 'concrete')); slumped.position.set(1.2, 0.25, 7.6); slumped.userData.dyn = true; (cur || world).add(slumped);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.6, 28, 1, true), metal(0xc9d0d8, 'concrete')); cone.material.side = THREE.DoubleSide; cone.position.set(1.2, 0.4, 7.6); cone.userData.dyn = true; (cur || world).add(cone);
  // curing tank with cubes under water
  box(1.8, 0.7, 1.0, mat(0x3c86c4, 'concrete', { roughness: .4 }), -3.3, 0.41, 12.6, 'concrete');
  box(1.66, 0.02, 0.86, new THREE.MeshStandardMaterial({ color: 0x8fd0f2, roughness: .05, transparent: true, opacity: .8 }), -3.3, 0.77, 12.6, 'concrete', false);
  for (let i = 0; i < 6; i++) box(0.24, 0.24, 0.24, mConc, -3.85 + (i % 3) * 0.4, 0.66, 12.4 + Math.floor(i / 3) * 0.4, 'concrete', false);
  const mBench = mat(C.wood, 'concrete');
  box(2.6, 0.07, 1.3, mBench, -0.6, 0.94, 11.2, 'concrete');
  [[-1.75, 10.7], [0.55, 10.7], [-1.75, 11.7], [0.55, 11.7]].forEach(([x, z]) => box(0.07, 0.86, 0.07, metal(C.graphite, 'concrete'), x, 0.5, z, 'concrete', false));
  for (let i = 0; i < 3; i++) box(0.4, 0.4, 0.4, mConc, -1.5 + i * 0.55, 1.18, 11.0, 'concrete');
  for (let i = 0; i < 3; i++) box(0.46, 0.42, 0.46, metal(0x2b2f36, 'concrete'), -1.4 + i * 0.6, 1.19, 11.6, 'concrete');

  endPhase();
  /* ---------------- NDT on a ground-floor column ---------------- */
  phase(8.9, Infinity, 'y', 0.25);
  const NDTX = XS[2], NDTZ = ZS[2];
  const hammer = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.55, 20), metal(C.graphite, 'ndt'));
  hammer.rotation.x = Math.PI / 2; hammer.position.set(0, -0.04, 0.2); hammer.userData.dyn = true;
  const dotM = mat(C.ink, 'ndt');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.025, 10), dotM); d.position.set(NDTX - 0.18 + c * 0.18, 1.05 + r * 0.16, NDTZ + COL / 2 + 0.004); d.userData.zone = 'ndt'; (cur || world).add(d); }
  [2.15, 2.65].forEach(y => { const h = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), mat(0x6b6760, 'ndt')); h.rotation.y = Math.PI / 2; h.position.set(NDTX + COL / 2 + 0.004, y, NDTZ); h.userData.zone = 'ndt'; (cur || world).add(h); });
  const rings = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.225, 48), new THREE.MeshBasicMaterial({ color: 0xf2b01e, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); r.position.set(NDTX, 1.3, NDTZ + COL / 2 + 0.02); (cur || world).add(r); rings.push(r); }

  endPhase();
  /* ---------------- geotechnical: rig, borehole, cores, plate load ---------------- */
  phase(2, 3.75, 'y', 0.45);
  const RX = 15, RZ = 7, mRig = mat(C.red, 'geo', { roughness: .5, metalness: .3 });
  const apex = new THREE.Vector3(RX, 7.2, RZ);
  [[-2, -1.4], [2, -1.4], [0, 2.2]].forEach(([a, b]) => {
    const foot = new THREE.Vector3(RX + a, 0.06, RZ + b), len = foot.distanceTo(apex);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, len, 10), mRig);
    leg.position.copy(foot).add(apex).multiplyScalar(0.5); leg.quaternion.setFromUnitVectors(UP, apex.clone().sub(foot).normalize());
    leg.castShadow = true; leg.userData.zone = 'geo'; (cur || world).add(leg);
  });
  cyl(0.16, 0.16, 0.36, mRig, RX, 7.1, RZ, 'geo', 16);
  const spt = cyl(0.2, 0.2, 0.7, mat(C.orange, 'geo'), RX, 3.2, RZ, 'geo', 24, true);
  cyl(0.03, 0.03, 6.8, metal(0xaab2bc, 'geo'), RX, 3.4, RZ, 'geo', 6);
  box(1.3, 0.8, 0.9, mat(C.yellow, 'geo'), RX - 2.6, 0.46, RZ + 0.4, 'geo');
  cyl(0.15, 0.15, 0.5, mRig, RX, 0.3, RZ, 'geo', 16);
  cyl(0.16, 0.16, 6.4, mat(0x4a443e, 'geo'), RX, -3.2, RZ, 'geo', 20);
  const sampleM = new THREE.MeshStandardMaterial({ color: 0xf2b01e, emissive: 0x6a4800, emissiveIntensity: 0.6, roughness: 0.6 });
  for (let y = -1.2; y > -6.2; y -= 1.5) cyl(0.19, 0.19, 0.3, sampleM, RX, y, RZ, 'geo', 20);
  for (let i = 0; i < 2; i++) { box(1.6, 0.16, 0.8, mat(C.wood, 'geo'), RX + 2.6, 0.14 + i * 0.18, RZ - 2.2, 'geo'); for (let k = 0; k < 4; k++) { const cr = cyl(0.065, 0.065, 1.4, mat([0x9a6a48, 0xb7663d, 0xa3988a, 0x7d8188][k], 'geo'), RX + 2.6, 0.27 + i * 0.18, RZ - 2.5 + k * 0.2, 'geo', 10); cr.rotation.z = Math.PI / 2; } }
  const PX = 16.5, PZ = -1;
  box(0.6, 0.05, 0.6, mRig, PX, 0.09, PZ, 'geo');
  cyl(0.11, 0.11, 0.9, mRig, PX, 0.56, PZ, 'geo', 16);
  box(5, 0.28, 0.28, metal(0x3b4352, 'geo'), PX, 1.14, PZ, 'geo', false);
  [[-2.2, -1.2], [2.2, -1.2], [-2.2, 1.2], [2.2, 1.2]].forEach(([a, b]) => box(0.4, 1.3, 0.4, mat(C.clay3, 'geo'), PX + a, 0.71, PZ + b, 'geo'));
  box(4.8, 0.18, 3, mat(C.clay2, 'geo'), PX, 1.38, PZ, 'geo');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(1.02, 0.46, 0.84, mat(0x9b9890, 'geo'), PX - 1.65 + i * 1.1, 1.72 + (j % 2) * 0.47, PZ - 0.95 + j * 0.95, 'geo');

  /* ---------------- road: layered section ---------------- */
  const layers = [[0.26, 0xbfae8e, 'GSB'], [0.22, 0x8f8a80, 'WMM'], [0.16, C.asphalt2, 'DBM'], [0.09, C.asphalt, 'BC']];
  let ry = 0.08; const roadLabels = [];
  endPhase();
  layers.forEach(([t, c, lab], i) => {
    phase(9.45 + i * 0.16, Infinity, 'y', 0.16);
    const len = GX - i * 1.5;
    box(len, t, 5, mat(c, 'road', { roughness: i > 1 ? 0.78 : 0.95 }), -GX / 2 + len / 2, ry + t / 2, 16.6, 'road');
    roadLabels.push({ text: lab, pos: new THREE.Vector3(GX / 2 - i * 1.5, ry + t / 2, 19.1) });
    ry += t;
  });
  phase(10.0, Infinity, 'y', 0.12);
  const mLine = mat(0xf5f3ee, 'road', { roughness: 0.6 });
  for (let x = -22; x < 14; x += 3.2) box(1.6, 0.01, 0.12, mLine, x, ry + 0.005, 16.6, 'road', false);
  box(GX - 4.5, 0.01, 0.08, mat(0xf2c218, 'road', { roughness: .6 }), -GX / 2 + (GX - 4.5) / 2, ry + 0.005, 14.4, 'road', false); box(GX - 4.5, 0.01, 0.08, mat(0xf2c218, 'road', { roughness: .6 }), -GX / 2 + (GX - 4.5) / 2, ry + 0.005, 18.8, 'road', false);
  cyl(0.22, 0.22, 0.73, mat(C.asphalt2, 'road'), 21.6, 0.45, 13.6, 'road', 28, true);
  const ROADTOP = ry;
  endPhase();


  /* ---------------- surveying & planning: total station, prism, control points, contours ---------------- */
  // plot boundary: pegs + string line fixed by the survey (they stay for the whole build)
  phase(0.95, Infinity, 'y', 0.35);
  const BX0 = -23.2, BX1 = 23.2, BZ0 = -15.4, BZ1 = 13.4, pegM = mat(0xd9a24a, 'survey');
  for (let x = BX0; x <= BX1 + 0.01; x += (BX1 - BX0) / 8) [BZ0, BZ1].forEach(z => box(0.12, 0.6, 0.12, pegM, x, 0.36, z, 'survey', false));
  for (let z = BZ0; z <= BZ1 + 0.01; z += (BZ1 - BZ0) / 6) [BX0, BX1].forEach(x => box(0.12, 0.6, 0.12, pegM, x, 0.36, z, 'survey', false));
  const strM = mat(0xf2b01e, 'survey', { roughness: .5 });
  [[BX0, BZ0, BX1, BZ0], [BX0, BZ1, BX1, BZ1], [BX0, BZ0, BX0, BZ1], [BX1, BZ0, BX1, BZ1]].forEach(([x0, z0, x1, z1]) => box(Math.max(0.03, x1 - x0), 0.03, Math.max(0.03, z1 - z0), strM, (x0 + x1) / 2, 0.6, (z0 + z1) / 2, 'survey', false));
  phase(1, 2.75, 'y', 0.45);
  const SVX = 10.5, SVZ = 11.6, mSv = metal(C.graphite, 'survey');
  const tsApex = new THREE.Vector3(SVX, 1.45, SVZ);
  [[-.55, -.35], [.55, -.35], [0, .6]].forEach(([a, b]) => {
    const foot = new THREE.Vector3(SVX + a, 0.06, SVZ + b), len = foot.distanceTo(tsApex);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, len, 8), mat(0xd9a24a, 'survey'));
    leg.position.copy(foot).add(tsApex).multiplyScalar(0.5); leg.quaternion.setFromUnitVectors(UP, tsApex.clone().sub(foot).normalize()); leg.castShadow = true; leg.userData.zone = 'survey'; (cur || world).add(leg);
  });
  box(0.34, 0.08, 0.34, mSv, SVX, 1.5, SVZ, 'survey');
  box(0.3, 0.42, 0.22, mat(0xf2b01e, 'survey', { roughness: .5 }), SVX, 1.75, SVZ, 'survey');
  cyl(0.07, 0.07, 0.3, mSv, SVX, 1.82, SVZ + 0.05, 'survey', 16).rotation.x = Math.PI / 2;
  // prism pole at a far corner + GNSS base station
  const PRX = 19, PRZ = -12;
  for (let k = 0; k < 4; k++) cyl(0.025, 0.025, 0.55, mat(k % 2 ? 0xf3f0ea : C.red, 'survey'), PRX, 0.34 + k * 0.55, PRZ, 'survey', 8);
  cyl(0.11, 0.11, 0.08, mSv, PRX, 2.3, PRZ, 'survey', 20, true);
  const gx = -21, gz = -12;
  [[-.4, -.3], [.4, -.3], [0, .45]].forEach(([a, b]) => cyl(0.025, 0.025, 1.6, mat(0xd9cbb3, 'survey'), gx + a * .5, 0.8, gz + b * .5, 'survey', 6));
  cyl(0.22, 0.22, 0.08, mat(0xf3f0ea, 'survey'), gx, 1.65, gz, 'survey', 24, true);
  // laser line from the instrument to the prism (shown in the survey chapter)
  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(SVX, 1.82, SVZ), new THREE.Vector3(PRX, 2.3, PRZ)]);
  const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xf2b01e, transparent: true, opacity: 0 })); beam.userData.dyn = true; (cur || world).add(beam);
  // surveyed grid points + contour lines on the plot surface
  const ptGeo = new THREE.ConeGeometry(0.09, 0.3, 6);
  const ptMesh = new THREE.InstancedMesh(ptGeo, mat(0xf2b01e, 'survey', { roughness: .5 }), 48); let pi = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { P.set(-20 + i * 5.6, 0.2, -14 + j * 5.3); if (Math.abs(P.x - 2) < 8 && P.z > -10 && P.z < 4) { P.y = -5; } M4.compose(P, Q.identity(), S.set(1, 1, 1)); ptMesh.setMatrixAt(pi++, M4); }
  ptMesh.count = pi; ptMesh.userData.zone = 'survey'; (cur || world).add(ptMesh);
  const contourMat = new THREE.LineBasicMaterial({ color: 0xd99a0c, transparent: true, opacity: 0 });
  const contours = [];
  for (let k = 0; k < 5; k++) {
    const pts = []; const r0 = 4 + k * 2.6;
    for (let a = 0; a <= 64; a++) { const t2 = a / 64 * Math.PI * 2, r = r0 * (1 + 0.12 * Math.sin(t2 * 3 + k) + 0.06 * Math.cos(t2 * 5)); pts.push(new THREE.Vector3(-13 + Math.cos(t2) * r * 1.2, 0.1, -9 + Math.sin(t2) * r * .55)); }
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.filter(p => p.x > -23.5 && p.x < 23.5 && p.z > -15.8 && p.z < 13.5)), contourMat); ln.userData.dyn = true; (cur || world).add(ln); contours.push(ln);
  }

  endPhase();
  /* ---------------- rebar mesh on the formwork deck (steel fixing in progress) ---------------- */
  phase(7.32, Infinity, 'y', 0.2);
  const deckY = 3 * FH + 0.02, meshBars = [];
  for (let x = 2.0; x <= 9.0; x += 0.5) meshBars.push([x, -8.0, x, 2.0]);
  for (let z = -8.0; z <= 2.0; z += 0.5) meshBars.push([2.0, z, 9.0, z]);
  const rbM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), mBar, meshBars.length);
  meshBars.forEach(([x0, z0, x1, z1], i) => { P.set((x0 + x1) / 2, deckY + (x0 === x1 ? 0.06 : 0.1), (z0 + z1) / 2); Q.setFromEuler(new THREE.Euler(x0 === x1 ? Math.PI / 2 : 0, 0, x0 === x1 ? 0 : Math.PI / 2)); S.set(1, Math.hypot(x1 - x0, z1 - z0), 1); M4.compose(P, Q, S); rbM.setMatrixAt(i, M4); });
  rbM.userData.zone = 'steel'; (cur || world).add(rbM);

  endPhase();
  /* ---------------- structural design: site design desk + analysis overlay on the frame ---------------- */
  const DX = -3.2, DZ = 5.6;
  phase(3, 4.75, 'xyz', 0.45);
  [[-1.6, -1.1], [1.6, -1.1], [-1.6, 1.1], [1.6, 1.1]].forEach(([a2, b2]) => cyl(0.05, 0.05, 2.5, metal(0x8a929c, 'design'), DX + a2, 1.3, DZ + b2, 'design', 8));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 0.7, 4, 1), mat(C.blue, 'design', { roughness: .6 })); roof.rotation.y = Math.PI / 4; roof.scale.set(1.3, 1, 0.92); place(roof, DX, 2.9, DZ, 'design', true);
  const blueprint = canvasTex(512, 340, (g, w, h) => {
    g.fillStyle = '#1f5fae'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
    g.strokeRect(20, 20, w - 40, h - 40); g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(70 + i * 110, 50); g.lineTo(70 + i * 110, h - 50); g.stroke(); }
    for (let j = 0; j < 4; j++) { g.beginPath(); g.moveTo(50, 70 + j * 70); g.lineTo(w - 50, 70 + j * 70); g.stroke(); }
    g.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(64 + i * 110, 64 + j * 70, 12, 12);
    g.font = 'bold 18px monospace'; g.fillText('GF COLUMN LAYOUT', 40, h - 26);
  });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 1.1), [mat(0xf2f2ee, 'design'), mat(0xf2f2ee, 'design'), reg('design', new THREE.MeshStandardMaterial({ map: blueprint, roughness: .7, emissiveIntensity: 0 })), mat(0xf2f2ee, 'design'), mat(0xf2f2ee, 'design'), mat(0xf2f2ee, 'design')]);
  desk.rotation.x = 0.18; place(desk, DX, 1.0, DZ, 'design', false);
  [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]].forEach(([a2, b2]) => box(0.05, 0.95, 0.05, metal(0x2b2f36, 'design'), DX + a2, 0.5, DZ + b2, 'design', false));
  // easel board with the building's analysis model
  const boardTex = canvasTex(384, 384, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.lineWidth = 6; const cols = [60, 190, 320], lv = [330, 230, 130, 40];
    const heat = t => `hsl(${(1 - t) * 220},80%,48%)`;
    cols.forEach((x, i) => lv.slice(0, 3).forEach((y, j) => { g.strokeStyle = heat(1 - j / 3); g.beginPath(); g.moveTo(x, y); g.lineTo(x, lv[j + 1]); g.stroke(); }));
    lv.slice(1).forEach((y, j) => { g.strokeStyle = heat(.6 - j * .15); g.beginPath(); g.moveTo(cols[0], y); g.lineTo(cols[2], y); g.stroke(); });
    g.fillStyle = '#c8392b'; for (let x = 60; x <= 320; x += 32) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x - 7, 4); g.lineTo(x + 7, 4); g.fill(); }
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.05), [mat(0x2b2f36, 'design'), mat(0x2b2f36, 'design'), mat(0x2b2f36, 'design'), mat(0x2b2f36, 'design'), reg('design', new THREE.MeshStandardMaterial({ map: boardTex, roughness: .7, emissiveIntensity: 0 })), mat(0x2b2f36, 'design')]);
  board.rotation.y = 0.5; place(board, DX + 2.4, 1.75, DZ + 0.2, 'design', false);
  cyl(0.03, 0.03, 1.1, metal(0x2b2f36, 'design'), DX + 2.4, 0.55, DZ + 0.2, 'design', 6);
  endPhase();
  // analysis model drawn over the RCC frame (forces coloured from blue = low to red = high)
  const ovPos = [], ovCol = [], cc = new THREE.Color();
  const heatC = t => cc.setHSL((1 - t) * 0.6, 0.85, 0.5);
  const pushSeg = (a2, b2, t) => { ovPos.push(...a2, ...b2); heatC(t); ovCol.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b); };
  XS.forEach(x => ZS.forEach(z => { for (let f = 0; f < 3; f++) pushSeg([x, f * FH, z], [x, (f + 1) * FH, z], 1 - f * 0.33 - (x === XS[1] && z === ZS[1] ? 0 : 0.12)); }));
  for (let f = 1; f <= 3; f++) { const y = f * FH; ZS.forEach(z => { pushSeg([XS[0], y, z], [XS[1], y, z], 0.75 - f * 0.12); pushSeg([XS[1], y, z], [XS[2], y, z], 0.7 - f * 0.12); }); XS.forEach(x => { pushSeg([x, y, ZS[0]], [x, y, ZS[1]], 0.72 - f * 0.12); pushSeg([x, y, ZS[1]], [x, y, ZS[2]], 0.66 - f * 0.12); }); }
  // thick colour-coded members (one merged mesh, vertex colours) so the analysis reads from far away
  const tubes = [];
  for (let i = 0; i < ovPos.length; i += 6) {
    const A = new THREE.Vector3(ovPos[i], ovPos[i + 1], ovPos[i + 2]), Bv = new THREE.Vector3(ovPos[i + 3], ovPos[i + 4], ovPos[i + 5]);
    const tg = new THREE.CylinderGeometry(0.075, 0.075, A.distanceTo(Bv), 6, 1, true);
    tg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, Bv.clone().sub(A).normalize())); tg.translate((A.x + Bv.x) / 2, (A.y + Bv.y) / 2, (A.z + Bv.z) / 2);
    const n = tg.attributes.position.count, cols = new Float32Array(n * 3); for (let k = 0; k < n; k++) cols.set([ovCol[i], ovCol[i + 1], ovCol[i + 2]], k * 3);
    tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); tg.deleteAttribute('uv'); tubes.push(tg);
  }
  const ovGeo = mergeGeometries(tubes.map(t => t.index ? t.toNonIndexed() : t));
  const ovBase = ovGeo.attributes.position.array.slice();
  const ovMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthTest: false });
  const overlay = new THREE.Mesh(ovGeo, ovMat); overlay.renderOrder = 5; overlay.userData.dyn = true; overlay.frustumCulled = false; (cur || world).add(overlay);
  const loadArrows = new THREE.Group(); loadArrows.userData.dyn = true; (cur || world).add(loadArrows);
  const arrowM = new THREE.MeshBasicMaterial({ color: 0xc8392b, transparent: true, opacity: 0, depthTest: false });
  for (let x = XS[0]; x <= XS[2] + 0.01; x += 3.5) for (let z = ZS[0]; z <= ZS[2] + 0.01; z += 2.5) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), arrowM); ar.rotation.x = Math.PI; ar.position.set(x, 3 * FH + 0.9, z); ar.renderOrder = 6; loadArrows.add(ar); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), arrowM); st.position.set(x, 3 * FH + 1.45, z); st.renderOrder = 6; loadArrows.add(st); }

  /* ---------------- tower crane (slowly slewing) ---------------- */
  phase(5.6, Infinity, 'y', 0.5);
  const CRX = -8.2, CRZ = -13.4, CRH = 17;
  const latTex = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = '#f2b81e'; g.lineWidth = 7; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); }, 1, 1);
  const latMat = (rx, ry2) => { const t = latTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry2); return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: .55, metalness: .2 }); };
  box(2.2, 0.6, 2.2, mat(0x9a968e, 'base'), CRX, 0.3, CRZ, 'base');
  place(new THREE.Mesh(new THREE.BoxGeometry(0.9, CRH, 0.9), latMat(1, CRH / 0.9)), CRX, CRH / 2 + 0.6, CRZ, 'base', false);
  const slew = new THREE.Group(); slew.position.set(CRX, CRH + 0.6, CRZ); slew.userData.dyn = true; (cur || world).add(slew);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(19, 0.8, 0.8), latMat(19 / 0.8, 1)); jib.position.set(6.5, 0.6, 0); slew.add(jib);
  const cj = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 0.8), latMat(6 / 0.6, 1)); cj.position.set(-5.5, 0.5, 0); slew.add(cj);
  const cwt = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.0), new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: .9 })); cwt.position.set(-7.6, 0.1, 0); slew.add(cwt);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.0), new THREE.MeshStandardMaterial({ color: C.yellow, roughness: .5 })); cab.position.set(0.9, -0.3, 0.9); slew.add(cab);
  const apexC = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.45, 3.2, 4), new THREE.MeshStandardMaterial({ color: C.yellow, roughness: .5 })); apexC.position.set(0, 2.4, 0); slew.add(apexC);
  const tieL = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([V3(0, 4, 0), V3(14, 1, 0), V3(0, 4, 0), V3(-7, 0.9, 0)]), new THREE.LineBasicMaterial({ color: 0x55504a })); slew.add(tieL);
  const trolley = new THREE.Group(); trolley.position.set(10, 0.15, 0); slew.add(trolley);
  const hookLine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 4), new THREE.MeshBasicMaterial({ color: 0x2a2a2a })); trolley.add(hookLine);
  const hookLoad = new THREE.Group(); trolley.add(hookLoad);
  for (let i = 0; i < 9; i++) { const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.6, 5), new THREE.MeshStandardMaterial({ color: C.rust, roughness: .55, metalness: .4 })); bb.rotation.z = Math.PI / 2; bb.position.set(0, -(i % 3) * 0.09, Math.floor(i / 3) * 0.09 - 0.09); hookLoad.add(bb); }

  endPhase();
  /* ---------------- road roller ---------------- */
  phase(9.7, Infinity, 'xyz', 0.3);
  const roller = new THREE.Group(); roller.position.set(8, ROADTOP, 15.9); roller.userData.dyn = true; (cur || world).add(roller);
  const rm = (geo, color, x, y, z, o = {}) => { const m2 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .55 }, o))); m2.position.set(x, y, z); roller.add(m2); return m2; };
  const drumF = rm(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 26), 0x8a929c, 1.0, 0.55, 0, { metalness: .5, roughness: .4 }); drumF.rotation.x = Math.PI / 2;
  const drumR = rm(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 26), 0x8a929c, -1.1, 0.55, 0, { metalness: .5, roughness: .4 }); drumR.rotation.x = Math.PI / 2;
  rm(new THREE.BoxGeometry(2.8, 0.55, 1.4), C.yellow, 0, 1.05, 0); rm(new THREE.BoxGeometry(1.0, 0.9, 1.2), C.yellow, -0.6, 1.75, 0);
  rm(new THREE.BoxGeometry(1.1, 0.06, 1.3), 0x2b2f36, -0.6, 2.24, 0); rm(new THREE.BoxGeometry(0.9, 0.6, 0.02), 0x9ec3e6, -0.6, 1.8, 0.61, { roughness: .1 });
  const rollBlob = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: .45, map: ao.material.map })); rollBlob.rotation.x = -Math.PI / 2; rollBlob.position.y = 0.01; roller.add(rollBlob);

  endPhase();
  /* ---------------- trees + site boundary planting ---------------- */
  [[21.6, -13.6, 1.2], [-22.2, -14.6, 1.0], [22.2, 11.2, 0.9], [-2, -14.6, 0.85], [13, -14.6, 1.05]].forEach(([x, z, k]) => {
    cyl(0.12 * k, 0.16 * k, 1.6 * k, mat(0x6b4a33, 'base'), x, 0.8 * k + 0.06, z, 'base', 8);
    const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * k, 0), mat(k > 1 ? C.green2 : C.green, 'base', { roughness: .85, flatShading: true })); place(cr, x, 2.4 * k, z, 'base', false);
    const cr2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 * k, 0), mat(C.green, 'base', { roughness: .85, flatShading: true })); place(cr2, x + 0.5 * k, 3.0 * k, z - 0.3, 'base', false);
  });

  /* ---------------- people at work in every zone ---------------- */
  const crew = createPeople(world, 30);
  const tool = (hand, geo, color, x, y, z, rx = 0, ry2 = 0, rz = 0) => { const m2 = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .2 })); m2.position.set(x, y, z); m2.rotation.set(rx, ry2, rz); hand.add(m2); return m2; };
  const W_ = {};
  // survey: instrument operator + prism holder
  W_.surveyor = crew.add({ x: SVX - 0.19, z: SVZ + 0.55, ry: Math.atan2(8.5, -23.6), kind: 'engineer', helmet: 0xf4f4f0 });
  W_.rodman = crew.add({ x: PRX + 0.38, z: PRZ + 0.1, ry: -Math.PI / 2 - 0.3 });
  // geotechnical: rig operator pulling the SPT rope, logger at the core boxes, plate-load reader
  W_.rigop = crew.add({ x: RX - 1.3, z: RZ + 1.0, ry: 2.3 });
  W_.logger = crew.add({ x: RX + 2.6, z: RZ - 1.35, ry: Math.PI, kind: 'engineer', helmet: 0xf4f4f0 });
  W_.plate = crew.add({ x: PX - 2.9, z: PZ + 1.9, ry: 2.4 });
  tool(W_.logger.haR, new THREE.BoxGeometry(0.2, 0.02, 0.26), 0x2a3140, 0, -0.02, 0.05);
  tool(W_.plate.haR, new THREE.BoxGeometry(0.2, 0.02, 0.26), 0xf4f4f0, 0, -0.02, 0.05);
  // design: engineer + client at the drawing desk
  W_.eng = crew.add({ x: DX - 0.4, z: DZ - 1.05, ry: 0.15, kind: 'engineer' });
  W_.client = crew.add({ x: DX + 0.9, z: DZ - 1.0, ry: -0.35, kind: 'engineer', shirt: 0x5d7fa8, helmet: 0xf4f4f0 });
  // concrete: slump test, cube tamping, truck driver
  W_.slump = crew.add({ x: 1.2, z: 7.0, ry: 0 });
  W_.cubes = crew.add({ x: -0.9, z: 10.35, ry: 0, kind: 'lab' });
  tool(W_.cubes.haR, new THREE.CylinderGeometry(0.016, 0.016, 0.6, 6), 0x9aa3ad, 0, -0.18, 0.05);
  W_.chute = crew.add({ x: -1.6, z: 8.2, ry: -0.6 });
  // steel: two fixers on the deck + one at the rebar bundle
  W_.fix1 = crew.add({ x: 4.1, y: deckY, z: -4.2, ry: 0.4 });
  W_.fix2 = crew.add({ x: 7.2, y: deckY, z: -0.8, ry: -2.2 });
  W_.bars = crew.add({ x: 4.2, z: 9.0, ry: -1.6 });
  // masonry: mason on the first floor + helper carrying bricks
  W_.mason = crew.add({ x: -4.35, y: FH, z: -0.4, ry: -Math.PI / 2 });
  tool(W_.mason.haR, new THREE.BoxGeometry(0.2, 0.07, 0.1), 0xa8522f, 0, -0.06, 0.04);
  W_.carrier = crew.add({ x: -9, z: 0.6, ry: Math.PI / 2 });
  tool(W_.carrier.haL, new THREE.BoxGeometry(0.42, 0.24, 0.2), 0xa8522f, -0.2, -0.02, 0.1);
  // water: technician filling a sample bottle at the tank tap, analyst at the field table
  W_.wtap = crew.add({ x: TX + 1.1, z: TZ + 1.75, ry: Math.PI, kind: 'lab' });
  tool(W_.wtap.haR, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12), 0xdff1fb, 0, -0.06, 0.05);
  W_.wtable = crew.add({ x: -12.4, z: -7.35, ry: 0, kind: 'lab' });
  // NDT: rebound hammer on the column + colleague recording readings
  W_.ndt = crew.add({ x: NDTX, z: NDTZ + 1.02, ry: Math.PI });
  W_.ndt.haR.add(hammer); hammer.userData.zone = 'ndt';
  W_.ndt2 = crew.add({ x: NDTX + 1.25, z: NDTZ + 1.5, ry: -2.5, kind: 'engineer', helmet: 0xf4f4f0 });
  tool(W_.ndt2.haL, new THREE.BoxGeometry(0.2, 0.02, 0.27), 0x2a3140, 0, -0.02, 0.05);
  // road: core cutter operator + checker
  W_.core = crew.add({ x: 19.6, y: ROADTOP, z: 15.4, ry: -0.4 });
  W_.roadeng = crew.add({ x: 21.2, y: ROADTOP, z: 17.6, ry: -2.6, kind: 'engineer', helmet: 0xf4f4f0 });
  const coreRig = new THREE.Group(); coreRig.position.set(19.6, ROADTOP, 16.2); coreRig.userData.dyn = true; world.add(coreRig);
  [[-0.25, 0], [0.25, 0]].forEach(([a2]) => { const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: .5 })); c2.position.set(a2, 0.65, 0); coreRig.add(c2); });
  const coreHead = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.36), new THREE.MeshStandardMaterial({ color: C.orange, roughness: .5 })); coreHead.position.y = 1.1; coreRig.add(coreHead);
  const coreBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 14), new THREE.MeshStandardMaterial({ color: 0xc9d0d8, metalness: .6, roughness: .3 })); coreBarrel.position.y = -0.4; coreHead.add(coreBarrel);
  // site movement: wheelbarrow loop in front of the building
  W_.barrow = crew.add({ x: 1, z: 4.2 });
  const barrow = new THREE.Group(); W_.barrow.root.add(barrow); barrow.position.set(0, 0, 0.7);
  const bTray = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.32, 4, 1), new THREE.MeshStandardMaterial({ color: 0x2f8f5b, roughness: .6 })); bTray.rotation.y = Math.PI / 4; bTray.scale.set(1, 1, 1.4); bTray.position.set(0, 0.55, 0.1); barrow.add(bTray);
  const bLoad = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9d9a94, roughness: 1 })); bLoad.scale.set(1, .35, 1.3); bLoad.position.set(0, 0.66, 0.1); barrow.add(bLoad);
  const bWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 14), new THREE.MeshStandardMaterial({ color: 0x1c1d20 })); bWheel.rotation.z = Math.PI / 2; bWheel.position.set(0, 0.17, 0.62); barrow.add(bWheel);
  W_.walk2 = crew.add({ x: -14, z: 1.5, kind: 'engineer', helmet: 0xf4f4f0 });

  const pose = crew.pose;
  // static base poses (also what reduced-motion users see)
  function lifePose(t) {
    const sn = (f, ph = 0) => Math.sin(t * f + ph);
    pose(W_.surveyor, { lean: 0.32, nod: 0.25, armL: 1.15, armR: 1.1, elbL: 0.9, elbR: 0.95, outL: 0.25, outR: 0.25, look: 0.04 * sn(0.7) });
    pose(W_.rodman, { armR: 0.9, elbR: 1.2, outR: 0.1, armL: 0.1, look: 0.1 * sn(0.4) });
    const pull = 0.5 + 0.5 * sn(2, 0);
    pose(W_.rigop, { armL: 1.2 + pull * 0.9, armR: 1.1 + pull * 0.9, elbL: 0.5, elbR: 0.6, lean: -0.15 * pull + 0.1, legL: 0.25, legR: -0.15 });
    pose(W_.logger, { lean: 0.55, nod: 0.4, drop: 0.25, legL: 0.6, kneeL: 0.9, legR: 0.6, kneeR: 0.9, armR: 0.9, elbR: 1.2, armL: 0.7 + 0.1 * sn(1.3), elbL: 0.6 });
    pose(W_.plate, { armR: 0.8, elbR: 1.4, armL: 0.6, elbL: 1.3, nod: 0.45, look: 0.2 * sn(0.5) });
    pose(W_.eng, { lean: 0.3, nod: 0.35, armR: 1.0 + 0.25 * sn(1.1), elbR: 0.25, outR: 0.05, armL: 0.5, elbL: 0.6, look: 0.15 * sn(0.6) });
    pose(W_.client, { lean: 0.15, nod: 0.3, armL: 0.25, armR: 0.2, elbL: 1.6, elbR: 1.6, outL: 0.25, outR: 0.25, look: -0.2 + 0.2 * sn(0.45) });
    // slump: lift cone slowly (5 s cycle)
    const cyc = (t % 5) / 5, lift = cyc < 0.25 ? 0 : cyc < 0.55 ? (cyc - 0.25) / 0.3 : cyc < 0.85 ? 1 : 1 - (cyc - 0.85) / 0.15;
    pose(W_.slump, { lean: 0.75 - lift * 0.45, drop: 0.12, legL: 0.35, kneeL: 0.45, legR: 0.35, kneeR: 0.45, armL: 1.05 + lift * 0.35, armR: 1.05 + lift * 0.35, elbL: 0.25, elbR: 0.25, outL: -0.05, outR: -0.05, nod: 0.4 });
    cone.position.y = 0.4 + lift * 0.62; slumped.visible = lift > 0.05 && cyc > 0.3; slumped.scale.set(1 + lift * 0.25, 0.75 + (1 - lift) * 0.3, 1 + lift * 0.25);
    const tamp = Math.abs(sn(7));
    pose(W_.cubes, { lean: 0.25, nod: 0.45, armR: 0.9 + tamp * 0.35, elbR: 1.0 - tamp * 0.3, armL: 0.7, elbL: 0.9, outL: -0.1 });
    pose(W_.chute, { armL: 1.0, armR: 1.3, elbL: 0.5, elbR: 0.4, lean: 0.15, look: 0.2 * sn(0.3) });
    const tie = sn(5) * 0.15, tie2 = sn(5.3, 1) * 0.15;
    const crouch = { drop: 0.45, legL: 1.45, kneeL: 2.3, legR: 1.25, kneeR: 2.2, lean: 0.75, nod: 0.35 };
    pose(W_.fix1, Object.assign({}, crouch, { armL: 1.0 + tie, armR: 1.1 - tie, elbL: 0.8, elbR: 0.7 }));
    pose(W_.fix2, Object.assign({}, crouch, { armL: 1.1 + tie2, armR: 1.0 - tie2, elbL: 0.7, elbR: 0.8 }));
    pose(W_.bars, { lean: 0.5, armL: 1.0, armR: 1.0, elbL: 0.3, elbR: 0.3, nod: 0.3, look: 0.1 * sn(0.8) });
    const lay = 0.5 + 0.5 * sn(1.6);
    pose(W_.mason, { lean: 0.35 + lay * 0.2, nod: 0.3, armR: 0.8 + lay * 0.75, elbR: 0.9 - lay * 0.6, armL: 0.5, elbL: 0.9, legL: 0.25 });
    pose(W_.wtap, { lean: 0.35, nod: 0.45, drop: 0.08, armR: 1.0, elbR: 0.6, armL: 0.9, elbL: 0.8, outL: -0.1, legL: 0.2, kneeL: 0.2, legR: 0.2, kneeR: 0.2 });
    pose(W_.wtable, { lean: 0.35, nod: 0.5, armR: 1.0 + 0.1 * sn(2), elbR: 0.9, armL: 0.8, elbL: 1.0 });
    const hit = Math.max(0, sn(4.2)) ** 6;
    pose(W_.ndt, { armR: 1.5, elbR: 0.2 + hit * 0.18, armL: 1.25, elbL: 0.55, outL: -0.3, outR: 0.02, lean: 0.12 + hit * 0.04, legL: 0.25, legR: -0.1, nod: 0.08 });
    pose(W_.ndt2, { armL: 0.8, elbL: 1.4, armR: 0.5, elbR: 1.5, nod: 0.45, look: 0.25 });
    pose(W_.core, { lean: 0.35, drop: 0.08, armL: 1.2, armR: 1.2, elbL: 0.4, elbR: 0.4, legL: 0.2, kneeL: 0.25, legR: 0.2, kneeR: 0.25, nod: 0.4 });
    pose(W_.roadeng, { armL: 0.8, elbL: 1.4, armR: 0.3, nod: 0.35, look: 0.3 * sn(0.4) });
  }
  // path walkers (loops) — orientation follows the direction of travel
  function walker(p, t, cx, cz, rx, rz, speed, ph = 0, y = 0) {
    const a2 = t * speed + ph, x = cx + Math.cos(a2) * rx, z = cz + Math.sin(a2) * rz;
    const dx = -Math.sin(a2) * rx, dz = Math.cos(a2) * rz;
    p.root.position.set(x, y, z); p.root.rotation.y = Math.atan2(dx, dz);
    crew.walk(p, t * 6.5 + ph, 0.42);
  }
  function life(t, dt, az) {
    lifePose(t);
    walker(W_.barrow, t, 1.6, 4.6, 2.2, 0.75, 0.32);
    pose(W_.barrow, { legL: Math.sin(t * 6.5) * 0.4, legR: -Math.sin(t * 6.5) * 0.4, kneeL: Math.max(0, -Math.cos(t * 6.5)) * 0.5, kneeR: Math.max(0, Math.cos(t * 6.5)) * 0.5, armL: 0.55, armR: 0.55, elbL: 0.1, elbR: 0.1, lean: 0.25 });
    bWheel.rotation.x += dt * 4;
    walker(W_.walk2, t, -12.5, 2.4, 2.2, 1.0, 0.22, 2);
    // brick carrier: shuttles between the pallets and the building
    const cyc = (t * 0.12) % 1, out = cyc < 0.5, u = out ? cyc * 2 : (cyc - 0.5) * 2, x0 = -9.6, x1 = -6.0;
    W_.carrier.root.position.set(out ? x0 + (x1 - x0) * u : x1 - (x1 - x0) * u, 0, 0.6); W_.carrier.root.rotation.y = out ? Math.PI / 2 : -Math.PI / 2;
    crew.walk(W_.carrier, t * 6.5, 0.38); pose(W_.carrier, { legL: Math.sin(t * 6.5) * 0.38, legR: -Math.sin(t * 6.5) * 0.38, kneeL: Math.max(0, -Math.cos(t * 6.5)) * 0.45, kneeR: Math.max(0, Math.cos(t * 6.5)) * 0.45, armL: 1.25, armR: 1.25, elbL: 0.55, elbR: 0.55, outL: -0.25, outR: -0.25 });
    W_.carrier.haL.children[0].visible = out;
    // crane slews back and forth; the load rides the hook
    slew.rotation.y = 0.9 + Math.sin(t * 0.09) * 0.9;
    const tr = 8 + Math.sin(t * 0.13) * 4; trolley.position.x = tr;
    const drop = 6 + Math.sin(t * 0.17) * 2.5; hookLine.scale.y = drop; hookLine.position.y = -drop / 2; hookLoad.position.y = -drop - 0.1;
    // roller rolls along the carriageway
    const rx2 = 8 + Math.sin(t * 0.25) * 6; const vx = Math.cos(t * 0.25);
    roller.position.x = rx2; drumF.rotation.y = drumR.rotation.y = -rx2 / 0.55; roller.rotation.y = 0;
    coreBarrel.rotation.y += dt * 14; coreHead.position.y = 1.0 + Math.sin(t * 0.8) * 0.12;
    drum.rotation.y += dt * (az === 'concrete' ? 2.2 : 0.9);
    // design: the analysis frame breathes (deflected shape), loads pulse
    if (az === 'design') {
      const sway = 0.12 * (0.5 + 0.5 * Math.sin(t * 1.6)); const pa = ovGeo.attributes.position;
      for (let i = 0; i < pa.count; i++) { const y = ovBase[i * 3 + 1] / (3 * FH); pa.setX(i, ovBase[i * 3] + sway * y * y * 3); pa.setY(i, ovBase[i * 3 + 1] - (ovBase[i * 3 + 1] > 0.1 ? sway * 0.4 * Math.sin(Math.PI * ((ovBase[i * 3] - XS[0]) / (XS[2] - XS[0]))) : 0)); }
      pa.needsUpdate = true;
      loadArrows.children.forEach((ar, i) => { ar.position.y = 3 * FH + (i % 2 ? 1.45 : 0.9) + 0.12 * Math.sin(t * 3 + i * .4); });
    }
    crew.sync();
  }
  lifePose(0); crew.sync();
  /* ---------------- performance: merge every static mesh/line per material (≈1200 → ≈70 draw calls) ---------------- */
  spt.userData.dyn = true; rings.forEach(r => r.userData.dyn = true);
  const phaseGroups = new Set(PHASES.map(p2 => p2.g));
  function mergeStatic(container) {
    container.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(container.matrixWorld).invert();
    const meshes = new Map(), lines = new Map(), drop = [];
    (function walk(o) {
      for (const c of [...o.children]) {
        if (phaseGroups.has(c) || c.userData.dyn || c.isInstancedMesh || c.isSprite) continue;
        if (c.isMesh) {
          const k = c.material.uuid + (c.castShadow ? 's' : '') + (c.receiveShadow ? 'r' : '');
          const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          for (const at of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(at)) g.deleteAttribute(at);
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          if (!meshes.has(k)) meshes.set(k, { mat: c.material, cast: c.castShadow, recv: c.receiveShadow, zone: c.userData.zone, geos: [] });
          meshes.get(k).geos.push(g); drop.push(c);
        } else if (c.isLineSegments) {
          const g = c.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          if (!lines.has(c.material.uuid)) lines.set(c.material.uuid, { mat: c.material, geos: [] });
          lines.get(c.material.uuid).geos.push(g); drop.push(c);
        }
        walk(c);
      }
    })(container);
    drop.forEach(o => o.parent && o.parent.remove(o));
    meshes.forEach(v => { const m = new THREE.Mesh(mergeGeometries(v.geos), v.mat); m.castShadow = v.cast; m.receiveShadow = v.recv; m.userData.zone = v.zone; m.userData.merged = true; container.add(m); });
    lines.forEach(v => { const l = new THREE.LineSegments(mergeGeometries(v.geos), v.mat); l.raycast = () => {}; l.userData.merged = true; container.add(l); });
  }
  mergeStatic(world);
  const bb = new THREE.Box3(), piv = new THREE.Vector3();
  PHASES.forEach(ph => {
    mergeStatic(ph.g);
    bb.setFromObject(ph.g); if (bb.isEmpty()) return;
    if (ph.grow === 'xyz') bb.getCenter(piv).setY(bb.min.y); else piv.set(0, bb.min.y, 0);
    ph.g.children.forEach(c => { if (c.userData.merged) c.geometry.translate(-piv.x, -piv.y, -piv.z); else c.position.sub(piv); });
    ph.g.position.copy(piv);
  });
  world.traverse(o => { if (o.userData.merged) o.matrixAutoUpdate = false; });
  // grass on the empty plot (fades as the site is opened up)
  const grassMat = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, map: canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#7fa05a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3800; i++) { const v = (i * 53) % 11; g.fillStyle = `rgba(${70 + v * 8},${110 + v * 7},${50 + v * 3},.35)`; g.fillRect((i * 97) % w, (i * 61 + (i % 13) * 7) % h, 2 + (i % 4), 2 + (i % 3)); } }, 3, 2) });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(GX - 0.02, GZ - 0.02), grassMat); grass.rotation.x = -Math.PI / 2; grass.position.set(0, 0.085, GZ0 + GZ / 2); grass.receiveShadow = true; world.add(grass);
  const PEOPLE_PH = { surveyor: [1, 2.75], rodman: [1, 2.75], rigop: [2, 3.75], logger: [2, 3.75], plate: [2, 3.75], eng: [3, 4.75], client: [3, 4.75], wtap: [5, 6.7], wtable: [5, 6.7], bars: [5.6, 7.4], slump: [6.9, 8.75], cubes: [6.9, 8.75], chute: [6.9, 8.75], fix1: [7.35, 8.8], fix2: [7.35, 8.8], mason: [8.0, 9.8], carrier: [7.8, 9.8], ndt: [9, Infinity], ndt2: [9, Infinity], core: [9.95, Infinity], roadeng: [9.95, Infinity], barrow: [5.8, Infinity], walk2: [1, Infinity] };
  let lastShadow = 0, shadowPending = false, lastX = -99;
  function applyPhases(x, now) {
    if (Math.abs(x - lastX) < 1e-4) return false; lastX = x;
    let changed = false;
    PHASES.forEach(ph => {
      const ein = smooth(clamp01((x - (ph.a - ph.d - 0.05)) / ph.d)), eout = ph.b === Infinity ? 1 : 1 - smooth(clamp01((x - (ph.b - 0.35)) / 0.3)), e = ein * eout;
      if (Math.abs(e - ph.e) < 1e-4) return; ph.e = e; changed = true;
      ph.g.visible = e > 0.002; const k = Math.max(0.001, e);
      if (ph.grow === 'xyz') ph.g.scale.setScalar(k); else ph.g.scale.set(1, k, 1);
    });
    for (const n in PEOPLE_PH) { const p2 = W_[n]; if (!p2) continue; const [a2, b2] = PEOPLE_PH[n]; const hid = x < a2 - 0.25 || x > b2 - 0.2; if (p2.hidden !== hid) { p2.hidden = hid; p2.root.visible = !hid; changed = true; } }
    coreRig.visible = x > 9.75;
    grassMat.opacity = 1 - smooth(clamp01((x - 1.55) / 0.6)); grass.visible = grassMat.opacity > 0.01;
    if (changed) { shadowPending = true; crew.sync(); }
    return true;
  }
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; // shadows are re-baked only while the site changes

  /* ---------------- camera keyframes + pins ---------------- */
    const PRESETS = {
    overview:  { pos: V(70, 52, 82), target: V(0, 1.5, 0) },
    survey:    { pos: V(46, 28, 50), target: V(7, 0, 3) },
    geo:       { pos: V(52, 12, 38), target: V(15.5, -1.5, 3) },
    design:    { pos: V(-30, 22, 40), target: V(0.5, 3.6, 1.5) },
    aggregate: { pos: V(-44, 16, 40), target: V(-15, 0.6, 8.5) },
    concrete:  { pos: V(26, 17, 36), target: V(0.5, 3, 3) },
    steel:     { pos: V(30, 20, 26), target: V(2.5, 4, -2) },
    brick:     { pos: V(-36, 12, 14), target: V(-6, 2.6, -3.5) },
    water:     { pos: V(-42, 16, 6), target: V(-14, 3.4, -7.5) },
    ndt:       { pos: V(15.5, 5.5, 17.5), target: V(9, 1.5, 2.6) },
    road:      { pos: V(42, 15, 48), target: V(6, 1.5, 9) },
  };
  const XRAY = { geo: 1, steel: 1 };
  const PINS = { design: V(DX, 3.6, DZ), survey: V(SVX, 2.6, SVZ), geo: V(RX, 7.7, RZ), aggregate: V(-17, 2.8, 5), concrete: V(-0.6, 1.8, 11.1), steel: V(-5, 10.4, -8), brick: V(XS[0], 4.9, -5.5), water: V(TX, 7.3, TZ), ndt: V(NDTX, 2.6, NDTZ + 0.4), road: V(20.5, 1.2, 16.6) };

  const pinLayer = section.querySelector('.atlas-pins');
  const zones = chapters.map(c => c.getAttribute('data-zone'));
  const pins = [];
  zones.forEach((z, i) => {
    if (!PINS[z]) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'atlas-pin'; b.dataset.i = i;
    const title = chapters[i].querySelector('h2'); b.setAttribute('aria-label', 'Show ' + (title ? title.textContent : z));
    b.innerHTML = '<i>' + String(i).padStart(2, '0') + '</i><span>' + (chapters[i].getAttribute('data-short') || '') + '</span>';
    b.addEventListener('click', e => { e.stopPropagation(); goChapter(i, true); });
    pinLayer.appendChild(b); pins.push({ el: b, pos: PINS[z], i });
  });
  const mkLabel = (t, cls) => { const d = document.createElement('div'); d.className = 'atlas-stratum ' + (cls || ''); d.textContent = t; pinLayer.appendChild(d); return d; };
  const labels = strataLabels.map(l => ({ el: mkLabel(l.text), pos: l.pos, zone: 'geo' })).concat(roadLabels.map(l => ({ el: mkLabel(l.text, 'right'), pos: l.pos, zone: 'road' })));

  // one continuous camera path through every chapter (centripetal Catmull-Rom), scrubbed by scroll
  const keys = zones.map(z => PRESETS[z] || PRESETS.overview);
  const posPath = new THREE.CatmullRomCurve3(keys.map(k => k.pos), false, 'centripetal', 0.5);
  const tgtPath = new THREE.CatmullRomCurve3(keys.map(k => k.target), false, 'centripetal', 0.5);
  const smooth = x => x * x * x * (x * (x * 6 - 15) + 10); // smootherstep
  function pathAt(x, outP, outT) { // x in chapter units (0..N-1) with a dwell at each stop
    x = isFinite(x) ? Math.min(Math.max(x, 0), N - 1) : 0;
    const i = Math.min(N - 2, Math.floor(x)), f = x - i, k = smooth(clamp01((f - 0.2) / 0.6));
    const u = (i + k) / (N - 1);
    posPath.getPoint(u, outP); tgtPath.getPoint(u, outT); outP.y = Math.max(outP.y, 2.2);
    return k > 0.5 ? i + 1 : i;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* ---------------- controls + state ---------------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false, minDistance: 8, maxDistance: 210, maxPolarAngle: Math.PI * 0.47, rotateSpeed: 0.55, zoomSpeed: 0.8 });
  controls.enabled = !coarse;
  renderer.domElement.style.touchAction = 'pan-y'; // OrbitControls sets "none", which blocks page scrolling on phones
  let userOverride = false, dragging = false;
  controls.addEventListener('start', () => { userOverride = true; dragging = true; section.classList.add('is-dragging'); dirty = 2; });
  controls.addEventListener('end', () => { dragging = false; section.classList.remove('is-dragging'); });
  controls.addEventListener('change', () => { dirty = 2; });

  let active = -1, explore = false, xray = false, xrayAuto = false, xrayT = 0, solidT = 1, dirty = 3;
  let pRaw = 0, pS = 0, manual = -1; // scroll progress (raw / smoothed), manual chapter in explore mode
  const goalPos = new THREE.Vector3(), goalTarget = new THREE.Vector3();
  pathAt(0, goalPos, goalTarget); camera.position.copy(goalPos).multiplyScalar(reduce ? 1 : 1.18); controls.target.copy(goalTarget);
  const rail = [...section.querySelectorAll('.atlas-rail button')];
  const counter = section.querySelector('[data-atlas-count]');

  function setActive(i) {
    if (i === active) return; active = i; dirty = 3;
    chapters.forEach((c, k) => { c.classList.toggle('is-active', k === i); if (c !== intro) c.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    rail.forEach((b, k) => { b.classList.toggle('is-active', k === i); b.classList.toggle('is-done', k < i); });
    pins.forEach(p => p.el.classList.toggle('is-active', p.i === i));
    if (counter) counter.textContent = String(i).padStart(2, '0');
    section.dataset.zone = zones[i]; xrayAuto = !!XRAY[zones[i]];
    if (zones[i] === 'survey' || zones[i] === 'overview') renderer.shadowMap.needsUpdate = true;
    if (typeof measureText === 'function' && W > 1) measureText();
  }
  function readScroll() {
    if (explore) return;
    const r = section.getBoundingClientRect(), off = introOffset(), total = r.height - off - innerHeight;
    const p = Math.min(Math.max((-r.top - off) / Math.max(total, 1), 0), 1);
    if (Math.abs(p - pRaw) > 0.0004) { if (userOverride && Math.abs(p - pRaw) > 0.002) userOverride = false; pRaw = p; dirty = 2; kick(); }
  }
  function chapterScrollY(i) { const off = introOffset(), top = section.getBoundingClientRect().top + scrollY + off, total = section.offsetHeight - off - innerHeight; return top + total * (i / (N - 1)); }
  function goChapter(i) {
    if (explore) { manual = i; userOverride = false; dirty = 3; kick(); return; }
    const y = chapterScrollY(i);
    if (window.__lenis) window.__lenis.scrollTo(y, { duration: 1.6 }); else scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }
  rail.forEach((b, k) => b.addEventListener('click', () => goChapter(k)));

  const q = s => section.querySelector(s);
  const btnX = q('[data-atlas-xray]'), btnE = q('[data-atlas-explore]'), btnR = q('[data-atlas-reset]'), btnClose = q('[data-atlas-close]');
  btnX && btnX.addEventListener('click', () => { xray = !xray; btnX.setAttribute('aria-pressed', xray); dirty = 3; kick(); });
  let zoomK = 1;
  section.querySelectorAll('[data-atlas-zoom]').forEach(b => b.addEventListener('click', () => { zoomK = Math.min(1.8, Math.max(0.45, zoomK * (b.getAttribute('data-atlas-zoom') === 'in' ? 0.75 : 1.33))); userOverride = false; dirty = 3; kick(); }));
  btnR && btnR.addEventListener('click', () => { zoomK = 1; userOverride = false; dirty = 3; kick(); });
  let savedScroll = 0;
  function setExplore(on) {
    explore = on; section.classList.toggle('is-explore', on); document.documentElement.classList.toggle('atlas-lock', on);
    controls.enabled = on || !coarse; controls.enableZoom = on; btnE && btnE.setAttribute('aria-pressed', on);
    renderer.domElement.style.touchAction = on ? 'none' : 'pan-y';
    if (window.__lenis) on ? window.__lenis.stop() : window.__lenis.start();
    if (on) { savedScroll = scrollY; manual = Math.max(1, active); btnClose && btnClose.focus({ preventScroll: true }); }
    else { manual = -1; scrollTo(0, savedScroll); readScroll(); }
    resize(); dirty = 3; kick();
  }
  btnE && btnE.addEventListener('click', () => setExplore(!explore));
  btnClose && btnClose.addEventListener('click', () => setExplore(false));
  document.addEventListener('keydown', e => { if (!explore) return; if (e.key === 'Escape') setExplore(false); if (e.key === 'ArrowRight') goChapter(Math.min(N - 1, active + 1)); if (e.key === 'ArrowLeft') goChapter(Math.max(1, active - 1)); });
  section.querySelectorAll('[data-atlas-step]').forEach(b => b.addEventListener('click', () => goChapter(Math.max(explore ? 1 : 0, Math.min(N - 1, active + (+b.getAttribute('data-atlas-step')))))));

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let hoverZone = null, downAt = null, hoverT = 0;
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(world.children, false).find(h => h.object.userData.zone && h.object.userData.zone !== 'base');
    return hit ? hit.object.userData.zone : null;
  }
  renderer.domElement.addEventListener('pointermove', e => {
    if (dragging || e.pointerType === 'touch') return; const now = performance.now(); if (now - hoverT < 90) return; hoverT = now;
    const z = pick(e), nz = z && zones.indexOf(z) > 0 ? z : null; if (nz !== hoverZone) { hoverZone = nz; dirty = 2; kick(); }
    renderer.domElement.style.cursor = hoverZone ? 'pointer' : 'grab';
  });
  renderer.domElement.addEventListener('pointerleave', () => { if (hoverZone) { hoverZone = null; dirty = 2; kick(); } });
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => { if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return; const z = pick(e), i = z ? zones.indexOf(z) : -1; if (i > 0) goChapter(i); });

  /* ---------------- layout ---------------- */
  let W = 1, H = 1, shiftX = 0, shiftY = 0;
  // keep the model centred in the space to the right of the text panel, at any screen width
  let textRight = 0;
  function measureText() {
    const el = active === 0 && !intro.classList.contains('atlas-intro-m') ? intro : chapters[Math.max(1, active)];
    const wr = wrap.getBoundingClientRect(), w = el ? Math.min(el.getBoundingClientRect().width || 0, W * .6) : 0;
    textRight = wr.left + w; section.style.setProperty('--tx', Math.round(textRight) + 'px');
  }
  function shiftGoal() {
    const desk = W > 900;
    if (!desk) return [0, explore ? 0.2 : (active === 0 ? 0.04 : 0.24)];
    const centre = (textRight + 24 + W) / 2;
    return [-(centre - W / 2) / W, -0.02];
  }
  function applyShift(snap, f = 1) {
    const [gx, gy] = shiftGoal();
    if (snap) { shiftX = gx; shiftY = gy; } else { shiftX += (gx - shiftX) * f; shiftY += (gy - shiftY) * f; }
    camera.setViewOffset(W, H, W * shiftX, H * shiftY, W, H); camera.updateProjectionMatrix();
    return Math.abs(gx - shiftX) + Math.abs(gy - shiftY) > 1e-4;
  }
  function resize() {
    placeIntro();
    W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
    renderer.setSize(W, H, false); camera.aspect = W / H;
    camera.fov = W > 900 ? 24 : 40;
    measureText(); applyShift(true); dirty = 3; kick();
  }
  new ResizeObserver(resize).observe(stage); addEventListener('resize', resize);
  addEventListener('load', () => { resize(); readScroll(); }); addEventListener('pageshow', () => { resize(); readScroll(); });

  /* ---------------- loop: renders only while something is changing ---------------- */
  let visible = false, raf = 0, last = performance.now(), lastLife = 0; const t0 = last;
  function kick() { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) { dirty = 3; kick(); } }, { rootMargin: '150px' }).observe(stage);
  document.addEventListener('visibilitychange', () => { dirty = 3; kick(); });
  addEventListener('scroll', readScroll, { passive: true });
  resize(); readScroll(); pS = pRaw; setActive(pathAt(pS * (N - 1), goalPos, goalTarget));
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), lastCam = new THREE.Vector3(), lastTgt = new THREE.Vector3();
  const allSolid = ['concrete', 'ndt'].flatMap(z => zoneMats[z] || []);
  function loop(now) {
    raf = 0; if (!visible || document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
    let moving = false;
    // scroll → smoothed progress → camera on the path
    pS += (pRaw - pS) * (reduce ? 1 : 1 - Math.exp(-dt * 6));
    if (Math.abs(pRaw - pS) < 1e-5 || !isFinite(pS)) pS = isFinite(pRaw) ? pRaw : 0;
    let ch;
    if (manual >= 0) { ch = manual; goalPos.copy(keys[manual].pos); goalTarget.copy(keys[manual].target); }
    else ch = pathAt(pS * (N - 1), goalPos, goalTarget);
    setActive(ch);
    const xNow = manual >= 0 ? manual : pS * (N - 1);
    if (applyPhases(xNow, now)) moving = true;
    if (shadowPending) { dirty = Math.max(dirty, 2); if (now - lastShadow > 150) { renderer.shadowMap.needsUpdate = true; lastShadow = now; shadowPending = false; } }
    const fitW = W > 900 ? Math.min(1.45, Math.max(1, 0.7 / Math.max(0.3, (W - textRight) / W))) : (manual >= 0 ? 1.1 : active === 0 ? 1.05 : 1.4);
    if (zoomK !== 1 || fitW !== 1) goalPos.sub(goalTarget).multiplyScalar(zoomK * fitW).add(goalTarget);
    if (!userOverride && !dragging) {
      const k = reduce ? 1 : 1 - Math.exp(-dt * (manual >= 0 ? 2.6 : 7));
      camera.position.lerp(goalPos, k); controls.target.lerp(goalTarget, k);
    }
    controls.update();
    if (applyShift(reduce, Math.min(1, dt * 3))) moving = true;
    if (camera.position.distanceToSquared(lastCam) > 1e-6 || controls.target.distanceToSquared(lastTgt) > 1e-6) moving = true;
    lastCam.copy(camera.position); lastTgt.copy(controls.target);
    // materials: x-ray, steel reveal, highlight (eased, then settle)
    const f = reduce ? 1 : Math.min(1, dt * 5);
    const xg = xray || xrayAuto ? 1 : 0, sg = zones[active] === 'steel' || xray ? 0.32 : zones[active] === 'design' ? 0.45 : 1;
    if (Math.abs(xg - xrayT) > 0.002 || Math.abs(sg - solidT) > 0.002) moving = true;
    xrayT += (xg - xrayT) * f; solidT += (sg - solidT) * f;
    xrayMats.forEach(m => { m.opacity = 1 - xrayT * 0.84; m.depthWrite = xrayT < 0.5; });
    allSolid.forEach(m => { m.transparent = solidT < 0.999; m.opacity = solidT; m.depthWrite = solidT > 0.6; });
    const az = zones[active];
    for (const zn in zoneMats) { const amt = zn === az ? 0.16 : zn === hoverZone ? 0.09 : 0; zoneMats[zn].forEach(m => { if (Math.abs(amt - m.emissiveIntensity) > 0.002) { moving = true; m.emissive.copy(AMBER); m.emissiveIntensity += (amt - m.emissiveIntensity) * Math.min(1, dt * 7); } }); }
    for (const zn in zoneEdges) zoneEdges[zn].forEach(m => { const on = zn === az, go = on ? 0.85 : 0.16; if (Math.abs(go - m.opacity) > 0.002) { moving = true; m.color.set(on ? 0xd99a0c : C.ink); m.opacity += (go - m.opacity) * f; } });
    const sv = az === 'survey' ? 1 : 0; if (Math.abs(sv - contourMat.opacity) > 0.01) moving = true;
    contourMat.opacity += (sv * .9 - contourMat.opacity) * f; beam.material.opacity = contourMat.opacity;
    const dz = az === 'design' ? 1 : (xNow < 0.75 ? 0.4 : xNow > 3.4 && xNow < 6.75 ? 0.3 : 0); if (Math.abs(dz - ovMat.opacity) > 0.01) moving = true; ovMat.opacity += (dz - ovMat.opacity) * f; arrowM.opacity = az === 'design' ? ovMat.opacity * 0.95 : Math.max(0, arrowM.opacity - f); overlay.visible = loadArrows.visible = ovMat.opacity > 0.01;
    // the site is always alive: people work, the crane slews, the roller rolls (throttled when nothing else moves)
    const ambientDue = !reduce && now - lastLife > (moving || dirty > 0 ? 0 : coarse ? 40 : 32);
    if (!reduce && (az === 'geo')) spt.position.y = 3.2 + Math.abs(Math.sin(t * 2)) * 1.15;
    if (az === 'survey' && !reduce) beam.material.opacity = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * 6));
    rings.forEach((r, i) => { const ph = (t * 0.95 + i / 3) % 1; r.scale.setScalar(1 + ph * 3.4); r.material.opacity = az === 'ndt' && !reduce ? 0.9 * (1 - ph) : 0; });
    if (ambientDue) { life(t, Math.min(0.1, (now - lastLife) / 1000), az); lastLife = now; }
    if (moving || dirty > 0 || ambientDue) {
      renderer.render(scene, camera);
      pins.forEach(p => project(p.el, p.pos, xNow < p.i - 0.55));
      labels.forEach(l => { project(l.el, l.pos); l.el.classList.toggle('is-on', az === l.zone); });
      if (dirty > 0) dirty--;
    }
    if (!reduce || moving || dirty > 0) raf = requestAnimationFrame(loop); // keeps ticking while visible; real work is throttled above
  }
  function project(el, pos, force) {
    tmp2.copy(pos).project(camera);
    const x = (tmp2.x * 0.5 + 0.5) * W, y = (-tmp2.y * 0.5 + 0.5) * H;
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    const hide = force || tmp2.z > 1 || x < -40 || x > W + 40 || y < 70 || y > H - 50;
    if (el._h !== hide) { el._h = hide; el.classList.toggle('is-hidden', hide); }
  }
  window.__atlasDebug = { camera, controls, get active() { return active; }, renderer, world, scene, THREE, crew };
  kick();
}

/* MPAD QC Lab — "Explore the site": interactive 3D construction-site atlas.
   Architectural-maquette art direction: matte white clay, graphite metal, hatched soil
   sections, ink hairlines, amber only for the zone being explained.
   Procedural geometry only (no external 3D assets).
   Build: npx esbuild src/atlas.js --bundle --minify --format=iife --outfile=js/atlas.js */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(24, 1, 1, 600);
  const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
  key.position.set(-30, 52, 34); key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 1536 : 3072, coarse ? 1536 : 3072);
  Object.assign(key.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 5, far: 160 });
  key.shadow.bias = -0.00025; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 0.6); rim.position.set(34, 20, -30); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2436, 0.35));

  const world = new THREE.Group(); scene.add(world);

  /* ---------------- palette + materials ---------------- */
  const C = {
    clay: 0xefece6, clay2: 0xe0dcd4, clay3: 0xcfcac1, joint: 0xbdb7ac,
    graphite: 0x2a3140, graphite2: 0x3b4352, steel: 0x50555d, glass: 0xdfe8f2,
    asphalt: 0x30333a, asphalt2: 0x3d4048, ink: 0x0a1424,
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
    const m = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.16, depthWrite: false });
    (zoneEdges[zone] = zoneEdges[zone] || []).push(m);
    return (edgeCache[zone] = m);
  }
  function addEdges(mesh, zone, thr = 25) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, thr), edgeMat(zone));
    e.raycast = () => {}; mesh.add(e);
  }
  function place(mesh, x, y, z, zone, edges = true, cast = true) {
    mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = true;
    mesh.userData.zone = zone; if (edges) addEdges(mesh, zone);
    world.add(mesh); return mesh;
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
      const tone = 232 - ((r * 7 + c * 5) % 5) * 3;
      g.fillStyle = `rgb(${tone},${tone - 4},${tone - 10})`;
      g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 2, r * 32 + 2, 60, 28);
    }
  }, rx, ry);
  const pavers = (rx, ry) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex(C.joint); g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { const t = 226 - ((r + c) % 3) * 8; g.fillStyle = `rgb(${t},${t - 3},${t - 8})`; g.fillRect(c * 64 + (r % 2 ? 32 : 0) + 2, r * 32 + 2, 60, 28); }
  }, rx, ry);

  /* ---------------- plinth: ground with hatched soil strata ---------------- */
  const GX = 48, GZ = 36, GZ0 = -16;
  const strata = [
    [0, -0.9, 0xd8d1c4, 0xb9b1a2, 'dots', 'Topsoil'],
    [-0.9, -2.9, 0xcdbfae, 0xa9977f, 'diag', 'Red soil / murrum'],
    [-2.9, -4.8, 0xbdb7ad, 0x958e82, 'rock', 'Weathered rock'],
    [-4.8, -6.8, 0xa7a29a, 0x7f7a72, 'cross', 'Hard rock'],
  ];
  const strataLabels = [];
  strata.forEach(([top, bot, base, line, kind, label]) => {
    const m = reg('geo', new THREE.MeshStandardMaterial({ map: hatch(base, line, kind), roughness: 0.96, transparent: true, emissiveIntensity: 0 }));
    m.map.repeat.set(GX / 7, (top - bot) / 7 * 2);
    xrayMats.push(m);
    place(new THREE.Mesh(new THREE.BoxGeometry(GX, top - bot, GZ), m), 0, (top + bot) / 2, GZ0 + GZ / 2, 'geo', true, false);
    strataLabels.push({ text: label, pos: new THREE.Vector3(-GX / 2, (top + bot) / 2, GZ0 + GZ) });
  });
  const surfMat = new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 1, transparent: true });
  xrayMats.push(surfMat);
  const surf = new THREE.Mesh(new THREE.BoxGeometry(GX, 0.08, GZ), surfMat);
  surf.position.set(0, 0.04, GZ0 + GZ / 2); surf.receiveShadow = true; world.add(surf);
  // soft contact shadow under the plinth (fake AO)
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(GX * 1.7, GZ * 1.7), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
  ao.rotation.x = -Math.PI / 2; ao.position.set(0, -6.9, GZ0 + GZ / 2); world.add(ao);

  /* ---------------- building: RCC frame G+2, 3rd floor under construction ---------------- */
  const XS = [-5, 2, 9], ZS = [-8, -3, 2], FH = 3.3, COL = 0.6;
  const mConc = mat(C.clay, 'concrete'), mConc2 = mat(C.clay2, 'concrete');
  XS.forEach(x => ZS.forEach(z => { box(2.4, 0.6, 2.4, mConc2, x, -1.9, z, 'concrete'); box(0.8, 1.6, 0.8, mConc2, x, -0.8, z, 'concrete'); }));
  // pile + cap (pile load / integrity)
  box(1.6, 0.6, 1.6, mat(C.clay2, 'geo'), 17, -1.0, -7.5, 'geo');
  cyl(0.32, 0.32, 4.8, mat(C.clay3, 'geo'), 17, -3.7, -7.5, 'geo', 20, true);
  const mNdt = mat(C.clay, 'ndt');
  XS.forEach(x => ZS.forEach(z => {
    const ndt = x === 9 && z === 2;
    for (let f = 0; f < 2; f++) box(COL, FH, COL, ndt && f === 0 ? mNdt : mConc, x, f * FH + FH / 2, z, ndt && f === 0 ? 'ndt' : 'concrete');
    box(COL, 1.8, COL, mat(C.clay, 'steel'), x, 2 * FH + 0.9, z, 'steel');
  }));
  for (let f = 1; f <= 2; f++) {
    const y = f * FH;
    box(XS[2] - XS[0] + 1.6, 0.24, ZS[2] - ZS[0] + 1.6, mConc, (XS[0] + XS[2]) / 2, y - 0.12, (ZS[0] + ZS[2]) / 2, 'concrete');
    ZS.forEach(z => box(XS[2] - XS[0], 0.46, 0.32, mConc2, (XS[0] + XS[2]) / 2, y - 0.46, z, 'concrete', false));
    XS.forEach(x => box(0.32, 0.46, ZS[2] - ZS[0], mConc2, x, y - 0.46, (ZS[0] + ZS[2]) / 2, 'concrete', false));
  }
  // staircase (adds architectural read)
  for (let s = 0; s < 11; s++) box(1.4, 0.3, 0.28, mConc2, XS[1] + 2.6, s * 0.3 + 0.15, ZS[0] + 1.2 + s * 0.28, 'concrete', false);
  // formwork deck + props on the 3rd floor
  const mPly = mat(0xd9cbb3, 'steel');
  box(7.6, 0.06, 10.6, mPly, 5.5, 3 * FH - 0.03, -3, 'steel');
  for (let px = 2.5; px <= 8.5; px += 2) for (let pz = -7.5; pz <= 1.5; pz += 3) cyl(0.045, 0.045, FH - 0.1, metal(C.steel, 'steel'), px, 2 * FH + (FH - 0.1) / 2, pz, 'steel', 6);

  // rebar cages (inside concrete; revealed by section cut / steel chapter) + starter bars
  const mBar = metal(C.graphite2, 'steel');
  const barGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6);
  const spots = []; XS.forEach(x => ZS.forEach(z => [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => spots.push([x + a * 0.2, z + b * 0.2]))));
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const TOP = 2 * FH + 3.4, BOT = -1.6;
  const bars = new THREE.InstancedMesh(barGeo, mBar, spots.length);
  spots.forEach(([x, z], i) => { P.set(x, (TOP + BOT) / 2, z); S.set(1, TOP - BOT, 1); M4.compose(P, Q.identity(), S); bars.setMatrixAt(i, M4); });
  bars.castShadow = true; bars.userData.zone = 'steel'; world.add(bars);
  const tieGeo = new THREE.BoxGeometry(0.44, 0.02, 0.02); const ties = [];
  XS.forEach(x => ZS.forEach(z => { for (let y = BOT + 0.3; y < TOP - 0.2; y += 0.45) ties.push([x, y, z]); }));
  const tieMesh = new THREE.InstancedMesh(tieGeo, mBar, ties.length * 4); let ti = 0;
  ties.forEach(([x, y, z]) => [[0, 0.2, 0], [0, -0.2, 0], [0.2, 0, Math.PI / 2], [-0.2, 0, Math.PI / 2]].forEach(([dx, dz, r]) => { P.set(x + dx, y, z + dz); Q.setFromAxisAngle(UP, r); S.set(1, 1, 1); M4.compose(P, Q, S); tieMesh.setMatrixAt(ti++, M4); }));
  tieMesh.userData.zone = 'steel'; world.add(tieMesh);
  const bundle = new THREE.InstancedMesh(barGeo, mBar, 42);
  for (let i = 0; i < 42; i++) { P.set(2.6 + (i % 7) * 0.12, 0.2 + Math.floor(i / 7) * 0.09, 9.4); Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); S.set(1, 7, 1); M4.compose(P, Q, S); bundle.setMatrixAt(i, M4); }
  bundle.castShadow = true; bundle.userData.zone = 'steel'; world.add(bundle);
  [6.6, 12.2].forEach(z => box(1.2, 0.16, 0.24, mat(C.clay3, 'steel'), 3, 0.08, z, 'steel'));

  // masonry infill (left side G+1, half-built bay, back wall)
  function wall(w, h, d, x, y, z) {
    const m = reg('brick', new THREE.MeshStandardMaterial({ map: masonry(Math.max(w, d) / 1.4, h / 1.4), roughness: 0.95, emissiveIntensity: 0 }));
    return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z, 'brick');
  }
  const bay = (z0, z1, f, hgt) => { const len = Math.abs(z1 - z0) - COL, h = hgt || FH - 0.46; wall(0.24, h, len, XS[0], f * FH + h / 2, (z0 + z1) / 2); };
  bay(ZS[0], ZS[1], 0); bay(ZS[1], ZS[2], 0); bay(ZS[0], ZS[1], 1); bay(ZS[1], ZS[2], 1, 1.3);
  [[XS[0], XS[1]], [XS[1], XS[2]]].forEach(([a, b]) => { const len = b - a - COL, h = FH - 0.46; wall(len, h, 0.24, (a + b) / 2, h / 2, ZS[0]); });
  // pallets: bricks + AAC blocks
  const mPal = mat(C.clay3, 'brick');
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) box(0.9, 0.4, 0.9, mat(i === 1 ? 0xf6f4f0 : 0xe4ddd2, 'brick'), -8.6 + j * 1.0, 0.3 + i * 0.42, -2, 'brick');
  box(3.1, 0.12, 1.1, mPal, -7.6, 0.06, -2, 'brick');
  const pav = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 10), reg('brick', new THREE.MeshStandardMaterial({ map: pavers(1.4, 4.4), roughness: .95, emissiveIntensity: 0 })));
  place(pav, 5.5, 0.1, 8.6, 'brick', false);

  /* ---------------- water: overhead tank, curing drum, sample bottles ---------------- */
  const TX = -15, TZ = -9, mG = metal(C.graphite, 'water');
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => box(0.16, 4.2, 0.16, mG, TX + a * 1.1, 2.1, TZ + b * 1.1, 'water', false));
  [1.4, 2.8].forEach(y => { box(2.36, 0.08, 0.08, mG, TX, y, TZ - 1.1, 'water', false); box(0.08, 0.08, 2.36, mG, TX - 1.1, y, TZ, 'water', false); });
  box(2.6, 0.14, 2.6, mG, TX, 4.27, TZ, 'water');
  cyl(1.15, 1.2, 2.3, mat(C.clay, 'water'), TX, 5.5, TZ, 'water', 48, true);
  for (let y = 4.75; y < 6.6; y += 0.45) cyl(1.215, 1.215, 0.05, mat(C.clay2, 'water'), TX, y, TZ, 'water', 48);
  cyl(0.45, 0.45, 0.24, mG, TX, 6.77, TZ, 'water', 32);
  cyl(0.05, 0.05, 4.6, mG, TX + 1.3, 2.4, TZ, 'water', 8);
  cyl(0.55, 0.55, 1.1, mat(C.clay2, 'water'), -10.6, 0.55, -7.8, 'water', 32, true);
  box(1, 0.46, 0.7, mat(C.clay3, 'water'), -12.5, 0.27, -6.6, 'water');
  const mGlass = reg('water', new THREE.MeshPhysicalMaterial({ color: C.glass, roughness: 0.08, transmission: 0.6, thickness: 0.2, emissiveIntensity: 0 }));
  for (let i = 0; i < 3; i++) cyl(0.09, 0.1, 0.36, mGlass, -12.85 + i * 0.35, 0.68, -6.6, 'water', 16);

  /* ---------------- stockpiles ---------------- */
  function pile(x, z, r, h, color, seed) {
    const g = new THREE.ConeGeometry(r, h, 56, 8, true); const pos = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const tt = (v.y + h / 2) / h; if (tt > 0.02 && tt < 0.98) { const n = 1 + Math.sin(v.x * 2.3 + seed) * Math.cos(v.z * 1.9 + seed) * 0.045 * (1 - tt); v.x *= n; v.z *= n; } pos.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    return place(new THREE.Mesh(g, mat(color, 'aggregate', { roughness: 1, side: THREE.DoubleSide })), x, h / 2 + 0.06, z, 'aggregate', false);
  }
  pile(-17, 5, 3.2, 2.3, 0xe8dcc6, 1); pile(-11, 9.2, 2.6, 2.0, 0xc9c6bf, 2); pile(-18.5, 11.5, 2.4, 1.7, 0xdcd0bd, 3);
  const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.08, 0), mat(0xb4b0a8, 'aggregate'), 90);
  for (let i = 0; i < 90; i++) { const a = i * 2.4, rr = 2.5 + (i % 7) * 0.12; P.set(-11 + Math.cos(a) * rr, 0.1, 9.2 + Math.sin(a) * rr); Q.setFromEuler(new THREE.Euler(a, a * 2, 0)); S.setScalar(0.7 + (i % 5) * 0.15); M4.compose(P, Q, S); stone.setMatrixAt(i, M4); }
  stone.userData.zone = 'aggregate'; stone.castShadow = true; world.add(stone);
  for (let i = 0; i < 5; i++) cyl(0.42, 0.42, 0.13, metal(i === 4 ? C.graphite2 : 0xcfd5dc, 'aggregate'), -13.6, 0.14 + i * 0.14, 13.6, 'aggregate', 32);

  /* ---------------- concrete: mixer, test bench with cubes + slump cone ---------------- */
  const mixer = new THREE.Group(); mixer.position.set(-4.5, 0.06, 10); world.add(mixer);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 1.02, 1.9, 40, 1, true), mat(C.clay2, 'concrete', { side: THREE.DoubleSide }));
  drum.rotation.z = Math.PI / 2.6; drum.position.y = 1.55; drum.castShadow = true; drum.userData.zone = 'concrete'; mixer.add(drum); addEdges(drum, 'concrete', 40);
  const frm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.4), metal(C.graphite, 'concrete')); frm.position.y = 0.45; frm.castShadow = true; frm.userData.zone = 'concrete'; mixer.add(frm);
  [-0.8, 0.8].forEach(x => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 24), metal(C.graphite2, 'concrete')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.32, 0.8); mixer.add(w); });
  const mBench = mat(C.clay3, 'concrete');
  box(2.6, 0.07, 1.3, mBench, -0.6, 0.94, 11.2, 'concrete');
  [[-1.75, 10.7], [0.55, 10.7], [-1.75, 11.7], [0.55, 11.7]].forEach(([x, z]) => box(0.07, 0.86, 0.07, metal(C.graphite, 'concrete'), x, 0.5, z, 'concrete', false));
  for (let i = 0; i < 3; i++) box(0.4, 0.4, 0.4, mConc, -1.5 + i * 0.55, 1.18, 11.0, 'concrete');
  for (let i = 0; i < 2; i++) box(0.48, 0.44, 0.48, metal(C.graphite, 'concrete'), -1.3 + i * 0.6, 1.2, 11.6, 'concrete');
  cyl(0.11, 0.22, 0.36, metal(0xc9d0d8, 'concrete'), 0.4, 1.16, 11.6, 'concrete', 32);

  /* ---------------- NDT on a ground-floor column ---------------- */
  const NDTX = XS[2], NDTZ = ZS[2];
  const hammer = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.55, 20), metal(C.graphite, 'ndt'));
  hammer.rotation.x = Math.PI / 2; hammer.position.set(NDTX, 1.5, NDTZ + 0.6); hammer.castShadow = true; hammer.userData.zone = 'ndt'; world.add(hammer);
  const dotM = mat(C.ink, 'ndt');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.025, 10), dotM); d.position.set(NDTX - 0.18 + c * 0.18, 0.95 + r * 0.25, NDTZ + COL / 2 + 0.004); d.userData.zone = 'ndt'; world.add(d); }
  [2.15, 2.65].forEach(y => { const h = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), mat(0x6b6760, 'ndt')); h.rotation.y = Math.PI / 2; h.position.set(NDTX + COL / 2 + 0.004, y, NDTZ); h.userData.zone = 'ndt'; world.add(h); });
  const rings = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.225, 48), new THREE.MeshBasicMaterial({ color: 0xf2b01e, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); r.position.set(NDTX, 1.5, NDTZ + COL / 2 + 0.02); world.add(r); rings.push(r); }

  /* ---------------- geotechnical: rig, borehole, cores, plate load ---------------- */
  const RX = 15, RZ = 7, mRig = metal(C.graphite, 'geo');
  const apex = new THREE.Vector3(RX, 7.2, RZ);
  [[-2, -1.4], [2, -1.4], [0, 2.2]].forEach(([a, b]) => {
    const foot = new THREE.Vector3(RX + a, 0.06, RZ + b), len = foot.distanceTo(apex);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, len, 10), mRig);
    leg.position.copy(foot).add(apex).multiplyScalar(0.5); leg.quaternion.setFromUnitVectors(UP, apex.clone().sub(foot).normalize());
    leg.castShadow = true; leg.userData.zone = 'geo'; world.add(leg);
  });
  cyl(0.16, 0.16, 0.36, mRig, RX, 7.1, RZ, 'geo', 16);
  const spt = cyl(0.2, 0.2, 0.7, mat(C.clay2, 'geo'), RX, 3.2, RZ, 'geo', 24, true);
  cyl(0.03, 0.03, 6.8, metal(0xaab2bc, 'geo'), RX, 3.4, RZ, 'geo', 6);
  box(1.3, 0.8, 0.9, mat(C.clay2, 'geo'), RX - 2.6, 0.46, RZ + 0.4, 'geo');
  cyl(0.15, 0.15, 0.5, mRig, RX, 0.3, RZ, 'geo', 16);
  cyl(0.16, 0.16, 6.4, mat(0x4a443e, 'geo'), RX, -3.2, RZ, 'geo', 20);
  const sampleM = new THREE.MeshStandardMaterial({ color: 0xf2b01e, emissive: 0x6a4800, emissiveIntensity: 0.6, roughness: 0.6 });
  for (let y = -1.2; y > -6.2; y -= 1.5) cyl(0.19, 0.19, 0.3, sampleM, RX, y, RZ, 'geo', 20);
  for (let i = 0; i < 2; i++) { box(1.6, 0.16, 0.8, mat(C.clay3, 'geo'), RX + 2.6, 0.14 + i * 0.18, RZ - 2.2, 'geo'); for (let k = 0; k < 4; k++) { const cr = cyl(0.065, 0.065, 1.4, mat(0xbcb6ac, 'geo'), RX + 2.6, 0.27 + i * 0.18, RZ - 2.5 + k * 0.2, 'geo', 10); cr.rotation.z = Math.PI / 2; } }
  const PX = 16.5, PZ = -1;
  box(0.6, 0.05, 0.6, mRig, PX, 0.09, PZ, 'geo');
  cyl(0.11, 0.11, 0.9, mRig, PX, 0.56, PZ, 'geo', 16);
  box(5, 0.28, 0.28, mRig, PX, 1.14, PZ, 'geo', false);
  [[-2.2, -1.2], [2.2, -1.2], [-2.2, 1.2], [2.2, 1.2]].forEach(([a, b]) => box(0.4, 1.3, 0.4, mat(C.clay3, 'geo'), PX + a, 0.71, PZ + b, 'geo'));
  box(4.8, 0.18, 3, mat(C.clay2, 'geo'), PX, 1.38, PZ, 'geo');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) box(1.02, 0.46, 0.84, mat(0xe6dfd2, 'geo'), PX - 1.65 + i * 1.1, 1.72 + (j % 2) * 0.47, PZ - 0.95 + j * 0.95, 'geo');

  /* ---------------- road: layered section ---------------- */
  const layers = [[0.26, 0xcfc8bb, 'GSB'], [0.22, 0xb5b0a8, 'WMM'], [0.16, C.asphalt2, 'DBM'], [0.09, C.asphalt, 'BC']];
  let ry = 0.08; const roadLabels = [];
  layers.forEach(([t, c, lab], i) => {
    const len = GX - i * 1.5;
    box(len, t, 5, mat(c, 'road', { roughness: i > 1 ? 0.78 : 0.95 }), -GX / 2 + len / 2, ry + t / 2, 16.6, 'road');
    roadLabels.push({ text: lab, pos: new THREE.Vector3(GX / 2 - i * 1.5, ry + t / 2, 19.1) });
    ry += t;
  });
  const mLine = mat(0xf5f3ee, 'road', { roughness: 0.6 });
  for (let x = -22; x < 14; x += 3.2) box(1.6, 0.01, 0.12, mLine, x, ry + 0.005, 16.6, 'road', false);
  box(GX - 4.5, 0.01, 0.08, mLine, -GX / 2 + (GX - 4.5) / 2, ry + 0.005, 14.4, 'road', false);
  cyl(0.22, 0.22, 0.73, mat(C.asphalt2, 'road'), 21.6, 0.45, 13.6, 'road', 28, true);

  /* ---------------- scale figures (maquette style) ---------------- */
  const figM = new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.9 });
  function figure(x, z, s = 1) {
    const g = new THREE.Group(); g.position.set(x, 0.06, z); g.scale.setScalar(s);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.25, 12), figM); b.position.y = 0.62; b.castShadow = true; g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), figM); h.position.y = 1.42; h.castShadow = true; g.add(h);
    world.add(g);
  }
  figure(RX - 1.4, RZ + 1.5); figure(NDTX + 0.1, NDTZ + 1.1); figure(-2.4, 11.4); figure(-13.4, 12.6); figure(PX - 3.2, PZ + 2.1); figure(4.2, 6.2, 0.95);

  /* ---------------- presets + pins ---------------- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const PRESETS = {
    overview:  { pos: V(70, 56, 84), target: V(1, -1, 3) },
    geo:       { pos: V(52, 12, 38), target: V(15.5, -1.5, 3) },
    aggregate: { pos: V(-44, 16, 40), target: V(-15, 0.6, 8.5) },
    concrete:  { pos: V(12, 12, 40), target: V(-2.2, 1.2, 9.6) },
    steel:     { pos: V(34, 26, 24), target: V(3.5, 7, -3) },
    brick:     { pos: V(-36, 12, 14), target: V(-6, 2.6, -3.5) },
    water:     { pos: V(-42, 16, 6), target: V(-14, 3.4, -7.5) },
    ndt:       { pos: V(11.5, 3.8, 14), target: V(8.6, 1.7, 2.4) },
    road:      { pos: V(46, 9, 40), target: V(18.5, 0.3, 15.5) },
  };
  const XRAY = { geo: 1, steel: 1 };
  const PINS = { geo: V(RX, 7.7, RZ), aggregate: V(-17, 2.8, 5), concrete: V(-0.6, 1.8, 11.1), steel: V(-5, 10.4, -8), brick: V(XS[0], 4.9, -5.5), water: V(TX, 7.3, TZ), ndt: V(NDTX, 2.6, NDTZ + 0.4), road: V(20.5, 1.2, 16.6) };

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

  /* ---------------- controls + state ---------------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.07, enablePan: false, enableZoom: false, minDistance: 8, maxDistance: 150, maxPolarAngle: Math.PI * 0.47, rotateSpeed: 0.55, zoomSpeed: 0.8 });
  controls.enabled = !coarse;
  let userOverride = false, dragging = false;
  controls.addEventListener('start', () => { userOverride = true; dragging = true; section.classList.add('is-dragging'); });
  controls.addEventListener('end', () => { dragging = false; section.classList.remove('is-dragging'); });

  let active = -1, explore = false, xray = false, xrayAuto = false, xrayT = 0, solidT = 1;
  const goalPos = PRESETS.overview.pos.clone(), goalTarget = PRESETS.overview.target.clone();
  camera.position.copy(goalPos).multiplyScalar(reduce ? 1 : 1.25); controls.target.copy(goalTarget);
  const rail = [...section.querySelectorAll('.atlas-rail button')];
  const counter = section.querySelector('[data-atlas-count]');

  function setActive(i) {
    if (i === active) return; active = i;
    chapters.forEach((c, k) => { c.classList.toggle('is-active', k === i); if (c !== intro) c.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    rail.forEach((b, k) => { b.classList.toggle('is-active', k === i); b.classList.toggle('is-done', k < i); });
    pins.forEach(p => p.el.classList.toggle('is-active', p.i === i));
    if (counter) counter.textContent = String(i).padStart(2, '0');
    section.dataset.zone = zones[i];
    const pr = PRESETS[zones[i]] || PRESETS.overview;
    goalPos.copy(pr.pos); goalTarget.copy(pr.target); xrayAuto = !!XRAY[zones[i]]; userOverride = false;
    if (reduce) { camera.position.copy(goalPos); controls.target.copy(goalTarget); }
  }
  function scrollChapter() {
    if (explore) return;
    const r = section.getBoundingClientRect(), off = introOffset(), total = r.height - off - innerHeight;
    const p = Math.min(Math.max((-r.top - off) / Math.max(total, 1), 0), 0.9999);
    setActive(Math.min(N - 1, Math.floor(p * N)));
  }
  function chapterScrollY(i) { const off = introOffset(), top = section.getBoundingClientRect().top + scrollY + off, total = section.offsetHeight - off - innerHeight; return top + total * ((i + 0.35) / N); }
  function goChapter(i, fromPin) { if (explore) { setActive(i); return; } scrollTo({ top: chapterScrollY(i), behavior: reduce ? 'auto' : 'smooth' }); if (fromPin) setActive(i); }
  rail.forEach((b, k) => b.addEventListener('click', () => goChapter(k)));

  const q = s => section.querySelector(s);
  const btnX = q('[data-atlas-xray]'), btnE = q('[data-atlas-explore]'), btnR = q('[data-atlas-reset]'), btnClose = q('[data-atlas-close]');
  btnX && btnX.addEventListener('click', () => { xray = !xray; btnX.setAttribute('aria-pressed', xray); });
  function zoom(f) { const off = camera.position.clone().sub(controls.target); off.setLength(THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance)); goalPos.copy(controls.target).add(off); goalTarget.copy(controls.target); userOverride = false; }
  section.querySelectorAll('[data-atlas-zoom]').forEach(b => b.addEventListener('click', () => zoom(b.getAttribute('data-atlas-zoom') === 'in' ? 0.72 : 1.38)));
  btnR && btnR.addEventListener('click', () => { const pr = PRESETS[zones[active]] || PRESETS.overview; goalPos.copy(pr.pos); goalTarget.copy(pr.target); userOverride = false; });
  let savedScroll = 0;
  function setExplore(on) {
    explore = on; section.classList.toggle('is-explore', on); document.documentElement.classList.toggle('atlas-lock', on);
    controls.enabled = on || !coarse; controls.enableZoom = on; btnE && btnE.setAttribute('aria-pressed', on);
    if (on) { savedScroll = scrollY; if (active === 0) setActive(1); btnClose && btnClose.focus({ preventScroll: true }); }
    else { scrollTo(0, savedScroll); scrollChapter(); }
    resize();
  }
  btnE && btnE.addEventListener('click', () => setExplore(!explore));
  btnClose && btnClose.addEventListener('click', () => setExplore(false));
  document.addEventListener('keydown', e => { if (!explore) return; if (e.key === 'Escape') setExplore(false); if (e.key === 'ArrowRight') setActive(Math.min(N - 1, active + 1)); if (e.key === 'ArrowLeft') setActive(Math.max(1, active - 1)); });
  section.querySelectorAll('[data-atlas-step]').forEach(b => b.addEventListener('click', () => { const n = Math.max(0, Math.min(N - 1, active + (+b.getAttribute('data-atlas-step')))); explore ? setActive(Math.max(1, n)) : goChapter(n); }));

  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let hoverZone = null, downAt = null;
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(world.children, true).find(h => h.object.userData.zone && h.object.userData.zone !== 'base');
    return hit ? hit.object.userData.zone : null;
  }
  renderer.domElement.addEventListener('pointermove', e => { if (dragging || e.pointerType === 'touch') return; const z = pick(e); hoverZone = z && zones.indexOf(z) > 0 ? z : null; renderer.domElement.style.cursor = hoverZone ? 'pointer' : 'grab'; });
  renderer.domElement.addEventListener('pointerleave', () => { hoverZone = null; });
  renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => { if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return; const z = pick(e), i = z ? zones.indexOf(z) : -1; if (i > 0) goChapter(i, true); });

  /* ---------------- layout ---------------- */
  let W = 1, H = 1, shiftX = 0, shiftY = 0;
  function applyShift(snap, f = 1) { // keep the model clear of the copy: right on desktop, up on phones
    const desk = W > 900;
    const gx = desk ? -(active === 0 ? 0.25 : 0.2) : 0, gy = desk ? -0.02 : (active === 0 && !explore ? 0.06 : 0.27);
    if (snap) { shiftX = gx; shiftY = gy; } else { shiftX += (gx - shiftX) * f; shiftY += (gy - shiftY) * f; }
    camera.setViewOffset(W, H, W * shiftX, H * shiftY, W, H); camera.updateProjectionMatrix();
  }
  function resize() {
    placeIntro();
    W = Math.max(1, stage.clientWidth); H = Math.max(1, stage.clientHeight);
    renderer.setSize(W, H, false); camera.aspect = W / H;
    const desk = W > 900;
    camera.fov = desk ? 24 : 40;
    applyShift(true);
  }
  new ResizeObserver(resize).observe(stage); addEventListener('resize', resize); resize();

  /* ---------------- loop ---------------- */
  let visible = false, raf = 0, last = performance.now(); const t0 = last;
  const kick = () => { if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
  new IntersectionObserver(es => { visible = es[0].isIntersecting; kick(); }, { rootMargin: '120px' }).observe(stage);
  document.addEventListener('visibilitychange', kick);
  addEventListener('scroll', scrollChapter, { passive: true }); scrollChapter(); if (active < 0) setActive(0);
  const tmp = new THREE.Vector3(), allSolid = ['concrete', 'ndt'].flatMap(z => zoneMats[z] || []);
  function loop(now) {
    raf = 0; if (!visible || document.hidden) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
    if (!userOverride && !dragging) {
      const k = reduce ? 1 : 1 - Math.exp(-dt * 2.6);
      camera.position.lerp(goalPos, k); controls.target.lerp(goalTarget, k);
      if (active === 0 && !reduce) { tmp.copy(goalPos).sub(goalTarget).applyAxisAngle(UP, dt * 0.035); goalPos.copy(goalTarget).add(tmp); }
    }
    const f = Math.min(1, dt * 4.5);
    applyShift(reduce, Math.min(1, dt * 2.4));
    controls.update();
    xrayT += ((xray || xrayAuto ? 1 : 0) - xrayT) * f;
    xrayMats.forEach(m => { m.opacity = 1 - xrayT * 0.84; m.depthWrite = xrayT < 0.5; });
    solidT += ((zones[active] === 'steel' || xray ? 0.32 : 1) - solidT) * f;
    allSolid.forEach(m => { m.transparent = solidT < 0.999; m.opacity = solidT; m.depthWrite = solidT > 0.6; });
    const az = zones[active], pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    for (const zn in zoneMats) { const amt = zn === az ? 0.1 + pulse * 0.1 : zn === hoverZone ? 0.08 : 0; zoneMats[zn].forEach(m => { m.emissive.copy(AMBER); m.emissiveIntensity += (amt - m.emissiveIntensity) * Math.min(1, dt * 6); }); }
    for (const zn in zoneEdges) zoneEdges[zn].forEach(m => { const on = zn === az; m.color.set(on ? 0xd99a0c : C.ink); m.opacity += ((on ? 0.85 : 0.16) - m.opacity) * f; });
    if (!reduce) {
      spt.position.y = 3.2 + Math.abs(Math.sin(t * 2)) * 1.15;
      drum.rotation.y += dt * 1.2;
      rings.forEach((r, i) => { const ph = (t * 0.8 + i / 3) % 1; r.scale.setScalar(1 + ph * 3.4); r.material.opacity = (az === 'ndt' ? 0.9 : 0.3) * (1 - ph); });
    }
    renderer.render(scene, camera);
    pins.forEach(p => project(p.el, p.pos));
    labels.forEach(l => { project(l.el, l.pos); l.el.classList.toggle('is-on', az === l.zone); });
    raf = requestAnimationFrame(loop);
  }
  function project(el, pos) {
    tmp.copy(pos).project(camera);
    const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    el.classList.toggle('is-hidden', tmp.z > 1 || x < -40 || x > W + 40 || y < 60 || y > H - 40);
  }
  kick();
}

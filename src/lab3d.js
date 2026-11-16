/* MPAD QC Lab — "See it tested": interactive 3D test demonstrations for each service page.
   Every demo is a procedural model (no external assets) with a timeline that drives the
   animation, a live readout, a chart and the plain-language step list in the page.
   Values shown are illustrative (labelled as such in the UI).
   Build: npx esbuild src/lab3d.js --bundle --minify --format=iife --outfile=js/lab3d.js */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const C = { clay: 0xefece6, clay2: 0xe0dcd4, clay3: 0xcfcac1, concrete: 0xd9d5cd, graphite: 0x2a3140, graphite2: 0x3b4352, chrome: 0xc9d0d8, ink: 0x0a1424, amber: 0xf2b01e, asphalt: 0x2f3238, rebar: 0x55504c, brick: 0xc98f6d };
const UP = new THREE.Vector3(0, 1, 0);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = v => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a)); // 0..1 progress inside [a,b]
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (v, d = 0) => v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ---------- material + mesh helpers ---------- */
const cache = {};
function M(color, o = {}) {
  const k = color + JSON.stringify(o); if (cache[k]) return cache[k];
  return (cache[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .9, metalness: 0 }, o)));
}
const metal = c => M(c, { roughness: .35, metalness: .75 });
const edgeMat = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: .18 });
const amberEdge = new THREE.LineBasicMaterial({ color: 0xd99a0c, transparent: true, opacity: .9 });
function mesh(geo, mat, x = 0, y = 0, z = 0, edges = true, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (edges) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edges === 'amber' ? amberEdge : edgeMat); m.add(e); }
  if (parent) parent.add(m); return m;
}
const B = (w, h, d, mat, x, y, z, edges, p) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, edges, p);
const Cy = (rt, rb, h, mat, x, y, z, segs = 32, edges = false, p) => mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat, x, y, z, edges, p);
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t;
}
function hatchMat(base, line, kind, rx = 2, ry = 1) {
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  return new THREE.MeshStandardMaterial({ roughness: .96, map: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex(base); g.fillRect(0, 0, w, h); g.strokeStyle = g.fillStyle = hex(line);
    if (kind === 'dots') for (let i = 0; i < 380; i++) { g.beginPath(); g.arc((i * 97) % w, (i * 53 + (i % 11) * 17) % h, ((i * 37) % 7) / 3 + 1, 0, 7); g.fill(); }
    if (kind === 'diag') { g.lineWidth = 2; for (let i = -h; i < w; i += 22) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } }
    if (kind === 'rock') { g.lineWidth = 2; for (let i = 0; i < 26; i++) { const x = (i * 71) % w, y = (i * 43) % h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 24, y + 8); g.lineTo(x + 14, y + 26); g.closePath(); g.stroke(); } }
  }, rx, ry) });
}
function masonryMat() {
  return new THREE.MeshStandardMaterial({ roughness: .95, map: canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#cf9574'); gr.addColorStop(1, '#bf8361'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,40,20,.08)'; for (let i = 0; i < 500; i++) g.fillRect((i * 53) % w, (i * 29) % h, 2, 2);
  }) });
}
/* generic text sprite for in-scene labels */
function label(text, opts = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 44;
  g.font = `500 ${fs}px "Geist Mono", ui-monospace, monospace`; const w = Math.ceil(g.measureText(text).width) + 40;
  c.width = w; c.height = fs + 30; g.font = `500 ${fs}px "Geist Mono", ui-monospace, monospace`;
  g.fillStyle = opts.bg || 'rgba(10,20,36,.86)'; const r = 14; g.beginPath(); g.roundRect(0, 0, w, c.height, r); g.fill();
  g.fillStyle = opts.color || '#ffffff'; g.textBaseline = 'middle'; g.fillText(text, 20, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  const k = (opts.size || .22) / c.height; s.scale.set(w * k, c.height * k, 1); s.renderOrder = 10; return s;
}

/* ---------- shared rigs ---------- */
// Compression testing machine (CTM / loading frame)
function ctm(g, { width = 2.2, ramTop = 1.0, crossY = 3.1, platenR = .55, panel = true } = {}) {
  const gm = metal(C.graphite), ch = metal(C.chrome);
  B(width + .3, .5, 1.5, gm, 0, .25, 0, true, g);
  [-1, 1].forEach(s => { Cy(.085, .085, crossY - .3, ch, s * (width / 2 - .05), .5 + (crossY - .3) / 2, 0, 24, false, g); Cy(.13, .13, .12, gm, s * (width / 2 - .05), crossY + .15, 0, 24, false, g); });
  B(width + .3, .4, .8, gm, 0, crossY, 0, true, g);
  const top = Cy(platenR, platenR, .12, ch, 0, crossY - .26, 0, 48, true, g);
  const ram = new THREE.Group(); g.add(ram);
  Cy(.32, .32, 1, metal(0x8a929c), 0, -.5, 0, 32, false, ram);
  Cy(platenR, platenR, .12, ch, 0, -.06, 0, 48, true, ram);
  ram.position.y = ramTop;
  if (panel) { // control console with a glowing screen
    const con = new THREE.Group(); con.position.set(width / 2 + 1.1, 0, .2); g.add(con);
    B(.8, 1.5, .7, M(C.clay2), 0, .75, 0, true, con);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.56, .36), new THREE.MeshBasicMaterial({ color: 0x0f2a44 })); scr.position.set(0, 1.25, .352); con.add(scr);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(.5, .06), new THREE.MeshBasicMaterial({ color: C.amber })); glow.position.set(0, 1.18, .353); con.add(glow);
    con.userData.glow = glow;
    g.userData.console = con;
  }
  return { ram, top, topY: crossY - .32 };
}
function floor(g, w = 9, d = 7) { const f = B(w, .2, d, M(0xf3f0ea, { roughness: 1 }), 0, -.1, 0, true, g); f.castShadow = false; f.userData.floor = true; return f; }


/* surveying scenes: terrain or flat plot + total station + roaming prism pole */
function surveyScene(kind) {
  const g = new THREE.Group();
  const hgt = (x, z) => kind === 'topo' ? .42 * Math.sin(x * .55 + .6) * Math.cos(z * .5) + .22 * Math.sin(x * .25 + z * .45) + .12 * Math.cos(z * .9 - x * .2) : 0;
  const SZ = 8, NS = 64;
  const tg = new THREE.PlaneGeometry(SZ, SZ * .75, NS, NS * .75); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position; for (let i = 0; i < tp.count; i++) tp.setY(i, hgt(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const ground = mesh(tg, M(0xe9e3d6, { roughness: 1 }), 0, 0, 0, false, g); ground.castShadow = false;
  // plinth sides so the terrain reads as a model
  const base = B(SZ, .5, SZ * .75, M(0xd8d1c4), 0, -.55, 0, true, g); base.castShadow = false;
  // contour lines (marching squares on the height field)
  const cl = []; const lv = [-.4, -.25, -.1, .05, .2, .35, .5];
  if (kind === 'topo') {
    const n = 90, x0 = -SZ / 2, z0 = -SZ * .375, dx = SZ / n, dz = SZ * .75 / n;
    lv.forEach(L => { const pts = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const xa = x0 + i * dx, za = z0 + j * dz, c = [[xa, za], [xa + dx, za], [xa + dx, za + dz], [xa, za + dz]], v = c.map(([x, z]) => hgt(x, z) - L);
        const e = []; for (let k = 0; k < 4; k++) { const a = v[k], b = v[(k + 1) % 4]; if ((a < 0) !== (b < 0)) { const t = a / (a - b), p0 = c[k], p1 = c[(k + 1) % 4]; e.push(new THREE.Vector3(p0[0] + (p1[0] - p0[0]) * t, L + .015, p0[1] + (p1[1] - p0[1]) * t)); } }
        if (e.length >= 2) pts.push(e[0], e[1]); if (e.length === 4) pts.push(e[2], e[3]);
      }
      const ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xc98a00, transparent: true, opacity: 0 })); g.add(ls); cl.push(ls); });
  }
  // total station on tripod
  const TS = new THREE.Vector3(-2.4, hgt(-2.4, 1.6), 1.6), apex = TS.clone().add(new THREE.Vector3(0, 1.3, 0));
  [[-.4, -.3], [.4, -.3], [0, .45]].forEach(([a, b]) => { const f = new THREE.Vector3(TS.x + a, hgt(TS.x + a, TS.z + b), TS.z + b), len = f.distanceTo(apex); const leg = mesh(new THREE.CylinderGeometry(.025, .035, len, 8), M(0xd9cbb3), 0, 0, 0, false, g); leg.position.copy(f).add(apex).multiplyScalar(.5); leg.quaternion.setFromUnitVectors(UP, apex.clone().sub(f).normalize()); });
  const head = new THREE.Group(); head.position.copy(apex); g.add(head);
  B(.26, .06, .26, metal(C.graphite), 0, .03, 0, true, head); B(.24, .34, .18, M(0xf2b01e, { roughness: .5 }), 0, .23, 0, true, head);
  const scope = Cy(.055, .055, .26, metal(C.graphite), 0, .3, .06, 16, false, head); scope.rotation.x = Math.PI / 2;
  // prism pole + surveyor figure
  const pole = new THREE.Group(); g.add(pole);
  Cy(.018, .018, 1.6, M(0xf3f0ea), 0, .8, 0, 8, false, pole); Cy(.08, .08, .06, metal(C.graphite), 0, 1.62, 0, 20, true, pole);
  const fig = M(0xf6f4f0); Cy(.11, .08, .85, fig, .22, .43, 0, 12, false, pole); mesh(new THREE.SphereGeometry(.1, 14, 10), fig, .22, .97, 0, false, pole);
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([apex.clone().add(new THREE.Vector3(0, .3, 0)), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf2b01e, transparent: true, opacity: .9 })); g.add(beam);
  // survey path / pegs
  let route = [], markers;
  if (kind === 'topo') {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) { const x = -3.3 + (r % 2 ? 7 - c : c) * .95, z = -2.4 + r * .95; route.push(new THREE.Vector3(x, hgt(x, z), z)); }
    markers = new THREE.InstancedMesh(new THREE.ConeGeometry(.05, .14, 6), M(0xf2b01e, { roughness: .5 }), route.length); markers.count = 0; g.add(markers);
  } else {
    // drawing of the building grid (ghost) + pegs at 9 intersections
    const gx = [-1.4, .4, 2.2], gz = [-1.9, -.4, 1.1];
    gx.forEach(x => gz.forEach(z => route.push(new THREE.Vector3(x, 0, z))));
    const ghost = new THREE.Group(); g.add(ghost);
    const gm = new THREE.LineDashedMaterial({ color: 0x3e6fd8, dashSize: .12, gapSize: .08, transparent: true, opacity: .8 });
    gx.forEach(x => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, .01, -2.5), new THREE.Vector3(x, .01, 1.7)]), gm); l.computeLineDistances(); ghost.add(l); });
    gz.forEach(z => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2, .01, z), new THREE.Vector3(2.8, .01, z)]), gm); l.computeLineDistances(); ghost.add(l); });
    g.userData.ghost = ghost;
    markers = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, .3, .06), M(0xc69a5c), route.length); markers.count = 0; g.add(markers);
    const strings = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gx.flatMap(x => [new THREE.Vector3(x, .25, gz[0]), new THREE.Vector3(x, .25, gz[2])]).concat(gz.flatMap(z => [new THREE.Vector3(gx[0], .25, z), new THREE.Vector3(gx[2], .25, z)]))), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); g.add(strings); g.userData.strings = strings;
  }
  const mt = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
  const tot = route.length;
  return {
    group: g, cam: kind === 'topo' ? [[3.6, 4.4, 6.4], [0, 0, 0]] : [[3.2, 4.8, 5.6], [.4, 0, -.3]], zoom: 1.12, dur: kind === 'topo' ? 10 : 8,
    steps: kind === 'topo' ? [0, .1, .3, .78] : [0, .1, .22, .82],
    update(p) {
      const u = seg(p, .12, .76), k = u * (tot - 1), i = Math.floor(k), f = k - i;
      const a = route[Math.min(i, tot - 1)], b = route[Math.min(i + 1, tot - 1)];
      ps.copy(a).lerp(b, ease(Math.min(1, f * 1.6))); pole.position.copy(ps);
      head.rotation.y = Math.atan2(ps.x - apex.x, ps.z - apex.z);
      beam.geometry.attributes.position.setXYZ(1, ps.x, ps.y + 1.62, ps.z); beam.geometry.attributes.position.needsUpdate = true;
      beam.visible = p > .12 && p < .78 && f > .6;
      const done = p >= .76 ? tot : Math.min(tot, i + (f > .6 ? 1 : 0));
      for (let n = 0; n < done; n++) { mt.compose(route[n].clone().add(new THREE.Vector3(0, kind === 'topo' ? .07 : .15, 0)), qq, sc); markers.setMatrixAt(n, mt); }
      markers.count = done; markers.instanceMatrix.needsUpdate = true;
      const fin = seg(p, .74, .9);
      cl.forEach((l, n) => l.material.opacity = clamp01(fin * 1.6 - n * .08) * .95);
      if (g.userData.ghost) g.userData.ghost.children.forEach(l => l.material.opacity = .25 + (1 - seg(p, .05, .2)) * .55);
      if (g.userData.strings) g.userData.strings.material.opacity = fin;
    },
    read(p) {
      const n = Math.min(tot, Math.floor(seg(p, .12, .76) * tot + .4));
      if (kind === 'topo') return { k: 'Points recorded', v: n * 5, u: 'pts', sub: p > .78 ? 'Ground model built · contours at 0.15 m interval' : 'Each point: easting, northing and level', ok: p > .82 ? 'Survey drawing ready for design (illustrative)' : '' };
      return { k: 'Pegs marked', v: n, u: '/ 9', sub: p > .8 ? 'Grid lines strung · diagonals cross-checked' : n ? `Column ${String.fromCharCode(65 + Math.floor((n - 1) / 3))}${((n - 1) % 3) + 1} located from drawing coordinates` : 'Setting out the column grid', ok: p > .84 ? 'Grid within tolerance (illustrative)' : '' };
    },
    chart: kind === 'topo' ? { x: 'Time', y: 'Area mapped', f: u => ease(seg(u, .1, .8)), u: p => p } : { x: 'Time', y: 'Pegs', f: u => Math.floor(seg(u, .12, .76) * 9) / 9, u: p => p },
  };
}

/* =====================================================================
   DEMOS — each returns { group, cam:[pos,target], dur, update(p,t), read(p), curve, steps }
   ===================================================================== */
const DEMOS = {
  /* ---------------- CONCRETE ---------------- */
  cube() {
    const g = new THREE.Group(); floor(g);
    const s = .7, rig = ctm(g, { ramTop: 1.0, crossY: 1.0 + s + .5 + .32 });
    const cube = B(s, s, s, M(C.concrete), 0, s / 2, 0, true, rig.ram);
    // failure pieces: hourglass core (two square frustums) + 4 spalling faces
    const frag = new THREE.Group(); frag.visible = false; rig.ram.add(frag);
    const core1 = mesh(new THREE.CylinderGeometry(.28, s * .7, s / 2, 4), M(C.concrete), 0, s * .75, 0, true, frag); core1.rotation.y = Math.PI / 4;
    const core2 = mesh(new THREE.CylinderGeometry(s * .7, .28, s / 2, 4), M(C.concrete), 0, s * .25, 0, true, frag); core2.rotation.y = Math.PI / 4;
    const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => { const f = B(x ? .08 : s * .9, s * .8, z ? .08 : s * .9, M(0xd2cec6), x * s * .44, s * .42, z * s * .44, true, frag); f.userData.d = [x, z]; return f; });
    const cracks = new THREE.Group(); cube.add(cracks);
    for (let i = 0; i < 6; i++) { const l = B(.012, s * (.5 + (i % 3) * .12), .012, new THREE.MeshBasicMaterial({ color: C.amber }), (i - 2.5) * .1, 0, s / 2 + .007, false, cracks); l.rotation.z = (i % 2 ? .35 : -.35); }
    cracks.visible = false;
    const lbl = label('150 mm cube', { size: .2 }); lbl.position.set(-.9, 1.4, .6); g.add(lbl);
    return {
      group: g, cam: [[4.2, 3.0, 5.2], [.3, 1.55, 0]], dur: 7.5,
      steps: [0, .14, .4, .74, .9],
      update(p) {
        const rise = ease(seg(p, .02, .14)), load = seg(p, .14, .74), fail = seg(p, .74, .86);
        rig.ram.position.y = lerp(.88, 1.0 + .0, rise) - load * .02;
        cube.visible = p < .74; frag.visible = !cube.visible;
        cube.scale.set(1 + load * .01, 1 - load * .025, 1 + load * .01);
        cracks.visible = p > .55 && p < .74; cracks.children.forEach((l, i) => l.scale.y = clamp01((p - .55) / .19 * 1.4 - i * .1));
        faces.forEach(f => { const [x, z] = f.userData.d; f.position.x = x * (s * .44 + fail * .45); f.position.z = z * (s * .44 + fail * .45); f.position.y = s * .42 - fail * fail * .25; f.rotation.z = -x * fail * .9; f.rotation.x = z * fail * .9; });
        const con = g.userData.console; if (con) con.userData.glow.scale.x = .1 + load * .9;
      },
      read(p) { const L = p < .14 ? 0 : p < .74 ? 675 * Math.pow(seg(p, .14, .74), 1.3) : 675 * (1 - seg(p, .74, .9) * .85); return { k: 'Load on cube', v: fmt(L), u: 'kN', sub: p > .74 ? 'Peak 675 kN ÷ 22,500 mm² = 30.0 N/mm²' : 'Strength = load ÷ area of the cube face', ok: p > .86 ? 'Meets M25 grade (illustrative)' : '' }; },
      chart: { x: 'Time', y: 'Load (kN)', f: u => u < .8 ? Math.pow(u / .8, 1.3) : 1 - (u - .8) / .2 * .85, u: p => seg(p, .1, .9) },
    };
  },
  slump() {
    const g = new THREE.Group(); floor(g);
    B(2.2, .04, 2.2, metal(0x9aa3ad), 0, .02, 0, true, g);
    const cone = Cy(.2, .4, .6 * 1.0, M(C.chrome, { metalness: .8, roughness: .3, side: THREE.DoubleSide }), 0, .34, 0, 48, true, g);
    cone.geometry = new THREE.CylinderGeometry(.2, .4, .6, 48, 1, true);
    const conc = Cy(.19, .39, .58, M(0xbdb8ae), 0, .33, 0, 48, false, g);
    const rod = Cy(.016, .016, 1.2, metal(C.graphite), .9, .64, 0, 12, false, g); rod.rotation.z = Math.PI / 2;
    const ruler = B(.03, .7, .06, M(C.amber, { roughness: .6 }), .25, .35, .25, false, g); ruler.visible = false;
    const lbl = label('Slump 75 mm', { color: '#f2b01e', size: .11 }); lbl.position.set(.55, .95, .3); lbl.visible = false; g.add(lbl);
    return {
      group: g, cam: [[2.2, 1.6, 2.6], [.2, .4, 0]], dur: 6.5, steps: [0, .14, .38, .66],
      update(p) {
        const lift = ease(seg(p, .14, .38)), sl = ease(seg(p, .38, .62));
        cone.position.set(lift * .95, .34 + lift * .3, 0); if (p > .5) { cone.rotation.x = 0; }
        conc.scale.set(1 + sl * .2, 1 - sl * .19, 1 + sl * .2); conc.position.y = .33 * (1 - sl * .19) + .02;
        rod.position.set(lerp(.9, .5, seg(p, .62, .7)), .66 + lift * .3, 0);
        ruler.visible = lbl.visible = p > .66;
      },
      read(p) { const v = 75 * ease(seg(p, .38, .62)); return { k: 'Slump (drop in height)', v: fmt(v), u: 'mm', sub: 'Measured from cone height to top of concrete', ok: p > .66 ? 'Workability as specified (illustrative)' : '' }; },
      chart: { x: 'Time', y: 'Slump (mm)', f: u => ease(seg(u, .3, .7)), u: p => p },
    };
  },
  /* ---------------- STEEL ---------------- */
  tensile() {
    const g = new THREE.Group(); floor(g);
    const gm = metal(C.graphite), ch = metal(C.chrome);
    B(2.4, .5, 1.4, gm, 0, .25, 0, true, g);
    [-1, 1].forEach(s => Cy(.09, .09, 4.2, ch, s * 1, 2.5, 0, 24, false, g));
    B(2.6, .4, .8, gm, 0, 4.5, 0, true, g);
    const cross = B(2.3, .3, .7, metal(0x4a5260), 0, 3.4, 0, true, g);
    B(.5, .4, .5, gm, 0, 3.05, 0, true, g); B(.5, .4, .5, gm, 0, .8, 0, true, g);
    const L = 1.8, R = .1, n = 120;
    const geo = new THREE.CylinderGeometry(R, R, L, 32, n, false), base = geo.attributes.position.array.slice();
    const bar = mesh(geo, M(C.rebar, { metalness: .6, roughness: .45 }), 0, 1.92, 0, false, g);
    const halves = new THREE.Group(); halves.visible = false; g.add(halves);
    const hTop = Cy(R, R * .55, L / 2, M(C.rebar, { metalness: .6, roughness: .45 }), 0, 0, 0, 24, false, halves);
    const hBot = Cy(R * .55, R, L / 2, M(C.rebar, { metalness: .6, roughness: .45 }), 0, 0, 0, 24, false, halves);
    // ribs (helical markings) drawn as thin rings following the bar
    const rib = new THREE.InstancedMesh(new THREE.TorusGeometry(R * 1.02, .012, 6, 24), M(0x6b645e, { metalness: .6, roughness: .4 }), 26); g.add(rib);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const neckAt = (y, k) => 1 - k * Math.exp(-Math.pow(y / .12, 2));
    const lbl = label('TMT bar Ø 16', { size: .18 }); lbl.position.set(-.9, 2.6, .4); g.add(lbl);
    return {
      group: g, cam: [[3.4, 2.6, 4.8], [0, 2.0, 0]], dur: 8, steps: [0, .12, .36, .72, .86],
      update(p) {
        const el = seg(p, .12, .84), stretch = 1 + el * .16, neck = seg(p, .6, .84) * .45;
        const a = geo.attributes.position.array;
        for (let i = 0; i < a.length; i += 3) { const y = base[i + 1], k = neckAt(y, neck); a[i] = base[i] * k; a[i + 2] = base[i + 2] * k; a[i + 1] = y * stretch; }
        geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
        const half = L * stretch / 2; cross.position.y = 3.4 + (stretch - 1) * L / 2;
        const broke = p > .86; bar.visible = !broke; halves.visible = broke;
        const gap = seg(p, .86, .95) * .25;
        hTop.position.y = 1.92 + half / 2 + gap; hBot.position.y = 1.92 - half / 2 - gap * .2; hTop.scale.y = hBot.scale.y = stretch;
        if (broke) cross.position.y = 3.4 + (stretch - 1) * L / 2 + gap;
        for (let i = 0; i < 26; i++) { const y0 = -L / 2 + .06 + i * (L - .12) / 25, y = y0 * stretch, k = neckAt(y0, neck); ps.set(0, 1.92 + y + (broke && y0 > 0 ? gap : 0), 0); q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 + .25); sc.set(k, k, 1); mtx.compose(ps, q, sc); rib.setMatrixAt(i, mtx); }
        rib.instanceMatrix.needsUpdate = true;
      },
      read(p) {
        const u = seg(p, .12, .84); let s;
        if (u < .25) s = 520 * u / .25; else if (u < .4) s = 520 + (u - .25) * 20; else if (u < .8) s = 523 + (620 - 523) * Math.sin((u - .4) / .4 * Math.PI / 2); else s = 620 - (u - .8) / .2 * 70;
        if (p > .86) s = 0;
        return { k: 'Stress in bar', v: fmt(s), u: 'N/mm²', sub: p > .86 ? '0.2% proof 520 · UTS 620 N/mm² · elongation 18%' : 'Pulled at a steady rate until it breaks', ok: p > .9 ? 'Meets Fe 500 limits of IS 1786 (illustrative)' : '' };
      },
      chart: { x: 'Strain', y: 'Stress', f: u => u < .25 ? .84 * u / .25 : u < .4 ? .84 : u < .8 ? .84 + .16 * Math.sin((u - .4) / .4 * Math.PI / 2) : 1 - (u - .8) / .2 * .12, u: p => seg(p, .12, .86) },
    };
  },
  bend() {
    const g = new THREE.Group(); floor(g);
    B(2.6, .5, 1.2, metal(C.graphite), 0, .25, 0, true, g);
    const R = .26, rb = .08;
    const mandrel = Cy(R, R, .6, metal(C.chrome), 0, .5 + R + .02, 0, 48, true, g); mandrel.rotation.x = Math.PI / 2;
    [-1, 1].forEach(s => { const sup = Cy(.12, .12, .6, metal(0x8a929c), s * .9, .5 + .14, 0, 24, false, g); sup.rotation.x = Math.PI / 2; });
    const barMat = M(C.rebar, { metalness: .6, roughness: .45 });
    const bar = new THREE.Mesh(new THREE.BufferGeometry(), barMat); bar.castShadow = true; g.add(bar);
    const cy = .5 + R + .02, rr = R + rb;
    function path(theta) {
      const pts = [], Ls = 1.2;
      // left leg fixed at bottom of mandrel, right leg wraps by theta (0..π)
      for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector3(-Ls + i * Ls / 10, cy - rr, 0));
      const steps = Math.max(2, Math.round(theta / .08));
      for (let i = 1; i <= steps; i++) { const a = -Math.PI / 2 + theta * i / steps; pts.push(new THREE.Vector3(Math.cos(a) * rr, cy + Math.sin(a) * rr, 0)); }
      const a = -Math.PI / 2 + theta, tdir = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0);
      const end = pts[pts.length - 1];
      for (let i = 1; i <= 10; i++) pts.push(end.clone().addScaledVector(tdir, i * Ls / 10));
      return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .05);
    }
    const lens = label('No cracks ✓', { color: '#f2b01e', size: .12 }); lens.position.set(.1, cy + .65, .35); lens.visible = false; g.add(lens);
    return {
      group: g, cam: [[1.6, 2.0, 3.6], [0, .9, 0]], dur: 6.5, steps: [0, .12, .7],
      update(p) {
        const th = Math.PI * ease(seg(p, .12, .66));
        bar.geometry.dispose(); bar.geometry = new THREE.TubeGeometry(path(th), 80, rb, 16, false);
        lens.visible = p > .7;
      },
      read(p) { const a = 180 * ease(seg(p, .12, .66)); return { k: 'Bend angle', v: fmt(a), u: '°', sub: 'Bar bent round a mandrel of specified diameter', ok: p > .7 ? 'No cracks on the outer face (illustrative)' : '' }; },
      chart: { x: 'Time', y: 'Angle', f: u => ease(seg(u, .1, .7)), u: p => p },
    };
  },
  /* ---------------- GEOTECHNICAL ---------------- */
  spt() {
    const g = new THREE.Group();
    const W = 4, D = 3, layers = [[0, -.8, 0xd8d1c4, 0xb9b1a2, 'dots'], [-.8, -2.6, 0xcdbfae, 0xa9977f, 'diag'], [-2.6, -4, 0xbdb7ad, 0x958e82, 'rock']];
    layers.forEach(([t, b, c, l, k]) => { const m = hatchMat(c, l, k, W / 2, (t - b) / 2); const blk = mesh(new THREE.BoxGeometry(W, t - b, D), m, 0, (t + b) / 2, 0, true, g); blk.castShadow = false; });
    // cut-away notch showing the borehole
    const hole = Cy(.16, .16, 3.6, M(0x2a2420), 0, -1.8, 1.51, 24, false, g); hole.scale.z = .5;
    const sampler = Cy(.11, .11, .55, M(C.amber, { roughness: .45, metalness: .4 }), 0, -2.6, 1.6, 24, true, g);
    const rods = Cy(.035, .035, 4, metal(C.chrome), 0, -.4, 1.6, 12, false, g);
    // tripod + hammer
    const apex = new THREE.Vector3(0, 3.6, 1.42);
    [[-1.2, .6], [1.2, .6], [0, 2.6]].forEach(([a, b]) => { const f = new THREE.Vector3(a, 0, b), len = f.distanceTo(apex); const leg = mesh(new THREE.CylinderGeometry(.04, .055, len, 10), metal(C.graphite), 0, 0, 0, false, g); leg.position.copy(f).add(apex).multiplyScalar(.5); leg.quaternion.setFromUnitVectors(UP, apex.clone().sub(f).normalize()); });
    const anvil = Cy(.13, .13, .12, metal(C.graphite2), 0, .35, 1.42, 24, false, g);
    const hammer = Cy(.17, .17, .42, M(C.amber, { roughness: .5, metalness: .3 }), 0, 1.6, 1.42, 32, true, g);
    const guide = Cy(.02, .02, 1.6, metal(C.chrome), 0, 1.15, 1.42, 8, false, g);
    // increment marks
    const marks = []; for (let i = 0; i < 3; i++) { const mk = B(.5, .012, .02, new THREE.MeshBasicMaterial({ color: i ? C.amber : 0x9aa3ad }), .45, -2.33 - (i + 1) * .3, 1.52, false, g); marks.push(mk); }
    const lab = label('63.5 kg hammer · 750 mm drop', { size: .17 }); lab.position.set(1.3, 2.2, 1.5); g.add(lab);
    const blows = [6, 8, 9], total = 23;
    return {
      group: g, cam: [[3.0, -.2, 7.2], [0, -1.3, 1.2]], zoom: 1.4, dur: 10, steps: [0, .08, .42, .9],
      update(p, t) {
        const u = seg(p, .08, .88), n = Math.floor(u * total), ph = (u * total) % 1;
        hammer.position.y = .5 + .2 + (n >= total ? 0 : (ph < .7 ? ease(ph / .7) * .75 : (1 - (ph - .7) / .3) * .75));
        let depth = 0, k = n; for (let i = 0; i < 3 && k > 0; i++) { const d = Math.min(k, blows[i]); depth += .3 * d / blows[i]; k -= d; }
        sampler.position.y = -2.6 - depth; rods.position.y = -.4 - depth / 2; rods.scale.y = 1 + depth / 4;
        marks.forEach((m, i) => m.material.color.set(depth >= .3 * (i + 1) - .001 ? C.amber : 0x9aa3ad));
      },
      read(p) {
        const n = Math.min(total, Math.floor(seg(p, .08, .88) * total)); const inc = []; let k = n;
        blows.forEach(b => { inc.push(Math.min(Math.max(k, 0), b)); k -= b; });
        return { k: 'Hammer blows', v: n, u: 'blows', sub: `150 mm steps: ${inc.join(' · ')}` + (p > .88 ? ' → N = 8 + 9 = 17' : ''), ok: p > .9 ? 'N = 17 → medium-dense soil (illustrative)' : '' };
      },
      chart: { x: 'Blows', y: 'Penetration', f: u => { const n = u * total; let d = 0, k = n; for (let i = 0; i < 3 && k > 0; i++) { const q = Math.min(k, blows[i]); d += q / blows[i] / 3; k -= q; } return d; }, u: p => seg(p, .08, .88) },
    };
  },
  plate() {
    const g = new THREE.Group();
    const soil = mesh(new THREE.BoxGeometry(7, 1.2, 5), hatchMat(0xd8d1c4, 0xb9b1a2, 'dots', 3, 1), 0, -.6, 0, true, g); soil.castShadow = false;
    const pit = B(1.4, .3, 1.4, M(0xcdbfae), 0, -.14, 0, false, g); pit.castShadow = false;
    const plate = B(.6, .05, .6, metal(C.graphite), 0, -.27, 0, true, g);
    const jack = Cy(.12, .12, .9, M(C.amber, { roughness: .5, metalness: .3 }), 0, .2, 0, 24, true, g);
    B(4.2, .25, .3, metal(C.graphite2), 0, .78, 0, true, g);
    [[-1.8, -1.1], [1.8, -1.1], [-1.8, 1.1], [1.8, 1.1]].forEach(([x, z]) => B(.35, 1.1, .35, M(C.clay3), x, .55, z, true, g));
    B(4.2, .15, 2.6, M(C.clay2), 0, 1.15, 0, true, g);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) B(.95, .4, 1.1, M(0xe6dfd2), -1.5 + i * 1, 1.45 + k * .41, -.6 + j * 1.2, true, g);
    const dial = new THREE.Group(); dial.position.set(.9, -.05, .9); g.add(dial);
    Cy(.015, .015, .5, metal(C.chrome), 0, .1, 0, 8, false, dial); const face = Cy(.11, .11, .04, M(0xffffff), 0, .38, 0, 32, true, dial); face.rotation.x = Math.PI / 2;
    const needle = B(.008, .09, .01, new THREE.MeshBasicMaterial({ color: 0xc0392b }), 0, .38, .025, false, dial);
    return {
      group: g, cam: [[5.4, 3.0, 6.2], [0, .5, 0]], zoom: 1.35, dur: 8, steps: [0, .1, .25, .85],
      update(p) {
        const s = seg(p, .25, .85), settle = Math.pow(s, 1.6) * .1;
        plate.position.y = -.27 - settle; jack.scale.y = 1 + settle * .3; jack.position.y = .2 - settle / 2;
        needle.rotation.z = -s * 5.5; needle.position.x = Math.sin(s * 5.5) * .045; needle.position.y = .38 + Math.cos(s * 5.5) * .045 - .045;
      },
      read(p) { const s = seg(p, .25, .85); return { k: 'Settlement', v: fmt(Math.pow(s, 1.6) * 25, 1), u: 'mm', sub: `Pressure on plate ≈ ${fmt(s * 400)} kN/m²`, ok: p > .85 ? 'Load–settlement curve → safe bearing capacity' : '' }; },
      chart: { x: 'Pressure', y: 'Settlement', f: u => Math.pow(u, 1.6), u: p => seg(p, .25, .85), invert: true },
    };
  },
  /* ---------------- NDT ---------------- */
  rebound() {
    const g = new THREE.Group(); floor(g);
    const col = B(1.2, 3.4, 1.2, M(C.concrete), 0, 1.7, 0, true, g);
    const pts = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) pts.push([-.3 + c * .3, 1.2 + r * .3]);
    const dots = pts.map(([x, y]) => { const d = new THREE.Mesh(new THREE.CircleGeometry(.03, 16), new THREE.MeshBasicMaterial({ color: 0x0a1424 })); d.position.set(x, y, .603); g.add(d); return d; });
    const grid = B(.8, 1.1, .002, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .0 }), 0, 1.65, .603, 'amber', g);
    const hm = new THREE.Group(); g.add(hm);
    Cy(.075, .09, .7, metal(C.graphite), 0, 0, 0, 24, true, hm).rotation.x = Math.PI / 2;
    const plunger = Cy(.025, .025, .25, metal(C.chrome), 0, 0, -.45, 12, false, hm); plunger.rotation.x = Math.PI / 2;
    const vals = [36, 38, 35, 37, 39, 36, 38, 37, 35, 38, 36, 37];
    const tags = pts.map(([x, y], i) => { const s = label(String(vals[i]), { color: '#f2b01e', size: .12 }); s.position.set(x + .1, y + .1, .7); s.visible = false; g.add(s); return s; });
    return {
      group: g, cam: [[1.8, 2.2, 3.4], [0, 1.65, .4]], dur: 9, steps: [0, .08, .2, .9],
      update(p) {
        const u = seg(p, .1, .9), n = Math.min(11, Math.floor(u * 12)), ph = (u * 12) % 1, [x, y] = pts[n];
        const press = u >= 1 ? 0 : Math.sin(Math.min(1, ph / .6) * Math.PI);
        hm.position.set(x, y, .6 + .62 - press * .12); hm.visible = p < .92;
        dots.forEach((d, i) => d.material.color.set(i < n || (i === n && ph > .5) || u >= 1 ? C.amber : 0x0a1424));
        tags.forEach((s, i) => s.visible = i < n || (i === n && ph > .5) || u >= 1);
        grid.children[0].visible = p > .9;
      },
      read(p) { const n = Math.min(12, Math.floor(seg(p, .1, .9) * 12 + .5)); return { k: 'Readings taken', v: n, u: '/ 12', sub: n ? `Latest rebound number R = ${vals[Math.max(0, n - 1)]}` : 'Each impact gives a rebound number', ok: p > .9 ? 'Median R = 37 → uniform surface quality (illustrative)' : '' }; },
      chart: { x: 'Point', y: 'Rebound no.', f: u => (vals[Math.min(11, Math.floor(u * 12))] - 30) / 12, u: p => seg(p, .1, .9), bars: 12 },
    };
  },
  upv() {
    const g = new THREE.Group(); floor(g);
    const col = B(1.4, 3.2, 1.4, M(C.concrete, { transparent: true, opacity: .55, depthWrite: false }), 0, 1.6, 0, true, g);
    // reinforcement visible through the translucent column
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => Cy(.03, .03, 3.1, metal(C.rebar), a * .5, 1.6, b * .5, 8, false, g));
    const tx = Cy(.12, .12, .14, M(C.amber, { roughness: .4 }), -.78, 1.7, 0, 32, true, g); tx.rotation.z = Math.PI / 2;
    const rx = Cy(.12, .12, .14, M(C.amber, { roughness: .4 }), .78, 1.7, 0, 32, true, g); rx.rotation.z = Math.PI / 2;
    const rings = []; for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(.12, .01, 8, 48), new THREE.MeshBasicMaterial({ color: C.amber, transparent: true })); r.rotation.y = Math.PI / 2; g.add(r); rings.push(r); }
    const lbl = label('Path 300 mm', { size: .14 }); lbl.position.set(0, 2.2, .75); g.add(lbl);
    return {
      group: g, cam: [[2.6, 2.5, 3.4], [0, 1.6, 0]], dur: 6.5, steps: [0, .1, .25, .8],
      update(p, t) {
        const on = p > .25 && p < .85;
        rings.forEach((r, i) => { const ph = ((t * .9 + i / 5) % 1); r.visible = on; r.position.set(-.7 + ph * 1.4, 1.7, 0); const s = 1 + Math.sin(ph * Math.PI) * 2.2; r.scale.set(s, s, 1); r.material.opacity = Math.sin(ph * Math.PI) * .9; });
        tx.position.x = -.78 - (1 - seg(p, .1, .25)) * .5; rx.position.x = .78 + (1 - seg(p, .1, .25)) * .5;
      },
      read(p) { const tt = 71.4 * ease(seg(p, .25, .8)); return { k: 'Pulse travel time', v: fmt(tt, 1), u: 'µs', sub: p > .8 ? 'Velocity = 300 mm ÷ 71.4 µs = 4.2 km/s' : 'Ultrasonic pulse crosses the member', ok: p > .82 ? 'Good quality concrete (illustrative)' : '' }; },
      chart: { x: 'Time', y: 'Signal', f: u => u < .55 ? .5 + Math.sin(u * 140) * .02 : .5 + Math.sin(u * 90) * .45 * Math.exp(-(u - .55) * 4), u: p => seg(p, .2, .85), mid: true },
    };
  },
  /* ---------------- AGGREGATE ---------------- */
  sieve() {
    const g = new THREE.Group(); floor(g, 7, 5);
    const stack = new THREE.Group(); g.add(stack);
    const sizes = [[.09, 0x8e8b84], [.065, 0xa8a49c], [.045, 0xbfb9ad], [.03, 0xd6cdbb], [.018, 0xe6dcc6]];
    const levels = [2.15, 1.75, 1.35, .95, .55]; // sieve deck heights (top → pan)
    levels.forEach((y, i) => {
      const ring = Cy(.62, .62, .32, M(i === 4 ? C.graphite2 : C.chrome, { metalness: .75, roughness: .3, side: THREE.DoubleSide }), 0, y + .1, 0, 48, false, stack);
      ring.geometry = new THREE.CylinderGeometry(.62, .62, .32, 48, 1, true);
      const mesh2 = new THREE.Mesh(new THREE.CircleGeometry(.6, 48), new THREE.MeshStandardMaterial({ color: i === 4 ? 0x2a3140 : 0x8f969e, metalness: .5, roughness: .5, transparent: i < 4, opacity: i < 4 ? .55 : 1 }));
      mesh2.rotation.x = -Math.PI / 2; mesh2.position.y = y - .05; stack.add(mesh2);
      const s = label(['20 mm', '10 mm', '4.75 mm', '600 µm', 'Pan'][i], { size: .12 }); s.position.set(.95, y + .05, 0); stack.add(s);
    });
    Cy(.64, .64, .06, metal(C.graphite), 0, 2.48, 0, 48, true, stack);
    const N = 240, parts = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M(0xffffff), N); parts.castShadow = true; stack.add(parts);
    const P = []; const col = new THREE.Color();
    for (let i = 0; i < N; i++) { const cls = i % 5, r = Math.sqrt(((i * 7919) % 997) / 997) * .5, a = i * 2.39; P.push({ cls, x: Math.cos(a) * r, z: Math.sin(a) * r, y0: 2.2 + ((i * 37) % 23) / 100, rot: i }); parts.setColorAt(i, col.set(sizes[cls][1])); }
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), eul = new THREE.Euler();
    return {
      group: g, cam: [[2.8, 2.4, 3.4], [0, 1.3, 0]], dur: 8, steps: [0, .1, .25, .82],
      update(p, t) {
        const shake = p > .2 && p < .8 ? Math.sin(t * 38) * .03 : 0; stack.position.x = shake; stack.rotation.y = shake * 1.5;
        const u = seg(p, .22, .78);
        P.forEach((o, i) => {
          const target = levels[o.cls] - .05 + sizes[o.cls][0], k = clamp01(u * 1.6 - (o.cls * .12) - ((i * 13) % 10) / 40);
          const y = lerp(o.y0, target, ease(k));
          ps.set(o.x * (o.cls === 4 ? .9 : 1), Math.max(y, target), o.z * (o.cls === 4 ? .9 : 1)); eul.set(o.rot, o.rot * 2, 0); q.setFromEuler(eul); sc.setScalar(sizes[o.cls][0]);
          mt.compose(ps, q, sc); parts.setMatrixAt(i, mt);
        });
        parts.instanceMatrix.needsUpdate = true;
      },
      read(p) { const u = seg(p, .22, .78); const pass = [100, 100 - 18 * u, 100 - 46 * u, 100 - 72 * u, 100 - 93 * u]; return { k: 'Passing 4.75 mm sieve', v: fmt(pass[3]), u: '%', sub: p > .8 ? '20 mm: 82% · 10 mm: 54% · 4.75 mm: 28% · 600 µm: 7%' : 'Sample shaken through a stack of standard sieves', ok: p > .82 ? 'Grading curve inside IS 383 envelope (illustrative)' : '' }; },
      chart: { x: 'Sieve size', y: '% passing', f: u => 1 / (1 + Math.exp(-(u - .55) * 9)), u: p => seg(p, .22, .82) },
    };
  },
  abrasion() {
    const g = new THREE.Group(); floor(g, 7, 5);
    const frameM = metal(C.graphite);
    [-1, 1].forEach(s => { B(.25, 1.6, .25, frameM, s * 1.2, .8, -.6, true, g); B(.25, 1.6, .25, frameM, s * 1.2, .8, .6, true, g); });
    B(2.7, .2, 1.5, frameM, 0, .1, 0, true, g);
    const drum = new THREE.Group(); drum.position.y = 1.7; g.add(drum);
    const shell = mesh(new THREE.CylinderGeometry(.75, .75, 1.6, 48, 1, true), M(C.chrome, { metalness: .7, roughness: .3, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, true, drum);
    shell.rotation.z = Math.PI / 2;
    [-.82, .82].forEach(x => { const cap = Cy(.78, .78, .05, metal(C.graphite2), x, 0, 0, 48, true, drum); cap.rotation.z = Math.PI / 2; });
    const shelf = B(1.6, .05, .25, metal(C.graphite2), 0, -.55, 0, false, drum);
    const N = 70, bits = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), M(0xa8a49c), N); g.add(bits);
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), metal(0x9aa3ad), 12); g.add(balls);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const lbl = label('500 revolutions', { size: .15 }); lbl.position.set(0, 2.8, .4); g.add(lbl);
    return {
      group: g, cam: [[2.6, 2.6, 3.6], [0, 1.5, 0]], dur: 7, steps: [0, .12, .2, .85],
      update(p, t) {
        const spin = p > .2 && p < .85; drum.rotation.x = spin ? t * 3.2 : drum.rotation.x;
        const fill = (i, n, r0, mesh2) => { for (let i2 = 0; i2 < n; i2++) { const a = (spin ? t * 3.2 : 0) + i2 * 0.9, lift = spin ? (Math.sin(a) * .5 + .5) : 0; const ang = -Math.PI / 2 + (spin ? (lift - .2) * 1.4 : 0) + ((i2 * 37) % 10 - 5) * .08; const rr = .62 - ((i2 * 13) % 7) * .05; ps.set(-.7 + ((i2 * 53) % 100) / 70, 1.7 + Math.sin(ang) * rr, Math.cos(ang) * rr * .9); q.setFromEuler(new THREE.Euler(i2 + t * (spin ? 4 : 0), i2, 0)); sc.setScalar(r0 * (1 - (p > .2 ? seg(p, .2, .85) * .25 : 0))); mt.compose(ps, q, sc); mesh2.setMatrixAt(i2, mt); } mesh2.instanceMatrix.needsUpdate = true; };
        fill(0, N, .06, bits); fill(0, 12, .085, balls);
      },
      read(p) { const r = Math.round(500 * seg(p, .2, .85)); return { k: 'Drum revolutions', v: r, u: '/ 500', sub: p > .85 ? 'Material passing 1.7 mm after test: 28% of sample' : 'Aggregate tumbled with steel balls', ok: p > .86 ? 'LA abrasion 28% → suitable for wearing surfaces (illustrative)' : '' }; },
      chart: { x: 'Revolutions', y: 'Fines produced', f: u => 1 - Math.exp(-u * 2.2), u: p => seg(p, .2, .85) },
    };
  },
  /* ---------------- BRICK ---------------- */
  brickcomp() {
    const g = new THREE.Group(); floor(g);
    const rig = ctm(g, { ramTop: 1.0, crossY: 1.0 + .38 + .55 + .32, platenR: .62 });
    const brick = mesh(new THREE.BoxGeometry(1.0, .38, .5), masonryMat(), 0, .19, 0, true, rig.ram);
    const frog = B(.5, .02, .25, M(0xb7aea2), 0, .19, 0, false, brick);
    const cracks = new THREE.Group(); brick.add(cracks); cracks.visible = false;
    for (let i = 0; i < 5; i++) { const l = B(.012, .3, .012, new THREE.MeshBasicMaterial({ color: C.amber }), -.35 + i * .18, 0, .256, false, cracks); l.rotation.z = (i % 2 ? .45 : -.3); }
    const chips = new THREE.Group(); rig.ram.add(chips);
    for (let i = 0; i < 10; i++) { const c = B(.07 + (i % 3) * .03, .05, .06, M(C.brick), (i - 5) * .1, .2, .26, false, chips); c.userData.v = [(i - 5) * .02, .02 + (i % 3) * .01]; }
    chips.visible = false;
    return {
      group: g, cam: [[3.6, 2.8, 4.8], [.3, 1.5, 0]], dur: 7.5, steps: [0, .14, .4, .76, .9],
      update(p) {
        const rise = ease(seg(p, .02, .14)), load = seg(p, .14, .76), fail = seg(p, .76, .9);
        rig.ram.position.y = lerp(.88, 1.0, rise) - load * .015;
        cracks.visible = p > .55; cracks.children.forEach((l, i) => l.scale.y = clamp01((p - .55) / .2 * 1.4 - i * .1));
        chips.visible = p > .76; chips.children.forEach(c => { c.position.x += 0; c.position.y = .2 - fail * fail * .35 + c.userData.v[1] * fail * 6; c.position.z = .26 + fail * .4; c.rotation.x = fail * 3; });
        const con = g.userData.console; if (con) con.userData.glow.scale.x = .1 + load * .9;
      },
      read(p) { const L = p < .14 ? 0 : p < .76 ? 190 * Math.pow(seg(p, .14, .76), 1.2) : 190 * (1 - seg(p, .76, .9) * .8); return { k: 'Load on brick', v: fmt(L), u: 'kN', sub: p > .76 ? 'Peak 190 kN ÷ 25,300 mm² = 7.5 N/mm²' : 'Frog filled with mortar, then crushed flat-wise', ok: p > .88 ? 'Class 7.5 brick (illustrative)' : '' }; },
      chart: { x: 'Time', y: 'Load (kN)', f: u => u < .8 ? Math.pow(u / .8, 1.2) : 1 - (u - .8) / .2 * .8, u: p => seg(p, .1, .9) },
    };
  },
  absorption() {
    const g = new THREE.Group(); floor(g, 8, 5);
    // weighing balance (left) and curing tank (right)
    B(1.1, .3, .9, M(C.clay2), -1.6, .15, 0, true, g); const pan = B(.9, .04, .7, metal(C.chrome), -1.6, .34, 0, true, g);
    const disp = label('3.100 kg', { color: '#f2b01e', size: .16 }); disp.position.set(-1.6, .8, .55); g.add(disp);
    const dispW = label('3.550 kg', { color: '#f2b01e', size: .16 }); dispW.position.set(-1.6, .8, .55); dispW.visible = false; g.add(dispW);
    const tankM = M(0xdfe8f2, { transparent: true, opacity: .25, roughness: .1, depthWrite: false, side: THREE.DoubleSide });
    mesh(new THREE.BoxGeometry(1.6, 1, 1.1), tankM, 1.4, .5, 0, true, g);
    const water = B(1.56, .8, 1.06, M(0x7fa8d6, { transparent: true, opacity: .35, roughness: .1, depthWrite: false }), 1.4, .41, 0, false, g);
    const brick = mesh(new THREE.BoxGeometry(.8, .27, .4), masonryMat(), -1.6, .5, 0, true, g);
    const clock = new THREE.Group(); clock.position.set(.15, 1.25, -.3); g.add(clock);
    const face = Cy(.28, .28, .04, M(0xffffff), 0, 0, 0, 48, true, clock); face.rotation.x = Math.PI / 2;
    const hand = B(.02, .22, .02, new THREE.MeshBasicMaterial({ color: 0x0a1424 }), 0, .1, .03, false, clock);
    const hrs = label('24 h', { size: .12 }); hrs.position.set(.45, 0, 0); clock.add(hrs);
    return {
      group: g, cam: [[.2, 2.6, 4.6], [0, .7, 0]], dur: 9, steps: [0, .14, .3, .7, .86],
      update(p) {
        const toTank = ease(seg(p, .14, .3)), soak = seg(p, .3, .7), back = ease(seg(p, .7, .84));
        const x = p < .7 ? lerp(-1.6, 1.4, toTank) : lerp(1.4, -1.6, back), arc = Math.sin((p < .7 ? toTank : back) * Math.PI) * .9;
        const y = p < .3 ? lerp(.5, .3, toTank) + arc : p < .7 ? .3 : lerp(.3, .5, back) + arc;
        brick.position.set(x, y, 0); hand.parent.rotation.z = 0; clock.rotation.z = 0; hand.position.set(Math.sin(soak * Math.PI * 4) * .1, Math.cos(soak * Math.PI * 4) * .1, .03); hand.rotation.z = -soak * Math.PI * 4;
        brick.material.color.setScalar(p > .3 && p < .84 ? .82 : p >= .84 ? .88 : 1);
        disp.visible = p < .14; dispW.visible = p > .84;
      },
      read(p) { const wet = p > .84; return { k: wet ? 'Wet weight' : 'Dry weight', v: wet ? '3.550' : '3.100', u: 'kg', sub: wet ? 'Absorption = (3.550 − 3.100) ÷ 3.100 = 14.5%' : p > .3 && p < .7 ? 'Immersed in water for 24 hours' : 'Oven-dried brick weighed first', ok: p > .86 ? 'Within limit for burnt clay bricks (illustrative)' : '' }; },
      chart: { x: 'Hours', y: 'Weight gain', f: u => 1 - Math.exp(-u * 5), u: p => seg(p, .3, .7) },
    };
  },
  /* ---------------- WATER ---------------- */
  ph() {
    const g = new THREE.Group(); floor(g, 7, 5); B(4, .1, 2, M(C.clay2), 0, .9, 0, true, g); B(.1, .9, .1, metal(C.graphite), -1.8, .45, -.8, false, g); B(.1, .9, .1, metal(C.graphite), 1.8, .45, -.8, false, g);
    const glass = M(0xe8f0f8, { transparent: true, opacity: .28, roughness: .05, depthWrite: false, side: THREE.DoubleSide });
    const beaker = mesh(new THREE.CylinderGeometry(.42, .42, .9, 48, 1, true), glass, 0, 1.4, 0, true, g);
    const liquid = Cy(.4, .4, .62, M(0xa7c8e8, { transparent: true, opacity: .55, roughness: .1 }), 0, 1.27, 0, 48, false, g);
    const meter = new THREE.Group(); meter.position.set(1.3, .95, .2); g.add(meter);
    B(.8, .3, .55, M(C.graphite), 0, .15, 0, true, meter);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.6, .16), new THREE.MeshBasicMaterial({ color: 0x0f2a44 })); scr.rotation.x = -Math.PI / 2 + .5; scr.position.set(0, .31, .05); meter.add(scr);
    const probe = new THREE.Group(); g.add(probe); Cy(.05, .05, 1.0, M(0xf3f0ea), 0, 0, 0, 24, true, probe); Cy(.06, .04, .12, M(C.amber), 0, -.55, 0, 24, false, probe);
    const tag = label('pH 7.4', { color: '#f2b01e', size: .17 }); tag.position.set(1.3, 1.6, .3); g.add(tag);
    return {
      group: g, cam: [[1.4, 2.4, 3.6], [.3, 1.3, 0]], dur: 6.5, steps: [0, .12, .35, .8],
      update(p) { const d = ease(seg(p, .12, .35)); probe.position.set(lerp(.6, .1, d), lerp(2.6, 1.6, d), 0); tag.visible = p > .8; liquid.material.color.setHSL(.58, .45, .74 + Math.sin(p * 20) * .0); },
      read(p) { const v = p < .35 ? 0 : 7.4 + (1 - seg(p, .35, .8)) * 1.4 * Math.cos(p * 30) * (1 - seg(p, .35, .8)); return { k: 'pH reading', v: p < .35 ? '—' : fmt(v, 2), u: 'pH', sub: 'Probe calibrated with standard buffers first', ok: p > .8 ? 'pH ≥ 6 — suitable per IS 456 (illustrative)' : '' }; },
      chart: { x: 'Time', y: 'pH', f: u => .55 + (1 - u) * .35 * Math.cos(u * 18) * (1 - u), u: p => seg(p, .35, .85), mid: true },
    };
  },
  chloride() {
    const g = new THREE.Group(); floor(g, 7, 5); B(4, .1, 2, M(C.clay2), 0, .9, 0, true, g);
    const stand = metal(C.graphite); Cy(.03, .03, 2.6, stand, -.7, 2.2, -.3, 8, false, g); B(.8, .05, .4, stand, -.7, .97, -.3, false, g); B(.7, .04, .04, stand, -.35, 3.0, -.3, false, g);
    const glass = M(0xe8f0f8, { transparent: true, opacity: .3, roughness: .05, depthWrite: false, side: THREE.DoubleSide });
    mesh(new THREE.CylinderGeometry(.06, .06, 1.6, 24, 1, true), glass, 0, 2.5, -.3, true, g);
    const titr = Cy(.055, .055, 1.2, M(0xd8e6f5, { transparent: true, opacity: .6 }), 0, 2.7, -.3, 24, false, g);
    Cy(.015, .015, .2, glass, 0, 1.62, -.3, 8, false, g);
    const flask = new THREE.Group(); flask.position.set(0, .95, -.3); g.add(flask);
    mesh(new THREE.CylinderGeometry(.08, .45, .7, 48, 1, true), glass, 0, .35, 0, true, flask);
    const sol = Cy(.2, .44, .3, M(0xf2d24a, { transparent: true, opacity: .75, roughness: .2 }), 0, .16, 0, 48, false, flask);
    const drops = []; for (let i = 0; i < 4; i++) { const d = mesh(new THREE.SphereGeometry(.025, 12, 8), M(0xd8e6f5, { transparent: true, opacity: .8 }), 0, 0, -.3, false, g); drops.push(d); }
    const yel = new THREE.Color(0xf2d24a), red = new THREE.Color(0xb3542e);
    return {
      group: g, cam: [[1.6, 2.4, 3.4], [0, 1.7, -.3]], dur: 8, steps: [0, .1, .2, .74, .86],
      update(p, t) {
        const u = seg(p, .2, .8), run = p > .2 && p < .76;
        drops.forEach((d, i) => { const ph = (t * 1.6 + i / 4) % 1; d.visible = run; d.position.y = 1.5 - ph * .3; });
        titr.scale.y = 1 - u * .35; titr.position.y = 2.7 - u * .21;
        sol.material.color.copy(yel).lerp(red, ease(seg(p, .7, .78)));
      },
      read(p) { const ml = 12.4 * seg(p, .2, .76); return { k: 'Silver nitrate added', v: fmt(ml, 1), u: 'ml', sub: p > .76 ? 'End-point: yellow → brick-red · Chloride ≈ 220 mg/l' : 'Drop by drop until the colour changes', ok: p > .86 ? 'Within IS 456 limit for RCC (500 mg/l) — illustrative' : '' }; },
      chart: { x: 'Titrant (ml)', y: 'Colour change', f: u => 1 / (1 + Math.exp(-(u - .9) * 40)), u: p => seg(p, .2, .8) },
    };
  },

  /* ---------------- SURVEYING ---------------- */
  topo() { return surveyScene('topo'); },
  setout() { return surveyScene('setout'); },

  /* ---------------- still-only scenes (used for illustrations) ---------------- */
  samples() {
    const g = new THREE.Group(); floor(g);
    B(2.6, .5, 1.6, M(0xc9b48d), 0, .25, 0, true, g); // crate
    const kraft = M(0xd8c3a0, { roughness: 1 });
    for (let i = 0; i < 4; i++) { const b = mesh(new RoundedBoxGeometry(.5, .32, .38, 3, .08), kraft, -.9 + i * .58, .66, -.35, false, g); b.rotation.y = (i % 2 ? .12 : -.08); const tag = B(.22, .12, .01, M(0xffffff), 0, .02, .2, false, b); tag.rotation.x = -.3; }
    for (let i = 0; i < 3; i++) B(.34, .34, .34, M(C.concrete), -.8 + i * .45, .67, .35, true, g);
    const cb = B(1.0, .14, .5, M(C.clay3), .85, .57, .38, true, g);
    for (let k = 0; k < 3; k++) { const c = Cy(.07, .07, .9, M(0xbcb6ac), .85, .69, .23 + k * .15, 16, false, g); c.rotation.z = Math.PI / 2; }
    for (let k = 0; k < 4; k++) { const r = Cy(.025, .025, 1.1, M(C.rebar, { metalness: .6, roughness: .45 }), -.1 + k * .06, .55, .02, 8, false, g); r.rotation.z = Math.PI / 2; r.rotation.y = .4; }
    return { group: g, cam: [[2.4, 2.2, 3.2], [0, .6, 0]], dur: 1, steps: [0], update() {}, read() { return { k: '', v: '', u: '', sub: '' }; }, chart: { x: '', y: '', f: () => 0, u: () => 0 } };
  },
  report() {
    const g = new THREE.Group(); floor(g);
    const tex = canvasTex(512, 724, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#0a1424'; c.fillRect(40, 40, 200, 26); c.fillStyle = '#9aa3ad'; c.fillRect(40, 76, 300, 10); c.fillRect(40, 94, 260, 10);
      c.strokeStyle = '#cfd5dc'; c.lineWidth = 2; for (let r = 0; r < 9; r++) { c.strokeRect(40, 140 + r * 34, w - 80, 34); } c.beginPath(); c.moveTo(240, 140); c.lineTo(240, 446); c.moveTo(360, 140); c.lineTo(360, 446); c.stroke();
      c.fillStyle = '#0a1424'; for (let r = 0; r < 9; r++) { c.fillRect(52, 152 + r * 34, 120 + (r * 37) % 60, 9); c.fillRect(252, 152 + r * 34, 70, 9); c.fillStyle = r % 3 ? '#0a1424' : '#1fa855'; c.fillRect(372, 152 + r * 34, 60, 9); c.fillStyle = '#0a1424'; }
      c.fillStyle = '#9aa3ad'; for (let r = 0; r < 5; r++) c.fillRect(40, 480 + r * 18, w - 80 - (r % 2) * 90, 8);
      c.strokeStyle = '#f2b01e'; c.lineWidth = 6; c.beginPath(); c.arc(w - 110, h - 110, 58, 0, 7); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(w - 110, h - 110, 44, 0, 7); c.stroke();
      c.fillStyle = '#f2b01e'; c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText('TESTED', w - 110, h - 104);
      c.strokeStyle = '#0a1424'; c.lineWidth = 3; c.beginPath(); c.moveTo(60, h - 100); c.bezierCurveTo(100, h - 140, 140, h - 60, 190, h - 110); c.bezierCurveTo(210, h - 125, 230, h - 95, 260, h - 105); c.stroke();
    });
    const sheetM = new THREE.MeshStandardMaterial({ map: tex, roughness: .8 });
    const plain = M(0xf7f6f2);
    for (let i = 0; i < 5; i++) { const sh = B(1.42, .012, 2.0, i === 4 ? [plain, plain, sheetM, plain, plain, plain] : plain, (i - 2) * .05, .02 + i * .014, (2 - i) * .03, false, g); sh.rotation.y = (i - 2) * .05; }
    const clip = B(1.6, .04, 2.24, M(0x2a3140, { roughness: .5 }), -.02, .0, .02, true, g); clip.position.y = 0.0;
    B(.5, .08, .12, metal(C.chrome), 0, .1, -1.02, true, g);
    const pen = Cy(.035, .035, 1.1, M(0x0a1424, { roughness: .3 }), .95, .06, .2, 16, false, g); pen.rotation.z = Math.PI / 2; pen.rotation.y = .5;
    return { group: g, cam: [[1.4, 2.6, 2.4], [0, 0, 0]], dur: 1, steps: [0], update() {}, read() { return { k: '', v: '', u: '', sub: '' }; }, chart: { x: '', y: '', f: () => 0, u: () => 0 } };
  },
  /* ---------------- ROAD ---------------- */
  marshall() {
    const g = new THREE.Group(); floor(g);
    const rig = ctm(g, { ramTop: 1.0, crossY: 1.0 + .9 + .5 + .32, platenR: .45 });
    const lower = B(.9, .25, .5, metal(C.graphite2), 0, .125, 0, true, rig.ram);
    const spec = Cy(.42, .42, .5, M(C.asphalt, { roughness: .75 }), 0, .25 + .42, 0, 48, true, rig.ram); spec.rotation.x = Math.PI / 2;
    for (let i = 0; i < 60; i++) { const s = mesh(new THREE.DodecahedronGeometry(.025 + (i % 3) * .01, 0), M(0x9a968e), 0, 0, 0, false, spec); const a = i * 2.4, r = .1 + ((i * 7) % 30) / 100; s.position.set(Math.cos(a) * r, .251, Math.sin(a) * r); }
    const upper = B(.9, .25, .5, metal(C.graphite2), 0, .25 + .84 + .125, 0, true, rig.ram);
    const water = label('60 °C water bath first', { size: .14 }); water.position.set(-1.4, 2.4, .5); g.add(water);
    return {
      group: g, cam: [[3.4, 2.8, 4.6], [.3, 1.6, 0]], dur: 7, steps: [0, .1, .22, .8],
      update(p) { const rise = ease(seg(p, .1, .22)), load = seg(p, .22, .8); rig.ram.position.y = lerp(.9, 1.0, rise); spec.scale.set(1 + load * .04, 1, 1 - load * .07); const con = g.userData.console; if (con) con.userData.glow.scale.x = .1 + load * .9; },
      read(p) { const u = seg(p, .22, .8), L = u < .75 ? 12.4 * Math.sin(u / .75 * Math.PI / 2) : 12.4 * (1 - (u - .75) * .8); return { k: 'Stability (load)', v: fmt(L, 1), u: 'kN', sub: `Flow ${fmt(u * 3.2, 1)} mm`, ok: p > .8 ? 'Stability 12.4 kN · flow 3.2 mm (illustrative)' : '' }; },
      chart: { x: 'Flow (mm)', y: 'Load (kN)', f: u => u < .75 ? Math.sin(u / .75 * Math.PI / 2) : 1 - (u - .75) * .8, u: p => seg(p, .22, .8) },
    };
  },
  core() {
    const g = new THREE.Group();
    const ls = [[.5, 0xcfc8bb, 'GSB'], [.4, 0xb5b0a8, 'WMM'], [.3, 0x3d4048, 'DBM'], [.2, C.asphalt, 'BC']];
    let y = -1.4; const lab = [];
    ls.forEach(([t, c, n]) => { const b = B(5, t, 3, M(c, { roughness: .9 }), 0, y + t / 2, 0, true, g); b.castShadow = false; const s = label(n, { size: .13 }); s.position.set(2.75, y + t / 2, 1.6); g.add(s); y += t; });
    const top = y;
    const rig = new THREE.Group(); rig.position.set(0, top, 0); g.add(rig);
    B(1.2, .1, .8, metal(C.graphite), 0, .05, 0, true, rig); Cy(.04, .04, 2, metal(C.chrome), -.45, 1, 0, 12, false, rig); Cy(.04, .04, 2, metal(C.chrome), .45, 1, 0, 12, false, rig);
    const head = new THREE.Group(); rig.add(head); B(1.1, .35, .5, M(C.amber, { roughness: .5 }), 0, 0, 0, true, head);
    const barrel = Cy(.2, .2, 1.4, metal(C.chrome), 0, -.85, 0, 32, true, head);
    const coreS = new THREE.Group(); g.add(coreS); coreS.visible = false;
    let cy = 0; ls.slice().reverse().forEach(([t, c]) => { Cy(.17, .17, t, M(c, { roughness: .85 }), 0, -cy - t / 2, 0, 32, true, coreS); cy += t; });
    const hole = Cy(.2, .2, .02, M(0x111418), 0, top + .011, 0, 32, false, g); hole.visible = false;
    return {
      group: g, cam: [[3.8, .9, 5.2], [.4, -.3, 0]], zoom: 1.2, dur: 8, steps: [0, .1, .45, .75],
      update(p, t) {
        const down = ease(seg(p, .1, .42)), up = ease(seg(p, .45, .7));
        head.position.y = 2.1 - down * 1.6 + up * 1.6; barrel.rotation.y = p > .1 && p < .45 ? t * 12 : 0;
        hole.visible = p > .45;
        coreS.visible = p > .45;
        if (p <= .7) coreS.position.set(0, top + head.position.y - .2, 0);
        else { const k = ease(seg(p, .7, .86)); coreS.position.set(lerp(0, 1.8, k), lerp(top + 1.9, top + 1.42, k), lerp(0, .9, k)); }
      },
      read(p) { const d = Math.round(140 * ease(seg(p, .1, .42))); return { k: 'Core depth', v: p > .75 ? 140 : d, u: 'mm', sub: p > .75 ? 'BC 40 mm · DBM 60 mm · then WMM / GSB' : 'Diamond core cutter, water-cooled', ok: p > .8 ? 'Layer thickness & density checked (illustrative)' : '' }; },
      chart: { x: 'Time', y: 'Depth', f: u => ease(seg(u, .1, .5)), u: p => p },
    };
  },
};

/* ---------- runtime ---------- */
function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }

document.querySelectorAll('[data-lab]').forEach(section => {
  if (!webglOK()) { section.classList.add('lab--static'); return; }
  const start = () => init(section);
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '400px' }); io.observe(section); } else start();
});

function init(section) {
  section.classList.add('lab--live');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = section.querySelector('.lab-stage'), host = section.querySelector('.lab-canvas');
  const tabs = [...section.querySelectorAll('.lab-tab')], panes = [...section.querySelectorAll('.lab-demo')];
  const rd = { k: section.querySelector('.lab-read .k'), v: section.querySelector('.lab-read b'), u: section.querySelector('.lab-read i'), sub: section.querySelector('.lab-read .sub'), ok: section.querySelector('.lab-ok') };
  const chart = section.querySelector('.lab-chart'), cx = chart.getContext('2d');
  const bar = section.querySelector('.lab-progress i'), playBtn = section.querySelector('[data-lab-play]'), replayBtn = section.querySelector('[data-lab-replay]');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .5;
  const key = new THREE.DirectionalLight(0xfff6ea, 2.2); key.position.set(-5, 9, 6); key.castShadow = true; key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); key.shadow.bias = -.0003; key.shadow.normalBias = .02; key.shadow.radius = 3; scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd0ff, .55); rim.position.set(6, 4, -5); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2436, .35));
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: .08, enablePan: false, enableZoom: false, rotateSpeed: .6, maxPolarAngle: Math.PI * .49, minDistance: 1.5, maxDistance: 16 });
  renderer.domElement.style.touchAction = 'pan-y';
  section.querySelectorAll('[data-lab-zoom]').forEach(b => b.addEventListener('click', () => { const off = camera.position.clone().sub(controls.target); off.multiplyScalar(b.getAttribute('data-lab-zoom') === 'in' ? .8 : 1.25); off.clampLength(controls.minDistance, controls.maxDistance); goalPos.copy(controls.target).add(off); user = false; }));

  let demo = null, t0 = performance.now(), paused = false, pAt = 0, user = false, lastStep = -1;
  const goalPos = new THREE.Vector3(), goalT = new THREE.Vector3();
  controls.addEventListener('start', () => { user = true; });
  function load(id) {
    if (demo) { scene.remove(demo.group); }
    demo = DEMOS[id](); scene.add(demo.group);
    goalT.set(...demo.cam[1]); goalPos.set(...demo.cam[0]).sub(goalT).multiplyScalar(demo.zoom || 1.32).add(goalT);
    camera.position.copy(goalPos).multiplyScalar(1.08); controls.target.copy(goalT); user = false;
    tabs.forEach(b => { const on = b.dataset.demo === id; b.setAttribute('aria-selected', on); b.classList.toggle('is-on', on); });
    panes.forEach(p => { p.hidden = p.dataset.demo !== id; });
    t0 = performance.now(); paused = false; lastStep = -1; setPlay();
    section.dataset.demo = id;
  }
  tabs.forEach(b => b.addEventListener('click', () => load(b.dataset.demo)));
  function setPlay() { if (playBtn) { playBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause'); playBtn.classList.toggle('is-paused', paused); } }
  playBtn && playBtn.addEventListener('click', () => { if (paused) { t0 = performance.now() - pAt * demo.dur * 1000; } paused = !paused; setPlay(); });
  replayBtn && replayBtn.addEventListener('click', () => { t0 = performance.now(); paused = false; setPlay(); });
  const progEl = section.querySelector('.lab-progress');
  progEl && progEl.addEventListener('click', e => { const r = progEl.getBoundingClientRect(); pAt = clamp01((e.clientX - r.left) / r.width); t0 = performance.now() - pAt * demo.dur * 1000; });

  let W = 1, H = 1;
  function resize() { W = host.clientWidth || 1; H = host.clientHeight || 1; renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = W < 520 ? 38 : 30; camera.updateProjectionMatrix(); const dpr = Math.min(devicePixelRatio || 1, 2); chart.width = chart.clientWidth * dpr; chart.height = chart.clientHeight * dpr; }
  new ResizeObserver(resize).observe(host); resize();

  function drawChart(p) {
    const c = demo.chart, w = chart.width, h = chart.height, dpr = w / Math.max(1, chart.clientWidth), pad = 8 * dpr;
    cx.clearRect(0, 0, w, h);
    cx.strokeStyle = 'rgba(255,255,255,.12)'; cx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = pad + (h - 2 * pad) * i / 4; cx.beginPath(); cx.moveTo(pad, y); cx.lineTo(w - pad, y); cx.stroke(); }
    cx.fillStyle = 'rgba(174,186,208,.8)'; cx.font = `${10 * dpr}px "Geist Mono", monospace`; cx.fillText(c.y.toUpperCase(), pad, pad + 8 * dpr); cx.textAlign = 'right'; cx.fillText(c.x.toUpperCase(), w - pad, h - pad); cx.textAlign = 'left';
    const U = c.u(p), X = u => pad + (w - 2 * pad) * u, Y = v => h - pad - (h - 2 * pad - 14 * dpr) * (c.invert ? 1 - v : v) - (c.invert ? 0 : 0);
    if (c.bars) { const n = Math.floor(U * c.bars + .5); for (let i = 0; i < n; i++) { const v = c.f((i + .5) / c.bars), x = X(i / c.bars) + 2 * dpr, bw = (w - 2 * pad) / c.bars - 4 * dpr; cx.fillStyle = '#f2b01e'; cx.fillRect(x, Y(v), bw, h - pad - Y(v)); } return; }
    const grd = cx.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(242,176,30,.35)'); grd.addColorStop(1, 'rgba(242,176,30,0)');
    cx.beginPath(); const steps = 120; let lx = X(0), ly = Y(c.f(0)); cx.moveTo(lx, ly);
    for (let i = 1; i <= steps; i++) { const u = i / steps; if (u > U) break; lx = X(u); ly = Y(c.f(u)); cx.lineTo(lx, ly); }
    cx.strokeStyle = '#f2b01e'; cx.lineWidth = 2 * dpr; cx.stroke();
    if (!c.mid && !c.invert) { cx.lineTo(lx, h - pad); cx.lineTo(X(0), h - pad); cx.closePath(); cx.fillStyle = grd; cx.fill(); }
    cx.beginPath(); cx.arc(lx, ly, 4 * dpr, 0, 7); cx.fillStyle = '#fff'; cx.fill();
  }
  function setRead(p) {
    const r = demo.read(p);
    if (rd.k.textContent !== r.k) rd.k.textContent = r.k;
    rd.v.textContent = r.v; rd.u.textContent = r.u; rd.sub.textContent = r.sub;
    rd.ok.textContent = r.ok || ''; rd.ok.classList.toggle('is-on', !!r.ok);
    let st = 0; demo.steps.forEach((a, i) => { if (p >= a) st = i; });
    if (st !== lastStep) { lastStep = st; const pane = panes.find(x => !x.hidden); pane && pane.querySelectorAll('.lab-steps li').forEach((li, i) => li.classList.toggle('is-on', i === Math.min(st, pane.querySelectorAll('.lab-steps li').length - 1))); }
  }

  let visible = true, raf = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }, { rootMargin: '100px' }).observe(stage);
  let last = performance.now();
  function loop(now) {
    raf = 0; if (!visible) return;
    const dt = Math.min(.1, (now - last) / 1000); last = now; const t = now / 1000;
    const total = demo.dur + 2.2; // hold the result before looping
    if (!paused) { const e = ((now - t0) / 1000) % total; pAt = reduce ? 1 : Math.min(1, e / demo.dur); }
    demo.update(pAt, t); setRead(pAt); drawChart(pAt);
    if (bar) bar.style.transform = `scaleX(${pAt})`;
    if (!user) { const k = 1 - Math.exp(-dt * 2.5); camera.position.lerp(goalPos, k); controls.target.lerp(goalT, k); }
    controls.update(); renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  }
  load(tabs[0] ? tabs[0].dataset.demo : Object.keys(DEMOS)[0]);
  raf = requestAnimationFrame(loop);
  // studio still: no floor/labels, soft shadow catcher, camera fitted to the rig (used to render the 3D illustrations)
  function still(fitK = 1.08) {
    controls.maxDistance = 200;
    demo.group.traverse(o => { if (o.userData.floor || o.isSprite) o.visible = false; });
    const box = new THREE.Box3(); demo.group.traverse(o => { if (o.isMesh && o.visible && !o.userData.floor) box.expandByObject(o); });
    const sz = box.getSize(new THREE.Vector3()), cen = box.getCenter(new THREE.Vector3()), r = Math.max(sz.x, sz.z) * .85;
    const blobTex = canvasTex(256, 256, (g2, w, h) => { const gr = g2.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(.55, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w, h); });
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.set(cen.x, box.min.y + .002, cen.z); demo.group.add(blob);
    renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    const sph = box.getBoundingSphere(new THREE.Sphere()), dir = camera.position.clone().sub(controls.target).normalize();
    const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * fitK;
    goalT.copy(sph.center); goalPos.copy(sph.center).addScaledVector(dir, dist); camera.position.copy(goalPos); controls.target.copy(goalT); user = false;
  }
  window.__labDebug = { setP(p) { paused = true; pAt = p; setPlay(); }, load, still };
}

/* Low-poly people for the 3D scenes. Every body part of every person is one instance of a
   shared InstancedMesh (≈13 draw calls for any number of people). Each person is an
   invisible joint hierarchy (Object3D) that we pose every frame; tools can be parented to
   the hands as ordinary meshes. */
import * as THREE from 'three';

const PALETTE = {
  skin: [0xc68b62, 0xa8724f, 0xd8a47c, 0x8d5b3d],
  vest: 0xf26a1b, vestY: 0xd9e021, shirt: 0x8fb3d9, shirt2: 0xe8e6df, trousers: 0x2c3e66, trousers2: 0x4a4f57,
  boots: 0x3b2a1e, helmetY: 0xf2c218, helmetW: 0xf4f4f0, helmetO: 0xf08a24, coat: 0xf7f8fa, strip: 0xd9dde3, hair: 0x1d1a18,
};

export function createPeople(parent, max = 32) {
  const capsule = (r, l) => { const g = new THREE.CapsuleGeometry(r, l, 4, 10); g.translate(0, -l / 2 - r * 0.6, 0); return g; };
  const P = {
    pelvis: new THREE.BoxGeometry(0.3, 0.16, 0.19),
    torso: (() => { const g = new THREE.CapsuleGeometry(0.15, 0.24, 4, 12); g.scale(1, 1, 0.68); g.translate(0, 0.26, 0); return g; })(),
    strip: (() => { const g = new THREE.CylinderGeometry(0.158, 0.158, 0.035, 14, 1, true); g.scale(1, 1, 0.7); g.translate(0, 0.17, 0); return g; })(),
    thigh: capsule(0.072, 0.3), shin: capsule(0.062, 0.3),
    boot: (() => { const g = new THREE.BoxGeometry(0.11, 0.08, 0.22); g.translate(0, -0.04, 0.04); return g; })(),
    upper: capsule(0.052, 0.2), fore: capsule(0.045, 0.18),
    hand: new THREE.SphereGeometry(0.045, 8, 6),
    head: (() => { const g = new THREE.SphereGeometry(0.1, 14, 10); g.scale(0.92, 1.05, 1); return g; })(),
    helmet: (() => { const g = new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.translate(0, 0.02, 0); return g; })(),
    brim: (() => { const g = new THREE.CylinderGeometry(0.135, 0.135, 0.015, 16); g.translate(0, 0.02, 0.012); return g; })(),
    coat: (() => { const g = new THREE.CylinderGeometry(0.17, 0.21, 0.5, 14, 1, true); g.scale(1, 1, 0.75); g.translate(0, -0.18, 0); return g; })(),
    blob: (() => { const g = new THREE.PlaneGeometry(0.75, 0.75); g.rotateX(-Math.PI / 2); return g; })(),
  };
  const base = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0xffffff });
  const parts = {};
  Object.keys(P).forEach(k => {
    const im = new THREE.InstancedMesh(P[k], k === 'blob' ? blobMat : base, max * 2);
    im.count = 0; im.frustumCulled = false; im.userData.dyn = true; im.castShadow = false; im.receiveShadow = k !== 'blob';
    if (k === 'blob') im.renderOrder = 1;
    parent.add(im); parts[k] = im;
  });
  const people = [];
  const col = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);

  function joint(par, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); par.add(o); return o; }
  function add(o = {}) {
    const i = people.length; if (i >= max) return null;
    const root = new THREE.Group(); parent.add(root); root.userData.dyn = true;
    root.position.set(o.x || 0, o.y || 0, o.z || 0); root.rotation.y = o.ry || 0; root.scale.setScalar(o.s || 1);
    const hips = joint(root, 0, 0.9, 0);
    const spine = joint(hips, 0, 0.06, 0);
    const neck = joint(spine, 0, 0.5, 0);
    const head = joint(neck, 0, 0.12, 0);
    const shL = joint(spine, 0.2, 0.44, 0), shR = joint(spine, -0.2, 0.44, 0);
    const elL = joint(shL, 0, -0.29, 0), elR = joint(shR, 0, -0.29, 0);
    const haL = joint(elL, 0, -0.27, 0), haR = joint(elR, 0, -0.27, 0);
    const hiL = joint(hips, 0.09, -0.04, 0), hiR = joint(hips, -0.09, -0.04, 0);
    const knL = joint(hiL, 0, -0.42, 0), knR = joint(hiR, 0, -0.42, 0);
    const anL = joint(knL, 0, -0.41, 0), anR = joint(knR, 0, -0.41, 0);
    const kind = o.kind || 'worker';
    const skin = o.skin != null ? o.skin : PALETTE.skin[i % PALETTE.skin.length];
    const torsoC = kind === 'lab' ? PALETTE.coat : kind === 'engineer' ? (o.shirt || PALETTE.shirt2) : (o.vest || (i % 3 === 2 ? PALETTE.vestY : PALETTE.vest));
    const sleeve = kind === 'lab' ? PALETTE.coat : (o.shirt || (kind === 'engineer' ? PALETTE.shirt2 : PALETTE.shirt));
    const legsC = o.trousers || (kind === 'engineer' ? PALETTE.trousers2 : PALETTE.trousers);
    const helmet = o.helmet === false || kind === 'lab' ? null : (o.helmet || (kind === 'engineer' ? PALETTE.helmetW : i % 2 ? PALETTE.helmetO : PALETTE.helmetY));
    const p = {
      i, root, hips, spine, neck, head, shL, shR, elL, elR, haL, haR, hiL, hiR, knL, knR, anL, anR, kind,
      list: [
        ['pelvis', hips, legsC], ['torso', spine, torsoC], ['strip', spine, kind === 'worker' ? PALETTE.strip : null],
        ['thigh', hiL, legsC], ['thigh', hiR, legsC], ['shin', knL, legsC], ['shin', knR, legsC], ['boot', anL, PALETTE.boots], ['boot', anR, PALETTE.boots],
        ['upper', shL, sleeve], ['upper', shR, sleeve], ['fore', elL, kind === 'lab' ? PALETTE.coat : skin], ['fore', elR, kind === 'lab' ? PALETTE.coat : skin], ['hand', haL, skin], ['hand', haR, skin],
        ['head', head, skin], ['helmet', head, helmet || PALETTE.hair], ['brim', head, helmet], ['coat', spine, kind === 'lab' ? PALETTE.coat : null], ['blob', root, 0xffffff],
      ],
      slots: [],
    };
    p.list.forEach(([k, , c]) => { const im = parts[k], s = im.count++; p.slots.push(s); im.setMatrixAt(s, zero); col.set(c == null ? 0xffffff : c); im.setColorAt(s, col); });
    people.push(p); pose(p, {}); return p;
  }
  // pose: angles in radians. arms: [forward(+)/back, out(+)] at shoulder, elbow bend; legs: hip forward, knee bend
  function pose(p, a) {
    const d = (v, f = 0) => v == null ? f : v;
    p.spine.rotation.set(d(a.lean), d(a.twist), d(a.side));
    p.neck.rotation.set(d(a.nod), d(a.look), 0);
    p.shL.rotation.set(-d(a.armL), 0, d(a.outL, 0.08)); p.elL.rotation.set(-d(a.elbL, 0.15), 0, 0);
    p.shR.rotation.set(-d(a.armR), 0, -d(a.outR, 0.08)); p.elR.rotation.set(-d(a.elbR, 0.15), 0, 0);
    p.hiL.rotation.set(-d(a.legL), 0, 0.02); p.knL.rotation.set(d(a.kneeL), 0, 0); p.anL.rotation.set(0, 0, 0);
    p.hiR.rotation.set(-d(a.legR), 0, -0.02); p.knR.rotation.set(d(a.kneeR), 0, 0); p.anR.rotation.set(0, 0, 0);
    p.hips.position.y = 0.9 - d(a.drop); p.hips.rotation.y = d(a.hipTwist);
  }
  const tmpM = new THREE.Matrix4(), inv = new THREE.Matrix4();
  function sync() {
    parent.updateMatrixWorld(true); inv.copy(parent.matrixWorld).invert();
    people.forEach(p => p.list.forEach(([k, j, c], n) => {
      const im = parts[k];
      if (c == null || p.hidden) { im.setMatrixAt(p.slots[n], zero); return; }
      tmpM.multiplyMatrices(inv, j.matrixWorld);
      if (k === 'blob') { tmpM.elements[13] = p.root.position.y + 0.02; }
      im.setMatrixAt(p.slots[n], tmpM);
    }));
    Object.values(parts).forEach(im => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  }
  // gait helper: walking pose at phase ph (radians)
  function walk(p, ph, amp = 0.5) {
    const s = Math.sin(ph), c = Math.cos(ph);
    pose(p, { legL: s * amp, legR: -s * amp, kneeL: Math.max(0, -c) * amp * 1.2, kneeR: Math.max(0, c) * amp * 1.2, armL: -s * amp * 0.7, armR: s * amp * 0.7, elbL: 0.3, elbR: 0.3, drop: Math.abs(c) * 0.025 });
  }
  return { add, pose, sync, walk, parts, people, PALETTE };
}

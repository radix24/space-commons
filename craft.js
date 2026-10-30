// Procedural spacecraft for missions without a public NASA model.
// Each builder works in metres with +Z pointing at Earth (high-gain antenna side); app.js rescales to true size.
// Dimensions follow published mission figures (array spans, bus sizes, boom lengths) to within a few tens of percent.
import * as THREE from 'three';

const std = (color, metalness = 0.5, roughness = 0.45, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
let crinkle = null;
function crinkleTex() { // crumpled-foil bump map: many short random creases
  if (crinkle) return crinkle;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  c.fillStyle = '#808080'; c.fillRect(0, 0, 256, 256);
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) {
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 6 + r() * 26, v = 90 + r() * 90;
    c.strokeStyle = `rgba(${v},${v},${v},0.55)`; c.lineWidth = 0.6 + r() * 1.6;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  crinkle = new THREE.CanvasTexture(cv); crinkle.wrapS = crinkle.wrapT = THREE.RepeatWrapping; crinkle.repeat.set(3, 3);
  return crinkle;
}
const foil = (color, rough) => std(color, 0.85, rough * 0.8, { bumpMap: crinkleTex(), bumpScale: 0.6, roughnessMap: crinkleTex(), envMapIntensity: 2.2 }); // bright, crinkled MLI: it mostly shows what it reflects
const M = {
  gold: () => foil(0xd6a843, 0.38),               // multi-layer insulation, gold foil (crinkled)
  silver: () => foil(0xc7cbd3, 0.32),             // silver MLI
  white: () => std(0xeeeeea, 0.05, 0.6),          // radiators / thermal paint
  dark: () => std(0x22252b, 0.3, 0.6),
  frame: () => std(0x9aa0a8, 0.8, 0.4),
};
let cellTex = null;
function solarMat() { // dark blue cells with a silver grid
  if (!cellTex) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d');
    c.fillStyle = '#26324f'; c.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const g = c.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
      g.addColorStop(0, '#3554a8'); g.addColorStop(1, '#1b2a5e'); c.fillStyle = g; c.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29);
    }
    c.strokeStyle = 'rgba(200,210,230,.55)'; c.lineWidth = 1;
    for (let i = 0; i <= 256; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(256, i); c.stroke(); }
    cellTex = new THREE.CanvasTexture(cv); cellTex.colorSpace = THREE.SRGBColorSpace; cellTex.wrapS = cellTex.wrapT = THREE.RepeatWrapping; cellTex.anisotropy = 4;
  }
  return std(0xffffff, 0.5, 0.25, { map: cellTex });
}

function box(g, w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; }
function cyl(g, r, len, mat, axis = 'y', x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2; g.add(m); return m;
}
function dish(g, diameter, depth, mat, x = 0, y = 0, z = 0, dir = new THREE.Vector3(0, 0, 1)) {
  // parabolic reflector from a lathe profile, opening along `dir`, plus a feed on struts
  const r = diameter / 2, pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(r * t, depth * t * t)); }
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat); m.material.side = THREE.DoubleSide;
  const holder = new THREE.Group(); holder.add(m);
  const feed = new THREE.Mesh(new THREE.ConeGeometry(r * 0.08, r * 0.3, 10), M.white()); feed.position.y = depth + r * 0.45; feed.rotation.x = Math.PI; holder.add(feed);
  for (let k = 0; k < 3; k++) { const a = k * 2.094; const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * diameter, 0.012 * diameter, r * 0.75, 4), M.frame());
    s.position.set(Math.cos(a) * r * 0.45, depth + r * 0.15, Math.sin(a) * r * 0.45); s.lookAt(0, depth + r * 0.6, 0); s.rotateX(Math.PI / 2); holder.add(s); }
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); holder.position.set(x, y, z); g.add(holder); return holder;
}
function wing(g, panels, pw, ph, side, x0, y = 0, z = 0, gap = 0.08, axis = 'x') {
  // a row of solar panels hinged along one axis, with a yoke to the bus
  const mat = solarMat(), w = new THREE.Group();
  for (let i = 0; i < panels; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.035, ph), [M.frame(), M.frame(), mat, M.dark(), M.frame(), M.frame()]);
    p.material[2].map = cellTex.clone(); p.material[2].map.repeat.set(pw / 1.2, ph / 1.2); p.material[2].map.needsUpdate = true;
    p.position.x = side * (i * (pw + gap) + pw / 2); w.add(p);
  }
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, x0 + 0.3, 6), M.frame()); yoke.rotation.z = Math.PI / 2; yoke.position.x = -side * (x0 / 2 + 0.15); w.add(yoke);
  w.position.set(side * x0, y, z); if (axis === 'z') w.rotation.y = Math.PI / 2; g.add(w); return w;
}
function boom(g, len, dirVec, from = new THREE.Vector3(), r = 0.025) {
  const d = dirVec.clone().normalize(), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), M.frame());
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); m.position.copy(from).addScaledVector(d, len / 2); g.add(m);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(r * 6, r * 6, r * 6), M.dark()); tip.position.copy(from).addScaledVector(d, len); g.add(tip);
  return m;
}
function thrusters(g, w, h, d) { for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const n = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 8), M.dark()); n.position.set(sx * w / 2, sy * h / 2, -d / 2); n.rotation.x = -Math.PI / 2; g.add(n); } }


// ---- small parts that make a satellite read as real hardware (used by the Korean satellite models) ----
function foilBox(g, w, h, d, x = 0, y = 0, z = 0, mat = M.gold()) { // MLI-wrapped box with darker seams along the edges
  const b = box(g, w, h, d, mat, x, y, z);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 1.002, h * 1.002, d * 1.002)), new THREE.LineBasicMaterial({ color: 0x5a4418 }));
  e.position.set(x, y, z); g.add(e); return b;
}
function radiator(g, w, h, x, y, z, ry = 0) { // white OSR radiator panel with a tile grid
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const q = cv.getContext('2d'); q.fillStyle = '#e9ecef'; q.fillRect(0, 0, 128, 128);
  q.strokeStyle = 'rgba(120,130,145,.55)'; for (let i = 0; i <= 128; i += 16) { q.beginPath(); q.moveTo(i, 0); q.lineTo(i, 128); q.stroke(); q.beginPath(); q.moveTo(0, i); q.lineTo(128, i); q.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 0.4, h / 0.4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std(0xffffff, 0.3, 0.25, { map: t, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
}
function starTracker(g, x, y, z, dir) { // camera head with a black sun-shade baffle
  const h = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.12), M.dark()); h.add(body);
  const baf = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 0.22, 16, 1, true), std(0x111214, 0.2, 0.9, { side: THREE.DoubleSide })); baf.rotation.x = Math.PI / 2; baf.position.z = 0.16; h.add(baf);
  h.position.set(x, y, z); h.lookAt(new THREE.Vector3(x, y, z).add(dir)); g.add(h); return h;
}
function sunSensor(g, x, y, z) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), std(0x2b3550, 0.4, 0.3)); s.position.set(x, y, z); g.add(s); }
function adapterRing(g, r, y) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 48), M.frame()); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
function thrusterSet(g, pts, dirY = -1) { for (const [x, y, z] of pts) { const n = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 10, 1, true), std(0x8a8f99, 0.9, 0.3, { side: THREE.DoubleSide })); n.position.set(x, y, z); if (dirY > 0) n.rotation.x = Math.PI; g.add(n); } }
function patchAnt(g, x, y, z, r = 0.07) { const a = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.02, 20), std(0xe8e2d0, 0.1, 0.7)); a.position.set(x, y, z); g.add(a); }
function telescope(g, r, len, x, y, z, dir = new THREE.Vector3(0, -1, 0)) { // optical tube with a black-lined baffle opening toward `dir`
  const h = new THREE.Group(); const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 32, 1, true), std(0xf2f2ee, 0.15, 0.5, { side: THREE.FrontSide })); h.add(tube);
  const lin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, len * 0.98, 32, 1, true), std(0x060606, 0.0, 1.0, { side: THREE.BackSide })); h.add(lin);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 32), M.frame()); lip.rotation.x = Math.PI / 2; lip.position.y = len / 2; h.add(lip);
  h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()); h.position.set(x, y, z); g.add(h); return h;
}
function panelWing(g, n, pw, ph, side, x0, y = 0, z = 0, axis = 'x', gap = 0.06) { // wing with yoke, hinges and drive, built on wing()
  const w = wing(g, n, pw, ph, side, x0, y, z, gap, axis);
  for (let i = 1; i < n; i++) { const hx = side * (i * (pw + gap) - gap / 2); for (const hz of [-ph * 0.35, ph * 0.35]) { const hg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.08), M.frame()); hg.position.set(hx, 0, hz); w.add(hg); } }
  const drive = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 16), M.dark()); drive.rotation.z = Math.PI / 2; drive.position.set(-side * (x0 + 0.06), 0, 0); w.add(drive);
  return w;
}
const BUILDERS = {
  // ---- deep-space missions added with their real trajectories (JPL Horizons) ----
  // Cassini: 6.8 m stack - 4 m high-gain dish on top, bus and propulsion module, Huygens probe on the side, three RTGs, 11 m magnetometer boom
  'Cassini'() {
    const g = new THREE.Group();
    dish(g, 4.0, 0.55, M.white(), 0, 0, 2.6, new THREE.Vector3(0, 0, 1));
    cyl(g, 0.85, 1.6, M.gold(), 'z', 0, 0, 1.4, 10);
    cyl(g, 0.65, 3.2, M.gold(), 'z', 0, 0, -0.9, 16);
    cyl(g, 0.35, 0.6, M.dark(), 'z', 0, 0, -2.8, 12);
    const hy = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.6, 24), std(0xb87a3a, 0.6, 0.5)); hy.rotation.z = -Math.PI / 2; hy.position.set(1.35, 0, -0.3); g.add(hy); // Huygens heat shield
    for (const a of [0.6, 2.6, 4.3]) cyl(g, 0.2, 1.1, M.dark(), 'z', Math.cos(a) * 0.95, Math.sin(a) * 0.95, -2.2, 8); // RTGs
    boom(g, 11, new THREE.Vector3(-1, 0.15, 0), new THREE.Vector3(-0.8, 0, 1.6));
    return g;
  },
  // Rosetta: 2.8 x 2.1 x 2 m box, two 14 m five-panel wings (32 m span), 2.2 m dish, Philae lander on one face
  'Rosetta'() {
    const g = new THREE.Group();
    box(g, 2.8, 2.0, 2.1, M.gold());
    for (const s of [-1, 1]) wing(g, 5, 2.6, 2.25, s, 1.45, 0, 0, 0.1);
    dish(g, 2.2, 0.35, M.white(), 0, 1.4, 0.9, new THREE.Vector3(0, 0.3, 1));
    box(g, 1.0, 0.8, 0.8, M.silver(), 0, -1.4, 0);
    return g;
  },
  // Dawn: 1.6 m bus, two long wings (19.7 m span), three xenon ion engines, 1.5 m dish
  'Dawn'() {
    const g = new THREE.Group();
    box(g, 1.64, 1.27, 1.77, M.gold());
    for (const s of [-1, 1]) wing(g, 5, 1.6, 2.27, s, 0.85, 0, 0, 0.05);
    dish(g, 1.52, 0.22, M.white(), 0, 0, 1.0, new THREE.Vector3(0, 0, 1));
    for (const x of [-0.45, 0, 0.45]) cyl(g, 0.17, 0.25, M.dark(), 'z', x, 0, -1.0, 16);
    return g;
  },
  // MESSENGER: bus behind a 2.5 x 2 m ceramic-cloth sunshade, two 1.5 x 1.65 m wings, 3.6 m magnetometer boom
  'MESSENGER'() {
    const g = new THREE.Group();
    box(g, 1.4, 1.27, 1.85, M.gold());
    box(g, 2.5, 2.05, 0.1, std(0xeeeae0, 0.05, 0.85), 0, 0, -1.15);
    for (const s of [-1, 1]) wing(g, 1, 1.5, 1.65, s, 0.75, 0, 0);
    boom(g, 3.6, new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -0.65, 0.4));
    return g;
  },
  // OSIRIS-REx: 2.4 m box, two wings (6.2 m span), 2 m dish, TAGSAM sampling arm and the return capsule
  'OSIRIS-REx'() {
    const g = new THREE.Group();
    box(g, 2.4, 2.4, 3.15, M.white());
    for (const s of [-1, 1]) wing(g, 1, 1.8, 1.6, s, 1.25, 0.6, 0);
    dish(g, 2.0, 0.3, M.white(), 0, 0, 1.8, new THREE.Vector3(0, 0, 1));
    boom(g, 3.35, new THREE.Vector3(0.2, -1, -0.4), new THREE.Vector3(0.3, -1.2, -0.6), 0.04);
    cyl(g, 0.4, 0.5, std(0x9a6a40, 0.3, 0.6), 'y', -0.6, 1.4, -0.6, 20);
    return g;
  },
  // Hayabusa2: 1 x 1.6 x 1.25 m box, two wings (6 m span), flat high-gain antenna, sampler horn underneath
  'Hayabusa2'() {
    const g = new THREE.Group();
    box(g, 1.6, 1.25, 1.0, M.gold());
    for (const s of [-1, 1]) wing(g, 3, 0.75, 1.0, s, 0.85, 0, 0, 0.05);
    box(g, 0.9, 0.05, 0.9, M.white(), 0, 0.68, 0.1);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.0, 12), M.silver()); horn.position.set(0, -1.1, 0); g.add(horn);
    return g;
  },
  // DART: 1.2 m box, two Roll-Out Solar Arrays (8.5 m each, 19 m span), DRACO camera, LICIACube riding along
  'DART'() {
    const g = new THREE.Group();
    box(g, 1.2, 1.3, 1.3, M.gold());
    for (const s of [-1, 1]) { const arr = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.03, 2.4), [M.frame(), M.frame(), solarMat(), M.dark(), M.frame(), M.frame()]); arr.position.x = s * 4.9; g.add(arr);
      cyl(g, 0.12, 2.4, M.frame(), 'z', s * 9.15, 0, 0, 10); }
    cyl(g, 0.21, 0.6, M.dark(), 'z', 0, 0, 0.95, 16);
    box(g, 0.1, 0.2, 0.3, solarMat(), 0.4, 0.75, -0.4);
    return g;
  },
  // Ulysses: 3.2 x 3.3 x 2.1 m box, 1.65 m dish on top, one RTG on a short arm, 5.6 m radial boom
  'Ulysses'() {
    const g = new THREE.Group();
    box(g, 3.2, 2.1, 3.3, M.white());
    dish(g, 1.65, 0.25, M.white(), 0, 0, 1.75, new THREE.Vector3(0, 0, 1));
    cyl(g, 0.22, 1.2, M.dark(), 'x', 2.4, 0, 0, 8);
    boom(g, 5.6, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-1.6, 0, 0));
    return g;
  },
  // ---- Korean satellites, modelled here from published dimensions and photos (no official open 3D models exist) ----
  // KOMPSAT-3 / 3A (Arirang 3, 3A): hexagonal bus 2.0 m across and 3.5 m tall; three solar panels fixed at the top like a tripod skirt;
  // the AEISS telescope looks down from the base inside a white baffle; 3A adds the IR scanner beside it; X-band antenna on a gimbal
  'KOMPSAT'() {
    const g = new THREE.Group();
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.3, 6), M.gold()); bus.position.y = 0.2; g.add(bus);
    const ed = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(1.002, 1.002, 2.302, 6)), new THREE.LineBasicMaterial({ color: 0x5a4418 })); ed.position.y = 0.2; g.add(ed);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.06, 6), M.white()); top.position.y = 1.38; g.add(top);
    for (let k = 0; k < 6; k++) radiator(g, 0.9, 1.1, Math.cos(k * Math.PI / 3 + Math.PI / 6) * 0.87, 0.5, Math.sin(k * Math.PI / 3 + Math.PI / 6) * 0.87, -k * Math.PI / 3 - Math.PI / 6 + Math.PI / 2).scale.set(k % 2 ? 1 : 0.001, 1, 1);
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.52, w = new THREE.Group(); // three panels splayed out and down from the top deck
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 2.6), [M.frame(), M.frame(), solarMat(), M.dark(), M.frame(), M.frame()]); p.position.set(1.65, 1.0, 0); p.rotation.z = -0.42; w.add(p);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), M.frame()); arm.rotation.z = Math.PI / 2 - 0.42; arm.position.set(1.05, 1.25, 0); w.add(arm);
      w.rotation.y = a; g.add(w); }
    telescope(g, 0.42, 1.0, 0, -1.4, 0); adapterRing(g, 0.6, -0.95);
    const ir = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.45), M.silver()); ir.position.set(0.55, -1.1, 0.3); g.add(ir);
    const gim = new THREE.Group(); gim.position.set(-0.5, -1.05, 0.55); gim.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8), M.frame())); g.add(gim);
    dish(g, 0.32, 0.06, M.white(), -0.5, -1.25, 0.55, new THREE.Vector3(0.2, -1, 0.2));
    starTracker(g, 0.55, 1.42, 0.3, new THREE.Vector3(0.4, 1, 0.3)); starTracker(g, -0.5, 1.42, -0.35, new THREE.Vector3(-0.4, 1, -0.2));
    sunSensor(g, 0, 1.43, 0.7); patchAnt(g, 0.2, 1.43, -0.6); patchAnt(g, -0.6, -0.92, -0.4);
    thrusterSet(g, [[0.7, -0.92, 0.3], [-0.7, -0.92, -0.3], [0.2, -0.92, -0.75], [-0.2, -0.92, 0.75]]);
    return g;
  },
  // KOMPSAT-5 (Arirang 5): X-band SAR - a 4.5 x 0.65 m antenna panel along the Earth face, box bus, two 2-panel wings
  'KOMPSAT-5'() {
    const g = new THREE.Group();
    foilBox(g, 1.6, 2.0, 1.6); radiator(g, 1.2, 1.4, 0, 0.1, 0.81); radiator(g, 1.2, 1.4, 0, 0.1, -0.81);
    const sar = box(g, 4.5, 0.12, 0.66, std(0xd6dade, 0.5, 0.35), 0, -1.12, 0);
    for (let i = 0; i < 12; i++) box(g, 0.33, 0.02, 0.58, std(0x9aa4b0, 0.7, 0.3), -2.06 + i * 0.375, -1.19, 0); // radiating tiles
    for (const s of [-1, 1]) panelWing(g, 2, 1.0, 1.4, s, 0.85, 0.45, 0);
    starTracker(g, 0.5, 1.05, 0.4, new THREE.Vector3(0.3, 1, 0.4)); dish(g, 0.3, 0.05, M.white(), -0.5, -0.9, 0.7, new THREE.Vector3(0, -1, 0.4));
    adapterRing(g, 0.55, 1.02); patchAnt(g, 0.4, -1.0, 0.75);
    return g;
  },
  // GEO-KOMPSAT-2A / 2B (Cheollian 2A/2B): GK2 bus 2.4 x 3.4 x 2.6 m; one long 4-panel wing on the south face and a solar sail on a boom on the north face
  // to balance sunlight pressure; Earth deck: 2A the AMI imager (with sunshade) and space-weather sensors, 2B GOCI-II and GEMS
  'GEO-KOMPSAT'(variant = 'A') {
    const g = new THREE.Group();
    foilBox(g, 2.4, 3.4, 2.6); radiator(g, 1.9, 2.6, 0, 0.1, 1.31); radiator(g, 1.9, 2.6, 0, 0.1, -1.31, Math.PI);
    box(g, 2.45, 0.06, 2.65, M.white(), 0, 1.73, 0);
    panelWing(g, 4, 2.2, 2.6, 1, 1.25, 0.3, 0, 'x', 0.1);
    boom(g, 3.2, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(-1.2, 0.3, 0), 0.04);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), std(0xd9d2b8, 0.6, 0.4, { side: THREE.DoubleSide })); sail.position.set(-5.3, 0.3, 0); sail.rotation.y = Math.PI / 2; g.add(sail);
    if (variant === 'A') { const ami = foilBox(g, 1.2, 0.9, 1.3, 0.2, -2.15, 0.2, M.silver()); telescope(g, 0.32, 0.5, 0.2, -2.7, 0.55, new THREE.Vector3(0, -1, 0.15));
      box(g, 1.4, 0.04, 0.9, std(0x222222, 0.2, 0.9), 0.2, -2.6, -0.45); for (const x of [-0.8, -0.55]) box(g, 0.2, 0.25, 0.2, M.dark(), x, -1.85, -0.9); }
    else { foilBox(g, 0.9, 0.8, 0.9, 0.45, -2.1, 0.3, M.silver()); telescope(g, 0.25, 0.45, 0.45, -2.6, 0.3); foilBox(g, 0.6, 0.6, 0.7, -0.55, -2.0, -0.3, M.silver()); telescope(g, 0.15, 0.35, -0.55, -2.45, -0.3); }
    dish(g, 1.0, 0.15, M.white(), -1.0, -1.85, -0.7, new THREE.Vector3(0, -1, 0)); dish(g, 0.6, 0.1, M.white(), 0.9, -1.8, -0.9, new THREE.Vector3(0.2, -1, 0));
    starTracker(g, 0.7, 1.78, 0.6, new THREE.Vector3(0, 1, 0.3)); starTracker(g, -0.7, 1.78, 0.6, new THREE.Vector3(0, 1, 0.3));
    thrusterSet(g, [[1.1, -1.7, 1.2], [-1.1, -1.7, 1.2], [1.1, 1.7, -1.2], [-1.1, 1.7, -1.2]]); cyl(g, 0.22, 0.45, M.dark(), 'y', 0, 1.95, 0, 16); // apogee engine
    return g;
  },
  'GEO-KOMPSAT-B'() { return BUILDERS['GEO-KOMPSAT']('B'); },
  // Koreasat (Mugunghwa) 5A/6/7/116: Spacebus/large GEO bus ~2.2 x 2 x 4 m; two 4-panel wings (about 35 m tip to tip);
  // two 2.4 m deployable reflectors on the east and west faces with their feed arrays; north/south radiators; small dishes on the Earth deck
  'Koreasat'() {
    const g = new THREE.Group();
    foilBox(g, 2.2, 4.0, 2.0); radiator(g, 1.8, 3.2, 0, 0, 1.01); radiator(g, 1.8, 3.2, 0, 0, -1.01, Math.PI);
    for (const s of [-1, 1]) panelWing(g, 4, 3.6, 2.4, s, 1.15, 0.6, 0, 'x', 0.12);
    for (const s of [-1, 1]) { dish(g, 2.4, 0.42, M.white(), s * 0.3, -1.4, s * 2.15, new THREE.Vector3(0, -0.8, s * 0.6)); // big reflectors, hinged out from the east/west faces
      for (let i = 0; i < 4; i++) cyl(g, 0.05, 0.3, M.silver(), 'y', s * 0.3 + (i - 1.5) * 0.12, -1.8, s * 1.05, 10); } // feed horns
    box(g, 1.6, 0.08, 1.5, M.white(), 0, -2.05, 0);
    dish(g, 1.0, 0.16, M.white(), 0.45, -2.3, 0.2, new THREE.Vector3(0, -1, 0)); dish(g, 0.7, 0.12, M.white(), -0.5, -2.25, -0.2, new THREE.Vector3(0.15, -1, 0));
    cyl(g, 0.28, 0.5, M.dark(), 'y', 0, 2.25, 0, 16); thrusterSet(g, [[1.0, 1.95, 0.9], [-1.0, 1.95, 0.9], [1.0, 1.95, -0.9], [-1.0, 1.95, -0.9]], 1);
    starTracker(g, 0.8, -2.08, 0.6, new THREE.Vector3(0.2, -1, 0.5));
    return g;
  },
  // CAS500-1 (next-generation medium satellite): 1.6 m class box bus, two 2-panel wings, AEISS-C telescope pointing down
  'CAS500'() {
    const g = new THREE.Group();
    foilBox(g, 1.6, 2.0, 1.6); radiator(g, 1.2, 1.4, 0.81, 0.1, 0, Math.PI / 2);
    for (const s of [-1, 1]) panelWing(g, 2, 1.3, 1.4, s, 0.85, 0.5, 0);
    telescope(g, 0.4, 1.0, 0, -1.5, 0); adapterRing(g, 0.5, 1.02);
    starTracker(g, 0.45, 1.05, 0.45, new THREE.Vector3(0.3, 1, 0.3)); dish(g, 0.3, 0.05, M.white(), -0.55, -1.1, 0.55, new THREE.Vector3(0, -1, 0.3));
    thrusterSet(g, [[0.7, 1.02, 0.7], [-0.7, 1.02, -0.7]], 1); patchAnt(g, -0.5, 1.02, 0.5);
    return g;
  },
  // STSAT / NEXTSAT / KITSAT microsatellites: about 0.6-1 m box with body-mounted cells and one small wing
  'Microsat'() {
    const g = new THREE.Group();
    box(g, 0.8, 0.9, 0.8, solarMat());
    wing(g, 1, 0.7, 0.6, 1, 0.42, 0.2, 0);
    boom(g, 0.8, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.45, 0), 0.01);
    return g;
  },
  // university cubesats: a 2U-3U frame of cells
  'CubeSat'() {
    const g = new THREE.Group();
    box(g, 0.1, 0.3, 0.1, solarMat()); for (const s of [-1, 1]) box(g, 0.002, 0.3, 0.1, solarMat(), s * 0.08, 0, 0);
    boom(g, 0.4, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.15, 0), 0.003);
    return g;
  },
  // Solar Orbiter: 2.5 x 3.1 x 2.7 m bus behind a 3.1 x 2.4 m titanium heat shield, two 3-panel wings (18 m span), 4.4 m mag boom
  'Solar Orbiter'() {
    const g = new THREE.Group();
    box(g, 2.5, 2.7, 3.1, M.silver());
    const shield = box(g, 3.1, 2.4, 0.25, std(0x1a1a1a, 0.2, 0.8), 0, 0, -1.8); // faces the Sun (anti-Earth side here)
    box(g, 3.2, 2.5, 0.05, M.white(), 0, 0, -1.65);
    for (const s of [-1, 1]) wing(g, 3, 2.1, 1.2, s, 1.6, 0, -0.3);
    dish(g, 1.1, 0.18, M.white(), 0.6, 1.5, 0.6, new THREE.Vector3(0.3, 0.4, 1));
    boom(g, 4.4, new THREE.Vector3(0, -0.2, 1), new THREE.Vector3(0, -1.2, 1.5));
    thrusters(g, 2.4, 2.6, 3.0);
    return g;
  },
  // BepiColombo cruise stack: transfer module (MTM) with two 14 m wings, Mercury Planetary Orbiter with radiator and 1 long wing, sunshield cone on top
  'BepiColombo'() {
    const g = new THREE.Group();
    box(g, 3.6, 1.8, 3.6, M.silver(), 0, -1.6, 0);                 // MTM
    for (const s of [-1, 1]) wing(g, 5, 2.6, 2.0, s, 1.9, -1.6, 0, 0.1);
    box(g, 2.4, 2.2, 3.9, M.white(), 0, 0.4, 0);                   // MPO with radiator face
    box(g, 0.05, 2.0, 3.6, std(0xdfe4ea, 1, 0.12), 1.23, 0.4, 0);  // radiator
    wing(g, 3, 2.5, 1.6, -1, 1.25, 0.6, 0, 0.08);
    dish(g, 1.0, 0.16, M.white(), 0.6, 1.6, 1.4);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 1.6, 24, 1, true), std(0xd9d9d9, 0.6, 0.5)); cone.position.y = 2.3; cone.material.side = THREE.DoubleSide; g.add(cone); // MOSIF sunshield
    const mmo = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.9, 8), M.dark()); mmo.position.y = 2.4; g.add(mmo); // Mio, octagonal
    return g;
  },
  // Juice: 4.1 x 2.85 x 4.35 m bus, 10 panels in two cross-shaped wings (85 m², ~27 m span), 2.5 m HGA, 10.6 m mag boom, RIME radar
  'Juice'() {
    const g = new THREE.Group();
    box(g, 2.85, 4.1, 4.35, M.gold());
    for (const s of [-1, 1]) {
      const w = wing(g, 5, 2.4, 3.5, s, 1.55, 0, 0, 0.08);
      // two side panels at the third station make the cross shape
      for (const dz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.035, 2.0), solarMat()); p.position.set(s * (2 * 2.48 + 1.2), 0, dz * 2.8); w.add(p); w.position.x = s * 1.55; }
    }
    dish(g, 2.5, 0.35, M.white(), 0, 1.0, 2.25);
    boom(g, 10.6, new THREE.Vector3(-0.6, 0.15, -1), new THREE.Vector3(-1.2, 1.5, -2));
    boom(g, 16, new THREE.Vector3(0, 0, 1), new THREE.Vector3(1.0, -2.0, -8), 0.03); // RIME dipole
    thrusters(g, 2.7, 4.0, 4.2);
    return g;
  },
  // Europa Clipper: 3 m tall propulsion module, 3 m HGA, two 5-panel wings (30.5 m span), 8.5 m mag boom, REASON HF/VHF radar antennas
  'Europa Clipper'() {
    const g = new THREE.Group();
    cyl(g, 0.8, 3.0, M.silver(), 'z', 0, 0, 0, 20);                    // propulsion module
    box(g, 1.6, 1.6, 1.2, M.gold(), 0, 0, 1.6);                        // electronics vault
    dish(g, 3.0, 0.42, M.white(), 0, 0, 2.3);
    for (const s of [-1, 1]) {
      const w = wing(g, 5, 2.05, 4.1, s, 1.1, 0, 0, 0.1);
      w.rotation.x = 0.0;
    }
    boom(g, 8.5, new THREE.Vector3(0, 1, -0.3), new THREE.Vector3(0, 0.8, -1.2));
    for (const s of [-1, 1]) for (const dz of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.04, 0.06), M.frame()); r.position.set(s * 6.3, 0.06, dz * 2.1); g.add(r); } // REASON HF dipoles along the wing edges
    thrusters(g, 1.4, 1.4, 3.0);
    return g;
  },
  // Lucy: compact bus with two 7.3 m UltraFlex circular arrays, 2 m HGA, instrument pointing platform
  'Lucy'() {
    const g = new THREE.Group();
    box(g, 1.8, 2.2, 1.6, M.gold());
    dish(g, 2.0, 0.28, M.white(), 0, 0.3, 0.95);
    for (const s of [-1, 1]) {
      const fan = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(3.65, 10), solarMat()); disc.material.side = THREE.DoubleSide;
      disc.material.map = cellTex.clone(); disc.material.map.repeat.set(5, 5); disc.material.map.needsUpdate = true; disc.rotation.x = -Math.PI / 2; fan.add(disc);
      for (let k = 0; k < 10; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.04, 0.04), M.frame()); const a = k * Math.PI / 5; rib.position.set(Math.cos(a) * 1.82, 0.02, Math.sin(a) * 1.82); rib.rotation.y = -a; fan.add(rib); }
      fan.position.set(s * 4.9, 0, 0); g.add(fan);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), M.frame()); arm.rotation.z = Math.PI / 2; arm.position.x = s * 1.6; g.add(arm);
    }
    box(g, 0.9, 0.6, 0.9, M.silver(), 0, -1.4, 0.3);                     // instrument platform
    cyl(g, 0.12, 0.5, M.dark(), 'z', 0.25, -1.4, 0.85); cyl(g, 0.08, 0.4, M.dark(), 'z', -0.25, -1.4, 0.8);
    return g;
  },
  // Psyche: 2.4 x 2.4 x 3.1 m bus, two cross-shaped 5-panel arrays (24.8 m span), HGA, Hall-effect thrusters
  'Psyche'() {
    const g = new THREE.Group();
    box(g, 2.4, 3.1, 2.4, M.silver());
    box(g, 2.45, 1.2, 2.45, M.gold(), 0, 1.0, 0);
    dish(g, 2.0, 0.28, M.white(), 0, 0.2, 1.25);
    for (const s of [-1, 1]) {
      const w = wing(g, 3, 2.3, 2.3, s, 1.4, 0, 0, 0.08);
      for (const dz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.035, 2.3), solarMat()); p.position.set(s * (1 * 2.38 + 1.15), 0, dz * 2.4); w.add(p); }
    }
    for (const sx of [-0.5, 0.5]) { const t = cyl(g, 0.2, 0.2, M.dark(), 'y', sx, -1.65, 0, 20); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 20), std(0x6f7cff, 0.2, 0.4, { emissive: 0x3a46ff, emissiveIntensity: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.set(sx, -1.76, 0); g.add(ring); }
    boom(g, 2.2, new THREE.Vector3(0, 1, 0.2), new THREE.Vector3(0.8, 1.6, 0));
    return g;
  },
  // Danuri (KPLO): 1.82 x 2.14 x 2.29 m bus; one solar array of two panels on a yoke; steerable high-gain dish; Moon-facing deck with
  // LUTI (twin tubes), PolCam, NASA's ShadowCam (the big black-baffled box) and KGRS; KMAG magnetometer on a 1.2 m boom
  'Danuri'() {
    const g = new THREE.Group();
    foilBox(g, 1.82, 2.14, 2.29); radiator(g, 1.5, 1.6, 0.92, 0, 0, Math.PI / 2); radiator(g, 1.5, 1.6, -0.92, 0, 0, -Math.PI / 2);
    panelWing(g, 2, 1.45, 1.7, 1, 0.98, 0.35, 0, 'x', 0.06);
    dish(g, 1.2, 0.2, M.white(), -0.45, 1.45, 0.75, new THREE.Vector3(-0.2, 0.6, 1)); cyl(g, 0.04, 0.45, M.frame(), 'y', -0.45, 1.2, 0.75, 8);
    const sc = foilBox(g, 0.55, 0.45, 0.7, 0.35, -1.3, 0.45, std(0x1c1c1e, 0.3, 0.7)); telescope(g, 0.2, 0.55, 0.35, -1.75, 0.45);  // ShadowCam
    telescope(g, 0.11, 0.5, -0.35, -1.38, 0.55); telescope(g, 0.11, 0.5, -0.12, -1.38, 0.55);                                      // LUTI
    box(g, 0.25, 0.2, 0.25, M.dark(), -0.45, -1.18, -0.5);                                                                        // PolCam
    cyl(g, 0.18, 0.3, M.silver(), 'y', 0.45, -1.22, -0.55, 16);                                                                   // KGRS
    boom(g, 1.2, new THREE.Vector3(0.2, 0.3, -1), new THREE.Vector3(0.6, 0.6, -1.15), 0.02);                                     // KMAG
    starTracker(g, 0.6, 1.1, -0.9, new THREE.Vector3(0.3, 1, -0.6)); starTracker(g, -0.6, 1.1, -0.9, new THREE.Vector3(-0.3, 1, -0.6));
    thrusterSet(g, [[0.8, 0.95, 1.05], [-0.8, 0.95, 1.05], [0.8, -0.95, 1.05], [-0.8, -0.95, 1.05]]); cyl(g, 0.15, 0.3, M.dark(), 'z', 0, 0, -1.3, 14);
    return g;
  },
  // Tiangong: T-shaped station (Tianhe core with Wentian and Mengtian labs), large solar wings on the labs, ~55 m across
  'Tiangong'() {
    const g = new THREE.Group();
    cyl(g, 2.1, 16.6, M.white(), 'z', 0, 0, 0, 20);                    // Tianhe core
    cyl(g, 2.1, 17.9, M.white(), 'x', 9.5, 0, -8, 20); cyl(g, 2.1, 17.9, M.white(), 'x', -9.5, 0, -8, 20); // Wentian, Mengtian
    cyl(g, 1.5, 3, M.gold(), 'z', 0, 0, -9, 16);                        // node
    for (const s of [-1, 1]) { const w = wing(g, 4, 6.5, 3.2, s, 18.5, 0, -8, 0.15); w.rotation.x = Math.PI / 2; }
    for (const s of [-1, 1]) wing(g, 2, 4.5, 2.5, s, 2.3, 0, 6, 0.1);   // core's own smaller wings
    return g;
  },
  // generic lander for sites without a public model: deck, four legs with pads, antenna mast
  'lander'() {
    const g = new THREE.Group();
    cyl(g, 0.9, 0.5, M.gold(), 'y', 0, 1.0, 0, 8);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.785, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), M.frame());
      leg.position.set(Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9); leg.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(leg);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12), M.frame()); pad.position.set(Math.cos(a) * 1.25, 0.03, Math.sin(a) * 1.25); g.add(pad);
    }
    cyl(g, 0.03, 1.0, M.frame(), 'y', 0.3, 1.75, 0); dish(g, 0.6, 0.1, M.white(), 0.3, 2.25, 0, new THREE.Vector3(0.3, 1, 0.2));
    return g;
  },
};
export function buildCraft(name) { const b = BUILDERS[name]; return b ? b() : null; }

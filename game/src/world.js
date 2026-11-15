// EMBERLINE — Foundry Yard: scene, colliders, line-of-sight, bomb sites.
import * as THREE from 'three';
import { PALETTE, MATERIALS, skyTex, cloudTex, letterTex, hazardTex } from './palette.js';

const SITES = { A: { x: -16, z: -11 }, B: { x: 16, z: 11 } };
const CRATES = [[-14, -6], [-10, -12], [-6, 4], [0, -6], [4, 8], [8, -4], [12, 2], [-18, 2], [18, -6], [2, -12], [-2, 12], [14, -10], [-14, 6]];
const WP_DEFS = [[1, -20, 13], [2, -10, 8], [3, -4, 5], [4, 0, 0], [5, 4, -5], [6, -16, -13], [7, -13, -12], [8, -16, -11], [9, -11, -9], [10, 13, 12], [11, 16, 11], [12, 11, 9], [13, 20, -13], [14, 8, -8], [15, -12, -13], [16, -8, -3]];
const WP_EDGES = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 14], [14, 13], [5, 16], [16, 6], [6, 7], [7, 8], [7, 9], [9, 8], [2, 10], [10, 11], [10, 12], [12, 11], [3, 10], [13, 15], [15, 6], [4, 12], [16, 9]];

let COL = [];

function addBox(scene, mat, cx, cy, cz, sx, sy, sz, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(cx, cy, cz);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  if (collide) COL.push({ min: { x: cx - sx / 2, y: cy - sy / 2, z: cz - sz / 2 }, max: { x: cx + sx / 2, y: cy + sy / 2, z: cz + sz / 2 } });
  return m;
}

function addCyl(scene, mat, cx, cy, cz, r, h, collide = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
  m.position.set(cx, cy, cz);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  if (collide) COL.push({ min: { x: cx - r, y: cy - h / 2, z: cz - r }, max: { x: cx + r, y: cy + h / 2, z: cz + r } });
  return m;
}

export function buildWorld(scene) {
  COL = [];
  // v3: dusk sky dome (gradient) instead of a flat background colour —
  // the sky is ~40% of every screenshot and was a solid void. The dome
  // and everything in it ignore fog so the gradient stays readable.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(110, 24, 12),
    new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false }));
  scene.add(dome);
  // Low dusk sun in the south-east (light comes from the same quadrant)
  // + a faint halo; visible in the buy shot and the menu orbit.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc46b, fog: false, transparent: true, opacity: 0.95 }));
  sunDisc.position.set(78, 14, 45);
  sunDisc.lookAt(0, 2, 0);
  scene.add(sunDisc);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(9, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8c2e, fog: false, transparent: true, opacity: 0.22 }));
  halo.position.set(78.5, 14, 45.5);
  halo.lookAt(0, 2, 0);
  scene.add(halo);
  // Drifting cloud billboards, high over the yard.
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex(), transparent: true, opacity: 0.55, fog: false, depthWrite: false });
  for (const [x, y, z, w] of [[-40, 26, -50, 22], [30, 30, -60, 28], [55, 24, 10, 18], [-55, 28, 30, 24], [0, 32, -70, 30]]) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.5), cloudMat);
    cl.position.set(x, y, z);
    cl.lookAt(0, 4, 0);
    scene.add(cl);
  }
  scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.7);
  sun.position.set(18, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8a97b8, 0x3a2f28, 0.55));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(46, 34), MATERIALS.ground());
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Perimeter walls, h 4.5 (inner faces at x/z = +/-23, +/-17).
  const wall = MATERIALS.concreteDark();
  addBox(scene, wall, 0, 2.25, -17.3, 47.2, 4.5, 0.6);
  addBox(scene, wall, 0, 2.25, 17.3, 47.2, 4.5, 0.6);
  addBox(scene, wall, -23.3, 2.25, 0, 0.6, 4.5, 34);
  addBox(scene, wall, 23.3, 2.25, 0, 0.6, 4.5, 34);

  const crate = MATERIALS.crate();
  for (const [x, z] of CRATES) addBox(scene, crate, x, 1, z, 2, 2, 2);
  // Containers 6 x 2.4 x 2.6.
  addBox(scene, MATERIALS.container(PALETTE.containerA), -4, 1.2, -13, 6, 2.4, 2.6);
  addBox(scene, MATERIALS.container(PALETTE.containerB), 6, 1.2, 13, 6, 2.4, 2.6);
  // Pillars 1 x 4.5 x 1 + gantry beam between them.
  const steel = MATERIALS.steelDark();
  addBox(scene, steel, -3, 2.25, 0, 1, 4.5, 1);
  addBox(scene, steel, 3, 2.25, 0, 1, 4.5, 1);
  addBox(scene, steel, 0, 4.4, 0, 7, 0.3, 0.6, false);
  addBox(scene, MATERIALS.glow(PALETTE.sodium), 0, 4.2, 0, 6, 0.12, 0.2, false);
  // Furnace block at site A (centre -19,-14; 4 x 3 x 4) + glowing mouth.
  addBox(scene, MATERIALS.furnace(), -19, 1.5, -14, 4, 3, 4);
  addBox(scene, MATERIALS.glow(PALETTE.ember), -16.9, 1.2, -14, 0.15, 1.6, 2.4, false);
  // Crane base at site B (centre 19,14; 3 x 5 x 3) + jib.
  addBox(scene, steel, 19, 2.5, 14, 3, 5, 3);
  addBox(scene, steel, 19, 5.2, 12.2, 3, 0.6, 4.2, false);

  // v3 props: barrel clusters against the walls (clear of every waypoint
  // lane), sandbag rows on the site approaches, pipes along the north
  // wall, floodlight poles, and a stacked container for verticality.
  const rust = MATERIALS.barrel(PALETTE.rust);
  const barrelDark = MATERIALS.barrel(PALETTE.steelDark);
  for (const [x, z] of [[-21.5, 0], [-20.6, 1.2], [21.5, -2], [20.6, -3.1], [10, 15.5]]) {
    addCyl(scene, (x + z) % 2 === 0 ? rust : barrelDark, x, 0.55, z, 0.45, 1.1);
  }
  addCyl(scene, rust, -21.5, 1.65, 0, 0.45, 1.1);
  addCyl(scene, barrelDark, 21.5, 1.65, -2, 0.45, 1.1);
  const sand = MATERIALS.sandbag();
  for (const [x, z, ry] of [[-13.5, -6.5, 0.5], [13.5, 6.5, -0.5], [-2, 14.8, 0]]) {
    addBox(scene, sand, x, 0.25, z, 2.4, 0.5, 0.8, true);
    addBox(scene, sand, x + 0.4, 0.75, z + 0.1, 1.8, 0.5, 0.7, true);
  }
  // Pipes: one long run along the north wall + two down-pipes (high up,
  // no collision — they sit above head height against the wall).
  const pipe = MATERIALS.pipe();
  const pipeRun = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 40, 10), pipe);
  pipeRun.rotation.z = Math.PI / 2;
  pipeRun.position.set(0, 3.5, -16.8);
  scene.add(pipeRun);
  for (const px of [-10, 10]) {
    const dp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 10), pipe);
    dp.position.set(px, 1.9, -16.8);
    scene.add(dp);
  }
  // Floodlight poles (glow heads, no extra lights — the 3 point lights
  // already cover the yard).
  for (const [x, z] of [[-8, 16], [8, -16]]) {
    addCyl(scene, steel, x, 3, z, 0.12, 6);
    addBox(scene, MATERIALS.glow(PALETTE.sodium), x, 6.1, z, 0.5, 0.2, 0.3, false);
  }
  // Stacked container on the B container + a third container against
  // the south wall near the ATK spawn for cover (clear of the wp1->wp2
  // rush lane, which runs z 8..13).
  addBox(scene, MATERIALS.container(PALETTE.containerA), 6, 3.6, 13, 6, 2.4, 2.6);
  addBox(scene, MATERIALS.container(PALETTE.containerB), -13, 1.2, 15, 6, 2.4, 2.6);
  // Site letter boards: big "A" over the furnace, "B" over the crane.
  const boardA = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ map: letterTex('A', '#ff8c2e'), transparent: true, side: THREE.DoubleSide }));
  boardA.position.set(-19, 4.6, -14);
  scene.add(boardA);
  const boardB = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ map: letterTex('B', '#35c4d8'), transparent: true, side: THREE.DoubleSide }));
  boardB.position.set(19, 6.8, 14);
  boardB.rotation.y = Math.PI;
  scene.add(boardB);
  // Wall trim: sodium glow strips along the top inner edge of each wall
  // + vent boxes on the north wall (all above head height, no collision).
  const trim = MATERIALS.glow(PALETTE.sodium);
  addBox(scene, trim, 0, 4.2, -17.0, 47.2, 0.12, 0.12, false);
  addBox(scene, trim, 0, 4.2, 17.0, 47.2, 0.12, 0.12, false);
  addBox(scene, trim, -23.0, 4.2, 0, 0.12, 0.12, 34, false);
  addBox(scene, trim, 23.0, 4.2, 0, 0.12, 0.12, 34, false);
  addBox(scene, MATERIALS.steelDark(), -10, 3, -16.9, 2, 1, 0.3, false);
  addBox(scene, MATERIALS.steelDark(), 10, 3, -16.9, 2, 1, 0.3, false);

  // Site floor decals: tinted pad + ring.
  for (const k of ['A', 'B']) {
    const s = SITES[k], hex = k === 'A' ? PALETTE.siteA : PALETTE.siteB;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), MATERIALS.site(hex));
    pad.rotation.x = -Math.PI / 2; pad.position.set(s.x, 0.02, s.z);
    scene.add(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.05, 40), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
  }

  // v3: hazard-stripe decals at both site entries + a worn centre ring
  // marking mid — floor paint that reads in the fight/plant shots.
  for (const [x, z] of [[-16, -7.2], [16, 7.2]]) {
    const hz = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2),
      new THREE.MeshBasicMaterial({ map: hazardTex(), transparent: true, opacity: 0.85 }));
    hz.rotation.x = -Math.PI / 2; hz.position.set(x, 0.02, z);
    scene.add(hz);
  }
  const midRing = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.sodium, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  midRing.rotation.x = -Math.PI / 2; midRing.position.set(0, 0.02, 0);
  scene.add(midRing);

  // Warm sodium / ember point lights (mounted on furnace, crane, gantry).
  const lamp = (x, y, z, hex) => {
    const p = new THREE.PointLight(hex, 30, 20, 1.8);
    p.position.set(x, y, z); scene.add(p);
  };
  lamp(-17, 3.6, -14, PALETTE.ember);
  lamp(19, 5.6, 14, PALETTE.sodium);
  lamp(0, 4.0, 0, PALETTE.sodium);

  const adj = new Map(WP_DEFS.map(([id]) => [id, []]));
  for (const [a, b] of WP_EDGES) { adj.get(a).push(b); adj.get(b).push(a); }
  const waypoints = WP_DEFS.map(([id, x, z]) => ({ id, x, z, edges: adj.get(id) }));
  const spawns = {
    // v3: 5v5 — five ATK spawns (player + 4 bots) and five DEF spawns.
    atk: [[-20, 13], [-18, 14], [-21, 11], [-19, 12], [-19, 11]].map(([x, z]) => ({ x, z, yaw: -Math.PI / 4 })),
    // v2: defenders spawn beside the site they hold (resetRound assigns
    // def[0]=Havoc/holdA, def[1]=Bramble/holdA2, def[2]=Onyx/holdB,
    // def[3]=Fable/rotate — same split as the state.js fallback). Yaws
    // face each bot's site/mid so the buy-phase freeze starts on-angle.
    // Previously all four spawned on the B side and had to march across
    // the yard during the buy phase to reach A.
    // v3: def[4]=Vex/holdMid spawns at mid (2,-4), facing the crossroads.
    def: [
      { x: -11, z: -9, yaw: 1.19 },
      { x: -12, z: -13, yaw: 2.03 },
      { x: 11, z: 9, yaw: -1.95 },
      { x: 16, z: 11, yaw: 0.97 },
      { x: 2, z: -4, yaw: 0.46 },
    ],
  };
  return { colliders: COL, sites: { A: { ...SITES.A }, B: { ...SITES.B } }, spawns, waypoints, bounds: { x: 23, z: 17 } };
}

// Push pos (feet {x,y,z}) out of any overlapping AABB, smallest axis first.
export function collideCircle(pos, r) {
  for (let i = 0; i < COL.length; i++) {
    const mn = COL[i].min, mx = COL[i].max;
    if (pos.y + 1.7 < mn.y || pos.y > mx.y) continue;
    if (pos.x <= mn.x - r || pos.x >= mx.x + r || pos.z <= mn.z - r || pos.z >= mx.z + r) continue;
    const dxl = pos.x - (mn.x - r), dxr = (mx.x + r) - pos.x;
    const dzl = pos.z - (mn.z - r), dzr = (mx.z + r) - pos.z;
    const m = Math.min(dxl, dxr, dzl, dzr);
    if (m === dxl) pos.x = mn.x - r;
    else if (m === dxr) pos.x = mx.x + r;
    else if (m === dzl) pos.z = mn.z - r;
    else pos.z = mx.z + r;
  }
}

// True when segment a->b hits any collider AABB (slab test, no allocation).
export function segmentBlocked(a, b) {
  for (let i = 0; i < COL.length; i++) {
    const mn = COL[i].min, mx = COL[i].max;
    let tmin = 0, tmax = 1;
    for (let k = 0; k < 3; k++) {
      const av = k === 0 ? a.x : k === 1 ? a.y : a.z;
      const bv = k === 0 ? b.x : k === 1 ? b.y : b.z;
      const lo = k === 0 ? mn.x : k === 1 ? mn.y : mn.z;
      const hi = k === 0 ? mx.x : k === 1 ? mx.y : mx.z;
      const d = bv - av;
      if (Math.abs(d) < 1e-9) { if (av < lo || av > hi) { tmin = 2; break; } continue; }
      let ta = (lo - av) / d, tb = (hi - av) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > tmin) tmin = ta;
      if (tb < tmax) tmax = tb;
      if (tmin > tmax) break;
    }
    if (tmin <= tmax && tmax >= 0 && tmin <= 1) return true;
  }
  return false;
}

// True when pos is inside the 6x6 zone of site 'A' or 'B'.
export function insideSite(pos, site) {
  const s = SITES[site];
  if (!s) return false;
  return pos.x >= s.x - 3 && pos.x <= s.x + 3 && pos.z >= s.z - 3 && pos.z <= s.z + 3;
}

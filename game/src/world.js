// EMBERLINE — Foundry Yard: scene, colliders, line-of-sight, bomb sites.
import * as THREE from 'three';
import { PALETTE, MATERIALS } from './palette.js';

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

export function buildWorld(scene) {
  COL = [];
  scene.background = new THREE.Color(PALETTE.sky);
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
    atk: [[-20, 13], [-18, 14], [-21, 11], [-19, 12]].map(([x, z]) => ({ x, z, yaw: -Math.PI / 4 })),
    // v2: defenders spawn beside the site they hold (resetRound assigns
    // def[0]=Havoc/holdA, def[1]=Bramble/holdA2, def[2]=Onyx/holdB,
    // def[3]=Fable/rotate — same split as the state.js fallback). Yaws
    // face each bot's site/mid so the buy-phase freeze starts on-angle.
    // Previously all four spawned on the B side and had to march across
    // the yard during the buy phase to reach A.
    def: [
      { x: -11, z: -9, yaw: 1.19 },
      { x: -12, z: -13, yaw: 2.03 },
      { x: 11, z: 9, yaw: -1.95 },
      { x: 16, z: 11, yaw: 0.97 },
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

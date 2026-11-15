// EMBERLINE — bot AI (Track B): routes, holds, combat, hearing, bomb duty.
// No rendering here. No per-frame allocation in the hot loops: the target
// scratch object is module-level, and paths are (re)built only when a bot's
// destination changes. Rifle numbers mirror the weapon.js contract.
import { applyDamage } from './economy.js';
import { plantBomb, defuseBomb } from './bomb.js';

const SPEED = 3.8;
const FIRE_INTERVAL = 0.11; // rifle fire interval
const HEAR_DIST = 25;
const SEE_DIST = 40;
const FOV_COS = 0.8192; // cos(35 deg) — ~70 deg total field of view
const RIFLE_DMG = 33;

const ROUTES = {
  rushA1: [1, 2, 3, 4, 5, 16, 6, 7, 8],
  rushA2: [1, 2, 3, 4, 5, 14, 13, 15, 6, 7, 8],
  rushB: [1, 2, 10, 11],
};
const HOLD_WP = { holdA: 9, holdA2: 15, holdB: 12 };
const SITE_WP = { A: 8, B: 11 };
const SITE_POS = { A: { x: -16, z: -11 }, B: { x: 16, z: 11 } };

// Fallback waypoint graph (contract coords/edges); world.waypoints wins.
const WAYPOINTS = [
  { id: 1, x: -20, z: 13, edges: [2] },
  { id: 2, x: -10, z: 8, edges: [1, 3, 10] },
  { id: 3, x: -4, z: 5, edges: [2, 4, 10] },
  { id: 4, x: 0, z: 0, edges: [3, 5, 12] },
  { id: 5, x: 4, z: -5, edges: [4, 14, 16] },
  { id: 6, x: -16, z: -13, edges: [16, 7, 15] },
  { id: 7, x: -13, z: -12, edges: [6, 8, 9] },
  { id: 8, x: -16, z: -11, edges: [7, 9] },
  { id: 9, x: -11, z: -9, edges: [7, 8, 16] },
  { id: 10, x: 13, z: 12, edges: [2, 11, 12, 3] },
  { id: 11, x: 16, z: 11, edges: [10, 12] },
  { id: 12, x: 11, z: 9, edges: [10, 11, 4] },
  { id: 13, x: 20, z: -13, edges: [14, 15] },
  { id: 14, x: 8, z: -8, edges: [5, 13] },
  { id: 15, x: -12, z: -13, edges: [13, 6] },
  { id: 16, x: -8, z: -3, edges: [5, 6, 9] },
];

let gWorld = null;
let gMap = null;
let gList = WAYPOINTS;

function graph(world) {
  if (world === gWorld && gMap) return;
  gWorld = world || null;
  gList = (world && world.waypoints) || WAYPOINTS;
  gMap = new Map();
  for (const w of gList) gMap.set(w.id, w);
}

function nearestWp(x, z) {
  let best = gList[0].id, bd = Infinity;
  for (const w of gList) {
    const dx = w.x - x, dz = w.z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = w.id; }
  }
  return best;
}

function bfsPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const prev = new Map();
  prev.set(fromId, 0);
  const q = [fromId];
  while (q.length) {
    const cur = q.shift();
    const node = gMap.get(cur);
    if (!node) continue;
    for (const nb of node.edges) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      if (nb === toId) {
        const path = [toId];
        let c = toId;
        while (c !== fromId) { c = prev.get(c); path.unshift(c); }
        return path;
      }
      q.push(nb);
    }
  }
  return null;
}

function setPath(state, b, destId) {
  if (b.destWp === destId && b.path) {
    if (b.pathIdx < b.path.length) return;
    const w = gMap.get(destId);
    if (w) {
      const dx = w.x - b.pos.x, dz = w.z - b.pos.z;
      if (dx * dx + dz * dz < 0.36) return; // already holding the destination
    }
  }
  const p = bfsPath(nearestWp(b.pos.x, b.pos.z), destId);
  b.path = p || [destId];
  b.pathIdx = 0;
  b.destWp = destId;
}

function faceToward(b, tx, tz) {
  b.yaw = Math.atan2(-(tx - b.pos.x), -(tz - b.pos.z));
}

function moveToward(state, b, tx, tz, dt, world) {
  const dx = tx - b.pos.x, dz = tz - b.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.05) return true;
  const step = Math.min(d, SPEED * dt);
  b.pos.x += (dx / d) * step;
  b.pos.z += (dz / d) * step;
  b.vel.x = (dx / d) * SPEED;
  b.vel.z = (dz / d) * SPEED;
  faceToward(b, tx, tz);
  collideAt(world, b.pos, 0.35);
  return d <= 0.6;
}

function followPath(state, b, dt, world) {
  if (!b.path || b.pathIdx >= b.path.length) return true;
  const wp = gMap.get(b.path[b.pathIdx]);
  if (!wp) { b.pathIdx++; return false; }
  if (moveToward(state, b, wp.x, wp.z, dt, world)) b.pathIdx++;
  return b.pathIdx >= b.path.length;
}

function inSite(world, pos, site) {
  if (world && world.insideSite) return world.insideSite(pos, site);
  const s = SITE_POS[site];
  const dx = pos.x - s.x, dz = pos.z - s.z;
  return dx * dx + dz * dz < 12.25;
}

// world.collideCircle / segmentBlocked may be attached by main.js (world.js
// exports them as functions); if not, fall back to the raw AABB list.
function collideAt(world, pos, r) {
  if (world && typeof world.collideCircle === 'function') {
    const out = world.collideCircle(pos, r);
    if (out && typeof out.x === 'number') { pos.x = out.x; pos.z = out.z; }
    return;
  }
  const col = world && world.colliders;
  if (!col) return;
  for (let i = 0; i < col.length; i++) {
    const mn = col[i].min, mx = col[i].max;
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

function blockedAt(world, a, b) {
  if (world && typeof world.segmentBlocked === 'function') return world.segmentBlocked(a, b);
  const col = world && world.colliders;
  if (!col) return false;
  for (let i = 0; i < col.length; i++) {
    const mn = col[i].min, mx = col[i].max;
    let tmin = 0, tmax = 1, bad = false;
    for (let k = 0; k < 3; k++) {
      const av = k === 0 ? a.x : k === 1 ? a.y : a.z;
      const bv = k === 0 ? b.x : k === 1 ? b.y : b.z;
      const lo = k === 0 ? mn.x : k === 1 ? mn.y : mn.z;
      const hi = k === 0 ? mx.x : k === 1 ? mx.y : mx.z;
      const d = bv - av;
      if (Math.abs(d) < 1e-9) { if (av < lo || av > hi) { bad = true; break; } continue; }
      let ta = (lo - av) / d, tb = (hi - av) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > tmin) tmin = ta;
      if (tb < tmax) tmax = tb;
      if (tmin > tmax) break;
    }
    if (!bad && tmin <= tmax && tmax >= 0 && tmin <= 1) return true;
  }
  return false;
}

function scanYaw(state, b) {
  b.vel.x = 0; b.vel.z = 0;
  b.yaw = b.baseYaw + Math.sin(state.time * 0.7 + b.scanPhase) * 0.8;
}

// --- combat: _tgt is reused, never allocated per frame ---
const _tgt = { ent: null, dist: 0, speed: 0 };

function consider(state, b, world, ent, fx, fz) {
  if (!ent.alive) return;
  const dx = ent.pos.x - b.pos.x, dz = ent.pos.z - b.pos.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > SEE_DIST || d >= _tgt.dist) return;
  if (d > 0.001) {
    const dot = (dx / d) * fx + (dz / d) * fz;
    if (dot < FOV_COS) return;
  }
  if (blockedAt(world, b.pos, ent.pos)) return;
  _tgt.ent = ent;
  _tgt.dist = d;
  _tgt.speed = Math.sqrt(ent.vel.x * ent.vel.x + ent.vel.z * ent.vel.z);
}

function acquire(state, b, world) {
  _tgt.ent = null; _tgt.dist = Infinity; _tgt.speed = 0;
  const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
  for (const e of state.bots) {
    if (e.team !== b.team) consider(state, b, world, e, fx, fz);
  }
  if (b.team === 'def') consider(state, b, world, state.player, fx, fz);
  return _tgt.ent ? _tgt : null;
}

function fireShot(state, b, tgt, world, api) {
  if (b.mag <= 0) {
    const take = Math.min(30, b.reserve);
    b.reserve -= take; b.mag = take;
    b.burstLeft = 0; b.burstT = 1.0;
    return;
  }
  b.mag--;
  const rng = state.rng;
  // Display labels ('You' / bot names) match weapon.js events for the HUD
  // killfeed. ttl keeps shot chatter short-lived for hearing + pruning.
  state.events.push({ type: 'shot', x: b.pos.x, z: b.pos.z, by: b.name, t: state.time, ttl: 0.5 });
  if (api.playSound) api.playSound('shot', b.pos.x, b.pos.z);
  if (api.spawnEffect) api.spawnEffect('tracer', b.pos, tgt.ent.pos);
  // Aim error: 2.5 deg base + range term + target-speed term.
  const errDeg = 2.5 + (tgt.dist / SEE_DIST) * 2 + tgt.speed * 0.35;
  b.aimErr = errDeg;
  const errRad = (errDeg * Math.PI) / 180;
  const off = ((rng() + rng() + rng() - 1.5) / 1.5) * errRad;
  if (Math.abs(off) > Math.atan2(0.4, tgt.dist) + 0.01) return; // miss
  const head = rng() < 0.12;
  const ent = tgt.ent;
  let died = false;
  if (api.fireHitscan) died = !!api.fireHitscan(b, ent, { damage: RIFLE_DMG, head, dist: tgt.dist });
  else died = applyDamage(state, ent, RIFLE_DMG * (tgt.dist > 30 ? 0.7 : 1), head);
  if (died) {
    if (ent === state.player) state.player.deaths++;
    state.events.push({ type: 'kill', by: b.name, victim: ent === state.player ? 'You' : ent.name, t: state.time });
  }
}

function combat(state, b, tgt, dt, world, api) {
  const ent = tgt.ent;
  const id = ent === state.player ? 'player' : ent.id;
  if (b.targetId !== id) {
    b.targetId = id;
    b.reactT = 0.3 + state.rng() * 0.25;
    b.burstLeft = 0; b.burstT = 0;
  }
  faceToward(b, ent.pos.x, ent.pos.z);
  if (b.reactT > 0) return;
  if (tgt.dist > 20) { moveToward(state, b, ent.pos.x, ent.pos.z, dt, world); return; }
  b.vel.x = 0; b.vel.z = 0;
  if (b.burstLeft > 0) {
    b.burstT -= dt;
    if (b.burstT <= 0) {
      fireShot(state, b, tgt, world, api);
      b.burstLeft--;
      b.burstT = b.burstLeft > 0 ? FIRE_INTERVAL : 0.6 + state.rng() * 0.6;
    }
  } else {
    b.burstT -= dt;
    if (b.burstT <= 0) { b.burstLeft = 3 + ((state.rng() * 3) | 0); b.burstT = 0; }
  }
}

// --- hearing: enemy shots within 25 m pull a bot off its route ---
// Shots are labelled by display name in weapon.js ('You' / bot names) and by
// id in bots.js — accept both when working out whose shot was heard.
function shooterTeam(state, by) {
  if (by === 'player' || by === 'You') return 'atk';
  for (const b of state.bots) if (b.id === by || b.name === by) return b.team;
  return null;
}

function hearShots(state, b) {
  for (const e of state.events) {
    if (e.type !== 'shot' || e.by === b.id || b.heardEv === e) continue;
    if (shooterTeam(state, e.by) === b.team) { b.heardEv = e; continue; }
    const dx = e.x - b.pos.x, dz = e.z - b.pos.z;
    if (dx * dx + dz * dz > HEAR_DIST * HEAR_DIST) continue;
    b.heardEv = e;
    if (!b.hearPos) b.hearPos = { x: 0, z: 0 };
    b.hearPos.x = e.x; b.hearPos.z = e.z;
    if (b.state !== 'investigate') { b.state = 'investigate'; b.path = null; b.destWp = -1; }
    break;
  }
}

// --- bomb duty ---
function reassignCarrier(state) {
  const bomb = state.bomb;
  if (bomb.state !== 'carried') return;
  let alive = false;
  if (bomb.carrier === 'player') alive = state.player.alive;
  else for (const b of state.bots) if (b.id === bomb.carrier) { alive = b.alive; break; }
  if (alive) {
    for (const b of state.bots) b.hasBomb = b.id === bomb.carrier;
    return;
  }
  let best = null, bd = Infinity;
  for (const b of state.bots) {
    if (b.team !== 'atk' || !b.alive) continue;
    const dx = b.pos.x - bomb.pos.x, dz = b.pos.z - bomb.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = b; }
  }
  bomb.plantT = 0; // a broken plant channel never resumes
  if (best) bomb.carrier = best.id;
  else if (state.player.alive) bomb.carrier = 'player';
  state.events.push({ type: 'bomb', action: 'pickup', by: bomb.carrier, t: state.time });
  for (const b of state.bots) b.hasBomb = b.id === bomb.carrier;
}

function carrierMove(state, b, dt, world, api) {
  const site = b.role === 'rushB' ? 'B' : 'A';
  if (inSite(world, b.pos, site)) {
    b.state = 'plant';
    b.vel.x = 0; b.vel.z = 0;
    state.bomb.site = site;
    state.bomb.plantT += dt;
    if (state.bomb.plantT >= 3) {
      plantBomb(state, site, b.id, api);
      b.state = 'defend'; b.path = null; b.destWp = -1;
    }
    return;
  }
  b.state = 'move';
  setPath(state, b, SITE_WP[site]);
  followPath(state, b, dt, world);
}

function defendSite(state, b, dt, world) {
  const wp = SITE_WP[state.bomb.site || 'A'];
  setPath(state, b, wp);
  if (followPath(state, b, dt, world)) scanYaw(state, b);
}

function nearestAttacker(state, b, world) {
  let best = null, bd = 12;
  const p = state.player;
  if (p.alive) {
    const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bd && !blockedAt(world, b.pos, p.pos)) { best = p; bd = d; }
  }
  for (const e of state.bots) {
    if (e.team !== 'atk' || !e.alive) continue;
    const dx = e.pos.x - b.pos.x, dz = e.pos.z - b.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bd && !blockedAt(world, b.pos, e.pos)) { best = e; bd = d; }
  }
  return best;
}

function convergeSite(state, b, dt, world, api) {
  const site = state.bomb.site || 'A';
  if (!inSite(world, b.pos, site)) {
    b.state = 'move';
    setPath(state, b, SITE_WP[site]);
    followPath(state, b, dt, world);
    return;
  }
  b.vel.x = 0; b.vel.z = 0;
  const near = nearestAttacker(state, b, world);
  if (near) { faceToward(b, near.pos.x, near.pos.z); b.state = 'guard'; return; }
  b.state = 'defuse';
  state.bomb.defuser = b.id;
  state.bomb.defuseT += dt;
  if (state.bomb.defuseT >= 5) defuseBomb(state, b.id, api);
}

// --- role movement ---
function holdPos(state, b, dt, world) {
  const wp = HOLD_WP[b.role] || b.wp;
  setPath(state, b, wp);
  if (followPath(state, b, dt, world)) scanYaw(state, b);
}

function rotatePos(state, b, dt, world) {
  const dest = b.destWp === 5 ? 5 : 14;
  setPath(state, b, dest);
  if (followPath(state, b, dt, world)) {
    scanYaw(state, b);
    b.holdT -= dt;
    if (b.holdT <= 0) { b.destWp = dest === 14 ? 5 : 14; b.holdT = 6; b.path = null; }
  }
}

function rushMove(state, b, dt, world) {
  if (!b.path) {
    const route = ROUTES[b.role] || ROUTES.rushA1;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < route.length; i++) {
      const w = gMap.get(route[i]);
      if (!w) continue;
      const dx = w.x - b.pos.x, dz = w.z - b.pos.z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; bi = i; }
    }
    b.path = route.slice(); b.pathIdx = bi;
    b.destWp = route[route.length - 1];
  }
  if (followPath(state, b, dt, world)) scanYaw(state, b);
}

function roleMove(state, b, dt, world) {
  if (b.role === 'holdA' || b.role === 'holdA2' || b.role === 'holdB') { holdPos(state, b, dt, world); return; }
  if (b.role === 'rotate') { rotatePos(state, b, dt, world); return; }
  rushMove(state, b, dt, world);
}

function investigate(state, b, dt, world) {
  setPath(state, b, nearestWp(b.hearPos.x, b.hearPos.z));
  if (followPath(state, b, dt, world)) {
    b.hearPos = null;
    b.state = 'move';
    b.path = null; b.destWp = -1;
  }
}

function updateBot(state, b, dt, world, api) {
  if (state.phase === 'buy') { roleMove(state, b, dt, world); return; }
  hearShots(state, b);
  const tgt = acquire(state, b, world);
  if (tgt) { combat(state, b, tgt, dt, world, api); return; }
  b.targetId = null;
  if (b.hasBomb && state.bomb.state === 'carried') { carrierMove(state, b, dt, world, api); return; }
  if (state.bomb.state === 'planted') {
    if (b.team === 'atk') defendSite(state, b, dt, world);
    else convergeSite(state, b, dt, world, api);
    return;
  }
  if (b.state === 'investigate' && b.hearPos) { investigate(state, b, dt, world); return; }
  roleMove(state, b, dt, world);
}

function pushApart(pa, pb) {
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= 0.49 || d2 < 0.000001) return;
  const d = Math.sqrt(d2), push = (0.7 - d) / 2;
  const nx = dx / d, nz = dz / d;
  pa.x -= nx * push; pa.z -= nz * push;
  pb.x += nx * push; pb.z += nz * push;
}

function separate(state) {
  const bs = state.bots;
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < bs.length; j++) {
      const c = bs[j];
      if (c.alive) pushApart(a.pos, c.pos);
    }
    if (state.player.alive) pushApart(a.pos, state.player.pos);
  }
}

export function updateBots(state, dt, world, api) {
  if (state.phase !== 'play' && state.phase !== 'buy') return;
  graph(world);
  reassignCarrier(state);
  const a = api || {};
  for (const b of state.bots) {
    if (!b.alive) continue;
    if (b.reactT > 0) b.reactT -= dt;
    updateBot(state, b, dt, world, a);
  }
  separate(state);
}

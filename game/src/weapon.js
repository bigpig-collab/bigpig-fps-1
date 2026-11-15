// EMBERLINE — weapons: hitscan vs capsule, spread, recoil, reload, switching.
import { segmentBlocked } from './world.js';

export const WEAPONS = {
  rifle: { name: 'VK-7 Kestrel', price: 2700, damage: 33, headMul: 4, mag: 30, reserveMax: 90, fireInterval: 0.11, auto: true, reloadTime: 2.4, spreadBase: 0.011, spreadMove: 0.03, recoilPitch: 0.011, recoilYaw: 0.004 },
  pistol: { name: 'P9 Sidearm', price: 500, damage: 26, headMul: 4, mag: 12, reserveMax: 36, fireInterval: 0.16, auto: false, reloadTime: 1.6, spreadBase: 0.014, spreadMove: 0.03, recoilPitch: 0.009, recoilYaw: 0.003 },
  // v3: VK-9 Scattergun — 6 pellets of 11 damage, semi-auto, 6/24. Close
  // range only: pellets fall to half damage past 12 m, so it never
  // outclasses the rifle at range. Player-only (bots keep the rifle).
  scattergun: { name: 'VK-9 Scattergun', price: 1800, damage: 11, pellets: 6, headMul: 2, mag: 6, reserveMax: 24, fireInterval: 0.9, auto: false, reloadTime: 2.8, spreadBase: 0.05, spreadMove: 0.02, recoilPitch: 0.03, recoilYaw: 0.008 },
};

// Ray vs head sphere. Returns t > 0 or -1.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const ex = ox - cx, ey = oy - cy, ez = oz - cz;
  const b = ex * dx + ey * dy + ez * dz;
  const c = ex * ex + ey * ey + ez * ez - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

// Ray vs body cylinder: vertical segment py+0.3..py+1.35, radius 0.35.
function rayBody(ox, oy, oz, dx, dy, dz, px, py, pz) {
  const ex = ox - px, ez = oz - pz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Math.hypot(ex, ez) < 0.35 ? 0 : -1;
  const b = ex * dx + ez * dz;
  const c = ex * ex + ez * ez - 0.1225;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / a;
  if (t > 0) { const y = oy + dy * t; if (y >= py + 0.3 && y <= py + 1.35) return t; }
  t = (-b + sq) / a;
  if (t > 0) { const y = oy + dy * t; if (y >= py + 0.3 && y <= py + 1.35) return t; }
  return -1;
}

export function tryFire(state, shooter, world, fx) {
  if (!shooter || !shooter.alive || shooter.reloading || shooter.mag <= 0) return false;
  if ((shooter.fireT || 0) > 0) return false;
  const w = WEAPONS[shooter.weapon];
  if (!w) return false;
  shooter.fireT = w.fireInterval;
  shooter.mag--;
  const rnd = state.rng || Math.random;
  const ox = shooter.pos.x, oy = shooter.pos.y + (shooter.eyeH || 1.5), oz = shooter.pos.z;
  const spd = shooter.speed !== undefined ? shooter.speed : Math.hypot(shooter.vel ? shooter.vel.x : 0, shooter.vel ? shooter.vel.z : 0);
  const spread = w.spreadBase + w.spreadMove * Math.min(1, spd / 4.3) + (shooter.onGround === false ? 0.02 : 0) + (shooter.bloom || 0);
  shooter.spread = spread;
  shooter.bloom = Math.min(0.03, (shooter.bloom || 0) + 0.004);
  shooter.pitch = Math.max(-1.45, Math.min(1.45, shooter.pitch + w.recoilPitch));
  shooter.yaw += (rnd() - 0.5) * 2 * w.recoilYaw;
  const cp = Math.cos(shooter.pitch);
  // Central ray (one 'shot' event + one tracer/muzzle per trigger pull).
  const ray = (spreadMul) => {
    let rx = -Math.sin(shooter.yaw) * cp + (rnd() - 0.5) * 2 * spread * spreadMul;
    let ry = Math.sin(shooter.pitch) + (rnd() - 0.5) * 2 * spread * spreadMul;
    let rz = -Math.cos(shooter.yaw) * cp + (rnd() - 0.5) * 2 * spread * spreadMul;
    const rl = Math.hypot(rx, ry, rz) || 1;
    return [rx / rl, ry / rl, rz / rl];
  };
  let [dx, dy, dz] = ray(1);
  const label = (c) => (c === state.player ? 'You' : (c.name || c.id));
  state.events.push({ type: 'shot', by: label(shooter), weapon: shooter.weapon, x: ox, y: oy, z: oz, dx, dy, dz });
  if (fx && fx.onShot) fx.onShot(shooter, dx, dy, dz);
  // Pellet loop: one ray per pellet (the central ray is pellet 0).
  // Each pellet raycasts independently and can hit, headshot or kill.
  const pellets = w.pellets || 1;
  for (let pi = 0; pi < pellets; pi++) {
    if (pi > 0) [dx, dy, dz] = ray(1);
    let best = null, bestT = Infinity, bestHead = false;
    const consider = (c) => {
      if (!c || !c.alive || c.team === shooter.team) return;
      const th = raySphere(ox, oy, oz, dx, dy, dz, c.pos.x, c.pos.y + 1.5, c.pos.z, 0.22);
      if (th > 0 && th < bestT) { best = c; bestT = th; bestHead = true; }
      const tb = rayBody(ox, oy, oz, dx, dy, dz, c.pos.x, c.pos.y, c.pos.z);
      if (tb > 0 && tb < bestT) { best = c; bestT = tb; bestHead = false; }
    };
    consider(state.player);
    for (let i = 0; i < state.bots.length; i++) consider(state.bots[i]);
    if (!best) continue;
    const hx = ox + dx * bestT, hy = oy + dy * bestT, hz = oz + dz * bestT;
    if (segmentBlocked({ x: ox, y: oy, z: oz }, { x: hx, y: hy, z: hz })) continue;
    let dmg = w.damage * (bestHead ? w.headMul : 1);
    if (bestT > 30) dmg *= 0.7;
    else if (pellets > 1 && bestT > 12) dmg *= 0.5; // scattergun falloff
    best.hp -= dmg;
    state.events.push({ type: 'hit', by: label(shooter), target: label(best), head: bestHead, dmg: Math.round(dmg), hp: Math.max(0, Math.round(best.hp)) });
    if (fx && fx.onHit) fx.onHit(best, bestHead);
    if (best.hp <= 0) {
      best.hp = 0; best.alive = false; best.deaths = (best.deaths || 0) + 1;
      shooter.kills = (shooter.kills || 0) + 1;
      state.events.push({ type: 'kill', by: label(shooter), victim: label(best), head: bestHead, weapon: shooter.weapon });
      if (fx && fx.onKill) fx.onKill(shooter, best);
    }
  }
  return true;
}

export function startReload(who) {
  const w = WEAPONS[who.weapon];
  if (!w || who.reloading || who.mag >= w.mag || who.reserve <= 0) return false;
  who.reloading = true;
  who.reloadT = w.reloadTime;
  return true;
}

function ensureAmmo(who) {
  const w = WEAPONS[who.weapon] || WEAPONS.rifle;
  if (who.mag === undefined) { who.mag = w.mag; who.reserve = w.reserveMax; }
}

function doSwitch(who, name) {
  const w = WEAPONS[name];
  if (!w) { who.switchTo = null; return; }
  if (name === who.weapon) { who.switchTo = null; return; }
  who._ammo = who._ammo || {};
  who._ammo[who.weapon] = { mag: who.mag, reserve: who.reserve };
  const a = who._ammo[name] || { mag: w.mag, reserve: w.reserveMax };
  who.weapon = name; who.mag = a.mag; who.reserve = a.reserve;
  who.reloading = false; who.reloadT = 0; who.fireT = 0.3; who.switchTo = null;
}

function stepWeapon(who, dt) {
  if (!who || !who.alive) return;
  ensureAmmo(who);
  who.fireT = Math.max(0, (who.fireT || 0) - dt);
  who.bloom = Math.max(0, (who.bloom || 0) - dt * 0.03);
  if (who.switchTo) { doSwitch(who, who.switchTo); return; }
  if (who.reloading) {
    who.reloadT -= dt;
    if (who.reloadT <= 0) {
      const w = WEAPONS[who.weapon];
      const take = Math.min(w.mag - who.mag, who.reserve);
      who.mag += take; who.reserve -= take; who.reloading = false;
    }
  } else if (who.mag <= 0 && who.reserve > 0) startReload(who);
}

export function updateWeapon(state, dt) {
  stepWeapon(state.player, dt);
  for (let i = 0; i < state.bots.length; i++) stepWeapon(state.bots[i], dt);
}

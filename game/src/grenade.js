// EMBERLINE — grenade.js
// Fragmentation grenade: throw, gravity, wall/ground bounce, timed fuse,
// radial damage with line-of-sight falloff. Visuals live in effects.js
// (it reads state.grenades); this module owns only simulation + damage.
const GRAVITY = 12;
const RESTITUTION = 0.4;
const FUSE = 1.6;
const THROW_SPEED = 17;
const THROW_UP = 3.5;
const RADIUS = 7;
const DMG_CENTER = 120;
const DMG_EDGE = 20;
const GREN_RADIUS = 0.15;

function dist3(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function hurt(target, amount) {
  if (!target || !target.alive) return false;
  target.hp -= amount;
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    return true;
  }
  return false;
}

export function throwGrenade(state, fromPos, dirVec, world) {
  if (!state || !state.player || state.player.grenades <= 0) return null;
  if (!fromPos || !dirVec) return null;
  const g = spawnGrenade(state, fromPos, dirVec, world, 'player', state.player);
  if (g) state.player.grenades -= 1;
  return g;
}

// v2: bots throw frags too (ATK rushers, one per round). Same physics as
// the player's throw; the grenade carries its thrower so explosion kills
// credit the right fighter in the killfeed / scoreboard.
export function throwBotGrenade(state, bot, targetPos, world) {
  if (!state || !bot || !bot.alive || (bot.grenades || 0) <= 0) return null;
  if (!targetPos) return null;
  const from = { x: bot.pos.x, y: bot.pos.y + 1.4, z: bot.pos.z };
  // Lob at the target: flat direction + a fixed up-arc (matches the
  // player's THROW_UP arc; the fuse covers the flight time).
  const dx = targetPos.x - from.x, dz = targetPos.z - from.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const dir = { x: dx / d, y: 0.25, z: dz / d };
  const g = spawnGrenade(state, from, dir, world, bot.id, bot);
  if (g) bot.grenades -= 1;
  return g;
}

// Shared flight object: pos/vel/fuse + thrower identity for kill credit.
function spawnGrenade(state, fromPos, dirVec, world, byId, byEnt) {
  if (!fromPos || !dirVec) return null;
  const len = Math.sqrt(dirVec.x * dirVec.x + dirVec.y * dirVec.y + dirVec.z * dirVec.z) || 1;
  const g = {
    pos: { x: fromPos.x, y: fromPos.y, z: fromPos.z },
    vel: {
      x: (dirVec.x / len) * THROW_SPEED,
      y: (dirVec.y / len) * THROW_SPEED + THROW_UP,
      z: (dirVec.z / len) * THROW_SPEED,
    },
    fuse: FUSE,
    by: byId, byEnt: byEnt || null,
  };
  if (!state.grenades) state.grenades = [];
  state.grenades.push(g);
  return g;
}

function collideWalls(g, world) {
  if (!world || typeof world.collideCircle !== 'function') return;
  try {
    const out = world.collideCircle(g.pos.x, g.pos.z, GREN_RADIUS);
    if (out && typeof out === 'object' && typeof out.x === 'number' && typeof out.z === 'number') {
      const dx = out.x - g.pos.x, dz = out.z - g.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const vn = g.vel.x * nx + g.vel.z * nz;
        if (vn < 0) {
          g.vel.x -= (1 + RESTITUTION) * vn * nx;
          g.vel.z -= (1 + RESTITUTION) * vn * nz;
        }
        g.pos.x = out.x; g.pos.z = out.z;
      }
    } else if (out === true) {
      // Boolean-only collide: reflect horizontal velocity, keep position.
      g.vel.x = -g.vel.x * RESTITUTION;
      g.vel.z = -g.vel.z * RESTITUTION;
    }
  } catch (e) {}
}

function explode(state, g, api, world) {
  const pos = { x: g.pos.x, y: g.pos.y, z: g.pos.z };
  if (state.events) state.events.push({ type: 'explode', pos });
  if (api) {
    try { if (typeof api.spawnEffect === 'function') api.spawnEffect('explosion', pos); } catch (e) {}
    try { if (typeof api.playSound === 'function') api.playSound('explosion'); } catch (e) {}
  }
  const blocked = (a, b) => {
    try {
      if (world && typeof world.segmentBlocked === 'function') return world.segmentBlocked(a, b);
    } catch (e) {}
    return false;
  };
  const label = (t) => (t === state.player ? 'You' : (t.name || t.id));
  const applyTo = (t) => {
    if (!t || !t.alive || !t.pos) return;
    const d = dist3(t.pos, pos);
    if (d > RADIUS) return;
    let dmg = DMG_EDGE + (DMG_CENTER - DMG_EDGE) * (1 - d / RADIUS);
    if (blocked(t.pos, pos)) dmg *= 0.4;
    // v2: grenade kills count — killfeed event + thrower credit + victim
    // death (previously a frag kill was silent and credited to nobody).
    if (hurt(t, dmg)) {
      const byEnt = g.byEnt;
      if (byEnt && byEnt !== t) byEnt.kills = (byEnt.kills || 0) + 1;
      t.deaths = (t.deaths || 0) + 1;
      if (state.events) state.events.push({
        type: 'kill', by: g.by === 'player' ? 'You' : label(byEnt || { name: g.by }),
        victim: label(t), head: false, weapon: 'grenade', t: state.time,
      });
    }
  };
  applyTo(state.player);
  const bots = state.bots || [];
  for (let i = 0; i < bots.length; i++) applyTo(bots[i]);
}

export function updateGrenades(state, dt, world, api) {
  if (!state || !state.grenades || state.grenades.length === 0) return;
  if (!(dt > 0)) return;
  const list = state.grenades;
  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i];
    g.vel.y -= GRAVITY * dt;
    g.pos.x += g.vel.x * dt;
    g.pos.y += g.vel.y * dt;
    g.pos.z += g.vel.z * dt;
    if (g.pos.y < GREN_RADIUS) {
      g.pos.y = GREN_RADIUS;
      if (g.vel.y < 0) {
        if (Math.abs(g.vel.y) < 1.2) { g.vel.y = 0; g.vel.x *= 0.6; g.vel.z *= 0.6; }
        else { g.vel.y = -g.vel.y * RESTITUTION; g.vel.x *= 0.75; g.vel.z *= 0.75; }
      }
    }
    collideWalls(g, world);
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explode(state, g, api, world);
      list.splice(i, 1);
    }
  }
}

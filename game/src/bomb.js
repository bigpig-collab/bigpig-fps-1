// EMBERLINE — bomb plant / timer / defuse (Track B).
// Plant input arrives as state.input.plantHeld (input.js) — `plant` is also
// accepted. stepSim stashes the latest input on state each step;
// api.input.plantHeld / api.isPlantHeld() / api.plantHeld are fallbacks. Site tests prefer world.insideSite and fall
// back to the contract site coords with a 3.5 m radius.
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;
const SITE_POS = { A: { x: -16, z: -11 }, B: { x: 16, z: 11 } };
const SITE_R2 = 12.25;

function siteAtPos(pos, api, world) {
  if (world && world.insideSite) {
    if (world.insideSite(pos, 'A')) return 'A';
    if (world.insideSite(pos, 'B')) return 'B';
    return null;
  }
  if (api && api.world && api.world.insideSite) {
    if (api.world.insideSite(pos, 'A')) return 'A';
    if (api.world.insideSite(pos, 'B')) return 'B';
    return null;
  }
  if (api && api.insideSite) {
    if (api.insideSite(pos, 'A')) return 'A';
    if (api.insideSite(pos, 'B')) return 'B';
    return null;
  }
  for (const s of ['A', 'B']) {
    const sp = SITE_POS[s];
    const dx = pos.x - sp.x, dz = pos.z - sp.z;
    if (dx * dx + dz * dz < SITE_R2) return s;
  }
  return null;
}

function plantHeld(state, api) {
  // Track A input.js exposes plantHeld; accept `plant` too for other callers.
  const held = (o) => o && (o.plant || o.plantHeld);
  if (held(state.input)) return true;
  if (!api) return false;
  if (held(api.input)) return true;
  if (typeof api.isPlantHeld === 'function' && api.isPlantHeld()) return true;
  return !!api.plantHeld;
}

export function plantBomb(state, site, by, api) {
  const bomb = state.bomb;
  bomb.state = 'planted'; bomb.site = site;
  bomb.timer = state.settings.bombTimer;
  bomb.plantT = 0; bomb.defuseT = 0; bomb.beepT = 1; bomb.defuser = null;
  state.events.push({ type: 'bomb', action: 'planted', site, by, t: state.time });
  if (api && api.playSound) api.playSound('plant');
}

export function defuseBomb(state, by, api) {
  const bomb = state.bomb;
  bomb.state = 'defused'; bomb.defuseT = DEFUSE_TIME;
  state.events.push({ type: 'bomb', action: 'defused', site: bomb.site, by, t: state.time });
  if (api && api.playSound) api.playSound('defuse');
}

// Player plant: hold E inside a site for 3 s continuous. Leaving the site
// or releasing E resets the channel. Returns true only on the planting step.
export function tryPlant(state, dt, api, world) {
  const bomb = state.bomb, p = state.player;
  if (bomb.state !== 'carried' || bomb.carrier !== 'player' || !p.alive) { p.planting = 0; return false; }
  const site = siteAtPos(p.pos, api, world);
  if (plantHeld(state, api) && site) {
    p.planting += dt;
    bomb.plantT = p.planting;
    if (p.planting >= PLANT_TIME) { plantBomb(state, site, 'player', api); p.planting = 0; return true; }
    return false;
  }
  p.planting = 0; bomb.plantT = 0;
  return false;
}

// Defuse finaliser: the 5 s channel itself is advanced by bots.js
// (convergeSite). Returns true only on the defusing step.
export function tryDefuse(state, dt, api) {
  const bomb = state.bomb;
  if (bomb.state !== 'planted' || bomb.defuseT < DEFUSE_TIME) return false;
  defuseBomb(state, bomb.defuser || 'def', api);
  return true;
}

export function updateBomb(state, dt, api, world) {
  const bomb = state.bomb;
  const a = api || {};
  if (bomb.state === 'carried') {
    const carrier = bomb.carrier === 'player'
      ? state.player
      : state.bots.find(b => b.id === bomb.carrier);
    if (carrier) { bomb.pos.x = carrier.pos.x; bomb.pos.y = carrier.pos.y; bomb.pos.z = carrier.pos.z; }
  }
  if (state.phase !== 'play') {
    state.player.planting = 0;
    if (bomb.state === 'carried') bomb.plantT = 0;
    return;
  }
  if (bomb.state === 'carried') {
    // Bot plant backstop (bots.js advances plantT and usually finalises).
    if (bomb.plantT >= PLANT_TIME && bomb.carrier !== 'player') {
      plantBomb(state, bomb.site || siteAtPos(bomb.pos, a, world) || 'A', bomb.carrier, a);
    } else {
      tryPlant(state, dt, a, world);
    }
    return;
  }
  if (bomb.state !== 'planted') return;
  bomb.timer -= dt;
  bomb.beepT -= dt;
  if (bomb.beepT <= 0) {
    state.events.push({ type: 'beep', t: state.time });
    if (a.playSound) a.playSound('beep');
    bomb.beepT = 0.25 + (Math.max(0, bomb.timer) / state.settings.bombTimer) * 0.75;
  }
  if (tryDefuse(state, dt, a)) return;
  if (bomb.timer <= 0) {
    bomb.state = 'detonated'; bomb.timer = 0;
    state.events.push({ type: 'bomb', action: 'detonated', site: bomb.site, t: state.time });
    if (a.playSound) a.playSound('explode');
    if (a.spawnEffect) a.spawnEffect('explosion', bomb.pos);
  }
}

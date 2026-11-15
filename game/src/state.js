// EMBERLINE — single state store (Track B). Every system reads/writes here.
// Fixed seed so rounds are reproducible: rng = mulberry32(1337).
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fallback spawns (map coords). resetRound prefers world.spawns when given.
export const SPAWNS = {
  atk: [
    { x: -20, z: 13, yaw: 0 },
    { x: -19, z: 14.5, yaw: 0 },
    { x: -21, z: 11.5, yaw: 0 },
    { x: -18, z: 12, yaw: 0 },
    { x: -19, z: 11, yaw: 0 },
  ],
  def: [
    { x: -11, z: -9, yaw: Math.PI },
    { x: -12, z: -13, yaw: Math.PI },
    { x: 11, z: 9, yaw: Math.PI },
    { x: 16, z: 11, yaw: Math.PI },
    { x: 2, z: -4, yaw: Math.PI },
  ],
};

// v3: 9 bots — 5v5 (the player is the 5th attacker: mid lurk, hold wp 4)
// + 5 defenders. New: Ash (second A2 rusher) and Vex (mid hold, wp 4).
const BOT_DEFS = [
  { id: 'rook', name: 'Rook', team: 'atk', role: 'rushA1', wp: 1 },
  { id: 'sable', name: 'Sable', team: 'atk', role: 'rushA2', wp: 1 },
  { id: 'ivy', name: 'Ivy', team: 'atk', role: 'rushB', wp: 1 },
  { id: 'ash', name: 'Ash', team: 'atk', role: 'rushA2', wp: 1 },
  { id: 'havoc', name: 'Havoc', team: 'def', role: 'holdA', wp: 9 },
  { id: 'bramble', name: 'Bramble', team: 'def', role: 'holdA2', wp: 15 },
  { id: 'onyx', name: 'Onyx', team: 'def', role: 'holdB', wp: 12 },
  { id: 'fable', name: 'Fable', team: 'def', role: 'rotate', wp: 14 },
  { id: 'vex', name: 'Vex', team: 'def', role: 'holdMid', wp: 4 },
];

function makeBot(def, i) {
  return {
    id: def.id, name: def.name, team: def.team,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, hp: 100, alive: true,
    weapon: 'rifle', mag: 30, reserve: 90,
    state: 'move', wp: def.wp, holdT: 6, aimErr: 0,
    burstLeft: 0, burstT: 0, reactT: 0, hearPos: null,
    role: def.role, hasBomb: false,
    // v2: one frag per round for ATK bots (bot grenade throws), match
    // totals for the Tab scoreboard (kills/deaths accumulate all match).
    grenades: 1, kills: 0, deaths: 0,
    // runtime fields owned by bots.js (not in the shared contract)
    path: null, pathIdx: 0, destWp: -1, baseYaw: 0,
    scanPhase: i * 1.3, targetId: null, heardEv: null,
  };
}

export function createState() {
  const state = {
    phase: 'menu', round: 1, targetScore: 5,
    score: { atk: 0, def: 0 },
    money: 800, roundTime: 100, buyTime: 15, phaseTime: 0, time: 0,
    matchWinner: null, input: null,
    player: {
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
      yaw: 0, pitch: 0, hp: 100, alive: true, crouch: false, onGround: true,
      team: 'atk', weapon: 'rifle', mag: 30, reserve: 90,
      reloading: false, reloadT: 0, grenades: 1, armor: 0,
      spread: 0, recoil: 0, kills: 0, deaths: 0, planting: 0, defusing: 0,
    },
    bots: BOT_DEFS.map(makeBot),
    bomb: {
      state: 'carried', site: null, pos: { x: 0, y: 0, z: 0 },
      timer: 35, plantT: 0, defuseT: 0, carrier: 'player',
      beepT: 0, defuser: null,
    },
    events: [], grenades: [],
    settings: { roundTime: 100, buyTime: 15, targetScore: 5, bombTimer: 35 },
    rng: mulberry32(1337),
  };
  resetRound(state);
  state.phase = 'menu';
  return state;
}

// Respawn everyone, reset the bomb to the player, refill timers.
// Keeps money, score, round, kills/deaths. world is optional: uses
// world.spawns when present, otherwise the fallback SPAWNS above.
export function resetRound(state, world) {
  const spawns = (world && world.spawns) || SPAWNS;
  const p = state.player;
  const s0 = spawns.atk[0] || SPAWNS.atk[0];
  p.pos.x = s0.x; p.pos.y = 0; p.pos.z = s0.z;
  p.vel.x = 0; p.vel.y = 0; p.vel.z = 0;
  p.yaw = s0.yaw || 0; p.pitch = 0;
  p.hp = 100; p.alive = true; p.crouch = false; p.onGround = true;
  p.mag = p.weapon === 'rifle' ? 30 : p.weapon === 'scattergun' ? 6 : 12;
  p.reserve = p.weapon === 'rifle' ? 90 : p.weapon === 'scattergun' ? 24 : 36;
  p.reloading = false; p.reloadT = 0;
  // v2: grenades persist across rounds (no free refill) — the $300 buy
  // is a real decision now, like the rifle. startMatch zeroes them for
  // a fresh match; a mid-match resetRound leaves the count alone.
  if (p.grenades === undefined || p.grenades === null) p.grenades = 0;
  p.spread = 0; p.recoil = 0; p.planting = 0; p.defusing = 0;
  let ai = 0, di = 0;
  for (const b of state.bots) {
    const list = b.team === 'atk' ? spawns.atk : spawns.def;
    const idx = b.team === 'atk' ? 1 + ai++ : di++;
    const s = list[idx] || SPAWNS[b.team === 'atk' ? 'atk' : 'def'][0];
    b.pos.x = s.x; b.pos.y = 0; b.pos.z = s.z;
    b.vel.x = 0; b.vel.y = 0; b.vel.z = 0;
    b.yaw = s.yaw || 0; b.pitch = 0;
    b.hp = 100; b.alive = true;
    b.weapon = 'rifle'; b.mag = 30; b.reserve = 90;
    b.state = 'move'; b.holdT = 6; b.aimErr = 0;
    b.burstLeft = 0; b.burstT = 0; b.reactT = 0; b.hearPos = null;
    b.hasBomb = false; b.path = null; b.pathIdx = 0; b.destWp = -1;
    // v2: ATK bots restock one frag per round; kills/deaths are match
    // totals and are NOT reset here (the Tab scoreboard shows the match).
    b.grenades = 1; b.thrownAtSite = false;
    b.baseYaw = s.yaw || 0; b.targetId = null; b.heardEv = null;
    const def = BOT_DEFS.find(d => d.id === b.id);
    b.wp = def ? def.wp : 1;
  }
  const bomb = state.bomb;
  bomb.state = 'carried'; bomb.site = null;
  bomb.pos.x = p.pos.x; bomb.pos.y = 0; bomb.pos.z = p.pos.z;
  bomb.timer = state.settings.bombTimer;
  bomb.plantT = 0; bomb.defuseT = 0; bomb.carrier = 'player';
  bomb.beepT = 0; bomb.defuser = null;
  state.events.length = 0;
  state.grenades.length = 0;
  state.roundTime = state.settings.roundTime;
  state.buyTime = state.settings.buyTime;
  state.phaseTime = 0;
  state.phase = 'buy';
}

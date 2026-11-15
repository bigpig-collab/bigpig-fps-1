// EMBERLINE — fixed-step simulation driver (Track B). No rendering here.
// The caller accumulates real time and calls stepSim once per 1/60 slice;
// dt is accepted but the step is always the fixed STEP below.
import { updateBots } from './bots.js';
import { updateBomb } from './bomb.js';
import { updateRounds } from './rounds.js';

const STEP = 1 / 60;

export function stepSim(state, input, dt, world, api) {
  const a = api || {};
  state.input = input || null; // stashed so bomb.js can read input.plant
  state.time += STEP;
  if (state.phase === 'menu' || state.phase === 'matchEnd') { pruneEvents(state); return; }
  if (a.updatePlayer) a.updatePlayer(state, input, STEP, world, a);
  if (a.updateWeapon) a.updateWeapon(state, input, STEP, world, a);
  updateBots(state, STEP, world, a);
  if (a.updateGrenades) a.updateGrenades(state, STEP, world, a);
  else if (a.throwUpdate) a.throwUpdate(state, STEP, world, a);
  updateBomb(state, STEP, a, world);
  updateRounds(state, STEP, a, world);
  pruneEvents(state);
}

function pruneEvents(state) {
  const ev = state.events;
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    if (e.ttl !== undefined) {
      e.ttl -= STEP;
      if (e.ttl <= 0) ev.splice(i, 1);
    }
  }
  if (ev.length > 96) {
    // Drop transient shot/beep chatter first so kill/round/bomb events survive.
    for (let i = 0; i < ev.length && ev.length > 96; i++) {
      if (ev[i].type === 'shot' || ev[i].type === 'beep') { ev.splice(i, 1); i--; }
    }
    if (ev.length > 96) ev.splice(0, ev.length - 96);
  }
}

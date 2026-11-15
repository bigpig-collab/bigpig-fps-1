// EMBERLINE — round / match flow (Track B).
// buy (15s) -> play (100s) -> roundEnd (4s banner) -> next buy, or matchEnd
// at first to targetScore (5).
import { resetRound } from './state.js';

const ROUND_END_T = 4;

export function updateRounds(state, dt, api, world) {
  const a = api || {};
  if (state.phase === 'menu' || state.phase === 'matchEnd') return;
  payBonuses(state);
  if (state.phase === 'buy') {
    state.phaseTime += dt;
    state.buyTime = Math.max(0, state.settings.buyTime - state.phaseTime);
    if (state.phaseTime >= state.settings.buyTime) {
      state.phase = 'play';
      state.phaseTime = 0;
      state.roundTime = state.settings.roundTime;
      state.events.push({ type: 'phase', phase: 'play', t: state.time });
      if (a.updateBuyMenu) a.updateBuyMenu(state);
    }
    return;
  }
  if (state.phase === 'play') {
    state.roundTime -= dt;
    const win = checkWin(state);
    if (win) endRound(state, win.team, win.reason, a);
    return;
  }
  if (state.phase === 'roundEnd') {
    state.phaseTime += dt;
    if (state.phaseTime >= ROUND_END_T) {
      if (state.score.atk >= state.targetScore || state.score.def >= state.targetScore) {
        state.matchWinner = state.score.atk > state.score.def ? 'atk' : 'def';
        state.phase = 'matchEnd';
        state.events.push({ type: 'match', winner: state.matchWinner, t: state.time });
        if (a.playSound) a.playSound('matchEnd');
      } else {
        state.round++;
        resetRound(state, world);
        if (a.updateBuyMenu) a.updateBuyMenu(state);
      }
    }
  }
}

// Kill (+300) and plant (+300) bonuses, paid once per event (counted flag).
// Only the player's own kills/plants pay into state.money.
function payBonuses(state) {
  for (const e of state.events) {
    if (e.counted) continue;
    // weapon.js labels the player 'You' in its kill events; bots.js uses 'player'.
    if (e.type === 'kill' && (e.by === 'player' || e.by === 'You')) { state.money += 300; e.counted = true; }
    else if (e.by === 'player' && (e.type === 'plant' || (e.type === 'bomb' && e.action === 'planted'))) {
      state.money += 300; e.counted = true;
    }
  }
}

function checkWin(state) {
  const bomb = state.bomb;
  if (bomb.state === 'detonated') return { team: 'atk', reason: 'detonation' };
  if (bomb.state === 'defused') return { team: 'def', reason: 'defuse' };
  let atkAlive = state.player.alive;
  let defAlive = false;
  for (const b of state.bots) {
    if (b.team === 'atk' && b.alive) atkAlive = true;
    if (b.team === 'def' && b.alive) defAlive = true;
  }
  if (!defAlive) return { team: 'atk', reason: 'elimination' };
  // Attackers wiped while the bomb ticks: the round lives on — the bomb
  // timer (or a defuse) decides it, never the clock.
  if (!atkAlive && bomb.state !== 'planted') return { team: 'def', reason: 'elimination' };
  if (state.roundTime <= 0 && bomb.state !== 'planted') return { team: 'def', reason: 'timeout' };
  return null;
}

function endRound(state, team, reason, api) {
  const win = team === 'atk'; // the player is on atk
  state.score[team]++;
  state.money += win ? 3250 : 1900;
  state.phase = 'roundEnd';
  state.phaseTime = 0;
  state.events.push({ type: 'round', result: win ? 'win' : 'loss', reason, round: state.round, t: state.time });
  if (api.playSound) api.playSound(win ? 'roundWin' : 'roundLose');
}

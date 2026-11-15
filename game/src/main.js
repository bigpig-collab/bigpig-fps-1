// EMBERLINE — boot, render loop, fixed-step driver, bot meshes, screenshots.
// Wires every module together: world, state, sim, input, player, weapon,
// hud, effects, viewmodel, audio, grenade, economy. No game logic lives here
// beyond wiring: the sim owns the rules, this file owns the frame.
import * as THREE from 'three';
import { OVERVIEW } from './overview.js';
import { buildWorld, collideCircle, segmentBlocked, insideSite } from './world.js';
import { createState, resetRound } from './state.js';
import { stepSim } from './sim.js';
import { createInput, bindInput } from './input.js';
import { updatePlayer } from './player.js';
import { WEAPONS, tryFire, updateWeapon, startReload } from './weapon.js';
import { buildHUD, updateHUD } from './hud.js';
import { buildEffects } from './effects.js';
import { buildViewModel } from './viewmodel.js';
import {
  initAudio, resume as resumeAudio, playShot, playEnemyShot, playReload,
  playDryFire, playHit, playKill, playExplosion, playPlantBeep, playRoundWin,
  playRoundLoss, playBuy, playStep, playPlantStart, playDefuse,
} from './audio.js';
import { throwGrenade, updateGrenades } from './grenade.js';
import { buyItem } from './economy.js';

const STEP = 1 / 60;
console.info(OVERVIEW);
const canvas = document.getElementById('game-canvas');
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot') || null;

// --- Renderer / scene / camera -------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
world.collideCircle = collideCircle;
world.segmentBlocked = segmentBlocked;
world.insideSite = insideSite;

// --- State, input, HUD, effects, viewmodel -------------------------------
const state = createState();
const input = createInput();
const hud = buildHUD();
const effects = buildEffects(scene);
const viewmodel = buildViewModel(camera);

// --- Bot meshes (one group per bot, reused every frame) -------------------
const botMeshes = new Map();
function makeBotMesh(team) {
  const g = new THREE.Group();
  const coat = team === 'atk' ? 0xc65a1e : 0x4a7ec2;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.36, 1.05, 10),
    new THREE.MeshStandardMaterial({ color: coat, roughness: 0.85 }));
  body.position.y = 0.85; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x2e343c, roughness: 0.6 }));
  head.position.y = 1.55; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.07, 0.05),
    new THREE.MeshBasicMaterial({ color: team === 'atk' ? 0xffb347 : 0x9fd0ff }));
  visor.position.set(0, 1.58, -0.2); g.add(visor);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.12, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5 }));
  gun.position.set(0.25, 1.15, -0.25); g.add(gun);
  return g;
}
for (const b of state.bots) {
  const m = makeBotMesh(b.team);
  scene.add(m);
  botMeshes.set(b.id, m);
}

// --- Bomb mesh (carried on the carrier, planted on the site) -------------
const bombMesh = new THREE.Group();
const bombBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.32, 0.2, 0.22),
  new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.5 }));
bombMesh.add(bombBox);
const bombBlink = new THREE.Mesh(
  new THREE.SphereGeometry(0.05, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xff2e2e }));
bombBlink.position.set(0, 0.14, 0); bombMesh.add(bombBlink);
const bombLight = new THREE.PointLight(0xff2e2e, 0, 6, 1.8);
bombMesh.add(bombLight);
scene.add(bombMesh);

// --- Grenade meshes (v2): thrown frags were simulated but invisible in
// flight — no mesh ever showed them. One small dark sphere per live
// grenade (pool of 8, reused every frame like the bot meshes; v3: 5v5
// means more frags in the air than the old pool of 4 covered — the
// smoke test saw 7 live at once).
const grenadeMeshes = [];
for (let i = 0; i < 8; i++) {
  const gm = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.5 }));
  gm.visible = false; gm.castShadow = true;
  scene.add(gm);
  grenadeMeshes.push(gm);
}

// --- Combat feedback: tracers, muzzle, sparks, sounds --------------------
function eyeOf(who) {
  return { x: who.pos.x, y: who.pos.y + (who.eyeH || 1.5), z: who.pos.z };
}
const fx = {
  onShot(shooter, dx, dy, dz) {
    const o = eyeOf(shooter);
    const end = { x: o.x + dx * 45, y: o.y + dy * 45, z: o.z + dz * 45 };
    effects.spawnTracer(o, end);
    if (shooter === state.player) {
      const fwd = { x: -Math.sin(state.player.yaw), y: Math.sin(state.player.pitch), z: -Math.cos(state.player.yaw) };
      effects.spawnMuzzle({ x: o.x + fwd.x * 0.6, y: o.y + fwd.y * 0.6 - 0.1, z: o.z + fwd.z * 0.6 });
      playShot(shooter.weapon, false);
    }
  },
  onHit(victim, head) {
    effects.spawnSparks(
      { x: victim.pos.x, y: victim.pos.y + 1.2, z: victim.pos.z },
      head ? 24 : 12, head ? 0xff5a3c : 0xffc46b);
    if (victim !== state.player) playHit();
  },
  onKill(shooter, victim) {
    effects.spawnSparks(
      { x: victim.pos.x, y: victim.pos.y + 1.1, z: victim.pos.z }, 24, 0xffb347);
    playKill();
  },
};

function playSound(name) {
  try {
    if (name === 'beep') playPlantBeep(1 - Math.max(0, state.bomb.timer) / 35);
    else if (name === 'plant') playPlantStart();
    else if (name === 'defuse') playDefuse();
    else if (name === 'explode') playExplosion();
    else if (name === 'roundWin') playRoundWin();
    else if (name === 'roundLose') playRoundLoss();
    else if (name === 'matchEnd') (state.matchWinner === 'atk' ? playRoundWin : playRoundLoss)();
    else if (name === 'buy') playBuy();
  } catch (err) { /* audio is best-effort */ }
}

// --- Player firing (auto vs semi) + weapon stepping -----------------------
let prevFire = false;
function firePlayer(s, inp, w) {
  const p = s.player;
  if (s.phase !== 'play' || !p.alive) { prevFire = inp.firing; return; }
  const wp = WEAPONS[p.weapon];
  const want = inp.firing && (wp.auto || !prevFire);
  if (want) {
    if (p.mag <= 0 && p.reserve <= 0) playDryFire();
    tryFire(s, p, w, fx);
  }
  prevFire = inp.firing;
}

const api = {
  updatePlayer: (s, inp, dt, w, a) => {
    if (s.player.alive && (s.phase === 'play' || s.phase === 'buy')) updatePlayer(s, inp, dt, w);
  },
  // sim passes (state, input, STEP, world, api); the real stepper wants (state, dt).
  updateWeapon: (s, inp, dt, w, a) => { firePlayer(s, inp, w); updateWeapon(s, dt); },
  updateGrenades: (s, dt, w, a) => updateGrenades(s, dt, w, a),
  playSound,
  spawnEffect: (name, pos) => {
    if (name === 'explosion') { effects.spawnExplosion(pos); playExplosion(); }
  },
};

// --- Event scan: bot tracers, banners, buy sounds -------------------------
let evSeen = 0;
function roundReason(r) {
  if (r === 'elimination') return 'Enemy team eliminated';
  if (r === 'detonation') return 'Bomb detonated';
  if (r === 'defuse') return 'Bomb defused';
  if (r === 'timeout') return 'Time expired';
  return '';
}
function scanEvents() {
  const evs = state.events;
  if (evs.length < evSeen) evSeen = 0;
  for (; evSeen < evs.length; evSeen++) {
    const e = evs[evSeen];
    if (!e) continue;
    if (e.type === 'shot' && e.by !== 'You' && e.by !== 'player') {
      const bot = state.bots.find((b) => b.name === e.by);
      const t = bot && bot.targetId
        ? (bot.targetId === 'player' ? state.player : state.bots.find((b) => b.id === bot.targetId))
        : null;
      if (bot && t && t.alive) {
        effects.spawnTracer(
          { x: bot.pos.x, y: bot.pos.y + 1.5, z: bot.pos.z },
          { x: t.pos.x, y: t.pos.y + 1.2, z: t.pos.z });
        // v2: bot muzzle flash at the gun (was tracer-only — a bot's
        // shots had no flash, so firefights read as silent tracers).
        const fx0 = -Math.sin(bot.yaw), fz0 = -Math.cos(bot.yaw);
        effects.spawnMuzzle({
          x: bot.pos.x + fx0 * 0.7, y: bot.pos.y + 1.4, z: bot.pos.z + fz0 * 0.7,
        });
        playEnemyShot(Math.hypot(t.pos.x - state.player.pos.x, t.pos.z - state.player.pos.z));
      }
    } else if (e.type === 'round') {
      state.bannerText = e.result === 'win' ? 'ROUND WON' : 'ROUND LOST';
      state.bannerSub = roundReason(e.reason);
    } else if (e.type === 'match') {
      state.bannerText = e.winner === 'atk' ? 'VICTORY' : 'DEFEAT';
      state.bannerSub = 'Match over — ' + state.score.atk + ' : ' + state.score.def;
      showMatchOverlay();
    } else if (e.type === 'buy') {
      playBuy();
    }
  }
}

// --- Menu / match-end overlay ---------------------------------------------
const menuOverlay = document.getElementById('menu-overlay');
const startBtn = document.getElementById('start-btn');
function showMatchOverlay() {
  if (!menuOverlay) return;
  const h1 = menuOverlay.querySelector('h1');
  const p = menuOverlay.querySelector('p');
  if (h1) h1.textContent = state.matchWinner === 'atk' ? 'VICTORY' : 'DEFEAT';
  if (p) p.textContent = 'Final score ' + state.score.atk + ' : ' + state.score.def + '. The yard is yours to take again.';
  if (startBtn) startBtn.textContent = 'PLAY AGAIN';
  menuOverlay.style.display = 'flex';
}
function hideMenu() { if (menuOverlay) menuOverlay.style.display = 'none'; }

function startMatch() {
  initAudio(); resumeAudio();
  state.score.atk = 0; state.score.def = 0;
  state.round = 1; state.money = 800;
  state.matchWinner = null;
  state.bannerText = ''; state.bannerSub = '';
  // v2: pistol-start economy (CS-style) — the player deploys with the
  // P9 Sidearm and $800, and buys the VK-7 ($2700) after the first round
  // win. Previously the rifle was free at spawn and its buy button was
  // dead content. Grenades start at 0 and persist across rounds.
  state.player.weapon = 'pistol';
  state.player.grenades = 0;
  state.player.armor = 0;
  resetRound(state, world);
  hideMenu();
  try {
    const lock = canvas.requestPointerLock();
    if (lock && lock.catch) lock.catch(() => {});
  } catch (err) { /* pointer lock unavailable */ }
}
if (startBtn) startBtn.addEventListener('click', startMatch);

// --- Buy menu wiring (uses the page's own overlay) ------------------------
const buyOverlay = document.getElementById('buy-overlay');
const buyMap = { 'buy-rifle-btn': 'rifle', 'buy-pistol-btn': 'pistol', 'buy-scatter-btn': 'scattergun', 'buy-armor-btn': 'armor', 'buy-nade-btn': 'grenade' };
for (const [id, item] of Object.entries(buyMap)) {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', () => { if (buyItem(state, item).ok) playBuy(); });
}
const buyClose = document.getElementById('buy-close-btn');
if (buyClose) buyClose.addEventListener('click', () => { if (buyOverlay) buyOverlay.style.display = 'none'; });

// --- Input callbacks -------------------------------------------------------
bindInput(canvas, input, {
  onReload: () => { if (state.phase === 'play' && startReload(state.player)) playReload(); },
  onBuy: () => {
    if (state.phase !== 'buy' || !buyOverlay) return;
    buyOverlay.style.display = buyOverlay.style.display === 'none' ? 'flex' : 'none';
  },
  onGrenade: () => {
    const p = state.player;
    if (state.phase !== 'play' || !p.alive || p.grenades <= 0) return;
    const o = eyeOf(p);
    const cp = Math.cos(p.pitch);
    throwGrenade(state, o, {
      x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp,
    }, world);
  },
  onSwitch: (name) => {
    const p = state.player;
    if (state.phase === 'buy') { if (buyItem(state, name).ok) playBuy(); return; }
    if (WEAPONS[name]) p.switchTo = name;
  },
});
document.addEventListener('keydown', (e) => {
  if (state.phase !== 'buy') return;
  // v3: buy keys 1-5 follow the SHOP order (rifle, pistol, scattergun,
  // armor, grenade). 1/2/3 arrive via input.js onSwitch (which buys in
  // buy phase); 4/5 are wired here so Digit3 stays free for the
  // scattergun switch.
  if (e.code === 'Digit4') { if (buyItem(state, 'armor').ok) playBuy(); }
  if (e.code === 'Digit5') { if (buyItem(state, 'grenade').ok) playBuy(); }
});

// --- Scoreboard (v2): hold Tab to see match K/D for all 10 fighters. ---
const scoreOverlay = document.getElementById('scoreboard');
document.addEventListener('keydown', (e) => {
  // 'flex', not 'block': #scoreboard is an .overlay (flex-centred); block
  // would left-align the panel instead of centring it.
  if (e.code === 'Tab' && scoreOverlay) { e.preventDefault(); scoreOverlay.style.display = 'flex'; }
});
document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab' && scoreOverlay) scoreOverlay.style.display = 'none';
});
window.addEventListener('blur', () => { if (scoreOverlay) scoreOverlay.style.display = 'none'; });

// --- Camera, bot meshes, bomb mesh ----------------------------------------
function updateCamera() {
  const p = state.player;
  if (state.phase === 'menu') {
    const t = performance.now() / 1000 * 0.08;
    camera.position.set(Math.sin(t) * 18, 8, Math.cos(t) * 13);
    camera.lookAt(0, 1, 0);
    return;
  }
  camera.position.set(p.pos.x, p.pos.y + (p.eyeH || 1.62), p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0);
}
function syncBotMeshes() {
  for (const b of state.bots) {
    const m = botMeshes.get(b.id);
    if (!m) continue;
    m.visible = b.alive;
    if (!b.alive) continue;
    m.position.set(b.pos.x, b.pos.y, b.pos.z);
    m.rotation.y = b.yaw;
  }
}
function syncBombMesh() {
  const bomb = state.bomb;
  if (bomb.state === 'carried') {
    const c = bomb.carrier === 'player' ? state.player : state.bots.find((b) => b.id === bomb.carrier);
    if (!c || !c.alive) { bombMesh.visible = false; return; }
    bombMesh.visible = true;
    bombMesh.position.set(c.pos.x, c.pos.y + 1.0, c.pos.z);
    bombLight.intensity = 0;
  } else if (bomb.state === 'planted') {
    bombMesh.visible = true;
    bombMesh.position.set(bomb.pos.x, 0.15, bomb.pos.z);
    bombLight.intensity = 2 + Math.sin(state.time * 10) * 1.5;
  } else {
    bombMesh.visible = false;
    bombLight.intensity = 0;
  }
}
function syncGrenadeMeshes() {
  const list = state.grenades || [];
  for (let i = 0; i < grenadeMeshes.length; i++) {
    const m = grenadeMeshes[i];
    const g = list[i];
    if (!g) { m.visible = false; continue; }
    m.visible = true;
    m.position.set(g.pos.x, g.pos.y, g.pos.z);
  }
}

// --- Footsteps --------------------------------------------------------------
let stepAcc = 0;
let lastStepX = 0, lastStepZ = 0;
function footstep() {
  const p = state.player;
  if (!p.alive || !p.onGround || state.phase !== 'play') return;
  const d = Math.hypot(p.pos.x - lastStepX, p.pos.z - lastStepZ);
  stepAcc += d;
  lastStepX = p.pos.x; lastStepZ = p.pos.z;
  if (stepAcc > 2.4) { stepAcc = 0; playStep(); }
}

// --- Main loop --------------------------------------------------------------
let lastT = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (document.pointerLockElement === canvas && state.phase !== 'menu') {
    const m = input.takeMouse();
    state.player.yaw -= m.dx * 0.0022;
    state.player.pitch = Math.max(-1.45, Math.min(1.45, state.player.pitch - m.dy * 0.0022));
  } else {
    input.takeMouse();
  }
  if (state.phase === 'buy') { state.bannerText = ''; state.bannerSub = ''; }
  acc += dt;
  let n = 0;
  // ?shot= staging freezes the sim: the frame must stay exactly as staged.
  if (!shotMode) {
    while (acc >= STEP && n < 5) { stepSim(state, input, STEP, world, api); acc -= STEP; n++; }
    if (n === 5) acc = 0;
  } else {
    acc = 0;
  }
  scanEvents();
  updateCamera();
  viewmodel.update(state, dt, input);
  effects.update(state, dt, camera);
  // ?shot=fight: hold Havoc's staged muzzle flash + tracer for the
  // camera — the effects live 60 ms, but the frozen frame is captured
  // seconds after load, so re-fire them every frame (same real effects,
  // sustained for the shot; the pool round-robins, so this reads as one
  // continuous flash + tracer, not a stack).
  if (shotMode === 'fight') {
    const hv = state.bots.find((b) => b.id === 'havoc');
    if (hv && hv.alive) {
      const fx0 = -Math.sin(hv.yaw), fz0 = -Math.cos(hv.yaw);
      effects.spawnMuzzle({
        x: hv.pos.x + fx0 * 0.7, y: hv.pos.y + 1.4, z: hv.pos.z + fz0 * 0.7,
      });
      effects.spawnTracer(
        { x: hv.pos.x, y: hv.pos.y + 1.5, z: hv.pos.z },
        { x: state.player.pos.x, y: state.player.pos.y + 1.2, z: state.player.pos.z });
    }
  }
  updateHUD(state, hud);
  syncBotMeshes();
  syncBombMesh();
  syncGrenadeMeshes();
  footstep();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Screenshot staging (?shot=fight|buy|plant|win, synchronous) -----------
function stageShot(kind) {
  resetRound(state, world);
  const p = state.player;
  const havoc = state.bots.find((b) => b.id === 'havoc');
  const onyx = state.bots.find((b) => b.id === 'onyx');
  const rook = state.bots.find((b) => b.id === 'rook');
  const ash = state.bots.find((b) => b.id === 'ash');
  if (kind === 'fight') {
    state.phase = 'play'; state.round = 2; state.score.atk = 1; state.score.def = 0;
    state.money = 2450; state.roundTime = 73;
    p.pos.x = -6; p.pos.z = 9; p.yaw = 0.5; p.pitch = 0; p.hp = 78; p.mag = 24; p.reserve = 90;
    // Havoc dead ahead of the camera (~8 m), Onyx mid-right, Rook left.
    // Candidate C: player z 6->9 and Havoc z -1->2 so the crate at (-6,4)
    // no longer sits on the eye->Havoc ray (LOS verified with segmentBlocked).
    if (havoc) { havoc.pos.x = -10; havoc.pos.z = 2; havoc.yaw = -2.62; }
    if (onyx) { onyx.pos.x = -3; onyx.pos.z = -3; onyx.yaw = 2.82; }
    if (rook) { rook.pos.x = -8; rook.pos.z = 2; rook.yaw = -0.4; }
    // v3: Ash (new 5v5 rusher) left of Havoc on the view axis — a fourth
    // fighter in the cover frame, clear of the (-6,4) crate and not
    // occluded by Havoc from the camera at (-6,9).
    if (ash) { ash.pos.x = -13.5; ash.pos.z = -2.5; ash.yaw = -2.6; }
  } else if (kind === 'buy') {
    state.phase = 'buy'; state.money = 4100; state.buyTime = 12;
  } else if (kind === 'plant') {
    state.phase = 'play'; state.roundTime = 61;
    state.bomb.state = 'planted'; state.bomb.site = 'A';
    state.bomb.pos.x = -16; state.bomb.pos.z = -11; state.bomb.timer = 28;
    p.pos.x = -11; p.pos.z = -6; p.yaw = Math.PI / 4; p.hp = 100;
    if (havoc) { havoc.pos.x = -14; havoc.pos.z = -12; havoc.yaw = -2.7; }
  } else if (kind === 'win') {
    state.phase = 'roundEnd'; state.round = 4; state.score.atk = 3; state.score.def = 1;
    state.money = 5600;
    state.bannerText = 'ROUND WON'; state.bannerSub = 'Elimination — Site A cleared';
    p.pos.x = -14; p.pos.z = -8; p.yaw = 0.9;
  } else {
    return;
  }
  // No sim steps here: in ?shot= mode the frame loop is frozen, so the staged
  // scene (HP, positions, bomb) stays exactly as set above.
  // v2: the fight cover stages a real in-game exchange — Havoc's muzzle
  // flash + a tracer toward the player — so the frame reads as a
  // firefight, not a still life. Both are genuine effects (spawnMuzzle /
  // spawnTracer), fired once before the single effects.update below.
  if (kind === 'fight' && havoc) {
    const hfx = -Math.sin(havoc.yaw), hfz = -Math.cos(havoc.yaw);
    effects.spawnMuzzle({
      x: havoc.pos.x + hfx * 0.7, y: havoc.pos.y + 1.4, z: havoc.pos.z + hfz * 0.7,
    });
    effects.spawnTracer(
      { x: havoc.pos.x, y: havoc.pos.y + 1.5, z: havoc.pos.z },
      { x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z });
  }
  scanEvents();
  updateCamera();
  viewmodel.update(state, 0.016, input);
  effects.update(state, 0.016, camera);
  updateHUD(state, hud);
  syncBotMeshes();
  syncBombMesh();
  syncGrenadeMeshes();
  renderer.render(scene, camera);
}

if (shotMode) stageShot(shotMode);
requestAnimationFrame(frame);

// EMBERLINE — audio.js
// Synthesized WebAudio only: no audio files, no network.
// Every play* fn is safe to call before initAudio() (no-op).
let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
  return ctx;
}

export function resume() {
  try { if (ctx && ctx.state === 'suspended') void ctx.resume(); } catch (e) {}
}

function ready() { return !!ctx && !!master && ctx.state !== 'closed'; }

function tone(type, f0, f1, dur, vol, delay) {
  if (!ready()) return;
  try {
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}

function noise(dur, vol, freq, q, delay, type) {
  if (!ready()) return;
  try {
    const t0 = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = freq || 1200;
    f.Q.value = q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.02);
  } catch (e) {}
}

function click(freq, dur, vol, delay) { tone('square', freq, freq * 0.6, dur, vol, delay); }

export function playShot(weapon, distant) {
  if (!ready()) return;
  const v = distant ? 0.16 : 0.5;
  if (weapon === 'pistol') {
    noise(0.09, v, 2600, 0.7);
    tone('square', 220, 70, 0.08, v * 0.5);
  } else {
    noise(0.14, v, 1800, 0.7);
    tone('sawtooth', 160, 55, 0.12, v * 0.6);
    noise(0.05, v * 0.7, 5200, 0.7, 0, 'highpass');
  }
}

export function playEnemyShot(dist) {
  if (!ready()) return;
  const d = typeof dist === 'number' ? dist : 20;
  const v = Math.max(0.05, Math.min(0.4, 0.45 / (1 + d * 0.09)));
  noise(0.13, v, 1400, 0.7);
  tone('sawtooth', 150, 55, 0.11, v * 0.55);
}

export function playReload() {
  click(900, 0.05, 0.22, 0);
  click(620, 0.05, 0.22, 0.18);
  click(1100, 0.06, 0.26, 0.85);
}

export function playDryFire() { click(1400, 0.03, 0.2, 0); }

export function playHit() { tone('sine', 1250, 950, 0.07, 0.28, 0); }

export function playKill() {
  tone('sine', 880, 880, 0.09, 0.3, 0);
  tone('sine', 1320, 1320, 0.12, 0.3, 0.09);
}

export function playExplosion() {
  noise(0.7, 0.6, 420, 0.6);
  tone('sine', 90, 28, 0.6, 0.55, 0);
  noise(0.25, 0.3, 3000, 0.7, 0, 'highpass');
}

export function playPlantBeep(progress) {
  const p = typeof progress === 'number' ? progress : 0;
  tone('sine', 700 + p * 700, 700 + p * 700, 0.08, 0.25, 0);
}

export function playRoundWin() {
  tone('sine', 523, 523, 0.12, 0.3, 0);
  tone('sine', 659, 659, 0.12, 0.3, 0.12);
  tone('sine', 784, 784, 0.2, 0.32, 0.24);
}

export function playRoundLoss() {
  tone('sine', 392, 392, 0.14, 0.3, 0);
  tone('sine', 330, 330, 0.14, 0.3, 0.14);
  tone('sine', 262, 247, 0.26, 0.3, 0.28);
}

export function playBuy() {
  tone('sine', 1568, 1568, 0.06, 0.22, 0);
  tone('sine', 2093, 2093, 0.1, 0.22, 0.06);
}

export function playStep() {
  noise(0.05, 0.07, 500 + Math.random() * 250, 1.2);
}

export function playPlantStart() {
  tone('sine', 980, 980, 0.09, 0.26, 0);
  tone('sine', 980, 980, 0.09, 0.26, 0.14);
}

export function playDefuse() {
  tone('sine', 1175, 1175, 0.08, 0.26, 0);
  tone('sine', 1175, 1175, 0.08, 0.26, 0.12);
}

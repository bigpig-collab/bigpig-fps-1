// EMBERLINE — player movement: accel, friction, gravity, jump, crouch, collide.
import { collideCircle } from './world.js';

const WALK = 4.3, CROUCH = 2.2, ACCEL = 40, FRICTION = 10, GRAVITY = 14, JUMP_VEL = 5.2, RADIUS = 0.35;

export function updatePlayer(state, input, dt, world) {
  const p = state.player, k = input.keys;
  p.crouch = k.has('ControlLeft') || k.has('KeyC');
  const walk = k.has('ShiftLeft') || k.has('ShiftRight');
  let f = 0, s = 0;
  if (k.has('KeyW')) f += 1;
  if (k.has('KeyS')) f -= 1;
  if (k.has('KeyD')) s += 1;
  if (k.has('KeyA')) s -= 1;
  // Forward (-sin yaw, -cos yaw); right (cos yaw, -sin yaw).
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
  const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  const max = p.crouch ? CROUCH : (walk ? WALK * 0.55 : WALK);
  if (wl > 0) {
    p.vel.x += wx * ACCEL * dt;
    p.vel.z += wz * ACCEL * dt;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > max) { p.vel.x *= max / sp; p.vel.z *= max / sp; }
  } else if (p.onGround) {
    const d = Math.max(0, 1 - FRICTION * dt);
    p.vel.x *= d; p.vel.z *= d;
    if (Math.hypot(p.vel.x, p.vel.z) < 0.05) { p.vel.x = 0; p.vel.z = 0; }
  }
  if (k.has('Space') && p.onGround) { p.vel.y = JUMP_VEL; p.onGround = false; }
  p.vel.y -= GRAVITY * dt;
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vel.y = 0; p.onGround = true; }
  if (world && typeof world.collideCircle === 'function') world.collideCircle(p.pos, RADIUS);
  else collideCircle(p.pos, RADIUS);
  p.eyeH = p.crouch ? 1.05 : 1.62;
  p.speed = Math.hypot(p.vel.x, p.vel.z);
}

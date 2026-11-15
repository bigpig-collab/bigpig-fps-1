// EMBERLINE — viewmodel.js
// First-person gun: procedural boxes in gunmetal + rust-orange accent,
// attached to the camera. Bob, recoil kick, reload dip, muzzle flash.
// No allocation in update(): all temps are module-level scalars.
import * as THREE from '../vendor/three/three.module.min.js';
import { WEAPONS } from './weapon.js';

const BASE_X = 0.28, BASE_Y = -0.26, BASE_Z = -0.5;
const FLASH_TIME = 0.06;

function box(w, h, d, color, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildViewModel(camera) {
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2e343c, metalness: 0.7, roughness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xc65a1e, metalness: 0.5, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.4, roughness: 0.7 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.9, metalness: 0.0 });

  const group = new THREE.Group();
  group.add(box(0.09, 0.11, 0.42, gunmetal, 0, 0, -0.05, gunmetal)); // receiver
  group.add(box(0.05, 0.05, 0.28, dark, 0, 0.01, -0.38, dark));     // barrel
  group.add(box(0.055, 0.055, 0.06, accent, 0, 0.01, -0.52, accent)); // muzzle ring
  group.add(box(0.06, 0.16, 0.09, dark, 0, -0.12, -0.12, dark));    // magazine
  group.add(box(0.08, 0.09, 0.2, dark, 0, -0.01, 0.22, dark));      // stock
  group.add(box(0.03, 0.05, 0.1, gunmetal, 0, 0.08, -0.08, gunmetal)); // sight base
  group.add(box(0.012, 0.035, 0.012, accent, 0, 0.115, -0.1, accent)); // sight post
  group.add(box(0.07, 0.05, 0.12, glove, 0.01, -0.09, -0.3, glove));  // forward hand
  group.add(box(0.07, 0.06, 0.1, glove, 0, -0.1, 0.02, glove));       // grip hand

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffb347, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.01, -0.56);
  flash.visible = false;
  group.add(flash);

  group.position.set(BASE_X, BASE_Y, BASE_Z);
  camera.add(group);

  const vm = {
    group,
    bobPhase: 0,
    recoil: 0,
    flashT: 0,
    seenEvents: 0,
    update(state, dt, input) {
      const p = state && state.player ? state.player : null;
      if (!p) return;
      // Consume new player-shot events: flash + recoil kick.
      const evs = state.events;
      if (evs) {
        if (evs.length < vm.seenEvents) vm.seenEvents = 0;
        for (let i = vm.seenEvents; i < evs.length; i++) {
          const e = evs[i];
          if (e && e.type === 'shot' && e.by === 'player') {
            vm.flashT = FLASH_TIME;
            vm.recoil = 1;
          }
        }
        vm.seenEvents = evs.length;
      }
      // Recoil decay + flash timer.
      if (vm.recoil > 0) vm.recoil = Math.max(0, vm.recoil - dt * 7);
      if (vm.flashT > 0) {
        vm.flashT -= dt;
        flash.visible = true;
        flash.rotation.z = Math.random() * Math.PI;
        const s = 0.8 + Math.random() * 0.5;
        flash.scale.set(s, s, 1);
      } else {
        flash.visible = false;
      }
      // Walk bob from horizontal speed.
      const vx = p.vel ? p.vel.x : 0, vz = p.vel ? p.vel.z : 0;
      const speed = Math.sqrt(vx * vx + vz * vz);
      const moving = p.alive && p.onGround && speed > 0.5;
      if (moving) vm.bobPhase += dt * speed * 1.7;
      const bobA = moving ? 0.008 : 0.002;
      const bobX = Math.sin(vm.bobPhase * 2) * bobA;
      const bobY = Math.abs(Math.sin(vm.bobPhase)) * bobA;
      // Reload dip: 0 -> 1 -> 0 across the reload (uses the weapon's own
      // reload time, so the scattergun's 2.8 s dip is correct).
      let dip = 0;
      if (p.reloading) {
        const total = (WEAPONS[p.weapon] || {}).reloadTime || 2.4;
        const t = total > 0 ? Math.max(0, Math.min(1, 1 - (p.reloadT || 0) / total)) : 0;
        dip = Math.sin(t * Math.PI) * 0.5;
      }
      group.position.set(BASE_X + bobX, BASE_Y + bobY - dip * 0.06, BASE_Z + vm.recoil * 0.06);
      group.rotation.x = vm.recoil * 0.09 + dip;
      group.rotation.z = bobX * 0.6;
    },
  };
  return vm;
}

// EMBERLINE — effects.js
// Pooled combat effects: tracers, spark particles, explosion, muzzle flash.
// All buffers preallocated at build; update() allocates nothing.
import * as THREE from '../vendor/three/three.module.min.js';

const TRACERS = 24;
const TRACER_LIFE = 0.06;
const PARTICLES = 240;
const HIDE_Y = -100;

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,220,150,1)');
  grad.addColorStop(0.4, 'rgba(255,160,60,0.85)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function buildEffects(scene) {
  // --- Tracers: 24 preallocated line segments, round-robin slots. ---
  const tracerLines = [];
  const tracerLife = new Float32Array(TRACERS);
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerLines.push(line);
  }
  let tracerSlot = 0;

  // --- Sparks: one Points cloud, 240 preallocated particles. ---
  const pPos = new Float32Array(PARTICLES * 3);
  const pCol = new Float32Array(PARTICLES * 3);
  const pVel = new Float32Array(PARTICLES * 3);
  const pLife = new Float32Array(PARTICLES);
  const pMax = new Float32Array(PARTICLES);
  for (let i = 0; i < PARTICLES; i++) { pPos[i * 3 + 1] = HIDE_Y; pLife[i] = 0; }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({
    size: 0.07, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let particleSlot = 0;

  // --- Explosion: one reused sphere + one reused point light. ---
  const boomMat = new THREE.MeshBasicMaterial({
    color: 0xff8c2e, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff9a3c, 0, 18, 1.6);
  scene.add(boomLight);
  let boomT = 0; // 1 -> 0 while an explosion is animating

  // --- Muzzle flash: one reused sprite. ---
  const muzzleMat = new THREE.SpriteMaterial({
    map: radialTexture(), color: 0xffc46b, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const muzzle = new THREE.Sprite(muzzleMat);
  muzzle.visible = false;
  scene.add(muzzle);
  let muzzleT = 0;

  const fx = {
    update(state, dt, camera) {
      fx.updateFromEvents(state);
      // Tracers fade over 60ms.
      for (let i = 0; i < TRACERS; i++) {
        if (tracerLife[i] <= 0) continue;
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          tracerLife[i] = 0;
          tracerLines[i].visible = false;
        } else {
          tracerLines[i].material.opacity = (tracerLife[i] / TRACER_LIFE) * 0.9;
        }
      }
      // Particles integrate; dead ones park below the map.
      let anyAlive = false;
      for (let i = 0; i < PARTICLES; i++) {
        if (pLife[i] <= 0) continue;
        anyAlive = true;
        pLife[i] -= dt;
        const i3 = i * 3;
        if (pLife[i] <= 0) {
          pPos[i3 + 1] = HIDE_Y;
          continue;
        }
        pVel[i3 + 1] -= 9 * dt;
        pPos[i3] += pVel[i3] * dt;
        pPos[i3 + 1] += pVel[i3 + 1] * dt;
        pPos[i3 + 2] += pVel[i3 + 2] * dt;
        if (pPos[i3 + 1] < 0.02) { pPos[i3 + 1] = 0.02; pVel[i3 + 1] = 0; }
      }
      if (anyAlive) pGeo.attributes.position.needsUpdate = true;
      // Explosion expands and fades.
      if (boomT > 0) {
        boomT = Math.max(0, boomT - dt * 2.2);
        const k = 1 - boomT;
        const s = 0.6 + k * 4.2;
        boom.scale.set(s, s, s);
        boomMat.opacity = boomT * 0.75;
        boomLight.intensity = boomT * 40;
        if (boomT <= 0) { boom.visible = false; boomLight.intensity = 0; }
      }
      // Muzzle flash fades fast.
      if (muzzleT > 0) {
        muzzleT -= dt;
        muzzleMat.opacity = Math.max(0, muzzleT / 0.06);
        if (muzzleT <= 0) muzzle.visible = false;
      }
    },

    spawnTracer(from, to) {
      const idx = tracerSlot;
      const line = tracerLines[idx];
      tracerSlot = (tracerSlot + 1) % TRACERS;
      const a = line.geometry.attributes.position.array;
      a[0] = from.x; a[1] = from.y; a[2] = from.z;
      a[3] = to.x; a[4] = to.y; a[5] = to.z;
      line.geometry.attributes.position.needsUpdate = true;
      line.material.opacity = 0.9;
      line.visible = true;
      tracerLife[idx] = TRACER_LIFE;
    },

    spawnSparks(pos, n, color) {
      const count = Math.max(0, Math.min(n || 0, PARTICLES));
      const r = ((color >>> 16) & 255) / 255;
      const g = ((color >>> 8) & 255) / 255;
      const b = (color & 255) / 255;
      for (let k = 0; k < count; k++) {
        const i = particleSlot;
        particleSlot = (particleSlot + 1) % PARTICLES;
        const i3 = i * 3;
        pPos[i3] = pos.x; pPos[i3 + 1] = pos.y; pPos[i3 + 2] = pos.z;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.random() * Math.PI;
        const sp = 2 + Math.random() * 6;
        pVel[i3] = Math.sin(ph) * Math.cos(th) * sp;
        pVel[i3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.9 + 1;
        pVel[i3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
        pCol[i3] = r; pCol[i3 + 1] = g; pCol[i3 + 2] = b;
        pMax[i] = 0.4 + Math.random() * 0.4;
        pLife[i] = pMax[i];
      }
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.color.needsUpdate = true;
    },

    spawnExplosion(pos) {
      boom.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
      boomLight.position.set(pos.x, pos.y + 1, pos.z);
      boomT = 1;
      boom.visible = true;
      fx.spawnSparks(pos, 60, 0xff8c2e);
      fx.spawnSparks(pos, 20, 0xffd27a);
    },

    spawnMuzzle(pos, dir) {
      muzzle.position.set(pos.x, pos.y, pos.z);
      const s = 0.35 + Math.random() * 0.2;
      muzzle.scale.set(s, s, 1);
      muzzleT = 0.06;
      muzzleMat.opacity = 1;
      muzzle.visible = true;
    },

    updateFromEvents(state) {
      const evs = state && state.events;
      if (!evs) return;
      if (evs.length < fx._seen) fx._seen = 0;
      for (let i = fx._seen; i < evs.length; i++) {
        const e = evs[i];
        if (!e) continue;
        if (e.type === 'shot' && e.from && e.to) {
          fx.spawnTracer(e.from, e.to);
          if (e.by === 'player') fx.spawnMuzzle(e.from, null);
        } else if (e.type === 'hit' && e.pos) {
          fx.spawnSparks(e.pos, e.kill ? 24 : 12, e.kill ? 0xff5a3c : 0xffc46b);
        } else if (e.type === 'explode' && e.pos) {
          fx.spawnExplosion(e.pos);
        } else if (e.type === 'kill' && e.pos) {
          fx.spawnSparks(e.pos, 24, 0xffb347);
        }
      }
      fx._seen = evs.length;
    },
    _seen: 0,
  };
  return fx;
}

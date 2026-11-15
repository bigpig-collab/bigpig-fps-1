// EMBERLINE — palette + procedural canvas textures. No external assets.
import * as THREE from 'three';

export const PALETTE = {
  sky: 0x2b3448, fog: 0x3a4256, dusk: 0xe08a3c,
  ground: 0x4a4d52, concrete: 0x8a8d90, concreteDark: 0x5c5f63,
  steel: 0x6e7680, steelDark: 0x3f454d, rust: 0xb45a28,
  crate: 0x9a6b35, crateDark: 0x6e4a22,
  containerA: 0xa34d24, containerB: 0x2e6b7a,
  sodium: 0xffb347, ember: 0xff7a1a, siteA: 0xff8c2e, siteB: 0x35c4d8,
  accent: 0xe8b34b, text: 0xe8e4da, danger: 0xe5484d, ok: 0x46c26a,
};

function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

function speckle(g, s, n, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

function noiseTex(base, rx, ry) {
  return canvasTex(128, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    speckle(g, s, 700, 0.07);
  }, rx, ry);
}

function plankTex(base, dark) {
  return canvasTex(128, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      g.fillStyle = dark; g.fillRect(0, y, s, 3);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + 3, s, 2);
    }
    speckle(g, s, 260, 0.08);
  });
}

// MATERIALS: factories returning fresh materials (callers may tint freely).
export const MATERIALS = {
  ground: () => new THREE.MeshStandardMaterial({ map: noiseTex('#4a4d52', 10, 8), roughness: 0.96, metalness: 0.02 }),
  concrete: () => new THREE.MeshStandardMaterial({ map: noiseTex('#8a8d90', 2, 2), roughness: 0.95 }),
  concreteDark: () => new THREE.MeshStandardMaterial({ map: noiseTex('#5c5f63', 2, 2), roughness: 0.95 }),
  steel: () => new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.45, metalness: 0.65 }),
  steelDark: () => new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.55, metalness: 0.6 }),
  crate: () => new THREE.MeshStandardMaterial({ map: plankTex('#9a6b35', '#6e4a22'), roughness: 0.85 }),
  container: (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.35 }),
  furnace: () => new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.7, metalness: 0.4, emissive: 0x301505, emissiveIntensity: 0.6 }),
  glow: (hex) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: 2.2 }),
  site: (hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
};

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

// v3: yard ground — concrete slabs with expansion joints, oil stains and
// wear, so the floor reads as a worked yard instead of a flat grey plane.
// Tiled 10x8 across the yard, so joints form a regular slab grid.
function groundTex() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#4a4d52'; g.fillRect(0, 0, s, s);
    speckle(g, s, 1400, 0.07);
    // Expansion joints: dark seams every 64 px (one slab per tile cell).
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x <= s; x += 64) { g.fillRect(x, 0, 2, s); g.fillRect(0, x, s, 2); }
    // Oil stains: soft dark blobs.
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 12 + Math.random() * 26;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, 'rgba(10,10,12,0.5)');
      grad.addColorStop(1, 'rgba(10,10,12,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Pale wear patches where boots and wheels run.
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 18 + Math.random() * 30;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, 'rgba(200,200,190,0.10)');
      grad.addColorStop(1, 'rgba(200,200,190,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }, 10, 8);
}

// v3: dusk sky — vertical gradient for the sky dome: deep indigo overhead,
// violet, then a hot orange band at the horizon where the foundry sun
// sits. Painted once on a 16x256 strip, wrapped around the dome.
export function skyTex() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#10182e');
  grad.addColorStop(0.45, '#232c4a');
  grad.addColorStop(0.68, '#4a3a58');
  grad.addColorStop(0.8, '#b45a28');
  grad.addColorStop(0.88, '#e08a3c');
  grad.addColorStop(1.0, '#3a2f28');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// v3: soft cloud blob — a few overlapping radial puffs on transparency,
// used on flat billboards high over the yard.
export function cloudTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (const [x, y, r, a] of [[70, 80, 46, 0.55], [120, 66, 56, 0.6], [180, 84, 44, 0.5], [110, 92, 60, 0.35]]) {
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, `rgba(226,214,196,${a})`);
    grad.addColorStop(1, 'rgba(226,214,196,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

// v3: big site letter on transparency — "A" / "B" boards over the sites.
export function letterTex(letter, color) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(12,14,18,0.72)';
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.strokeStyle = color; g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
  g.fillStyle = color;
  g.font = 'bold 76px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(letter, 64, 68);
  return new THREE.CanvasTexture(c);
}

// v3: diagonal hazard stripes (yellow/black) for site-entry floor decals.
export function hazardTex() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#e8b34b'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#14181f';
    for (let x = -s; x < s * 2; x += 32) {
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 16 + s, s); g.lineTo(x + s, s);
      g.closePath(); g.fill();
    }
  }, 1, 1);
}

// MATERIALS: factories returning fresh materials (callers may tint freely).
export const MATERIALS = {
  ground: () => new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 0.96, metalness: 0.02 }),
  concrete: () => new THREE.MeshStandardMaterial({ map: noiseTex('#8a8d90', 2, 2), roughness: 0.95 }),
  concreteDark: () => new THREE.MeshStandardMaterial({ map: noiseTex('#5c5f63', 2, 2), roughness: 0.95 }),
  steel: () => new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.45, metalness: 0.65 }),
  steelDark: () => new THREE.MeshStandardMaterial({ color: PALETTE.steelDark, roughness: 0.55, metalness: 0.6 }),
  crate: () => new THREE.MeshStandardMaterial({ map: plankTex('#9a6b35', '#6e4a22'), roughness: 0.85 }),
  container: (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.35 }),
  furnace: () => new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.7, metalness: 0.4, emissive: 0x301505, emissiveIntensity: 0.6 }),
  glow: (hex) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: hex, emissiveIntensity: 2.2 }),
  site: (hex) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.16, side: THREE.DoubleSide }),
  // v3 props: rust barrel, sandbag, pipe steel.
  barrel: (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0.45 }),
  sandbag: () => new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 0.95, metalness: 0.0 }),
  pipe: () => new THREE.MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.4, metalness: 0.7 }),
};

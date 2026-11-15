// EMBERLINE — shop, buy rules, damage split (Track B).
// v3: five items — the VK-9 Scattergun joins between the sidearm and
// the plating (buy keys 1–5 follow this order).
export const SHOP = [
  { id: 'rifle', name: 'VK-7 Kestrel', price: 2700 },
  { id: 'pistol', name: 'P9 Sidearm', price: 500, owned: true },
  { id: 'scattergun', name: 'VK-9 Scattergun', price: 1800 },
  { id: 'armor', name: 'Plating', price: 650 },
  { id: 'grenade', name: 'Frag Grenade', price: 300 },
];

const MAG = { rifle: 30, pistol: 12, scattergun: 6 };
const RESERVE = { rifle: 90, pistol: 36, scattergun: 24 };
const HEAD_MUL = 4;

// Damage split: headshots x4, then armour absorbs 50% of what is left while
// any plating remains (armour depletes first). dmg is base damage BEFORE the
// head multiplier; callers apply range falloff before calling.
// Returns true when the hit killed the target.
export function applyDamage(state, target, dmg, isHead) {
  if (!target || !target.alive) return false;
  let d = isHead ? dmg * HEAD_MUL : dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, d * 0.5);
    target.armor -= absorbed;
    d -= absorbed;
  }
  target.hp -= d;
  if (target.hp <= 0) { target.hp = 0; target.alive = false; return true; }
  return false;
}

export function buyItem(state, id) {
  const item = SHOP.find(i => i.id === id);
  if (!item) return { ok: false, reason: 'unknown-item' };
  if (state.phase !== 'buy') return { ok: false, reason: 'not-buy-phase' };
  const p = state.player;
  // The sidearm is already owned: equipping it is free.
  if (id === 'pistol' && item.owned) {
    p.weapon = 'pistol'; p.mag = MAG.pistol; p.reserve = RESERVE.pistol;
    p.reloading = false; p.reloadT = 0;
    state.events.push({ type: 'buy', id, price: 0, t: state.time });
    return { ok: true, price: 0 };
  }
  if (id === 'grenade' && p.grenades >= 2) return { ok: false, reason: 'grenades-full' };
  if (state.money < item.price) return { ok: false, reason: 'no-money' };
  state.money -= item.price;
  if (id === 'rifle' || id === 'scattergun') {
    p.weapon = id; p.mag = MAG[id]; p.reserve = RESERVE[id];
    p.reloading = false; p.reloadT = 0;
  } else if (id === 'grenade') {
    p.grenades += 1;
  } else if (id === 'armor') {
    p.armor = 50;
  }
  state.events.push({ type: 'buy', id, price: item.price, t: state.time });
  return { ok: true, price: item.price };
}

let menuEl = null;
let moneyEl = null;
let btns = {};

// Builds the #buy overlay once, then keeps it in sync. Safe to call when
// there is no DOM (Node/test): returns null and updateBuyMenu no-ops.
export function buildBuyMenu(state, onBuy) {
  if (typeof document === 'undefined') return null;
  menuEl = document.getElementById('buy');
  if (!menuEl) {
    menuEl = document.createElement('div');
    menuEl.id = 'buy';
    menuEl.className = 'buy-overlay';
    menuEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;background:#1b2027;border:1px solid #4a4d52;padding:24px;color:#e8e4da;';
    const title = document.createElement('h2');
    title.textContent = 'BUY — EMBERLINE';
    menuEl.appendChild(title);
    moneyEl = document.createElement('div');
    moneyEl.className = 'buy-money';
    menuEl.appendChild(moneyEl);
    const list = document.createElement('div');
    list.className = 'buy-list';
    SHOP.forEach((item, i) => {
      const b = document.createElement('button');
      b.className = 'buy-item';
      b.dataset.id = item.id;
      b.textContent = (i + 1) + '  ' + item.name + '  —  $' + item.price;
      b.addEventListener('click', () => { if (onBuy) onBuy(item.id); });
      list.appendChild(b);
      btns[item.id] = b;
    });
    menuEl.appendChild(list);
    const hint = document.createElement('div');
    hint.className = 'buy-hint';
    hint.textContent = 'Keys 1–5 to buy — buy phase only';
    menuEl.appendChild(hint);
    document.body.appendChild(menuEl);
  } else {
    btns = {};
    menuEl.querySelectorAll('.buy-item').forEach(bb => { btns[bb.dataset.id] = bb; });
  }
  updateBuyMenu(state);
  return menuEl;
}

export function updateBuyMenu(state) {
  if (typeof document === 'undefined' || !menuEl) return;
  menuEl.style.display = state.phase === 'buy' ? 'block' : 'none';
  if (moneyEl) moneyEl.textContent = 'Money: $' + state.money;
  for (const item of SHOP) {
    const b = btns[item.id];
    if (!b) continue;
    const afford = item.id === 'pistol' ? true : state.money >= item.price;
    const full = item.id === 'grenade' && state.player.grenades >= 2;
    b.disabled = state.phase !== 'buy' || !afford || full;
  }
}

// EMBERLINE — HUD: DOM updates only when values change.
import { WEAPONS } from './weapon.js';

const $ = (id) => document.getElementById(id);

export function buildHUD() {
  return {
    el: {
      hpBar: $('hp-bar'), hpNum: $('hp-num'), armorNum: $('armor-num'),
      ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), weaponName: $('weapon-name'),
      moneyNum: $('money-num'), timerNum: $('timer-num'), scoreNum: $('score-num'),
      roundNum: $('round-num'), crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      killfeed: $('killfeed'), bombStatus: $('bomb-status'), bombBar: $('bomb-bar'),
      bombFill: $('bomb-bar-fill'), banner: $('banner'), bannerSub: $('banner-sub'),
      grenadeNum: $('grenade-num'), buyHint: $('buy-hint'),
      menuOverlay: $('menu-overlay'), buyOverlay: $('buy-overlay'),
      scoreboard: $('scoreboard'), scoreRows: $('score-rows'),
    },
    last: {}, evIdx: 0, bombState: null, bannerUntil: 0, hitT: 0, scoreSig: '',
  };
}

function setText(el, key, val, hud) {
  if (!el || hud.last[key] === val) return;
  hud.last[key] = val;
  el.textContent = val;
}

function flashHitmarker(hud, kill) {
  const el = hud.el.hitmarker;
  if (!el) return;
  el.classList.add('show');
  el.classList.toggle('kill', kill);
  clearTimeout(hud.hitT);
  hud.hitT = setTimeout(() => el.classList.remove('show', 'kill'), kill ? 220 : 140);
}

export function updateHUD(state, hud) {
  const el = hud.el, p = state.player, b = state.bomb;
  const hp = Math.max(0, Math.ceil(p.hp));
  setText(el.hpNum, 'hp', String(hp), hud);
  if (el.hpBar && hud.last.hpBar !== hp) {
    hud.last.hpBar = hp;
    el.hpBar.style.width = hp + '%';
    el.hpBar.style.background = hp <= 25 ? '#e5484d' : hp <= 50 ? '#e8b34b' : '#46c26a';
  }
  setText(el.armorNum, 'armor', String(p.armor || 0), hud);
  setText(el.ammoMag, 'mag', String(p.mag), hud);
  setText(el.ammoRes, 'res', String(p.reserve), hud);
  setText(el.weaponName, 'wname', (WEAPONS[p.weapon] || {}).name || p.weapon, hud);
  setText(el.moneyNum, 'money', '$' + state.money, hud);
  const t = Math.max(0, Math.ceil(state.phase === 'buy' ? state.buyTime : state.roundTime));
  setText(el.timerNum, 'timer', Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), hud);
  if (el.timerNum) el.timerNum.classList.toggle('low', t <= 10 && state.phase === 'play');
  setText(el.scoreNum, 'score', 'ATK ' + state.score.atk + ' : ' + state.score.def + ' DEF', hud);
  setText(el.roundNum, 'round', 'ROUND ' + state.round, hud);
  setText(el.grenadeNum, 'nade', 'Grenades: ' + (p.grenades || 0), hud);
  // Crosshair gap follows live spread.
  const gap = Math.round(Math.min(40, Math.max(5, 5 + (p.spread || 0.011) * 500)));
  if (el.crosshair && hud.last.gap !== gap) { hud.last.gap = gap; el.crosshair.style.setProperty('--gap', gap + 'px'); }
  // Events: hitmarker + killfeed (consume each event once).
  for (; hud.evIdx < state.events.length; hud.evIdx++) {
    const e = state.events[hud.evIdx];
    if (e.type === 'hit' || e.type === 'kill') flashHitmarker(hud, e.type === 'kill');
    if (e.type === 'kill' && el.killfeed) {
      const d = document.createElement('div');
      d.textContent = e.by + '  \u25B8  ' + e.victim + (e.head ? '  (headshot)' : '');
      el.killfeed.appendChild(d);
      while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.firstChild);
      setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 6000);
    }
  }
  // Bomb status + bar (plant/defuse progress, or planted countdown).
  let bs = '';
  if (b.state === 'planted') bs = 'BOMB PLANTED — ' + Math.ceil(b.timer) + 's';
  else if (b.state === 'defused') bs = 'Bomb defused';
  else if (b.state === 'detonated') bs = 'Bomb detonated';
  else bs = 'Bomb with ' + (b.carrier === 'player' ? 'You' : (b.carrier || '—'));
  setText(el.bombStatus, 'bomb', bs, hud);
  let prog = 0;
  if (p.planting > 0) prog = Math.min(1, p.planting / 3);
  else if (p.defusing > 0) prog = Math.min(1, p.defusing / 5);
  else if (b.state === 'planted') prog = Math.max(0, b.timer / (state.settings.bombTimer || 35));
  const pct = Math.round(prog * 100);
  if (el.bombFill && hud.last.bombPct !== pct) { hud.last.bombPct = pct; el.bombFill.style.width = pct + '%'; }
  if (el.bombBar) el.bombBar.style.display = pct > 0 ? 'block' : 'none';
  // Centre banner: explicit bannerText wins, else planted flash / round end.
  let banner = '', sub = '';
  if (state.bannerText) { banner = state.bannerText; sub = state.bannerSub || ''; hud.bannerUntil = 0; }
  else if (b.state === 'planted' && hud.bombState !== 'planted') hud.bannerUntil = Date.now() + 2500;
  if (!banner && Date.now() < hud.bannerUntil) banner = 'BOMB PLANTED';
  if (!banner && state.phase === 'roundEnd') banner = 'ROUND OVER';
  hud.bombState = b.state;
  setText(el.banner, 'banner', banner, hud);
  setText(el.bannerSub, 'bannerSub', sub, hud);
  if (el.banner && hud.last.bannerShow !== !!banner) { hud.last.bannerShow = !!banner; el.banner.style.display = banner ? 'block' : 'none'; }
  if (el.bannerSub && hud.last.bannerSubShow !== !!sub) { hud.last.bannerSubShow = !!sub; el.bannerSub.style.display = sub ? 'block' : 'none'; }
  // Buy hint + overlays follow phase.
  if (el.buyHint && hud.last.buyHint !== (state.phase === 'buy')) {
    hud.last.buyHint = state.phase === 'buy';
    el.buyHint.style.display = state.phase === 'buy' ? 'block' : 'none';
  }
  if (el.menuOverlay && hud.last.menu !== (state.phase === 'menu')) {
    hud.last.menu = state.phase === 'menu';
    el.menuOverlay.style.display = state.phase === 'menu' ? 'flex' : 'none';
  }
  if (el.buyOverlay && hud.last.buy !== (state.phase === 'buy')) {
    hud.last.buy = state.phase === 'buy';
    el.buyOverlay.style.display = state.phase === 'buy' ? 'flex' : 'none';
  }
  // Scoreboard (v2): fill the Tab overlay from match K/D totals, only
  // while it is open and only when a value changed (signature guard).
  if (el.scoreboard && el.scoreRows && el.scoreboard.style.display === 'flex') {
    const rows = [{ name: 'You', team: 'atk', kills: p.kills || 0, deaths: p.deaths || 0 }]
      .concat((state.bots || []).map((b) => ({
        name: b.name || b.id, team: b.team, kills: b.kills || 0, deaths: b.deaths || 0,
      })));
    const sig = rows.map((r) => r.name + ':' + r.kills + '/' + r.deaths).join('|');
    if (hud.scoreSig !== sig) {
      hud.scoreSig = sig;
      el.scoreRows.innerHTML = rows.map((r) =>
        '<tr><td>' + r.name + '</td><td class="team-' + r.team + '">' +
        (r.team === 'atk' ? 'EMBER' : 'JACKAL') + '</td><td>' + r.kills +
        '</td><td>' + r.deaths + '</td></tr>').join('');
    }
  }
}

// EMBERLINE — Foundry Yard: what this game is (read this first).
//
// A complete round-based tactical FPS for three.js, played 5v5: the
// player leads four bot teammates (Ember) against five defenders
// (Jackal) on one original map — a dusk industrial foundry yard with
// two bomb sites, the Furnace (A) and the Crane (B). First team to 5
// rounds takes the match.
//
// How a round works (rounds.js: buy 15 s -> play 100 s -> round end):
// attackers plant the bomb at A or B (3 s channel, bomb.js) and defend
// it until it detonates (35 s); defenders stop the plant, defuse the
// bomb (5 s channel), wipe the attackers, or run the clock out.
// Elimination, detonation, defuse and timeout all end rounds, and the
// winner is paid $3250 ($1900 on a loss) plus $300 per player kill.
//
// The economy (economy.js: SHOP, buyItem): the player deploys with the
// P9 Sidearm and $800 and buys up — VK-7 Kestrel rifle ($2700, 30
// rounds, automatic), VK-9 Scattergun ($1800, 6 pellets, close range),
// Plating ($650, absorbs damage), Frag Grenade ($300, max 2 carried,
// persists across rounds). Keys 1/2/3 switch weapons, 1-5 buy, B opens
// the menu, Tab shows the live 5v5 scoreboard (match K/D, hud.js).
//
// The bots (bots.js: 9 bots, ~525 lines) are not scripted: they route
// over a 16-waypoint graph (world.js: WP_DEFS/WP_EDGES, BFS paths),
// rush A1/A2/B, hold A/A2/B/mid, rotate between mid and the far lane,
// scan their angles, hear enemy shots within 25 m and investigate,
// react to a visible target after 0.3-0.55 s, fight in 3-5 shot bursts
// with aim error that grows with range and target speed, throw their
// one frag per round when fighting up close or clearing a site, carry
// and plant the bomb, defend a planted site, and converge to defuse.
// Headshots deal 4x (rifle/pistol) and 2x (scattergun).
//
// The map (world.js: buildWorld) is one yard, 46 x 34 m: two sites, a
// furnace with a glowing mouth, a crane with a jib, a gantry with a
// sodium strip, stacked containers, barrel clusters, sandbag rows,
// pipes, floodlight poles, site letter boards, hazard stripes and a
// centre ring — all colliders and line-of-sight are real AABBs
// (collideCircle, segmentBlocked), so cover blocks movement, sight
// and bullets alike. Dusk lighting: a low sun with shadows, a
// gradient sky dome with a sun disc and clouds, fog, and warm sodium
// and ember point lights.
//
// Feedback (effects.js, viewmodel.js, audio.js, hud.js): pooled
// tracers, muzzle flashes, spark bursts and explosions; a first-person
// viewmodel with bob, recoil and reload dip; procedural WebAudio
// (shots, hits, kills, explosions, plant beeps, round stingers);
// a HUD with health/armour, ammo, money, timer, score, bomb status
// and bar, killfeed, hitmarker, round banners and the scoreboard.
//
// The four screenshots are real renders of this build: a firefight at
// mid (cover), the buy menu with all five items, a planted bomb at
// Site A, and a round won by elimination. Run it with
// `cd game && python3 -m http.server 8123` and open
// http://localhost:8123 — no build step, no network, three.js 0.187.0
// vendored under game/vendor.
//
// v3 vs v2: 5v5 (was 4v4, +Ash rushA2, +Vex mid hold), the VK-9
// Scattergun (third weapon), and the dusk-sky + props pass (the sky
// was a flat colour, the yard had no barrels, sandbags, pipes,
// floodlights, letter boards or floor paint). Everything else —
// pistol-start economy, bot grenades, muzzle flashes, site spawns,
// Tab scoreboard — is unchanged from v2.
export const OVERVIEW = 'EMBERLINE — Foundry Yard: 5v5 round-based tactical FPS, plant/defuse, buy economy, 9 bots, dusk foundry map.';

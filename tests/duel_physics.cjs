/* Scénarios mécaniques + actions aléatoires déterministes, sans rendu ni réseau. */
const assert = require('node:assert/strict');
const P = require('../scripts/core/duel-physics.js');
const F = P.FIELD;
function clear() {
  const s = P.create();
  s.bodies.forEach((p, i) => { if (i < 10) { p.x = i < 5 ? 52 : 348; p.y = 130 + (i % 5) * 105; } });
  return s;
}
function integrity(s) {
  for (const p of s.bodies) {
    assert(Number.isFinite(p.x + p.y + p.vx + p.vy));
    assert(p.x >= F.left + p.r + F.wall - .01 && p.x <= F.right - p.r - F.wall + .01);
    assert(p.y >= F.top - F.goalDepth + p.r + F.wall - .01 && p.y <= F.bottom + F.goalDepth - p.r - F.wall + .01);
    for (const [cx, cy, sx, sy] of P.corners) if ((p.x - cx) * sx > 0 && (p.y - cy) * sy > 0)
      assert(Math.hypot(p.x - cx, p.y - cy) <= F.corner - p.r - F.wall + .06);
    for (const [x1, y1, x2, y2] of P.walls) {
      const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / (dx * dx + dy * dy)));
      assert(Math.hypot(p.x - x1 - dx * t, p.y - y1 - dy * t) >= p.r + F.wall - .06);
    }
  }
  for (let i = 0; i < 11; i++) for (let j = i + 1; j < 11; j++) {
    const a = s.bodies[i], b = s.bodies[j];
    assert(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r - .06, `Pénétration ${i}/${j}`);
  }
}
function settle(s, limit = 1500) {
  let frames = 0;
  while (['moving', 'goal'].includes(s.phase) && frames++ < limit) { P.step(s, P.STEP); integrity(s); }
  assert(frames < limit, 'Le tour doit se terminer sans intervention'); return frames;
}
for (const f of P.FORMATIONS) {
  const s = P.create([f, f]); integrity(s);
  assert.equal(s.bodies.filter(p => p.team === 0).length, 5); assert.equal(s.bodies.filter(p => p.team === 1).length, 5);
  for (let i = 0; i < 5; i++) assert.equal(s.bodies[i].y + s.bodies[i + 5].y, 680);
}
assert(P.BALL_RADIUS < P.PUCK_RADIUS);
{
  const s = clear(); assert(!P.shoot(s, 5, 0, -500)); assert(!P.shoot(s, 0, NaN, 300)); assert(!P.shoot(s, 0, 0, 0));
  P.shoot(s, 0, 2000, 0); assert.equal(s.bodies[0].vx, P.MAX_SHOT);
  assert(!P.shoot(s, 0, 100, 0)); settle(s); assert.equal(s.turn, 1); assert.equal(s.active, null);
}
console.log('PASS: trois formations symétriques, cinq pions, puissance plafonnée et alternance automatique');
{
  const s = clear(), p = s.bodies[0], b = s.bodies[10], receiver = s.bodies[1];
  Object.assign(p, { x: 200, y: 440 }); Object.assign(b, { x: 200, y: 400 }); Object.assign(receiver, { x: 200, y: 285 });
  P.shoot(s, 0, 0, -700); settle(s);
  assert.equal(s.turn, 0); assert.equal(s.active, 1); assert.equal(s.passes[0], 1);
  assert(receiver.y > b.y && Math.abs(receiver.x - b.x) < 2, 'Pion → ballon → but adverse');
  assert(Math.abs(Math.hypot(receiver.x - b.x, receiver.y - b.y) - 27) < 1.5, 'Petit espace devant le receveur');
  assert(!P.selectable(s, 0)); assert(P.selectable(s, 1));
  // Nouvelle passe avec le receveur actif ; l'enchaînement garde l'identité du joueur.
  Object.assign(s.bodies[2], { x: b.x, y: b.y - 100 });
  P.shoot(s, 1, 0, -450); settle(s);
  assert.equal(s.turn, 0); assert.equal(s.active, 2); assert.equal(s.passes[0], 2);
}
console.log('PASS: capture, rotation naturelle de 180°, petit espace, receveur actif et deux passes enchaînées');
{
  const s = clear(); Object.assign(s.bodies[10], { x: 200, y: 308.8, vy: -6 });
  Object.assign(s.bodies[1], { x: 200, y: 285 });
  P.shoot(s, 0, 20, 0); settle(s);
  assert.equal(s.passes[0], 1); assert.equal(s.turn, 0); assert.equal(s.active, 1);
}
console.log('PASS: une passe très lente compte aussi, sans seuil de puissance');
{
  const s = clear(), p = s.bodies[0], b = s.bodies[10];
  Object.assign(p, { x: 200, y: 440 }); Object.assign(b, { x: 200, y: 400 });
  Object.assign(s.bodies[5], { x: 200, y: 285 });
  P.shoot(s, 0, 0, -500); settle(s); assert.equal(s.turn, 1); assert.equal(s.passes[0], 0);
}
console.log('PASS: le contact avec l’adversaire ne prolonge pas le tour');
for (const [x, y, rx, ry] of [[200, 340, 200, 313], [42, 340, 65, 340], [90, 80, 113, 80], [310, 600, 287, 600]]) {
  const s = clear(); Object.assign(s.bodies[10], { x, y }); Object.assign(s.bodies[1], { x: rx, y: ry });
  Object.assign(s.bodies[2], { x: 200, y: 540 });
  Object.assign(s.bodies[5], { x: x + 32, y: y + 25 });
  s.phase = 'moving'; s.active = 1; s.action = { shooter: 0, receiver: 1, elapsed: 0 };
  s.capture = { id: 1, x, y, orbit: Math.atan2(ry - y, rx - x), elapsed: 0 };
  const blocker = { x: s.bodies[5].x, y: s.bodies[5].y };
  settle(s); assert.equal(s.turn, 0); assert.equal(s.active, 1);
  assert(Math.hypot(blocker.x - s.bodies[5].x, blocker.y - s.bodies[5].y) > 5, 'Un pion gênant doit être poussé physiquement');
  const b = s.bodies[10], p = s.bodies[1]; assert(Math.hypot(p.x - b.x, p.y - b.y) > p.r + b.r);
}
console.log('PASS: receveur qui pousse les obstacles, réception près des murs et des coins sans téléportation ni blocage');
{
  const s = clear(), p = s.bodies[0], b = s.bodies[10];
  Object.assign(p, { x: 200, y: 440 }); Object.assign(b, { x: 210, y: 400 });
  P.shoot(s, 0, 0, -500); let hit = false;
  for (let i = 0; i < 60 && s.phase === 'moving'; i++) { P.step(s, P.STEP); integrity(s); if (Math.abs(b.vx) > 60) hit = true; }
  assert(hit, 'Un contact latéral doit dévier le ballon'); assert(Math.abs(b.spin) > 0); settle(s);
}
console.log('PASS: contact décentré, déviation et rotation du ballon');
for (const [x, y, vx, vy] of [[80, 105, -1500, -1400], [320, 105, 1500, -1400], [80, 575, -1500, 1400], [320, 575, 1500, 1400], [45, 340, -1500, 0]]) {
  const s = clear(); P.shoot(s, 0, 20, 0); Object.assign(s.bodies[10], { x, y, vx, vy });
  for (let i = 0; i < 12; i++) { P.step(s, .05); integrity(s); }
  settle(s);
}
console.log('PASS: rebonds dans les quatre coins arrondis, murs complets et tirs très rapides sans traversée');
{
  const s = clear(); P.shoot(s, 0, 20, 0); Object.assign(s.bodies[10], { x: 200, y: F.top - 6, vx: 0, vy: 0 });
  P.step(s, P.STEP); assert.deepEqual(s.scores, [0, 0], 'Tout le ballon doit franchir la ligne');
  s.bodies[10].vy = -100; P.step(s, .05); assert.deepEqual(s.scores, [1, 0]); assert.equal(s.phase, 'goal');
  settle(s); assert.equal(s.turn, 1); assert.equal(s.bodies[10].y, 340); assert.deepEqual(s.scores, [1, 0]);
  for (let goal = 2; goal <= 3; goal++) {
    s.turn = 0; s.active = null; P.shoot(s, 0, 20, 0);
    Object.assign(s.bodies[10], { x: 200, y: F.top - 9, vx: 0, vy: -30 }); P.step(s, P.STEP); settle(s);
    assert.equal(s.scores[0], goal);
  }
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 0); assert(!P.shoot(s, 0, 0, -500));
}
console.log('PASS: ligne complètement franchie, remise au centre, formations conservées, reprise par le joueur encaissant et victoire à trois');
{
  let seed = 22; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const s = P.create();
  for (let n = 0; n < 150; n++) {
    if (s.phase === 'finished') { s.scores = [0, 0]; s.winner = null; P.reset(s); }
    const choices = s.bodies.filter(p => P.selectable(s, p.id)), p = choices[Math.floor(random() * choices.length)], angle = random() * Math.PI * 2;
    P.shoot(s, p.id, Math.cos(angle) * 720, Math.sin(angle) * 720);
    const copy = JSON.parse(JSON.stringify(s)); assert(P.restore(copy));
    if (n % 5 === 0) Object.assign(s, copy);
    settle(s);
  }
  assert(s.passes.some(n => n > 0)); assert(s.moves.every(n => n > 0));
  const corrupt = JSON.parse(JSON.stringify(s)); corrupt.bodies[0].x = NaN; assert.equal(P.restore(corrupt), null);
}
console.log('PASS: 150 actions déterministes, collisions et limites contrôlées à chaque pas, sauvegarde et reprise');

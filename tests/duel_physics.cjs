/* Scénarios mécaniques + actions aléatoires déterministes, sans rendu ni réseau. */
const assert = require('node:assert/strict');
const P = require('../scripts/core/duel-physics.js');
const F = P.FIELD;
function clear() {
  const s = P.create(undefined, 0);
  s.bodies.forEach((p, i) => { if (i < 10) { p.x = i < 5 ? 52 : 348; p.y = 130 + (i % 5) * 105; } });
  s.bodies[10].x = 166; s.bodies[11].x = 234;
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
  for (let i = 0; i < s.bodies.length; i++) for (let j = i + 1; j < s.bodies.length; j++) {
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
  const s = P.create([f, f], 0); integrity(s);
  assert.equal(s.bodies.filter(p => p.team === 0).length, 6); assert.equal(s.bodies.filter(p => p.team === 1).length, 6);
  assert.equal(s.bodies.filter(P.isKeeper).length, 2);
  assert.equal(s.bodies[10].r, P.KEEPER_RADIUS); assert.equal(s.bodies[11].r, P.KEEPER_RADIUS);
  assert.equal(s.bodies[10].y + s.bodies[11].y, 680);
  assert(P.selectable(s, 10)); assert(!P.selectable(s, 11));
  for (let i = 0; i < 5; i++) {
    const attack = P.formationPositions(f, 1)[i], defense = s.bodies[i + 5];
    assert(defense.y < attack.y, 'La défense est plus proche de son but');
    assert(Math.abs(defense.x - 200) <= Math.abs(attack.x - 200));
  }
  const reversed = P.create([f, f], 1); integrity(reversed);
  for (let i = 0; i < 5; i++) {
    assert.equal(s.bodies[i].y + reversed.bodies[i + 5].y, 680);
    assert.equal(s.bodies[i + 5].y + reversed.bodies[i].y, 680);
  }
}
{
  const random = Math.random;
  try {
    Math.random = () => .1; assert.equal(P.create().turn, 0);
    Math.random = () => .9; assert.equal(P.create().turn, 1);
  } finally { Math.random = random; }
}
assert(P.BALL_RADIUS < P.PUCK_RADIUS);
assert(P.KEEPER_RADIUS > P.PUCK_RADIUS);
{
  const s = clear(); assert(!P.shoot(s, 5, 0, -500)); assert(!P.shoot(s, 0, NaN, 300)); assert(!P.shoot(s, 0, 0, 0));
  P.shoot(s, 0, 2000, 0); assert.equal(s.bodies[0].vx, P.MAX_SHOT);
  assert(!P.shoot(s, 0, 100, 0)); settle(s); assert.equal(s.turn, 1); assert.equal(s.active, null);
}
console.log('PASS: trois formations symétriques, cinq pions + gardien jouable par camp, puissance plafonnée et alternance automatique');
{
  const s = clear(), p = s.bodies[0], b = s.bodies[P.BALL_ID], receiver = s.bodies[1];
  Object.assign(p, { x: 200, y: 600 }); Object.assign(b, { x: 200, y: 560 }); Object.assign(receiver, { x: 200, y: 445 });
  P.shoot(s, 0, 0, -500); settle(s);
  assert.equal(s.turn, 0); assert.equal(s.active, 1); assert.equal(s.passes[0], 1);
  assert(receiver.y > b.y && Math.abs(receiver.x - b.x) < 2, 'Pion → ballon → but adverse');
  assert(Math.abs(Math.hypot(receiver.x - b.x, receiver.y - b.y) - (receiver.r + b.r + P.PASS_GAP)) < 1.5, 'Petit espace devant le receveur');
  assert(!P.selectable(s, 0)); assert(P.selectable(s, 1));
  // Nouvelle passe avec le receveur actif ; l'enchaînement garde l'identité du joueur.
  Object.assign(s.bodies[2], { x: b.x, y: b.y - 100 });
  P.shoot(s, 1, 0, -450); settle(s);
  assert.equal(s.turn, 0); assert.equal(s.active, 2); assert.equal(s.passes[0], 2);
}
console.log('PASS: capture, rotation naturelle de 180°, petit espace, receveur actif et deux passes enchaînées');
{
  function reception(power) {
    let s = clear();
    Object.assign(s.bodies[0], { x: 200, y: 600 }); Object.assign(s.bodies[P.BALL_ID], { x: 200, y: 560 });
    Object.assign(s.bodies[1], { x: 200, y: 470 }); P.shoot(s, 0, 0, -power);
    let contact = null, coastEnd = null, saved = false;
    for (let i = 0; i < 1500 && s.phase === 'moving'; i++) {
      const oldStage = s.capture?.stage; P.step(s, P.STEP); integrity(s);
      if (s.capture?.stage === 'coast') {
        if (contact === null) {
          contact = s.bodies[1].y;
          assert(s.bodies[1].vy < -20, 'La passe transfère la vitesse au receveur');
          assert(s.bodies[0].vy < -20, 'Le tireur garde son inertie');
        }
        if (!saved) {
          const copy = JSON.parse(JSON.stringify(s)); s = P.restore(copy);
          assert.deepEqual(s, copy); saved = true;
        }
      }
      if (oldStage === 'coast' && s.capture?.stage === 'align') coastEnd = s.bodies[1].y;
    }
    assert.equal(s.phase, 'aim'); assert.equal(s.active, 1); assert.equal(s.turn, 0);
    assert(contact !== null && coastEnd !== null && saved);
    assert(s.bodies[1].y < contact - 20, 'Le receveur avance après le contact');
    assert(Math.abs(s.bodies[1].y - coastEnd) < 6, 'Le recalage conserve la position atteinte');
    return s.bodies[1].y;
  }
  const soft = reception(300), strong = reception(700);
  assert(strong < soft - 40, 'Une passe plus forte fait progresser davantage');
  const s = clear();
  Object.assign(s.bodies[0], { x: 200, y: 600 }); Object.assign(s.bodies[1], { x: 200, y: 520, vy: -60 });
  Object.assign(s.bodies[P.BALL_ID], { x: 220, y: 485, vy: -60 }); P.shoot(s, 0, 0, -700);
  s.action.receiver = 1; s.active = 1; s.passes[0] = 1;
  s.capture = { id: 1, stage: 'coast', coastQuiet: 0, x: 220, y: 485, elapsed: .1, orbit: 1.5 };
  let pushed = false;
  for (let i = 0; i < 80 && s.phase === 'moving'; i++) {
    P.step(s, P.STEP); integrity(s);
    if (Math.hypot(s.bodies[0].x - s.bodies[1].x, s.bodies[0].y - s.bodies[1].y) < 35 && s.bodies[1].vy < -100) pushed = true;
  }
  assert(pushed, 'Les collisions du tireur avec le receveur restent actives pendant la réception'); settle(s);
}
console.log('PASS: inertie conservée, poussée du receveur, avance liée à la puissance, recalage final et reprise pendant la réception');
{
  const s = clear(); Object.assign(s.bodies[P.BALL_ID], { x: 200, y: 308.8, vy: -6 });
  Object.assign(s.bodies[1], { x: 200, y: 285 });
  P.shoot(s, 0, 20, 0); settle(s);
  assert.equal(s.passes[0], 1); assert.equal(s.turn, 0); assert.equal(s.active, 1);
}
console.log('PASS: une passe très lente compte aussi, sans seuil de puissance');
{
  const s = clear(), p = s.bodies[0], b = s.bodies[P.BALL_ID];
  Object.assign(p, { x: 200, y: 440 }); Object.assign(b, { x: 200, y: 400 });
  Object.assign(s.bodies[5], { x: 200, y: 285 });
  P.shoot(s, 0, 0, -500); settle(s); assert.equal(s.turn, 1); assert.equal(s.passes[0], 0);
}
console.log('PASS: le contact avec l’adversaire ne prolonge pas le tour');
{
  const s = clear(), keeper = s.bodies[11], b = s.bodies[P.BALL_ID];
  keeper.x = 200;
  P.shoot(s, 0, 20, 0); Object.assign(b, { x: 200, y: 110, vy: -700 });
  let rebound = false;
  for (let i = 0; i < 120 && s.phase === 'moving'; i++) {
    P.step(s, P.STEP); integrity(s); if (b.vy > 30) rebound = true;
  }
  assert(rebound, 'Le gardien arrête un tir axial et renvoie le ballon');
  assert.deepEqual(s.scores, [0, 0]); settle(s);
}
{
  const s = clear(), keeper = s.bodies[10], b = s.bodies[P.BALL_ID];
  Object.assign(s.bodies[0], { x: 200, y: 440 }); Object.assign(b, { x: 200, y: 400 });
  Object.assign(keeper, { x: 200, y: 285 });
  P.shoot(s, 0, 0, -700); settle(s);
  assert.equal(s.active, keeper.id); assert.equal(s.turn, 0);
  assert(Math.abs(Math.hypot(keeper.x - b.x, keeper.y - b.y) - keeper.r - b.r - P.PASS_GAP) < 1.5);
  assert(!P.selectable(s, 0)); assert(P.selectable(s, keeper.id));
  assert(P.shoot(s, keeper.id, 100, -450), 'Le gardien receveur est jouable'); settle(s);
}
console.log('PASS: arrêt du gardien, rebond réel, réception avec espace et relance du gardien');
for (const [x, y, rx, ry] of [[200, 340, 200, 313], [42, 340, 65, 340], [90, 80, 113, 80], [310, 600, 287, 600]]) {
  const s = clear(); Object.assign(s.bodies[P.BALL_ID], { x, y }); Object.assign(s.bodies[1], { x: rx, y: ry });
  Object.assign(s.bodies[2], { x: 200, y: 540 });
  Object.assign(s.bodies[5], { x: x + 32, y: y + 25 });
  s.phase = 'moving'; s.active = 1; s.action = { shooter: 0, receiver: 1, elapsed: 0 };
  s.capture = { id: 1, stage: 'align', coastQuiet: 0, x, y, orbit: Math.atan2(ry - y, rx - x), elapsed: 0 };
  const blocker = { x: s.bodies[5].x, y: s.bodies[5].y };
  settle(s); assert.equal(s.turn, 0); assert.equal(s.active, 1);
  assert(Math.hypot(blocker.x - s.bodies[5].x, blocker.y - s.bodies[5].y) > 5, 'Un pion gênant doit être poussé physiquement');
  const b = s.bodies[P.BALL_ID], p = s.bodies[1]; assert(Math.hypot(p.x - b.x, p.y - b.y) > p.r + b.r);
}
console.log('PASS: receveur qui pousse les obstacles, réception près des murs et des coins sans téléportation ni blocage');
{
  const s = clear(), p = s.bodies[0], b = s.bodies[P.BALL_ID];
  Object.assign(p, { x: 200, y: 440 }); Object.assign(b, { x: 210, y: 400 });
  P.shoot(s, 0, 0, -500); let hit = false;
  for (let i = 0; i < 60 && s.phase === 'moving'; i++) { P.step(s, P.STEP); integrity(s); if (Math.abs(b.vx) > 60) hit = true; }
  assert(hit, 'Un contact latéral doit dévier le ballon'); assert(Math.abs(b.spin) > 0); settle(s);
}
console.log('PASS: contact décentré, déviation et rotation du ballon');
for (const [x, y, vx, vy] of [[80, 105, -1500, -1400], [320, 105, 1500, -1400], [80, 575, -1500, 1400], [320, 575, 1500, 1400], [45, 340, -1500, 0]]) {
  const s = clear(); P.shoot(s, 0, 20, 0); Object.assign(s.bodies[P.BALL_ID], { x, y, vx, vy });
  for (let i = 0; i < 12; i++) { P.step(s, .05); integrity(s); }
  settle(s);
}
console.log('PASS: rebonds dans les quatre coins arrondis, murs complets et tirs très rapides sans traversée');
{
  const s = clear(); P.shoot(s, 0, 20, 0); Object.assign(s.bodies[P.BALL_ID], { x: 200, y: F.top - 6, vx: 0, vy: 0 });
  P.step(s, P.STEP); assert.deepEqual(s.scores, [0, 0], 'Tout le ballon doit franchir la ligne');
  s.bodies[P.BALL_ID].vy = -100; P.step(s, .05); assert.deepEqual(s.scores, [1, 0]); assert.equal(s.phase, 'goal');
  const goalY = s.bodies[P.BALL_ID].y;
  assert(Math.abs(s.bodies[P.BALL_ID].vy) > 0, 'Un but ne coupe pas la vitesse');
  for (let i = 0; i < 8; i++) P.step(s, .05);
  assert(s.bodies[P.BALL_ID].y > goalY && s.bodies[P.BALL_ID].vy > 0, 'Le ballon rebondit sur le fond du but');
  assert.deepEqual(s.scores, [1, 0], 'Les rebonds ne comptent pas un deuxième but');
  for (let i = 0; i < 31; i++) P.step(s, .05);
  assert.equal(s.phase, 'goal', 'La célébration dure deux secondes');
  assert(s.goalTime < P.GOAL_DURATION);
  settle(s); assert.equal(s.turn, 0); assert.equal(s.bodies[P.BALL_ID].y, 340); assert.deepEqual(s.scores, [1, 0]);
  assert.equal(s.bodies[10].x, 200); assert.equal(s.bodies[11].x, 200);
  assert.deepEqual(s.bodies.slice(5, 10).map(p => ({ x: p.x, y: p.y })), P.formationPositions(s.formations[1], 1, true));
  for (let goal = 2; goal <= 3; goal++) {
    s.bodies[11].x = 234; s.turn = 0; s.active = null; P.shoot(s, 0, 20, 0);
    Object.assign(s.bodies[P.BALL_ID], { x: 200, y: F.top - 9, vx: 0, vy: -30 }); P.step(s, P.STEP); settle(s);
    assert.equal(s.scores[0], goal);
  }
  assert.equal(s.phase, 'finished'); assert.equal(s.winner, 0); assert(!P.shoot(s, 0, 0, -500));
}
console.log('PASS: ligne complètement franchie, remise au centre, formations conservées, engagement du marqueur et victoire à trois');
{
  const s = clear(); P.shoot(s, 0, 20, 0);
  Object.assign(s.bodies[P.BALL_ID], { x: 200, y: F.bottom + 9, vy: 70 }); P.step(s, P.STEP);
  assert.equal(s.scorer, 1); assert.deepEqual(s.scores, [0, 1]);
  assert(Math.abs(s.bodies[P.BALL_ID].vy) > 0);
  settle(s); assert.equal(s.turn, 1);
  assert.deepEqual(s.bodies.slice(0, 5).map(p => ({ x: p.x, y: p.y })), P.formationPositions(s.formations[0], 0, true));
  assert.deepEqual(s.bodies.slice(5, 10).map(p => ({ x: p.x, y: p.y })), P.formationPositions(s.formations[1], 1));
}
{
  const modern = clear(); modern.scores = [1, 2]; modern.moves = [6, 4]; modern.passes = [2, 1];
  // Ancienne réception sauvegardée, avec un pion déjà devant l'emplacement du gardien.
  Object.assign(modern.bodies[0], { x: 200, y: F.bottom - 2 });
  modern.turn = 1; modern.active = 6;
  const legacy = JSON.parse(JSON.stringify(modern));
  legacy.version = 1;
  legacy.bodies = [...legacy.bodies.slice(0, 10), { ...legacy.bodies[P.BALL_ID], id: 10 }];
  for (const phase of ['aim', 'moving', 'goal', 'finished']) {
    const old = JSON.parse(JSON.stringify(legacy)); old.phase = phase;
    if (phase === 'moving') {
      old.action = { shooter: 5, receiver: 6, elapsed: .8 };
      Object.assign(old.bodies[10], { x: 200, y: 310, vx: 12, vy: -30 });
      old.capture = { id: 6, x: 200, y: 310, elapsed: .5, orbit: 1.2 };
    }
    if (phase === 'goal') { old.scorer = 1; old.goalTime = .4; }
    if (phase === 'finished') { old.scores[1] = 3; old.winner = 1; }
    const restored = P.restore(old);
    assert(restored); assert.equal(restored.version, 3); assert.equal(restored.bodies.length, 13);
    assert.deepEqual(restored.scores, old.scores); assert.deepEqual(restored.moves, old.moves);
    assert.equal(restored.active, 6); assert.equal(restored.turn, 1);
    assert.deepEqual(restored.bodies.slice(0, 10), old.bodies.slice(0, 10));
    assert.deepEqual(restored.bodies[P.BALL_ID], { ...old.bodies[10], id: P.BALL_ID });
    assert.deepEqual(restored.action, old.action); assert.deepEqual(restored.capture, old.capture ? { ...old.capture, stage: 'align', coastQuiet: 0 } : null);
    assert.notEqual(restored.bodies[10].x, 200, 'Le nouveau gardien évite le pion sauvegardé');
    for (const keeper of restored.bodies.filter(P.isKeeper)) {
      assert(P.canStand(keeper.x, keeper.y, keeper.r));
      assert(restored.bodies.every(p => p === keeper || Math.hypot(p.x - keeper.x, p.y - keeper.y) >= p.r + keeper.r));
    }
    assert(P.restore(JSON.parse(JSON.stringify(restored))));
  }
  const corrupt = P.create(undefined, 0); corrupt.bodies[11].team = 0; assert.equal(P.restore(corrupt), null);
}
console.log('PASS: sauvegardes v1 migrées sans perte, gardiens ajoutés sans chevauchement, états v3 validés');
{
  const old = clear(); old.version = 2; old.scores = [1, 2];
  old.phase = 'moving'; old.active = 1; old.action = { shooter: 0, receiver: 1, elapsed: 1 };
  old.capture = { id: 1, x: 200, y: 340, elapsed: .5, orbit: 1.2 };
  const updated = P.restore(old);
  assert.equal(updated.version, 3); assert.equal(updated.capture.stage, 'align');
  assert.deepEqual(updated.bodies, old.bodies); assert.deepEqual(updated.scores, old.scores);
  assert.deepEqual(updated.action, old.action);
}
{
  let seed = 22; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const s = P.create(undefined, 0);
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

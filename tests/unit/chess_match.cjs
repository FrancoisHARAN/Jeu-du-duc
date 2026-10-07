const assert = require('node:assert/strict');
const { Chess } = require('../../vendor/chess/chess.js');
const C = require('../../scripts/core/chess-match.js');
const people = [
  { name: 'François', label: 'François', kind: 'account', id: 'user-f' },
  { name: 'François', label: 'François (invité)', kind: 'guest', id: 'guest-f' },
];
const create = (fen) => C.create(people, 5, 0, 1000, fen);
const move = (s, from, to, promotion, now = 1000) => {
  const result = C.move(s, from, to, promotion, now);
  assert(result, `${from}-${to}`);
  return result;
};
assert.equal(new Chess().perft(3), 8902);
assert.equal(
  new Chess('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1').perft(2),
  2039
);
for (const minutes of C.MINUTES) {
  for (const first of [0, 1]) {
    const s = C.create(people, minutes, first, 1000);
    assert.equal(s.players[0].id, people[first].id);
    assert.equal(s.game.turn(), 'w');
    assert.deepEqual(s.remaining, { w: minutes * 60000, b: minutes * 60000 });
  }
}
{
  const random = Math.random;
  try {
    Math.random = () => 0.1;
    assert.equal(C.create(people).players[0].id, 'user-f');
    Math.random = () => 0.9;
    assert.equal(C.create(people).players[0].id, 'guest-f');
  } finally {
    Math.random = random;
  }
}
{
  const s = create();
  const fen = s.game.fen();
  assert.equal(C.move(s, 'e2', 'e5', undefined, 2000), null);
  assert.equal(s.game.fen(), fen);
  assert.deepEqual(s.remaining, { w: 299000, b: 300000 });
  move(s, 'e2', 'e4', undefined, 2500);
  C.sync(s, 3500);
  assert.deepEqual(s.remaining, { w: 298500, b: 299000 });
  C.pause(s, 4000);
  C.sync(s, 30000);
  assert.equal(s.remaining.b, 298500);
  const restored = C.restore(C.snapshot(s, 30000), 35000);
  assert(restored);
  assert.deepEqual(restored.game.fen(), s.game.fen());
  C.resume(restored, 40000);
  C.sync(restored, 41500);
  assert.equal(restored.remaining.b, 297000);
  C.sync(restored, 40000);
  assert.equal(restored.remaining.b, 297000);
  const live = C.restore(C.snapshot(restored, 41500), 43000);
  assert.equal(live.remaining.b, 295500);
}
console.log(
  'PASS: attribution aléatoire des blancs, quatre cadences, coups invalides, alternance des horloges et reprise précise'
);
{
  const s = create('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  move(s, 'e1', 'g1');
  assert.equal(s.game.get('f1').type, 'r');
  assert.equal(s.game.get('h1'), undefined);
  move(s, 'e8', 'c8');
  assert.equal(s.game.get('d8').type, 'r');
  assert.equal(s.game.get('a8'), undefined);
  const attacked = create('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1');
  assert.equal(
    C.move(attacked, 'e1', 'g1', undefined, 1000),
    null,
    'Pas de roque à travers une case attaquée'
  );
  const rights = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  for (const m of ['Ke2', 'Ke7', 'Ke1', 'Ke8']) rights.move(m);
  assert(
    !rights.moves().includes('O-O') && !rights.moves().includes('O-O-O'),
    'Un roi déplacé ne retrouve pas le droit au roque'
  );
}
{
  const s = create();
  for (const [a, b] of [
    ['e2', 'e4'],
    ['a7', 'a6'],
    ['e4', 'e5'],
    ['d7', 'd5'],
  ])
    move(s, a, b);
  move(s, 'e5', 'd6');
  assert.equal(s.game.get('d5'), undefined);
  assert.equal(s.game.get('d6').color, 'w');
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const p = create('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    assert.equal(C.move(p, 'a7', 'a8', undefined, 1000), null, 'La promotion doit être choisie');
    move(p, 'a7', 'a8', promotion);
    assert.equal(p.game.get('a8').type, promotion);
  }
  const pinned = create('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
  assert.equal(
    C.move(pinned, 'e2', 'd2', undefined, 1000),
    null,
    'Le roi ne peut pas être laissé en échec'
  );
}
console.log(
  'PASS: deux roques, perte des droits, cases attaquées, prise en passant, quatre promotions et pièces clouées'
);
{
  const s = create();
  for (const [a, b] of [
    ['f2', 'f3'],
    ['e7', 'e5'],
    ['g2', 'g4'],
    ['d8', 'h4'],
  ])
    move(s, a, b);
  assert.deepEqual(s.result, { kind: 'mate', winner: 'b' });
  assert(!s.running);
  assert.equal(C.move(s, 'e2', 'e4'), null);
  assert.equal(create('7k/5Q2/5K2/8/8/8/8/8 b - - 0 1').result.kind, 'stalemate');
  assert.equal(create('4k3/8/8/8/8/8/8/4K3 w - - 0 1').result.kind, 'material');
  const fifty = create('4k3/8/8/8/8/8/8/R3K3 w - - 99 51');
  move(fifty, 'a1', 'a2');
  assert.equal(fifty.result.kind, 'fifty');
  let repetition = create();
  for (const [a, b] of [
    ['g1', 'f3'],
    ['g8', 'f6'],
    ['f3', 'g1'],
    ['f6', 'g8'],
  ])
    move(repetition, a, b);
  C.pause(repetition, 1000);
  repetition = C.restore(C.snapshot(repetition, 1000), 1000);
  C.resume(repetition, 1000);
  for (const [a, b] of [
    ['g1', 'f3'],
    ['g8', 'f6'],
    ['f3', 'g1'],
    ['f6', 'g8'],
  ])
    move(repetition, a, b);
  assert.equal(repetition.result.kind, 'repetition');
  assert.equal(C.restore(C.snapshot(repetition, 1000), 1000).result.kind, 'repetition');
}
{
  const s = create();
  s.remaining.w = 1;
  C.sync(s, 1002);
  assert.deepEqual(s.result, { kind: 'timeout', winner: 'b' });
  const noMate = create('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1');
  noMate.remaining.w = 1;
  C.sync(noMate, 1002);
  assert.deepEqual(
    noMate.result,
    { kind: 'timeout', winner: null },
    'Un roi seul ne peut pas gagner au temps'
  );
  const r = create();
  C.resign(r, 1000);
  assert.equal(r.result.winner, 'b');
  const d = create();
  C.agreeDraw(d, 1000);
  assert.equal(d.result.kind, 'agreement');
  const corrupt = C.snapshot(create(), 1000);
  corrupt.moves = [{ from: 'a1', to: 'a8' }];
  assert.equal(C.restore(corrupt, 1000), null);
  const badClock = C.snapshot(create(), 1000);
  badClock.remaining.b = Infinity;
  assert.equal(C.restore(badClock, 1000), null);
}
console.log(
  'PASS: mat, pat, matériel insuffisant, répétition après reprise, 50 coups, temps écoulé, abandon et sauvegardes invalides'
);

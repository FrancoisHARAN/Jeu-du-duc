const assert = require('node:assert/strict');
const B = require('../../scripts/core/duel-ball.js');
const P = require('../../scripts/core/duel-physics.js');
const near = (a, b) => assert(Math.abs(a - b) < 1e-9);
const start = B.project(B.rotation());
for (const axis of [
  [1, 0],
  [0, 1],
  [3, -4],
]) {
  const q = B.rotation(),
    distance = Math.hypot(...axis);
  B.roll(q, axis[0], axis[1], 0, P.BALL_RADIUS);
  assert.notDeepEqual(B.project(q), start, 'Les faces roulent même sans rotation de disque');
  B.roll(q, -axis[0], -axis[1], 0, P.BALL_RADIUS);
  q.forEach((v, i) => near(v, i === 3 ? 1 : 0));
  B.roll(
    q,
    (axis[0] / distance) * Math.PI * 2 * P.BALL_RADIUS,
    (axis[1] / distance) * Math.PI * 2 * P.BALL_RADIUS,
    0,
    P.BALL_RADIUS
  );
  near(Math.abs(q[3]), 1);
}
const q = B.rotation();
for (let i = 0; i < 300; i++) {
  B.roll(q, Math.sin(i) * 3, Math.cos(i) * 3, 0.1, P.BALL_RADIUS);
  assert(B.valid(q));
  const panels = B.project(q);
  assert(panels.some((p) => p.black) && panels.some((p) => !p.black));
  let area = 0;
  for (const panel of panels) {
    assert(panel.points.every((p) => p[2] >= -1e-9 && Math.abs(Math.hypot(...p) - 1) < 1e-9));
    area +=
      Math.abs(
        panel.points.reduce((sum, p, j) => {
          const next = panel.points[(j + 1) % panel.points.length];
          return sum + p[0] * next[1] - p[1] * next[0];
        }, 0)
      ) / 2;
  }
  assert(
    Math.abs(area - Math.PI) < 0.025,
    'Les faces couvrent la sphère, sans panneaux derrière ni trous au bord'
  );
}
const state = P.create(),
  copy = JSON.parse(JSON.stringify(state));
B.roll(q, 12, -4, 0.5, state.bodies[P.BALL_ID].r);
assert.deepEqual(state, copy, 'La rotation visuelle ne change ni la physique ni le score');
assert(B.valid(JSON.parse(JSON.stringify(q))));
assert(!B.valid([0, 0, NaN, 1]));
assert(!B.valid([0, 0, 0, 2]));
console.log(
  'PASS: sphère couverte, roulement dans toutes les directions, rebond, rotation et reprise sans modifier la physique'
);

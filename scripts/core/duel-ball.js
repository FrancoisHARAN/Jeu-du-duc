/* Ballon à 32 panneaux sur une sphère : Canvas 2D, sans texture ni WebGL. */
(function (global) {
  'use strict';
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => { const d = Math.hypot(...a); return a.map(v => v / d); };
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const phi = (1 + Math.sqrt(5)) / 2, vertices = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) {
    vertices.push(unit([0, a, b]), unit([a, b, 0]), unit([b, 0, a]));
  }
  const neighbors = vertices.map(v => vertices.map((p, i) => dot(v, p) > .44 && dot(v, p) < .45 ? i : -1).filter(i => i >= 0));
  const edge = (a, b) => unit(mix(vertices[a], vertices[b], 1 / 3));
  function face(points, black) {
    const normal = cross(points[1].map((v, i) => v - points[0][i]),
      points[2].map((v, i) => v - points[0][i]));
    if (dot(normal, points[0]) < 0) points.reverse();
    // Les arêtes suivent la courbure, même près du bord de la sphère.
    const curved = points.flatMap((p, i) => [0, .25, .5, .75].map(t => unit(mix(p, points[(i + 1) % points.length], t))));
    return { black, points: curved };
  }
  const panels = vertices.map((v, a) => {
    const right = unit(cross(v, Math.abs(v[2]) < .9 ? [0, 0, 1] : [0, 1, 0])), up = cross(v, right);
    return face(neighbors[a].map(b => edge(a, b)).sort((p, q) => Math.atan2(dot(p, up), dot(p, right)) - Math.atan2(dot(q, up), dot(q, right))), true);
  });
  for (let a = 0; a < 12; a++) for (const b of neighbors[a]) for (const c of neighbors[b]) {
    if (a < b && b < c && neighbors[a].includes(c))
      panels.push(face([edge(a, b), edge(b, a), edge(b, c), edge(c, b), edge(c, a), edge(a, c)], false));
  }
  function valid(q) { return Array.isArray(q) && q.length === 4 && q.every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) < .01; }
  function rotation(angle = 0) { return [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]; }
  function turn(q, x, y, z, angle) {
    const d = Math.hypot(x, y, z);
    if (d < 1e-9 || Math.abs(angle) < 1e-9) return;
    const a = Math.sin(angle / 2) / d, w = Math.cos(angle / 2), [qx, qy, qz, qw] = q;
    x *= a; y *= a; z *= a;
    q[0] = w * qx + x * qw + y * qz - z * qy;
    q[1] = w * qy - x * qz + y * qw + z * qx;
    q[2] = w * qz + x * qy - y * qx + z * qw;
    q[3] = w * qw - x * qx - y * qy - z * qz;
    const norm = Math.hypot(...q); for (let i = 0; i < 4; i++) q[i] /= norm;
  }
  function roll(q, dx, dy, spin, radius) {
    turn(q, -dy, dx, 0, Math.hypot(dx, dy) / radius);
    turn(q, 0, 0, 1, spin);
  }
  function project(q) {
    const [x, y, z, w] = q;
    const m = [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
    const rotate = p => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
      m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
    return panels.map(panel => {
      const points = panel.points.map(rotate), visible = [];
      points.forEach((p, i) => {
        const next = points[(i + 1) % points.length];
        if (p[2] >= 0) visible.push(p);
        if ((p[2] >= 0) !== (next[2] >= 0)) visible.push(unit(mix(p, next, p[2] / (p[2] - next[2]))));
      });
      const curved = [];
      visible.forEach((p, i) => {
        curved.push(p);
        const next = visible[(i + 1) % visible.length];
        if (Math.abs(p[2]) < 1e-8 && Math.abs(next[2]) < 1e-8) {
          const angle = Math.atan2(p[1], p[0]), end = Math.atan2(next[1], next[0]);
          const delta = Math.atan2(Math.sin(end - angle), Math.cos(end - angle)), steps = Math.ceil(Math.abs(delta) / .1);
          for (let j = 1; j < steps; j++) curved.push([Math.cos(angle + delta * j / steps), Math.sin(angle + delta * j / steps), 0]);
        }
      });
      return { black: panel.black, points: curved };
    }).filter(panel => panel.points.length >= 3);
  }
  function draw(ctx, ball, q, border = 1.4) {
    ctx.save(); ctx.translate(ball.x, ball.y); ctx.scale(ball.r, ball.r);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#fff9e9'; ctx.fillRect(-1, -1, 2, 2);
    for (const panel of project(q)) {
      ctx.beginPath(); panel.points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
      ctx.fillStyle = panel.black ? '#252124' : '#fff9e9'; ctx.fill();
      ctx.strokeStyle = '#8c8780'; ctx.lineWidth = .035; ctx.stroke();
    }
    // Éclairage fixe ; les panneaux roulent sous la brillance et l'ombre.
    const light = ctx.createRadialGradient(-.35, -.4, .05, .12, .18, 1.1);
    light.addColorStop(0, 'rgba(255,255,255,.45)'); light.addColorStop(.5, 'rgba(255,255,255,.04)'); light.addColorStop(1, 'rgba(37,33,36,.55)');
    ctx.fillStyle = light; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.strokeStyle = '#252124'; ctx.lineWidth = border; ctx.stroke();
  }
  const api = { rotation, valid, roll, project, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.JDDDuelBall = api;
})(typeof window !== 'undefined' ? window : globalThis);

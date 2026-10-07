/* Disques rigides, pas fixes et sous-pas adaptatifs : indépendant du rendu. */
(function (global) {
  'use strict';
  const FIELD = Object.freeze({ width: 400, height: 680, left: 16, right: 384,
    top: 38, bottom: 642, corner: 56, goalLeft: 139, goalRight: 261, goalDepth: 30, goalLineWidth: 2, wall: 3 });
  const FORMATIONS = ['1-2-2', '2-1-2', '2-2-1'];
  const PUCK_RADIUS = 15, KEEPER_RADIUS = 20, BALL_RADIUS = 8, BALL_ID = 12;
  const PASS_GAP = 8, BALL_BORDER = 1.4, GOAL_DURATION = 2, MAX_SHOT = 720, STEP = 1 / 120;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const length = b => Math.hypot(b.vx, b.vy);
  const ball = s => s.bodies[BALL_ID];
  const isKeeper = p => p.team !== null && p.id === 10 + p.team;
  const walls = [
    [FIELD.left, FIELD.top + FIELD.corner, FIELD.left, FIELD.bottom - FIELD.corner],
    [FIELD.right, FIELD.top + FIELD.corner, FIELD.right, FIELD.bottom - FIELD.corner],
  ];
  for (const y of [FIELD.top, FIELD.bottom]) {
    walls.push([FIELD.left + FIELD.corner, y, FIELD.goalLeft, y], [FIELD.goalRight, y, FIELD.right - FIELD.corner, y]);
    const back = y === FIELD.top ? y - FIELD.goalDepth : y + FIELD.goalDepth;
    walls.push([FIELD.goalLeft, y, FIELD.goalLeft, back], [FIELD.goalRight, y, FIELD.goalRight, back], [FIELD.goalLeft, back, FIELD.goalRight, back]);
  }
  const corners = [[FIELD.left + FIELD.corner, FIELD.top + FIELD.corner, -1, -1],
    [FIELD.right - FIELD.corner, FIELD.top + FIELD.corner, 1, -1],
    [FIELD.left + FIELD.corner, FIELD.bottom - FIELD.corner, -1, 1],
    [FIELD.right - FIELD.corner, FIELD.bottom - FIELD.corner, 1, 1]];
  function body(id, team, x, y) {
    const keeper = team !== null && id === 10 + team;
    const r = team === null ? BALL_RADIUS : keeper ? KEEPER_RADIUS : PUCK_RADIUS;
    const mass = team === null ? .45 : keeper ? 2.7 : 1.6;
    return { id, team, x, y, vx: 0, vy: 0, r, mass, angle: 0, spin: 0 };
  }
  function goalkeeper(team) { return body(10 + team, team, 200, team ? FIELD.top + 2 : FIELD.bottom - 2); }
  function formationPositions(formation, team, defending = false) {
    const counts = (FORMATIONS.includes(formation) ? formation : FORMATIONS[0]).split('-').map(Number);
    const result = [];
    counts.forEach((count, row) => {
      for (let col = 0; col < count; col++) {
        const spread = defending ? 96 : 148;
        const x = count === 1 ? 200 : 200 - spread / 2 + col * spread;
        const y = FIELD.top + (FIELD.bottom - FIELD.top) * (defending ? [.89, .79, .68] : [.85, .71, .565])[row];
        result.push({ x: team ? 400 - x : x, y: team ? 680 - y : y });
      }
    });
    return result;
  }
  function reset(s, team = s.turn) {
    s.bodies = [];
    s.formations.forEach((formation, t) => formationPositions(formation, t, t !== team).forEach((p, i) => s.bodies.push(body(t * 5 + i, t, p.x, p.y))));
    s.bodies.push(goalkeeper(0), goalkeeper(1), body(BALL_ID, null, 200, 340));
    s.turn = team; s.active = null; s.action = null; s.capture = null; s.quiet = 0; s.phase = 'aim';
  }
  function create(formations = FORMATIONS.slice(0, 2), starter = Math.random() < .5 ? 0 : 1) {
    const s = { version: 3, formations: [0, 1].map(i => FORMATIONS.includes(formations[i]) ? formations[i] : FORMATIONS[0]),
      scores: [0, 0], turn: starter === 1 ? 1 : 0, phase: 'aim', active: null,
      action: null, capture: null, quiet: 0, moves: [0, 0], passes: [0, 0], goalTime: 0, winner: null, serial: 0 };
    reset(s); return s;
  }
  function selectable(s, id) {
    return s.phase === 'aim' && s.bodies[id]?.team === s.turn && (s.active === null || s.active === id);
  }
  function shoot(s, id, vx, vy) {
    if (!selectable(s, id) || !Number.isFinite(vx) || !Number.isFinite(vy) || Math.hypot(vx, vy) < 12) return false;
    const p = s.bodies[id], ratio = Math.min(1, MAX_SHOT / Math.hypot(vx, vy));
    p.vx = vx * ratio; p.vy = vy * ratio;
    s.phase = 'moving'; s.active = id; s.capture = null; s.quiet = 0;
    s.action = { shooter: id, receiver: null, elapsed: 0 }; s.moves[s.turn]++; s.serial++;
    return true;
  }
  function bounce(p, nx, ny, restitution) {
    const v = p.vx * nx + p.vy * ny;
    if (v >= 0) return;
    p.vx -= (1 + restitution) * v * nx; p.vy -= (1 + restitution) * v * ny;
    const tangent = -p.vx * ny + p.vy * nx;
    p.spin += tangent * .06 / p.r;
  }
  function contain(p) {
    // La boîte extérieure sert aussi de garde contre un état sauvegardé invalide.
    if (p.x < FIELD.left + p.r + FIELD.wall) bounce(p, 1, 0, .86);
    if (p.x > FIELD.right - p.r - FIELD.wall) bounce(p, -1, 0, .86);
    if (p.y < FIELD.top - FIELD.goalDepth + p.r + FIELD.wall) bounce(p, 0, 1, .86);
    if (p.y > FIELD.bottom + FIELD.goalDepth - p.r - FIELD.wall) bounce(p, 0, -1, .86);
    p.x = clamp(p.x, FIELD.left + p.r + FIELD.wall, FIELD.right - p.r - FIELD.wall);
    p.y = clamp(p.y, FIELD.top - FIELD.goalDepth + p.r + FIELD.wall, FIELD.bottom + FIELD.goalDepth - p.r - FIELD.wall);
    if ((p.x < FIELD.goalLeft || p.x > FIELD.goalRight) && p.y < FIELD.top) { p.y = FIELD.top + p.r + FIELD.wall; bounce(p, 0, 1, .85); }
    if ((p.x < FIELD.goalLeft || p.x > FIELD.goalRight) && p.y > FIELD.bottom) { p.y = FIELD.bottom - p.r - FIELD.wall; bounce(p, 0, -1, .85); }
    for (const [x1, y1, x2, y2] of walls) {
      const dx = x2 - x1, dy = y2 - y1;
      const t = clamp(((p.x - x1) * dx + (p.y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
      const px = p.x - x1 - dx * t, py = p.y - y1 - dy * t, d = Math.hypot(px, py), min = p.r + FIELD.wall;
      if (d < min) {
        const nx = d > 1e-7 ? px / d : (x1 === FIELD.right || x1 === FIELD.goalRight ? -1 : 1);
        const ny = d > 1e-7 ? py / d : 0;
        p.x += nx * (min - d); p.y += ny * (min - d); bounce(p, nx, ny, .86);
      }
    }
    for (const [cx, cy, sx, sy] of corners) {
      if ((p.x - cx) * sx <= 0 || (p.y - cy) * sy <= 0) continue;
      const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), limit = FIELD.corner - p.r - FIELD.wall;
      if (d > limit) {
        p.x = cx + dx * limit / d; p.y = cy + dy * limit / d;
        bounce(p, -dx / d, -dy / d, .86);
      }
    }
  }
  function collide(a, b, impulse = true, fixedBall = false) {
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    const min = a.r + b.r;
    if (d >= min) return 0;
    if (d < 1e-7) { dx = 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d, ia = 1 / a.mass, ib = fixedBall && b.team === null ? 0 : 1 / b.mass, inv = ia + ib;
    const overlap = min - d;
    a.x -= nx * overlap * ia / inv; a.y -= ny * overlap * ia / inv;
    b.x += nx * overlap * ib / inv; b.y += ny * overlap * ib / inv;
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy, impact = -(rvx * nx + rvy * ny);
    if (impulse && impact > 0) {
      const j = (1 + (a.team === null || b.team === null ? .88 : .8)) * impact / inv;
      a.vx -= j * nx * ia; a.vy -= j * ny * ia; b.vx += j * nx * ib; b.vy += j * ny * ib;
      // Impulsion tangentielle : les contacts décentrés conservent leur angle et leur rotation.
      const tangent = -rvx * ny + rvy * nx - a.spin * a.r - b.spin * b.r;
      const jt = clamp(-tangent / (3 * inv), -j * .12, j * .12);
      a.vx -= jt * -ny * ia; a.vy -= jt * nx * ia; b.vx += jt * -ny * ib; b.vy += jt * nx * ib;
      a.spin -= 2 * jt * ia / a.r; b.spin -= 2 * jt * ib / b.r;
    }
    return impact;
  }
  function pass(s, receiver) {
    const b = ball(s);
    s.action.receiver = receiver.id; s.active = receiver.id; s.passes[s.turn]++; s.serial++;
    const anchor = body(BALL_ID, null, b.x, b.y); contain(anchor);
    s.capture = { id: receiver.id, stage: 'coast', coastQuiet: 0, x: anchor.x, y: anchor.y,
      elapsed: 0, orbit: Math.atan2(receiver.y - b.y, receiver.x - b.x) };
  }
  function canStand(x, y, r) {
    const p = body(0, 0, x, y); p.r = r; contain(p);
    return Math.hypot(p.x - x, p.y - y) < .05;
  }
  function force(p, x, y, stiffness, damping, max, dt) {
    let ax = (x - p.x) * stiffness - p.vx * damping, ay = (y - p.y) * stiffness - p.vy * damping;
    const ratio = Math.min(1, max / Math.max(.001, Math.hypot(ax, ay)));
    p.vx += ax * ratio * dt; p.vy += ay * ratio * dt;
  }
  function magnet(s, dt) {
    const c = s.capture, p = s.bodies[c.id], b = ball(s), gap = p.r + b.r + PASS_GAP;
    c.elapsed += dt;
    if (c.stage === 'coast') {
      // Liaison souple, sans ancrage au terrain : l'impulsion totale est conservée.
      // Le tireur peut encore pousser le receveur pendant les rebonds de la passe.
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d > gap && c.elapsed > .06) {
        const nx = dx / d, ny = dy / d;
        const relative = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
        const impulse = clamp((d - gap) * 55 + relative * 6, 0, 900) * dt;
        b.vx -= nx * impulse / b.mass; b.vy -= ny * impulse / b.mass;
        p.vx += nx * impulse / p.mass; p.vy += ny * impulse / p.mass;
      }
      c.coastQuiet = s.bodies.every(body => length(body) < 4) ? c.coastQuiet + dt : 0;
      if (c.coastQuiet < .12) return false;
      // Le ballon reste à l'endroit où la passe s'est arrêtée. Seul le receveur
      // tourne autour de lui : aucune amélioration artificielle de la position.
      c.x = b.x; c.y = b.y; c.stage = 'align'; c.elapsed = 0;
      c.orbit = Math.atan2(p.y - b.y, p.x - b.x);
      s.serial++;
    }
    c.x = b.x; c.y = b.y; b.vx = b.vy = b.spin = 0;
    const goalY = s.turn === 0 ? FIELD.top : FIELD.bottom;
    let ideal = Math.atan2(b.y - goalY, b.x - 200);
    // Près d'un mur, choisir l'angle réalisable le plus proche de l'axe du but.
    for (const offset of [0, .25, -.25, .5, -.5, .8, -.8, 1.2, -1.2, 1.6, -1.6, 2, -2, Math.PI]) {
      if (canStand(b.x + Math.cos(ideal + offset) * gap, b.y + Math.sin(ideal + offset) * gap, p.r)) { ideal += offset; break; }
    }
    const current = Math.atan2(p.y - b.y, p.x - b.x);
    const difference = Math.atan2(Math.sin(ideal - current), Math.cos(ideal - current));
    const orbitDifference = Math.atan2(Math.sin(ideal - c.orbit), Math.cos(ideal - c.orbit));
    c.orbit += clamp(orbitDifference, -2.8 * dt, 2.8 * dt);
    force(p, b.x + Math.cos(c.orbit) * gap, b.y + Math.sin(c.orbit) * gap, 190, 23, 1200, dt);
    // Les autres disques restent dynamiques : le receveur les pousse, sans les traverser.
    return Math.abs(difference) < .065 && Math.abs(Math.hypot(p.x - b.x, p.y - b.y) - gap) < 1.3;
  }
  function goal(s, scorer) {
    s.scores[scorer]++; s.scorer = scorer; s.phase = 'goal'; s.goalTime = 0;
    s.capture = null; s.action = null; s.serial++;
    if (s.scores[scorer] >= 3) s.winner = scorer;
  }
  function integrate(s, dt) {
    const playing = s.phase === 'moving';
    const aligned = playing && s.capture ? magnet(s, dt) : true;
    const fixedBall = playing && s.capture?.stage === 'align';
    for (const p of s.bodies) {
      if (fixedBall && p.team === null) continue;
      const speed = length(p), decay = Math.exp(-(p.team === null ? 1.15 : 1.4) * dt);
      const drag = Math.max(0, speed * decay - (p.team === null ? 9 : 13) * dt) / Math.max(.001, speed);
      p.vx *= drag; p.vy *= drag;
      const cap = Math.min(1, 1600 / Math.max(1, length(p))); p.vx *= cap; p.vy *= cap;
      p.x += p.vx * dt; p.y += p.vy * dt; p.angle += p.spin * dt; p.spin *= Math.exp(-2 * dt);
      contain(p);
    }
    for (let iteration = 0; iteration < 10; iteration++) {
      for (let i = 0; i < s.bodies.length; i++) for (let j = i + 1; j < s.bodies.length; j++) {
        const a = s.bodies[i], b = s.bodies[j], impact = collide(a, b, iteration === 0, fixedBall);
        if (playing && iteration === 0 && impact > .001 && b.team === null && a.team === s.turn
          && a.id !== s.action.shooter && s.action.receiver === null) pass(s, a);
      }
      s.bodies.forEach(contain);
    }
    if (!playing) return;
    const b = ball(s);
    // Tout le ballon visible doit dépasser le bord extérieur de la ligne peinte.
    const edge = b.r + BALL_BORDER / 2, lineHalf = FIELD.goalLineWidth / 2;
    if (b.x - edge > FIELD.goalLeft && b.x + edge < FIELD.goalRight) {
      if (b.y + edge < FIELD.top - lineHalf - 1e-7) { goal(s, 0); return; }
      if (b.y - edge > FIELD.bottom + lineHalf + 1e-7) { goal(s, 1); return; }
    }
    s.action.elapsed += dt;
    const still = s.bodies.every(p => length(p) < 4);
    const ready = !s.capture || (s.capture.stage === 'align' && (aligned || s.capture.elapsed > 2.8));
    s.quiet = still && ready ? s.quiet + dt : 0;
    if (s.quiet > .16) {
      s.bodies.forEach(p => { p.vx = p.vy = p.spin = 0; });
      if (s.action.receiver === null) { s.turn = 1 - s.turn; s.active = null; }
      else s.active = s.action.receiver;
      s.phase = 'aim'; s.action = null; s.capture = null; s.quiet = 0; s.serial++;
    }
  }
  function step(s, dt) {
    dt = clamp(Number(dt) || 0, 0, .05);
    if (!['moving', 'goal'].includes(s.phase)) return;
    // Aucun déplacement n'atteint le rayon du ballon, même à la puissance maximale.
    let remaining = dt;
    while (remaining > 1e-7 && ['moving', 'goal'].includes(s.phase)) {
      // Recalculer après chaque collision, qui peut accélérer le petit ballon.
      const speed = Math.max(1, ...s.bodies.map(length));
      const slice = Math.min(remaining, STEP, 3 / (speed + 24));
      const celebrating = s.phase === 'goal';
      integrate(s, slice); remaining -= slice;
      if (celebrating) {
        s.goalTime += slice;
        if (s.goalTime + 1e-7 >= GOAL_DURATION) {
          if (s.winner !== null) {
            s.phase = 'finished'; s.bodies.forEach(p => { p.vx = p.vy = p.spin = 0; });
          } else reset(s, 1 - s.scorer);
          s.serial++;
        }
      }
    }
  }
  function restore(raw) {
    const legacy = raw?.version === 1, count = legacy ? 11 : 13;
    if (!raw || ![1, 2, 3].includes(raw.version) || !['aim', 'moving', 'goal', 'finished'].includes(raw.phase)
      || ![0, 1].includes(raw.turn) || !Array.isArray(raw.formations) || raw.formations.length !== 2
      || raw.formations.some(f => !FORMATIONS.includes(f)) || !Array.isArray(raw.scores) || raw.scores.length !== 2
      || raw.scores.some(n => !Number.isInteger(n) || n < 0 || n > 3) || !Array.isArray(raw.bodies) || raw.bodies.length !== count) return null;
    for (let i = 0; i < count; i++) {
      const p = raw.bodies[i], team = i === count - 1 ? null : i < 10 ? Math.floor(i / 5) : i - 10;
      const expected = body(i, team, 0, 0);
      if (!p || p.id !== i || p.team !== team
        || ['x', 'y', 'vx', 'vy', 'r', 'mass', 'angle', 'spin'].some(k => !Number.isFinite(p[k]))
        || p.r !== expected.r || p.mass !== expected.mass
        || p.x < 0 || p.x > 400 || p.y < 0 || p.y > 680 || length(p) > 1600.01) return null;
    }
    if (!Number.isInteger(raw.serial) || !Array.isArray(raw.moves) || !Array.isArray(raw.passes)
      || raw.moves.length !== 2 || raw.passes.length !== 2 || [...raw.moves, ...raw.passes].some(n => !Number.isInteger(n) || n < 0)
      || !Number.isFinite(raw.quiet) || !Number.isFinite(raw.goalTime)
      || (raw.active !== null && (!Number.isInteger(raw.active) || raw.bodies[raw.active]?.team !== raw.turn))) return null;
    if (raw.phase === 'moving' && (!raw.action || raw.bodies[raw.action.shooter]?.team !== raw.turn
      || !Number.isFinite(raw.action.elapsed) || (raw.action.receiver !== null && raw.bodies[raw.action.receiver]?.team !== raw.turn))) return null;
    if (raw.capture && (!Number.isFinite(raw.capture.x) || !Number.isFinite(raw.capture.y)
      || !Number.isFinite(raw.capture.elapsed) || !Number.isFinite(raw.capture.orbit) || raw.bodies[raw.capture.id]?.team !== raw.turn)) return null;
    if (raw.version === 3 && raw.capture && (!['coast', 'align'].includes(raw.capture.stage)
      || !Number.isFinite(raw.capture.coastQuiet) || raw.capture.coastQuiet < 0)) return null;
    if ((raw.phase === 'goal' && ![0, 1].includes(raw.scorer)) || ![null, 0, 1].includes(raw.winner)) return null;
    if (raw.phase === 'finished' && (raw.winner === null || raw.scores[raw.winner] !== 3)) return null;
    const capture = raw.capture && raw.version < 3 ? { ...raw.capture, stage: 'align', coastQuiet: 0 } : raw.capture;
    if (!legacy) return raw.version === 3 ? raw : { ...raw, version: 3, capture };
    // Ajouter les gardiens sans déplacer les onze disques de l'ancienne partie.
    const bodies = raw.bodies.slice(0, 10).map(p => ({ ...p }));
    const savedBall = { ...raw.bodies[10], id: BALL_ID };
    for (const team of [0, 1]) {
      const keeper = goalkeeper(team), occupied = [...bodies, savedBall];
      let found = false;
      for (let row = 0; row < 11 && !found; row++) {
        const y = team ? FIELD.top + 2 + row * 28 : FIELD.bottom - 2 - row * 28;
        for (const offset of [0, -28, 28, -56, 56, -84, 84, -112, 112, -140, 140]) {
          const x = 200 + offset;
          if (canStand(x, y, keeper.r) && occupied.every(p => Math.hypot(x - p.x, y - p.y) >= keeper.r + p.r + 1)) {
            keeper.x = x; keeper.y = y; found = true; break;
          }
        }
      }
      if (!found) return null;
      bodies.push(keeper);
    }
    bodies.push(savedBall);
    return { ...raw, version: 3, bodies, capture };
  }
  const api = { FIELD, FORMATIONS, PUCK_RADIUS, KEEPER_RADIUS, BALL_RADIUS, BALL_ID, BALL_BORDER, PASS_GAP, GOAL_DURATION, MAX_SHOT, STEP, walls, corners,
    create, reset, step, shoot, selectable, restore, formationPositions, canStand, isKeeper };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.JDDDuelPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis);

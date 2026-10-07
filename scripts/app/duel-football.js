/* Duel local : le même téléphone, les mêmes identités, aucun service distant requis. */
(function (global) {
  'use strict';
  const P = global.JDDDuelPhysics, F = P.FIELD, STORE = 'jdd.duel-football.v1';
  const GOAL_ART = 'image/duel/goal.webp';
  const MAX_DRAG_CSS = 3 * 96 / 2.54; // Environ 3 cm CSS, indépendant du zoom du terrain.
  const COLORS = ['#f7c3d0', '#ffd938'], INK = '#252124', CREAM = '#fff9e9';
  const HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root, options, opened = false, editor, canvas, ctx, frame = 0, previous = 0, accumulator = 0;
  let match = null, selection = [], formations = ['1-2-2', '2-1-2'], drag = null, paused = false, scale = 1;
  let lastSerial = -1, lastSave = 0, feedback = null;
  const names = () => options.getSuggestedNames();
  function save() { if (match) try { localStorage.setItem(STORE, JSON.stringify(match)); } catch (_) { /* Partie disponible en mémoire. */ } }
  function clearGoal() {
    const board = root?.querySelector('.duel-board-wrap');
    if (board) global.JDDVisuals.clearCelebration(board);
  }
  function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; accumulator = 0; cancelDrag(); clearGoal(); }
  function sound(key) {
    if (!global.JDDSound.isEnabled()) return;
    try {
      const audio = global.JDDSound.getContext();
      if (!audio) return;
      feedback ||= global.JDDFeedbackSounds.build(audio);
      const source = audio.createBufferSource(); source.buffer = feedback[key];
      source.connect(global.JDDSound.destination()); global.JDDSound.track(source);
      source.onended = () => source.disconnect(); source.start();
    } catch (_) { /* Les gestes et la physique restent disponibles sans son. */ }
  }
  function topbar(live = false) {
    return `<header class="duel-topbar"><button type="button" class="duel-pill" data-duel="exit">${HOME}<span>Menu</span></button><span class="duel-pill duel-title">Duel Foot</span>${live ? `<button type="button" class="duel-pill duel-pause" data-duel="pause" aria-label="Mettre le match en pause">${PAUSE}</button>` : ''}</header>`;
  }
  function preview(formation, team) {
    const dots = P.formationPositions(formation, 0).map(p => `<circle cx="${p.x / 4}" cy="${(p.y - 330) / 5.8 + 6}" r="4.2" fill="${COLORS[team]}" stroke="${INK}" stroke-width="1.4"/>`).join('');
    return `<svg viewBox="0 0 100 65" aria-hidden="true"><rect x="7" y="2" width="86" height="60" rx="12" fill="#a7d5bc" stroke="${INK}" stroke-width="1.5"/><path d="M7 12h86M39 62V49h22v13" fill="none" stroke="${CREAM}" stroke-width="1.5"/>${dots}<circle cx="50" cy="56" r="5.6" fill="${COLORS[team]}" stroke="${INK}" stroke-width="1.6"/><text x="50" y="58.4" text-anchor="middle" fill="${INK}" font-family="Arial,sans-serif" font-size="7" font-weight="900">G</text></svg>`;
  }
  function updateSelection() {
    const people = names();
    selection = [0, 1].map(i => people.includes(selection[i]) ? selection[i] : people.find(n => n !== selection[1 - i]) || '');
    if (selection[0] === selection[1]) selection[1] = people.find(n => n !== selection[0]) || '';
  }
  function renderSetup() {
    stop(); canvas = ctx = null; paused = false; updateSelection(); root.dataset.screen = 'setup';
    root.innerHTML = `${topbar()}<section class="duel-panel"><div class="duel-window"><span aria-hidden="true">● ● ●</span><span>1 CONTRE 1</span><span aria-hidden="true">✦</span></div><div class="duel-settings"><div class="duel-intro"><img src="image/home/duel.svg" width="160" height="160" alt=""><div><h1>Duel Foot</h1><p>5 pions + 1 gardien · Premier à 3 buts</p></div></div>${match ? `<button type="button" class="duel-button duel-button--green" data-duel="resume">${match.physics.phase === 'finished' ? 'Dernier résultat' : 'Reprendre le match'}</button>` : ''}<div class="duel-contenders">${[0, 1].map(team => `<fieldset class="duel-contender" data-team="${team}"><legend>Joueur ${team + 1}</legend><label class="duel-select-label" for="duel-player-${team}">Qui joue ?</label><select id="duel-player-${team}" data-duel-player="${team}">${names().length ? `<option value="" ${selection[team] ? '' : 'selected'} disabled>Choisir un joueur</option>` : '<option value="">Ajouter un joueur</option>'}${names().map(name => `<option value="${esc(name)}" ${name === selection[team] ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select><div class="duel-formations" role="group" aria-label="Formation du joueur ${team + 1}">${P.FORMATIONS.map(formation => `<label><input type="radio" name="duel-formation-${team}" data-duel-formation="${team}" value="${formation}" ${formations[team] === formation ? 'checked' : ''}>${preview(formation, team)}<span>${formation}</span></label>`).join('')}</div></fieldset>`).join('')}</div><details class="duel-roster" ${names().length < 2 ? 'open' : ''}><summary>Ajouter ou retirer des joueurs</summary><div id="duel-players"></div></details><p id="duel-error" role="alert" hidden></p><button type="button" class="duel-button" data-duel="start" ${selection.filter(Boolean).length < 2 ? 'disabled' : ''}>Lancer le match ${global.JDDVisuals.arrow()}</button></div><div class="duel-floor" aria-hidden="true"></div></section>`;
    editor = global.JDDPlayerEditor.mount(root.querySelector('#duel-players'), { getNames: names, addPlayer: options.addPlayer, removePlayer: options.removePlayer });
    global.scrollTo(0, 0);
  }
  function participant(label) { return global.JDDParticipants.get(label) || { label, name: label, kind: 'guest' }; }
  function start() {
    updateSelection();
    if (selection.some(n => !n) || selection[0] === selection[1]) return;
    match = { version: 1, players: selection.map(participant), physics: P.create(formations), createdAt: Date.now() };
    lastSerial = -1; save(); renderMatch();
  }
  function avatars() {
    match.players.forEach((p, team) => {
      const node = root.querySelector(`[data-duel-avatar="${team}"]`);
      node.replaceChildren(global.JDDAccounts.avatar(global.JDDAccounts.profileFor(p.label) || { display_name: p.name }));
    });
  }
  function fitWords(node) {
    if (!node || !node.clientWidth) return;
    node.style.fontSize = '';
    const style = getComputedStyle(node), measure = document.createElement('canvas').getContext('2d');
    measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const longest = Math.max(...node.textContent.split(/\s+/).map(word => measure.measureText(word).width));
    if (longest > node.clientWidth) node.style.fontSize = `${parseFloat(style.fontSize) * node.clientWidth / longest * .98}px`;
  }
  function renderMatch() {
    stop(); paused = false; root.dataset.screen = 'match';
    root.innerHTML = `<section class="duel-match">${topbar(true)}<div class="duel-scoreboard" aria-label="Score"><div class="duel-player" data-team="0"><span data-duel-avatar="0" class="duel-avatar"></span><strong>${esc(match.players[0].name)}</strong></div><strong class="duel-score"><span id="duel-score-0"></span><span aria-hidden="true">–</span><span id="duel-score-1"></span></strong><div class="duel-player" data-team="1"><span data-duel-avatar="1" class="duel-avatar"></span><strong>${esc(match.players[1].name)}</strong></div></div><div id="duel-turn" class="duel-turn" role="status" aria-live="polite"></div><div class="duel-board-wrap"><canvas id="duel-canvas" width="400" height="680" aria-label="Terrain de Duel Foot. Touche un de tes pions, tire vers l’arrière puis relâche."></canvas><div id="duel-overlay" class="duel-overlay" hidden></div></div><p class="duel-tip">Tire vers l’arrière, puis relâche. Une passe te fait rejouer.</p></section>`;
    canvas = root.querySelector('canvas'); ctx = canvas.getContext('2d'); avatars();
    root.querySelector('.duel-scoreboard').classList.toggle('duel-scoreboard--longnames', match.players.some(p => p.name.split(/\s+/).some(word => word.length > 18)));
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', cancelDrag);
    canvas.addEventListener('lostpointercapture', cancelDrag);
    updateHUD(); resize();
    if (match.physics.phase === 'finished') results(); else loop();
    global.scrollTo(0, 0);
  }
  function resize() {
    if (!opened || !canvas || !ctx) return;
    const wrap = root.querySelector('.duel-board-wrap'), size = wrap.getBoundingClientRect();
    const ratio = Math.min(2, global.devicePixelRatio || 1);
    const nextScale = Math.min((size.width - 4) / F.width, (size.height - 4) / F.height);
    if (!(nextScale > 0)) return;
    const width = Math.round(F.width * nextScale * ratio), height = Math.round(F.height * nextScale * ratio);
    if (Math.abs(scale - nextScale) > .0001 || canvas.width !== width || canvas.height !== height) {
      cancelDrag(); scale = nextScale;
      canvas.style.width = `${F.width * scale + 4}px`; canvas.style.height = `${F.height * scale + 4}px`;
      canvas.width = width; canvas.height = height;
    }
    ctx.setTransform(canvas.width / F.width, 0, 0, canvas.height / F.height, 0, 0); draw();
    root.querySelectorAll('.duel-player strong, .duel-turn-text, .duel-result h2').forEach(fitWords);
  }
  function updateHUD() {
    const s = match.physics;
    root.querySelectorAll('.duel-player').forEach((node, i) => node.classList.toggle('is-active', s.turn === i && s.phase !== 'finished'));
    root.querySelector('#duel-score-0').textContent = s.scores[0]; root.querySelector('#duel-score-1').textContent = s.scores[1];
    const status = root.querySelector('#duel-turn'); status.dataset.team = s.turn;
    const text = document.createElement('span'); text.className = 'duel-turn-text';
    text.textContent = paused ? 'Match en pause' : s.phase === 'goal' ? `But pour ${match.players[s.scorer].name} !`
      : s.phase === 'finished' ? `${match.players[s.winner].name} gagne !`
      : s.phase === 'moving' ? (s.capture ? `Passe · ${match.players[s.turn].name} rejoue` : 'Tir en cours')
      : `${match.players[s.turn].name}${s.active !== null ? ' · Rejoue !' : ' · À toi !'}`;
    status.replaceChildren(text);
    if (s.phase === 'aim' && !paused) status.insertAdjacentHTML('beforeend', global.JDDVisuals.arrow(s.turn === 0 ? 'up' : 'down'));
    root.dataset.phase = s.phase; root.dataset.turn = s.turn;
    canvas.setAttribute('aria-label', `Terrain : ${match.players[s.turn].name} joue. Score ${s.scores[0]} à ${s.scores[1]}. Tire un pion vers l’arrière puis relâche.`);
    fitWords(text);
  }
  function roundRect(x, y, width, height, radius) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }
  function circle(x, y, r, fill, stroke = INK, width = 2) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  function line(x1, y1, x2, y2, stroke, width = 2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
  }
  function field() {
    ctx.clearRect(0, 0, 400, 680); ctx.fillStyle = CREAM; ctx.fillRect(0, 0, 400, 680);
    for (const y of [F.top - F.goalDepth, F.bottom]) {
      ctx.fillStyle = '#eee8f7'; ctx.fillRect(F.goalLeft, y, F.goalRight - F.goalLeft, F.goalDepth);
      for (let x = F.goalLeft + 8; x < F.goalRight; x += 10) line(x, y, x, y + F.goalDepth, '#c9b3ef', .8);
      for (let yy = y + 8; yy < y + F.goalDepth; yy += 8) line(F.goalLeft, yy, F.goalRight, yy, '#c9b3ef', .8);
    }
    roundRect(F.left, F.top, F.right - F.left, F.bottom - F.top, F.corner); ctx.fillStyle = '#a7d5bc'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#b8dfc9';
    for (let y = F.top; y < F.bottom; y += 100) ctx.fillRect(F.left, y, F.right - F.left, 50);
    ctx.strokeStyle = CREAM; ctx.lineWidth = 2.5;
    line(F.left, 340, F.right, 340, CREAM, 2.5);
    ctx.beginPath(); ctx.arc(200, 340, 51, 0, Math.PI * 2); ctx.stroke(); circle(200, 340, 3, CREAM, null);
    for (const y of [F.top, F.bottom - 78]) {
      ctx.strokeRect(106, y, 188, 78); ctx.strokeRect(157, y === F.top ? y : F.bottom - 30, 86, 30);
    }
    ctx.restore();
    // Même géométrie que le moteur : segments, poteaux ronds et quatre grands arcs.
    ctx.strokeStyle = INK; ctx.lineWidth = F.wall * 2; ctx.lineCap = 'round';
    for (const wall of P.walls) line(...wall, INK, F.wall * 2);
    for (const [cx, cy, sx, sy] of P.corners) {
      const start = sx < 0 ? (sy < 0 ? Math.PI : Math.PI / 2) : (sy < 0 ? -Math.PI / 2 : 0);
      ctx.beginPath(); ctx.arc(cx, cy, F.corner, start, start + Math.PI / 2); ctx.stroke();
    }
    line(F.goalLeft + 3, F.top, F.goalRight - 3, F.top, '#fff9e9', 2);
    line(F.goalLeft + 3, F.bottom, F.goalRight - 3, F.bottom, '#fff9e9', 2);
  }
  function draw() {
    if (!ctx || !match) return;
    const s = match.physics; field();
    for (const p of s.bodies) {
      circle(p.x + 1, p.y + 3, p.r, 'rgba(37,33,36,.18)', null);
      if (p.team !== null) {
        const active = P.selectable(s, p.id) || (s.phase === 'moving' && p.id === s.active);
        if (active && !paused) circle(p.x, p.y, p.r + 5, 'rgba(255,249,233,.65)', INK, 1.2);
        circle(p.x, p.y, p.r, COLORS[p.team], INK, 2.5);
        circle(p.x, p.y, p.r - 4, COLORS[p.team], 'rgba(255,249,233,.8)', 1.2);
        ctx.fillStyle = INK; ctx.font = `900 ${P.isKeeper(p) ? 17 : 13}px Montserrat,Arial,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(P.isKeeper(p) ? 'G' : String(p.id % 5 + 1), p.x, p.y + .5);
      } else {
        circle(p.x, p.y, p.r, CREAM, INK, 1.8);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillStyle = INK;
        ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * 3.6, Math.sin(a) * 3.6); } ctx.closePath(); ctx.fill();
        for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; line(Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * 7, Math.sin(a) * 7, INK, 1); }
        ctx.restore();
      }
    }
    ctx.textBaseline = 'alphabetic';
    if (drag) {
      const p = s.bodies[drag.id], aim = shotVector();
      circle(p.x, p.y, p.r + 10, 'rgba(255,217,56,.28)', '#ffd938', 2);
      if (aim.power > .025) {
        let distance = 30 + aim.power * 65;
        // Garder la tête de la flèche visible lorsqu'on vise un rebond près d'un mur.
        if (Math.abs(aim.nx) > .001) distance = Math.min(distance, (aim.nx > 0 ? 392 - p.x : p.x - 8) / Math.abs(aim.nx));
        if (Math.abs(aim.ny) > .001) distance = Math.min(distance, (aim.ny > 0 ? 672 - p.y : p.y - 8) / Math.abs(aim.ny));
        const x = p.x + aim.nx * distance, y = p.y + aim.ny * distance;
        const drawArrow = (color, width) => {
          line(p.x, p.y, x, y, color, width);
          line(x, y, x - aim.nx * 13 - aim.ny * 10, y - aim.ny * 13 + aim.nx * 10, color, width);
          line(x, y, x - aim.nx * 13 + aim.ny * 10, y - aim.ny * 13 - aim.nx * 10, color, width);
        };
        drawArrow(INK, 8); drawArrow('#ffd938', 4);
        ctx.fillStyle = INK; ctx.font = '900 11px Montserrat,Arial,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(aim.power * 100)} %`, clampLabel(p.x), Math.min(656, p.y + 36));
      }
    }
  }
  const clampLabel = x => Math.max(45, Math.min(355, x));
  function shotVector() {
    const dx = drag.startX - drag.x, dy = drag.startY - drag.y, distance = Math.hypot(dx, dy);
    return { power: Math.min(1, distance / MAX_DRAG_CSS), nx: distance ? dx / distance : 0, ny: distance ? dy / distance : 0, distance };
  }
  function pointerDown(event) {
    if (drag || paused || !match || match.physics.phase !== 'aim' || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left - 2) / scale, y = (event.clientY - rect.top - 2) / scale;
    const p = match.physics.bodies.filter(p => P.selectable(match.physics, p.id))
      .map(p => ({ p, distance: Math.hypot(p.x - x, p.y - y) })).sort((a, b) => a.distance - b.distance)[0];
    if (!p || p.distance > Math.max(p.p.r + 4, 22 / scale)) return;
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    drag = { id: p.p.id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY }; draw();
  }
  function pointerMove(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    event.preventDefault(); drag.x = event.clientX; drag.y = event.clientY; draw();
  }
  function pointerUp(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.x = event.clientX; drag.y = event.clientY;
    const vector = shotVector(), id = drag.id; cancelDrag();
    if (vector.distance >= 8 && P.shoot(match.physics, id, vector.nx * vector.power * P.MAX_SHOT, vector.ny * vector.power * P.MAX_SHOT)) {
      sound('pass'); save(); updateHUD(); loop();
    } else draw();
  }
  function cancelDrag() {
    if (!drag) return;
    const pointer = drag.pointer; drag = null;
    if (canvas?.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    draw();
  }
  function loop(now = 0) {
    frame = 0;
    if (!opened || paused || !canvas || document.hidden) return;
    const s = match.physics;
    if (previous) accumulator += Math.min(.05, (now - previous) / 1000);
    previous = now;
    while (accumulator >= P.STEP) { P.step(s, P.STEP); accumulator -= P.STEP; }
    if (s.serial !== lastSerial) {
      if (s.phase === 'goal') {
        sound('correct');
        global.JDDVisuals.celebrate(root.querySelector('.duel-board-wrap'), GOAL_ART);
      } else clearGoal();
      lastSerial = s.serial; updateHUD(); save();
    }
    if (now - lastSave > 400 && ['moving', 'goal'].includes(s.phase)) { save(); lastSave = now; }
    draw();
    if (s.phase === 'finished') { results(); save(); }
    else if (s.phase === 'moving' || s.phase === 'goal') frame = requestAnimationFrame(loop);
    else previous = 0;
  }
  function results() {
    const node = root.querySelector('#duel-overlay'), s = match.physics;
    node.hidden = false; node.innerHTML = `<div class="duel-result"><span class="duel-result-star" aria-hidden="true">✦</span><h2>${esc(match.players[s.winner].name)} gagne !</h2><strong>${s.scores[0]} – ${s.scores[1]}</strong><button type="button" class="duel-button" data-duel="replay">Rejouer ${global.JDDVisuals.arrow()}</button></div>`;
    fitWords(node.querySelector('h2'));
  }
  function pause() {
    if (!canvas || match.physics.phase === 'finished') return;
    stop(); paused = true; save(); updateHUD();
    const node = root.querySelector('#duel-overlay'); node.hidden = false;
    node.innerHTML = '<div class="duel-result"><h2>Match en pause</h2><button type="button" class="duel-button duel-button--green" data-duel="continue">Reprendre le match</button></div>';
  }
  function restore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE));
      const physics = P.restore(value?.physics);
      if (value?.version === 1 && Array.isArray(value.players) && value.players.length === 2
        && value.players.every(p => typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 40 && typeof p.label === 'string')
        && physics) {
        value.physics = physics;
        match = value; selection = value.players.map(p => p.label); formations = value.physics.formations.slice();
        save();
      }
    } catch (_) { /* Ancienne partie invalide ignorée. */ }
  }
  function init(config) {
    options = config; root = document.getElementById('duel'); restore();
    const goalArt = new Image(); goalArt.src = GOAL_ART;
    root.addEventListener('click', event => {
      const act = event.target.closest('[data-duel]')?.dataset.duel;
      if (act === 'start') start();
      if (act === 'resume') { lastSerial = match.physics.serial; renderMatch(); }
      if (act === 'replay') renderSetup();
      if (act === 'pause') pause();
      if (act === 'continue') { paused = false; root.querySelector('#duel-overlay').hidden = true; updateHUD(); loop(); }
      if (act === 'exit') { stop(); save(); opened = false; options.onExit(); }
    });
    root.addEventListener('change', event => {
      const target = event.target;
      if (target.matches('[data-duel-player]')) {
        const team = Number(target.dataset.duelPlayer), other = 1 - team, old = selection[team];
        selection[team] = target.value; if (selection[other] === target.value) selection[other] = old;
        root.querySelector(`[data-duel-player="${other}"]`).value = selection[other];
        root.querySelector('[data-duel="start"]').disabled = selection.some(n => !n) || selection[0] === selection[1];
      }
      if (target.matches('[data-duel-formation]')) formations[Number(target.dataset.duelFormation)] = target.value;
    });
    global.addEventListener('jdd:players', () => { if (opened && root.dataset.screen === 'setup') renderSetup(); });
    global.addEventListener('jdd:profiles', () => { if (opened && canvas) avatars(); });
    global.addEventListener('resize', resize); global.addEventListener('pagehide', () => { stop(); save(); });
    global.addEventListener('pageshow', event => { if (event.persisted && opened && canvas) pause(); });
    document.addEventListener('visibilitychange', () => { if (opened && document.hidden && canvas) pause(); });
    document.fonts?.ready.then(resize);
  }
  global.JDDModules ||= {};
  global.JDDModules.duel = { init, onOpen() { opened = true; renderSetup(); }, onClose() { opened = false; stop(); save(); } };
})(window);

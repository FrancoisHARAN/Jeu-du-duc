/* Échecs locaux : toucher une pièce, puis sa destination, sur le même appareil. */
(function (global) {
  'use strict';
  const C = global.JDDChessMatch,
    ART = 'image/home/chess.webp',
    STORE = 'jdd.chess.v1';
  const CHECKMATE_ART = 'image/chess/checkmate.webp';
  const labels = { p: 'Pion', r: 'Tour', n: 'Cavalier', b: 'Fou', q: 'Dame', k: 'Roi' };
  const reasons = {
    mate: 'Échec et mat',
    stalemate: 'Pat',
    material: 'Matériel insuffisant',
    repetition: 'Triple répétition',
    fifty: 'Règle des 50 coups',
    timeout: 'Temps écoulé',
    resign: 'Abandon',
    agreement: 'Accord des joueurs',
  };
  const esc = global.JDD.escapeHtml;
  const home = global.JDDVisuals.icons.home;
  const pauseIcon = global.JDDVisuals.icons.pause;
  let root,
    options,
    editor,
    match = null,
    opened = false,
    selection = [],
    minutes = 5,
    selected = null,
    pending = null,
    timer = 0,
    lastSave = 0;
  const names = () => options.getSuggestedNames();
  const player = (color) => match.players[color === 'w' ? 0 : 1];
  const piece = (type, color) => global.JDDChessPieces.piece(type, color);
  function save() {
    if (match)
      try {
        localStorage.setItem(STORE, JSON.stringify(C.snapshot(match)));
      } catch (_) {}
  }
  function toolbar(live = false) {
    return `<header class="chess-toolbar"><button class="chess-pill" data-chess="exit" type="button">${home} Menu</button><span class="chess-pill chess-title">Échecs</span>${live ? `<button class="chess-pill chess-pause" data-chess="pause" type="button" aria-label="Mettre la partie en pause">${pauseIcon}</button>` : ''}</header>`;
  }
  function updateSelection() {
    selection = global.JDDPlayerEditor.duelSelection(selection, names());
  }
  function updateSetupPlayers() {
    if (!opened || root.dataset.screen !== 'setup') return;
    updateSelection();
    editor.update();
    root.querySelectorAll('[data-chess-player]').forEach((select) => {
      const i = Number(select.dataset.chessPlayer);
      select.innerHTML =
        `<option value="" ${selection[i] ? '' : 'selected'} disabled>Choisir un joueur</option>` +
        names()
          .map(
            (name) =>
              `<option value="${esc(name)}" ${selection[i] === name ? 'selected' : ''}>${esc(name)}</option>`
          )
          .join('');
    });
    root.querySelector('[data-chess="start"]').disabled =
      selection.some((name) => !name) || selection[0] === selection[1];
  }
  function setup() {
    global.JDDVisuals.clearCelebration(root);
    clearInterval(timer);
    closeDialog();
    selected = pending = null;
    updateSelection();
    root.dataset.screen = 'setup';
    root.innerHTML = `${toolbar()}<section class="chess-panel"><div class="chess-window"><span aria-hidden="true">● ● ●</span><span>1 CONTRE 1</span><span aria-hidden="true">✦</span></div><div class="chess-settings"><div class="chess-intro"><img src="${ART}" width="640" height="640" alt=""><h1>Échecs</h1></div>${match ? `<button class="chess-button chess-button--green" data-chess="resume" type="button">${match.result ? 'Dernier résultat' : 'Reprendre la partie'}</button>` : ''}<div class="chess-contenders">${[
      0, 1,
    ]
      .map(
        (i) =>
          `<label class="chess-contender" for="chess-player-${i}"><span>Joueur ${i + 1}</span><select id="chess-player-${i}" data-chess-player="${i}"><option value="" ${selection[i] ? '' : 'selected'} disabled>Choisir un joueur</option>${names()
            .map(
              (n) =>
                `<option value="${esc(n)}" ${selection[i] === n ? 'selected' : ''}>${esc(n)}</option>`
            )
            .join('')}</select></label>`
      )
      .join(
        ''
      )}</div><fieldset class="chess-timing"><legend>Temps par joueur</legend><div>${C.MINUTES.map((n) => `<label><input type="radio" name="chess-minutes" value="${n}" ${minutes === n ? 'checked' : ''}><span>${n} min</span></label>`).join('')}</div></fieldset><details class="chess-roster" ${names().length < 2 ? 'open' : ''}><summary>Ajouter des joueurs</summary><div id="chess-players"></div></details><button class="chess-button" data-chess="start" type="button" ${selection.some((n) => !n) || selection[0] === selection[1] ? 'disabled' : ''}>Lancer la partie ${global.JDDVisuals.arrow()}</button></div><div class="chess-floor" aria-hidden="true"></div></section>`;
    editor = global.JDDPlayerEditor.mount(root.querySelector('#chess-players'), {
      getNames: names,
      addPlayer: options.addPlayer,
      removePlayer: options.removePlayer,
    });
    global.scrollTo(0, 0);
  }
  function start() {
    updateSelection();
    if (selection.some((n) => !n) || selection[0] === selection[1]) return;
    match = C.create(
      selection.map((n) => global.JDDParticipants.get(n) || { name: n, label: n, kind: 'guest' }),
      minutes
    );
    selected = pending = null;
    save();
    renderMatch();
  }
  function card(color) {
    const p = player(color);
    return `<div class="chess-player chess-player--${color}" data-color="${color}"><span class="chess-player-piece">${piece('k', color)}</span><div class="chess-player-name"><strong>${esc(p.name)}</strong><small>${color === 'w' ? 'Blancs' : 'Noirs'}</small></div><time id="chess-clock-${color}" class="chess-clock" aria-label="Temps des ${color === 'w' ? 'blancs' : 'noirs'}"></time></div>`;
  }
  function renderMatch() {
    closeDialog();
    root.dataset.screen = 'match';
    selected = pending = null;
    root.innerHTML = `<section class="chess-game">${toolbar(true)}${card('b')}<div id="chess-status" role="status" aria-live="polite"></div><div class="chess-board-wrap"><div id="chess-board" class="chess-board" role="grid" aria-label="Échiquier, blancs en bas"></div></div>${card('w')}<div id="chess-actions" class="chess-actions"></div></section><dialog id="chess-dialog" class="chess-dialog"></dialog>`;
    const dialog = root.querySelector('dialog');
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (dialog.dataset.kind === 'pause') resume();
      else {
        closeDialog();
        pending = null;
      }
    });
    renderBoard();
    hud();
    tick();
    startTimer();
    global.scrollTo(0, 0);
  }
  function fitNames() {
    root.querySelectorAll('.chess-player-name strong, #chess-status').forEach((node) => {
      node.style.fontSize = '';
      if (!node.clientWidth) return;
      const style = getComputedStyle(node),
        ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const max = Math.max(...node.textContent.split(/\s+/).map((w) => ctx.measureText(w).width));
      if (max > node.clientWidth)
        node.style.fontSize = `${((parseFloat(style.fontSize) * node.clientWidth) / max) * 0.97}px`;
    });
  }
  function hud() {
    const s = match,
      turn = s.game.turn(),
      status = root.querySelector('#chess-status');
    if (!status) return;
    status.textContent = s.result
      ? `${reasons[s.result.kind]} · ${s.result.winner ? player(s.result.winner).name + ' gagne !' : 'Partie nulle'}`
      : !s.running
        ? 'Partie en pause'
        : `${player(turn).name} · ${s.game.isCheck() ? 'Échec !' : 'À toi !'}`;
    root.dataset.turn = turn;
    root.dataset.phase = s.result ? 'finished' : s.running ? 'playing' : 'paused';
    root
      .querySelectorAll('.chess-player')
      .forEach((node) =>
        node.classList.toggle('is-active', s.running && node.dataset.color === turn)
      );
    root.querySelector('[data-chess="pause"]').disabled = Boolean(s.result);
    root.querySelector('#chess-actions').innerHTML = s.result
      ? `<button class="chess-button" data-chess="replay" type="button">Rejouer ${global.JDDVisuals.arrow()}</button>`
      : '<button data-chess="resign" type="button">Abandonner</button><button data-chess="draw" type="button">Nulle</button>';
    updateClocks();
    fitNames();
  }
  function renderBoard(played = null) {
    const g = match.game,
      moves = selected ? g.moves({ square: selected, verbose: true }) : [];
    const targets = new Map(moves.map((m) => [m.to, m])),
      last = match.moves.at(-1),
      check = g.isCheck();
    let html = '';
    for (let rank = 8; rank >= 1; rank--) {
      html += '<div class="chess-row" role="row">';
      for (let file = 0; file < 8; file++) {
        const square = String.fromCharCode(97 + file) + rank,
          p = g.get(square),
          target = targets.get(square);
        const classes = [
          'chess-square',
          (file + rank) % 2 === 0 ? 'chess-square--light' : 'chess-square--dark',
        ];
        if (square === selected) classes.push('is-selected');
        if (last && [last.from, last.to].includes(square)) classes.push('is-last');
        if (target) classes.push(target.captured ? 'is-capture' : 'is-target');
        if (check && p?.type === 'k' && p.color === g.turn()) classes.push('is-check');
        const feminine = p && ['q', 'r'].includes(p.type);
        const description = `${square}${p ? ', ' + labels[p.type] + (p.color === 'w' ? (feminine ? ' blanche' : ' blanc') : feminine ? ' noire' : ' noir') : ', case vide'}${target ? ', déplacement possible' : ''}`;
        let art = p ? piece(p.type, p.color) : '';
        if (p && played?.to === square) {
          const dx = played.from.charCodeAt(0) - played.to.charCodeAt(0),
            dy = Number(played.to[1]) - Number(played.from[1]);
          art = `<span class="chess-moving" style="--move-x:${dx * 100}%;--move-y:${dy * 100}%">${art}</span>`;
        }
        html += `<button type="button" role="gridcell" class="${classes.join(' ')}" data-square="${square}" aria-label="${description}" aria-pressed="${square === selected}" ${match.result || !match.running ? 'disabled' : ''}>${art}${file === 0 ? `<span class="chess-rank" aria-hidden="true">${rank}</span>` : ''}${rank === 1 ? `<span class="chess-file" aria-hidden="true">${String.fromCharCode(97 + file)}</span>` : ''}</button>`;
      }
      html += '</div>';
    }
    root.querySelector('#chess-board').innerHTML = html;
  }
  function select(square) {
    C.sync(match);
    if (match.result) {
      tick();
      return;
    }
    if (!match.running || root.querySelector('dialog')?.open) return;
    const g = match.game,
      p = g.get(square),
      moves = selected
        ? g.moves({ square: selected, verbose: true }).filter((m) => m.to === square)
        : [];
    if (moves.length) {
      if (moves.some((m) => m.promotion)) {
        pending = { from: selected, to: square };
        promotion();
      } else play(selected, square);
    } else {
      selected = selected === square ? null : p?.color === g.turn() ? square : null;
      renderBoard();
      root.querySelector(`[data-square="${square}"]`).focus({ preventScroll: true });
    }
  }
  function tapSound() {
    if (!global.JDDSound.isEnabled()) return;
    try {
      const ctx = global.JDDSound.getContext();
      if (!ctx) return;
      const oscillator = ctx.createOscillator(),
        gain = ctx.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 230;
      gain.gain.setValueAtTime(0.045, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);
      oscillator.connect(gain);
      gain.connect(global.JDDSound.destination());
      global.JDDSound.track(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.06);
    } catch (_) {}
  }
  function play(from, to, promotionType) {
    const played = C.move(match, from, to, promotionType);
    closeDialog();
    pending = selected = null;
    if (played) tapSound();
    save();
    renderBoard(played);
    hud();
    root.querySelector(`[data-square="${to}"]`)?.focus({ preventScroll: true });
    if (match.result) clearInterval(timer);
    if (played && match.result?.kind === 'mate') global.JDDVisuals.celebrate(root, CHECKMATE_ART);
  }
  function showDialog(kind, content) {
    const dialog = root.querySelector('dialog');
    dialog.dataset.kind = kind;
    dialog.innerHTML = content;
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() {
    const d = root?.querySelector('dialog');
    if (d?.open) d.close();
  }
  function promotion() {
    showDialog(
      'promotion',
      `<h2>Promotion</h2><div class="chess-promotions">${['q', 'r', 'b', 'n'].map((t) => `<button type="button" data-promotion="${t}" aria-label="Promouvoir en ${labels[t].toLowerCase()}">${piece(t, match.game.turn())}<span>${labels[t]}</span></button>`).join('')}</div>`
    );
  }
  function pause() {
    C.pause(match);
    clearInterval(timer);
    save();
    hud();
    renderBoard();
    showDialog(
      'pause',
      '<h2>Partie en pause</h2><button class="chess-button" type="button" data-chess="continue">Reprendre</button><button class="chess-button chess-button--green" type="button" data-chess="exit">Menu</button>'
    );
  }
  function resume() {
    closeDialog();
    C.resume(match);
    if (root.dataset.screen !== 'match') renderMatch();
    else {
      renderBoard();
      hud();
    }
    save();
    startTimer();
  }
  function updateClocks() {
    for (const color of ['w', 'b']) {
      const node = root.querySelector('#chess-clock-' + color);
      if (!node) continue;
      const seconds = Math.ceil(match.remaining[color] / 1000),
        text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      if (node.textContent !== text) node.textContent = text;
      node.classList.toggle('is-low', seconds <= 20 && !match.result);
    }
  }
  function tick() {
    if (!match || root.dataset.screen !== 'match') return;
    const ended = root.dataset.phase === 'finished';
    C.sync(match);
    updateClocks();
    if (!ended && match.result) {
      closeDialog();
      pending = selected = null;
      renderBoard();
      hud();
      clearInterval(timer);
      save();
    }
    if (Date.now() - lastSave > 1000) {
      save();
      lastSave = Date.now();
    }
  }
  function startTimer() {
    clearInterval(timer);
    if (opened && match?.running && !match.result && !document.hidden)
      timer = setInterval(tick, 100);
  }
  function exit() {
    global.JDDVisuals.clearCelebration(root);
    if (match) C.pause(match);
    save();
    closeDialog();
    clearInterval(timer);
    opened = false;
    options.onExit();
  }
  function init(config) {
    options = config;
    root = document.getElementById('chess');
    const checkmateArt = new Image();
    checkmateArt.src = CHECKMATE_ART;
    try {
      match = C.restore(JSON.parse(localStorage.getItem(STORE)));
      if (match) {
        C.pause(match);
        minutes = match.minutes;
        selection = match.players.map((p) => p.label);
        save();
      }
    } catch (_) {}
    root.addEventListener('click', (event) => {
      const square = event.target.closest('[data-square]');
      if (square) {
        select(square.dataset.square);
        return;
      }
      const promote = event.target.closest('[data-promotion]');
      if (promote && pending) {
        play(pending.from, pending.to, promote.dataset.promotion);
        return;
      }
      const action = event.target.closest('[data-chess]')?.dataset.chess;
      if (action === 'start') start();
      if (action === 'resume' || action === 'continue') resume();
      if (action === 'pause') pause();
      if (action === 'exit') exit();
      if (action === 'replay') setup();
      if (action === 'cancel') closeDialog();
      if (action === 'resign')
        showDialog(
          'resign',
          `<h2>${esc(player(match.game.turn()).name)} abandonne ?</h2><button class="chess-button chess-button--pink" type="button" data-chess="confirm-resign">Abandonner</button><button class="chess-button" type="button" data-chess="cancel">Continuer</button>`
        );
      if (action === 'draw')
        showDialog(
          'draw',
          '<h2>Partie nulle ?</h2><p>Les deux joueurs sont d’accord.</p><button class="chess-button chess-button--green" type="button" data-chess="confirm-draw">Accepter la nulle</button><button class="chess-button" type="button" data-chess="cancel">Continuer</button>'
        );
      if (action === 'confirm-resign' || action === 'confirm-draw') {
        if (action === 'confirm-resign') C.resign(match);
        else C.agreeDraw(match);
        closeDialog();
        save();
        renderBoard();
        hud();
        clearInterval(timer);
      }
    });
    root.addEventListener('change', (event) => {
      if (event.target.matches('[data-chess-player]')) {
        const i = Number(event.target.dataset.chessPlayer),
          old = selection[i];
        selection[i] = event.target.value;
        if (selection[1 - i] === selection[i]) {
          selection[1 - i] = old;
          root.querySelector(`[data-chess-player="${1 - i}"]`).value = old;
        }
        root.querySelector('[data-chess="start"]').disabled =
          selection.some((n) => !n) || selection[0] === selection[1];
      }
      if (event.target.name === 'chess-minutes') minutes = Number(event.target.value);
    });
    root.addEventListener('keydown', (event) => {
      const square = event.target.closest('[data-square]');
      if (!square) return;
      const offsets = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, 1],
          ArrowDown: [0, -1],
        },
        offset = offsets[event.key];
      if (!offset) return;
      event.preventDefault();
      const file = square.dataset.square.charCodeAt(0) + offset[0],
        rank = Number(square.dataset.square[1]) + offset[1];
      if (file >= 97 && file <= 104 && rank >= 1 && rank <= 8)
        root
          .querySelector(`[data-square="${String.fromCharCode(file) + rank}"]`)
          .focus({ preventScroll: true });
    });
    global.addEventListener('jdd:players', updateSetupPlayers);
    global.addEventListener('resize', fitNames);
    document.fonts?.ready.then(fitNames);
    global.addEventListener('pagehide', () => {
      global.JDDVisuals.clearCelebration(root);
      save();
      clearInterval(timer);
    });
    global.addEventListener('pageshow', (event) => {
      if (event.persisted && opened) {
        tick();
        startTimer();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (opened && root.dataset.screen === 'match') {
        tick();
        if (document.hidden) {
          global.JDDVisuals.clearCelebration(root);
          clearInterval(timer);
        } else startTimer();
      }
    });
  }
  global.JDDModules ||= {};
  global.JDDModules.chess = {
    init,
    onOpen() {
      opened = true;
      setup();
    },
    onClose: exit,
  };
})(window);

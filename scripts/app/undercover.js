/* =========================================================
   Undercover — reprise du jeu de l'appli Undercover
   Réglages → choix des cartes → description → élimination → fin
   Les joueurs, leurs positions et leurs points sont gardés d'une partie à l'autre.
   ========================================================= */
(function (global) {
  const STORE_KEY = 'jdd.undercover.v2';
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 20;
  const AVATAR_COLORS = ['#a7d5bc', '#f7c3d0', '#aac7e4', '#f9d570', '#c9b3ef'];
  const POINTS = { civil: 2, white: 6, undercover: 10 };

  // ---------------------------------------------------------------- icônes
  const SVG = {
    back: '<svg viewBox="0 0 32 32" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M26 16H7"/><path d="M14 8l-8 8 8 8"/></svg>',
    exit: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 6h13v20H13"/><path d="M3 16h15"/><path d="M8 11l-5 5 5 5"/></svg>',
    home: '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 4 3 15h4v12h7v-8h4v8h7V15h4z"/></svg>',
    next: global.JDDVisuals.arrow(),
    // silhouettes des cartes (garçon / fille) avec le point d'interrogation
    cardBoy: '<svg viewBox="0 0 100 120"><path fill="#fff" d="M22 118c0-18 10-27 22-29v-8c-11-4-19-14-19-28 0-8 2-14 6-19l-10-3 10-4-5-10 13 4c6-6 14-8 22-7 14 2 22 13 22 27l-1 9 6 10c1 2 0 4-2 4h-4v8c0 5-4 8-9 8h-9v8c12 2 22 11 22 29z"/><text x="57" y="66" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="900" font-size="36" fill="#f6b400">?</text></svg>',
    cardGirl: '<svg viewBox="0 0 100 120"><path fill="#fff" d="M20 118c0-18 11-27 24-29v-6c-14-3-24-13-24-31 0-22 16-38 36-38 18 0 30 14 30 30l-1 8 6 9c1 2 0 4-2 4h-4v8c0 5-4 8-9 8h-10v8c12 2 22 11 22 29z"/><text x="57" y="66" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="900" font-size="36" fill="#f6b400">?</text></svg>',
    silhouette: '<svg class="uc-sil" viewBox="0 0 100 120"><path fill="rgba(255,255,255,.95)" d="M22 118c0-18 10-27 22-29v-8c-11-4-19-14-19-28 0-8 2-14 6-19l-10-3 10-4-5-10 13 4c6-6 14-8 22-7 14 2 22 13 22 27l-1 9 6 10c1 2 0 4-2 4h-4v8c0 5-4 8-9 8h-9v8c12 2 22 11 22 29z"/></svg>',
  };

  function roleIcon(role) {
    if (role === 'civil') {
      return '<svg viewBox="0 0 64 64"><path fill="#2f9ff5" d="M19 27c0-10 6-17 15-17l-4-5 10 3-1-5 8 7c4 4 5 9 4 15-1 11-7 18-16 18s-16-7-16-16zM12 64c0-12 9-19 22-19s21 7 21 19z"/></svg>';
    }
    const fill = role === 'white' ? '#fff' : '#0a0a0a';
    const stroke = role === 'white' ? ' stroke="#9aa0ad" stroke-width="2.5"' : '';
    return `<svg viewBox="0 0 64 64"><g fill="${fill}"${stroke} stroke-linejoin="round"><path d="M21 21c0-9 4-14 11-14s11 5 11 14z"/><path d="M12 22c0-2 2-3 4-3h32c2 0 4 1 4 3s-2 3-4 3H16c-2 0-4-1-4-3z"/><path d="M22 27h20c0 9-4 15-10 15s-10-6-10-15z"/><path d="M14 62l2-11c1-6 7-9 16-9s15 3 16 9l2 11z"/></g></svg>`;
  }


  // ---------------------------------------------------------------- état
  let root = null;
  let options = { onExit: function () {}, getSuggestedNames: function () { return []; }, editPlayers: function () {} };
  let store = null;
  let modal = null;
  let whiteCelebrationPending = false;
  // « Éliminer » reste grisé un instant : le 2e tap d'un double tap sur une pastille ne valide pas l'élimination
  const CONFIRM_DELAY = 400;
  let confirmOpenedAt = 0;
  let toastTimer = null;

  function freshStore() {
    return { players: [], bench: [], settings: Object.assign({ count: 5 }, defaultRoles(5)), game: null, usedPairs: [] };
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!data || !Array.isArray(data.players) || !data.settings) return freshStore();
      const base = freshStore();
      return {
        players: data.players.filter((p) => p && p.id && typeof p.name === 'string').map((p) => ({ id: p.id, name: p.name, score: Number(p.score) || 0, participant: p.participant || null })),
        // joueurs retirés de la bande : leurs points les attendent s'ils reviennent
        bench: Array.isArray(data.bench) ? data.bench.filter((p) => p && p.id && typeof p.name === 'string').map((p) => ({ id: p.id, name: p.name, score: Number(p.score) || 0, participant: p.participant || null })) : [],
        settings: Object.assign(base.settings, data.settings),
        game: data.game && Array.isArray(data.game.slots) ? data.game : null,
        usedPairs: Array.isArray(data.usedPairs) ? data.usedPairs : [],
      };
    } catch (error) {
      return freshStore();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (error) {
      // stockage indisponible : la partie reste en mémoire
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function uid() {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  function shuffle(list) {
    return global.JDD && global.JDD.shuffle ? global.JDD.shuffle(list) : list.sort(() => Math.random() - 0.5);
  }

  function playerById(id) {
    return store.players.find((p) => p.id === id) || null;
  }

  // Comme dans l'appli, la couleur de la pastille dépend de la place dans la grille
  function slotColor(index) {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
  }

  function initial(name) {
    return escapeHtml((name || '?').trim().charAt(0).toUpperCase() || '?');
  }

  // ---------------------------------------------------------------- réglages
  // Règles officielles (yanstarstudio.com) : 3 à 20 joueurs, au moins 1 infiltré
  // (Undercover ou Mr. White) et les civils toujours majoritaires.
  function maxInfiltrators(count) {
    return Math.max(1, Math.floor((count - 1) / 2));
  }

  // Répartition proposée par défaut, comme l'appli : civils = moitié + 1
  // (5 joueurs → 3 / 1 / 1, 9 joueurs → 5 / 3 / 1), Mr. White à partir de 5 joueurs.
  function defaultRoles(count) {
    const civils = Math.floor(count / 2) + 1;
    const white = count < 5 ? 0 : count < 11 ? 1 : count < 17 ? 2 : 3;
    return { undercover: count - civils - white, white };
  }

  function clampSettings() {
    const s = store.settings;
    s.count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Number(s.count) || 5, store.players.length));
    if (store.players.length > s.count) store.players.length = s.count;
    const max = maxInfiltrators(s.count);
    s.undercover = Math.max(0, Math.min(Number(s.undercover) || 0, max));
    s.white = Math.max(0, Math.min(Number(s.white) || 0, max - s.undercover));
    if (s.undercover + s.white === 0) s.undercover = 1;
  }

  function otherRole(role) {
    return role === 'white' ? 'undercover' : 'white';
  }

  function canChangeRole(role, delta) {
    const s = store.settings;
    if (s[role] + delta < 0) return false;
    if (delta < 0) return s.undercover + s.white - 1 >= 1;
    // au plafond, « + » transforme un infiltré de l'autre rôle (ex. 1 Undercover + 1 Mr. White → 2 Undercovers)
    return s.undercover + s.white < maxInfiltrators(s.count) || s[otherRole(role)] > 0;
  }

  function changeRole(role, delta) {
    if (!canChangeRole(role, delta)) {
      return false;
    }
    const s = store.settings;
    if (delta > 0 && s.undercover + s.white >= maxInfiltrators(s.count)) {
      s[otherRole(role)] -= 1;
    }
    s[role] += delta;
    save();
    return true;
  }

  // ---------------------------------------------------------------- mots
  function pairKey(pair) {
    return `${pair.civil}|${pair.under}`.toLowerCase();
  }

  function pickPair() {
    const all = (global.JDD && Array.isArray(global.JDD.UNDERCOVER_PAIRS)) ? global.JDD.UNDERCOVER_PAIRS : [];
    const pool = all;
    if (!pool.length) return { civil: 'Chat', under: 'Chien' };
    const used = new Set(store.usedPairs);
    let candidates = pool.filter((pair) => !used.has(pairKey(pair)));
    if (!candidates.length) {
      const poolKeys = new Set(pool.map(pairKey));
      store.usedPairs = store.usedPairs.filter((key) => !poolKeys.has(key));
      candidates = pool;
    }
    const pair = candidates[Math.floor(Math.random() * candidates.length)];
    store.usedPairs.push(pairKey(pair));
    return pair;
  }

  function normalizeWord(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // un article n'est retiré que s'il est suivi d'un espace (Lapin, Dés restent entiers) ; ’ = apostrophe iPhone
      .replace(/^(?:(?:les|le|la|une|un|des|du|de la)\s+|l['’]\s*)/, '')
      // pluriel retiré mot par mot (Film X ≠ Film)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((word) => (word.length > 2 ? word.replace(/[sx]$/, '') : word))
      .join('');
  }

  // ---------------------------------------------------------------- partie
  function game() {
    return store.game;
  }

  function startGame() {
    if (game() && game().phase === 'end') store.game = null;
    syncSharedPlayers();
    if (store.players.length < MIN_PLAYERS || options.getSuggestedNames().length > MAX_PLAYERS) {
      modal = null;
      render();
      options.editPlayers(startGame);
      return;
    }
    clampSettings();
    const s = store.settings;
    const roles = [];
    for (let i = 0; i < s.undercover; i += 1) roles.push('undercover');
    for (let i = 0; i < s.white; i += 1) roles.push('white');
    while (roles.length < s.count) roles.push('civil');
    shuffle(roles);

    const pair = pickPair();
    const swap = Math.random() < 0.5;
    store.game = {
      cloud: global.JDDCloud.begin('undercover', store.players.map(p => p.name)),
      phase: 'distribute',
      words: swap ? { civil: pair.under, under: pair.civil } : { civil: pair.civil, under: pair.under },
      slots: roles.map((role, index) => ({
        pid: store.players[index] ? store.players[index].id : null,
        role,
        seen: false,
        alive: true,
      })),
      round: 1,
      starter: null,
      result: null,
      deltas: null,
    };
    save();
    modal = hasBlankSlot() ? { type: 'handoff' } : { type: 'distributeInfo' };
    render();
  }

  function hasBlankSlot() {
    return game().slots.some((slot) => !slot.pid);
  }

  function nextNewPlayerNumber() {
    return game().slots.filter((slot) => slot.pid).length + 1;
  }

  function aliveSlots() {
    return game().slots.map((slot, index) => ({ slot, index })).filter((entry) => entry.slot.alive);
  }

  function startDescribe() {
    const g = game();
    const alive = aliveSlots();
    const candidates = alive.filter((entry) => entry.slot.role !== 'white');
    const pool = candidates.length ? candidates : alive;
    g.starter = pool[Math.floor(Math.random() * pool.length)].index;
    g.phase = 'describe';
    save();
  }

  function speakingOrder() {
    const g = game();
    const alive = aliveSlots().map((entry) => entry.index);
    const start = alive.indexOf(g.starter);
    const order = {};
    alive.forEach((slotIndex, i) => {
      order[slotIndex] = ((i - (start < 0 ? 0 : start) + alive.length) % alive.length) + 1;
    });
    return order;
  }

  function remaining() {
    const counts = { civil: 0, undercover: 0, white: 0 };
    game().slots.forEach((slot) => {
      if (slot.alive) counts[slot.role] += 1;
    });
    return counts;
  }

  function checkVictory() {
    const counts = remaining();
    if (counts.undercover === 0 && counts.white === 0) return 'civils';
    if (counts.civil <= 1) return 'infiltres';
    return null;
  }

  function finish(result, whiteSlotIndex) {
    const g = game();
    const deltas = g.slots.map(() => 0);
    g.slots.forEach((slot, index) => {
      if (result === 'civils' && slot.role === 'civil') deltas[index] = POINTS.civil;
      // victoire des infiltrés : tout le camp marque, comme les civils (« les Civils marquent tous 2 points »)
      if (result === 'infiltres' && slot.role === 'undercover') deltas[index] = POINTS.undercover;
      if (result === 'infiltres' && slot.role === 'white') deltas[index] = POINTS.white;
      if (result === 'white' && index === whiteSlotIndex) deltas[index] = POINTS.white;
    });
    deltas.forEach((delta, index) => {
      const player = playerById(g.slots[index].pid);
      if (player) player.score += delta;
    });
    g.result = result;
    g.winnerSlot = whiteSlotIndex == null ? null : whiteSlotIndex;
    g.deltas = deltas;
    g.phase = 'end';
    if (g.cloud) {
      global.JDDCloud.record(g.cloud, g.slots.map((slot, index) => {
        const participant = g.cloud.participants.find(p => p.label === playerById(slot.pid)?.name);
        const won = deltas[index] > 0;
        return { participant, metrics: { games: 1, wins: Number(won), points: deltas[index],
          [`${slot.role}_games`]: 1, [`${slot.role}_wins`]: Number(won) } };
      }), { result, roles: g.slots.map(slot => slot.role) });
    }
    save();
    modal = { type: 'end' };
    whiteCelebrationPending = g.slots.some((slot, index) => slot.role === 'white' && deltas[index] > 0);
  }

  function afterElimination() {
    const result = checkVictory();
    if (result) {
      finish(result);
    } else {
      game().round += 1;
      startDescribe();
      modal = null;
    }
    render();
  }

  // ---------------------------------------------------------------- rendu
  function render() {
    if (!root) return;
    const g = game();
    let screen;
    if (!g) {
      syncSharedPlayers();
      screen = renderSetup();
    } else {
      screen = renderGame();
    }
    root.dataset.screen = g ? g.phase : 'setup';
    root.innerHTML = `${screen}${renderModal()}`;
    global.JDDVisuals.clearCelebration(root);
    if (whiteCelebrationPending) {
      whiteCelebrationPending = false;
      global.JDDVisuals.celebrate(root, 'image/undercover/white-win.webp');
    }
    if (g) {
      g.modal = modal;
      save();
    }
    if (!g) syncSetup();
    fitSecretWords();
    document.fonts.ready.then(fitSecretWords);
    const focus = root.querySelector('[data-autofocus]');
    if (focus) {
      setTimeout(() => focus.focus(), 60);
    }
  }

  function fitSecretWords() {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    root.querySelectorAll('.uc-word, .uc-end-word > span:last-child').forEach((element) => {
      element.style.fontSize = '';
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      context.font = style.font;
      const widest = Math.max(...element.textContent.trim().split(/\s+/).map((word) => context.measureText(word).width));
      if (width > 0 && widest > width) {
        element.style.fontSize = `${Math.floor(parseFloat(style.fontSize) * width / widest * 2) / 2}px`;
      }
    });
  }

  function syncSharedPlayers() {
    if (game()) return;
    const previous = store.players.concat(store.bench || []);
    const names = options.getSuggestedNames().slice(0, MAX_PLAYERS);
    store.players = names.map((name) => {
      const participant = global.JDDParticipants.get(name);
      const existing = previous.find(player => participant?.kind === 'account'
        ? player.participant?.kind === 'account' && player.participant.id === participant.id
        : player.participant?.kind !== 'account' && player.name.toLowerCase() === name.toLowerCase());
      return existing ? { ...existing, name, participant } : { id: uid(), name, score: 0, participant };
    });
    store.bench = previous.filter((p) => p.score > 0 && !store.players.some((q) => q.id === p.id)).slice(-30);
    const count = Math.max(MIN_PLAYERS, store.players.length);
    if (count !== store.settings.count) Object.assign(store.settings, defaultRoles(count));
    store.settings.count = count;
    clampSettings();
    save();
  }

  function topbar() {
    return `<header class="uc-topbar"><button class="uc-menu" data-act="exit-app" type="button" aria-label="Revenir au menu principal">${SVG.home}<span>Menu</span></button><span class="uc-mode-label">Undercover</span></header>`;
  }

  function windowBar(label) {
    return `<div class="uc-window"><span class="uc-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${label}</span><span aria-hidden="true">✦</span></div>`;
  }

  function renderSetup() {
    return `
      <div class="uc-screen">
        ${topbar()}
        <section class="uc-panel uc-setup-panel">
          ${windowBar('JEU DE BLUFF')}
          <div class="uc-intro"><img src="image/home/undercover.webp" alt="" width="1254" height="1254"><div><h1>Undercover</h1></div></div>
          <details class="uc-rules"><summary>Comment on joue ?</summary><ol><li>De 3 à 20 joueurs. Les civils ont le même mot, les Undercovers un mot proche. Mr. White n’a aucun mot.</li><li>Chacun lit son mot en secret, puis le décrit à son tour sans le dévoiler.</li><li>Discutez et votez pour éliminer un suspect. Mr. White peut tenter de deviner le mot des civils quand il est éliminé.</li><li>Les civils gagnent en démasquant tous les infiltrés. Les infiltrés gagnent quand il reste un seul civil.</li></ol></details>
          <div class="uc-config">
          <section class="uc-setup-section"><h2>01 · La bande</h2><p class="uc-setup-title" id="uc-count-title"></p><div id="uc-players"></div></section>
          <section class="uc-setup-section"><h2>02 · Les rôles</h2><div class="uc-roles" id="uc-roles"></div></section>
          </div><div class="uc-floor" aria-hidden="true"></div>
        </section>
      </div>
      <div class="uc-bottom"><button class="uc-btn" data-act="start" type="button" ${store.players.length < MIN_PLAYERS || options.getSuggestedNames().length > MAX_PLAYERS ? 'disabled' : ''}>Lancer la partie ${global.JDDVisuals.arrow()}</button></div>`;
  }

  // Met à jour les réglages de rôles et les joueurs communs.
  function syncSetup() {
    const s = store.settings;
    const civils = s.count - s.undercover - s.white;
    const max = maxInfiltrators(s.count);
    const title = root.querySelector('#uc-count-title');
    if (!title) return;
    title.textContent = `${store.players.length} / 20 joueurs`;

    const plural = (n, word, pluralWord) => `${n} ${n > 1 ? pluralWord : word}`;
    const full = s.undercover + s.white >= max;
    const roleRow = (role, label, tone) => `
      <div class="uc-role-row">
        <button class="uc-minus uc-minus--${tone}" data-act="role" data-role="${role}" data-delta="-1" ${canChangeRole(role, -1) ? '' : 'disabled'} aria-label="Retirer un ${label}">−</button>
        <span class="uc-pill uc-pill--${role === 'white' ? 'white' : 'under'} ${s[role] === 0 ? 'uc-pill--off' : ''}">${label === 'Undercover' ? plural(s.undercover, 'Undercover', 'Undercovers') : `${s.white} Mr. White`}</span>
        <button class="uc-minus uc-minus--${tone}" data-act="role" data-role="${role}" data-delta="1" ${canChangeRole(role, 1) ? '' : 'disabled'} aria-label="Ajouter un ${label}">+</button>
      </div>`;
    root.querySelector('#uc-roles').innerHTML = `
      <div class="uc-role-row"><span class="uc-pill uc-pill--civil">${plural(civils, 'Civil', 'Civils')}</span></div>
      ${roleRow('undercover', 'Undercover', 'dark')}
      ${roleRow('white', 'Mr. White', 'light')}
      ${full ? `<div class="uc-roles-hint">Maximum ${max} infiltré${max > 1 ? 's' : ''} pour ${s.count} joueurs</div>` : ''}`;

    const players = store.players;
    const playersBox = root.querySelector('#uc-players');
    const hasScores = players.some((p) => p.score > 0);
    if (!playersBox._editor) {
      playersBox._editor = global.JDDPlayerEditor.mount(playersBox, {
        getNames: options.getSuggestedNames, addPlayer: options.addPlayer,
        removePlayer: options.removePlayer, maximum: MAX_PLAYERS,
      });
    } else playersBox._editor.update();
    let reset = playersBox.parentElement.querySelector('[data-act="reset-scores"]');
    if (hasScores && !reset) {
      reset = document.createElement('button'); reset.type = 'button'; reset.className = 'uc-link';
      reset.dataset.act = 'reset-scores'; reset.textContent = 'Remettre les scores à zéro';
      playersBox.after(reset);
    } else if (!hasScores && reset) reset.remove();
    const start = root.querySelector('[data-act="start"]');
    if (start) start.disabled = players.length < MIN_PLAYERS || options.getSuggestedNames().length > MAX_PLAYERS;
  }

  function renderInfos() {
    const counts = remaining();
    return `
      <div class="uc-infos">
        <div class="uc-info">
          <div class="uc-info-label">Infiltrés restants</div>
          <div class="uc-info-icons">
            ${game().slots.some((slot) => slot.role === 'white') ? `${roleIcon('white')}<span>${counts.white}</span>` : ''}
            ${roleIcon('undercover')}<span>${counts.undercover}</span>
          </div>
        </div>
      </div>`;
  }

  function renderGame() {
    const g = game();
    let head;
    let bottom = '';
    if (g.phase === 'distribute') {
      head = hasBlankSlot()
        ? `<h2>Joueur ${nextNewPlayerNumber()}</h2><p>Choisis une carte</p>`
        : '<h2>Distribution</h2><p>Touche ta pastille pour lire ton mot secret</p>';
    } else if (g.phase === 'vote') {
      head = '<h2>Élimination</h2><p>Discutez qui éliminer puis votez tous en même temps en pointant du doigt !</p>';
      bottom = '<button class="uc-btn uc-btn--green uc-btn--sm" data-act="describe-again">Décrire à nouveau</button>';
    } else {
      head = '<h2>Description</h2><p>Décrivez votre mot secret dans l\'ordre indiqué, en utilisant juste un mot ou une phrase.</p>';
      if (g.phase === 'describe') bottom = '<button class="uc-btn uc-btn--orange" data-act="to-vote">Passer au vote</button>';
    }
    const headClass = g.phase === 'vote' ? 'uc-head--vote' : g.phase === 'distribute' ? '' : 'uc-head--describe';
    const knownWaiting = g.phase === 'distribute' && hasBlankSlot() && g.slots.some((slot) => slot.pid && !slot.seen);

    return `
      <div class="uc-screen">
        ${topbar()}
        <section class="uc-panel uc-game-panel">
        ${windowBar(g.phase === 'distribute' ? 'CHACUN SON SECRET' : `MANCHE ${g.round}`)}
        <div class="uc-head ${headClass}"><img src="image/home/undercover.webp" alt="" width="1254" height="1254"><div>${head}</div></div>
        ${renderInfos()}
        ${knownWaiting ? '<div class="uc-hint">Les joueurs déjà inscrits touchent leur pastille</div>' : ''}
        <div class="uc-grid">${g.slots.map(renderSlot).join('')}</div>
        <button class="uc-link" data-act="quit" type="button">Arrêter la partie</button>
        <div class="uc-floor" aria-hidden="true"></div>
        </section>
      </div>
      ${bottom ? `<div class="uc-bottom">${bottom}</div>` : ''}`;
  }

  function renderSlot(slot, index) {
    const g = game();
    if (!slot.pid) {
      const art = index % 2 === 0 ? SVG.cardBoy : SVG.cardGirl;
      const clickable = g.phase === 'distribute' ? ' data-act="pick-card" data-slot="' + index + '"' : '';
      return `<button class="uc-card"${clickable} aria-label="Carte face cachée">${art}</button>`;
    }
    const player = playerById(slot.pid);
    const name = player ? player.name : '?';
    const color = slotColor(index);
    let extra = '';
    let classes = 'uc-slot';
    let act = '';

    if (g.phase === 'distribute') {
      if (slot.seen) {
        classes += ' uc-slot--done';
        extra = '<span class="uc-badge uc-badge--done">✓</span>';
      } else {
        classes += ' uc-slot--todo';
        extra = '<span class="uc-badge uc-badge--todo">?</span>';
        act = ` data-act="pick-known" data-slot="${index}"`;
      }
    } else if (!slot.alive) {
      classes += ' uc-slot--dead';
      extra = `<span class="uc-role-badge">${roleIcon(slot.role)}</span>`;
    } else if (g.phase === 'describe') {
      const order = speakingOrder()[index];
      extra = `<span class="uc-badge ${order === 1 ? 'uc-badge--first' : ''}">${order}</span>`;
    } else if (g.phase === 'vote') {
      extra = '<span class="uc-tag">Éliminer</span>';
      act = ` data-act="vote" data-slot="${index}"`;
    }

    const tag = act ? 'button' : 'div';
    return `
      <${tag} class="${classes}"${act}>
        <span class="uc-avatar" style="background:${color}">${initial(name)}${extra}</span>
        <span class="uc-name">${escapeHtml(name)}</span>
      </${tag}>`;
  }

  function bigAvatar(name, color, role) {
    const badge = role === 'white'
      ? `<span class="uc-role-badge">${roleIcon('white')}</span><span class="uc-role-label">Mr. White</span>`
      : role ? `<span class="uc-role-badge">${roleIcon(role)}</span>` : '';
    const face = name ? initial(name) : SVG.silhouette;
    return `<div class="uc-big-avatar" style="background:${color}">${face}${badge}</div>`;
  }

  function renderModal() {
    if (!modal) return '';
    const g = game();
    const slot = g && modal.slot != null ? g.slots[modal.slot] : null;
    const player = slot && slot.pid ? playerById(slot.pid) : null;

    switch (modal.type) {
      case 'handoff':
        return overlay(`
          <div class="uc-modal">
            <h3>Joueur ${nextNewPlayerNumber()}</h3>
            <p class="uc-sub">Choisis une carte</p>
            <div class="uc-handoff-art">
              <div class="uc-card">${SVG.cardBoy}</div><div class="uc-card">${SVG.cardGirl}</div>
              <span class="uc-hand">👆</span>
            </div>
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="close-modal">OK</button>
          </div>`);

      case 'distributeInfo':
        return overlay(`
          <div class="uc-modal">
            <h3>Nouvelle partie</h3>
            <p class="uc-sub">Chacun son tour, touche ta pastille pour découvrir ton mot secret.</p>
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="close-modal">OK</button>
          </div>`);

      case 'name': {
        const color = slotColor(modal.slot);
        const used = new Set(store.players.map((p) => p.name.toLowerCase()));
        const suggestions = (options.getSuggestedNames() || []).filter((name) => !used.has(String(name).toLowerCase())).slice(0, 12);
        return overlay(`
          <div class="uc-modal">
            ${bigAvatar(modal.value, color)}
            <input class="uc-input" id="uc-name-input" maxlength="16" placeholder="Choisis un nom" value="${escapeHtml(modal.value)}" autocomplete="off" data-autofocus>
            <div class="uc-helper">Saisis ton nom pour dévoiler ton mot secret</div>
            ${suggestions.length ? `
              <div class="uc-suggest">
                <div class="uc-suggest-title">Ou touche ton prénom :</div>
                <div class="uc-chips">${suggestions.map((name) => `<button class="uc-chip" data-act="suggest" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div>
              </div>` : ''}
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="submit-name" id="uc-name-submit" ${modal.value.trim() ? '' : 'style="visibility:hidden"'}>Lis ton mot secret</button>
          </div>`);
      }

      case 'identity':
        return overlay(`
          <div class="uc-modal">
            ${bigAvatar(player.name, slotColor(modal.slot))}
            <div class="uc-player-name">${escapeHtml(player.name)}</div>
            <p class="uc-sub uc-muted">C'est bien toi ?</p>
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="reveal">Lis ton mot secret</button>
            <button class="uc-link" data-act="close-modal">Ce n'est pas moi</button>
          </div>`);

      case 'word': {
        const isWhite = slot.role === 'white';
        const word = slot.role === 'undercover' ? g.words.under : g.words.civil;
        return overlay(`
          <div class="uc-modal">
            ${bigAvatar(player.name, slotColor(modal.slot), isWhite ? 'white' : null)}
            <div class="uc-player-name">${escapeHtml(player.name)}</div>
            <p class="uc-sub uc-muted">${isWhite ? 'Tu n\'as pas de mot secret' : 'Ton mot secret est'}</p>
            <div class="uc-word ${isWhite ? 'uc-word--white' : ''}">${isWhite ? 'Tu es Mr. White' : escapeHtml(word)}</div>
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="word-ok">OK</button>
          </div>`);
      }

      case 'confirmVote':
        return overlay(`
          <div class="uc-dialog">
            <p>Éliminer ${escapeHtml(player.name)} ?</p>
            <div class="uc-dialog-actions">
              <button class="uc-dialog-cancel" data-act="close-modal">Annuler</button>
              <button class="uc-dialog-ok" data-act="eliminate"${Date.now() - confirmOpenedAt < CONFIRM_DELAY ? ' disabled' : ''}>Éliminer</button>
            </div>
          </div>`);

      case 'eliminated': {
        const titles = { civil: '1 Civil(e) en moins !', undercover: '1 Undercover en moins !', white: '1 Mr. White en moins !' };
        return overlay(`
          <div class="uc-modal">
            <h3 class="uc-modal-title-white">${titles[slot.role]}</h3>
            <div class="uc-modal-spacer"></div>
            ${bigAvatar(player.name, slotColor(modal.slot), slot.role)}
            <div class="uc-player-name">${escapeHtml(player.name)}</div>
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="eliminated-ok">OK</button>
          </div>`);
      }

      case 'guess':
        return overlay(`
          <div class="uc-modal">
            ${bigAvatar(player.name, slotColor(modal.slot), 'white')}
            <div class="uc-player-name">${escapeHtml(player.name)}</div>
            <p class="uc-sub">Dernière chance : devine le mot des civils pour gagner !</p>
            <input class="uc-input" id="uc-guess-input" maxlength="40" placeholder="Le mot des civils" value="${escapeHtml(modal.value || '')}" autocomplete="off" data-autofocus>
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="submit-guess">Valider</button>
          </div>`);

      case 'guessWrong':
        return overlay(`
          <div class="uc-modal">
            <h3 class="uc-modal-title-white">Raté !</h3>
            <p class="uc-sub">Ce n'est pas le mot des civils.</p>
            <div class="uc-modal-spacer"></div>
            ${bigAvatar(player.name, slotColor(modal.slot), 'white')}
            <div class="uc-modal-spacer"></div>
            <button class="uc-btn uc-btn--green" data-act="guess-wrong-ok">OK</button>
          </div>`);

      case 'quit':
        return overlay(`
          <div class="uc-dialog">
            <p>Quitter la partie ?<br><small style="opacity:.7;font-size:1rem">Les joueurs et les points sont gardés.</small></p>
            <div class="uc-dialog-actions">
              <button class="uc-dialog-cancel" data-act="close-modal">Annuler</button>
              <button class="uc-dialog-danger" data-act="quit-confirm">Quitter</button>
            </div>
          </div>`);

      case 'end':
        return overlay(renderEnd());

      default:
        return '';
    }
  }

  function renderEnd() {
    const g = game();
    const hasUnder = g.slots.some((slot) => slot.role === 'undercover');
    let title;
    let heroRole;
    if (g.result === 'civils') {
      title = 'Les Civils ont gagné !';
      heroRole = 'civil';
    } else if (g.result === 'white') {
      title = 'Mr. White a gagné !';
      heroRole = 'white';
    } else {
      const hasWhite = g.slots.some((slot) => slot.role === 'white');
      const underCount = g.slots.filter((slot) => slot.role === 'undercover').length;
      if (!hasUnder) {
        title = 'Mr. White a gagné !';
        heroRole = 'white';
      } else {
        title = hasWhite ? 'Les Infiltrés ont gagné !' : underCount > 1 ? 'Les Undercovers ont gagné !' : "L'Undercover a gagné !";
        heroRole = 'undercover';
      }
    }

    const rows = g.slots
      .map((slot, index) => ({ slot, index, player: playerById(slot.pid) }))
      .filter((row) => row.player)
      .sort((a, b) => b.player.score - a.player.score || g.deltas[b.index] - g.deltas[a.index]);

    return `
      <div class="uc-modal uc-end">
        <h3>${title}</h3>
        <div class="uc-end-words">
          <div class="uc-end-word"><span class="uc-score-role">${roleIcon('civil')}</span><span>${escapeHtml(g.words.civil)}</span></div>
          ${hasUnder ? `<div class="uc-end-word"><span class="uc-score-role">${roleIcon('undercover')}</span><span>${escapeHtml(g.words.under)}</span></div>` : ''}
        </div>
        <div class="uc-trophy-card"><span class="uc-trophy">🏆</span>${roleIcon(heroRole)}</div>
        <div class="uc-ribbon">Les scores de la bande</div>
        <div class="uc-scores">
          ${rows.map(({ slot, index, player }) => `
            <div class="uc-score-row ${slot.alive ? '' : 'uc-score-row--out'}">
              <span class="uc-mini" style="background:${slotColor(index)}">${initial(player.name)}</span>
              <span class="uc-score-name">${escapeHtml(player.name)}</span>
              <span class="uc-score-pts">${g.deltas[index] ? `<span class="uc-plus">+${g.deltas[index]}</span>` : ''}${player.score}<small>PTS</small></span>
              <span class="uc-score-role">${roleIcon(slot.role)}</span>
            </div>`).join('')}
        </div>
        <div class="uc-end-actions">
          <button class="uc-round" data-act="end-home" aria-label="Retour aux réglages">${SVG.home}<span>Réglages</span></button>
          <button class="uc-round" data-act="end-next" aria-label="Partie suivante">${SVG.next}<span>Rejouer</span></button>
        </div>
      </div>`;
  }

  function overlay(content) {
    const charted = content.replace(/(<div class="uc-(?:modal|dialog)[^"]*">)/, `$1${windowBar('UNDERCOVER')}`);
    return `<div class="uc-overlay" role="dialog" aria-modal="true" aria-label="Undercover">${charted}</div>`;
  }

  function toast(message) {
    const previous = root.querySelector('.uc-toast');
    if (previous) previous.remove();
    const node = document.createElement('div');
    node.className = 'uc-toast';
    node.textContent = message;
    root.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 1700);
  }

  function shake(element) {
    if (!element) return;
    element.classList.remove('uc-shake');
    void element.offsetWidth;
    element.classList.add('uc-shake');
  }

  // ---------------------------------------------------------------- actions
  function submitName() {
    const input = root.querySelector('#uc-name-input');
    const name = (input ? input.value : modal.value).trim().replace(/\s+/g, ' ');
    if (!name) {
      shake(input);
      return;
    }
    if (store.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast('Désolé, ce nom existe déjà...');
      return;
    }
    const player = { id: uid(), name, score: 0 };
    const g = game();
    const slot = g.slots[modal.slot];
    // les nouveaux joueurs sont rangés dans l'ordre des cartes pour garder leur place à la partie suivante
    const before = g.slots.slice(0, modal.slot).filter((s) => s.pid).length;
    store.players.splice(before, 0, player);
    slot.pid = player.id;
    save();
    modal = { type: 'word', slot: modal.slot };
    render();
  }

  function wordSeen() {
    const g = game();
    g.slots[modal.slot].seen = true;
    if (g.slots.every((slot) => slot.seen)) {
      // ordre des joueurs = ordre des cartes, pour la partie suivante
      store.players = g.slots.map((slot) => playerById(slot.pid)).filter(Boolean)
        .concat(store.players.filter((p) => !g.slots.some((slot) => slot.pid === p.id)));
      startDescribe();
      modal = null;
    } else {
      modal = hasBlankSlot() ? { type: 'handoff' } : null;
    }
    save();
    render();
  }

  function submitGuess() {
    const g = game();
    const input = root.querySelector('#uc-guess-input');
    const guess = input ? input.value : '';
    if (!guess.trim()) {
      shake(input);
      return;
    }
    if (normalizeWord(guess) && normalizeWord(guess) === normalizeWord(g.words.civil)) {
      finish('white', modal.slot);
      render();
      return;
    }
    modal = { type: 'guessWrong', slot: modal.slot };
    render();
  }

  function onClick(event) {
    const target = event.target.closest('[data-act]');
    if (!target || !root.contains(target)) return;
    const act = target.dataset.act;
    const slotIndex = target.dataset.slot != null ? Number(target.dataset.slot) : null;
    const g = game();

    switch (act) {
      case 'exit-app':
        global.JDDVisuals.clearCelebration(root);
        options.onExit();
        break;
      case 'edit-players':
        options.editPlayers(onPlayersChanged);
        break;
      case 'role': {
        const ok = changeRole(target.dataset.role, Number(target.dataset.delta));
        if (!ok) shake(target);
        syncSetup();
        break;
      }
      case 'reset-scores':
        store.players.forEach((p) => { p.score = 0; });
        store.bench = [];
        save();
        syncSetup();
        break;
      case 'start':
        startGame();
        break;
      case 'close-modal':
        modal = null;
        render();
        break;
      case 'pick-card':
        if (!modal && g && g.phase === 'distribute') {
          modal = { type: 'name', slot: slotIndex, value: '' };
          render();
        }
        break;
      case 'pick-known':
        if (!modal && g && g.phase === 'distribute') {
          modal = { type: 'identity', slot: slotIndex };
          render();
        }
        break;
      case 'suggest': {
        const input = root.querySelector('#uc-name-input');
        if (input) input.value = target.dataset.name;
        modal.value = target.dataset.name;
        submitName();
        break;
      }
      case 'submit-name':
        submitName();
        break;
      case 'reveal':
        modal = { type: 'word', slot: modal.slot };
        render();
        break;
      case 'word-ok':
        wordSeen();
        break;
      case 'to-vote':
        g.phase = 'vote';
        save();
        render();
        break;
      case 'describe-again':
        g.phase = 'describe';
        save();
        render();
        break;
      case 'vote':
        if (!modal) {
          modal = { type: 'confirmVote', slot: slotIndex };
          confirmOpenedAt = Date.now();
          render();
          setTimeout(() => {
            const button = root.querySelector('[data-act="eliminate"]');
            if (button) button.disabled = false;
          }, CONFIRM_DELAY);
        }
        break;
      case 'eliminate':
        if (!modal || modal.type !== 'confirmVote' || Date.now() - confirmOpenedAt < CONFIRM_DELAY) break;
        g.slots[modal.slot].alive = false;
        save();
        modal = { type: 'eliminated', slot: modal.slot };
        render();
        break;
      case 'eliminated-ok':
        if (g.slots[modal.slot].role === 'white') {
          modal = { type: 'guess', slot: modal.slot, value: '' };
          render();
        } else {
          afterElimination();
        }
        break;
      case 'submit-guess':
        submitGuess();
        break;
      case 'guess-wrong-ok':
        afterElimination();
        break;
      case 'quit':
        modal = { type: 'quit' };
        render();
        break;
      case 'quit-confirm':
      case 'end-home':
        store.game = null;
        modal = null;
        save();
        render();
        break;
      case 'end-next':
        modal = null;
        startGame();
        break;
      default:
        break;
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.id === 'uc-name-input' && modal) {
      modal.value = target.value;
      const submit = root.querySelector('#uc-name-submit');
      if (submit) submit.style.visibility = target.value.trim() ? 'visible' : 'hidden';
      const avatar = root.querySelector('.uc-big-avatar');
      if (avatar) avatar.innerHTML = target.value.trim() ? initial(target.value) : SVG.silhouette;
    } else if (target.id === 'uc-guess-input' && modal) {
      modal.value = target.value;
    }
  }

  function onKeyDown(event) {
    if (event.key !== 'Enter') return;
    if (event.target.id === 'uc-name-input') {
      event.preventDefault();
      submitName();
    } else if (event.target.id === 'uc-guess-input') {
      event.preventDefault();
      submitGuess();
    }
  }

  // ---------------------------------------------------------------- module
  function init(config) {
    if (root) return;
    root = document.getElementById('undercover');
    if (!root) return;
    options = Object.assign(options, config || {});
    store = load();
    clampSettings();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKeyDown);
    global.addEventListener('resize', () => { if (!root.classList.contains('hidden')) fitSecretWords(); });
  }

  function onOpen() {
    if (!root) return;
    const g = game();
    const saved = g && g.modal ? g.modal : null;
    // un mot secret ne se réaffiche jamais tout seul à la reprise : retour aux pastilles
    modal = saved && saved.type === 'word' ? null : saved;
    render();
    root.scrollTop = 0;
  }

  function onPlayersChanged() {
    if (!root || game()) return;
    syncSharedPlayers();
    if (!root.classList.contains('hidden')) syncSetup();
  }

  global.JDDModules = global.JDDModules || {};
  global.JDDModules.undercover = { init, onOpen, onPlayersChanged, hasActiveGame: () => Boolean(store && game()) };
})(window);

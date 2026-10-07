/* Devine Tête : un jeu local de devinettes, sans dépendance ni serveur. */
(function (global) {
  'use strict';
  const STORE_KEY = 'jdd.heads.v1';
  const DEFAULTS = { duration: 60, controls: 'motion', clues: 'describe', sound: true, custom: '' };
  const NEUTRAL = 0.24;
  const TRIGGER = 0.64;
  const HOME_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
  let root,
    store,
    round = null,
    phase = 'setup',
    opened = false,
    playerEditor;
  let options = {
    onExit() {},
    getSuggestedNames() {
      return [];
    },
    editPlayers() {},
  };
  let clock = null,
    audio = null,
    feedbackSounds = null,
    wakeLock = null,
    permissionPending = false;
  let sensor = null,
    neutralSince = 0,
    gesture = null,
    gestureSince = 0,
    readySince = 0;
  let countdownEnd = 0,
    lastCount = 0,
    requestId = 0,
    readyMessage = '',
    resume = false;
  const escape = global.JDD.escapeHtml;
  const decks = () => global.JDD.HEADS_DECKS || [];
  // Garder un cycle complet, même quand la banque dépasse les 1 000 mots.
  const rememberedWordsLimit = () =>
    Math.max(1000, decks().reduce((count, deck) => count + deck.words.length, 0) + 200);
  const key = (word) =>
    word
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
      .trim();
  const timeLabel = (ms) =>
    `${Math.floor(Math.ceil(ms / 1000) / 60)}:${String(Math.ceil(ms / 1000) % 60).padStart(2, '0')}`;
  const score = (rows) => rows.filter((row) => row.status === 'correct').length;
  function streakCount() {
    let count = 0;
    for (let i = round.rows.length - 1; i >= 0 && round.rows[i].status === 'correct'; i--) count++;
    return count;
  }
  const names = () =>
    options.getSuggestedNames().filter((name) => typeof name === 'string' && name.trim());

  function load() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (_) {
      /* stockage privé */
    }
    // Les nouvelles manches utilisent tous les mots et les mêmes réglages simples.
    // Les anciens mots personnels et les manches en pause restent conservés.
    const config = {
      ...DEFAULTS,
      custom:
        typeof (saved && saved.config && saved.config.custom) === 'string'
          ? saved.config.custom.slice(0, 14000)
          : '',
    };
    const history =
      saved && Array.isArray(saved.history)
        ? saved.history
            .filter((r) => r && typeof r.player === 'string' && Array.isArray(r.rows))
            .slice(-30)
        : [];
    const totals =
      saved && Array.isArray(saved.totals)
        ? saved.totals.filter(
            (t) =>
              t &&
              typeof t.player === 'string' &&
              Number.isFinite(t.points) &&
              Number.isFinite(t.rounds)
          )
        : [];
    if (!saved || !Array.isArray(saved.totals)) {
      history.forEach((r) => {
        if (!r.player) return;
        let total = totals.find((t) => t.player === r.player);
        if (!total) {
          total = { player: r.player, points: 0, rounds: 0 };
          totals.push(total);
        }
        total.points += score(r.rows);
        total.rounds += 1;
      });
    }
    return {
      config,
      used:
        saved && Array.isArray(saved.used)
          ? saved.used.filter((w) => typeof w === 'string').slice(-rememberedWordsLimit())
          : [],
      history,
      totals,
      active: saved && saved.active,
      nextPlayer: saved && typeof saved.nextPlayer === 'string' ? saved.nextPlayer : '',
      teams:
        saved &&
        saved.teams &&
        Array.isArray(saved.teams.members) &&
        saved.teams.members.length === 2
          ? {
              enabled: saved.teams.enabled === true,
              members: saved.teams.members.map((list) =>
                Array.isArray(list) ? list.filter((n) => typeof n === 'string') : []
              ),
              totals: [0, 1].map((i) => ({
                points: Number(saved.teams.totals?.[i]?.points) || 0,
                rounds: Number(saved.teams.totals?.[i]?.rounds) || 0,
              })),
            }
          : {
              enabled: false,
              members: [[], []],
              totals: [
                { points: 0, rounds: 0 },
                { points: 0, rounds: 0 },
              ],
            },
    };
  }

  function save() {
    store.active = round && !round.finished ? round : null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (_) {
      /* jeu disponible sans stockage */
    }
  }

  function customWords() {
    return store.config.custom
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter((w) => w && w.length <= 60)
      .slice(0, 200);
  }

  function pool() {
    const all = [...decks().flatMap((d) => d.words), ...customWords()];
    return [...new Map(all.map((word) => [key(word), word])).values()];
  }

  function setPhase(next) {
    phase = next;
    root.dataset.screen = next;
    document.body.classList.toggle('hu-playing', next === 'playing');
  }

  function menuButton(compact = false) {
    return `<button class="hu-pill hu-menu${compact ? ' hu-menu--compact' : ''}" data-act="exit" type="button" aria-label="Revenir au menu principal" title="Menu principal">${HOME_ICON}<span class="hu-menu-label">Menu</span></button>`;
  }

  function topbar(label) {
    return `<header class="hu-topbar">${menuButton()}<span class="hu-pill hu-pill--pink">${escape(label)}</span></header>`;
  }

  function windowBar(label) {
    return `<div class="hu-window"><span class="hu-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${label}</span><span aria-hidden="true">✦</span></div>`;
  }

  function selectedPlayer() {
    return store.nextPlayer || names()[0] || '';
  }

  function syncTeams() {
    const people = names();
    const teams = store.teams;
    const assigned = new Set();
    teams.members = teams.members.map((list) =>
      list.filter((name) => {
        if (!people.includes(name) || assigned.has(name)) return false;
        assigned.add(name);
        return true;
      })
    );
    people
      .filter((name) => !assigned.has(name))
      .forEach((name) => {
        const index = teams.members[0].length <= teams.members[1].length ? 0 : 1;
        teams.members[index].push(name);
      });
    if (people.length < 4) teams.enabled = false;
    if (people.length >= 4 && teams.members.some((list) => !list.length)) {
      teams.members = [people.filter((_, i) => i % 2 === 0), people.filter((_, i) => i % 2 === 1)];
    }
  }

  function teamMarkup() {
    if (names().length < 4) return '';
    const teams = store.teams;
    return `<section class="hu-teams"><label class="hu-team-toggle"><span>Jouer en équipes</span><input type="checkbox" id="hu-teams-enabled" ${teams.enabled ? 'checked' : ''}></label>${teams.enabled ? `<div class="hu-team-tables">${teams.members.map((list, index) => `<section class="hu-team-table" data-team="${index}"><h3>Équipe ${index + 1}<small>${teams.totals[index].points} pts</small></h3><ul>${list.map((name) => `<li><span>${escape(name)}</span><button type="button" data-move-player="${escape(name)}" aria-label="Passer ${escape(name)} dans l’équipe ${2 - index}" ${list.length <= 1 ? 'disabled' : ''}>${global.JDDVisuals.arrow(index ? 'left' : 'right')}</button></li>`).join('')}</ul></section>`).join('')}</div><button class="hu-dice" data-act="shuffle-teams" type="button"><span aria-hidden="true">⚄</span> Mélanger les équipes</button>` : ''}</section>`;
  }

  function updateTeams() {
    const box = root.querySelector('#hu-team-settings');
    if (box) box.innerHTML = teamMarkup();
  }

  function teamCaption() {
    return round.team
      ? `<span class="hu-live-team"><strong>${escape(round.team.label)}</strong><small>${round.team.members.map(escape).join(' · ')}</small></span>`
      : '';
  }

  function renderSetup() {
    setPhase('setup');
    const people = names();
    syncTeams();
    const player = people.includes(store.nextPlayer) ? store.nextPlayer : people[0] || '';
    store.nextPlayer = player;
    root.innerHTML = `${topbar('Jeu de devinettes')}
      <section class="hu-panel">
        ${windowBar('LE MOT EST SUR TA TÊTE')}
        <div class="hu-intro"><img src="image/home/mascotte.webp" alt="" width="1254" height="1254"><h1>Devine<br>Tête</h1></div>
        <form id="hu-config" class="hu-config">
          <fieldset class="hu-player-picker"><legend>Qui devine ?</legend><div id="hu-player"></div></fieldset>
          <div id="hu-team-settings">${teamMarkup()}</div>
          <button id="hu-start" class="hu-button" type="submit">Lancer la partie ${global.JDDVisuals.arrow()}</button>
        </form>
        ${round && !round.finished ? '<div class="hu-resume"><button class="hu-button hu-button--green" data-act="resume" type="button">Reprendre la manche</button></div>' : ''}
        <div class="hu-floor" aria-hidden="true"></div>
      </section>${store.history.length ? `<details class="hu-history-summary"><summary>Les scores de la bande</summary>${historyMarkup()}</details>` : ''}`;
    playerEditor = global.JDDPlayerEditor.mount(root.querySelector('#hu-player'), {
      getNames: names,
      addPlayer: options.addPlayer,
      removePlayer: options.removePlayer,
      selected: player,
      onSelect(name) {
        store.nextPlayer = name;
        playerEditor.update(name);
        save();
      },
    });
    updateStartButton();
    window.scrollTo(0, 0);
  }

  function updateStartButton() {
    root.querySelector('#hu-start').disabled = !pool().length || names().length < 2;
  }

  function onPlayersChanged() {
    if (!store) return;
    syncTeams();
    if (!opened || phase !== 'setup') {
      save();
      return;
    }
    const people = names();
    const previous = selectedPlayer();
    const selected = people.includes(previous) ? previous : people[0] || '';
    store.nextPlayer = selected;
    playerEditor.update(selected);
    updateTeams();
    updateStartButton();
    save();
  }

  function historyMarkup() {
    if (!store.history.length) return '';
    const totals = new Map();
    store.totals.forEach((t) =>
      totals.set(
        t.participant?.kind === 'account' ? `account:${t.participant.id}` : `guest:${t.player}`,
        t
      )
    );
    return `<section class="hu-panel hu-history">${windowBar('LES MANCHES DE LA BANDE')}${store.teams.totals.some((t) => t.rounds) ? `<h2>Les équipes</h2><ul class="hu-score-list">${store.teams.totals.map((t, i) => `<li><span>Équipe ${i + 1}</span><strong>${t.points} pts</strong></li>`).join('')}</ul>` : ''}${
      totals.size
        ? `<h2>Les scores</h2><ul class="hu-score-list">${[...totals]
            .sort((a, b) => b[1].points - a[1].points)
            .map(
              ([, total]) =>
                `<li><span>${escape(total.player)}<small>${total.rounds} manche${total.rounds > 1 ? 's' : ''} · ${total.participant?.kind === 'account' ? 'Compte' : 'Invité'}</small></span><strong>${total.points} pt${total.points > 1 ? 's' : ''}</strong></li>`
            )
            .join('')}</ul>`
        : ''
    }<h2>Dernières manches</h2><ul class="hu-score-list">${store.history
      .slice(-5)
      .reverse()
      .map(
        (r) =>
          `<li><span>${r.team ? `${escape(r.team.label)} · ` : ''}${escape(r.player || 'Sans prénoms')}<small>${escape(r.themeLabel)} · ${r.duration} s</small></span><strong>${score(r.rows)} pt${score(r.rows) > 1 ? 's' : ''}</strong></li>`
      )
      .join(
        ''
      )}</ul><button class="hu-text-button" data-act="clear-history" type="button">Effacer les scores</button></section>`;
  }

  function initializeAudio() {
    if (!store.config.sound || !global.JDDSound.isEnabled()) return;
    try {
      audio = global.JDDSound.getContext();
      if (audio && !feedbackSounds) feedbackSounds = global.JDDFeedbackSounds.build(audio);
    } catch (_) {
      /* le son est facultatif */
    }
  }

  function playFeedback(status) {
    if (
      !store.config.sound ||
      !global.JDDSound.isEnabled() ||
      !audio ||
      audio.state !== 'running' ||
      !feedbackSounds
    )
      return;
    try {
      const source = audio.createBufferSource();
      source.buffer = feedbackSounds[status];
      source.connect(global.JDDSound.destination());
      global.JDDSound.track(source);
      source.onended = () => source.disconnect();
      source.start();
    } catch (_) {
      /* le jeu continue si la sortie audio est indisponible */
    }
  }

  function beep(frequency, duration = 0.12, delay = 0) {
    if (!store.config.sound || !global.JDDSound.isEnabled() || !audio || audio.state !== 'running')
      return;
    try {
      const osc = audio.createOscillator(),
        gain = audio.createGain();
      const start = audio.currentTime + delay;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(global.JDDSound.destination());
      global.JDDSound.track(osc);
      osc.start(start);
      osc.stop(start + duration);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch (_) {
      /* pas de son, le chrono continue */
    }
  }

  async function keepAwake() {
    if (!navigator.wakeLock || wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!opened || !['countdown', 'playing'].includes(phase)) {
        await lock.release();
        return;
      }
      wakeLock = lock;
      lock.addEventListener('release', () => {
        if (wakeLock === lock) wakeLock = null;
      });
    } catch (_) {
      /* certains téléphones ne proposent pas cette fonction */
    }
  }

  function releaseAwake() {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  function stopSensors() {
    global.removeEventListener('deviceorientation', onOrientation);
    sensor = null;
    neutralSince = 0;
    gesture = null;
    gestureSince = 0;
  }

  function landscape() {
    return global.innerWidth > global.innerHeight;
  }
  function neutral() {
    return (
      sensor &&
      Date.now() - sensor.at < 1000 &&
      Math.abs(sensor.z) < NEUTRAL &&
      Math.abs(sensor.y) < 0.45
    );
  }

  function onOrientation(event) {
    if (!opened || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    const beta = (event.beta * Math.PI) / 180,
      gamma = (event.gamma * Math.PI) / 180;
    // Composante verticale de la normale à l'écran : indépendante du côté paysage.
    // Écran vers le sol < 0 (trouvé), écran vers le ciel > 0 (passer).
    sensor = { z: Math.cos(beta) * Math.cos(gamma), y: Math.sin(beta), at: Date.now() };
    const now = Date.now();
    if (neutral()) {
      if (!neutralSince) neutralSince = now;
    } else neutralSince = 0;
    if (phase !== 'playing' || !round.motion || round.pending || !round.armed) {
      gesture = null;
      return;
    }
    const action = sensor.z <= -TRIGGER ? 'correct' : sensor.z >= TRIGGER ? 'pass' : null;
    if (!action) {
      gesture = null;
      return;
    }
    if (gesture !== action) {
      gesture = action;
      gestureSince = now;
    }
    if (now - gestureSince >= 120) mark(action);
  }

  async function enableMotion() {
    const id = ++requestId;
    permissionPending = true;
    readyMessage = 'Autorise les mouvements si le téléphone le demande.';
    renderReady();
    try {
      if (!global.isSecureContext || !global.DeviceOrientationEvent) throw new Error('unavailable');
      const request = global.DeviceOrientationEvent.requestPermission;
      // L'appel reste dans le clic initial : obligatoire pour l'autorisation iOS.
      if (
        typeof request === 'function' &&
        (await request.call(global.DeviceOrientationEvent)) !== 'granted'
      )
        throw new Error('denied');
      if (!opened || id !== requestId) return;
      stopSensors();
      round.motion = true;
      global.addEventListener('deviceorientation', onOrientation);
      readyMessage = '';
    } catch (error) {
      if (!opened || id !== requestId) return;
      round.motion = false;
      readyMessage =
        error.message === 'denied'
          ? 'L’accès aux mouvements a été refusé. Tu peux jouer avec les boutons.'
          : 'Les mouvements ne sont pas disponibles ici. Tu peux jouer avec les boutons.';
    } finally {
      if (opened && id === requestId) {
        permissionPending = false;
        readySince = Date.now();
        renderReady();
      }
    }
  }

  function startRound(player) {
    if (names().length < 2) {
      options.editPlayers(() => startRound(names().includes(player) ? player : names()[0]));
      return;
    }
    if (!names().includes(player)) player = names()[0];
    const words = pool();
    if (!words.length) return;
    initializeAudio();
    stopSensors();
    round = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      player: player || '',
      duration: store.config.duration,
      remaining: store.config.duration * 1000,
      themes: decks().map((d) => d.id),
      themeLabel: 'Tous les mots',
      clues: store.config.clues,
      pool: words,
      seen: [],
      rows: [],
      word: '',
      motion: store.config.controls === 'motion',
      armed: false,
      pending: null,
      finished: false,
      deadline: 0,
      team:
        store.teams.enabled && names().length >= 4
          ? (() => {
              const index = store.teams.members.findIndex((list) => list.includes(player));
              return {
                index,
                label: `Équipe ${index + 1}`,
                members: store.teams.members[index].slice(),
              };
            })()
          : null,
    };
    round.cloud = global.JDDCloud.begin('heads', round.team ? round.team.members : [round.player]);
    resume = false;
    readyMessage = '';
    save();
    if (round.motion) enableMotion();
    else {
      readySince = Date.now();
      renderReady();
    }
  }

  function renderReady() {
    setPhase('ready');
    const status =
      readyMessage ||
      (round.motion
        ? landscape()
          ? 'Place le téléphone au front et tiens-le droit.'
          : 'Tourne le téléphone à l’horizontale.'
        : 'Au signal, tes amis te font deviner le mot.');
    root.innerHTML = `${topbar('Devine Tête')}<section class="hu-panel hu-ready">${windowBar('PRÉPARATION')}<h1>${escape(round.player || 'Prêt ?')}</h1><div class="hu-phone" aria-hidden="true"><span>?</span></div>${round.motion ? '<h2>Téléphone au front</h2>' : ''}<p>${round.motion ? 'Tourne le téléphone à l’horizontale, puis place-le contre ton front, écran vers tes amis. La manche démarre quand tu es prêt.' : 'Place le téléphone sur ton front. Un ami utilise les boutons pour valider ou passer.'}</p><p id="hu-sensor-status" class="hu-status" role="status">${escape(status)}</p>${round.motion ? '<p class="hu-help">Si l’écran ne tourne pas, désactive le verrouillage portrait de ton téléphone.</p><div class="hu-gesture-guide"><span>↓ Baisser = trouvé</span><span>↑ Lever = passer</span></div>' : ''}<button class="hu-button" data-act="${round.motion ? 'buttons' : 'countdown'}" type="button" ${permissionPending ? 'disabled' : ''}>${round.motion ? 'Jouer avec les boutons' : 'Lancer le compte à rebours'}</button><button class="hu-text-button" data-act="settings" type="button">Choisir le joueur</button></section>`;
    window.scrollTo(0, 0);
  }

  function beginCountdown() {
    if (!round || permissionPending) return;
    initializeAudio();
    setPhase('countdown');
    countdownEnd = Date.now() + 3000;
    lastCount = 3;
    round.armed = false;
    root.innerHTML = `${topbar('Devine Tête')}<section class="hu-countdown"><span class="hu-pill">${escape(round.player || 'Devine Tête')}</span><p>Téléphone au front.<br>Ne regarde pas l’écran.</p><strong id="hu-count" role="status">3</strong><p>${round.clues === 'mime' ? 'Faites deviner sans parler.' : 'Donnez des indices sans dire le mot.'}</p><button class="hu-pill" data-act="cancel-countdown" type="button">Annuler</button></section>`;
    beep(440);
    keepAwake();
  }

  function nextWord() {
    let eligible = round.pool.filter((w) => !round.seen.includes(key(w)));
    if (!eligible.length) {
      finish('Tout le paquet est passé !');
      return;
    }
    let fresh = eligible.filter((w) => !store.used.includes(key(w)));
    if (!fresh.length) {
      const selected = new Set(round.pool.map(key));
      store.used = store.used.filter((w) => !selected.has(w));
      fresh = eligible;
    }
    round.word = fresh[Math.floor(Math.random() * fresh.length)];
    round.seen.push(key(round.word));
    store.used.push(key(round.word));
    store.used = store.used.slice(-rememberedWordsLimit());
    round.pending = null;
    round.armed = !round.motion || Boolean(neutralSince && Date.now() - neutralSince >= 250);
    save();
    renderPlay();
  }

  function beginPlay() {
    setPhase('playing');
    round.deadline = Date.now() + round.remaining;
    beep(880, 0.2);
    if (resume && round.word) {
      round.pending = null;
      round.armed = false;
      renderPlay();
      save();
    } else nextWord();
    keepAwake();
  }

  function renderPlay() {
    setPhase('playing');
    root.innerHTML = `<section class="hu-live"><header class="hu-live-header">${menuButton(true)}<button class="hu-pill" data-act="pause" type="button" aria-label="Mettre la manche en pause"><span aria-hidden="true">Ⅱ</span><span class="hu-pause-label"> Pause</span></button><span class="hu-live-player">${escape(round.player || 'Devine Tête')}</span>${teamCaption()}<span id="hu-streak" class="jdd-streak" role="img" aria-label="${streakCount()} bonnes réponses de suite" ${streakCount() < 2 ? 'hidden' : ''}>${global.JDDVisuals.streak(streakCount())}</span><span class="hu-pill hu-pill--pink"><span id="hu-points">${score(round.rows)}</span> pt</span><span id="hu-timer" class="hu-pill hu-pill--yellow" aria-label="Temps restant">${timeLabel(round.remaining)}</span></header><div class="hu-word-card" id="hu-word-card">${windowBar(round.clues === 'mime' ? 'MIME · SANS PARLER' : 'FAIS DEVINER SANS DIRE LE MOT')}<div class="hu-word-area"><h1 id="hu-word" aria-live="polite">${escape(round.word)}</h1><p id="hu-feedback-hint"></p></div><div class="hu-time-track" aria-hidden="true"><span id="hu-time-progress"></span></div><div class="hu-floor" aria-hidden="true"></div></div><footer class="hu-live-footer"><button class="hu-button hu-button--pink" data-act="pass" type="button">${global.JDDVisuals.arrow('up')} Passer</button><p>${round.motion ? 'Lève pour passer · baisse pour valider<br>Reviens au front entre deux mots.' : 'Un ami valide ou passe avec les boutons.'}</p><button class="hu-button hu-button--green" data-act="correct" type="button">${global.JDDVisuals.arrow('down')} Trouvé !</button></footer></section>`;
    fitWord();
    updateTimer();
  }

  function fitWord() {
    requestAnimationFrame(() => {
      const word = root.querySelector('#hu-word');
      if (!word) return;
      const box = word.parentElement;
      let size = Math.min(100, global.innerHeight * 0.23, global.innerWidth * 0.12);
      word.style.fontSize = `${size}px`;
      // Les expressions passent à la ligne aux espaces. Un mot seul reste entier.
      while (
        size > 2 &&
        (word.scrollWidth > box.clientWidth - 16 || word.scrollHeight > box.clientHeight - 40)
      ) {
        size = Math.max(2, size - 2);
        word.style.fontSize = `${size}px`;
      }
    });
  }

  function updateTimer() {
    const label = root.querySelector('#hu-timer');
    if (!label) return;
    label.textContent = timeLabel(round.remaining);
    label.classList.toggle('hu-last-seconds', round.remaining <= 10000);
    root.querySelector('#hu-time-progress').style.width =
      `${Math.max(0, (round.remaining / (round.duration * 1000)) * 100)}%`;
  }

  function mark(status) {
    if (phase !== 'playing' || round.pending) return;
    round.remaining = Math.max(0, round.deadline - Date.now());
    if (!round.remaining) {
      finish('Temps écoulé !');
      return;
    }
    round.rows.push({ word: round.word, status });
    round.armed = false;
    round.pending = { status, until: Date.now() + 650 };
    gesture = null;
    neutralSince = 0;
    const good = status === 'correct';
    root.querySelector('#hu-word-card').dataset.feedback = status;
    root.querySelector('#hu-word').textContent = good ? 'Trouvé !' : 'Passé !';
    root.querySelector('#hu-feedback-hint').textContent = round.motion
      ? 'Reviens au front pour le prochain mot.'
      : '';
    root.querySelector('#hu-points').textContent = score(round.rows);
    global.JDDVisuals.updateStreak(root.querySelector('#hu-streak'), streakCount());
    root.querySelectorAll('[data-act="correct"], [data-act="pass"]').forEach((b) => {
      b.disabled = true;
    });
    fitWord();
    playFeedback(status);
    if (navigator.vibrate) navigator.vibrate(good ? 60 : [30, 30, 30]);
    save();
  }

  function pause(message = 'Prends ton temps, le chrono est en pause.') {
    if (phase !== 'playing') return;
    round.remaining = Math.max(0, round.deadline - Date.now());
    if (!round.remaining) {
      finish('Temps écoulé !');
      return;
    }
    // Un mot déjà validé doit être consommé avant de reprendre.
    if (round.pending) {
      round.word = '';
      round.pending = null;
    }
    round.deadline = 0;
    round.armed = false;
    stopSensors();
    setPhase('paused');
    releaseAwake();
    save();
    root.innerHTML = `${topbar('Manche en pause')}<section class="hu-panel hu-paused">${windowBar('PETITE PAUSE')}<h1>On souffle.</h1><p>${escape(message)}</p><div class="hu-pause-stats"><strong>${timeLabel(round.remaining)}</strong><span>${score(round.rows)} point${score(round.rows) > 1 ? 's' : ''}</span></div><button class="hu-button" data-act="resume" type="button">Reprendre la manche</button>${round.motion ? '<button class="hu-button hu-button--pink" data-act="resume-buttons" type="button">Reprendre avec les boutons</button>' : ''}<button class="hu-text-button" data-act="finish" type="button">Terminer cette manche</button></section>`;
    window.scrollTo(0, 0);
  }

  function resumeRound(buttons = false) {
    if (!round || round.finished) return;
    initializeAudio();
    resume = Boolean(round.word);
    if (buttons) round.motion = false;
    readyMessage = '';
    if (round.motion) enableMotion();
    else {
      stopSensors();
      readySince = Date.now();
      renderReady();
    }
  }

  function finish(reason) {
    if (!round || round.finished) return;
    const timedOut = reason === 'Temps écoulé !';
    if (timedOut && round.word && !round.pending)
      round.rows.push({ word: round.word, status: 'unplayed' });
    round.finished = true;
    round.reason = reason;
    round.remaining = Math.max(0, round.remaining);
    store.history.push({
      id: round.id,
      player: round.player,
      participant: roundParticipant(),
      team: round.team || null,
      themeLabel: round.themeLabel,
      duration: round.duration,
      rows: round.rows,
    });
    store.history = store.history.slice(-30);
    if (round.team) {
      const total = store.teams.totals[round.team.index];
      total.points += score(round.rows);
      total.rounds += 1;
    } else if (round.player) {
      const total = personalTotal(true);
      total.points += score(round.rows);
      total.rounds += 1;
    }
    const people = names(),
      index = people.indexOf(round.player);
    if (round.team && store.teams.enabled && people.length >= 4) {
      const other = store.teams.members[1 - round.team.index];
      const last = store.history
        .slice()
        .reverse()
        .find((r) => r.team && r.team.index === 1 - round.team.index);
      store.nextPlayer = other[(other.indexOf(last?.player) + 1) % other.length];
    } else store.nextPlayer = people.length ? people[(index + 1) % people.length] : '';
    stopSensors();
    releaseAwake();
    recordCloudRound();
    save();
    beep(880, 0.15);
    beep(660, 0.15, 0.18);
    beep(440, 0.3, 0.36);
    renderResults();
  }

  function recordCloudRound() {
    if (!round?.cloud) return;
    global.JDDCloud.record(
      round.cloud,
      round.cloud.participants.map((participant) => ({
        participant,
        metrics: {
          games: 1,
          words_found: score(round.rows),
          words_passed: round.rows.filter((r) => r.status === 'pass').length,
          points: score(round.rows),
        },
      })),
      {
        rows: round.rows.map((r) => ({ word: r.word, status: r.status })),
        team: Boolean(round.team),
      }
    );
  }
  function roundParticipant() {
    return round.cloud?.participants.find((p) => p.label === round.player) || null;
  }
  function personalTotal(create = false) {
    const participant = roundParticipant();
    let total = store.totals.find((t) =>
      participant?.kind === 'account'
        ? t.participant?.kind === 'account' && t.participant.id === participant.id
        : t.participant?.kind !== 'account' && t.player === round.player
    );
    if (!total && create) {
      total = { player: round.player, participant, points: 0, rounds: 0 };
      store.totals.push(total);
    }
    return total;
  }

  function renderResults() {
    setPhase('results');
    const points = score(round.rows),
      passed = round.rows.filter((r) => r.status === 'pass').length;
    root.innerHTML = `${topbar('Bilan de la manche')}<section class="hu-panel hu-results">${windowBar('RÉSULTATS')}<h1>${escape(round.reason)}</h1><p>${round.team ? `${escape(round.team.label)} · ` : ''}${escape(round.player || 'Votre manche')} · ${round.duration} secondes</p><div class="hu-result-score"><strong id="hu-result-points">${points}</strong><span>mot${points > 1 ? 's' : ''} trouvé${points > 1 ? 's' : ''}</span><small>${passed} passé${passed > 1 ? 's' : ''} · ${round.clues === 'mime' ? 'Mimes' : 'Indices'}</small></div><ul class="hu-results-list">${round.rows.map((r, i) => `<li data-status="${r.status}"><span aria-hidden="true">${r.status === 'correct' ? '✓' : r.status === 'pass' ? '↑' : '—'}</span><span>${escape(r.word)}<small>${r.status === 'correct' ? 'Trouvé' : r.status === 'pass' ? 'Passé' : 'Temps écoulé'}</small></span>${r.status === 'unplayed' ? '' : `<button type="button" data-correct-row="${i}" aria-label="Corriger le résultat de ${escape(r.word)}">Corriger</button>`}</li>`).join('')}</ul><button class="hu-button" data-act="next-round" type="button">${store.nextPlayer ? `Au tour de ${escape(store.nextPlayer)}` : 'Nouvelle manche'} ${global.JDDVisuals.arrow()}</button><button class="hu-text-button" data-act="settings" type="button">Choisir le joueur</button><div class="hu-floor" aria-hidden="true"></div></section>${historyMarkup()}`;
    window.scrollTo(0, 0);
  }

  function tick() {
    if (!opened || !round) return;
    const now = Date.now();
    if (phase === 'ready' && round.motion && !permissionPending) {
      const status = root.querySelector('#hu-sensor-status');
      if (now - readySince > 4000 && (!sensor || now - sensor.at > 2000)) {
        stopSensors();
        round.motion = false;
        readyMessage =
          'Aucun mouvement détecté. Vérifie les autorisations de ton navigateur, ou joue avec les boutons.';
        renderReady();
      } else if (!landscape()) status.textContent = 'Tourne le téléphone à l’horizontale.';
      else if (neutral() && neutralSince && now - neutralSince >= 600) beginCountdown();
      else status.textContent = 'Place le téléphone au front et tiens-le droit.';
    } else if (phase === 'countdown') {
      if (round.motion && (!landscape() || !neutral())) {
        releaseAwake();
        readySince = now;
        renderReady();
        return;
      }
      const count = Math.max(1, Math.ceil((countdownEnd - now) / 1000));
      if (now >= countdownEnd) beginPlay();
      else if (count !== lastCount) {
        lastCount = count;
        root.querySelector('#hu-count').textContent = count;
        beep(440);
      }
    } else if (phase === 'playing') {
      round.remaining = Math.max(0, round.deadline - now);
      if (!round.remaining) {
        finish('Temps écoulé !');
        return;
      }
      updateTimer();
      if (round.motion && sensor && now - sensor.at > 5000) {
        pause('Les mouvements ne répondent plus. Tu peux reprendre avec les boutons.');
        return;
      }
      if (
        round.pending &&
        now >= round.pending.until &&
        (!round.motion || (neutralSince && now - neutralSince >= 250))
      )
        nextWord();
      if (!round.pending && neutralSince && now - neutralSince >= 250) round.armed = true;
    }
  }

  function backToSettings() {
    ++requestId;
    permissionPending = false;
    stopSensors();
    releaseAwake();
    if (phase === 'playing') pause();
    if (round && !round.finished) {
      round.deadline = 0;
      save();
    }
    renderSetup();
  }

  function exit() {
    if (phase === 'playing') pause();
    ++requestId;
    permissionPending = false;
    opened = false;
    stopSensors();
    releaseAwake();
    clearInterval(clock);
    clock = null;
    if (round && !round.finished) {
      round.deadline = 0;
      save();
    }
    document.body.classList.remove('hu-open', 'hu-playing');
    options.onExit();
  }

  function onClick(event) {
    const correction = event.target.closest('[data-correct-row]');
    if (correction && phase === 'results') {
      const row = round.rows[Number(correction.dataset.correctRow)];
      row.status = row.status === 'correct' ? 'pass' : 'correct';
      const recorded = store.history.find((r) => r.id === round.id);
      if (recorded) {
        recorded.rows = round.rows;
        const total = round.team ? store.teams.totals[round.team.index] : personalTotal();
        if (total) total.points += row.status === 'correct' ? 1 : -1;
      }
      recordCloudRound();
      save();
      renderResults();
      return;
    }
    const button = event.target.closest('[data-act]');
    const move = event.target.closest('[data-move-player]');
    if (move && phase === 'setup' && store.teams.enabled && !move.disabled) {
      const name = move.dataset.movePlayer;
      const index = store.teams.members.findIndex((list) => list.includes(name));
      if (index >= 0 && store.teams.members[index].length > 1) {
        store.teams.members[index] = store.teams.members[index].filter((n) => n !== name);
        store.teams.members[1 - index].push(name);
        save();
        updateTeams();
      }
      return;
    }
    if (!button || button.disabled) return;
    switch (button.dataset.act) {
      case 'exit':
        exit();
        break;
      case 'shuffle-teams': {
        const people = global.JDD.shuffle(names().slice());
        store.teams.members = [
          people.filter((_, i) => i % 2 === 0),
          people.filter((_, i) => i % 2 === 1),
        ];
        save();
        updateTeams();
        break;
      }
      case 'edit-players':
        options.editPlayers(onPlayersChanged);
        break;
      case 'settings':
        backToSettings();
        break;
      case 'buttons':
        ++requestId;
        permissionPending = false;
        round.motion = false;
        stopSensors();
        beginCountdown();
        break;
      case 'countdown':
        beginCountdown();
        break;
      case 'cancel-countdown':
        backToSettings();
        break;
      case 'correct':
        mark('correct');
        break;
      case 'pass':
        mark('pass');
        break;
      case 'pause':
        pause();
        break;
      case 'resume':
        resumeRound();
        break;
      case 'resume-buttons':
        resumeRound(true);
        break;
      case 'finish':
        finish('Manche terminée');
        break;
      case 'next-round':
        startRound(store.nextPlayer);
        break;
      case 'clear-history':
        if (global.confirm('Effacer les scores de Devine Tête sur ce téléphone ?')) {
          store.history = [];
          store.totals = [];
          store.teams.totals = [
            { points: 0, rounds: 0 },
            { points: 0, rounds: 0 },
          ];
          save();
          if (phase === 'results') renderResults();
          else renderSetup();
        }
        break;
    }
  }

  function onChange(event) {
    const el = event.target;
    if (el.id === 'hu-teams-enabled') {
      store.teams.enabled = el.checked && names().length >= 4;
      syncTeams();
      save();
      updateTeams();
      return;
    }
  }

  function init(config) {
    if (root) return;
    root = document.getElementById('heads');
    if (!root) return;
    options = Object.assign(options, config || {});
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', (event) => {
      if (event.target.id !== 'hu-config') return;
      event.preventDefault();
      startRound(selectedPlayer());
    });
    document.addEventListener('visibilitychange', () => {
      if (!opened || document.visibilityState !== 'hidden') return;
      if (phase === 'playing') pause('L’application a quitté l’écran. Le chrono est en pause.');
      else if (phase === 'countdown' || phase === 'ready') backToSettings();
    });
    global.addEventListener('pagehide', () => {
      if (opened && phase === 'playing') pause();
    });
    global.addEventListener('resize', () => {
      if (opened && phase === 'playing' && round.motion && !landscape())
        pause('Tourne le téléphone à l’horizontale avant de reprendre.');
      else if (opened && phase === 'playing') fitWord();
    });
    global.addEventListener('keydown', (event) => {
      if (!opened || phase !== 'playing' || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        mark(event.key === 'ArrowDown' ? 'correct' : 'pass');
      } else if (event.key.toLowerCase() === 'p') pause();
    });
  }

  function onOpen() {
    if (!root) return;
    if (!store) {
      store = load();
      const active = store.active;
      if (
        active &&
        !active.finished &&
        Array.isArray(active.pool) &&
        active.pool.every((w) => typeof w === 'string') &&
        Array.isArray(active.rows) &&
        Array.isArray(active.seen) &&
        Number.isFinite(active.remaining) &&
        active.remaining > 0 &&
        typeof active.word === 'string'
      ) {
        round = active;
        if (round.deadline) round.remaining = Math.max(0, round.deadline - Date.now());
        round.deadline = 0;
        if (round.pending) {
          round.word = '';
          round.pending = null;
        }
      }
    }
    opened = true;
    document.body.classList.add('hu-open');
    clock = setInterval(tick, 50);
    if (round && !round.finished && round.remaining <= 0) finish('Temps écoulé !');
    else renderSetup();
  }

  global.JDDModules = global.JDDModules || {};
  function hasActiveGame() {
    const active = round || (store || load()).active;
    return Boolean(active && !active.finished);
  }

  global.JDDModules.heads = { init, onOpen, onPlayersChanged, hasActiveGame };
})(window);

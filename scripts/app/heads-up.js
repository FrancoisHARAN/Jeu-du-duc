/* Devine Tête : un jeu local de devinettes, sans dépendance ni serveur. */
(function (global) {
  'use strict';
  const STORE_KEY = 'jdd.heads.v1';
  const DEFAULTS = { duration: 60, controls: 'motion', clues: 'describe', sound: true, custom: '' };
  const NEUTRAL = .24;
  const TRIGGER = .64;
  const HOME_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
  let root, store, round = null, phase = 'setup', opened = false;
  let options = { onExit() {}, getSuggestedNames() { return []; }, editPlayers() {} };
  let clock = null, audio = null, wakeLock = null, permissionPending = false;
  let sensor = null, neutralSince = 0, gesture = null, gestureSince = 0, readySince = 0;
  let countdownEnd = 0, lastCount = 0, requestId = 0, readyMessage = '', resume = false;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const decks = () => global.JDD.HEADS_DECKS || [];
  const key = word => word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
  const timeLabel = ms => `${Math.floor(Math.ceil(ms / 1000) / 60)}:${String(Math.ceil(ms / 1000) % 60).padStart(2, '0')}`;
  const score = rows => rows.filter(row => row.status === 'correct').length;
  const names = () => options.getSuggestedNames().filter(name => typeof name === 'string' && name.trim());

  function load() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) { /* stockage privé */ }
    // Les nouvelles manches utilisent tous les mots et les mêmes réglages simples.
    // Les anciens mots personnels et les manches en pause restent conservés.
    const config = { ...DEFAULTS, custom: typeof (saved && saved.config && saved.config.custom) === 'string' ? saved.config.custom.slice(0, 14000) : '' };
    const history = saved && Array.isArray(saved.history) ? saved.history.filter(r => r && typeof r.player === 'string' && Array.isArray(r.rows)).slice(-30) : [];
    const totals = saved && Array.isArray(saved.totals) ? saved.totals.filter(t => t && typeof t.player === 'string' && Number.isFinite(t.points) && Number.isFinite(t.rounds)) : [];
    if (!saved || !Array.isArray(saved.totals)) {
      history.forEach(r => {
        if (!r.player) return;
        let total = totals.find(t => t.player === r.player);
        if (!total) { total = { player: r.player, points: 0, rounds: 0 }; totals.push(total); }
        total.points += score(r.rows); total.rounds += 1;
      });
    }
    return {
      config,
      used: saved && Array.isArray(saved.used) ? saved.used.filter(w => typeof w === 'string').slice(-1000) : [],
      history, totals,
      active: saved && saved.active,
      nextPlayer: saved && typeof saved.nextPlayer === 'string' ? saved.nextPlayer : '',
    };
  }

  function save() {
    store.active = round && !round.finished ? round : null;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) { /* jeu disponible sans stockage */ }
  }

  function customWords() {
    return store.config.custom.split(/\r?\n/).map(w => w.trim()).filter(w => w && w.length <= 60).slice(0, 200);
  }

  function pool() {
    const all = [...decks().flatMap(d => d.words), ...customWords()];
    return [...new Map(all.map(word => [key(word), word])).values()];
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

  function playerChoices(people, selected) {
    return people.length ? people.map((name) => `<label class="hu-player-choice"><input type="radio" name="hu-player" value="${escape(name)}" ${name === selected ? 'checked' : ''}><span class="hu-player-avatar" aria-hidden="true">${escape(name.trim().charAt(0).toUpperCase())}</span><span class="hu-player-name">${escape(name)}</span></label>`).join('') : '<p class="hu-help">Ajoute les joueurs de la bande pour commencer.</p>';
  }

  function selectedPlayer() {
    const choice = root.querySelector('input[name="hu-player"]:checked');
    return choice ? choice.value : '';
  }

  function renderSetup() {
    setPhase('setup');
    const people = names();
    const player = people.includes(store.nextPlayer) ? store.nextPlayer : people[0] || '';
    root.innerHTML = `${topbar('Jeu de devinettes')}
      <section class="hu-panel">
        ${windowBar('LE MOT EST SUR TA TÊTE')}
        <div class="hu-intro"><img src="image/home/mascotte.webp" alt="" width="1254" height="1254"><div><h1>Devine<br>Tête</h1><p>Les potes expliquent.<br>Toi, tu devines.</p></div></div>
        <form id="hu-config" class="hu-config">
          <fieldset class="hu-player-picker"><legend>Qui devine ?</legend><div id="hu-player" class="hu-player-grid">${playerChoices(people, player)}</div><div class="hu-player-note"><p id="hu-players-note" class="hu-help">${people.length} joueur${people.length > 1 ? 's' : ''} · La bande de l’accueil.</p><button class="hu-text-button" data-act="edit-players" type="button">Modifier les joueurs</button></div></fieldset>
          <button id="hu-start" class="hu-button" type="submit">Lancer la partie <span aria-hidden="true">↗</span></button><p id="hu-selection" class="hu-selection" role="status"></p>
        </form>
        ${round && !round.finished ? '<div class="hu-resume"><p>Une manche est en pause.</p><button class="hu-button hu-button--green" data-act="resume" type="button">Reprendre la manche</button></div>' : ''}
        <div class="hu-floor" aria-hidden="true"></div>
      </section>${store.history.length ? `<details class="hu-history-summary"><summary>Les scores de la bande</summary>${historyMarkup()}</details>` : ''}`;
    updateSelection();
    window.scrollTo(0, 0);
  }

  function updateSelection() {
    const count = pool().length;
    root.querySelector('#hu-selection').textContent = count ? `${count} mots mélangés · 60 secondes` : 'Aucun mot disponible pour le moment.';
    root.querySelector('#hu-start').disabled = !count || names().length < 2;
  }

  function onPlayersChanged() {
    if (!opened || phase !== 'setup') return;
    const picker = root.querySelector('#hu-player');
    const people = names();
    const previous = selectedPlayer();
    const selected = people.includes(previous) ? previous : people[0] || '';
    picker.innerHTML = playerChoices(people, selected);
    store.nextPlayer = selected;
    root.querySelector('#hu-players-note').textContent = `${people.length} joueur${people.length > 1 ? 's' : ''} · La bande de l’accueil.`;
    updateSelection();
    save();
  }

  function historyMarkup() {
    if (!store.history.length) return '';
    const totals = new Map();
    store.totals.forEach(t => totals.set(t.player, t));
    return `<section class="hu-panel hu-history">${windowBar('LES MANCHES DE LA BANDE')}${totals.size ? `<h2>Les scores</h2><ul class="hu-score-list">${[...totals].sort((a, b) => b[1].points - a[1].points).map(([name, total]) => `<li><span>${escape(name)}<small>${total.rounds} manche${total.rounds > 1 ? 's' : ''}</small></span><strong>${total.points} pt${total.points > 1 ? 's' : ''}</strong></li>`).join('')}</ul>` : ''}<h2>Dernières manches</h2><ul class="hu-score-list">${store.history.slice(-5).reverse().map(r => `<li><span>${escape(r.player || 'Sans prénoms')}<small>${escape(r.themeLabel)} · ${r.duration} s</small></span><strong>${score(r.rows)} pt${score(r.rows) > 1 ? 's' : ''}</strong></li>`).join('')}</ul><button class="hu-text-button" data-act="clear-history" type="button">Effacer les scores</button></section>`;
  }

  function initializeAudio() {
    if (!store.config.sound) return;
    try {
      const Audio = global.AudioContext || global.webkitAudioContext;
      if (!audio && Audio) audio = new Audio();
      if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { /* le son est facultatif */ }
  }

  function beep(frequency, duration = .12, delay = 0) {
    if (!store.config.sound || !audio || audio.state !== 'running') return;
    try {
      const osc = audio.createOscillator(), gain = audio.createGain();
      const start = audio.currentTime + delay;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.12, start);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      osc.connect(gain); gain.connect(audio.destination);
      osc.start(start); osc.stop(start + duration);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch (_) { /* pas de son, le chrono continue */ }
  }

  async function keepAwake() {
    if (!navigator.wakeLock || wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (!opened || !['countdown', 'playing'].includes(phase)) { await lock.release(); return; }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } catch (_) { /* certains téléphones ne proposent pas cette fonction */ }
  }

  function releaseAwake() {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  function stopSensors() {
    global.removeEventListener('deviceorientation', onOrientation);
    sensor = null; neutralSince = 0; gesture = null; gestureSince = 0;
  }

  function landscape() { return global.innerWidth > global.innerHeight; }
  function neutral() { return sensor && Date.now() - sensor.at < 1000 && Math.abs(sensor.z) < NEUTRAL && Math.abs(sensor.y) < .45; }

  function onOrientation(event) {
    if (!opened || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    const beta = event.beta * Math.PI / 180, gamma = event.gamma * Math.PI / 180;
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
    if (!action) { gesture = null; return; }
    if (gesture !== action) { gesture = action; gestureSince = now; }
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
      if (typeof request === 'function' && await request.call(global.DeviceOrientationEvent) !== 'granted') throw new Error('denied');
      if (!opened || id !== requestId) return;
      stopSensors();
      round.motion = true;
      global.addEventListener('deviceorientation', onOrientation);
      readyMessage = '';
    } catch (error) {
      if (!opened || id !== requestId) return;
      round.motion = false;
      readyMessage = error.message === 'denied' ? 'L’accès aux mouvements a été refusé. Tu peux jouer avec les boutons.' : 'Les mouvements ne sont pas disponibles ici. Tu peux jouer avec les boutons.';
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
      player: player || '', duration: store.config.duration, remaining: store.config.duration * 1000,
      themes: decks().map(d => d.id), themeLabel: 'Tous les mots',
      clues: store.config.clues, pool: words, seen: [], rows: [], word: '',
      motion: store.config.controls === 'motion', armed: false, pending: null, finished: false, deadline: 0,
    };
    resume = false;
    readyMessage = '';
    save();
    if (round.motion) enableMotion();
    else { readySince = Date.now(); renderReady(); }
  }

  function renderReady() {
    setPhase('ready');
    const status = readyMessage || (round.motion ? (landscape() ? 'Place le téléphone au front et tiens-le droit.' : 'Tourne le téléphone à l’horizontale.') : 'Au signal, tes amis te font deviner le mot.');
    root.innerHTML = `${topbar('Devine Tête')}<section class="hu-panel hu-ready">${windowBar(resume ? 'ON REPREND ?' : 'À TOI DE DEVINER')}<h1>${escape(round.player || 'Prêt ?')}</h1><div class="hu-phone" aria-hidden="true"><span>?</span></div><h2>${round.motion ? 'Téléphone au front' : 'À toi de jouer'}</h2><p>${round.motion ? 'Tourne le téléphone à l’horizontale, puis place-le contre ton front, écran vers tes amis. La manche démarre quand tu es prêt.' : 'Place le téléphone sur ton front. Un ami utilise les boutons pour valider ou passer.'}</p><p id="hu-sensor-status" class="hu-status" role="status">${escape(status)}</p>${round.motion ? '<p class="hu-help">Si l’écran ne tourne pas, désactive le verrouillage portrait de ton téléphone.</p><div class="hu-gesture-guide"><span>↓ Baisser = trouvé</span><span>↑ Lever = passer</span></div>' : ''}<button class="hu-button" data-act="${round.motion ? 'buttons' : 'countdown'}" type="button" ${permissionPending ? 'disabled' : ''}>${round.motion ? 'Jouer avec les boutons' : 'Lancer le compte à rebours'}</button><button class="hu-text-button" data-act="settings" type="button">Choisir le joueur</button></section>`;
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
    let eligible = round.pool.filter(w => !round.seen.includes(key(w)));
    if (!eligible.length) { finish('Tout le paquet est passé !'); return; }
    let fresh = eligible.filter(w => !store.used.includes(key(w)));
    if (!fresh.length) {
      const selected = new Set(round.pool.map(key));
      store.used = store.used.filter(w => !selected.has(w));
      fresh = eligible;
    }
    round.word = fresh[Math.floor(Math.random() * fresh.length)];
    round.seen.push(key(round.word));
    store.used.push(key(round.word));
    store.used = store.used.slice(-1000);
    round.pending = null;
    round.armed = !round.motion || Boolean(neutralSince && Date.now() - neutralSince >= 250);
    save();
    renderPlay();
  }

  function beginPlay() {
    setPhase('playing');
    round.deadline = Date.now() + round.remaining;
    beep(880, .2);
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
    root.innerHTML = `<section class="hu-live"><header class="hu-live-header">${menuButton(true)}<button class="hu-pill" data-act="pause" type="button" aria-label="Mettre la manche en pause"><span aria-hidden="true">Ⅱ</span><span class="hu-pause-label"> Pause</span></button><span class="hu-live-player">${escape(round.player || 'Devine Tête')}</span><span class="hu-pill hu-pill--pink"><span id="hu-points">${score(round.rows)}</span> pt</span><span id="hu-timer" class="hu-pill hu-pill--yellow" aria-label="Temps restant">${timeLabel(round.remaining)}</span></header><div class="hu-word-card" id="hu-word-card">${windowBar(round.clues === 'mime' ? 'MIME · SANS PARLER' : 'FAIS DEVINER SANS DIRE LE MOT')}<div class="hu-word-area"><h1 id="hu-word" aria-live="polite">${escape(round.word)}</h1><p id="hu-feedback-hint"></p></div><div class="hu-time-track" aria-hidden="true"><span id="hu-time-progress"></span></div><div class="hu-floor" aria-hidden="true"></div></div><footer class="hu-live-footer"><button class="hu-button hu-button--pink" data-act="pass" type="button"><span aria-hidden="true">↑</span> Passer</button><p>${round.motion ? 'Lève pour passer · baisse pour valider<br>Reviens au front entre deux mots.' : 'Un ami valide ou passe avec les boutons.'}</p><button class="hu-button hu-button--green" data-act="correct" type="button"><span aria-hidden="true">↓</span> Trouvé !</button></footer></section>`;
    fitWord();
    updateTimer();
  }

  function fitWord() {
    requestAnimationFrame(() => {
      const word = root.querySelector('#hu-word');
      if (!word) return;
      const box = word.parentElement;
      let size = Math.min(100, global.innerHeight * .23, global.innerWidth * .12);
      word.style.fontSize = `${size}px`;
      // Les expressions passent à la ligne aux espaces. Un mot seul reste entier.
      while (size > 2 && (word.scrollWidth > box.clientWidth - 16 || word.scrollHeight > box.clientHeight - 40)) {
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
    root.querySelector('#hu-time-progress').style.width = `${Math.max(0, round.remaining / (round.duration * 1000) * 100)}%`;
  }

  function mark(status) {
    if (phase !== 'playing' || round.pending) return;
    round.remaining = Math.max(0, round.deadline - Date.now());
    if (!round.remaining) { finish('Temps écoulé !'); return; }
    round.rows.push({ word: round.word, status });
    round.armed = false;
    round.pending = { status, until: Date.now() + 650 };
    gesture = null; neutralSince = 0;
    const good = status === 'correct';
    root.querySelector('#hu-word-card').dataset.feedback = status;
    root.querySelector('#hu-word').textContent = good ? 'Trouvé !' : 'Passé !';
    root.querySelector('#hu-feedback-hint').textContent = round.motion ? 'Reviens au front pour le prochain mot.' : 'Le prochain mot arrive…';
    root.querySelector('#hu-points').textContent = score(round.rows);
    root.querySelectorAll('[data-act="correct"], [data-act="pass"]').forEach(b => { b.disabled = true; });
    fitWord();
    if (good) { beep(660); beep(880, .14, .1); } else beep(220, .18);
    if (navigator.vibrate) navigator.vibrate(good ? 60 : [30, 30, 30]);
    save();
  }

  function pause(message = 'Prends ton temps, le chrono est en pause.') {
    if (phase !== 'playing') return;
    round.remaining = Math.max(0, round.deadline - Date.now());
    if (!round.remaining) { finish('Temps écoulé !'); return; }
    // Un mot déjà validé doit être consommé avant de reprendre.
    if (round.pending) { round.word = ''; round.pending = null; }
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
    else { stopSensors(); readySince = Date.now(); renderReady(); }
  }

  function finish(reason) {
    if (!round || round.finished) return;
    const timedOut = reason === 'Temps écoulé !';
    if (timedOut && round.word && !round.pending) round.rows.push({ word: round.word, status: 'unplayed' });
    round.finished = true;
    round.reason = reason;
    round.remaining = Math.max(0, round.remaining);
    store.history.push({ id: round.id, player: round.player, themeLabel: round.themeLabel, duration: round.duration, rows: round.rows });
    store.history = store.history.slice(-30);
    if (round.player) {
      let total = store.totals.find(t => t.player === round.player);
      if (!total) { total = { player: round.player, points: 0, rounds: 0 }; store.totals.push(total); }
      total.points += score(round.rows); total.rounds += 1;
    }
    const people = names(), index = people.indexOf(round.player);
    store.nextPlayer = people.length ? people[(index + 1) % people.length] : '';
    stopSensors(); releaseAwake();
    save();
    beep(880, .15); beep(660, .15, .18); beep(440, .3, .36);
    renderResults();
  }

  function renderResults() {
    setPhase('results');
    const points = score(round.rows), passed = round.rows.filter(r => r.status === 'pass').length;
    root.innerHTML = `${topbar('Bilan de la manche')}<section class="hu-panel hu-results">${windowBar('BIEN JOUÉ, LA BANDE !')}<h1>${escape(round.reason)}</h1><p>${escape(round.player || 'Votre manche')} · ${round.duration} secondes</p><div class="hu-result-score"><strong id="hu-result-points">${points}</strong><span>mot${points > 1 ? 's' : ''} trouvé${points > 1 ? 's' : ''}</span><small>${passed} passé${passed > 1 ? 's' : ''} · ${round.clues === 'mime' ? 'Mimes' : 'Indices'}</small></div><p class="hu-help">Une erreur de validation ? Touche « Corriger » à côté du mot.</p><ul class="hu-results-list">${round.rows.map((r, i) => `<li data-status="${r.status}"><span aria-hidden="true">${r.status === 'correct' ? '✓' : r.status === 'pass' ? '↑' : '—'}</span><span>${escape(r.word)}<small>${r.status === 'correct' ? 'Trouvé' : r.status === 'pass' ? 'Passé' : 'Temps écoulé'}</small></span>${r.status === 'unplayed' ? '' : `<button type="button" data-correct-row="${i}" aria-label="Corriger le résultat de ${escape(r.word)}">Corriger</button>`}</li>`).join('')}</ul><button class="hu-button" data-act="next-round" type="button">${store.nextPlayer ? `Au tour de ${escape(store.nextPlayer)}` : 'Nouvelle manche'} <span aria-hidden="true">↗</span></button><button class="hu-text-button" data-act="settings" type="button">Changer les thèmes et réglages</button><div class="hu-floor" aria-hidden="true"></div></section>${historyMarkup()}`;
    window.scrollTo(0, 0);
  }

  function tick() {
    if (!opened || !round) return;
    const now = Date.now();
    if (phase === 'ready' && round.motion && !permissionPending) {
      const status = root.querySelector('#hu-sensor-status');
      if (now - readySince > 4000 && (!sensor || now - sensor.at > 2000)) {
        stopSensors(); round.motion = false;
        readyMessage = 'Aucun mouvement détecté. Vérifie les autorisations de ton navigateur, ou joue avec les boutons.';
        renderReady();
      } else if (!landscape()) status.textContent = 'Tourne le téléphone à l’horizontale.';
      else if (neutral() && neutralSince && now - neutralSince >= 600) beginCountdown();
      else status.textContent = 'Place le téléphone au front et tiens-le droit.';
    } else if (phase === 'countdown') {
      if (round.motion && (!landscape() || !neutral())) {
        releaseAwake(); readySince = now; renderReady(); return;
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
      if (!round.remaining) { finish('Temps écoulé !'); return; }
      updateTimer();
      if (round.motion && sensor && now - sensor.at > 5000) {
        pause('Les mouvements ne répondent plus. Tu peux reprendre avec les boutons.'); return;
      }
      if (round.pending && now >= round.pending.until && (!round.motion || (neutralSince && now - neutralSince >= 250))) nextWord();
      if (!round.pending && neutralSince && now - neutralSince >= 250) round.armed = true;
    }
  }

  function backToSettings() {
    ++requestId; permissionPending = false;
    stopSensors(); releaseAwake();
    if (phase === 'playing') pause();
    if (round && !round.finished) { round.deadline = 0; save(); }
    renderSetup();
  }

  function exit() {
    if (phase === 'playing') pause();
    ++requestId; permissionPending = false;
    opened = false;
    stopSensors(); releaseAwake();
    clearInterval(clock); clock = null;
    if (round && !round.finished) { round.deadline = 0; save(); }
    document.body.classList.remove('hu-open', 'hu-playing');
    options.onExit();
  }

  function onClick(event) {
    const correction = event.target.closest('[data-correct-row]');
    if (correction && phase === 'results') {
      const row = round.rows[Number(correction.dataset.correctRow)];
      row.status = row.status === 'correct' ? 'pass' : 'correct';
      const recorded = store.history.find(r => r.id === round.id);
      if (recorded) {
        recorded.rows = round.rows;
        const total = store.totals.find(t => t.player === round.player);
        if (total) total.points += row.status === 'correct' ? 1 : -1;
      }
      save(); renderResults(); return;
    }
    const button = event.target.closest('[data-act]');
    if (!button || button.disabled) return;
    switch (button.dataset.act) {
      case 'exit': exit(); break;
      case 'edit-players': options.editPlayers(onPlayersChanged); break;
      case 'settings': backToSettings(); break;
      case 'buttons': ++requestId; permissionPending = false; round.motion = false; stopSensors(); beginCountdown(); break;
      case 'countdown': beginCountdown(); break;
      case 'cancel-countdown': backToSettings(); break;
      case 'correct': mark('correct'); break;
      case 'pass': mark('pass'); break;
      case 'pause': pause(); break;
      case 'resume': resumeRound(); break;
      case 'resume-buttons': resumeRound(true); break;
      case 'finish': finish('Manche terminée'); break;
      case 'next-round': startRound(store.nextPlayer); break;
      case 'clear-history':
        if (global.confirm('Effacer les scores de Devine Tête sur ce téléphone ?')) { store.history = []; store.totals = []; save(); if (phase === 'results') renderResults(); else renderSetup(); }
        break;
    }
  }

  function onChange(event) {
    const el = event.target;
    if (el.name !== 'hu-player' || !el.checked) return;
    store.nextPlayer = el.value;
    save();
  }

  function init(config) {
    if (root) return;
    root = document.getElementById('heads');
    if (!root) return;
    options = Object.assign(options, config || {});
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', event => {
      if (event.target.id !== 'hu-config') return;
      event.preventDefault();
      startRound(selectedPlayer());
    });
    document.addEventListener('visibilitychange', () => {
      if (!opened || document.visibilityState !== 'hidden') return;
      if (phase === 'playing') pause('L’application a quitté l’écran. Le chrono est en pause.');
      else if (phase === 'countdown' || phase === 'ready') backToSettings();
    });
    global.addEventListener('pagehide', () => { if (opened && phase === 'playing') pause(); });
    global.addEventListener('resize', () => {
      if (opened && phase === 'playing' && round.motion && !landscape()) pause('Tourne le téléphone à l’horizontale avant de reprendre.');
      else if (opened && phase === 'playing') fitWord();
    });
    global.addEventListener('keydown', event => {
      if (!opened || phase !== 'playing' || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); mark(event.key === 'ArrowDown' ? 'correct' : 'pass'); }
      else if (event.key.toLowerCase() === 'p') pause();
    });
  }

  function onOpen() {
    if (!root) return;
    if (!store) {
      store = load();
      const active = store.active;
      if (active && !active.finished && Array.isArray(active.pool) && active.pool.every(w => typeof w === 'string') && Array.isArray(active.rows) && Array.isArray(active.seen) && Number.isFinite(active.remaining) && active.remaining > 0 && typeof active.word === 'string') {
        round = active;
        if (round.deadline) round.remaining = Math.max(0, round.deadline - Date.now());
        round.deadline = 0;
        if (round.pending) { round.word = ''; round.pending = null; }
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

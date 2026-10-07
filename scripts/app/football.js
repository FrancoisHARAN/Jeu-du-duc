/* Quiz oral : 60 secondes par manche, arbitrage en un geste et corrections VAR. */
(function (global) {
  'use strict';
  const STORE = 'jdd.football.v2', SETTINGS = 'jdd.football.settings.v1';
  const ROUND_MS = 60000, FEEDBACK_MS = 500;
  const LEVELS = { AMATEUR:'Amateur', CONNAISSEUR:'Connaisseur', EXPERT:'Expert', FOOTIX:'Footix', MIXED:'Tous les niveaux' };
  const HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  const VAR = '<svg viewBox="0 0 36 28" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="32" height="21" rx="3"/><path d="M13 27h10m-5-4v4"/><text x="18" y="16" text-anchor="middle" stroke="none" fill="currentColor" font-size="10" font-weight="900">VAR</text></svg>';
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const words = value => String(value).split(/(\s+)/).map(part => /\s/.test(part) ? esc(part) : `<span class="foot-word">${esc(part)}</span>`).join('');
  let root, options, editor, data, byId, loading, clock, opened = false, request = 0, phase = 'setup', match = null;
  let settings = { difficulty:'AMATEUR', format:'individual', categories:[] };
  let assignments = Object.create(null), reviewRound = 'all';
  let audio = null, feedbackSounds = null;
  const names = () => options.getSuggestedNames().slice();
  const categoryLabel = value => value || 'Non classées';
  const sideIndex = () => match.round % match.sides.length;
  const sideName = () => match.sides[sideIndex()].name;
  const question = () => byId.get(match.deck[match.cursor]);
  const time = ms => `00:${String(Math.ceil(ms / 1000)).padStart(2, '0')}`.replace('00:60', '01:00');
  const button = (action, text, extra = '') => `<button type="button" class="foot-button ${extra}" data-foot="${action}">${text.replace(/ ↗$/, ` ${global.JDDVisuals.arrow()}`)}</button>`;
  function topbar(varAvailable = false) {
    return `<header class="foot-topbar"><button type="button" class="foot-pill" data-foot="exit" aria-label="Revenir au menu principal">${HOME} Menu</button><span class="foot-pill foot-pill--blue">Grand Quiz Foot</span>${varAvailable ? `<button type="button" class="foot-var" data-foot="var" aria-label="VAR : corriger les réponses">${VAR}</button>` : ''}</header>`;
  }
  function windowBar(label) {
    return `<div class="foot-window"><span class="foot-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(label)}</span><span aria-hidden="true">✦</span></div>`;
  }
  function panel(content, label, varAvailable = false) {
    return `${topbar(varAvailable)}<section class="foot-panel">${windowBar(label)}${content}<div class="foot-floor" aria-hidden="true"></div></section>`;
  }
  function screen(next, html) {
    phase = next; root.dataset.screen = next; root.innerHTML = html;
    global.scrollTo(0, 0); fitText();
  }
  function stopClock() { clearInterval(clock); clock = null; }
  function initializeAudio() {
    if (!global.JDDSound.isEnabled()) return;
    try {
      audio = global.JDDSound.getContext();
      if (audio && !feedbackSounds) feedbackSounds = global.JDDFeedbackSounds.build(audio);
    } catch (_) { /* Le jeu continue sans sortie audio. */ }
  }
  function playFeedback(reason) {
    initializeAudio();
    if (!global.JDDSound.isEnabled() || !audio || audio.state === 'closed' || !feedbackSounds?.[reason]) return;
    try {
      const source = audio.createBufferSource();
      source.buffer = feedbackSounds[reason];
      source.connect(global.JDDSound.destination()); global.JDDSound.track(source);
      source.onended = () => source.disconnect();
      source.start();
    } catch (_) { /* Le chrono reste indépendant du son. */ }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(match)); } catch (_) { /* Jeu disponible en mémoire. */ } }
  function saveSettings() { try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch (_) { /* facultatif */ } }
  async function loadData() {
    if (data) return data;
    if (!loading) loading = fetch('data/football.questions.json').then(response => {
      if (!response.ok) throw new Error('Questions indisponibles');
      return response.json();
    }).then(bank => {
      if (!Array.isArray(bank.questions) || !bank.questions.length) throw new Error('Questions indisponibles');
      data = bank.questions; byId = new Map(data.map(q => [q.id, q])); return data;
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  function radios(key, values) {
    return `<div class="foot-choices">${Object.entries(values).map(([value,label]) => `<label><input type="radio" name="foot-${key}" value="${value}" ${String(settings[key]) === value ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>`;
  }
  async function renderSetup() {
    stopClock(); const token = ++request;
    screen('loading', panel('<div class="foot-content"><h1>Grand Quiz Foot</h1><p role="status">Chargement des questions…</p></div>', 'FOOTBALL'));
    try {
      await loadData(); if (!opened || token !== request) return;
      if (match && (match.deck.some(id => !byId.has(id)) || match.rows.some(r => !byId.has(r.question)))) match = null;
      const categories = [...new Set(data.map(q => q.category))].sort((a,b) => categoryLabel(a).localeCompare(categoryLabel(b),'fr'));
      screen('setup', panel(`<div class="foot-content"><div class="foot-intro"><img src="image/home/football-quiz.webp" width="640" height="640" alt=""><h1>Grand Quiz Foot</h1></div>${match ? button('resume', match.finished ? 'Dernier classement' : 'Reprendre la partie', 'foot-button--green') : ''}<fieldset><legend>Difficulté</legend>${radios('difficulty',LEVELS)}</fieldset><fieldset id="foot-roster"><legend>Qui joue ?</legend>${radios('format',{individual:'Chacun pour soi',teams:'2 équipes'})}<div id="foot-teams" ${settings.format === 'teams' ? '' : 'hidden'}><div id="foot-team-list" class="foot-team-tables"></div>${button('shuffle','Mélanger les équipes','foot-button--pink')}</div><div id="foot-players"></div></fieldset><details><summary>Catégories · <span id="foot-category-label"></span></summary><button class="foot-link" type="button" data-foot="all-categories">Tous les thèmes</button><div class="foot-categories">${categories.map((category,index) => `<label><input type="checkbox" data-foot-category="${index}" value="${esc(category)}" ${settings.categories.includes(category) ? 'checked' : ''}>${esc(categoryLabel(category))}</label>`).join('')}</div></details><p class="foot-help" id="foot-format"></p><p role="alert" id="foot-error" hidden></p>${button('start','Lancer la partie ↗')}</div>`, 'FOOTBALL'));
      editor = global.JDDPlayerEditor.mount(root.querySelector('#foot-players'), {getNames:names,addPlayer:options.addPlayer,removePlayer:options.removePlayer});
      updateSetup();
    } catch (_) {
      if (opened && token === request) screen('error', panel(`<div class="foot-content"><h1>Grand Quiz Foot</h1><p role="alert">Les questions ne sont pas disponibles. Reconnecte-toi pour les télécharger.</p>${button('setup','Réessayer')}</div>`, 'FOOTBALL'));
    }
  }
  function updateAssignments() {
    const people = names();
    Object.keys(assignments).filter(name => !people.includes(name)).forEach(name => delete assignments[name]);
    people.forEach(name => {
      if (assignments[name] !== 0 && assignments[name] !== 1) {
        const values = Object.values(assignments);
        assignments[name] = values.filter(n => n === 0).length <= values.filter(n => n === 1).length ? 0 : 1;
      }
    });
  }
  function contenders() {
    const people = names();
    return settings.format === 'teams' ? [0,1].map(team => ({name:`Équipe ${team + 1}`,members:people.filter(name => assignments[name] === team)}))
      : people.map(name => ({name,members:[name]}));
  }
  function questionPool(config = settings) {
    const unique = new Set();
    return data.filter(q => {
      if ((config.difficulty !== 'MIXED' && q.difficulty !== config.difficulty) || (config.categories.length && !config.categories.includes(q.category))) return false;
      const key = q.question.normalize('NFC').trim().toLocaleLowerCase('fr');
      if (unique.has(key)) return false;
      unique.add(key); return true;
    });
  }
  function updateSetup() {
    if (phase !== 'setup' || !opened) return;
    updateAssignments(); root.querySelector('#foot-teams').hidden = settings.format !== 'teams';
    root.querySelector('#foot-roster').dataset.format = settings.format;
    root.querySelector('#foot-team-list').innerHTML = [0,1].map(team => {
      const members = names().filter(name => assignments[name] === team);
      return `<section class="foot-team-table" data-team="${team}" aria-labelledby="foot-team-title-${team}"><h2 id="foot-team-title-${team}">Équipe ${team + 1}</h2><ul>${members.map(name => {
        const index = names().indexOf(name);
        return `<li><span>${esc(name)}</span><button type="button" class="foot-team-remove" data-foot-remove="${index}" aria-label="Retirer ${esc(name)}">−</button><button type="button" class="foot-team-move" data-foot-move="${index}" aria-label="Passer ${esc(name)} dans l’équipe ${2 - team}" ${members.length <= 1 ? 'disabled' : ''}>${global.JDDVisuals.arrow(team ? 'left' : 'right')}</button></li>`;
      }).join('')}</ul></section>`;
    }).join('');
    root.querySelector('#foot-category-label').textContent = settings.categories.length ? `${settings.categories.length} sélectionnée${settings.categories.length > 1 ? 's' : ''}` : 'Tous les thèmes';
    root.querySelector('#foot-format').textContent = questionPool().length
      ? '60 secondes par joueur ou équipe. Le camp adverse lit et valide.'
      : 'Aucune question avec ces thèmes et ce niveau.';
    root.querySelector('[data-foot="start"]').disabled = !names().length;
  }
  function onPlayersChanged() { if (opened && phase === 'setup') { editor?.update(); updateSetup(); } }
  function fail(message) { const error = root.querySelector('#foot-error'); error.textContent = message; error.hidden = false; }
  function shuffledDeck(pool, previous) {
    const deck = global.JDD.shuffle(pool.map(q => q.id));
    if (deck.length > 1 && deck[0] === previous) [deck[0],deck[1]] = [deck[1],deck[0]];
    return deck;
  }
  function start() {
    if (phase !== 'setup' || !names().length) return;
    updateAssignments(); const sides = contenders();
    if (settings.format === 'teams' && names().length < 2) { fail('Ajoute au moins 2 joueurs pour ce format.'); return; }
    if (sides.some(side => !side.members.length)) { fail('Place au moins un joueur dans chaque équipe.'); return; }
    const pool = questionPool(); if (!pool.length) { fail('Aucune question à ce niveau dans ces thèmes.'); return; }
    const players = names();
    match = {version:2,...settings,mode:'classic',rounds:1,categories:settings.categories.slice(),players,sides,deck:shuffledDeck(pool),cursor:0,round:0,
      totalRounds:sides.length,scores:sides.map(() => 0),rows:[],
      stage:'ready',remaining:ROUND_MS,deadline:0,feedbackUntil:0,paused:false,finished:false,cloud:global.JDDCloud.begin('football',players)};
    saveSettings(); save(); renderReady();
  }
  function scores() {
    return `<ul class="foot-scores" aria-label="Scores">${match.sides.map((side,i) => `<li><strong>${esc(side.name)}</strong><b>${match.scores[i]} pt${match.scores[i] > 1 ? 's' : ''}</b></li>`).join('')}</ul>`;
  }
  function renderReady() {
    stopClock();
    const reader = match.sides.length > 1 ? match.sides[(sideIndex() + 1) % match.sides.length].name : 'Un ami';
    screen('ready', panel(`<div class="foot-content foot-ready"><p class="foot-round-label">Manche ${match.round + 1} / ${match.totalRounds}</p><div class="foot-handoff"><strong>${esc(reader)}</strong><span>tient le téléphone</span><hr><strong>${esc(sideName())}</strong><span>répond aux questions</span></div><strong class="foot-ready-time">60 secondes</strong>${button('begin','GO !')}</div>`,'FOOTBALL'));
  }
  function roundPoints() { return match.rows.filter(r => r.round === match.round && r.winner !== null).length; }
  function answerControls() {
    return `<div class="foot-verdicts"><button type="button" class="foot-verdict foot-verdict--wrong" data-foot="wrong"><span aria-hidden="true">✕</span>Incorrect</button><button type="button" class="foot-verdict foot-verdict--correct" data-foot="correct"><span aria-hidden="true">✓</span>Correct</button></div>`;
  }
  function renderLive() {
    stopClock();
    screen(match.stage, `<section class="foot-live"><header class="foot-live-header"><button type="button" class="foot-icon" data-foot="exit" aria-label="Revenir au menu principal">${HOME}</button><div class="foot-live-player"><strong>${esc(sideName())}</strong><span><b id="foot-score">${roundPoints()}</b> pt</span></div><button type="button" class="foot-icon" data-foot="pause" aria-label="Mettre la manche en pause">${PAUSE}</button></header><div class="foot-live-clock"><strong id="foot-timer" aria-label="Temps restant">${time(match.remaining)}</strong><span>Manche ${match.round + 1} / ${match.totalRounds}</span></div><article class="foot-panel foot-live-card">${windowBar('FOOTBALL')}<div class="foot-card-body" id="foot-card-body"></div><div class="foot-floor" aria-hidden="true"></div></article><div class="foot-live-meta"><p class="foot-live-category" id="foot-live-category"></p><button type="button" class="foot-pass" data-foot="pass" aria-label="Passer la question"><span aria-hidden="true">»</span> Passer</button></div><footer class="foot-live-actions">${answerControls()}</footer></section>`);
    updateCard();
    if (!match.deadline) match.deadline = Date.now() + match.remaining;
    save(); clock = setInterval(tick,50); tick();
  }
  function updateCard() {
    const q = match.stage === 'feedback' ? byId.get(match.rows[match.rows.length - 1]?.question) : question();
    const body = root.querySelector('#foot-card-body');
    if (!body) return;
    body.innerHTML = q ? `<div class="foot-question-area"><h1 class="foot-question foot-unbroken">${words(q.question)}</h1><hr><span class="foot-answer-label">Réponse</span><p class="foot-answer foot-unbroken">${words(q.answer)}</p></div>`
      : '<p class="foot-exhausted">Tous les thèmes sélectionnés ont été joués.</p>';
    if (match.stage === 'feedback') {
      const row = match.rows[match.rows.length - 1];
      body.dataset.feedback = row.reason;
      body.insertAdjacentHTML('beforeend', `<div class="foot-feedback" role="status"><strong>${row.reason === 'correct' ? '✓' : row.reason === 'pass' ? '»' : '✕'}</strong><span>${row.reason === 'correct' ? '+1' : row.reason === 'pass' ? 'Passé' : 'Incorrect'}</span></div>`);
    } else delete body.dataset.feedback;
    root.querySelector('#foot-live-category').textContent = q ? `${LEVELS[q.difficulty]} · ${categoryLabel(q.category)}` : '';
    root.querySelector('#foot-score').textContent = roundPoints();
    root.querySelectorAll('[data-foot="correct"], [data-foot="wrong"], [data-foot="pass"]').forEach(b => {b.disabled = match.stage !== 'playing' || !q;});
    phase = match.stage; root.dataset.screen = phase; fitText();
  }
  function begin() {
    if (!match || match.finished || phase !== 'ready') return;
    initializeAudio();
    match.stage = 'playing'; match.remaining = ROUND_MS; match.paused = false; match.deadline = Date.now() + ROUND_MS;
    renderLive();
  }
  function tick() {
    if (!opened || !match || match.paused || !['playing','feedback'].includes(phase)) return;
    const now = Date.now(); match.remaining = Math.max(0,match.deadline - now);
    const timer = root.querySelector('#foot-timer');
    if (timer) {timer.textContent = time(match.remaining); timer.classList.toggle('foot-time-low',match.remaining <= 10000);}
    if (!match.remaining) { finishRound(); return; }
    if (match.stage === 'feedback' && now >= match.feedbackUntil) {
      match.stage = 'playing'; match.feedbackUntil = 0; save(); updateCard();
    }
  }
  function judge(winner,reason) {
    if (!match || match.finished || match.paused || phase !== 'playing') return;
    match.remaining = Math.max(0,match.deadline - Date.now());
    if (!match.remaining) {finishRound(); return;}
    const q = question(); if (!q) return;
    if (winner !== null && (!Number.isInteger(winner) || !match.sides[winner])) return;
    match.rows.push({question:q.id,round:match.round,turn:sideIndex(),winner,reason});
    if (winner !== null) match.scores[winner]++;
    match.cursor++; match.stage = 'feedback'; match.feedbackUntil = Date.now() + FEEDBACK_MS;
    save(); updateCard();
    playFeedback(reason);
  }
  function finishRound() {
    if (!match || match.finished || !['playing','feedback','paused'].includes(phase)) return;
    stopClock(); match.remaining = 0; match.deadline = 0; match.feedbackUntil = 0; match.paused = false;
    match.finished = match.round === match.totalRounds - 1;
    match.stage = match.finished ? 'results' : 'round-end';
    if (match.finished) record(); save(); renderSummary();
  }
  function renderSummary() {
    if (match.finished) {renderResults(); return;}
    stopClock(); const rows = match.rows.filter(r => r.round === match.round), correct = rows.filter(r => r.winner !== null).length;
    screen('round-end',panel(`<div class="foot-content foot-summary"><p class="foot-round-label">Manche ${match.round + 1} / ${match.totalRounds}</p><h1>${esc(sideName())}</h1><div class="foot-result-score"><strong>${correct}</strong><span>point${correct > 1 ? 's' : ''}</span></div><p class="foot-help">${rows.filter(r => r.reason === 'wrong').length} incorrectes · ${rows.filter(r => r.reason === 'pass').length} passées</p>${scores()}${button('next',`Au tour de ${esc(match.sides[(match.round + 1) % match.sides.length].name)} ↗`)}</div>`,'FIN DE MANCHE',true));
  }
  function next() {
    if (phase !== 'round-end' || match.finished) return;
    const previous = match.rows[match.rows.length - 1]?.question;
    match.round++; match.deck = shuffledDeck(questionPool(match),previous); match.cursor = 0;
    match.stage = 'ready'; match.remaining = ROUND_MS; match.deadline = 0; match.feedbackUntil = 0;
    save(); renderReady();
  }
  function record() {
    if (!match.finished || !match.cloud) return;
    const best = Math.max(...match.scores);
    global.JDDCloud.record(match.cloud,match.players.map(name => {
      const side = match.sides.findIndex(s => s.members.includes(name));
      const rows = match.rows.filter(r => r.turn === side);
      const correct = rows.filter(r => r.winner === side).length;
      return {participant:match.cloud.participants.find(p => p.label === name),metrics:{
        games:1,wins:Number(match.sides.length > 1 && best > 0 && match.scores[side] === best),points:match.scores[side],
        turns:match.rounds,questions_answered:rows.filter(r => r.reason !== 'pass').length,correct_answers:correct,
      }};
    }), {quiz_mode:match.mode,format:match.format,difficulty:match.difficulty,categories:match.categories,round_seconds:60,rounds:match.totalRounds,
      team_accounts:match.sides.map(s => s.members.map(name => match.cloud.participants.find(p => p.label === name)).filter(p => p?.kind === 'account').map(p => p.id)),
      // Historique compact borné pour rester sous la limite SQL de 64 Ko, sans noms d'invités.
      answers_total:match.rows.length,answers:match.rows.slice(-500).map(r => [r.question,r.round,r.winner,{correct:1,wrong:0,pass:2}[r.reason]])});
  }
  function renderResults() {
    stopClock(); const best = Math.max(...match.scores), winners = match.sides.filter((_,i) => match.scores[i] === best);
    const title = !best ? 'Aucun point marqué' : match.sides.length === 1 ? 'Ton score' : winners.length > 1 ? 'Égalité !' : `${winners[0].name} gagne !`;
    const ranking = match.sides.map((s,i) => ({...s,points:match.scores[i]})).sort((a,b) => b.points - a.points);
    let lastScore = null,rank = 0;
    screen('results',panel(`<div class="foot-content"><h1 class="foot-current">${esc(title)}</h1><ol class="foot-ranking">${ranking.map((row,i) => {
      if (row.points !== lastScore) {rank = i + 1; lastScore = row.points;}
      return `<li data-winner="${best > 0 && row.points === best}"><span>${best > 0 && row.points === best ? '👑' : rank}</span><strong>${esc(row.name)}</strong><b>${row.points} pt${row.points > 1 ? 's' : ''}</b>${match.format === 'teams' ? `<small>${row.members.map(esc).join(' · ')}</small>` : ''}</li>`;
    }).join('')}</ol>${button('setup','Rejouer ↗')}</div>`,'CLASSEMENT',true));
  }
  function renderReview(filter = reviewRound) {
    if (!match || !['round-end','results','review'].includes(phase)) return;
    reviewRound = filter;
    const list = match.rows.map((row,index) => ({...row,index})).filter(row => filter === 'all' || row.round === Number(filter));
    screen('review',panel(`<div class="foot-content"><h1>VAR</h1><label class="foot-help" for="foot-review-round">Quelle manche ?</label><select id="foot-review-round"><option value="all">Toutes les manches</option>${Array.from({length:match.round + 1},(_,i) => `<option value="${i}" ${String(i) === filter ? 'selected' : ''}>Manche ${i + 1} · ${esc(match.sides[i % match.sides.length].name)}</option>`).join('')}</select><p class="foot-help">Touche le bon résultat pour corriger.</p><ul class="foot-review-list">${list.map(row => {
      const q = byId.get(row.question);
      return `<li data-status="${row.reason}"><span class="foot-review-context">Manche ${row.round + 1} · ${esc(match.sides[row.turn].name)}</span><strong class="foot-unbroken">${words(q.question)}</strong><p class="foot-unbroken">${words(q.answer)}</p><div class="foot-review-verdicts"><button type="button" data-foot-review="${row.index}" data-result="wrong" aria-pressed="${row.reason !== 'correct'}" aria-label="Marquer la réponse ${row.index + 1} incorrecte">✕ Incorrect</button><button type="button" data-foot-review="${row.index}" data-result="correct" aria-pressed="${row.reason === 'correct'}" aria-label="Marquer la réponse ${row.index + 1} correcte">✓ Correct</button></div></li>`;
    }).join('')}</ul>${list.length ? '' : '<p class="foot-help">Aucune réponse validée dans cette manche.</p>'}${button('close-var','Valider la VAR ↗')}</div>`,'CORRECTIONS'));
  }
  function correctRow(index,winner) {
    if (phase !== 'review' || !Number.isInteger(index) || !match.rows[index]) return;
    if (winner !== null && (!Number.isInteger(winner) || !match.sides[winner])) return;
    const row = match.rows[index];
    if (row.winner === winner && row.reason !== 'pass') return;
    row.winner = winner; row.reason = winner === null ? 'wrong' : 'correct';
    match.scores = match.sides.map((_,i) => match.rows.filter(r => r.winner === i).length);
    if (match.finished) record(); save();
    // Actualiser la ligne sans déplacer la liste ni perdre le focus.
    const item = root.querySelector(`[data-foot-review="${index}"]`)?.closest('li');
    if (item) {
      item.dataset.status = row.reason;
      item.querySelectorAll('[data-foot-review]').forEach(b => b.setAttribute('aria-pressed',String((b.dataset.result === 'correct') === (winner !== null))));
    }
  }
  function pause() {
    if (!match || match.finished || !['playing','feedback'].includes(phase)) return;
    match.remaining = Math.max(0,match.deadline - Date.now());
    if (!match.remaining) {finishRound(); return;}
    stopClock(); match.deadline = 0; match.feedbackUntil = 0; match.stage = 'playing'; match.paused = true; save();
    if (opened) renderPaused();
  }
  function renderPaused() {
    screen('paused',panel(`<div class="foot-content foot-summary"><h1>Manche en pause</h1><p class="foot-current">${esc(sideName())}</p><strong class="foot-ready-time">${time(match.remaining)}</strong>${button('continue','Reprendre la manche','foot-button--green')}</div>`,'PAUSE'));
  }
  function resume() {
    if (!match) return; ++request;
    if (match.finished) renderResults();
    else if (match.stage === 'ready') renderReady();
    else if (match.stage === 'round-end') renderSummary();
    else if (match.remaining <= 0) {phase = 'paused'; finishRound();}
    else renderPaused();
  }
  function fitText() {
    root?.querySelectorAll('.foot-unbroken').forEach(el => {
      el.style.fontSize = '';
      const style = getComputedStyle(el), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const longest = Math.max(...el.textContent.split(/\s+/).map(word => context.measureText(word).width));
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (width > 0 && longest > width) el.style.fontSize = `${parseFloat(style.fontSize) * width / longest * .95}px`;
    });
    const area = root?.querySelector('.foot-question-area');
    if (area) {
      // Réduire les deux textes ensemble si nécessaire, sans césure ni troncature.
      const texts = area.querySelectorAll('.foot-question,.foot-answer');
      for (let i = 0; i < 14 && area.scrollHeight > area.clientHeight + 1; i++) {
        let changed = false;
        texts.forEach(el => {
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size > 14) {el.style.fontSize = `${Math.max(14,size * .94)}px`; changed = true;}
        });
        if (!changed) break;
      }
    }
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS));
      if (s && LEVELS[s.difficulty] && ['individual','teams'].includes(s.format)
        && Array.isArray(s.categories) && s.categories.every(c => typeof c === 'string')) settings = {difficulty:s.difficulty,format:s.format,categories:s.categories};
      const m = JSON.parse(localStorage.getItem(STORE));
      if (!m || m.version !== 2 || !LEVELS[m.difficulty] || m.mode !== 'classic' || !['individual','teams'].includes(m.format)
        || m.rounds !== 1 || !Array.isArray(m.players) || !m.players.length || m.players.length > 30 || !m.players.every(n => typeof n === 'string')
        || !Array.isArray(m.sides) || !m.sides.length || !m.sides.every(s => typeof s.name === 'string' && Array.isArray(s.members) && s.members.length && s.members.every(n => m.players.includes(n)))
        || m.sides.flatMap(s => s.members).length !== m.players.length || new Set(m.sides.flatMap(s => s.members)).size !== m.players.length
        || !Array.isArray(m.deck) || !m.deck.length || m.deck.length > 4631 || !m.deck.every(Number.isInteger) || new Set(m.deck).size !== m.deck.length
        || !Number.isInteger(m.cursor) || m.cursor < 0 || m.cursor > m.deck.length || !Array.isArray(m.rows) || m.rows.length > 10000
        || !Number.isInteger(m.round) || m.round < 0 || m.round >= m.totalRounds || m.totalRounds !== m.sides.length
        || !Array.isArray(m.categories) || !m.categories.every(c => typeof c === 'string') || !Array.isArray(m.scores) || m.scores.length !== m.sides.length
        || !['ready','playing','feedback','round-end','results'].includes(m.stage) || !Number.isFinite(m.remaining) || m.remaining < 0 || m.remaining > ROUND_MS
        || !Number.isFinite(m.deadline) || !Number.isFinite(m.feedbackUntil) || m.finished !== (m.stage === 'results')
        || (m.finished && m.round !== m.totalRounds - 1)
        || !m.rows.every(r => r && Number.isInteger(r.question) && Number.isInteger(r.round) && r.round >= 0 && r.round <= m.round
          && ['correct','wrong','pass'].includes(r.reason) && r.turn === r.round % m.sides.length
          && (r.winner === null || Number.isInteger(r.winner) && r.winner >= 0 && r.winner < m.sides.length)
          && (r.reason === 'correct') === (r.winner !== null) && (r.winner === null || r.winner === r.turn))
        || m.scores.some((score,i) => score !== m.rows.filter(r => r.winner === i).length)
        || m.cursor !== m.rows.filter(r => r.round === m.round).length
        || (m.cloud && (!Array.isArray(m.cloud.participants) || typeof m.cloud.id !== 'string'))) return;
      match = m;
      if (['playing','feedback'].includes(m.stage)) {
        if (m.deadline) m.remaining = Math.max(0,Math.min(ROUND_MS,m.deadline - Date.now()));
        m.stage = 'playing'; m.paused = true; m.feedbackUntil = 0;
      }
      m.deadline = 0;
    } catch (_) { /* Ignorer une sauvegarde invalide, conserver l'ancienne clé v1. */ }
  }
  function init(config) {
    root = document.getElementById('football'); options = config; restore();
    root.addEventListener('change',event => {
      const input = event.target;
      if (phase === 'review' && input.id === 'foot-review-round') {renderReview(input.value); return;}
      if (phase !== 'setup') return;
      if (input.matches('[name="foot-difficulty"], [name="foot-format"]')) settings[input.name.slice(5)] = input.value;
      else if (input.matches('[data-foot-category]')) settings.categories = [...root.querySelectorAll('[data-foot-category]:checked')].map(el => el.value);
      saveSettings(); updateSetup(); root.querySelector('#foot-error').hidden = true;
    });
    root.addEventListener('click',event => {
      const correction = event.target.closest('[data-foot-review]');
      if (correction && phase === 'review') {const i = Number(correction.dataset.footReview); correctRow(i,correction.dataset.result === 'correct' ? match.rows[i]?.turn : null); return;}
      const move = event.target.closest('[data-foot-move]');
      if (move && !move.disabled && phase === 'setup' && settings.format === 'teams') {
        const name = names()[Number(move.dataset.footMove)], team = assignments[name];
        if (name && [0,1].includes(team) && names().filter(n => assignments[n] === team).length > 1) {
          assignments[name] = 1 - team; updateSetup();
          root.querySelector(`[data-foot-move="${move.dataset.footMove}"]`)?.focus({preventScroll:true});
        }
        return;
      }
      const remove = event.target.closest('[data-foot-remove]');
      if (remove && phase === 'setup') {options.removePlayer(names()[Number(remove.dataset.footRemove)]); return;}
      const control = event.target.closest('[data-foot]'); if (!control || control.disabled) return;
      switch (control.dataset.foot) {
        case 'exit': pause(); opened = false; ++request; stopClock(); document.body.classList.remove('foot-open'); options.onExit(); break;
        case 'setup': renderSetup(); break;
        case 'start': start(); break;
        case 'begin': begin(); break;
        case 'resume': resume(); break;
        case 'pause': pause(); break;
        case 'continue': if (phase === 'paused') {initializeAudio(); match.paused = false; match.stage = 'playing'; match.deadline = Date.now() + match.remaining; renderLive();} break;
        case 'correct': if (match) judge(sideIndex(),'correct'); break;
        case 'wrong': judge(null,'wrong'); break;
        case 'pass': judge(null,'pass'); break;
        case 'next': next(); break;
        case 'var': if (['round-end','results'].includes(phase)) renderReview(String(match.round)); break;
        case 'close-var': if (phase === 'review') renderSummary(); break;
        case 'shuffle': if (phase === 'setup') {assignments = Object.create(null); global.JDD.shuffle(names()).forEach((name,i) => assignments[name] = i % 2); updateSetup();} break;
        case 'all-categories': if (phase === 'setup') {settings.categories = []; root.querySelectorAll('[data-foot-category]').forEach(el => el.checked = false); saveSettings(); updateSetup();} break;
      }
    });
    document.addEventListener('visibilitychange',() => {if (document.hidden) pause();});
    global.addEventListener('pagehide',pause); global.addEventListener('resize',fitText); document.fonts?.ready.then(fitText);
  }
  function onOpen() {opened = true; document.body.classList.add('foot-open'); renderSetup();}
  global.JDDModules = global.JDDModules || {};
  global.JDDModules.football = {init,onOpen,onPlayersChanged,hasActiveGame:() => Boolean(match && !match.finished)};
})(window);

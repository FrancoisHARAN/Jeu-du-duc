/* Quiz oral sur téléphone partagé : l'arbitre valide les réponses. */
(function (global) {
  'use strict';
  const STORE = 'jdd.football.v1', SETTINGS = 'jdd.football.settings.v1', TURN_MS = 30000;
  const LEVELS = { AMATEUR: 'Amateur', CONNAISSEUR: 'Connaisseur', EXPERT: 'Expert', FOOTIX: 'Footix' };
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const words = value => String(value).split(/(\s+)/).map(part => /\s/.test(part)
    ? esc(part) : `<span class="foot-word">${esc(part)}</span>`).join('');
  let root, options, editor, data, loading, clock, opened = false, request = 0, phase = 'setup', match = null;
  let settings = { difficulty: 'AMATEUR', mode: 'classic', format: 'individual', length: 10, categories: [] };
  let assignments = {};
  const names = () => options.getSuggestedNames().slice();
  const categoryLabel = value => value || 'Non classées';
  const button = (action, text, extra = '') => `<button type="button" class="foot-button ${extra}" data-foot="${action}">${text}</button>`;
  function topbar() {
    return '<header class="foot-topbar"><button type="button" class="foot-pill" data-foot="exit" aria-label="Revenir au menu principal">⌂ Menu</button><span class="foot-pill foot-pill--blue">Grand Quiz Foot</span></header>';
  }
  function panel(content, label) {
    return `${topbar()}<section class="foot-panel"><div class="foot-window"><span class="foot-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(label)}</span><span aria-hidden="true">✦</span></div>${content}<div class="foot-floor" aria-hidden="true"></div></section>`;
  }
  function screen(next, html) {
    phase = next; root.dataset.screen = next; root.innerHTML = html;
    global.scrollTo(0, 0); fitText();
  }
  function stopClock() { clearInterval(clock); clock = null; }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(match)); } catch (_) { /* La partie reste jouable en mémoire. */ }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch (_) { /* facultatif */ }
  }
  async function loadData() {
    if (data) return data;
    if (!loading) loading = fetch('data/football.questions.json').then(response => {
      if (!response.ok) throw new Error('Questions indisponibles');
      return response.json();
    }).then(bank => {
      if (!Array.isArray(bank.questions) || !bank.questions.length) throw new Error('Questions indisponibles');
      data = bank.questions; return data;
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  function radios(key, values) {
    return `<div class="foot-choices">${Object.entries(values).map(([value, label]) => `<label><input type="radio" name="foot-${key}" value="${value}" ${String(settings[key]) === value ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>`;
  }
  async function renderSetup() {
    stopClock(); const token = ++request;
    screen('loading', panel(`<div class="foot-content"><h1>Grand Quiz Foot</h1><p role="status">Chargement des questions…</p></div>`, 'FOOTBALL'));
    try {
      await loadData();
      if (!opened || token !== request) return;
      const categories = [...new Set(data.map(q => q.category))].sort((a,b) => categoryLabel(a).localeCompare(categoryLabel(b), 'fr'));
      screen('setup', panel(`<div class="foot-content"><div class="foot-intro"><img src="image/home/football.jpg" width="1254" height="1254" alt=""><h1>Grand Quiz Foot</h1></div>${match && !match.finished ? button('resume', 'Reprendre la partie', 'foot-button--green') : ''}<fieldset><legend>Difficulté</legend>${radios('difficulty', LEVELS)}</fieldset><fieldset><legend>Mode</legend>${radios('mode', {classic:'Classique', shotgun:'Shotgun'})}<p class="foot-help" id="foot-rules"></p></fieldset><fieldset><legend>Qui s’affronte ?</legend>${radios('format', {individual:'Chacun pour soi', teams:'2 équipes'})}</fieldset><fieldset><legend>Qui joue ?</legend><div id="foot-players"></div></fieldset><fieldset id="foot-teams" ${settings.format === 'teams' ? '' : 'hidden'}><legend>Les équipes</legend><div id="foot-team-list"></div>${button('shuffle', 'Mélanger les équipes', 'foot-button--pink')}</fieldset><details><summary>Catégories · <span id="foot-category-label"></span></summary><p class="foot-help">Sans sélection, tous les thèmes sont inclus.</p><button class="foot-link" type="button" data-foot="all-categories">Tous les thèmes</button><div class="foot-categories">${categories.map((category, index) => `<label><input type="checkbox" data-foot-category="${index}" value="${esc(category)}" ${settings.categories.includes(category) ? 'checked' : ''}>${esc(categoryLabel(category))}</label>`).join('')}</div></details><fieldset><legend>Durée de la partie</legend>${radios('length', {10:'Courte · 10 questions', 20:'Longue · 20 questions'})}</fieldset><p class="foot-help" id="foot-format"></p><p role="alert" id="foot-error" hidden></p>${button('start', 'Lancer la partie ↗')}</div>`, 'FOOTBALL'));
      editor = global.JDDPlayerEditor.mount(root.querySelector('#foot-players'), {getNames: names, addPlayer: options.addPlayer, removePlayer: options.removePlayer});
      updateSetup();
    } catch (_) {
      if (opened && token === request) screen('error', panel(`<div class="foot-content"><h1>Grand Quiz Foot</h1><p role="alert">Les questions ne sont pas disponibles. Reconnecte-toi pour les télécharger.</p>${button('setup', 'Réessayer')}</div>`, 'FOOTBALL'));
    }
  }
  function updateAssignments() {
    const people = names();
    Object.keys(assignments).filter(name => !people.includes(name)).forEach(name => delete assignments[name]);
    people.forEach(name => {
      if (assignments[name] !== 0 && assignments[name] !== 1) {
        const a = Object.values(assignments).filter(n => n === 0).length;
        const b = Object.values(assignments).filter(n => n === 1).length;
        assignments[name] = a <= b ? 0 : 1;
      }
    });
  }
  function contenders() {
    const people = names();
    return settings.format === 'teams' ? [0,1].map(team => ({ name:`Équipe ${team + 1}`, members:people.filter(name => assignments[name] === team) }))
      : people.map(name => ({name, members:[name]}));
  }
  function questionCount(count) { return settings.mode === 'classic' && count ? Math.ceil(settings.length / count) * count : settings.length; }
  function questionPool() {
    const unique = new Set();
    return data.filter(q => {
      if (q.difficulty !== settings.difficulty || (settings.categories.length && !settings.categories.includes(q.category))) return false;
      const key = q.question.normalize('NFC').trim().toLocaleLowerCase('fr');
      if (unique.has(key)) return false;
      unique.add(key); return true;
    });
  }
  function availableCount(poolSize, sideCount) {
    return settings.mode === 'classic' && sideCount ? Math.floor(poolSize / sideCount) * sideCount : poolSize;
  }
  function updateSetup() {
    if (phase !== 'setup' || !opened) return;
    updateAssignments();
    const teams = root.querySelector('#foot-teams'); teams.hidden = settings.format !== 'teams';
    root.querySelector('#foot-team-list').innerHTML = names().map((name,index) => `<label class="foot-team-row"><span class="foot-team-name">${esc(name)}</span><select data-foot-team="${index}" aria-label="Équipe de ${esc(name)}"><option value="0" ${assignments[name] === 0 ? 'selected' : ''}>Équipe 1</option><option value="1" ${assignments[name] === 1 ? 'selected' : ''}>Équipe 2</option></select></label>`).join('');
    root.querySelector('#foot-rules').textContent = settings.mode === 'shotgun'
      ? 'Tout le monde répond à voix haute. L’arbitre garde le téléphone et donne 1 point au premier qui répond juste.'
      : 'Chacun son tour : répondez à voix haute. L’arbitre vérifie la réponse et donne 1 point si elle est juste.';
    root.querySelector('#foot-category-label').textContent = settings.categories.length ? `${settings.categories.length} sélectionnée${settings.categories.length > 1 ? 's' : ''}` : 'Tous les thèmes';
    const sideCount = contenders().length;
    const count = Math.min(questionCount(sideCount), availableCount(questionPool().length, sideCount));
    root.querySelector('#foot-format').textContent = count
      ? `${count} question${count > 1 ? 's' : ''} · 30 secondes par question${settings.mode === 'classic' ? ' · Même nombre de tours pour tous' : ''}`
      : 'Aucune partie possible avec ces thèmes et ce niveau pour ces joueurs.';
    root.querySelector('[data-foot="start"]').disabled = !names().length;
  }
  function onPlayersChanged() {
    if (opened && phase === 'setup') { editor?.update(); updateSetup(); }
  }
  function fail(message) { const error = root.querySelector('#foot-error'); error.textContent = message; error.hidden = false; }
  function start() {
    if (phase !== 'setup' || !names().length) return;
    updateAssignments();
    const sides = contenders();
    if ((settings.format === 'teams' || settings.mode === 'shotgun') && names().length < 2) { fail('Ajoute au moins 2 joueurs pour ce format.'); return; }
    if (sides.some(side => !side.members.length)) { fail('Place au moins un joueur dans chaque équipe.'); return; }
    const pool = questionPool();
    const count = questionCount(sides.length);
    // Une partie classique conserve autant de questions pour chaque camp, même dans un petit thème.
    const available = availableCount(pool.length, sides.length);
    if (!available) { fail('Pas assez de questions à ce niveau pour ces joueurs. Choisis d’autres thèmes ou une autre difficulté.'); return; }
    const players = names();
    match = { version:1, ...settings, categories:settings.categories.slice(), players, sides,
      questions:global.JDD.shuffle(pool.slice()).slice(0, Math.min(count, available)), index:0,
      scores:sides.map(() => 0), rows:[], stage:'ready', remaining:TURN_MS, deadline:0, paused:false, finished:false,
      cloud:global.JDDCloud.begin('football', players) };
    saveSettings(); save(); renderMatch();
  }
  function scores() {
    return `<ul class="foot-scores" aria-label="Scores">${match.sides.map((side, i) => `<li aria-current="${match.mode === 'classic' && i === match.index % match.sides.length}"><strong>${esc(side.name)}</strong><b>${match.scores[i]} pt${match.scores[i] > 1 ? 's' : ''}</b></li>`).join('')}</ul>`;
  }
  function renderMatch() {
    stopClock();
    const q = match.questions[match.index], side = match.sides[match.index % match.sides.length];
    const stage = match.paused ? 'paused' : match.stage;
    let content = `<div class="foot-content"><div class="foot-meta"><span>Question ${match.index + 1} / ${match.questions.length}</span><strong id="foot-timer" aria-label="Temps restant">${Math.ceil(match.remaining / 1000)} s</strong></div><div class="foot-progress" role="progressbar" aria-label="Progression de la partie" aria-valuemin="0" aria-valuemax="${match.questions.length}" aria-valuenow="${match.index + (match.stage === 'answer' ? 1 : 0)}"><span style="width:${100 * (match.index + (match.stage === 'answer' ? 1 : 0)) / match.questions.length}%"></span></div>${scores()}<p class="foot-current">${match.mode === 'classic' ? `Au tour de ${esc(side.name)}` : 'Tout le monde joue'}</p>`;
    if (match.format === 'teams' && match.mode === 'classic') content += `<p class="foot-help">${side.members.map(esc).join(' · ')}</p>`;
    if (stage === 'ready') {
      content += `<p class="foot-help">${match.mode === 'shotgun' ? 'Le premier à donner la bonne réponse à voix haute gagne 1 point. L’arbitre valide sur le téléphone.' : 'Répondez à voix haute en 30 secondes. L’arbitre valide la réponse.'}</p>${button('begin', 'Afficher la question ↗')}`;
    } else {
      content += `<p class="foot-help">${esc(LEVELS[match.difficulty])} · ${esc(categoryLabel(q.category))}</p><h1 class="foot-question foot-unbroken">${words(q.question)}</h1>`;
      if (stage === 'paused') content += `<p role="status">Partie en pause</p>${button('continue', 'Reprendre le chrono', 'foot-button--green')}`;
      if (stage === 'playing') content += `<p class="foot-help">L’arbitre vérifie après la réponse à voix haute.</p>${button('reveal', 'Vérifier la réponse')}${button('pass', 'Personne ne trouve', 'foot-button--pink')}`;
      if (stage === 'judging' || stage === 'answer') {
        content += `<p class="foot-answer foot-unbroken">${words(q.answer)}</p>`;
        if (stage === 'judging') {
          content += `<p class="foot-help">${match.mode === 'classic' ? 'La réponse donnée était-elle juste ?' : 'Qui a donné la bonne réponse en premier ?'}</p>`;
          content += match.mode === 'classic' ? `${button('correct', 'Bonne réponse · +1 point', 'foot-button--green')}${button('wrong', 'Mauvaise réponse', 'foot-button--pink')}`
            : match.sides.map((s,i) => `<button type="button" class="foot-button foot-button--green" data-foot-award="${i}"><span>${esc(s.name)}</span><b>+1</b></button>`).join('') + button('pass', 'Personne', 'foot-button--pink');
        } else {
          const row = match.rows[match.index];
          content += `<p role="status">${row.reason === 'timeout' ? 'Temps écoulé · Aucun point' : row.winner === null ? 'Aucun point' : `${esc(match.sides[row.winner].name)} · +1 point`}</p>${button('next', match.index === match.questions.length - 1 ? 'Voir le classement' : 'Question suivante ↗')}`;
        }
      }
    }
    content += '</div>';
    screen(stage, panel(content, match.mode === 'shotgun' ? 'SHOTGUN' : 'CLASSIQUE'));
    if (stage === 'playing') { match.deadline = Date.now() + match.remaining; save(); clock = setInterval(tick, 100); tick(); }
  }
  function begin() {
    if (!match || match.stage !== 'ready') return;
    match.stage = 'playing'; match.paused = false; match.remaining = TURN_MS;
    save(); renderMatch();
  }
  function tick() {
    if (!opened || !match || phase !== 'playing') return;
    match.remaining = Math.max(0, match.deadline - Date.now());
    const timer = root.querySelector('#foot-timer'); timer.textContent = `${Math.ceil(match.remaining / 1000)} s`;
    timer.classList.toggle('foot-time-low', match.remaining <= 5000);
    if (match.remaining === 0) settle(null, 'timeout');
  }
  function reveal() {
    if (phase !== 'playing') return;
    match.remaining = Math.max(0, match.deadline - Date.now());
    if (!match.remaining) { settle(null, 'timeout'); return; }
    stopClock(); match.deadline = 0; match.stage = 'judging'; save(); renderMatch();
  }
  function settle(winner, reason) {
    if (!match || match.finished || !['playing','judging'].includes(phase)) return;
    if (phase === 'playing') {
      match.remaining = Math.max(0, match.deadline - Date.now());
      if (!match.remaining) { winner = null; reason = 'timeout'; }
    }
    if (winner !== null && (!Number.isInteger(winner) || !match.sides[winner])) return;
    stopClock(); match.deadline = 0;
    if (winner !== null) match.scores[winner] += 1;
    match.rows.push({ question:match.questions[match.index].id, turn:match.mode === 'classic' ? match.index % match.sides.length : null, winner, reason });
    match.stage = 'answer'; save(); renderMatch();
  }
  function next() {
    if (!match || phase !== 'answer') return;
    if (match.index + 1 === match.questions.length) {
      match.finished = true; match.stage = 'results'; record(); save(); renderResults();
    } else {
      match.index++; match.stage = 'ready'; match.remaining = TURN_MS; save(); renderMatch();
    }
  }
  function record() {
    if (!match.cloud) return;
    const best = Math.max(...match.scores);
    global.JDDCloud.record(match.cloud, match.players.map(name => {
      const side = match.sides.findIndex(s => s.members.includes(name));
      const turns = match.rows.filter(r => match.mode === 'shotgun' || r.turn === side);
      const correct = turns.filter(r => r.winner === side).length;
      const answered = match.mode === 'shotgun' ? correct : turns.filter(r => ['correct','wrong'].includes(r.reason)).length;
      return {participant: match.cloud.participants.find(p => p.label === name), metrics:{
        games:1, wins:Number(match.sides.length > 1 && best > 0 && match.scores[side] === best),
        points:match.scores[side], turns:turns.length, questions_answered:answered, correct_answers:correct,
      }};
    }), {quiz_mode:match.mode, format:match.format, difficulty:match.difficulty, categories:match.categories,
      // Pas de noms ni de données d'invités dans le cloud.
      team_accounts:match.sides.map(s => s.members.map(name => match.cloud.participants.find(p => p.label === name)).filter(p => p?.kind === 'account').map(p => p.id)),
      questions:match.questions.map(q => q.id)});
  }
  function renderResults() {
    stopClock();
    const best = Math.max(...match.scores), winners = match.sides.filter((_,i) => match.scores[i] === best);
    const title = !best ? 'Aucun point marqué' : match.sides.length === 1 ? 'Ton score' : winners.length > 1 ? 'Égalité !' : `${winners[0].name} gagne !`;
    const ranking = match.sides.map((side,i) => ({...side, points:match.scores[i]})).sort((a,b) => b.points - a.points);
    let lastScore = null, rank = 0;
    screen('results', panel(`<div class="foot-content"><h1 class="foot-current">${esc(title)}</h1><p class="foot-help">${match.questions.length} questions · ${esc(LEVELS[match.difficulty])} · ${match.mode === 'shotgun' ? 'Shotgun' : 'Classique'}</p><ol class="foot-ranking">${ranking.map((row,i) => {
      if (row.points !== lastScore) {rank = i + 1; lastScore = row.points;}
      return `<li data-winner="${best > 0 && row.points === best}"><span>${best > 0 && row.points === best ? '👑' : rank}</span><strong>${esc(row.name)}</strong><b>${row.points} pt${row.points > 1 ? 's' : ''}</b>${match.format === 'teams' ? `<small>${row.members.map(esc).join(' · ')}</small>` : ''}</li>`;
    }).join('')}</ol>${button('setup', 'Rejouer ↗')}</div>`, 'CLASSEMENT'));
  }
  function pause() {
    if (!match || match.finished || phase !== 'playing') return;
    match.remaining = Math.max(0, match.deadline - Date.now()); match.deadline = 0;
    stopClock(); match.paused = true; save();
    if (opened) renderMatch();
  }
  function resume() {
    if (!match || match.finished) return;
    ++request; renderMatch();
  }
  function fitText() {
    // Ajuster uniquement la taille si un mot entier dépasse sa zone, sans le couper.
    root?.querySelectorAll('.foot-unbroken').forEach(el => {
      el.style.fontSize = '';
      const style = getComputedStyle(el), canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const longest = Math.max(...el.textContent.split(/\s+/).map(word => context.measureText(word).width));
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (width > 0 && longest > width) el.style.fontSize = `${parseFloat(style.fontSize) * width / longest * .95}px`;
    });
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS));
      if (s && LEVELS[s.difficulty] && ['classic','shotgun'].includes(s.mode) && ['individual','teams'].includes(s.format)
        && [10,20].includes(s.length) && Array.isArray(s.categories) && s.categories.every(c => typeof c === 'string')) settings = s;
      const m = JSON.parse(localStorage.getItem(STORE));
      if (!m || m.version !== 1 || !LEVELS[m.difficulty] || !['classic','shotgun'].includes(m.mode)
        || !['individual','teams'].includes(m.format) || !Array.isArray(m.players) || !m.players.length || m.players.length > 30
        || !m.players.every(n => typeof n === 'string') || !Array.isArray(m.sides) || !m.sides.length || m.sides.length > 30
        || !m.sides.every(s => typeof s.name === 'string' && Array.isArray(s.members) && s.members.length && s.members.every(n => m.players.includes(n)))
        || m.sides.flatMap(s => s.members).length !== m.players.length || new Set(m.sides.flatMap(s => s.members)).size !== m.players.length
        || !Array.isArray(m.questions) || !m.questions.length || m.questions.length > 50
        || !m.questions.every(q => Number.isInteger(q.id) && typeof q.question === 'string' && typeof q.answer === 'string' && typeof q.category === 'string')
        || !Array.isArray(m.categories) || !m.categories.every(c => typeof c === 'string')
        || !Array.isArray(m.scores) || m.scores.length !== m.sides.length || !m.scores.every(n => Number.isInteger(n) && n >= 0)
        || !Array.isArray(m.rows) || !m.rows.every(r => r && ['correct','wrong','pass','timeout'].includes(r.reason)
          && (r.winner === null || Number.isInteger(r.winner) && r.winner >= 0 && r.winner < m.sides.length))
        || !Number.isInteger(m.index) || m.index < 0 || m.index >= m.questions.length
        || !['ready','playing','judging','answer','results'].includes(m.stage) || !Number.isFinite(m.remaining) || m.remaining < 0 || m.remaining > TURN_MS
        || m.finished !== (m.stage === 'results') || m.rows.length !== m.index + Number(['answer','results'].includes(m.stage))
        || m.rows.some((r,i) => r.question !== m.questions[i].id || r.turn !== (m.mode === 'classic' ? i % m.sides.length : null))
        || m.scores.some((score,i) => score !== m.rows.filter(r => r.winner === i).length)
        || (m.cloud && (!Array.isArray(m.cloud.participants) || typeof m.cloud.id !== 'string'))) return;
      match = m;
      if (m.stage === 'playing') {
        if (m.deadline) m.remaining = Math.max(0, Math.min(TURN_MS, m.deadline - Date.now()));
        m.paused = true;
      }
      m.deadline = 0;
    } catch (_) { /* Ignorer une sauvegarde invalide. */ }
  }
  function init(config) {
    root = document.getElementById('football'); options = config; restore();
    root.addEventListener('change', event => {
      if (phase !== 'setup') return;
      const input = event.target;
      if (input.matches('[name^="foot-"]')) {
        const key = input.name.slice(5); settings[key] = key === 'length' ? Number(input.value) : input.value;
      } else if (input.matches('[data-foot-category]')) settings.categories = [...root.querySelectorAll('[data-foot-category]:checked')].map(el => el.value);
      else if (input.matches('[data-foot-team]')) assignments[names()[Number(input.dataset.footTeam)]] = Number(input.value);
      saveSettings(); updateSetup();
      root.querySelector('#foot-error').hidden = true;
    });
    root.addEventListener('click', event => {
      const award = event.target.closest('[data-foot-award]');
      if (award && phase === 'judging') { settle(Number(award.dataset.footAward), 'correct'); return; }
      const control = event.target.closest('[data-foot]'); if (!control || control.disabled) return;
      switch (control.dataset.foot) {
        case 'exit': pause(); opened = false; ++request; stopClock(); document.body.classList.remove('foot-open'); options.onExit(); break;
        case 'setup': renderSetup(); break;
        case 'start': start(); break;
        case 'begin': begin(); break;
        case 'resume': resume(); break;
        case 'continue': if (phase === 'paused') { match.paused = false; renderMatch(); } break;
        case 'reveal': reveal(); break;
        case 'correct': if (phase === 'judging') settle(match.index % match.sides.length, 'correct'); break;
        case 'wrong': if (phase === 'judging') settle(null, 'wrong'); break;
        case 'pass': settle(null, 'pass'); break;
        case 'next': next(); break;
        case 'shuffle': if (phase === 'setup') { assignments = {}; global.JDD.shuffle(names()).forEach((name,i) => assignments[name] = i % 2); updateSetup(); } break;
        case 'all-categories': if (phase === 'setup') { settings.categories = []; root.querySelectorAll('[data-foot-category]').forEach(el => el.checked = false); saveSettings(); updateSetup(); } break;
      }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    global.addEventListener('pagehide', pause);
    global.addEventListener('resize', fitText);
    document.fonts?.ready.then(fitText);
  }
  function onOpen() {
    opened = true; document.body.classList.add('foot-open'); renderSetup();
  }
  global.JDDModules = global.JDDModules || {};
  global.JDDModules.football = {init, onOpen, onPlayersChanged, hasActiveGame: () => Boolean(match && !match.finished)};
})(window);

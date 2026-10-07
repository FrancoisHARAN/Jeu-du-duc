(function () {
  const PLAYERS_KEY = 'jdd.players';
  const SHARED_PLAYERS_KEY = 'jdd.players.shared-v1';
  const MAX_PLAYERS = 30;

  const players = loadPlayers();
  window.JDDParticipants.restore(players);
  if (window.JDD) {
    window.JDD.players = players;
  }

  const modules = window.JDDModules || {};

  const elements = {
    body: document.body,
    setupScreen: document.getElementById('setup'),
    gameScreen: document.getElementById('game'),
    undercoverScreen: document.getElementById('undercover'),
    headsScreen: document.getElementById('heads'),
    geographyScreen: document.getElementById('geography'),
    footballScreen: document.getElementById('football'),
    duelScreen: document.getElementById('duel'),
    playerInput: document.getElementById('playerInput'),
    playerError: document.getElementById('playerError'),
    playerList: document.getElementById('playerList'),
    playersDialog: document.getElementById('playersDialog'),
    dialogPlayerInput: document.getElementById('dialogPlayerInput'),
    dialogPlayerList: document.getElementById('dialogPlayerList'),
    dialogMode: document.getElementById('playersDialogMode'),
    dialogArt: document.getElementById('playersDialogArt'),
    dialogStatus: document.getElementById('playersDialogStatus'),
    dialogStartButton: document.getElementById('dialogStartBtn'),
    selectedModeLabel: document.getElementById('homeSelectedMode'),
    playerCount: document.getElementById('homePlayerCount'),
    typeBox: document.getElementById('typeBox'),
    currentQuestion: document.getElementById('currentQuestion'),
    questionMedia: document.getElementById('questionMedia'),
    questionMediaStatus: document.getElementById('questionMediaStatus'),
    answerBox: document.getElementById('answerBox'),
    showAnswerButton: document.getElementById('showAnswerBtn'),
    answerText: document.getElementById('answerText'),
    backLogo: document.getElementById('backLogo'),
    categoryIllustration: document.getElementById('categoryIllustration'),
    gameModeLabel: document.getElementById('gameModeLabel'),
    customWeightsBox: document.getElementById('customWeights'),
    cultureToggleContainer: document.getElementById('cultureToggleContainer'),
    cultureToggle: document.getElementById('cultureToggle'),
    gorgeesText: document.getElementById('gorgeesText'),
    teamsText: document.getElementById('teamsText'),
    mcqBox: document.getElementById('mcqBox'),
    mcqGrid: document.getElementById('mcqGrid'),
    undercoverButton: document.getElementById('undercoverBtn'),
    headsButton: document.getElementById('headsBtn'),
    geographyButton: document.getElementById('geographyBtn'),
    footballButton: document.getElementById('footballBtn'),
    duelButton: document.getElementById('duelBtn'),
  };

  const sliderElements = {
    debut: document.getElementById('weight-debut'),
    hardcore: document.getElementById('weight-hardcore'),
    alcool: document.getElementById('weight-alcool'),
    culture: document.getElementById('weight-culture'),
  };

  const state = {
    currentMode: 'debut',
    weights: {
      debut: 25,
      hardcore: 25,
      alcool: 25,
      culture: 25,
    },
    cultureDrinkMode: false,
    answerShownAt: -Infinity,
  };
  let playersDialogContext = null;
  let mediaRequest = 0;
  let partySession = null;
  const cultureStreaks = new Map();
  let cultureTurn = null;

  function markCultureResponse(correct) {
    if (!cultureTurn || cultureTurn.answered) return false;
    cultureTurn.answered = true;
    if (state.currentMode === 'culture') {
      cultureStreaks.set(cultureTurn.key, correct ? (cultureStreaks.get(cultureTurn.key) || 0) + 1 : 0);
      if (!correct) window.JDDVisuals.updateStreak(document.getElementById('cultureStreak'), 0);
    }
    return true;
  }

  const MODE_BACKGROUNDS = {
    'VÉRITÉ': 'var(--yellow)',
    ACTION: 'var(--pink)',
    TOUS: 'var(--green)',
    'CULTURE G.': 'var(--cyan)',
    // cartes Picolo : règles sur plusieurs cartes et cartes en équipes
    'RÈGLE': '#9b6bff',
    'FIN DE RÈGLE': '#9b6bff',
    'SUITE': '#9b6bff',
    'ÉQUIPES': '#ff6b6b',
  };

  const TYPE_LABELS = {
    TOUS: 'TOUT LE MONDE',
  };

  const CATEGORY_PRESENTATION = {
    debut: { label: 'Apéro chiantos', image: 'apero.webp' },
    hardcore: { label: 'Sexy pas raffiné', image: 'hardcore.webp' },
    alcool: { label: 'Torgnole express', image: 'torgnole.webp' },
    culture: { label: 'Culture G.', image: 'culture.webp' },
  };

  // Dans un mix personnalisé, l'illustration suit la banque de la carte tirée.
  function showCategory(mode) {
    const presentation = CATEGORY_PRESENTATION[mode];
    if (!presentation) return;
    elements.gameScreen.dataset.category = mode;
    elements.gameModeLabel.textContent = presentation.label;
    elements.categoryIllustration.setAttribute('src', `image/home/${presentation.image}`);
  }

  // Mots en tête de question qu'on peut passer en minuscule après « Prénom, »
  const LOWERCASE_STARTERS = new Set([
    'quel', 'quelle', 'quels', 'quelles', 'qui', 'que', "qu'est-ce", 'quoi', 'combien', 'comment', 'où', 'pourquoi',
    'quand', 'lequel', 'laquelle', 'lesquels', 'lesquelles', 'dans', 'en', 'de', 'du', 'des', 'sur', 'pour', 'avec',
    'chez', 'complète', 'parmi', 'à', 'au', 'aux', 'le', 'la', 'les', 'un', 'une', 'ce', 'cette', 'ces', 'cet', 'son',
    'sa', 'ses', 'il', 'elle', 'on', 'est-ce', 'si', 'depuis', 'avant', 'après', 'par', 'cite', 'donne', 'trouve',
    'devine', 'selon', 'entre', 'sans', 'contre', 'vrai', 'quelqu', 'traduis', 'termine', 'l', 'd', 'qu', 'jusqu',
    'environ', 'lors', 'pendant', 'sous', 'hors', 'juste', 'ton', 'ta', 'tes', 'génétiquement', 'techniquement',
    'officiellement', 'historiquement', 'morte', 'mort', 'capturé', 'recalé', 'déroulé', 'partie', 'champions',
    'allemand', 'français', 'française', 'né', 'née', 'âgé', 'âgée', 'surnommé', 'surnommée', 'parmi', 'voici',
    'lorsque', 'lorsqu', 'deux', 'douze', 'aucun', 'chaque', 'nous', 'toutes', 'durant', 'comparé', 'contrairement',
    'au-delà', 'au-dessus', 'grâce', 'plus', 'vers', 'puisqu',
  ]);
  // Premier mot écrit sans son accent dans certaines questions (« A quelle… », « Ou se trouve… »)
  const ACCENTED_STARTERS = { a: 'à', ou: 'où' };

  function loadPlayers() {
    try {
      const stored = JSON.parse(localStorage.getItem(PLAYERS_KEY) || '[]');
      let names = Array.isArray(stored) ? stored.filter((name) => typeof name === 'string' && name.trim()).slice(0, MAX_PLAYERS) : [];
      // À la première ouverture, récupérer l'ancienne bande Undercover si l'accueil est vide.
      // Le repère évite de réinscrire ces noms après un retrait volontaire.
      if (!localStorage.getItem(SHARED_PLAYERS_KEY)) {
        if (!names.length) {
          let old;
          try { old = JSON.parse(localStorage.getItem('jdd.undercover.v2') || 'null'); } catch (_) { /* ancien stockage invalide */ }
          if (old && Array.isArray(old.players)) {
            names = old.players.map((player) => player && player.name)
              .filter((name) => typeof name === 'string' && name.trim());
            names = names.filter((name, index) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index).slice(0, MAX_PLAYERS);
          }
        }
        try { localStorage.setItem(SHARED_PLAYERS_KEY, '1'); } catch (_) { /* conserver les noms si le stockage est plein */ }
      }
      return names;
    } catch (error) {
      return [];
    }
  }

  function savePlayers() {
    try {
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    } catch (error) {
      // stockage indisponible (navigation privée) : la liste reste en mémoire
    }
  }

  function rejectPlayer(input, message) {
    input.classList.add('input-error');
    input.select();
    setTimeout(() => input.classList.remove('input-error'), 900);
    if (input === elements.dialogPlayerInput) {
      input.setAttribute('aria-invalid', 'true');
      updatePlayersDialog(message);
    } else if (input.closest('.jdd-player-editor')) {
      const status = input.closest('.jdd-player-editor').querySelector('.jdd-player-error');
      input.setAttribute('aria-invalid', 'true');
      status.textContent = message;
      status.hidden = false;
    } else if (elements.playerError) {
      input.setAttribute('aria-invalid', 'true');
      elements.playerError.textContent = message;
      elements.playerError.hidden = false;
    }
    return false;
  }

  function clearPlayerError() {
    if (elements.playerError) {
      elements.playerError.hidden = true;
      elements.playerError.textContent = '';
    }
    elements.playerInput.removeAttribute('aria-invalid');
  }

  // « Jean  Paul » et « Jean Paul », ou un « Zoé » copié-collé, sont le même prénom
  function cleanName(value) {
    return String(value).normalize('NFC').replace(/\s+/g, ' ').trim();
  }

  function addPlayer(input = elements.playerInput, limit = MAX_PLAYERS) {
    const name = cleanName(input.value);
    if (!name) {
      return input === elements.dialogPlayerInput ? rejectPlayer(input, 'Entre un prénom pour ajouter un joueur.') : false;
    }
    const maximum = input === elements.dialogPlayerInput && playersDialogContext ? playersDialogContext.maximum : limit;
    if (players.length >= maximum) {
      return rejectPlayer(input, `La bande est complète : ${maximum} joueurs maximum.`);
    }
    const added = window.JDDParticipants.addGuest(name);
    if (added.error) return rejectPlayer(input, added.error);
    players.push(added.participant.label);
    if (input === elements.playerInput) clearPlayerError();
    input.value = '';
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
    input.focus();
    renderPlayerList();
    return true;
  }

  function removePlayer(index) {
    window.JDDParticipants.remove(players[index]);
    players.splice(index, 1);
    renderPlayerList();
  }

  // Après un retrait, les ❌ restent grisés un instant : le 2e tap d'un double tap
  // tomberait sur le ❌ du joueur suivant, remonté sous le doigt.
  const REMOVE_DELAY = 400;
  let lastRemoveAt = 0;
  function renderPlayersInto(list) {
    list.innerHTML = '';
    const wait = REMOVE_DELAY - (Date.now() - lastRemoveAt);
    players.forEach((name, index) => {
      const item = window.JDDPlayerEditor.chip(name, { removePlayer() {
        if (Date.now() - lastRemoveAt < REMOVE_DELAY) return;
        lastRemoveAt = Date.now();
        removePlayer(index);
        if (list === elements.dialogPlayerList) elements.dialogPlayerInput.focus();
      } });
      item.classList.add('player-item');
      const removeButton = item.querySelector('.remove-btn');
      if (wait > 0) {
        removeButton.disabled = true;
        setTimeout(() => { removeButton.disabled = false; }, wait);
      }

      list.appendChild(item);
    });
    window.JDDPlayerEditor.fitNames(list);
  }

  function renderPlayerList() {
    renderPlayersInto(elements.playerList);
    if (elements.playersDialog.open) {
      renderPlayersInto(elements.dialogPlayerList);
      updatePlayersDialog();
    }
    if (elements.playerCount) {
      elements.playerCount.textContent = window.JDDPlayerEditor.countLabel(players.length);
      document.getElementById('homeRosterCount').textContent = elements.playerCount.textContent;
    }
    savePlayers();
    window.dispatchEvent(new Event('jdd:players'));
    Object.values(modules).forEach((module) => {
      if (typeof module.onPlayersChanged === 'function') module.onPlayersChanged();
    });
  }

  function minimumPlayers() {
    return state.currentMode === 'culture' ? 1 : 2;
  }

  function updatePlayersDialog(error = '') {
    const { minimum, maximum } = playersDialogContext;
    const remaining = Math.max(0, minimum - players.length);
    document.getElementById('dialogRosterCount').textContent = window.JDDPlayerEditor.countLabel(players.length);
    const note = players.length > maximum ? `${maximum} joueurs maximum : retire quelques prénoms pour ce jeu.` : !remaining ? ''
      : `Ajoute encore ${remaining} joueur${remaining > 1 ? 's' : ''} pour lancer.`;
    document.getElementById('playersDialogRequirement').textContent = note;
    elements.dialogStatus.textContent = error;
    elements.dialogStatus.dataset.error = String(Boolean(error));
    const draft = elements.dialogPlayerInput.value.trim();
    const canAddDraft = draft && players.length < maximum
      && !players.some((name) => name.toLowerCase() === draft.toLowerCase());
    // Le dernier prénom peut être ajouté directement avec « Lancer la partie ».
    elements.dialogStartButton.disabled = players.length + (canAddDraft ? 1 : 0) < minimum || players.length > maximum;
  }

  function partyPlayersContext() {
    const selectedCard = document.querySelector('.mode-card[data-mode].active');
    return { label: elements.selectedModeLabel.textContent, image: selectedCard.querySelector('img').src,
      minimum: minimumPlayers(), maximum: MAX_PLAYERS, onConfirm: startGame };
  }

  function gamePlayersContext(kind, onConfirm, editing = false) {
    const games = {
      undercover: { label: 'Undercover', image: 'image/home/undercover.webp', minimum: 3, maximum: 20 },
      heads: { label: 'Devine Tête', image: 'image/home/mascotte.webp', minimum: 2, maximum: MAX_PLAYERS },
      geography: { label: 'Géographie', image: 'image/home/geography.webp', minimum: 1, maximum: MAX_PLAYERS },
    };
    return { ...games[kind],
      buttonLabel: editing ? 'Valider les joueurs' : 'Lancer la partie', onConfirm };
  }

  function removeSharedPlayer(name) {
    if (Date.now() - lastRemoveAt < REMOVE_DELAY) return;
    const index = players.indexOf(name);
    if (index < 0) return;
    lastRemoveAt = Date.now();
    removePlayer(index);
  }

  function openPlayersDialog(context = partyPlayersContext()) {
    playersDialogContext = context;
    elements.dialogMode.textContent = context.label;
    elements.dialogArt.src = context.image;
    elements.dialogStartButton.firstChild.textContent = context.buttonLabel || 'Lancer la partie';
    elements.dialogPlayerInput.value = '';
    elements.dialogPlayerInput.classList.remove('input-error');
    elements.dialogPlayerInput.removeAttribute('aria-invalid');
    if (!elements.playersDialog.open) elements.playersDialog.showModal();
    renderPlayersInto(elements.dialogPlayerList);
    updatePlayersDialog();
    elements.playersDialog.scrollTop = 0;
    elements.playersDialog.querySelector('.home-dialog-content').scrollTop = 0;
    elements.dialogMode.focus({ preventScroll: true });
  }

  function setBackground(type) {
    elements.body.style.background = MODE_BACKGROUNDS[type] || 'var(--cyan)';
  }

  function normalizeType(rawType) {
    const type = String(rawType || '').trim().toUpperCase();
    if (type === 'QUESTION') return 'TOUS';
    if (type === 'VERITE') return 'VÉRITÉ';
    return type || 'ACTION';
  }

  function addressPlayer(playerName, sentence) {
    const text = String(sentence || '').trim();
    const firstWord = text.split(/[\s,:;!?«»"'’]/)[0].toLowerCase();
    const accented = ACCENTED_STARTERS[firstWord];
    const body = accented ? accented + text.slice(firstWord.length)
      : LOWERCASE_STARTERS.has(firstWord) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
    return playerName ? `${playerName}, ${body}` : text;
  }

  function hideQuestionArea() {
    mediaRequest += 1;
    elements.questionMedia.replaceChildren();
    elements.questionMedia.classList.add('hidden');
    elements.questionMediaStatus.replaceChildren();
    elements.questionMediaStatus.classList.add('hidden');
    elements.mcqBox.style.display = 'none';
    elements.mcqGrid.innerHTML = '';
    elements.answerBox.style.display = 'none';
    elements.showAnswerButton.style.display = 'none';
    elements.answerText.textContent = '';
  }

  function showCultureExtras() {
    elements.cultureToggleContainer.classList.remove('hidden');
    if (state.cultureDrinkMode) {
      const amount = Math.floor(Math.random() * 3) + 1;
      elements.gorgeesText.textContent = `${amount} gorgée${amount > 1 ? 's' : ''}`;
      elements.gorgeesText.classList.remove('hidden');
    }
  }

  function renderQuizImages(question, options, buttons) {
    const request = mediaRequest;
    const images = [];
    const addImage = (parent, url, alt, credit) => {
      const figure = document.createElement('figure');
      figure.className = 'quiz-image-figure';
      const image = document.createElement('img');
      image.className = 'quiz-image';
      image.alt = alt;
      image.decoding = 'async';
      figure.appendChild(image);
      if (credit && credit !== 'null') {
        const caption = document.createElement('figcaption');
        caption.textContent = credit.replace(/§/g, ' · ');
        figure.appendChild(caption);
      }
      parent.appendChild(figure);
      images.push({ image, url, loaded: false, failed: false });
    };
    if (question.image) {
      elements.questionMedia.classList.remove('hidden');
      addImage(elements.questionMedia, question.image, 'Image de la question', question.imageCredit);
    }
    options.forEach((option, index) => {
      if (option.image) addImage(buttons[index], option.image, `Proposition ${String.fromCharCode(65 + index)}`, option.credit);
    });
    if (!images.length) return;

    const update = () => {
      if (request !== mediaRequest) return;
      const failed = images.some(item => item.failed);
      const ready = images.every(item => item.loaded);
      buttons.forEach(button => { button.disabled = !ready; });
      elements.questionMediaStatus.replaceChildren();
      elements.questionMediaStatus.classList.toggle('hidden', ready);
      if (ready) return;
      const text = document.createElement('p');
      text.textContent = failed ? 'Une image n’a pas pu être chargée. Réessaie ou passe à la question suivante.' : 'Chargement des images…';
      elements.questionMediaStatus.appendChild(text);
      if (failed) {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.textContent = 'Réessayer';
        retry.addEventListener('click', event => {
          event.stopPropagation();
          images.filter(item => item.failed).forEach(item => {
            item.failed = false;
            item.image.removeAttribute('src');
            item.image.src = item.url;
          });
          update();
        });
        const next = document.createElement('button');
        next.type = 'button';
        next.textContent = 'Question suivante';
        next.addEventListener('click', event => { event.stopPropagation(); showQuestion(); });
        elements.questionMediaStatus.append(retry, next);
      }
    };
    update();
    images.forEach(item => {
      item.image.addEventListener('load', () => { item.loaded = true; item.failed = false; update(); });
      item.image.addEventListener('error', () => { item.loaded = false; item.failed = true; update(); });
      item.image.src = item.url;
    });
  }

  function renderMcq(question, playerName) {
    const resultEvent = quizEvent(playerName);
    const isTrueFalse = question.vf === true;
    const prompt = question.image ? question.imageTitle || 'Quelle est la bonne réponse pour cette image ?' : question.question;
    elements.typeBox.textContent = 'CULTURE G.';
    setBackground('CULTURE G.');
    elements.currentQuestion.textContent = isTrueFalse
      ? `${playerName ? `${playerName}, v` : 'V'}rai ou faux : ${question.question}`
      : addressPlayer(playerName, prompt);

    elements.answerBox.style.display = 'block';
    elements.mcqBox.style.display = 'block';
    elements.mcqGrid.innerHTML = '';
    elements.mcqGrid.classList.toggle('mcq-grid--vf', isTrueFalse);
    elements.mcqGrid.classList.toggle('mcq-grid--images', Boolean(question.choiceImages));

    const credits = (question.imageCredit || '').split('±');
    const options = question.choices.map((label, index) => ({ label, sourceIndex: index, correct: index === question.answerIndex,
      image: question.choiceImages && question.choiceImages[index], credit: credits[index] }));
    if (!isTrueFalse) {
      window.JDD.shuffle(options);
    }

    const buttons = options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mcq-btn';
      if (option.image) {
        button.classList.add('mcq-btn--image');
        button.setAttribute('aria-label', `Proposition ${String.fromCharCode(65 + elements.mcqGrid.children.length)}`);
      } else {
        const label = document.createElement('span');
        label.className = 'mcq-label';
        label.textContent = option.label;
        button.appendChild(label);
      }
      button.addEventListener(
        'click',
        (event) => {
          event.stopPropagation();
          if (!markCultureResponse(option.correct)) return;
          buttons.forEach((btn, index) => {
            btn.disabled = true;
            if (options[index].correct) btn.classList.add('mcq-correct');
          });
          if (!option.correct) button.classList.add('mcq-wrong');
          window.JDDCloud.record(resultEvent, [{ participant: resultEvent?.participants[0], metrics: {
            questions_answered: 1, correct_answers: Number(option.correct),
          } }], { question_id: String(question.id || window.JDD.cardId?.(question) || question.question).slice(0, 240),
            selected_answer: option.sourceIndex, correct: option.correct });
          if (question.note) elements.answerText.textContent = `💡 ${question.note}`;
        },
        { once: true }
      );
      elements.mcqGrid.appendChild(button);
      return button;
    });
    renderQuizImages(question, options, buttons);
  }

  function fitCultureText() {
    requestAnimationFrame(() => {
      if (elements.gameScreen.classList.contains('hidden') || elements.gameScreen.dataset.category !== 'culture') return;
      // Garder les mots entiers, même pour une URL ou un nom très long du classeur.
      const labels = [elements.currentQuestion, ...elements.mcqGrid.querySelectorAll('.mcq-label')];
      labels.forEach(label => {
        label.style.fontSize = '';
        let size = parseFloat(getComputedStyle(label).fontSize);
        while (size > 8 && label.scrollWidth > label.clientWidth + 1) {
          size -= .5;
          label.style.fontSize = `${size}px`;
        }
      });
    });
  }

  function renderOpenQuestion(question, playerName) {
    const resultEvent = quizEvent(playerName);
    elements.typeBox.textContent = 'CULTURE G.';
    setBackground('CULTURE G.');
    elements.currentQuestion.textContent = addressPlayer(playerName, question.question);
    elements.showAnswerButton.style.display = 'inline-block';
    elements.answerBox.style.display = 'block';
    elements.showAnswerButton.onclick = (event) => {
      event.stopPropagation();
      elements.answerText.textContent = `✅ Réponse : ${question.answer}${question.note ? ` — ${question.note}` : ''}`;
      elements.showAnswerButton.style.display = 'none';
      state.answerShownAt = event.timeStamp;
      window.JDDCloud.record(resultEvent, [{ participant: resultEvent?.participants[0], metrics: { answers_revealed: 1 } }],
        { question_id: String(question.id || question.question).slice(0, 240) });
      if (state.currentMode === 'culture') {
        const verdicts = document.getElementById('cultureVerdicts');
        verdicts.hidden = false;
        verdicts.innerHTML = '<button type="button" data-culture-verdict="wrong">✕ Incorrect</button><button type="button" data-culture-verdict="correct">✓ Correct</button>';
        verdicts.querySelectorAll('button').forEach(button => button.addEventListener('click', event => {
          event.stopPropagation();
          const correct = button.dataset.cultureVerdict === 'correct';
          if (!markCultureResponse(correct)) return;
          verdicts.querySelectorAll('button').forEach(node => { node.disabled = true; });
          button.classList.add(correct ? 'mcq-correct' : 'mcq-wrong');
          window.JDDCloud.record(resultEvent, [{ participant: resultEvent?.participants[0], metrics: {
            answers_revealed: 1, questions_answered: 1, correct_answers: Number(correct),
          } }], { question_id: String(question.id || question.question).slice(0, 240), correct });
        }, { once: true }));
      }
    };
  }

  function quizEvent(playerName) {
    const event = window.JDDCloud.begin('culture', []);
    event.host = partySession?.host || null;
    event.participants = partySession?.participants.filter(p => p.label === playerName) || [];
    return event;
  }

  function recordCard(mode, label) {
    if (!partySession) return;
    const event = window.JDDCloud.begin(mode, []);
    event.host = partySession.host;
    event.participants = label ? partySession.participants.filter(p => p.label === label) : partySession.participants;
    window.JDDCloud.record(event, event.participants.map(participant => ({ participant, metrics: { cards_seen: 1 } })));
  }

  function pickCustomMode() {
    const total = state.weights.debut + state.weights.hardcore + state.weights.alcool + state.weights.culture;
    let draw = Math.random() * total;
    if (draw < state.weights.debut) return 'debut';
    draw -= state.weights.debut;
    if (draw < state.weights.hardcore) return 'hardcore';
    draw -= state.weights.hardcore;
    if (draw < state.weights.alcool) return 'alcool';
    return 'culture';
  }

  function showCulture(data) {
    const open = Array.isArray(data.culture) ? data.culture : [];
    const mcq = Array.isArray(data.cultureMcq) ? data.cultureMcq : [];
    if (!open.length && !mcq.length) return;

    const player = window.JDD.nextPlayer(players);
    const identity = window.JDDParticipants.get(player);
    cultureTurn = { key: identity ? `${identity.kind}:${identity.id}` : player, answered: false };
    window.JDDVisuals.updateStreak(document.getElementById('cultureStreak'),
      state.currentMode === 'culture' ? cultureStreaks.get(cultureTurn.key) || 0 : 0);
    const useMcq = Math.random() * (open.length + mcq.length) < mcq.length;
    showCultureExtras();
    if (useMcq) {
      renderMcq(window.JDD.drawCard('culture-mcq', mcq), player);
    } else {
      renderOpenQuestion(window.JDD.drawCard('culture-open', open), player);
    }
    fitCultureText();
  }

  function showPicoloCard(mode, card) {
    elements.typeBox.textContent = TYPE_LABELS[card.type] || card.type;
    setBackground(card.type);
    elements.currentQuestion.textContent = card.text;
    if (card.teams && elements.teamsText) {
      elements.teamsText.textContent = card.teams;
      elements.teamsText.classList.remove('hidden');
    }
    recordCard(mode, card.addressed);
  }

  function showPartyCard(mode, pool) {
    const raw = window.JDD.drawCard(mode, pool);
    if (raw && typeof raw === 'object' && window.JDD.renderPicolo) {
      showPicoloCard(mode, window.JDD.renderPicolo(raw, players));
      return;
    }
    if (typeof raw !== 'string') return;
    const separator = raw.indexOf('|');
    const type = normalizeType(separator > -1 ? raw.slice(0, separator) : 'ACTION');
    const text = separator > -1 ? raw.slice(separator + 1) : raw;

    let questionText = text, addressed = null;
    if (questionText.includes('{player}')) {
      const player = window.JDD.nextPlayer(players);
      addressed = player;
      questionText = questionText.replace(/\{player\}/g, player);
      if (questionText.includes('{other}')) {
        questionText = questionText.replace(/\{other\}/g, window.JDD.pickOther(players, player));
      }
    } else if (questionText.includes('{other}')) {
      questionText = questionText.replace(/\{other\}/g, window.JDD.pickOther(players, null));
    }

    elements.typeBox.textContent = TYPE_LABELS[type] || type;
    setBackground(type);
    elements.currentQuestion.textContent = questionText;
    recordCard(mode, addressed);
  }

  function showQuestion() {
    if (cultureTurn && !cultureTurn.answered) markCultureResponse(false);
    cultureTurn = null;
    window.JDDVisuals.updateStreak(document.getElementById('cultureStreak'), 0);
    const verdicts = document.getElementById('cultureVerdicts');
    verdicts.hidden = true; verdicts.replaceChildren();
    window.scrollTo(0, 0);
    elements.currentQuestion.textContent = '';
    elements.typeBox.textContent = '';
    hideQuestionArea();
    elements.cultureToggleContainer.classList.add('hidden');
    elements.gorgeesText.classList.add('hidden');
    if (elements.teamsText) elements.teamsText.classList.add('hidden');

    // Fin d'une règle Picolo en cours ou suite d'un mini-jeu : prioritaire sur le tirage
    const due = window.JDD.picoloDue ? window.JDD.picoloDue(players) : null;
    if (due) {
      showCategory(due.mode);
      showPicoloCard(due.mode, due);
      return;
    }

    const mode = state.currentMode === 'custom' ? pickCustomMode() : state.currentMode;
    const data = (window.JDD && window.JDD.DATA) || {};
    showCategory(mode);

    if (mode === 'culture') {
      showCulture(data);
      return;
    }

    const pool = window.JDD.partyPool ? window.JDD.partyPool(mode, players.length) : data[mode];
    showPartyCard(mode, Array.isArray(pool) ? pool : []);
  }

  function nextQuestion(event) {
    if (event.target === elements.showAnswerButton || event.target.closest('.toggle-container .switch, .toggle-container .toggle-label')) {
      return;
    }
    if (event.timeStamp - state.answerShownAt < 500) {
      return;
    }
    if (event.clientX <= window.innerWidth / 2) {
      return;
    }
    showQuestion();
  }

  // Tous les scripts « defer » ont été exécutés au DOMContentLoaded.
  let dataReady = false;
  document.addEventListener('DOMContentLoaded', () => { dataReady = true; }, { once: true });

  function startGame() {
    if (!dataReady) {
      document.addEventListener('DOMContentLoaded', startGame, { once: true });
      return;
    }
    if (players.length < minimumPlayers()) {
      openPlayersDialog();
      return;
    }
    if (elements.playersDialog.open) elements.playersDialog.close();
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.remove('hidden');
    if (window.JDD.resetPicolo) window.JDD.resetPicolo();
    cultureStreaks.clear(); cultureTurn = null;
    partySession = window.JDDCloud.begin(state.currentMode, players);
    window.JDDCloud.record(partySession, partySession.participants.map(participant => ({ participant, metrics: { games: 1 } })));
    showQuestion();
  }

  function updateWeights() {
    const total = Object.values(sliderElements).reduce((sum, input) => sum + Number(input.value), 0);
    if (!total) {
      return;
    }
    Object.entries(sliderElements).forEach(([key, input]) => {
      state.weights[key] = (Number(input.value) / total) * 100;
    });
  }

  const SETTINGS_KEY = 'jdd.settings';

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        mode: state.currentMode,
        drink: state.cultureDrinkMode,
        sliders: Object.fromEntries(Object.entries(sliderElements).map(([key, input]) => [key, Number(input.value)])),
      }));
    } catch (error) {
      // navigation privée : réglages gardés en mémoire
    }
  }

  function restoreSettings() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (_) { /* réglages invalides */ }
    if (!saved || typeof saved !== 'object') return false;
    Object.entries(sliderElements).forEach(([key, input]) => {
      const value = Number(saved.sliders && saved.sliders[key]);
      if (Number.isFinite(value)) input.value = String(Math.min(100, Math.max(0, value)));
    });
    updateWeights();
    state.cultureDrinkMode = saved.drink === true;
    elements.cultureToggle.checked = state.cultureDrinkMode;
    const card = typeof saved.mode === 'string'
      && Array.from(document.querySelectorAll('.mode-card[data-mode]')).find((item) => item.dataset.mode === saved.mode);
    if (!card) return false;
    activateModeCard(card);
    return true;
  }

  function activateModeCard(selectedCard) {
    document.querySelectorAll('.mode-card[data-mode]').forEach((card) => {
      card.classList.remove('active');
      card.setAttribute('aria-pressed', 'false');
    });
    selectedCard.classList.add('active');
    selectedCard.setAttribute('aria-pressed', 'true');
    state.currentMode = selectedCard.dataset.mode;
    if (elements.selectedModeLabel) {
      const label = selectedCard.querySelector('.home-mode-label');
      elements.selectedModeLabel.textContent = Array.from(label.childNodes, (node) => (node.nodeName === 'BR' ? ' ' : node.textContent))
        .join('').replace(/\s+/g, ' ').trim();
    }
    elements.customWeightsBox.classList.toggle('hidden', state.currentMode !== 'custom');
    saveSettings();
  }

  function openUndercover() {
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.undercoverScreen.classList.remove('hidden');
    elements.body.classList.add('uc-open');
    if (modules.undercover && typeof modules.undercover.onOpen === 'function') {
      modules.undercover.onOpen();
    }
  }

  function closeUndercover() {
    elements.undercoverScreen.classList.add('hidden');
    elements.setupScreen.classList.remove('hidden');
    elements.body.classList.remove('uc-open');
    elements.body.style.background = 'var(--cyan)';
    window.scrollTo(0, 0);
  }

  function openHeads() {
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.headsScreen.classList.remove('hidden');
    if (modules.heads && typeof modules.heads.onOpen === 'function') {
      modules.heads.onOpen();
    }
  }

  function closeHeads() {
    elements.headsScreen.classList.add('hidden');
    elements.setupScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function openGeography() {
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.geographyScreen.classList.remove('hidden');
    modules.geography.onOpen();
  }

  function closeGeography() {
    elements.geographyScreen.classList.add('hidden');
    elements.setupScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function openFootball() {
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.footballScreen.classList.remove('hidden');
    modules.football.onOpen();
  }

  function closeFootball() {
    elements.footballScreen.classList.add('hidden');
    elements.setupScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function openDuel() {
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.duelScreen.classList.remove('hidden');
    modules.duel.onOpen();
  }

  function closeDuel() {
    elements.duelScreen.classList.add('hidden');
    elements.setupScreen.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function attachEvents() {
    window.addEventListener('jdd:profiles', () => {
      renderPlayersInto(elements.playerList);
      if (elements.playersDialog.open) renderPlayersInto(elements.dialogPlayerList);
    });
    window.addEventListener('resize', fitCultureText);
    if (document.fonts) document.fonts.ready.then(fitCultureText);
    document.getElementById('playerForm').addEventListener('submit', (event) => {
      event.preventDefault();
      addPlayer();
    });
    elements.playerInput.addEventListener('input', clearPlayerError);
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('dialogPlayerForm').addEventListener('submit', (event) => {
      event.preventDefault();
      addPlayer(elements.dialogPlayerInput);
    });
    elements.dialogPlayerInput.addEventListener('input', () => {
      elements.dialogPlayerInput.classList.remove('input-error');
      elements.dialogPlayerInput.removeAttribute('aria-invalid');
      updatePlayersDialog();
    });
    elements.dialogStartButton.addEventListener('click', () => {
      if (elements.dialogPlayerInput.value.trim() && !addPlayer(elements.dialogPlayerInput)) return;
      const context = playersDialogContext;
      if (players.length < context.minimum || players.length > context.maximum) return;
      elements.playersDialog.close();
      context.onConfirm();
    });
    document.getElementById('closePlayersDialog').addEventListener('click', () => elements.playersDialog.close());
    elements.playersDialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const controls = [...elements.playersDialog.querySelectorAll('button, input, [tabindex="0"]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
      if (first && (active === elements.dialogMode || (event.shiftKey ? active === first : active === last))) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    });
    elements.playersDialog.addEventListener('click', (event) => {
      if (event.target !== elements.playersDialog) return;
      const bounds = elements.playersDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) elements.playersDialog.close();
    });
    elements.playersDialog.addEventListener('close', () => {
      if (elements.playersDialog.open) return;
      elements.dialogPlayerList.innerHTML = '';
      elements.dialogPlayerInput.value = '';
      playersDialogContext = null;
    });

    document.addEventListener('click', (event) => {
      // le clic qui lance la partie (accueil, fenêtre des joueurs) ne doit pas sauter la 1re carte
      if (elements.gameScreen.classList.contains('hidden') || event.target.closest('#setup, dialog')) return;
      nextQuestion(event);
    });
    elements.backLogo.addEventListener('click', (event) => {
      event.stopPropagation();
      elements.gameScreen.classList.add('hidden');
      elements.setupScreen.classList.remove('hidden');
      elements.body.style.background = 'var(--cyan)';
      window.scrollTo(0, 0);
    });

    elements.cultureToggle.addEventListener('change', () => {
      state.cultureDrinkMode = elements.cultureToggle.checked;
      saveSettings();
    });

    Object.values(sliderElements).forEach((input) => {
      input.addEventListener('input', () => { updateWeights(); saveSettings(); });
    });

    document.querySelectorAll('.mode-card[data-mode]').forEach((card) => {
      card.addEventListener('click', () => activateModeCard(card));
    });

    elements.undercoverButton.addEventListener('click', openUndercover);
    elements.headsButton.addEventListener('click', openHeads);
    elements.geographyButton.addEventListener('click', openGeography);
    elements.footballButton.addEventListener('click', openFootball);
    elements.duelButton.addEventListener('click', openDuel);
  }

  function init() {
    // Un module en erreur (ex. vieux fichier encore en cache) ne doit pas bloquer tout le jeu
    try {
      if (modules.undercover && typeof modules.undercover.init === 'function') {
        modules.undercover.init({
          onExit: closeUndercover,
          getSuggestedNames: () => players.slice(),
          addPlayer, removePlayer: removeSharedPlayer,
          editPlayers: (onConfirm) => openPlayersDialog(gamePlayersContext('undercover', onConfirm, true)),
        });
      }
    } catch (error) {
      console.error('Undercover indisponible', error);
    }
    try {
      if (modules.heads && typeof modules.heads.init === 'function') {
        modules.heads.init({ onExit: closeHeads, getSuggestedNames: () => players.slice(),
          addPlayer, removePlayer: removeSharedPlayer,
          editPlayers: (onConfirm) => openPlayersDialog(gamePlayersContext('heads', onConfirm, true)) });
      }
    } catch (error) {
      console.error('Devine Tête indisponible', error);
    }
    try {
      modules.geography.init({ onExit: closeGeography, getSuggestedNames: () => players.slice(),
        addPlayer, removePlayer: removeSharedPlayer });
    } catch (error) { console.error('Géographie indisponible', error); }
    try {
      modules.football.init({ onExit: closeFootball, getSuggestedNames: () => players.slice(),
        addPlayer, removePlayer: removeSharedPlayer });
    } catch (error) { console.error('Grand Quiz Foot indisponible', error); }
    try {
      modules.duel.init({ onExit: closeDuel, getSuggestedNames: () => players.slice(),
        addPlayer, removePlayer: removeSharedPlayer });
    } catch (error) { console.error('Duel Foot indisponible', error); }
    attachEvents();
    const defaultCard = document.querySelector('.mode-card[data-mode="debut"]');
    if (!restoreSettings() && defaultCard) {
      defaultCard.classList.add('active');
    }
    renderPlayerList();
  }

  window.JDD.addAccountPlayer = (profile, maximum = MAX_PLAYERS) => {
    if (!window.JDDAccounts.getUser()) return 'Connecte-toi pour ajouter un compte.';
    if (elements.playersDialog.open && playersDialogContext) maximum = Math.min(maximum, playersDialogContext.maximum);
    if (players.length >= maximum) return `La bande est complète : ${maximum} joueurs maximum.`;
    const p = window.JDDParticipants.addAccount(profile);
    if (p) { players.push(p.label); renderPlayerList(); }
    return null;
  };
  window.JDD.clearAccountPlayers = () => {
    window.JDDParticipants.all().filter(p => p.kind === 'account').forEach(p => window.JDDParticipants.remove(p.label));
    players.splice(0, players.length, ...window.JDDParticipants.labels()); renderPlayerList();
  };
  window.JDD.retainAccountPlayers = ids => {
    const available = new Set(ids);
    const absent = window.JDDParticipants.all().filter(p => p.kind === 'account' && !available.has(p.id));
    if (!absent.length) return;
    absent.forEach(p => window.JDDParticipants.remove(p.label));
    players.splice(0, players.length, ...window.JDDParticipants.labels()); renderPlayerList();
  };

  init();
})();

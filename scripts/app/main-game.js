(function () {
  const PLAYERS_KEY = 'jdd.players';
  const SHARED_PLAYERS_KEY = 'jdd.players.shared-v1';
  const MAX_PLAYERS = 30;

  const players = loadPlayers();
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
    playerInput: document.getElementById('playerInput'),
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
    mcqBox: document.getElementById('mcqBox'),
    mcqGrid: document.getElementById('mcqGrid'),
    undercoverButton: document.getElementById('undercoverBtn'),
    headsButton: document.getElementById('headsBtn'),
    rapiditeAudio: document.getElementById('rapidite-audio'),
  };

  const sliderElements = {
    debut: document.getElementById('weight-debut'),
    hardcore: document.getElementById('weight-hardcore'),
    alcool: document.getElementById('weight-alcool'),
    culture: document.getElementById('weight-culture'),
  };

  const state = {
    currentMode: 'debut',
    rapidityMode: false,
    weights: {
      debut: 25,
      hardcore: 25,
      alcool: 25,
      culture: 25,
    },
    cultureDrinkMode: false,
  };
  let playersDialogContext = null;

  const MODE_BACKGROUNDS = {
    'VÉRITÉ': 'var(--yellow)',
    ACTION: 'var(--pink)',
    TOUS: 'var(--green)',
    'CULTURE G.': 'var(--cyan)',
    'RAPIDITÉ': 'var(--orange)',
  };

  const TYPE_LABELS = {
    TOUS: 'TOUT LE MONDE',
  };

  const CATEGORY_PRESENTATION = {
    debut: { label: 'Apéro chiantos', image: 'apero.webp' },
    hardcore: { label: 'Sexy pas raffiné', image: 'hardcore.webp' },
    alcool: { label: 'Torgnole express', image: 'torgnole.webp' },
    culture: { label: 'Culture G.', image: 'culture.webp' },
    rapidite: { label: 'Rapidité', image: 'lancer.webp' },
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
  ]);

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
    }
    return false;
  }

  function addPlayer(input = elements.playerInput) {
    const name = input.value.trim();
    if (!name) {
      return input === elements.dialogPlayerInput ? rejectPlayer(input, 'Entre un prénom pour ajouter un joueur.') : false;
    }
    const maximum = input === elements.dialogPlayerInput && playersDialogContext ? playersDialogContext.maximum : MAX_PLAYERS;
    if (players.length >= maximum) {
      return rejectPlayer(input, `La bande est complète : ${maximum} joueurs maximum.`);
    }
    if (players.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      return rejectPlayer(input, 'Ce prénom est déjà dans la bande. Choisis-en un autre.');
    }
    players.push(name);
    input.value = '';
    input.classList.remove('input-error');
    input.removeAttribute('aria-invalid');
    input.focus();
    renderPlayerList();
    return true;
  }

  function removePlayer(index) {
    players.splice(index, 1);
    renderPlayerList();
  }

  function renderPlayersInto(list) {
    list.innerHTML = '';
    players.forEach((name, index) => {
      const item = document.createElement('div');
      item.className = 'player-item';

      const label = document.createElement('span');
      label.textContent = name;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-btn';
      removeButton.textContent = '❌';
      removeButton.setAttribute('aria-label', `Retirer ${name}`);
      removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        removePlayer(index);
        if (list === elements.dialogPlayerList) elements.dialogPlayerInput.focus();
      });

      item.append(label, removeButton);
      list.appendChild(item);
    });
  }

  function renderPlayerList() {
    renderPlayersInto(elements.playerList);
    if (elements.playersDialog.open) {
      renderPlayersInto(elements.dialogPlayerList);
      updatePlayersDialog();
    }
    if (elements.playerCount) {
      elements.playerCount.textContent = `${players.length} joueur${players.length > 1 ? 's' : ''}`;
    }
    savePlayers();
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
    const count = `${players.length} joueur${players.length > 1 ? 's' : ''}`;
    const note = players.length > maximum ? `${maximum} joueurs maximum : retire quelques prénoms pour ce jeu.` : !remaining ? 'La bande est prête !'
      : `Ajoute encore ${remaining} joueur${remaining > 1 ? 's' : ''} pour lancer.`;
    elements.dialogStatus.textContent = error || `${count} · ${note}`;
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
    const undercover = kind === 'undercover';
    return { label: undercover ? 'Undercover' : 'Devine Tête',
      image: `image/home/${undercover ? 'undercover' : 'mascotte'}.webp`,
      minimum: undercover ? 3 : 2, maximum: undercover ? 20 : MAX_PLAYERS,
      buttonLabel: editing ? 'Valider les joueurs' : 'Lancer la partie', onConfirm };
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
    elements.dialogPlayerInput.focus();
  }

  function requestGame(kind, open) {
    const context = gamePlayersContext(kind, open);
    const module = modules[kind];
    if ((!module || !module.hasActiveGame || !module.hasActiveGame())
      && (players.length < context.minimum || players.length > context.maximum)) openPlayersDialog(context);
    else open();
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
    const body = LOWERCASE_STARTERS.has(firstWord) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
    return playerName ? `${playerName}, ${body}` : text;
  }

  function hideQuestionArea() {
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

  function renderMcq(question, playerName) {
    const isTrueFalse = question.vf === true;
    elements.typeBox.textContent = 'CULTURE G.';
    setBackground('CULTURE G.');
    elements.currentQuestion.textContent = isTrueFalse
      ? `${playerName ? `${playerName}, v` : 'V'}rai ou faux : ${question.question}`
      : addressPlayer(playerName, question.question);

    elements.answerBox.style.display = 'block';
    elements.mcqBox.style.display = 'block';
    elements.mcqGrid.innerHTML = '';
    elements.mcqGrid.classList.toggle('mcq-grid--vf', isTrueFalse);

    const options = question.choices.map((label, index) => ({ label, correct: index === question.answerIndex }));
    if (!isTrueFalse) {
      window.JDD.shuffle(options);
    }

    const buttons = options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mcq-btn';
      button.textContent = option.label;
      button.addEventListener(
        'click',
        (event) => {
          event.stopPropagation();
          buttons.forEach((btn, index) => {
            btn.disabled = true;
            if (options[index].correct) btn.classList.add('mcq-correct');
          });
          if (!option.correct) button.classList.add('mcq-wrong');
          if (question.note) elements.answerText.textContent = `💡 ${question.note}`;
        },
        { once: true }
      );
      elements.mcqGrid.appendChild(button);
      return button;
    });
  }

  function renderOpenQuestion(question, playerName) {
    elements.typeBox.textContent = 'CULTURE G.';
    setBackground('CULTURE G.');
    elements.currentQuestion.textContent = addressPlayer(playerName, question.question);
    elements.showAnswerButton.style.display = 'inline-block';
    elements.answerBox.style.display = 'block';
    elements.showAnswerButton.onclick = (event) => {
      event.stopPropagation();
      elements.answerText.textContent = `✅ Réponse : ${question.answer}${question.note ? ` — ${question.note}` : ''}`;
      elements.showAnswerButton.style.display = 'none';
    };
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

  function showRapidity() {
    state.rapidityMode = true;
    showCategory('rapidite');
    elements.typeBox.textContent = 'RAPIDITÉ';
    setBackground('RAPIDITÉ');
    elements.currentQuestion.textContent = '⚡ Question de rapidité pour tout le monde ! (Touchez pour révéler)';
    if (elements.rapiditeAudio) {
      elements.rapiditeAudio.currentTime = 0;
      const playing = elements.rapiditeAudio.play();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    }
  }

  function showCulture(data) {
    const open = Array.isArray(data.culture) ? data.culture : [];
    const mcq = Array.isArray(data.cultureMcq) ? data.cultureMcq : [];
    if (!open.length && !mcq.length) return;

    const player = window.JDD.nextPlayer(players);
    const useMcq = Math.random() * (open.length + mcq.length) < mcq.length;
    showCultureExtras();
    if (useMcq) {
      renderMcq(window.JDD.drawCard('culture-mcq', mcq), player);
    } else {
      renderOpenQuestion(window.JDD.drawCard('culture-open', open), player);
    }
  }

  function showPartyCard(mode, pool) {
    const raw = window.JDD.drawCard(mode, pool);
    if (typeof raw !== 'string') return;
    const separator = raw.indexOf('|');
    const type = normalizeType(separator > -1 ? raw.slice(0, separator) : 'ACTION');
    const text = separator > -1 ? raw.slice(separator + 1) : raw;

    let questionText = text;
    if (questionText.includes('{player}')) {
      const player = window.JDD.nextPlayer(players);
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
  }

  function showQuestion() {
    window.scrollTo(0, 0);
    elements.currentQuestion.textContent = '';
    elements.typeBox.textContent = '';
    hideQuestionArea();
    state.rapidityMode = false;
    elements.cultureToggleContainer.classList.add('hidden');
    elements.gorgeesText.classList.add('hidden');

    const mode = state.currentMode === 'custom' ? pickCustomMode() : state.currentMode;
    const data = (window.JDD && window.JDD.DATA) || {};
    showCategory(mode);

    if (mode !== 'culture' && Math.random() < 0.02) {
      showRapidity();
      return;
    }

    if (mode === 'culture') {
      showCulture(data);
      return;
    }

    showPartyCard(mode, Array.isArray(data[mode]) ? data[mode] : []);
  }

  function nextQuestion(event) {
    if (event.target === elements.showAnswerButton || event.target.closest('.toggle-container')) {
      return;
    }
    if (event.clientX <= window.innerWidth / 2) {
      return;
    }
    if (state.rapidityMode) {
      const pool = (window.JDD && window.JDD.RAPIDITY) || [];
      const draw = window.JDD.drawCard('rapidite', pool);
      elements.currentQuestion.textContent = draw || '⚡ Pas de question de rapidité disponible.';
      state.rapidityMode = false;
      return;
    }
    showQuestion();
  }

  function startGame() {
    if (players.length < minimumPlayers()) {
      openPlayersDialog();
      return;
    }
    if (elements.playersDialog.open) elements.playersDialog.close();
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.remove('hidden');
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

  function activateModeCard(selectedCard) {
    document.querySelectorAll('.mode-card[data-mode]').forEach((card) => {
      card.classList.remove('active');
      card.setAttribute('aria-pressed', 'false');
    });
    selectedCard.classList.add('active');
    selectedCard.setAttribute('aria-pressed', 'true');
    state.currentMode = selectedCard.dataset.mode;
    if (elements.selectedModeLabel) {
      elements.selectedModeLabel.textContent = selectedCard.querySelector('.home-mode-label').innerText.replace(/\s+/g, ' ').trim();
    }
    elements.customWeightsBox.classList.toggle('hidden', state.currentMode !== 'custom');
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

  function attachEvents() {
    document.getElementById('playerForm').addEventListener('submit', (event) => {
      event.preventDefault();
      addPlayer();
    });
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

    elements.gameScreen.addEventListener('click', nextQuestion);
    elements.backLogo.addEventListener('click', (event) => {
      event.stopPropagation();
      elements.gameScreen.classList.add('hidden');
      elements.setupScreen.classList.remove('hidden');
      elements.body.style.background = 'var(--cyan)';
      window.scrollTo(0, 0);
    });

    elements.cultureToggle.addEventListener('change', () => {
      state.cultureDrinkMode = elements.cultureToggle.checked;
    });

    Object.values(sliderElements).forEach((input) => {
      input.addEventListener('input', updateWeights);
    });

    document.querySelectorAll('.mode-card[data-mode]').forEach((card) => {
      card.addEventListener('click', () => activateModeCard(card));
    });

    elements.undercoverButton.addEventListener('click', () => requestGame('undercover', openUndercover));
    elements.headsButton.addEventListener('click', () => requestGame('heads', openHeads));
  }

  function init() {
    // Un module en erreur (ex. vieux fichier encore en cache) ne doit pas bloquer tout le jeu
    try {
      if (modules.undercover && typeof modules.undercover.init === 'function') {
        modules.undercover.init({
          onExit: closeUndercover,
          getSuggestedNames: () => players.slice(),
          editPlayers: (onConfirm) => openPlayersDialog(gamePlayersContext('undercover', onConfirm, true)),
        });
      }
    } catch (error) {
      console.error('Undercover indisponible', error);
    }
    try {
      if (modules.heads && typeof modules.heads.init === 'function') {
        modules.heads.init({ onExit: closeHeads, getSuggestedNames: () => players.slice(),
          editPlayers: (onConfirm) => openPlayersDialog(gamePlayersContext('heads', onConfirm, true)) });
      }
    } catch (error) {
      console.error('Devine Tête indisponible', error);
    }
    attachEvents();
    const defaultCard = document.querySelector('.mode-card[data-mode="debut"]');
    if (defaultCard) {
      defaultCard.classList.add('active');
    }
    renderPlayerList();
  }

  init();
})();

(function () {
  const PLAYERS_KEY = 'jdd.players';
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
    playerInput: document.getElementById('playerInput'),
    playerList: document.getElementById('playerList'),
    typeBox: document.getElementById('typeBox'),
    currentQuestion: document.getElementById('currentQuestion'),
    answerBox: document.getElementById('answerBox'),
    showAnswerButton: document.getElementById('showAnswerBtn'),
    answerText: document.getElementById('answerText'),
    backLogo: document.getElementById('backLogo'),
    customWeightsBox: document.getElementById('customWeights'),
    cultureToggleContainer: document.getElementById('cultureToggleContainer'),
    cultureToggle: document.getElementById('cultureToggle'),
    gorgeesText: document.getElementById('gorgeesText'),
    mcqBox: document.getElementById('mcqBox'),
    mcqGrid: document.getElementById('mcqGrid'),
    undercoverButton: document.getElementById('undercoverBtn'),
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

  // Mots en tête de question qu'on peut passer en minuscule après « Prénom, »
  const LOWERCASE_STARTERS = new Set([
    'quel', 'quelle', 'quels', 'quelles', 'qui', 'que', "qu'est-ce", 'quoi', 'combien', 'comment', 'où', 'pourquoi',
    'quand', 'lequel', 'laquelle', 'lesquels', 'lesquelles', 'dans', 'en', 'de', 'du', 'des', 'sur', 'pour', 'avec',
    'chez', 'complète', 'parmi', 'à', 'au', 'aux', 'le', 'la', 'les', 'un', 'une', 'ce', 'cette', 'ces', 'cet', 'son',
    'sa', 'ses', 'il', 'elle', 'on', 'est-ce', 'si', 'depuis', 'avant', 'après', 'par', 'cite', 'donne', 'trouve',
    'devine', 'selon', 'entre', 'sans', 'contre', 'vrai', 'quelqu’un', "quelqu'un", 'traduis', 'termine',
  ]);

  function loadPlayers() {
    try {
      const stored = JSON.parse(localStorage.getItem(PLAYERS_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((name) => typeof name === 'string' && name.trim()).slice(0, MAX_PLAYERS) : [];
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

  function addPlayer() {
    const name = elements.playerInput.value.trim();
    if (!name || players.length >= MAX_PLAYERS) {
      return;
    }
    if (players.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      elements.playerInput.classList.add('input-error');
      elements.playerInput.select();
      setTimeout(() => elements.playerInput.classList.remove('input-error'), 900);
      return;
    }
    players.push(name);
    elements.playerInput.value = '';
    elements.playerInput.focus();
    renderPlayerList();
  }

  function removePlayer(index) {
    players.splice(index, 1);
    renderPlayerList();
  }

  function renderPlayerList() {
    elements.playerList.innerHTML = '';
    players.forEach((name, index) => {
      const item = document.createElement('div');
      item.className = 'player-item';

      const label = document.createElement('span');
      label.textContent = name;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-btn';
      removeButton.textContent = '❌';
      removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        removePlayer(index);
      });

      item.append(label, removeButton);
      elements.playerList.appendChild(item);
    });
    savePlayers();
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
    const firstWord = text.split(/[\s,:;!?«»"]/)[0].toLowerCase();
    const body = LOWERCASE_STARTERS.has(firstWord) || firstWord.startsWith("l'") || firstWord.startsWith('l’')
      ? text.charAt(0).toLowerCase() + text.slice(1)
      : text;
    return playerName ? `${playerName}, ${body}` : text;
  }

  function hideQuestionArea() {
    elements.mcqBox.style.display = 'none';
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
    elements.currentQuestion.textContent = '';
    elements.typeBox.textContent = '';
    hideQuestionArea();
    state.rapidityMode = false;
    elements.cultureToggleContainer.classList.add('hidden');
    elements.gorgeesText.classList.add('hidden');

    const mode = state.currentMode === 'custom' ? pickCustomMode() : state.currentMode;
    const data = (window.JDD && window.JDD.DATA) || {};

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
    const minimum = state.currentMode === 'culture' ? 1 : 2;
    if (players.length < minimum) {
      alert(minimum === 1 ? 'Ajoute au moins 1 joueur !' : 'Ajoute au moins 2 joueurs !');
      return;
    }
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
    });
    selectedCard.classList.add('active');
    state.currentMode = selectedCard.dataset.mode;
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
  }

  function attachEvents() {
    document.getElementById('addBtn').addEventListener('click', addPlayer);
    document.getElementById('startBtn').addEventListener('click', startGame);
    elements.playerInput.addEventListener('keyup', (event) => {
      if (event.key === 'Enter') {
        addPlayer();
      }
    });

    elements.gameScreen.addEventListener('click', nextQuestion);
    elements.backLogo.addEventListener('click', (event) => {
      event.stopPropagation();
      elements.gameScreen.classList.add('hidden');
      elements.setupScreen.classList.remove('hidden');
      elements.body.style.background = 'var(--cyan)';
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

    elements.undercoverButton.addEventListener('click', openUndercover);
  }

  function init() {
    if (modules.undercover && typeof modules.undercover.init === 'function') {
      modules.undercover.init({
        onExit: closeUndercover,
        getSuggestedNames: () => players.slice(),
      });
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

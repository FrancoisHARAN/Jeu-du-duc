(function () {
  const players = [];
  if (window.JDD) {
    window.JDD.players = players;
  }

  const modules = window.JDDModules || {};

  const elements = {
    body: document.body,
    setupScreen: document.getElementById('setup'),
    gameScreen: document.getElementById('game'),
    undercoverScreen: document.getElementById('undercover'),
    killerScreen: document.getElementById('killer-screen'),
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
    undercoverTitle: document.getElementById('undercoverTitle'),
    backUndercover: document.getElementById('backUndercover'),
    undercoverButton: document.getElementById('undercoverBtn'),
    killerButton: document.getElementById('killer-btn'),
    killerBack: document.getElementById('killer-back'),
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
    'CULTURE G.': 'var(--cyan)',
    'RAPIDITÉ': 'var(--orange)',
    CUSTOM: 'var(--orange)',
  };

  function syncPlayers() {
    if (window.JDD) {
      window.JDD.players = players;
    }
  }

  function addPlayer() {
    const name = elements.playerInput.value.trim();
    if (!name || players.length >= 30) {
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
    syncPlayers();
  }

  function setBackground(type) {
    const color = MODE_BACKGROUNDS[type] || 'var(--cyan)';
    elements.body.style.background = color;
  }

  function playIntroAnimation() {
    return Promise.resolve();
  }

  function getRapidityQuestions() {
    if (window.JDD && Array.isArray(window.JDD.RAPIDITY) && window.JDD.RAPIDITY.length) {
      return window.JDD.RAPIDITY;
    }
    return [];
  }

  function hideQuestionArea() {
    if (elements.mcqBox) {
      elements.mcqBox.style.display = 'none';
    }
    if (elements.answerBox) {
      elements.answerBox.style.display = 'none';
    }
    if (elements.showAnswerButton) {
      elements.showAnswerButton.style.display = 'none';
    }
    if (elements.answerText) {
      elements.answerText.textContent = '';
    }
  }

  function renderMcq(question, playerName) {
    elements.typeBox.textContent = 'CULTURE G.';
    setBackground('CULTURE G.');
    elements.currentQuestion.textContent = `${playerName}, ${question.question}`;

    elements.answerBox.style.display = 'block';
    elements.mcqBox.style.display = 'block';
    elements.mcqGrid.innerHTML = '';

    question.choices.forEach((choiceLabel, choiceIndex) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mcq-btn';
      button.textContent = choiceLabel;
      button.addEventListener(
        'click',
        (event) => {
          event.stopPropagation();
          [...elements.mcqGrid.querySelectorAll('button')].forEach((btn) => {
            btn.disabled = true;
          });
          if (choiceIndex === question.answerIndex) {
            button.classList.add('mcq-correct');
          } else {
            button.classList.add('mcq-wrong');
            const correctButton = elements.mcqGrid.children[question.answerIndex];
            if (correctButton) {
              correctButton.classList.add('mcq-correct');
            }
          }
        },
        { once: true }
      );
      elements.mcqGrid.appendChild(button);
    });
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

  function showQuestion() {
    elements.currentQuestion.textContent = '';
    elements.typeBox.textContent = '';
    hideQuestionArea();
    state.rapidityMode = false;

    if (elements.cultureToggleContainer) {
      elements.cultureToggleContainer.classList.add('hidden');
    }
    if (elements.gorgeesText) {
      elements.gorgeesText.classList.add('hidden');
    }

    let mode = state.currentMode;
    if (mode === 'custom') {
      mode = pickCustomMode();
    }

    const data = (window.JDD && window.JDD.DATA) || {};
    const cultureQuestions = Array.isArray(data.culture) ? data.culture : [];
    const cultureMcq = Array.isArray(data.cultureMcq) ? data.cultureMcq : [];
    const poolMap = {
      debut: Array.isArray(data.debut) ? data.debut : [],
      hardcore: Array.isArray(data.hardcore) ? data.hardcore : [],
      alcool: Array.isArray(data.alcool) ? data.alcool : [],
    };

    const rapidityChanceMap = {
      debut: 0.02,
      hardcore: 0.02,
      alcool: 0.02,
      culture: 0.02,
    };

    const rapidityChance = rapidityChanceMap[mode] || 0;
    if (Math.random() < rapidityChance) {
      state.rapidityMode = true;
      elements.typeBox.textContent = 'RAPIDITÉ';
      setBackground('RAPIDITÉ');
      elements.currentQuestion.textContent = '⚡ Question de rapidité pour tout le monde ! (Cliquez pour révéler)';
      if (elements.rapiditeAudio) {
        elements.rapiditeAudio.currentTime = 0;
        elements.rapiditeAudio.play();
      }
      return;
    }

    if (mode === 'culture') {
      const targetPlayer = players[Math.floor(Math.random() * players.length)];
      const totalPoolSize = cultureQuestions.length + cultureMcq.length;
      const drawIndex = totalPoolSize > 0 ? Math.floor(Math.random() * totalPoolSize) : -1;
      const useMcq = drawIndex > -1 && drawIndex < cultureMcq.length;

      if (useMcq) {
        const question = cultureMcq[drawIndex];
        renderMcq(question, targetPlayer);
        if (elements.cultureToggleContainer) {
          elements.cultureToggleContainer.classList.remove('hidden');
        }
        if (state.cultureDrinkMode && elements.gorgeesText) {
          const amount = Math.floor(Math.random() * 3) + 1;
          elements.gorgeesText.textContent = `${amount} gorgée${amount > 1 ? 's' : ''}`;
          elements.gorgeesText.classList.remove('hidden');
        }
        return;
      }

      const baseIndex = drawIndex > -1 ? drawIndex - cultureMcq.length : -1;
      const safeIndex = baseIndex >= 0 && baseIndex < cultureQuestions.length
        ? baseIndex
        : cultureQuestions.length
          ? Math.floor(Math.random() * cultureQuestions.length)
          : -1;
      if (safeIndex < 0) {
        return;
      }

      const question = cultureQuestions[safeIndex];
      elements.typeBox.textContent = 'CULTURE G.';
      setBackground('CULTURE G.');
      elements.currentQuestion.textContent = `${targetPlayer}, ${question.question}`;
      elements.showAnswerButton.style.display = 'inline-block';
      elements.answerBox.style.display = 'block';
      elements.showAnswerButton.onclick = (event) => {
        event.stopPropagation();
        elements.answerText.textContent = `✅ Réponse : ${question.answer}`;
        elements.showAnswerButton.style.display = 'none';
      };
      if (elements.cultureToggleContainer) {
        elements.cultureToggleContainer.classList.remove('hidden');
      }
      if (state.cultureDrinkMode && elements.gorgeesText) {
        const amount = Math.floor(Math.random() * 3) + 1;
        elements.gorgeesText.textContent = `${amount} gorgée${amount > 1 ? 's' : ''}`;
        elements.gorgeesText.classList.remove('hidden');
      }
      return;
    }

    if (mode === 'debut' || mode === 'hardcore' || mode === 'alcool') {
      const pool = poolMap[mode] || [];
      const picker = window.JDD && typeof window.JDD._pickText === 'function'
        ? window.JDD._pickText
        : (list) => {
            if (!Array.isArray(list) || !list.length) {
              return ['VÉRITÉ', '{player}, raconte un truc marrant.'];
            }
            const raw = list[Math.floor(Math.random() * list.length)];
            if (typeof raw === 'string') {
              return raw.split('|');
            }
            return ['VÉRITÉ', '{player}, raconte un truc marrant.'];
          };

      const [type, text] = picker(pool);
      const player = players[Math.floor(Math.random() * players.length)];
      if (!player || !text) {
        return;
      }

      let questionText = text.replace(/\{player\}/g, player);
      if (questionText.includes('{other}')) {
        let otherPlayer = null;
        if (players.length > 1) {
          let attempts = 0;
          do {
            otherPlayer = players[Math.floor(Math.random() * players.length)];
            attempts += 1;
          } while (otherPlayer === player && attempts < 20);
          if (!otherPlayer || otherPlayer === player) {
            otherPlayer = players.find((candidate) => candidate !== player) || otherPlayer;
          }
        }
        questionText = questionText.replace(/\{other\}/g, otherPlayer || player);
      }

      elements.typeBox.textContent = type;
      setBackground(type);
      elements.currentQuestion.textContent = questionText;
    }
  }

  function nextQuestion(event) {
    if (event.target === elements.showAnswerButton) {
      return;
    }
    if (event.clientX > window.innerWidth / 2) {
      if (state.rapidityMode && elements.currentQuestion.textContent.includes('⚡')) {
        const pool = getRapidityQuestions();
        const draw = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        if (draw) {
          const text = typeof draw === 'object' && draw?.question ? draw.question : draw;
          elements.currentQuestion.textContent = text;
        } else {
          elements.currentQuestion.textContent = '⚡ Pas de question de rapidité disponible.';
        }
        state.rapidityMode = false;
      } else {
        showQuestion();
      }
    }
  }

  function startGame() {
    if (players.length < 1) {
      alert('Ajoute au moins 1 joueur !');
      return;
    }
    if (state.currentMode !== 'culture' && players.length < 2 && state.currentMode !== 'custom') {
      alert('Ajoute au moins 2 joueurs !');
      return;
    }
    if (state.currentMode === 'hardcore' || state.currentMode === 'alcool') {
      playIntroAnimation(state.currentMode);
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
    document.querySelectorAll('.mode-card').forEach((card) => {
      card.classList.remove('active');
    });
    selectedCard.classList.add('active');
    state.currentMode = selectedCard.dataset.mode;
    elements.customWeightsBox.classList.toggle('hidden', state.currentMode !== 'custom');
  }

  function openUndercover() {
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.killerScreen.classList.add('killer-hidden');
    elements.undercoverScreen.classList.remove('hidden');
    elements.body.style.background = '#222';
    if (modules.undercover && typeof modules.undercover.onOpen === 'function') {
      modules.undercover.onOpen();
    }
  }

  function closeUndercover() {
    elements.undercoverScreen.classList.add('hidden');
    elements.setupScreen.classList.remove('hidden');
    elements.body.style.background = 'var(--cyan)';
    if (modules.undercover && typeof modules.undercover.onClose === 'function') {
      modules.undercover.onClose();
    }
  }

  function openKiller() {
    elements.setupScreen.classList.add('hidden');
    elements.gameScreen.classList.add('hidden');
    elements.undercoverScreen.classList.add('hidden');
    elements.killerScreen.classList.remove('killer-hidden');
    elements.body.style.background = '#222';
    if (modules.killer && typeof modules.killer.onOpen === 'function') {
      modules.killer.onOpen();
    }
  }

  function closeKiller() {
    elements.killerScreen.classList.add('killer-hidden');
    elements.setupScreen.classList.remove('hidden');
    elements.body.style.background = 'var(--cyan)';
    if (modules.killer && typeof modules.killer.onClose === 'function') {
      modules.killer.onClose();
    }
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
    elements.backLogo.addEventListener('click', () => {
      elements.gameScreen.classList.add('hidden');
      elements.setupScreen.classList.remove('hidden');
      elements.body.style.background = 'var(--cyan)';
    });

    if (elements.cultureToggle) {
      elements.cultureToggle.addEventListener('change', () => {
        state.cultureDrinkMode = elements.cultureToggle.checked;
      });
    }

    Object.values(sliderElements).forEach((input) => {
      input.addEventListener('input', updateWeights);
    });

    document.querySelectorAll('.mode-card').forEach((card) => {
      card.addEventListener('click', () => activateModeCard(card));
    });

    if (elements.undercoverButton) {
      elements.undercoverButton.addEventListener('click', openUndercover);
    }
    if (elements.backUndercover) {
      elements.backUndercover.addEventListener('click', closeUndercover);
    }
    if (elements.undercoverTitle) {
      elements.undercoverTitle.addEventListener('click', () => {
        document.getElementById('config').classList.remove('hidden');
        document.getElementById('reveal').classList.add('hidden');
        document.getElementById('play').classList.add('hidden');
      });
    }

    if (elements.killerButton) {
      elements.killerButton.addEventListener('click', openKiller);
    }
    if (elements.killerBack) {
      elements.killerBack.addEventListener('click', closeKiller);
    }
  }

  function initialiseModules() {
    if (modules.undercover && typeof modules.undercover.init === 'function') {
      modules.undercover.init();
    }
    if (modules.killer && typeof modules.killer.init === 'function') {
      modules.killer.init();
    }
  }

  function init() {
    initialiseModules();
    attachEvents();
    const defaultCard = document.querySelector('.mode-card[data-mode="debut"]');
    if (defaultCard) {
      defaultCard.classList.add('active');
    }
    renderPlayerList();
  }

  init();
})();

(function (global) {
  const STORAGE_KEY = 'undercover.state';
  const ROLE_LABELS = {
    civil: 'Civil',
    undercover: 'Undercover',
    misterwhite: 'Mister White',
  };

  const module = {
    init,
    onOpen,
    onClose,
  };

  const state = {
    players: [],
    eliminationMessage: '',
    currentPair: null,
    revealIndex: 0,
    round: 0,
    persisted: {},
  };

  const elements = {};

  function init() {
    if (elements.root) {
      return;
    }

    elements.root = document.getElementById('undercover');
    if (!elements.root) {
      return;
    }

    elements.config = document.getElementById('config');
    elements.reveal = document.getElementById('reveal');
    elements.play = document.getElementById('play');
    elements.whiteGuess = document.getElementById('whiteGuess');
    elements.playerCount = document.getElementById('playerCount');
    elements.civilCount = document.getElementById('civilCount');
    elements.underCount = document.getElementById('underCount');
    elements.whiteCount = document.getElementById('whiteCount');
    elements.playersInputs = document.getElementById('playersInputs');
    elements.startButton = document.getElementById('start');
    elements.askName = document.getElementById('askName');
    elements.nameInput = document.getElementById('nameInput');
    elements.validateName = document.getElementById('validateName');
    elements.revealName = document.getElementById('revealName');
    elements.revealWord = document.getElementById('revealWord');
    elements.secretWord = document.getElementById('secretWord');
    elements.nextPlayer = document.getElementById('nextPlayer');
    elements.starter = document.getElementById('starter');
    elements.voteButton = document.getElementById('voteBtn');
    elements.voteArea = document.getElementById('voteArea');
    elements.voteList = document.getElementById('voteList');
    elements.eliminationResult = document.getElementById('eliminationResult');
    elements.nextRound = document.getElementById('nextRound');
    elements.newGame = document.getElementById('newGame');
    elements.whiteGuessInput = document.getElementById('whiteGuessInput');
    elements.whiteGuessSubmit = document.getElementById('whiteGuessSubmit');
    elements.undercoverQuit = document.getElementById('undercoverQuit');

    loadPersistedState();
    bindEvents();
    renderPlayerInputs();
  }

  function onOpen() {
    renderPlayerInputs();
  }

  function onClose() {
    // no specific cleanup required
  }

  function loadPersistedState() {
    try {
      state.persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (error) {
      state.persisted = {};
    }

    if (state.persisted.playerCount) {
      elements.playerCount.value = state.persisted.playerCount;
      elements.civilCount.value = state.persisted.civilCount;
      elements.underCount.value = state.persisted.underCount;
      elements.whiteCount.value = state.persisted.whiteCount;
    } else {
      autoRoles();
    }
  }

  function savePersistedState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.persisted));
  }

  function autoRoles() {
    const playerTotal = Number(elements.playerCount.value);
    const white = playerTotal >= 4 ? 1 : 0;
    const undercover = playerTotal >= 7 ? 2 : 1;
    const civil = playerTotal - white - undercover;

    elements.whiteCount.value = white;
    elements.underCount.value = undercover;
    elements.civilCount.value = Math.max(civil, 0);

    state.persisted = {
      ...state.persisted,
      playerCount: playerTotal,
      civilCount: Number(elements.civilCount.value),
      underCount: Number(elements.underCount.value),
      whiteCount: Number(elements.whiteCount.value),
    };
    savePersistedState();
  }

  function renderPlayerInputs() {
    const playerTotal = Number(elements.playerCount.value);
    const names = (state.persisted.names = state.persisted.names || []);

    elements.playersInputs.innerHTML = '';
    for (let index = 0; index < playerTotal; index += 1) {
      const wrapper = document.createElement('div');
      wrapper.className = 'under-player-item';

      const input = document.createElement('input');
      input.placeholder = 'Prénom';
      input.value = names[index] || '';
      input.addEventListener('input', () => {
        names[index] = input.value;
        savePersistedState();
      });

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'under-remove-btn';
      removeButton.textContent = '❌';
      removeButton.addEventListener('click', () => removePlayer(index));

      wrapper.append(input, removeButton);
      elements.playersInputs.appendChild(wrapper);
    }

    names.length = playerTotal;
    savePersistedState();
  }

  function removePlayer(index) {
    state.persisted.names.splice(index, 1);
    elements.playerCount.value = state.persisted.names.length;
    autoRoles();
    renderPlayerInputs();
  }

  function bindEvents() {
    elements.playerCount.addEventListener('change', () => {
      autoRoles();
      renderPlayerInputs();
    });

    elements.civilCount.addEventListener('change', () => {
      state.persisted.civilCount = Number(elements.civilCount.value);
      savePersistedState();
    });

    elements.underCount.addEventListener('change', () => {
      state.persisted.underCount = Number(elements.underCount.value);
      savePersistedState();
    });

    elements.whiteCount.addEventListener('change', () => {
      state.persisted.whiteCount = Number(elements.whiteCount.value);
      savePersistedState();
    });

    elements.startButton.addEventListener('click', startGame);

    if (elements.undercoverQuit) {
      elements.undercoverQuit.addEventListener('click', resetToConfig);
    }

    elements.newGame.addEventListener('click', () => {
      elements.play.classList.add('hidden');
      elements.reveal.classList.add('hidden');
      elements.config.classList.remove('hidden');
      renderPlayerInputs();
    });

    elements.whiteGuessSubmit.addEventListener('click', handleWhiteGuess);
    elements.revealWord.addEventListener('click', revealSecret);
    elements.validateName.addEventListener('click', validatePlayerName);
    elements.nextPlayer.addEventListener('click', advanceReveal);
    elements.voteButton.addEventListener('click', openVote);
    elements.nextRound.addEventListener('click', () => {
      state.round += 1;
      startRound();
    });
  }

  function resetToConfig() {
    state.players = [];
    state.currentPair = null;
    state.revealIndex = 0;
    state.round = 0;
    elements.reveal.classList.add('hidden');
    elements.play.classList.add('hidden');
    elements.whiteGuess.classList.add('hidden');
    elements.config.classList.remove('hidden');
    renderPlayerInputs();
  }

  function startGame() {
    state.players = [];
    const playerTotal = Number(elements.playerCount.value);
    state.persisted.names = state.persisted.names || [];

    for (let index = 0; index < playerTotal; index += 1) {
      const defaultName = `Joueur${index + 1}`;
      const storedName = state.persisted.names[index];
      const name = storedName && storedName.trim() ? storedName.trim() : defaultName;
      state.players.push({ name, role: '', word: '', alive: true });
      state.persisted.names[index] = name;
    }
    savePersistedState();

    assignRoles(state.players);
    assignWords();

    state.revealIndex = 0;
    elements.config.classList.add('hidden');
    elements.reveal.classList.remove('hidden');
    showReveal();
  }

  function showReveal() {
    const player = state.players[state.revealIndex];
    elements.askName.classList.add('hidden');
    elements.nameInput.classList.add('hidden');
    elements.validateName.classList.add('hidden');
    elements.revealName.textContent = `Passez le téléphone à ${player.name}`;
    elements.revealName.classList.remove('hidden');
    elements.secretWord.classList.add('hidden');
    elements.nextPlayer.classList.add('hidden');
    elements.revealWord.classList.remove('hidden');
  }

  function revealSecret() {
    const player = state.players[state.revealIndex];
    elements.revealWord.classList.add('hidden');
    if (player.role === 'misterwhite') {
      elements.revealName.classList.add('hidden');
      elements.secretWord.textContent = '🖕tu es Mister White 🖕';
    } else {
      elements.revealName.textContent = 'ton mot est 👇';
      elements.secretWord.textContent = player.word;
    }
    elements.secretWord.classList.remove('hidden');
    elements.nextPlayer.textContent = state.revealIndex === state.players.length - 1
      ? 'Lancer la partie'
      : 'Joueur suivant';
    elements.nextPlayer.classList.remove('hidden');
  }

  function validatePlayerName() {
    const player = state.players[state.revealIndex];
    const name = elements.nameInput.value.trim() || `Joueur${state.revealIndex + 1}`;
    player.name = name;
    state.persisted.names[state.revealIndex] = name;
    savePersistedState();

    elements.askName.classList.add('hidden');
    elements.nameInput.classList.add('hidden');
    elements.validateName.classList.add('hidden');
    if (player.role === 'misterwhite') {
      elements.revealName.classList.add('hidden');
      elements.secretWord.textContent = '🖕tu es Mister White 🖕';
      elements.secretWord.classList.remove('hidden');
    } else {
      elements.revealName.textContent = 'ton mot est 👇';
      elements.revealName.classList.remove('hidden');
      elements.secretWord.textContent = player.word;
      elements.secretWord.classList.remove('hidden');
    }
    elements.nextPlayer.textContent = state.revealIndex === state.players.length - 1
      ? 'Lancer la partie'
      : 'Joueur suivant';
    elements.nextPlayer.classList.remove('hidden');
  }

  function advanceReveal() {
    state.revealIndex += 1;
    if (state.revealIndex >= state.players.length) {
      elements.reveal.classList.add('hidden');
      elements.play.classList.remove('hidden');
      state.round = 0;
      startRound();
    } else {
      showReveal();
    }
  }

  function startRound() {
    elements.eliminationResult.classList.add('hidden');
    elements.voteArea.classList.add('hidden');
    elements.nextRound.classList.add('hidden');
    elements.newGame.classList.add('hidden');
    elements.voteButton.classList.remove('hidden');

    const alive = state.players.filter((player) => player.alive);
    let starter;
    do {
      starter = alive[Math.floor(Math.random() * alive.length)];
    } while (state.round === 0 && starter.role === 'misterwhite' && alive.length > 1);
    elements.starter.textContent = `${starter.name} commence`;
  }

  function openVote() {
    elements.voteList.innerHTML = '';
    state.players
      .filter((player) => player.alive)
      .forEach((player) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = player.name;
        button.addEventListener('click', () => eliminatePlayer(player));
        elements.voteList.appendChild(button);
      });
    elements.voteArea.classList.remove('hidden');
    elements.voteButton.classList.add('hidden');
  }

  function eliminatePlayer(player) {
    player.alive = false;
    elements.voteArea.classList.add('hidden');

    const counts = countRoles();
    state.eliminationMessage = `${player.name} était ${ROLE_LABELS[player.role]}.
<div class="role-summary"><div>🙂 Civils: ${counts.civil}</div><div>🕵️ Undercover: ${counts.undercover}</div><div>👻 Mister White: ${counts.misterwhite}</div></div>`;

    if (player.role === 'misterwhite') {
      elements.whiteGuessInput.value = '';
      elements.play.classList.add('hidden');
      elements.whiteGuess.classList.remove('hidden');
      elements.eliminationResult.classList.add('hidden');
      return;
    }

    elements.eliminationResult.innerHTML = state.eliminationMessage;
    const winner = checkVictory();
    if (winner) {
      const resultClass = winner === 'civils' ? 'victory' : 'defeat';
      const resultText = winner === 'civils' ? 'Les civils gagnent !' : 'Les traitres gagnent !';
      elements.eliminationResult.innerHTML += `<br><span class="${resultClass}">${resultText}</span>`;
      elements.newGame.classList.remove('hidden');
    } else {
      elements.nextRound.classList.remove('hidden');
    }
    elements.eliminationResult.classList.remove('hidden');
  }

  function handleWhiteGuess() {
    const guess = elements.whiteGuessInput.value.trim();
    if (guess && state.currentPair && guess.toLowerCase() === state.currentPair.civil.toLowerCase()) {
      elements.eliminationResult.innerHTML = `${state.eliminationMessage}<br><span class="victory">Mister White a trouvé le mot, il gagne !</span>`;
      elements.newGame.classList.remove('hidden');
    } else {
      elements.eliminationResult.innerHTML = `${state.eliminationMessage}<br><span class="defeat">Mauvaise réponse.</span>`;
      const winner = checkVictory();
      if (winner) {
        const resultClass = winner === 'civils' ? 'victory' : 'defeat';
        const resultText = winner === 'civils' ? 'Les civils gagnent !' : 'Les traitres gagnent !';
        elements.eliminationResult.innerHTML += `<br><span class="${resultClass}">${resultText}</span>`;
        elements.newGame.classList.remove('hidden');
      } else {
        elements.nextRound.classList.remove('hidden');
      }
    }
    elements.whiteGuess.classList.add('hidden');
    elements.play.classList.remove('hidden');
    elements.eliminationResult.classList.remove('hidden');
  }

  function assignRoles(players) {
    let civil = Number(elements.civilCount.value);
    let undercover = Number(elements.underCount.value);
    let white = Number(elements.whiteCount.value);

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    shuffled.forEach((player) => {
      if (white > 0) {
        player.role = 'misterwhite';
        white -= 1;
      } else if (undercover > 0) {
        player.role = 'undercover';
        undercover -= 1;
      } else if (civil > 0) {
        player.role = 'civil';
        civil -= 1;
      } else {
        player.role = 'civil';
      }
    });
  }

  function assignWords() {
    const pairs = getUndercoverPairs();
    if (pairs.length) {
      state.currentPair = pairs[Math.floor(Math.random() * pairs.length)];
    } else {
      state.currentPair = { civil: 'Civil', under: 'Traître' };
    }
    state.players.forEach((player) => {
      if (player.role === 'civil') {
        player.word = state.currentPair.civil;
      } else if (player.role === 'undercover') {
        player.word = state.currentPair.under;
      } else {
        player.word = '';
      }
    });
  }

  function getUndercoverPairs() {
    if (global.JDD && Array.isArray(global.JDD.UNDERCOVER_PAIRS) && global.JDD.UNDERCOVER_PAIRS.length) {
      return global.JDD.UNDERCOVER_PAIRS;
    }
    return [];
  }

  function countRoles() {
    return state.players.reduce(
      (accumulator, player) => {
        if (player.alive) {
          accumulator[player.role] += 1;
        }
        return accumulator;
      },
      { civil: 0, undercover: 0, misterwhite: 0 }
    );
  }

  function checkVictory() {
    const counts = countRoles();
    if (counts.undercover === 0 && counts.misterwhite === 0) {
      return 'civils';
    }
    if (counts.civil <= counts.undercover + counts.misterwhite) {
      return 'traitres';
    }
    return null;
  }

  global.JDDModules = global.JDDModules || {};
  global.JDDModules.undercover = module;
})(window);

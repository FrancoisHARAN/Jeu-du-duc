(function (global) {
  const STORAGE_KEY = 'killer.state';

  const module = {
    init,
    onOpen,
    onClose,
  };

  const state = {
    stage: 'setup',
    players: [],
  };

  const elements = {};
  let hideSecretTimeout = null;

  function init() {
    if (elements.root) {
      return;
    }

    elements.root = document.getElementById('killer-screen');
    if (!elements.root) {
      return;
    }

    elements.setup = document.getElementById('killer-setup');
    elements.distribution = document.getElementById('killer-distribution');
    elements.game = document.getElementById('killer-game');
    elements.end = document.getElementById('killer-end');
    elements.playerInput = document.getElementById('killer-player-input');
    elements.addButton = document.getElementById('killer-add-btn');
    elements.playerList = document.getElementById('killer-player-list');
    elements.startButton = document.getElementById('killer-start-btn');
    elements.revealList = document.getElementById('killer-reveal-list');
    elements.distributeDone = document.getElementById('killer-distribute-done');
    elements.aliveList = document.getElementById('killer-alive-list');
    elements.winner = document.getElementById('killer-winner');
    elements.newGame = document.getElementById('killer-new-btn');
    elements.secret = document.getElementById('killer-secret');
    elements.secretTitle = document.getElementById('killer-secret-title');
    elements.secretText = document.getElementById('killer-secret-text');

    loadState();
    bindEvents();
    renderStage();
  }

  function onOpen() {
    renderStage();
  }

  function onClose() {
    if (hideSecretTimeout) {
      clearTimeout(hideSecretTimeout);
      hideSecretTimeout = null;
    }
    if (elements.secret) {
      elements.secret.classList.add('killer-hidden');
    }
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.stage = stored.stage || 'setup';
      state.players = Array.isArray(stored.players) ? stored.players : [];
    } catch (error) {
      state.stage = 'setup';
      state.players = [];
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage: state.stage, players: state.players }));
  }

  function bindEvents() {
    elements.addButton.addEventListener('click', addPlayer);
    elements.playerInput.addEventListener('keyup', (event) => {
      if (event.key === 'Enter') {
        addPlayer();
      }
    });
    elements.startButton.addEventListener('click', startDistribution);
    elements.distributeDone.addEventListener('click', beginGame);
    elements.newGame.addEventListener('click', resetGame);
  }

  function addPlayer() {
    const name = elements.playerInput.value.trim();
    if (!name) {
      return;
    }
    state.players.push({ name });
    elements.playerInput.value = '';
    saveState();
    renderPlayerList();
  }

  function removePlayer(index) {
    state.players.splice(index, 1);
    saveState();
    renderPlayerList();
  }

  function renderPlayerList() {
    elements.playerList.innerHTML = '';
    state.players.forEach((player, index) => {
      const item = document.createElement('div');
      item.className = 'killer-player-item';

      const nameLabel = document.createElement('span');
      nameLabel.textContent = player.name;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'killer-remove-btn';
      removeButton.textContent = '❌';
      removeButton.addEventListener('click', () => removePlayer(index));

      item.append(nameLabel, removeButton);
      elements.playerList.appendChild(item);
    });
  }

  function startDistribution() {
    if (state.players.length < 2) {
      return;
    }

    state.stage = 'distribution';
    const shuffled = [...state.players].sort(() => Math.random() - 0.5);
    const gesturesPool = getGestures();
    const fallbackGesture = "fait un clin d'œil 😉";

    shuffled.forEach((player, index) => {
      const target = shuffled[(index + 1) % shuffled.length];
      player.target = target.name;
      const gestures = gesturesPool.length ? gesturesPool : [fallbackGesture];
      player.gesture = gestures[Math.floor(Math.random() * gestures.length)];
      player.alive = true;
      player.kills = 0;
    });

    saveState();
    renderStage();
  }

  function beginGame() {
    state.stage = 'game';
    saveState();
    renderStage();
  }

  function renderStage() {
    if (!elements.root) {
      return;
    }

    elements.setup.classList.add('killer-hidden');
    elements.distribution.classList.add('killer-hidden');
    elements.game.classList.add('killer-hidden');
    elements.end.classList.add('killer-hidden');

    if (state.stage === 'setup') {
      elements.setup.classList.remove('killer-hidden');
      renderPlayerList();
    } else if (state.stage === 'distribution') {
      elements.distribution.classList.remove('killer-hidden');
      renderRevealList();
    } else if (state.stage === 'game') {
      elements.game.classList.remove('killer-hidden');
      renderGame();
    } else if (state.stage === 'end') {
      elements.end.classList.remove('killer-hidden');
      renderEnd();
    }
  }

  function renderRevealList() {
    elements.revealList.innerHTML = '';
    state.players.forEach((player) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'killer-reveal-btn';
      button.textContent = player.name;
      button.addEventListener('click', () => showSecret(player));
      elements.revealList.appendChild(button);
    });
  }

  function showSecret(player) {
    elements.secretTitle.textContent = player.name;
    elements.secretText.innerHTML = `Ta victime est ${player.target}<br>Geste : ${player.gesture}`;
    elements.secret.classList.remove('killer-hidden');
    if (hideSecretTimeout) {
      clearTimeout(hideSecretTimeout);
    }
    hideSecretTimeout = setTimeout(() => {
      elements.secret.classList.add('killer-hidden');
    }, 3000);
  }

  function renderGame() {
    elements.aliveList.innerHTML = '';
    state.players.forEach((player, index) => {
      const item = document.createElement('div');
      item.className = `killer-player-item ${player.alive ? '' : 'killer-dead'}`.trim();
      item.textContent = `${player.name} (${player.kills || 0}) `;

      if (player.alive) {
        const killButton = document.createElement('button');
        killButton.type = 'button';
        killButton.className = 'killer-kill-btn';
        killButton.textContent = '☠️';
        killButton.addEventListener('click', () => eliminatePlayer(index));
        item.appendChild(killButton);
      }

      elements.aliveList.appendChild(item);
    });
  }

  function eliminatePlayer(index) {
    const victim = state.players[index];
    if (!victim || !victim.alive) {
      return;
    }

    victim.alive = false;
    const assassin = state.players.find((player) => player.target === victim.name && player.alive);
    if (assassin) {
      assassin.kills = (assassin.kills || 0) + 1;
      assassin.target = victim.target;
      assassin.gesture = victim.gesture;
    }
    saveState();

    const alivePlayers = state.players.filter((player) => player.alive);
    if (alivePlayers.length <= 1) {
      state.stage = 'end';
      saveState();
      renderStage();
    } else {
      renderGame();
    }
  }

  function renderEnd() {
    const alivePlayers = state.players.filter((player) => player.alive);
    if (alivePlayers.length === 1) {
      const winner = alivePlayers[0];
      elements.winner.textContent = `${winner.name} gagne avec ${winner.kills || 0} élimination(s)!`;
    } else {
      const sorted = [...state.players].sort((a, b) => (b.kills || 0) - (a.kills || 0));
      elements.winner.innerHTML = sorted
        .map((player) => `${player.name}: ${player.kills || 0}`)
        .join('<br>');
    }
  }

  function resetGame() {
    state.stage = 'setup';
    state.players = [];
    saveState();
    renderStage();
  }

  function getGestures() {
    if (global.JDD && Array.isArray(global.JDD.KILLER_GESTURES) && global.JDD.KILLER_GESTURES.length) {
      return global.JDD.KILLER_GESTURES;
    }
    return [];
  }

  global.JDDModules = global.JDDModules || {};
  global.JDDModules.killer = module;
})(window);

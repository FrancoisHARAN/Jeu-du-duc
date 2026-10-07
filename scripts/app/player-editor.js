/* Un seul bloc pour ajouter, retirer et choisir les joueurs des jeux. */
(function (global) {
  'use strict';
  let serial = 0;
  const countLabel = count => `${count} joueur${count > 1 ? 's' : ''}`;
  function fitNames(container) {
    requestAnimationFrame(() => container.querySelectorAll('.jdd-player-name').forEach(node => {
      if (!node.clientWidth) return;
      node.style.fontSize = '';
      let size = parseFloat(getComputedStyle(node).fontSize);
      while (node.scrollWidth > node.clientWidth + 1 && size > 7) {
        size -= .5; node.style.fontSize = `${size}px`;
      }
    }));
  }
  function chip(name, options) {
    const identity = global.JDDParticipants.get(name);
    const account = identity?.kind === 'account';
    const item = document.createElement('div');
    item.className = 'jdd-player-item'; item.dataset.kind = account ? 'account' : 'guest';
    const choice = document.createElement(options.onSelect ? 'button' : 'span');
    choice.className = 'jdd-player-choice';
    if (options.onSelect) {
      choice.type = 'button'; choice.setAttribute('aria-pressed', String(name === options.selected));
      choice.setAttribute('aria-label', `${name}, ${account ? 'compte' : 'invité'}`);
      choice.addEventListener('click', () => options.onSelect(name));
    }
    const avatar = global.JDDAccounts.avatar(global.JDDAccounts.profileFor(name) || { display_name: identity?.name || name });
    avatar.classList.add('jdd-player-avatar');
    const text = document.createElement('span'); text.className = 'jdd-player-text';
    const label = document.createElement('span'); label.className = 'jdd-player-name'; label.textContent = identity?.name || name;
    const kind = document.createElement('small'); kind.className = 'account-kind'; kind.textContent = account ? 'Compte' : 'Invité';
    text.append(label, kind); choice.append(avatar, text);
    const remove = document.createElement('button'); remove.type = 'button';
    remove.className = 'jdd-player-remove remove-btn'; remove.textContent = '−';
    remove.setAttribute('aria-label', `Retirer ${name}`);
    remove.addEventListener('click', () => options.removePlayer(name));
    item.append(choice, remove); return item;
  }
  function mount(container, options) {
    const prefix = `jdd-player-${++serial}`;
    container.classList.add('jdd-player-editor');
    container.innerHTML = `<p class="jdd-player-summary jdd-player-count" aria-live="polite"></p><div class="jdd-player-list" aria-label="Joueurs inscrits"></div><div class="jdd-player-input"><label class="home-visually-hidden" for="${prefix}">Prénom du joueur</label><input id="${prefix}" type="text" placeholder="Prénom d’un invité" maxlength="40" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false"><button type="button" class="jdd-player-add" aria-label="Ajouter le joueur">+</button></div><p class="jdd-player-error" role="alert" hidden></p><div class="jdd-account-picker"></div>`;
    const directory = global.JDDAccounts.mountDirectory(container.querySelector('.jdd-account-picker'), options.maximum || 30);
    const input = container.querySelector('input');
    const status = container.querySelector('.jdd-player-error');
    const list = container.querySelector('.jdd-player-list');
    let selection = options.selected || '';
    function add() {
      if (!input.value.trim()) { input.focus({ preventScroll: true }); return; }
      if (options.addPlayer(input, options.maximum || 30)) {
        status.hidden = true;
        input.focus({ preventScroll: true });
      }
    }
    container.querySelector('.jdd-player-add').addEventListener('click', add);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); add(); }
    });
    input.addEventListener('input', () => { status.hidden = true; input.removeAttribute('aria-invalid'); });
    function update(selected = selection) {
      return global.JDD.preservePosition(() => {
        selection = selected;
        list.replaceChildren();
        container.querySelector('.jdd-player-summary').textContent = countLabel(options.getNames().length);
        options.getNames().forEach(name => {
          list.append(chip(name, { ...options, selected }));
        });
        fitNames(list);
        directory?.update();
      });
    }
    update(options.selected);
    const refreshAvatars = () => {
      if (container.isConnected) update();
      else global.removeEventListener('jdd:profiles', refreshAvatars);
    };
    global.addEventListener('jdd:profiles', refreshAvatars);
    return { update };
  }
  global.addEventListener('resize', () => fitNames(document));
  document.fonts?.ready.then(() => fitNames(document));
  global.JDDPlayerEditor = { mount, chip, fitNames, countLabel };
})(window);

/* Un seul bloc pour ajouter, retirer et choisir les joueurs des jeux. */
(function (global) {
  'use strict';
  let serial = 0;
  function mount(container, options) {
    const prefix = `jdd-player-${++serial}`;
    container.classList.add('jdd-player-editor');
    container.innerHTML = `<div class="jdd-player-input"><label class="home-visually-hidden" for="${prefix}">Prénom du joueur</label><input id="${prefix}" type="text" placeholder="Prénom d’un invité" maxlength="40" autocomplete="off" autocapitalize="words" enterkeyhint="done" spellcheck="false"><button type="button" class="jdd-player-add" aria-label="Ajouter le joueur">+</button></div><p class="jdd-player-error" role="alert" hidden></p><div class="jdd-account-picker"></div><div class="jdd-player-list"></div>`;
    const directory = global.JDDAccounts.mountDirectory(container.querySelector('.jdd-account-picker'), options.maximum || 30);
    const input = container.querySelector('input');
    const status = container.querySelector('.jdd-player-error');
    const list = container.querySelector('.jdd-player-list');
    let selection = options.selected || '';
    function add() {
      if (!input.value.trim()) { input.focus(); return; }
      if (options.addPlayer(input, options.maximum || 30)) {
        status.hidden = true;
        input.focus();
      }
    }
    container.querySelector('.jdd-player-add').addEventListener('click', add);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); add(); }
    });
    input.addEventListener('input', () => { status.hidden = true; input.removeAttribute('aria-invalid'); });
    function update(selected = selection) {
      selection = selected;
      list.replaceChildren();
      options.getNames().forEach(name => {
        const item = document.createElement('div');
        item.className = 'jdd-player-item';
        const choice = document.createElement(options.onSelect ? 'button' : 'span');
        choice.className = 'jdd-player-choice';
        if (options.onSelect) {
          choice.type = 'button';
          choice.setAttribute('aria-pressed', String(name === selected));
          choice.addEventListener('click', () => options.onSelect(name));
        }
        const avatar = document.createElement('span');
        avatar.className = 'jdd-player-avatar';
        avatar.textContent = name.trim().charAt(0).toUpperCase();
        const profile = global.JDDAccounts.profileFor(name);
        if (profile) { avatar.replaceChildren(global.JDDAccounts.avatar(profile)); }
        avatar.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.textContent = name;
        choice.append(avatar, label);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'jdd-player-remove';
        remove.textContent = '−';
        remove.setAttribute('aria-label', `Retirer ${name}`);
        remove.addEventListener('click', () => options.removePlayer(name));
        item.append(choice, remove);
        list.append(item);
      });
      directory?.update();
    }
    update(options.selected);
    const refreshAvatars = () => {
      if (container.isConnected) update();
      else global.removeEventListener('jdd:profiles', refreshAvatars);
    };
    global.addEventListener('jdd:profiles', refreshAvatars);
    return { update };
  }
  global.JDDPlayerEditor = { mount };
})(window);

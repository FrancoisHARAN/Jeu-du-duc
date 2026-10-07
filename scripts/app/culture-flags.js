// Petites interactions Culture G., sans horloge ni écran de configuration supplémentaire.
(function () {
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (className, text) => {
    const element = node('button', className, text);
    element.type = 'button';
    return element;
  };

  function spelling(question, root, finish) {
    root.className = 'mcq-grid flag-spelling';
    const slots = node('div', 'flag-spelling-slots');
    slots.setAttribute('aria-label', 'Nom du pays à compléter');
    const alphabet = node('div', 'flag-letter-bank');
    const submit = button('flag-submit', 'Valider');
    const normalized = JDD.normalizeFlagName(question.answer);
    const expected = [...normalized].filter(char => /[A-Z]/.test(char));
    const letters = JDD.shuffle([...expected, ...JDD.shuffle([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']).slice(0, 3)]);
    const letterButtons = letters.map(letter => button('flag-letter', letter));
    const slotButtons = [];
    const filled = Array(expected.length).fill(null);
    let done = false;
    const update = () => {
      submit.disabled = done || filled.some(value => value === null);
      slotButtons.forEach((slot, index) => {
        slot.textContent = filled[index] === null ? '' : letters[filled[index]];
        slot.disabled = done || filled[index] === null;
        slot.setAttribute('aria-label', `Lettre ${index + 1}${slot.textContent ? ` : ${slot.textContent}, retirer` : ', vide'}`);
      });
      letterButtons.forEach((choice, index) => { choice.disabled = done || filled.includes(index); });
    };
    // Un groupe par mot, ponctuation conservée ; aucune coupure au milieu d'un mot.
    for (const word of normalized.split(/\s+/)) {
      const group = node('span', 'flag-spelling-word');
      group.style.setProperty('--letters', word.length);
      for (const char of word) {
        if (!/[A-Z]/.test(char)) {
          group.append(node('span', 'flag-punctuation', char));
          continue;
        }
        const index = slotButtons.length;
        const slot = button('flag-letter-slot', '');
        slot.addEventListener('click', () => { if (!done) { filled[index] = null; update(); } });
        slotButtons.push(slot);
        group.append(slot);
      }
      slots.append(group);
    }
    letterButtons.forEach((choice, index) => {
      choice.addEventListener('click', () => {
        const slot = filled.indexOf(null);
        if (!done && slot >= 0) { filled[slot] = index; update(); }
      });
      alphabet.append(choice);
    });
    submit.addEventListener('click', () => {
      if (submit.disabled || done) return;
      const correct = filled.map(index => letters[index]).join('') === expected.join('');
      done = true;
      root.classList.add(correct ? 'flag-answer-correct' : 'flag-answer-wrong');
      update();
      finish(correct, { spelling: filled.map(index => letters[index]).join('') }, question.answer);
    });
    root.append(slots, alphabet, submit);
    update();
    // Le chargeur commun bloque également les lettres jusqu'au décodage du drapeau.
    return { options: [], buttons: letterButtons, ready: update };
  }

  function matching(question, root, finish) {
    root.className = 'mcq-grid flag-matching';
    const flags = node('div', 'flag-match-column');
    const names = node('div', 'flag-match-column');
    const status = node('p', 'flag-match-status', '0 / 4');
    status.setAttribute('role', 'status');
    const pairs = JDD.shuffle([...question.pairs]);
    const countries = JDD.shuffle([...question.pairs]);
    const matched = new Set();
    let selected = null, errors = 0;
    const flagButtons = pairs.map((pair, index) => {
      const choice = button('flag-match-image');
      choice.setAttribute('aria-label', `Drapeau ${index + 1}`);
      choice.dataset.flagCode = pair.code;
      choice.setAttribute('aria-pressed', 'false');
      choice.addEventListener('click', () => {
        if (matched.has(pair.code)) return;
        selected = pair;
        flagButtons.forEach(other => {
          const active = other === choice;
          other.classList.toggle('flag-match-selected', active);
          other.setAttribute('aria-pressed', String(active));
        });
      });
      flags.append(choice);
      return choice;
    });
    const nameButtons = countries.map(pair => {
      const choice = button('flag-match-name', pair.label);
      choice.dataset.flagCode = pair.code;
      choice.addEventListener('click', () => {
        if (!selected || matched.has(pair.code)) return;
        if (selected.code !== pair.code) {
          errors += 1;
          choice.classList.remove('flag-match-error');
          void choice.offsetWidth;
          choice.classList.add('flag-match-error');
          status.textContent = `${matched.size} / 4 · Réessaie`;
          return;
        }
        matched.add(pair.code);
        const flag = flagButtons.find(other => other.dataset.flagCode === pair.code);
        flag.disabled = choice.disabled = true;
        flag.classList.remove('flag-match-selected');
        flag.setAttribute('aria-pressed', 'false');
        flag.classList.add('mcq-correct');
        choice.classList.add('mcq-correct');
        choice.classList.remove('flag-match-error');
        selected = null;
        status.textContent = `${matched.size} / 4`;
        if (matched.size === pairs.length) finish(errors === 0, { matching_errors: errors },
          errors ? 'Associations terminées avec erreur.' : '✓');
      });
      names.append(choice);
      return choice;
    });
    root.append(flags, names, status);
    return { options: pairs.map(pair => ({ image: pair.image })), buttons: [...flagButtons, ...nameButtons] };
  }

  JDD.renderFlagInteraction = (question, root, finish) => {
    // Les taps de réponse ne doivent jamais déclencher « question suivante ».
    root.onclick = event => event.stopPropagation();
    return question.interaction === 'spell' ? spelling(question, root, finish) : matching(question, root, finish);
  };
})();

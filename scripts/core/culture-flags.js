// Formats du classeur Drapeaux : les propositions sont tirées à chaque question.
(function () {
  const { catalog, questions } = JDD.FLAG_DATA;
  const byCode = new Map(catalog.map((entry) => [entry.code, entry]));
  const palette = {
    Blanc: '#ffffff',
    Noir: '#252124',
    Gris: '#8d9499',
    Rouge: '#d52b32',
    Orange: '#f58b38',
    Jaune: '#ffda38',
    Vert: '#23954e',
    Bleu: '#2467c9',
    Violet: '#8246b5',
    Rose: '#f274ad',
    Marron: '#845332',
  };

  function others(entry, field = 'name') {
    const candidates = JDD.shuffle(
      catalog.filter(
        (other) => other.code !== entry.code && other[field] && other[field] !== entry[field]
      )
    );
    // Des choix proches géographiquement, avec un complément mondial si nécessaire.
    const nearby = candidates.filter((other) => other.continent === entry.continent);
    const rest = candidates.filter((other) => other.continent !== entry.continent);
    const seen = new Set([entry[field]]);
    return [...nearby, ...rest]
      .filter((other) => {
        if (seen.has(other[field])) return false;
        seen.add(other[field]);
        return true;
      })
      .slice(0, 3);
  }

  JDD.normalizeFlagName = (name) =>
    String(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/Œ/g, 'OE')
      .replace(/Æ/g, 'AE');

  JDD.prepareFlagQuestion = function (template) {
    if (!template.flagKind) return template;
    const entry = byCode.get(template.code);
    const question = { ...template, answerIndex: 0 };
    const kind = template.flagKind;
    if (kind === 'spell') {
      return {
        ...question,
        image: entry.flag,
        imageTitle: template.question,
        interaction: 'spell',
        answer: entry.name,
      };
    }
    if (kind === 'match') {
      return {
        ...question,
        interaction: 'match',
        pairs: [entry, ...others(entry)].map((other) => ({
          code: other.code,
          label: other.name,
          image: other.flag,
        })),
      };
    }
    if (kind === 'color') {
      const absent = JDD.shuffle(
        Object.keys(palette).filter((color) => !entry.visibleColors.includes(color))
      )[0];
      const colors = [absent, ...JDD.shuffle([...entry.colors]).slice(0, 3)];
      return {
        ...question,
        image: entry.flag,
        imageTitle: template.question,
        monochrome: true,
        choices: colors,
        choiceColors: colors.map((color) => palette[color]),
      };
    }
    const choices = [entry, ...others(entry, kind === 'capital' ? 'capital' : 'name')];
    question.choices = choices.map((other) => (kind === 'capital' ? other.capital : other.name));
    if (kind === 'flag' || kind === 'map')
      question.choiceImages = choices.map((other) => other.flag);
    if (kind !== 'flag') {
      question.image = kind === 'map' ? entry.map : entry.flag;
      question.imageTitle = template.question;
    }
    // Le nom du pays est indispensable pour les deux consignes « de ce pays ».
    if (kind === 'flag' || kind === 'capital') {
      question.question = `${template.question} ${entry.name}`;
      if (question.image) question.imageTitle = question.question;
    }
    return question;
  };

  const bank = questions.map((q) => ({
    ...q,
    flagKind: q.kind,
    category: 'Drapeaux',
    choices: [],
  }));
  for (const entry of catalog) {
    for (const [kind, prompt] of [
      ['spell', 'Épelle le nom de ce pays.'],
      ['match', 'Associe chaque drapeau à son pays.'],
      ['color', 'Quelle couleur n’appartient pas à ce drapeau ?'],
    ]) {
      bank.push({
        id: `drapeaux-${kind}-${entry.code}`,
        code: entry.code,
        flagKind: kind,
        category: 'Drapeaux',
        question: prompt,
        choices: [],
        source: { mode: kind, level: entry.level, continent: entry.continent, type: entry.type },
      });
    }
  }
  JDD.registerMcq(bank);
})();

// Cartes importées de Picolo : joueurs {p1}…{p4}, gorgées {n}, équipe {team},
// règles qui durent plusieurs cartes (virus) et mini-jeux dont la suite arrive à la carte suivante.
(function(){
  const STORAGE_KEY = 'jdd.picolo';
  const TEAM_NAMES = ['Bleue', 'Rouge'];
  const P = JDD.PICOLO = JDD.PICOLO || { byMode: { debut: [], hardcore: [], alcool: [] }, follow: {} };

  // cards : [id, mode, type, texte, joueurs minimum, war (0/1), clé de la suite ou null]
  // follow : { clé: { next: 1 si la suite arrive à la carte suivante, items: [[id, texte, joueurs minimum]] } }
  JDD.registerPicolo = function(data){
    (data.cards || []).forEach(([id, mode, type, text, min, war, key]) => {
      if (!P.byMode[mode]) P.byMode[mode] = [];
      P.byMode[mode].push({ id, mode, type, text, min, war: war === 1, key: key || null });
    });
    Object.entries(data.follow || {}).forEach(([key, value]) => {
      P.follow[key] = { next: value.next === 1, items: value.items.map(([id, text, min]) => ({ id, text, min })) };
    });
  };

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  let pending = Array.isArray(saved.pending) ? saved.pending : [];
  let teams = saved.teams && Array.isArray(saved.teams.Bleue) ? saved.teams : null;
  function save(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ pending, teams })); } catch (e) { /* stockage indisponible */ }
  }

  const playable = (card, count) => count >= Math.max(card.min || 0, card.war ? 4 : 0);

  // Paquet d'une catégorie : cartes du jeu + cartes Picolo jouables avec ce nombre de joueurs.
  // Le même tableau est rendu tant que rien ne change (le paquet mémorise les cartes déjà vues).
  const pools = {};
  JDD.partyPool = function(mode, count){
    const base = (JDD.DATA && JDD.DATA[mode]) || [];
    const extra = P.byMode[mode] || [];
    const cached = pools[mode];
    if (cached && cached.base === base.length && cached.extra === extra.length && cached.count === count) return cached.list;
    const list = base.concat(extra.filter(card => playable(card, count)));
    pools[mode] = { base: base.length, extra: extra.length, count, list };
    return list;
  };

  function ensureTeams(players){
    const current = teams ? teams.Bleue.concat(teams.Rouge) : [];
    if (!teams || current.length !== players.length || !players.every(name => current.includes(name))) {
      const shuffled = JDD.shuffle(players.slice());
      const half = Math.ceil(shuffled.length / 2);
      teams = { Bleue: shuffled.slice(0, half), Rouge: shuffled.slice(half) };
      save();
    }
    return teams;
  }

  function fill(text, players, context){
    const count = (text.match(/\{p\d\}/g) || []).reduce((max, tag) => Math.max(max, Number(tag[2])), 0);
    const chosen = (context.players || []).filter(name => players.includes(name)).slice(0, count);
    let candidates;
    if (context.war) {
      // les joueurs nommés sont pris dans l'équipe adverse de {team}, ou un dans chaque équipe
      const own = teams[context.team] || [];
      const other = teams[TEAM_NAMES.find(name => name !== context.team)] || [];
      const blue = JDD.shuffle(teams.Bleue.slice());
      const red = JDD.shuffle(teams.Rouge.slice());
      candidates = text.includes('{team}') ? JDD.shuffle(other.slice()).concat(JDD.shuffle(own.slice()))
        : blue.flatMap((name, i) => [name, red[i]]).concat(red.slice(blue.length)).filter(Boolean);
    } else {
      const first = chosen.length ? null : JDD.nextPlayer(players);
      candidates = (first ? [first] : []).concat(JDD.shuffle(players.slice()));
    }
    candidates.forEach(name => {
      if (chosen.length < count && name && !chosen.includes(name)) chosen.push(name);
    });
    const amount = () => String(2 + Math.floor(Math.random() * 3));
    const result = text
      // « de Inès » → « d'Inès », « que Hugo » reste (h aspiré possible), seulement devant une voyelle
      .replace(/\b(de|que|De|Que) \{p(\d)\}/g, (match, word, i) => {
        const name = chosen[Number(i) - 1] || chosen[0] || '';
        return /^[AEIOUÀÂÄÉÈÊËÎÏÔÖÙÛÜaeiou]/.test(name) ? `${word.slice(0, -1)}'${name}` : `${word} ${name}`;
      })
      .replace(/\{p(\d)\}/g, (_, i) => chosen[Number(i) - 1] || chosen[0] || '')
      .replace(/\{team\}/g, context.team || '')
      .replace(/\{n\}/g, amount);
    return { text: result, players: chosen };
  }

  function teamsLine(){
    return teams ? `Bleue : ${teams.Bleue.join(', ')} · Rouge : ${teams.Rouge.join(', ')}` : '';
  }

  // Affichage d'une carte Picolo tirée du paquet : { type, text, addressed, teams }
  JDD.renderPicolo = function(card, players){
    const context = { war: card.war };
    if (card.war) {
      ensureTeams(players);
      context.team = TEAM_NAMES[Math.floor(Math.random() * 2)];
    }
    const filled = fill(card.text, players, context);
    const follow = card.key && P.follow[card.key];
    if (follow) {
      const options = follow.items.filter(item => playable(item, players.length));
      const item = options[Math.floor(Math.random() * options.length)];
      if (item) {
        pending.push({ due: follow.next ? 1 : 6 + Math.floor(Math.random() * 7), text: item.text, mode: card.mode,
          type: follow.next ? 'SUITE' : 'FIN DE RÈGLE', war: card.war, team: context.team || null, players: filled.players });
        save();
      }
    }
    const type = card.war ? 'ÉQUIPES' : follow && !follow.next ? 'RÈGLE' : card.type;
    return { type, text: filled.text, addressed: filled.players[0] || null, teams: card.war ? teamsLine() : '' };
  };

  // Suite ou fin de règle arrivée à échéance (à appeler à chaque nouvelle carte), sinon null.
  JDD.picoloDue = function(players){
    if (!pending.length) return null;
    pending.forEach(item => { item.due -= 1; });
    const index = pending.findIndex(item => item.due <= 0);
    const item = index < 0 ? null : pending.splice(index, 1)[0];
    save();
    if (!item) return null;
    if (item.war) ensureTeams(players);
    const filled = fill(item.text, players, { players: item.players, war: item.war, team: item.team });
    return { mode: item.mode, type: item.type, text: filled.text, addressed: filled.players[0] || null,
      teams: item.war ? teamsLine() : '' };
  };

  // Nouvelle partie : règles en cours et équipes oubliées.
  JDD.resetPicolo = function(){
    pending = [];
    teams = null;
    save();
  };
})();

/* Calculs communs au profil et aux exploits ; aucune donnée inventée. */
(function (global) {
  'use strict';
  const modes = { undercover: 'Undercover', heads: 'Devine Tête', geography: 'Géographie', football: 'Grand Quiz Foot', culture: 'Culture G.',
    debut: 'Apéro chiantos', hardcore: 'Sexy pas raffiné', alcool: 'Torgnole express', custom: 'Personnalisé', rapidite: 'Rapidité' };
  const labels = { games: 'Parties jouées', wins: 'Victoires', points: 'Points', white_games: 'Parties en Mr. White', white_wins: 'Victoires en Mr. White',
    undercover_games: 'Parties en Undercover', undercover_wins: 'Victoires en Undercover', civil_games: 'Parties en civil', civil_wins: 'Victoires en civil',
    questions_answered: 'Questions répondues', correct_answers: 'Bonnes réponses', answers_revealed: 'Réponses dévoilées', cards_seen: 'Cartes jouées',
    words_found: 'Mots trouvés', words_passed: 'Mots passés', turns: 'Tours joués', correct_places: 'Zones trouvées', perfect_places: 'Placements parfaits' };
  const number = (value, digits = 0) => value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
  const plural = (n, text) => `${number(n)} ${n > 1 ? text.split(' ').map(word => word + 's').join(' ') : text}`;
  function wilson(wins, games) {
    if (!(games > 0 && wins >= 0 && wins <= games)) return 0;
    const z = 1.96, p = wins / games;
    return (p + z*z/(2*games) - z*Math.sqrt(p*(1-p)/games + z*z/(4*games*games))) / (1+z*z/games);
  }
  function model(profiles, statistics) {
    const players = new Map(profiles.map(profile => [profile.id, { profile, modes: {} }]));
    for (const row of statistics) {
      const player = players.get(row.player_id), value = Number(row.total);
      if (!player || !modes[row.mode] || !Number.isFinite(value) || value < 0) continue;
      const metrics = player.modes[row.mode] ||= {};
      metrics[row.metric] = (metrics[row.metric] || 0) + value;
    }
    const value = (id, mode, metric) => players.get(id)?.modes[mode]?.[metric] || 0;
    const totalGames = id => Object.keys(modes).reduce((sum, mode) => sum + value(id, mode, 'games'), 0);
    function personal(id) {
      const result = [];
      for (const [mode, title] of Object.entries(modes)) {
        const m = players.get(id)?.modes[mode] || {};
        const relevant = mode === 'undercover' ? ['games','wins','white_games','white_wins','undercover_games','undercover_wins','civil_games','civil_wins','points']
          : mode === 'heads' ? ['games','words_found','words_passed','points']
          : mode === 'geography' ? ['games','wins','turns','correct_places','perfect_places','points']
          : mode === 'football' ? ['games','wins','points','turns','questions_answered','correct_answers']
          : mode === 'culture' ? ['games','questions_answered','correct_answers','answers_revealed'] : ['games','cards_seen'];
        const rows = relevant.filter(key => m[key] > 0).map(key => ({ label: labels[key], value: number(m[key]) }));
        function rate(label, won, played) {
          if (m[played] > 0 && m[won] > 0 && m[won] <= m[played]) rows.push({ label, value: `${number(100*m[won]/m[played],1)} %` });
        }
        if (['undercover','football','geography'].includes(mode)) rate('Taux de victoire', 'wins', 'games');
        if (mode === 'undercover') rate('Taux de victoire en Mr. White', 'white_wins', 'white_games');
        if (['culture','football'].includes(mode)) rate('Réussite aux questions', 'correct_answers', 'questions_answered');
        if (mode === 'geography') {
          for (const [prefix, label] of [['measured_distance','Distance moyenne · villes'],['city_france','Distance moyenne · France'],['city_world','Distance moyenne · monde']]) {
            const count = prefix === 'measured_distance' ? m.distance_turns : m[prefix+'_turns'];
            if (count > 0 && Number.isFinite(m[prefix+'_km'])) rows.push({ label, value: `${number(m[prefix+'_km']/count,1)} km`, detail: plural(count, 'placement mesuré') });
          }
        }
        if (rows.length) result.push({ mode, title, rows });
      }
      return { games: totalGames(id), modes: result };
    }
    const cards = [];
    function add(id, mode, title, rule, get) {
      const eligible = [...players.values()].map(player => ({ profile: player.profile, ...get(player.profile.id) })).filter(row => row.eligible);
      eligible.sort((a,b) => b.score-a.score || b.samples-a.samples || a.profile.display_name.localeCompare(b.profile.display_name,'fr') || a.profile.id.localeCompare(b.profile.id));
      if (!eligible.length) return;
      let previous = null, rank = 0;
      eligible.forEach((row,index) => {
        if (previous === null || Math.abs(row.score-previous) > 1e-10) rank = index+1;
        row.rank = rank; previous = row.score;
        row.tied = eligible.some(other => other !== row && Math.abs(other.score-row.score) <= 1e-10);
      });
      cards.push({ id, mode, title, rule, rows: eligible.slice(0,3) });
    }
    function count(id, mode, title, metric, unit) {
      add(id,mode,title,'',player => {
        const n = metric === 'all_games' ? totalGames(player) : value(player,mode,metric);
        return { eligible: n > 0, score: n, samples: 0, value: number(n), detail: plural(n, unit) };
      });
    }
    function rate(id, mode, title, wins, games, minimum, unit) {
      add(id,mode,title,`${minimum} ${unit}s minimum. Ordre pondéré selon le taux et le nombre de ${unit}s.`, player => {
        const n=value(player,mode,games), w=value(player,mode,wins);
        return { eligible: n >= minimum && w > 0 && w <= n, score: wilson(w,n), samples: n,
          value: `${number(100*w/n,1)} %`, detail: `${number(w)} / ${number(n)} ${unit}s` };
      });
    }
    count('all-games','all','Le plus de parties','all_games','partie');
    rate('football-rate','football','Taux de victoire · Quiz Foot','wins','games',5,'partie');
    count('white-wins','undercover','Victoires en Mr. White','white_wins','victoire');
    count('culture-correct','culture','Bonnes réponses · Culture G.','correct_answers','bonne réponse');
    count('heads-found','heads','Mots trouvés · Devine Tête','words_found','mot trouvé');
    count('geo-perfect','geography','Placements parfaits · Géographie','perfect_places','placement parfait');
    rate('white-rate','undercover','Taux de victoire · Mr. White','white_wins','white_games',5,'partie');
    rate('culture-rate','culture','Réussite · Culture G.','correct_answers','questions_answered',20,'question');
    count('undercover-wins','undercover','Victoires · Undercover','wins','victoire');
    for (const [zone,title] of [['france','France'],['world','Monde']]) {
      const measured = id => Number.isFinite(players.get(id)?.modes.geography?.[`city_${zone}_km`]) && value(id,'geography',`city_${zone}_turns`) > 0;
      const ids = [...players.keys()].filter(measured);
      const total = ids.reduce((sum,id) => sum + value(id,'geography',`city_${zone}_km`),0);
      const samples = ids.reduce((sum,id) => sum + value(id,'geography',`city_${zone}_turns`),0);
      const prior = samples > 0 ? total/samples : 0;
      add(`geo-distance-${zone}`,'geography',`Précision · villes ${title}`, '5 placements minimum. La moyenne est pondérée par 5 placements à la moyenne de la bande ; moins de kilomètres est meilleur.', id => {
        const n=value(id,'geography',`city_${zone}_turns`), km=value(id,'geography',`city_${zone}_km`);
        return { eligible: n >= 5 && measured(id), score: -(km+5*prior)/(n+5), samples: n,
          value: n > 0 ? `${number(km/n,1)} km` : '', detail: plural(n,'placement') };
      });
    }
    for (const [mode,title] of Object.entries(modes)) count(`games-${mode}`,mode,`Parties · ${title}`,'games','partie');
    return { personal, cards, totalGames };
  }
  const api = { model, wilson, modes, number, plural };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.JDDStatistics = api;
})(typeof window !== 'undefined' ? window : globalThis);

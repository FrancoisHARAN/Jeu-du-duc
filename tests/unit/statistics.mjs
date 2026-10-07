/* Éligibilité et pondération : petits échantillons, égalités, zones et corrections. */
import assert from 'node:assert/strict';
import stats from '../../scripts/core/statistics.js';
const profiles = ['François', 'Axel', 'Nico', 'Léa'].map((display_name, i) => ({
  id: String(i),
  display_name,
}));
let input = [];
function add(id, mode, metrics) {
  for (const [metric, total] of Object.entries(metrics))
    input.push({ player_id: String(id), mode, metric, total });
}
const card = (model, id) => model.cards.find((c) => c.id === id);
assert.equal(stats.wilson(1, 0), 0);
assert.ok(stats.wilson(80, 100) > stats.wilson(5, 5));
assert.ok(stats.wilson(5, 5) > stats.wilson(4, 5));
assert.equal(stats.plural(2, 'bonne réponse'), '2 bonnes réponses');
assert.equal(stats.model(profiles, []).cards.length, 0);
assert.deepEqual(stats.model(profiles, []).personal('0'), { games: 0, modes: [] });
add(0, 'football', { games: '100', wins: 80, points: 205 });
add(1, 'football', { games: 1, wins: 1 });
add(2, 'football', { games: 5, wins: 5 });
add(3, 'football', { games: 8, wins: 0 });
let model = stats.model(profiles, input);
assert.deepEqual(
  card(model, 'football-rate').rows.map((r) => r.profile.id),
  ['0', '2']
);
assert.equal(card(model, 'football-rate').rows[0].value, '80 %');
assert.equal(card(model, 'football-rate').rows[1].value, '100 %');
assert.equal(
  model.personal('1').modes[0].rows.find((r) => r.label === 'Taux de victoire').value,
  '100 %'
);
assert.ok(!model.personal('3').modes[0].rows.some((r) => r.label === 'Victoires'));
assert.ok(!model.cards.some((c) => c.id === 'white-rate'));
console.log(
  'PASS: taux réel au profil, minimum 5 parties et Wilson classant les résultats éprouvés'
);
input = [];
add(0, 'undercover', { games: 10, white_games: 8, white_wins: 5 });
add(1, 'undercover', { games: 10, white_games: 1, white_wins: 1 });
add(2, 'undercover', { games: 10, white_games: 7, white_wins: 5 });
add(3, 'undercover', { games: 2, white_games: 1, white_wins: 1 });
add(0, 'culture', { games: 1, questions_answered: 20, correct_answers: 16 });
add(1, 'culture', { games: 1, questions_answered: 19, correct_answers: 19 });
add(2, 'culture', { games: 1, questions_answered: 100, correct_answers: 90 });
add('unregistered', 'football', { games: 100000, wins: 100000 });
add(0, 'unknown', { games: 100 });
add(0, 'rapidite', { games: 100, cards_seen: 500 });
add(0, 'heads', { games: 0, words_found: 0 });
model = stats.model(profiles, input);
assert.deepEqual(
  card(model, 'white-wins').rows.map((r) => [r.profile.id, r.rank, r.tied]),
  [
    ['0', 1, true],
    ['2', 1, true],
    ['1', 3, true],
  ]
);
assert.deepEqual(
  card(model, 'white-rate').rows.map((r) => r.profile.id),
  ['2', '0']
);
assert.deepEqual(
  card(model, 'culture-rate').rows.map((r) => r.profile.id),
  ['2', '0']
);
assert.equal(card(model, 'culture-correct').rows[0].value, '90');
assert.ok(!model.cards.some((c) => c.mode === 'heads'));
assert.equal(model.totalGames('0'), 11);
assert.ok(!model.personal('0').modes.some((mode) => mode.title === 'Rapidité'));
assert.equal(
  model.cards.every((c) => c.rows.length <= 3),
  true
);
console.log(
  'PASS: tops 3, ex æquo, statistiques par rôle, seuil des questions et absence de zéros'
);
input = [];
// Des tours de pays ou sans placement ne doivent pas diviser les distances de villes.
add(0, 'geography', {
  games: 8,
  turns: 300,
  distance_km: 50000,
  distance_turns: 10,
  measured_distance_km: 0,
  city_france_turns: 5,
  city_france_km: 0,
  city_world_turns: 5,
  city_world_km: 0,
});
add(1, 'geography', { games: 1, turns: 6, city_france_turns: 4, city_france_km: 4 });
add(2, 'geography', {
  games: 10,
  turns: 100,
  city_france_turns: 50,
  city_france_km: 5000,
  city_world_turns: 6,
  city_world_km: 6000,
});
add(3, 'geography', { games: 20, turns: 200, city_france_turns: 10 }); // Numérateur absent : aucune moyenne inventée.
model = stats.model(profiles, input);
assert.deepEqual(
  card(model, 'geo-distance-france').rows.map((r) => r.profile.id),
  ['0', '2']
);
assert.deepEqual(
  card(model, 'geo-distance-world').rows.map((r) => r.profile.id),
  ['0', '2']
);
assert.equal(card(model, 'geo-distance-world').rows[1].value, '1\u202f000 km');
const geo = model.personal('0').modes[0].rows;
assert.equal(geo.find((r) => r.label === 'Distance moyenne · villes').value, '0 km');
assert.equal(
  geo.find((r) => r.label === 'Distance moyenne · villes').detail,
  '10 placements mesurés'
);
assert.ok(!model.personal('3').modes[0].rows.some((r) => r.label.startsWith('Distance')));
assert.ok(!model.cards.some((c) => c.id === 'geo-perfect'));
// Le tri régularisé conserve les moyennes brutes à l'affichage.
assert.equal(card(model, 'geo-distance-france').rows[1].value, '100 km');
console.log(
  'PASS: moyennes par zone, placements mesurés uniquement, distance exacte nulle et données manquantes'
);
input = [];
add(0, 'football', { games: 20, wins: 18 });
add(1, 'football', { games: 20, wins: 10 });
const before = stats.model(profiles, input);
input = input.map((row) => ({
  ...row,
  total: row.player_id === '0' && row.metric === 'wins' ? 5 : row.total,
}));
const after = stats.model(profiles, input);
assert.equal(card(before, 'football-rate').rows[0].profile.id, '0');
assert.equal(card(after, 'football-rate').rows[0].profile.id, '1');
assert.equal(after.totalGames('0'), 20);
assert.deepEqual(stats.model(profiles, input.reverse()).cards, after.cards);
console.log('PASS: une correction change les exploits sans ajouter de partie, ordre déterministe');

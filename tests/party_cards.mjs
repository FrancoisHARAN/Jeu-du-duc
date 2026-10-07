/* Banques de soirée : exclusions, suites restaurées et anciens résultats hors ligne. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = async path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const storage = new Map();
const context = vm.createContext({
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  Math: Object.assign(Object.create(Math), { random: () => 0 }),
});
context.window = context;
const run = async path => vm.runInContext(await source(path), context, { filename: path });
storage.set('jdd.picolo', JSON.stringify({ pending: [
  { due: 1, mode: 'debut', type: 'SUITE', text: "Le premier champion à donner le résultat de (17x3)+27 fera gagner son équipe.", players: ['Léa'], war: false },
], teams: null }));
await run('scripts/core/init.js');
await run('scripts/core/history.js');
await run('scripts/core/picolo.js');
for (const path of ['data/debut.text.js', 'data/hardcore.text.js', 'data/alcool.text.js', 'data/picolo.cards.js']) await run(path);
const JDD = context.JDD;
const excluded = JSON.parse(await source('tools/picolo_excluded.json')).cartes;
const parents = Object.values(JDD.PICOLO.byMode).flat();
for (const card of parents) {
  assert.ok(!excluded[card.id], 'Une carte exclue revient dans une catégorie');
  if (card.key) assert.ok(JDD.PICOLO.follow[card.key]?.items.length, 'Un mini-jeu n’a plus de suite');
}
for (const mode of ['debut', 'hardcore', 'alcool']) {
  for (const count of [1, 2, 4, 30]) assert.ok(JDD.partyPool(mode, count).length > 0);
}
assert.equal(JDD.picoloDue(['Léa', 'Max']), null, 'Une ancienne suite de vitesse ne doit pas être jouée');
assert.deepEqual(JSON.parse(storage.get('jdd.picolo')).pending, []);
const words = ['Léa', 'Max', 'Sam', 'Zoé'];
const rule = parents.find(card => card.key === 'timewatch');
const first = JDD.renderPicolo(rule, words);
assert.equal(first.type, 'RÈGLE');
assert.ok(first.addressed && words.includes(first.addressed));
let ending = null;
for (let i = 0; i < 6; i++) ending = JDD.picoloDue(words);
assert.equal(ending.type, 'FIN DE RÈGLE');
assert.equal(ending.addressed, first.addressed, 'La règle doit garder le joueur de départ');
const champion = parents.find(card => card.key === 'champion-maths');
assert.equal(JDD.renderPicolo(champion, words).type, 'ÉQUIPES');
assert.equal(JDD.picoloDue(words).type, 'SUITE');
console.log('PASS: exclusions dans tous les modes, ancienne suite supprimée, règles et mini-jeux encore jouables');

const calls = [];
const host = '10000000-0000-4000-8000-000000000001';
const rows = [{ account_id: host, metrics: { cards_seen: 1 } }];
const event = mode => ({ id: mode, host, mode, occurredAt: new Date().toISOString(), revision: 1, participants: rows, payload: {} });
const cloudStorage = new Map([['jdd.cloud-outbox.v1', JSON.stringify([event('rapidite'), event('debut')])], ['jdd.players', JSON.stringify(words)]]);
const cloud = vm.createContext({
  localStorage: { getItem: key => cloudStorage.get(key) || null, setItem: (key, value) => cloudStorage.set(key, value) },
  navigator: { onLine: true },
  CustomEvent: class {}, Event: class {}, dispatchEvent() {}, addEventListener() {},
  setTimeout, clearTimeout,
  JDD_SUPABASE_CONFIG: { url: 'https://project.example.test', publishableKey: 'test-fixture' },
  JDDParticipants: { uuid: () => 'new-event', capture: () => [] },
  supabase: { createClient: () => ({ rpc: async (name, payload) => { calls.push(payload); return { error: null }; } }) },
});
cloud.window = cloud;
vm.runInContext(await source('scripts/core/cloud.js'), cloud);
assert.deepEqual(JSON.parse(cloudStorage.get('jdd.cloud-outbox.v1')).map(e => e.mode), ['debut']);
assert.deepEqual(JSON.parse(cloudStorage.get('jdd.players')), words);
cloud.JDDCloud.record({ ...event('rapidite'), id: 'removed' }, [{ participant: { kind: 'account', id: host }, metrics: { cards_seen: 1 } }]);
assert.equal(JSON.parse(cloudStorage.get('jdd.cloud-outbox.v1')).length, 1);
cloud.JDDCloud.setUser({ id: host });
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(calls.map(c => c.p_mode), ['debut']);
assert.deepEqual(JSON.parse(cloudStorage.get('jdd.cloud-outbox.v1')), []);
assert.equal(cloud.JDDCloud.status().pending, 0);
console.log('PASS: ancien résultat de Rapidité écarté, résultat de soirée synchronisé et joueurs conservés');

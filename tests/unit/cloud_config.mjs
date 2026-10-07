/* Le déplacement du client d'administration ne change ni ses garde-fous ni son mode local. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../../tools/maintenance/project.mjs';
function check(url, key) {
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_PUBLISHABLE_KEY;
  if (url !== undefined) env.SUPABASE_URL = url;
  if (key !== undefined) env.SUPABASE_PUBLISHABLE_KEY = key;
  return spawnSync(
    process.execPath,
    ['--use-env-proxy', 'tools/cloud/check_supabase.mjs', '--local'],
    { cwd: ROOT, env, encoding: 'utf8' }
  );
}
for (const [url, key] of [
  [undefined, undefined],
  ['http://project.example.test', 'sb_publishable_fixture'],
  ['https://project.example.test/path', 'sb_publishable_fixture'],
  ['https://project.example.test', 'wrong-fixture'],
]) {
  const result = check(url, key);
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('Connexion Supabase vérifiée'));
}
const valid = check('https://project.example.test', 'sb_publishable_fixture');
assert.equal(valid.status, 0, valid.stderr);
assert.ok(valid.stdout.includes('client Supabase initialisé'));
console.log(
  'PASS: outils cloud déplacés, variables absentes/invalides rejetées, clé publishable et initialisation locale sans appel distant.'
);

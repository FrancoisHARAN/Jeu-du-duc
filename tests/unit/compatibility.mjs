/* Contrats du nettoyage : contenu inchangé, moteurs équivalents et URLs stables. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  absolute,
  digest,
  filesIn,
  indexMarkup,
  precacheFiles,
  read,
  semanticDigest,
  syntaxTree,
  walk,
} from '../../tools/maintenance/project.mjs';

const fixture = JSON.parse(await read('tests/fixtures/compatibility.json'));
const files = await filesIn();
for (const [name, group] of Object.entries(fixture.groups)) {
  const paths =
    group.paths ||
    Object.fromEntries(
      files
        .filter((file) => file.startsWith(group.prefix) && !group.excluded.includes(file))
        .map((file) => [file, file])
    );
  const hash = createHash('sha256');
  const entries = Object.entries(paths).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  assert.equal(entries.length, group.files, `${name} : nombre de fichiers modifié`);
  for (const [original, current] of entries)
    hash
      .update(original)
      .update('\0')
      .update(digest(await readFile(absolute(current))))
      .update('\0');
  assert.equal(hash.digest('hex'), group.sha256, `${name} : contenu ou chemin public modifié`);
}
for (const [file, hash] of Object.entries(fixture.files))
  assert.equal(digest(await readFile(absolute(file))), hash, file);
const html = await read('index.html');
assert.equal(
  digest(indexMarkup(html)),
  fixture.indexMarkup,
  'DOM statique ou texte visible modifié'
);
const scripts = [...html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)].map((match) => match[1]);
let previous = -1;
for (const script of fixture.originalScripts) {
  const at = scripts.indexOf(script);
  assert.ok(at > previous, `Ordre de chargement perdu : ${script}`);
  previous = at;
}
assert.ok(scripts.indexOf('scripts/core/dom.js') < scripts.indexOf('scripts/app/player-editor.js'));
assert.ok(
  scripts.indexOf('scripts/app/culture-questions.js') < scripts.indexOf('scripts/app/main-game.js')
);
const shell = precacheFiles(await read('service-worker.js'));
for (const script of scripts)
  assert.ok(shell.includes(script), `Script absent hors ligne : ${script}`);
for (const [file, hash] of Object.entries(fixture.engineAsts))
  assert.equal(
    semanticDigest(syntaxTree(await read(file), file)),
    hash,
    `Algorithme modifié : ${file}`
  );
const functions = new Map();
walk(syntaxTree(await read('scripts/app/culture-questions.js')), (node) => {
  if (node.type === 'FunctionDeclaration') functions.set(node.id.name, semanticDigest(node));
});
for (const [name, hash] of Object.entries(fixture.cultureFunctions))
  assert.equal(functions.get(name), hash, `Logique Culture G. modifiée : ${name}`);
console.log(
  `PASS: données, styles, images, polices, migrations et sources archivées inchangés ; ${Object.keys(fixture.engineAsts).length} modules et huit fonctions Culture G. équivalents à ${fixture.baselineCommit.slice(0, 7)}.`
);

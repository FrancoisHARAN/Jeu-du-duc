import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read } from '../../tools/maintenance/project.mjs';
const context = vm.createContext({ document: {}, addEventListener() {} });
context.window = context;
for (const file of ['scripts/core/init.js', 'scripts/core/dom.js', 'scripts/app/player-editor.js'])
  vm.runInContext(await read(file), context);
for (const value of ['<&>"\'', null, undefined, 0, 'François & Zoé', 'déjà échappé &amp;']) {
  const expected = String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
  assert.equal(context.JDD.escapeHtml(value), expected);
}
function original(selection, people) {
  selection = [0, 1].map((i) =>
    people.includes(selection[i]) ? selection[i] : people.find((n) => n !== selection[1 - i]) || ''
  );
  if (selection[0] === selection[1]) selection[1] = people.find((n) => n !== selection[0]) || '';
  return selection;
}
for (const people of [[], ['Alice'], ['Alice', 'Bob'], ['Alice', 'Bob', 'Alice (invité)']]) {
  for (const first of ['', undefined, 'Alice', 'Bob', 'Retiré'])
    for (const second of ['', undefined, 'Alice', 'Bob', 'Retiré']) {
      const selection = [first, second];
      assert.deepEqual(
        Array.from(context.JDDPlayerEditor.duelSelection(selection, people)),
        original(selection, people)
      );
      assert.deepEqual(selection, [first, second], 'Le helper ne doit pas muter le choix reçu.');
    }
}
console.log(
  'PASS: échappement identique et 100 sélections compte/invité, doublons et retraits équivalents aux deux implémentations précédentes.'
);

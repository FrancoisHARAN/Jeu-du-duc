/* Syntaxe, références locales, métadonnées PWA et dépendances de développement. */
import { access } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, absolute, filesIn, precacheFiles, read, syntaxTree, walk } from './project.mjs';

const files = await filesIn();
const errors = [];
let references = 0;
async function checkReference(target, owner, relative = false) {
  if (/^image\/(?:jpeg|png|webp)(?:,image\/(?:jpeg|png|webp))*$/.test(target)) return;
  if (!target || /^(?:https?:|data:|blob:|mailto:|#|\{\{)/.test(target)) return;
  target = target.split(/[?#]/)[0];
  if (!target) return;
  const file = relative
    ? path.resolve(ROOT, path.dirname(owner), decodeURIComponent(target))
    : absolute(decodeURIComponent(target));
  try {
    await access(file);
    references++;
  } catch {
    errors.push(`${owner} → ${target}`);
  }
}
for (const file of files) {
  if (/\.[cm]?js$/.test(file)) {
    let tree;
    try {
      tree = syntaxTree(await read(file), file);
    } catch (error) {
      errors.push(`${file} : ${error.message}`);
      continue;
    }
    if (file.startsWith('archive/') || file.startsWith('vendor/')) continue;
    const pending = [];
    walk(tree, (node) => {
      if (
        node.type === 'Literal' &&
        typeof node.value === 'string' &&
        /^(?:image|fonts|data|styles|scripts|vendor|supabase)\/[^\s]+$/.test(node.value)
      )
        pending.push(checkReference(node.value, file));
      if (node.type === 'ImportDeclaration' && node.source.value.startsWith('.'))
        pending.push(checkReference(node.source.value, file, true));
      if (
        node.type === 'ImportExpression' &&
        typeof node.source.value === 'string' &&
        node.source.value.startsWith('.')
      )
        pending.push(checkReference(node.source.value, file, true));
      if (
        node.type === 'CallExpression' &&
        node.callee.name === 'require' &&
        node.arguments[0]?.value?.startsWith('.')
      )
        pending.push(checkReference(node.arguments[0].value, file, true));
    });
    await Promise.all(pending);
  }
  if (file.endsWith('.css')) {
    for (const match of (await read(file)).matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g))
      await checkReference(match[1], file, true);
  }
  if (file.endsWith('.md') && !file.startsWith('archive/')) {
    for (const match of (await read(file)).matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g))
      await checkReference(match[1], file, true);
  }
}
const index = await read('index.html');
for (const match of index.matchAll(/(?:src|href)="([^"]+)"/g))
  await checkReference(match[1], 'index.html');
const manifest = JSON.parse(await read('manifest.webmanifest'));
if (['id', 'start_url', 'scope'].some((key) => manifest[key] !== './'))
  errors.push('Le périmètre public de la PWA a changé.');
for (const icon of manifest.icons) await checkReference(icon.src, 'manifest.webmanifest');
const shell = precacheFiles(await read('service-worker.js'));
if (new Set(shell).size !== shell.length) errors.push('Le précache contient des doublons.');
for (const file of shell) await checkReference(file, 'service-worker.js');
for (const file of ['data/culture.flags.images.json', 'data/culture.quiz360.images.json']) {
  for (const image of JSON.parse(await read(file))) await checkReference(image, file);
}
const pkg = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));
for (const kind of ['dependencies', 'devDependencies']) {
  if (JSON.stringify(pkg[kind]) !== JSON.stringify(lock.packages[''][kind]))
    errors.push(`${kind} de package.json et du lock divergent.`);
}
if (
  pkg.dependencies['@supabase/supabase-js'] !== '2.117.2' ||
  !index.includes('vendor/supabase/supabase.js?v=2.117.2')
)
  errors.push('Les deux distributions Supabase doivent garder la même version approuvée.');
for (const file of files.filter((file) => /\.(?:[cm]?js|json|html|py|md)$/.test(file))) {
  const source = await read(file);
  if (
    /sb_secret_[\w-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}/.test(
      source
    )
  )
    errors.push(`${file} : un secret privilégié ressemble à une valeur intégrée.`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${files.length} fichiers, syntaxe JavaScript, ${references} références locales, manifest, précache, SDK et lock cohérents.`
  );

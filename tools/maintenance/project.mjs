/* Petits outils de contrôle du dépôt, sans dépendance au navigateur. */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'acorn';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const absolute = (file) => path.join(ROOT, file);
export const read = (file) => readFile(absolute(file), 'utf8');
export const digest = (content) => createHash('sha256').update(content).digest('hex');

export async function filesIn(directory = '') {
  const result = [];
  for (const entry of await readdir(absolute(directory), { withFileTypes: true })) {
    if (
      [
        '.git',
        'node_modules',
        '.venv',
        '__pycache__',
        'test-results',
        'playwright-report',
        'coverage',
      ].includes(entry.name)
    )
      continue;
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesIn(file)));
    else if (entry.isFile() && (!entry.name.startsWith('.env') || entry.name === '.env.example'))
      result.push(file);
  }
  return result.sort();
}

export function syntaxTree(source, file = '') {
  return parse(source, {
    ecmaVersion: 'latest',
    sourceType: file.endsWith('.mjs') ? 'module' : 'script',
  });
}

export function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'raw'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

export function semanticDigest(tree) {
  return digest(
    JSON.stringify(tree, (key, value) =>
      ['start', 'end', 'loc', 'raw'].includes(key) ? undefined : value
    )
  );
}

export function indexMarkup(html) {
  return html
    .replace(/<script\b[^>]*>.*?<\/script>/gs, '')
    .replace(/<!--.*?-->/gs, '')
    .split('\n')
    .filter((line) => line.trim())
    .join('\n');
}

export function precacheFiles(worker) {
  const declaration = syntaxTree(worker).body.find(
    (node) =>
      node.type === 'VariableDeclaration' &&
      node.declarations.some((item) => item.id.name === 'SHELL_FILES')
  );
  return declaration.declarations
    .find((item) => item.id.name === 'SHELL_FILES')
    .init.elements.map((item) => item.value);
}

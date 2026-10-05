/*
 * Les chemins suivent le dossier du worker : /Jeu-du-duc/ sur GitHub Pages.
 * Le réseau est prioritaire pour TOUS les fichiers, même si le worker ne change
 * pas lors d'un futur commit. Le cache sert uniquement de secours hors ligne.
 */
const APP_ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = `jeu-du-duc-${encodeURIComponent(APP_ROOT.pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}2026-10-05-v8`;
const SHELL_FILES = [
  './',
  'manifest.webmanifest',
  'styles/main.css',
  'styles/undercover.css',
  'styles/home.css',
  'styles/pwa.css',
  'styles/questions.css',
  'styles/heads-up.css',
  'scripts/core/init.js',
  'scripts/core/history.js',
  'scripts/core/showQuestion.js',
  'scripts/app/undercover.js',
  'scripts/app/main-game.js',
  'scripts/app/heads-up.js',
  'scripts/pwa.js',
  'data/debut.text.js',
  'data/hardcore.text.js',
  'data/alcool.text.js',
  'data/culture.text.js',
  'data/culture.mcq.js',
  'data/rapidite.questions.js',
  'data/undercover.pairs.js',
  'data/heads.words.js',
  'image/icon.png',
  'image/duc-head.png',
  'image/home/hero.webp',
  'image/home/mascotte.webp',
  'image/home/undercover.webp',
  'image/home/apero.webp',
  'image/home/torgnole.webp',
  'image/home/culture.webp',
  'image/home/hardcore.webp',
  'image/home/lancer.webp',
  'image/home/personnalise.webp',
  'image/app/apple-touch-icon.png',
  'image/app/favicon-32.png',
  'image/app/icon-192.png',
  'image/app/icon-512.png',
  'image/app/icon-maskable-512.png',
  'fonts/Montserrat-500.ttf',
  'fonts/Montserrat-600.ttf',
  'fonts/Montserrat-700.ttf',
  'fonts/Montserrat-800.ttf',
  'fonts/Montserrat-900.ttf',
  'song/rapidite.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES.map((file) => new Request(new URL(file, APP_ROOT), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

function cacheKey(url) {
  const key = new URL(url);
  key.search = '';
  key.hash = '';
  if (key.pathname === new URL('index.html', APP_ROOT).pathname) return APP_ROOT.href;
  return key.href;
}

// Le cache HTTP du navigateur ne doit pas court-circuiter le worker lors du
// lancement suivant. CacheStorage garde le secours hors ligne séparément.
function browserResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.delete('Expires');
  headers.delete('Content-Encoding');
  headers.delete('Content-Length');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// L'audio utilise des requêtes partielles, y compris en mode avion.
async function offlineResponse(cached, range) {
  if (!range) return cached;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return cached;
  const bytes = await cached.arrayBuffer();
  const length = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
  if (start >= length || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } });
  }
  const headers = new Headers(cached.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function networkFirst(event) {
  const request = event.request;
  const key = cacheKey(request.url);
  const range = request.headers.get('range');
  const cachePromise = caches.open(CACHE_NAME).catch(() => null);
  const network = fetch(new Request(request, { cache: 'no-store' })).then(async (response) => {
    const cache = await cachePromise;
    if (cache && response.status === 200 && !range) {
      try {
        await cache.put(key, response.clone());
      } catch (error) {
        // Un stockage plein ne doit pas empêcher de jouer en ligne.
      }
    }
    return response;
  });
  // Si le réseau est lent, il continue à actualiser le cache en arrière-plan.
  event.waitUntil(network.then(() => undefined, () => undefined));
  const cache = await cachePromise;
  const cached = cache && await cache.match(key);
  if (!cached) return network;
  const fallback = offlineResponse(cached, range);
  let timeout;
  return Promise.race([
    network.catch(() => fallback),
    new Promise((resolve) => { timeout = setTimeout(() => resolve(fallback), 4000); }),
  ]).finally(() => clearTimeout(timeout));
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== APP_ROOT.origin
      || !url.pathname.startsWith(APP_ROOT.pathname) || url.href === self.location.href) return;
  event.respondWith(networkFirst(event).then(browserResponse));
});

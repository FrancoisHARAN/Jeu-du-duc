/*
 * Les chemins suivent le dossier du worker : /Jeu-du-duc/ sur GitHub Pages.
 * Le réseau est prioritaire pour TOUS les fichiers, même si le worker ne change
 * pas lors d'un futur commit. Le cache sert uniquement de secours hors ligne.
 */
const APP_ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = `jeu-du-duc-${encodeURIComponent(APP_ROOT.pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}2026-10-07-v57`;
const QUIZ_IMAGES_ORIGIN = 'https://quizimagescm.s3.eu-west-3.amazonaws.com';
const SHELL_FILES = [
  './',
  'manifest.webmanifest',
  'styles/main.css',
  'styles/undercover.css',
  'styles/home.css',
  'styles/pwa.css',
  'styles/questions.css',
  'styles/heads-up.css',
  'styles/players.css',
  'styles/geography.css',
  'styles/football.css',
  'styles/accounts.css',
  'vendor/supabase/supabase.js',
  'scripts/supabase-config.js',
  'scripts/core/participants.js',
  'scripts/core/cloud.js',
  'scripts/core/statistics.js',
  'scripts/app/accounts.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'scripts/core/init.js',
  'scripts/core/sound.js',
  'scripts/core/visual-feedback.js',
  'scripts/core/duel-physics.js',
  'scripts/core/duel-ball.js',
  'vendor/chess/chess.js',
  'scripts/core/chess-match.js',
  'scripts/core/chess-pieces.js',
  'scripts/app/chess.js',
  'styles/chess.css',
  'image/home/chess.webp',
  'scripts/app/duel-football.js',
  'styles/duel-football.css',
  'image/home/duel-football.webp',
  'image/duel/goal.webp',
  'styles/visual-feedback.css',
  'image/undercover/white-win.webp',
  'scripts/core/feedback-sounds.js',
  'scripts/core/history.js',
  'scripts/core/showQuestion.js',
  'scripts/core/picolo.js',
  'scripts/app/undercover.js',
  'scripts/app/main-game.js',
  'scripts/app/heads-up.js',
  'scripts/app/player-editor.js',
  'scripts/app/geography.js',
  'scripts/app/football.js',
  'scripts/pwa.js',
  'data/debut.text.js',
  'data/hardcore.text.js',
  'data/alcool.text.js',
  'data/picolo.cards.js',
  'data/culture.text.js',
  'data/culture.mcq.js',
  'data/culture.imported.js',
  'data/culture.quiz360.js',
  'data/culture.quiz360.images.json',
  'data/undercover.pairs.js',
  'data/heads.words.js',
  'data/heads.imported.js',
  'data/geography/countries.geojson',
  'data/geography/departments.geojson',
  'data/geography/cities.json',
  'data/geography/physical.json',
  'data/football.questions.json',
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
  'image/home/geography.webp',
  'image/geography/mega-win.webp',
  'image/home/football-quiz.webp',
  'image/app/apple-touch-icon-purple.png',
  'image/app/favicon-purple-32.png',
  'image/app/icon-purple-192.png',
  'image/app/icon-purple-512.png',
  'image/app/icon-purple-maskable-512.png',
  'fonts/Montserrat-500.ttf',
  'fonts/Montserrat-600.ttf',
  'fonts/Montserrat-700.ttf',
  'fonts/Montserrat-800.ttf',
  'fonts/Montserrat-900.ttf',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES.map((file) => new Request(new URL(file, APP_ROOT), { cache: 'no-cache' })));
    // Les photos Quiz360 sont livrées avec le jeu, même celles jamais consultées.
    const imageList = await cache.match(new URL('data/culture.quiz360.images.json', APP_ROOT));
    const images = await imageList.json();
    await cache.addAll(images.map((file) => new Request(new URL(file, APP_ROOT), { cache: 'no-cache' })));
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
  // une redirection (ou réponse opaque) de statut 0 ne peut pas être recréée : le navigateur la suit lui-même
  if (response.type === 'opaqueredirect' || response.type === 'opaque') return response;
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

async function networkFirst(event, allowOpaque = false) {
  const request = event.request;
  const key = cacheKey(request.url);
  const range = request.headers.get('range');
  const cachePromise = caches.open(CACHE_NAME).catch(() => null);
  // « no-cache » : le serveur est toujours interrogé, mais un fichier inchangé répond 304 sans être retéléchargé.
  const network = fetch(new Request(request, { cache: 'no-cache' })).then(async (response) => {
    const cache = await cachePromise;
    if (cache && (response.status === 200 || (allowOpaque && response.type === 'opaque')) && !range) {
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
  // Les photos du classeur sont externes : garder celles déjà consultées hors ligne.
  if (event.request.method === 'GET' && event.request.destination === 'image' && url.origin === QUIZ_IMAGES_ORIGIN) {
    event.respondWith(networkFirst(event, true));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== APP_ROOT.origin
      || !url.pathname.startsWith(APP_ROOT.pathname) || url.href === self.location.href) return;
  event.respondWith(networkFirst(event).then(browserResponse));
});

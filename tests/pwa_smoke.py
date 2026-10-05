#!/usr/bin/env python3
"""Integration PWA : Python, Playwright, Pillow et Chromium ; le dépôt reste intact."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from PIL import Image
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
CHROMIUM = os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium')
assert CHROMIUM, 'Chromium est nécessaire.'
manifest = json.loads((REPO / 'manifest.webmanifest').read_text())
assert manifest['name'] == manifest['short_name'] == 'Jeu du duc'
assert manifest['display'] == 'standalone'
assert manifest['scope'] == manifest['start_url'] == manifest['id'] == './'
for icon in manifest['icons']:
    with Image.open(REPO / icon['src']) as im:
        assert icon['sizes'] == f'{im.width}x{im.height}'
        assert im.mode == 'RGB', 'Les icônes installées doivent avoir un fond opaque.'
with Image.open(REPO / 'image/app/apple-touch-icon.png') as im:
    assert im.size == (180, 180) and im.mode == 'RGB'
with Image.open(REPO / 'image/app/duc-cutout.png') as im:
    assert im.mode == 'RGBA' and im.getextrema()[3][0] == 0
with Image.open(REPO / 'image/app/icon-maskable-512.png') as im:
    bg = im.getpixel((0, 0))
    for y in range(im.height):
        for x in range(im.width):
            if (x - 256) ** 2 + (y - 256) ** 2 > (512 * .4) ** 2:
                assert im.getpixel((x, y)) == bg, 'Le dessin déborde de la zone maskable.'
print('PASS: manifest, noms sans emoji, tailles PNG, détourage et zone maskable', flush=True)

with tempfile.TemporaryDirectory(prefix='jdd-pwa-') as tmp:
    site = Path(tmp) / 'site'
    shutil.copytree(REPO, site, ignore=shutil.ignore_patterns('.git', 'tests', '__pycache__'))

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(site), **kwargs)

        def translate_path(self, path):
            if path.startswith('/Jeu-du-duc/'):
                path = path[len('/Jeu-du-duc'):]
            return super().translate_path(path)

        def end_headers(self):
            # Une longue durée de cache HTTP révèle les mises à jour mal conçues.
            self.send_header('Cache-Control', 'public, max-age=86400')
            super().end_headers()

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    base = origin + '/Jeu-du-duc/'
    errors = []

    with sync_playwright() as pw:
        context = pw.chromium.launch_persistent_context(
            user_data_dir=str(Path(tmp) / 'profile'), executable_path=CHROMIUM, headless=True,
            viewport={'width': 393, 'height': 852}, is_mobile=True, has_touch=True,
        )
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.set_default_timeout(30000)

        def wait_async(expression, arg):
            # Attendre le résultat booléen des opérations CacheStorage.
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if page.evaluate(expression, arg):
                    return
                page.wait_for_timeout(100)
            raise AssertionError('Etat asynchrone non atteint : ' + expression)

        page.goto(base, wait_until='load')
        expect(page).to_have_title('Jeu du duc')
        assert page.locator('meta[name="apple-mobile-web-app-title"]').get_attribute('content') == 'Jeu du duc'
        assert page.locator('meta[name="apple-mobile-web-app-capable"]').get_attribute('content') == 'yes'
        assert page.locator('meta[name="viewport"]').get_attribute('content').endswith('viewport-fit=cover')
        apple = page.locator('link[rel="apple-touch-icon"]').evaluate('el => el.href')
        assert apple.startswith(base + 'image/app/')
        assert (context.request.get(apple)).status == 200
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        hero = page.locator('.home-hero').bounding_box()
        uc = page.locator('#undercoverBtn').bounding_box()
        players = page.locator('.home-players').bounding_box()
        heads = page.locator('#headsBtn').bounding_box()
        assert hero['y'] + hero['height'] <= uc['y'] < heads['y'] < players['y']
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        registration = page.evaluate('''async () => {
          const reg = await navigator.serviceWorker.ready;
          return {scope: reg.scope, state: reg.active.state, updateViaCache: reg.updateViaCache};
        }''')
        assert registration == {'scope': base, 'state': 'activated', 'updateViaCache': 'none'}, registration
        cdp = context.new_cdp_session(page)
        parsed = cdp.send('Page.getAppManifest')
        assert not parsed['errors'], parsed
        assert parsed['url'] == base + 'manifest.webmanifest'
        assert json.loads(parsed['data']) == manifest
        install_errors = cdp.send('Page.getInstallabilityErrors')['installabilityErrors']
        assert not install_errors, install_errors
        print('PASS: métadonnées iPhone, critères d’installation Chromium, worker actif sous /Jeu-du-duc/', flush=True)

        prefix = 'jeu-du-duc-%2FJeu-du-duc%2F-'
        cache = next(name for name in page.evaluate('caches.keys()') if name.startswith(prefix))
        shell = page.evaluate('''async name => {
          const cache = await caches.open(name);
          return (await cache.keys()).map(r => r.url);
        }''', cache)
        assert len(shell) == 45, (len(shell), shell)
        assert base + 'styles/questions.css' in shell
        for file in ['styles/heads-up.css', 'scripts/app/heads-up.js', 'data/heads.words.js']:
            assert base + file in shell
        assert all(url.startswith(base) for url in shell)
        for name in ['Alice', 'Bob', 'Chloe']:
            page.locator('#playerInput').fill(name)
            page.locator('#addBtn').click()
        assert page.evaluate("JSON.parse(localStorage.getItem('jdd.players'))") == ['Alice', 'Bob', 'Chloe']

        context.set_offline(True)
        page.goto(base + 'index.html?offline=1', wait_until='load')
        expect(page.locator('.player-item')).to_have_count(3)
        counts = page.evaluate('''() => ({...Object.fromEntries(Object.entries(JDD.DATA).map(([k,v])=>[k,v.length])),
          undercover:JDD.UNDERCOVER_PAIRS.length, rapidity:JDD.RAPIDITY.length})''')
        assert all(count > 0 for count in counts.values()), counts
        page.evaluate('''async () => {
          await Promise.all([...document.images].map(async img => {img.loading='eager'; await img.decode();}));
          await document.fonts.ready;
        }''')
        assert page.evaluate("document.fonts.check('900 16px Montserrat')")
        audio = page.evaluate('''async () => {
          const response = await fetch('song/rapidite.mp3', {headers:{Range:'bytes=0-31'}});
          return {status:response.status, range:response.headers.get('Content-Range'), bytes:[...new Uint8Array(await response.arrayBuffer())]};
        }''')
        expected_audio = (site / 'song/rapidite.mp3').read_bytes()
        assert audio['status'] == 206
        assert audio['range'] == f'bytes 0-31/{len(expected_audio)}'
        assert audio['bytes'] == list(expected_audio[:32])
        page.locator('#headsBtn').click()
        assert page.evaluate('JDD.HEADS_DECKS.reduce((n, d) => n + d.words.length, 0)') == 420
        page.locator('input[name="hu-controls"][value="buttons"]').check()
        page.locator('#hu-start').click()
        page.locator('[data-act="countdown"]').click()
        expect(page.locator('#heads')).to_have_attribute('data-screen', 'playing')
        expect(page.locator('#hu-word')).not_to_be_empty()
        page.locator('[data-act="correct"]').click()
        expect(page.locator('#hu-points')).to_have_text('1')
        page.locator('[data-act="pause"]').click()
        page.locator('#heads [data-act="exit"]').click()
        expect(page.locator('#setup')).to_be_visible()
        for mode in ['debut', 'hardcore', 'alcool', 'culture', 'custom']:
            page.locator(f'[data-mode="{mode}"]').click()
            page.locator('#startBtn').click()
            expect(page.locator('#game')).to_be_visible()
            assert page.locator('#currentQuestion').inner_text().strip()
            page.locator('#backLogo').click()
        page.locator('#undercoverBtn').click()
        expect(page.locator('#undercover')).to_be_visible()
        page.locator('[data-act="exit-app"]').click()
        assert not errors, errors
        print('PASS: mode avion, index.html et paramètres, 5 modes, Undercover, Devine Tête, images, polices et audio partiel', flush=True)

        context.set_offline(False)
        # Une mise à jour de HTML/CSS/JS/données doit fonctionner sans changer le worker.
        worker_hash = hashlib.sha256((site / 'service-worker.js').read_bytes()).hexdigest()
        html = site / 'index.html'
        html.write_text(html.read_text().replace('</head>', '<meta name="test-release" content="v2"></head>'))
        css = site / 'styles/home.css'
        css.write_text(css.read_text() + '\n#setup { --test-release: v2; }\n')
        js = site / 'scripts/core/init.js'
        js.write_text(js.read_text() + '\nwindow.testRelease = "v2";\n')
        data = site / 'data/culture.text.js'
        data.write_text(data.read_text() + '\nwindow.testDataRelease = "v2";\n')
        page.reload(wait_until='load')
        expect(page.locator('meta[name="test-release"]')).to_have_attribute('content', 'v2')
        css_release = page.evaluate("getComputedStyle(document.getElementById('setup')).getPropertyValue('--test-release').trim()")
        assert css_release == 'v2', {'css': css_release, 'js': page.evaluate('window.testRelease'), 'data': page.evaluate('window.testDataRelease')}
        assert page.evaluate('testRelease') == page.evaluate('testDataRelease') == 'v2'
        assert hashlib.sha256((site / 'service-worker.js').read_bytes()).hexdigest() == worker_hash
        print('PASS: retour en ligne et nouveaux HTML/CSS/JS/questions malgré le cache HTTP, sans modifier le worker', flush=True)

        html_hash = hashlib.sha256(html.read_bytes()).hexdigest()
        css.write_text(css.read_text().replace('--test-release: v2', '--test-release: v3'))
        page.reload(wait_until='load')
        assert page.evaluate("getComputedStyle(document.getElementById('setup')).getPropertyValue('--test-release').trim()") == 'v3'
        js.write_text(js.read_text().replace('window.testRelease = "v2"', 'window.testRelease = "v3"'))
        data.write_text(data.read_text().replace('window.testDataRelease = "v2"', 'window.testDataRelease = "v3"'))
        page.reload(wait_until='load')
        assert page.evaluate('testRelease') == page.evaluate('testDataRelease') == 'v3'
        assert hashlib.sha256(html.read_bytes()).hexdigest() == html_hash
        assert hashlib.sha256((site / 'service-worker.js').read_bytes()).hexdigest() == worker_hash
        print('PASS: CSS seul puis scripts/questions seuls actualisés sans modifier index.html ni le worker', flush=True)

        # Les nouvelles réponses doivent aussi remplacer la version hors ligne.
        wait_async('''async name => {
          const cache=await caches.open(name);
          const response=await cache.match(new URL('scripts/core/init.js', location.href).href);
          return response && (await response.text()).includes('window.testRelease = "v3"');
        }''', cache)
        context.set_offline(True)
        page.goto(base, wait_until='load')
        assert page.evaluate('testRelease') == page.evaluate('testDataRelease') == 'v3'
        expect(page.locator('meta[name="test-release"]')).to_have_attribute('content', 'v2')
        context.set_offline(False)
        print('PASS: la nouvelle version est conservée pour le prochain lancement hors ligne', flush=True)

        # Une nouvelle version du worker nettoie seulement les caches de ce projet.
        await_names = page.evaluate('''async prefix => {
          await caches.open(prefix + 'ancien'); await caches.open('autre-site-a-conserver');
          return caches.keys();
        }''', prefix)
        page.locator('#startBtn').click()
        expect(page.locator('#game')).to_be_visible()
        question = page.locator('#currentQuestion').inner_text()
        sw = site / 'service-worker.js'
        sw.write_text(re.sub(r'(const CACHE_NAME = `[^`]+)(`;)', r'\1-test-update\2', sw.read_text(), count=1))
        page.evaluate('async () => (await navigator.serviceWorker.ready).update()')
        wait_async('''async old => {
          const names=await caches.keys();
          const reg=await navigator.serviceWorker.ready;
          return !names.includes(old) && names.some(n=>n.endsWith('-test-update')) && reg.active.state === 'activated';
        }''', cache)
        expect(page.locator('#game')).to_be_visible()
        expect(page.locator('#currentQuestion')).to_have_text(question)
        names = page.evaluate('caches.keys()')
        assert prefix + 'ancien' not in names and 'autre-site-a-conserver' in names, names
        page.locator('#backLogo').click()
        expect(page.locator('#setup')).to_be_visible()
        expect(page.locator('.player-item')).to_have_count(3)
        print('PASS: nouveau worker, anciens caches supprimés, autres sites préservés, partie non interrompue et joueurs conservés', flush=True)

        # La même application fonctionne également à la racine d'un hébergement.
        root_context = pw.chromium.launch_persistent_context(
            user_data_dir=str(Path(tmp) / 'root-profile'), executable_path=CHROMIUM, headless=True,
        )
        root_page = root_context.new_page()
        root_page.goto(origin + '/', wait_until='load')
        root_page.wait_for_function('navigator.serviceWorker.controller !== null')
        assert root_page.evaluate('async () => (await navigator.serviceWorker.ready).scope') == origin + '/'
        assert not errors, errors
        root_context.close()
        context.close()
        print('PASS: chemins à la racine et en sous-dossier, aucune erreur JavaScript', flush=True)
    server.shutdown()

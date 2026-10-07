#!/usr/bin/env python3
"""Integration PWA : Python, Playwright, Pillow et Chromium ; le dépôt reste intact."""
import hashlib
import io
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
        for corner in [(0, 0), (im.width - 1, 0), (0, im.height - 1), (im.width - 1, im.height - 1)]:
            red, green, blue = im.getpixel(corner)
            assert blue > red + 60 and blue > green + 60, 'Le violet doit couvrir les coins, sans cadre extérieur.'
with Image.open(REPO / 'image/app/apple-touch-icon-purple.png') as im:
    assert im.size == (180, 180) and im.mode == 'RGB'
    for corner in [(0, 0), (179, 0), (0, 179), (179, 179)]:
        red, green, blue = im.getpixel(corner)
        assert blue > red + 60 and blue > green + 60, 'L’icône iPhone doit avoir son fond violet entier.'
with Image.open(REPO / 'image/app/duc-cutout.png') as im:
    assert im.mode == 'RGBA' and im.getextrema()[3][0] == 0
with Image.open(REPO / 'image/app/icon-purple-maskable-512.png') as im:
    for y in range(im.height):
        for x in range(im.width):
            if (x - 256) ** 2 + (y - 256) ** 2 > (512 * .4) ** 2:
                red, green, blue = im.getpixel((x, y))
                assert blue > red + 60 and blue > green + 60, 'Le dessin déborde de la zone maskable.'
print('PASS: manifest, noms sans emoji, tailles PNG, fonds violets sans cadre et zone maskable', flush=True)

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

        def send_head(self):
            # ETag calculé sur le contenu, comme GitHub Pages et Vercel : le worker revalide
            # chaque fichier (304 s'il est inchangé), même modifié deux fois dans la même seconde.
            path = self.translate_path(self.path)
            self._etag = None
            if os.path.isfile(path):
                self._etag = '"' + hashlib.sha1(Path(path).read_bytes()).hexdigest() + '"'
                if self.headers.get('If-None-Match') == self._etag:
                    self.send_response(304)
                    self.end_headers()
                    return None
            # La date de modification n'a qu'une précision d'une seconde : le test modifie
            # des fichiers plus vite que ça, seule l'empreinte du contenu fait foi.
            del self.headers['If-Modified-Since']
            return super().send_head()

        def end_headers(self):
            # Une longue durée de cache HTTP révèle les mises à jour mal conçues.
            self.send_header('Cache-Control', 'public, max-age=86400')
            if getattr(self, '_etag', None):
                self.send_header('ETag', self._etag)
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
        page.on('console', lambda message: errors.append(f"{message.text} ({message.location.get('url', '')})") if message.type == 'error' else None)
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
        assert hero['y'] + hero['height'] <= players['y'] < uc['y'] < heads['y']
        page.wait_for_function('() => navigator.serviceWorker.controller !== null')
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
        quiz360_images = json.loads((site / 'data/culture.quiz360.images.json').read_text())
        flag_images = json.loads((site / 'data/culture.flags.images.json').read_text())
        assert len(shell) == 94 + len(quiz360_images) + len(flag_images), len(shell)
        for file in ['data/culture.flags.js', 'data/culture.flags.images.json',
                     'scripts/core/culture-flags.js', 'scripts/app/culture-flags.js', *flag_images]:
            assert base + file in shell
        assert not any(url.endswith(('/data/rapidite.questions.js', '/song/rapidite.mp3')) for url in shell)
        for file in ['styles/accounts.css','vendor/supabase/supabase.js','scripts/supabase-config.js',
                     'scripts/core/participants.js','scripts/core/cloud.js','scripts/app/accounts.js']:
            assert any(url.endswith('/' + file) for url in shell), file
        for file in ['data/culture.quiz360.js', 'data/culture.quiz360.images.json', *quiz360_images]:
            assert base + file in shell
        assert base + 'scripts/core/statistics.js' in shell
        for file in ['vendor/chess/chess.js', 'scripts/core/chess-match.js', 'scripts/core/chess-pieces.js', 'scripts/app/chess.js', 'styles/chess.css', 'image/home/chess.webp', 'image/chess/checkmate.webp']:
            assert base + file in shell
        for file in ['scripts/core/duel-physics.js', 'scripts/core/duel-ball.js', 'scripts/app/duel-football.js', 'styles/duel-football.css', 'image/home/duel-football.webp', 'image/duel/goal.webp']:
            assert base + file in shell
        assert base + 'styles/questions.css' in shell
        assert base + 'data/culture.imported.js' in shell
        for file in ['scripts/core/sound.js', 'scripts/core/feedback-sounds.js', 'scripts/core/visual-feedback.js', 'styles/visual-feedback.css', 'image/undercover/white-win.webp', 'styles/heads-up.css', 'scripts/app/heads-up.js', 'data/heads.words.js', 'data/heads.imported.js',
                     'scripts/app/player-editor.js', 'styles/players.css', 'scripts/app/geography.js',
                     'styles/geography.css', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
                     'data/geography/countries.geojson', 'data/geography/departments.geojson',
                     'data/geography/cities.json', 'data/geography/physical.json', 'image/home/geography.webp', 'image/geography/mega-win.webp', 'styles/football.css',
                     'scripts/app/football.js', 'data/football.questions.json', 'image/home/football-quiz.webp']:
            assert base + file in shell
        assert all(url.startswith(base) for url in shell)
        for name in ['Alice', 'Bob', 'Chloe']:
            page.locator('#playerInput').fill(name)
            page.locator('#addBtn').click()
        assert page.evaluate("JSON.parse(localStorage.getItem('jdd.players'))") == ['Alice', 'Bob', 'Chloe']

        # Contrôler le cache des photos externes avec une vraie image de test,
        # sans dépendre du serveur indiqué dans le classeur.
        fixture = io.BytesIO()
        Image.new('RGB', (240, 160), '#a7d5bc').save(fixture, format='PNG')
        context.route('https://quizimagescm.s3.eu-west-3.amazonaws.com/**',
                      lambda route: route.fulfill(content_type='image/png', body=fixture.getvalue(),
                                                  headers={'Cache-Control': 'no-store'}))
        image_urls = page.evaluate('''() => {
          const bank = JDD.DATA.cultureMcq;
          return [bank.find(q => q.image).image, bank.find(q => q.choiceImages).choiceImages[0]];
        }''')
        load_images = '''async urls => Promise.all(urls.map(url => new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image.naturalWidth);
          image.onerror = () => reject(new Error('Image indisponible : ' + url));
          image.src = url;
        })))'''
        assert page.evaluate(load_images, image_urls) == [240, 240]
        for url in image_urls:
            wait_async('''async ({name, url}) => Boolean(await (await caches.open(name)).match(url))''',
                       {'name': cache, 'url': url})
        context.unroute('https://quizimagescm.s3.eu-west-3.amazonaws.com/**')

        context.set_offline(True)
        page.goto(base + 'index.html?offline=1', wait_until='load')
        assert page.evaluate(load_images, [url + '?offline-check=1' for url in image_urls]) == [240, 240]
        assert page.evaluate(load_images, [base+'image/geography/mega-win.webp']) == [768]
        imported = page.evaluate('JDD.DATA.cultureMcq.filter(q => q.id && q.id.startsWith("classeur-")).length')
        assert imported == 7632, imported
        pending = json.loads((site / 'data/culture.quiz360.review.json').read_text())
        imported_quiz360 = page.evaluate('JDD.DATA.cultureMcq.filter(q => q.id && q.id.startsWith("quiz360-")).length')
        assert imported_quiz360 + len(pending) == 6950, imported_quiz360
        # Même les photos jamais vues doivent être disponibles en mode avion.
        assert all(width > 0 for width in page.evaluate(load_images, quiz360_images))
        assert all(width > 0 for width in page.evaluate(load_images, flag_images))
        assert page.evaluate('JDD.DATA.cultureMcq.filter(q => q.flagKind).length') == 1602
        offline_flag = page.evaluate('JDD.DATA.cultureMcq.find(q => q.id === "drapeaux-map-fr")')
        expect(page.locator('#questionMediaStatus')).to_be_hidden()
        quiz360_question = page.evaluate('JDD.DATA.cultureMcq.find(q => q.id === "quiz360-1")')
        # Les autres photos n'ont pas encore été vues : les questions sans photo
        # permettent de vérifier les modes hors ligne sans requête externe aléatoire.
        page.evaluate('JDD.DATA.cultureMcq = JDD.DATA.cultureMcq.filter(q => !q.image && !q.choiceImages && !q.flagKind)')
        print(f'PASS: 7 632 anciennes et {imported_quiz360} nouvelles questions hors ligne ; les 336 images locales sont toutes disponibles', flush=True)
        expect(page.locator('.player-item')).to_have_count(3)
        counts = page.evaluate('''() => ({...Object.fromEntries(Object.entries(JDD.DATA).map(([k,v])=>[k,v.length])),
          undercover:JDD.UNDERCOVER_PAIRS.length})''')
        assert all(count > 0 for count in counts.values()), counts
        page.evaluate('''q => {
          window.originalCulture = JDD.DATA.culture; JDD.DATA.culture = [];
          window.offlineQuiz360 = q;
          window.originalDrawCard = JDD.drawCard; JDD.drawCard = () => offlineQuiz360;
        }''', quiz360_question)
        page.evaluate('''async () => {
          await Promise.all([...document.images].map(async img => {img.loading='eager'; await img.decode();}));
          await document.fonts.ready;
        }''')
        assert page.evaluate("document.fonts.check('900 16px Montserrat')")
        for name in ['Alice', 'Bob', 'Chloe']:
            page.locator(f'#playerList button[aria-label="Retirer {name}"]').click()
        page.locator('[data-mode="culture"]').click()
        page.locator('#startBtn').click()
        expect(page.locator('#playersDialog')).to_be_visible()
        page.locator('#dialogPlayerInput').fill('Alice')
        page.locator('#dialogStartBtn').click()
        expect(page.locator('#game')).to_be_visible()
        expect(page.locator('#questionMedia img')).to_be_visible()
        assert page.locator('#questionMedia img').evaluate('img => img.naturalWidth > 0')
        expect(page.locator('.mcq-btn').first).to_be_enabled()
        page.get_by_role('button', name=quiz360_question['choices'][0], exact=True).click()
        expect(page.locator('.mcq-correct')).to_have_count(1)
        page.evaluate('q => { offlineQuiz360 = q; }', offline_flag)
        page.locator('.game-next-hint').dispatch_event('click', {'clientX': 392})
        expect(page.locator('.mcq-btn').first).to_be_enabled()
        assert page.locator('#questionMedia img').evaluate('img => img.naturalWidth === 1024')
        choices = page.locator('#mcqGrid img').evaluate_all('images => images.map(img => img.getAttribute("src"))')
        page.locator('.mcq-btn').nth(choices.index('image/culture/drapeaux/flags/fr.png')).click()
        expect(page.locator('.mcq-correct')).to_have_count(1)
        print('PASS: 1 602 questions Drapeaux, 458 images jamais vues en cache et carte → drapeau jouable hors ligne', flush=True)
        page.evaluate('() => { JDD.drawCard = originalDrawCard; JDD.DATA.culture = originalCulture; }')
        page.locator('#backLogo').click()
        for name in ['Bob', 'Chloe']:
            page.locator('#playerInput').fill(name)
            page.locator('#addBtn').click()
        print('PASS: ajout de joueurs et lancement depuis le popup en mode avion', flush=True)
        page.evaluate('''() => {
          window.offlineFeedback = [];
          const start = AudioBufferSourceNode.prototype.start;
          AudioBufferSourceNode.prototype.start = function(...args) {
            if (this.buffer) {
              const data = this.buffer.getChannelData(0);
              offlineFeedback.push({duration: this.buffer.duration,
                energy: data.reduce((sum, sample) => sum + sample * sample, 0)});
            }
            return start.apply(this, args);
          };
        }''')
        page.locator('#headsBtn').click()
        assert page.evaluate('JDD.HEADS_DECKS.reduce((n, d) => n + d.words.length, 0)') == 1681
        page.locator('#hu-start').click()
        page.locator('#heads [data-act="buttons"], #heads [data-act="countdown"]').click()
        expect(page.locator('#heads')).to_have_attribute('data-screen', 'playing')
        assert page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).active.pool.length") == 1681
        expect(page.locator('#hu-word')).not_to_be_empty()
        page.locator('[data-act="correct"]').click()
        expect(page.locator('#hu-points')).to_have_text('1')
        expect(page.locator('[data-act="pass"]')).to_be_enabled()
        page.locator('[data-act="pass"]').click()
        feedback = page.evaluate('offlineFeedback')
        assert len(feedback) == 2 and all(sound['energy'] > 0 for sound in feedback), feedback
        assert feedback[0]['duration'] != feedback[1]['duration'], feedback
        page.locator('[data-act="pause"]').click()
        page.locator('#heads [data-act="exit"]').click()
        # Les cartes et leurs données sont locales : les trois jeux marchent en mode avion.
        page.evaluate('''() => { const create=L.map;
          L.map=(...args)=>{window.offlineGeoMap=create(...args);return offlineGeoMap;}; }''')
        for mode, expected in [('cities', 242), ('countries', 242), ('departments', 96)]:
            if mode == 'departments':
                page.evaluate('''() => {window.offlineGeoShuffle=JDD.shuffle;
                  JDD.shuffle=list=>offlineGeoShuffle(list).sort((a,b)=>(b.id==='75')-(a.id==='75'));}''')
            page.locator('#geographyBtn').click()
            page.locator(f'[data-geo-mode="{mode}"]').click()
            page.locator('[data-geo="start"]').click()
            expect(page.locator('#geography')).to_have_attribute('data-screen', 'playing')
            assert page.locator('#geo-map path.leaflet-interactive').count() == expected
            assert page.locator('.geo-river-line').count() > 0
            assert page.locator('.geo-relief-shape').count() > 0
            if mode == 'cities':
                page.evaluate('''() => { const match=JSON.parse(localStorage.getItem('jdd.geography.v1'));
                  const city=match.targets[match.index],point=L.latLng(city.lat,city.lng);
                  offlineGeoMap.setView(point,9,{animate:false});
                  offlineGeoMap.fire('click',{latlng:point});
                }''')
                # Le visuel préchargé est disponible même sans jamais avoir gagné auparavant.
                page.wait_for_function('() => document.querySelector(".geo-mega-win-art").complete && document.querySelector(".geo-mega-win-art").naturalWidth===768')
                page.locator('[data-geo="validate"]').click()
                expect(page.locator('#geography')).to_have_attribute('data-screen', 'answer')
                assert page.locator('.geo-pin--truth').count() == 1
                expect(page.locator('#geo-mega-win')).to_be_visible()
            if mode == 'departments':
                page.evaluate('''() => {
                  const match=JSON.parse(localStorage.getItem('jdd.geography.v1'));
                  if(match.targets[0].id!=='75')throw new Error('Paris attendu');
                  offlineGeoMap.eachLayer(layer=>{
                    if(layer.feature?.properties.code==='92')layer.fire('click',{});
                  });
                }''')
                page.locator('[data-geo="validate"]').click()
                expect(page.locator('#geography')).to_have_attribute('data-screen', 'answer')
                result=page.evaluate('JSON.parse(localStorage.getItem("jdd.geography.v1")).result')
                assert result['neighbor'] and result['points']==250 and not result['correct']
                expect(page.locator('#geo-result')).to_contain_text('+250 pts')
                page.evaluate('() => {JDD.shuffle=offlineGeoShuffle;}')
            page.locator('[data-geo="exit"]').click()
        print('PASS: trois cartes vectorielles, données et score limitrophe de 250 pts hors connexion', flush=True)
        # Banque du classeur, chacun pour soi et équipes disponibles en mode avion.
        page.evaluate('window.footNow=Date.now;window.footOffset=0;Date.now=()=>footNow()+footOffset')
        for format in ['individual', 'teams']:
            page.locator('#footballBtn').click()
            expect(page.locator('#football')).to_have_attribute('data-screen', 'setup')
            assert page.locator('[name="foot-mode"], [name="foot-rounds"]').count()==0
            page.locator(f'[name="foot-format"][value="{format}"]').check()
            if format=='teams': expect(page.locator('.foot-team-table')).to_have_count(2)
            page.locator('[data-foot="start"]').click()
            match=page.evaluate('JSON.parse(localStorage.getItem("jdd.football.v2"))')
            assert match['mode']=='classic' and match['rounds']==1
            for camp in range(match['totalRounds']):
                page.locator('[data-foot="begin"]').click()
                expect(page.locator('#football')).to_have_attribute('data-screen', 'playing')
                assert page.locator('.foot-question').inner_text().strip()
                assert page.locator('.foot-answer').inner_text().strip()
                page.locator('[data-foot="correct"]').click()
                expect(page.locator('#football')).to_have_attribute('data-screen', 'feedback')
                expect(page.locator('#football')).to_have_attribute('data-screen', 'playing')
                page.evaluate('footOffset+=61000')
                expect(page.locator('#football')).to_have_attribute('data-screen', 'results' if camp==match['totalRounds']-1 else 'round-end')
                if camp<match['totalRounds']-1: page.locator('[data-foot="next"]').click()
            page.locator('[data-foot="var"]').click()
            page.locator('[data-foot-review="'+str(match['totalRounds']-1)+'"][data-result="wrong"]').click()
            scores=page.evaluate('JSON.parse(localStorage.getItem("jdd.football.v2")).scores')
            assert scores==[1]*(match['totalRounds']-1)+[0]
            page.locator('[data-foot="close-var"]').click()
            page.locator('[data-foot="exit"]').click()
        page.evaluate('Date.now=footNow')
        print('PASS: quiz foot chacun pour soi et équipes, un seul tour, chrono, scores et VAR hors connexion', flush=True)
        page.locator('#duelBtn').click()
        expect(page.locator('#duel')).to_have_attribute('data-screen', 'setup')
        assert page.locator('.duel-formations label').count() == 6
        page.locator('[data-duel="start"]').click()
        duel = page.evaluate('JSON.parse(localStorage.getItem("jdd.duel-football.v1"))')
        assert len(duel['physics']['bodies']) == 13
        canvas = page.locator('#duel-canvas').bounding_box()
        pion = duel['physics']['bodies'][duel['physics']['turn']*5]
        x = canvas['x'] + 2 + pion['x'] * (canvas['width'] - 4) / 400
        y = canvas['y'] + 2 + pion['y'] * (canvas['height'] - 4) / 680
        page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x, y - 90); page.mouse.up()
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'moving')
        page.locator('[data-duel="pause"]').click()
        duel = page.evaluate('JSON.parse(localStorage.getItem("jdd.duel-football.v1"))')
        page.reload(wait_until='load'); page.locator('#duelBtn').click(); page.locator('[data-duel="resume"]').click()
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        assert page.evaluate('JSON.parse(localStorage.getItem("jdd.duel-football.v1")).players') == duel['players']
        page.add_init_script("{const fixture=sessionStorage.getItem('duel-offline-goal');if(fixture){localStorage.setItem('jdd.duel-football.v1',fixture);sessionStorage.removeItem('duel-offline-goal');}}")
        page.evaluate('''() => {
            const m=JSON.parse(localStorage.getItem('jdd.duel-football.v1'));
            const s=m.physics=JDDDuelPhysics.create(m.physics.formations,0);
            s.scores=[2,0];
            s.bodies.slice(0,10).forEach((p,i)=>{p.x=i<5?52:348;p.y=130+i%5*105;});
            s.bodies[10].x=166;s.bodies[11].x=234;
            Object.assign(s.bodies[0],{x:200,y:120});Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:200,y:82});
            sessionStorage.setItem('duel-offline-goal',JSON.stringify(m));
        }''')
        page.reload(wait_until='load'); page.locator('#duelBtn').click(); page.locator('[data-duel="resume"]').click()
        canvas = page.locator('#duel-canvas').bounding_box()
        x=canvas['x']+2+200*(canvas['width']-4)/400
        y=canvas['y']+2+120*(canvas['height']-4)/680
        page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+90);page.mouse.up()
        expect(page.locator('#duel .jdd-celebration')).to_be_visible()
        assert page.locator('#duel .jdd-celebration img').evaluate('n=>n.complete&&n.naturalWidth>0')
        expect(page.locator('#duel')).to_have_attribute('data-phase','finished')
        expect(page.locator('#duel .jdd-celebration')).to_have_count(0)
        page.locator('[data-duel="exit"]').click()
        print('PASS: Duel Foot, gardiens, tir physique, reprise et célébration de but en mode avion', flush=True)
        expect(page.locator('#setup')).to_be_visible()
        page.locator('#chessBtn').click()
        assert page.locator('.chess-intro img').evaluate('n=>n.complete&&n.naturalWidth>0')
        page.locator('input[name="chess-minutes"][value="2"]').check()
        page.locator('[data-chess="start"]').click()
        expect(page.locator('#chess')).to_have_attribute('data-phase','playing')
        page.locator('[data-square="e2"]').click();page.locator('[data-square="e4"]').click()
        chess = page.evaluate('JSON.parse(localStorage.getItem("jdd.chess.v1"))')
        assert chess['moves']==[{'from':'e2','to':'e4'}] and chess['minutes']==2
        page.locator('.chess-toolbar [data-chess="exit"]').click()
        page.reload(wait_until='load');page.locator('#chessBtn').click();page.locator('[data-chess="resume"]').click()
        assert page.evaluate('JSON.parse(localStorage.getItem("jdd.chess.v1")).fen')==chess['fen']
        page.locator('[data-square="e7"]').click();page.locator('[data-square="e5"]').click()
        assert len(page.evaluate('JSON.parse(localStorage.getItem("jdd.chess.v1")).moves'))==2
        context.add_init_script('''const chessFixture=sessionStorage.getItem('pwa-chess-fixture');
            if(chessFixture){localStorage.setItem('jdd.chess.v1',chessFixture);sessionStorage.removeItem('pwa-chess-fixture');}''')
        page.evaluate('''() => {
            const old=JSON.parse(localStorage.getItem('jdd.chess.v1'));
            const match=JDDChessMatch.create(old.players,old.minutes,0,Date.now(),'7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
            JDDChessMatch.pause(match);sessionStorage.setItem('pwa-chess-fixture',JSON.stringify(JDDChessMatch.snapshot(match)));
        }''')
        page.reload(wait_until='load');page.locator('#chessBtn').click();page.locator('[data-chess="resume"]').click()
        page.locator('[data-square="f7"]').click();page.locator('[data-square="g7"]').click()
        expect(page.locator('#chess .jdd-celebration')).to_be_visible()
        assert page.locator('#chess .jdd-celebration-art').evaluate('n=>n.complete&&n.naturalWidth>0')
        assert page.evaluate('JSON.parse(localStorage.getItem("jdd.chess.v1")).result.kind')=='mate'
        expect(page.locator('#chess .jdd-celebration')).to_have_count(0,timeout=2800)
        page.locator('.chess-toolbar [data-chess="exit"]').click()
        print('PASS: Échecs, pièces vectorielles, horloges, reprise et célébration de mat en mode avion',flush=True)
        # Les reprises ont rechargé la banque ; garder les questions sans
        # photo distante pour ce contrôle des modes, comme au début du test.
        page.evaluate('JDD.DATA.cultureMcq = JDD.DATA.cultureMcq.filter(q => !q.image && !q.choiceImages && !q.flagKind)')
        # Ce tirage déclenchait auparavant une carte de rapidité à chaque question.
        page.evaluate('() => { window.savedRandom = Math.random; Math.random = () => 0; }')
        for mode in ['debut', 'hardcore', 'alcool', 'culture', 'custom']:
            page.locator(f'[data-mode="{mode}"]').click()
            page.locator('#startBtn').click()
            expect(page.locator('#game')).to_be_visible()
            for _ in range(3):
                assert page.locator('#currentQuestion').inner_text().strip()
                assert page.locator('#game').get_attribute('data-category') in ['debut', 'hardcore', 'alcool', 'culture']
                assert page.locator('#typeBox').inner_text() != 'RAPIDITÉ'
                page.locator('.game-next-hint').click()
            page.locator('#backLogo').click()
        page.locator('#undercoverBtn').click()
        expect(page.locator('#undercover')).to_be_visible()
        page.locator('[data-act="exit-app"]').click()
        assert not errors, errors
        page.evaluate('() => { Math.random = savedRandom; }')
        print('PASS: mode avion, 5 modes sans Rapidité, Undercover, Devine Tête et ses 2 sons, images et polices', flush=True)
        page.locator('#soundToggle').click()
        page.reload(wait_until='load')
        expect(page.locator('#soundToggle')).to_have_attribute('aria-pressed','false')
        expect(page.locator('[data-sound-icon="off"]')).to_be_visible()
        assert page.evaluate('JDDSound.getContext()===null')
        page.locator('#soundToggle').click()
        print('PASS: interrupteur sonore et choix muet conservé au relancement de la PWA en mode avion',flush=True)

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
        page.evaluate("() => { for (let i = 0; i < 3; i++) navigator.serviceWorker.dispatchEvent(new Event('controllerchange')); }")
        expect(page.locator('#game')).to_be_visible()
        navigations = []
        page.on('request', lambda request: navigations.append(request.url) if request.is_navigation_request() else None)
        # Le retour au menu déclenche volontairement le rechargement de la
        # nouvelle version : attendre explicitement cette navigation.
        with page.expect_navigation(wait_until='domcontentloaded'):
            page.locator('#backLogo').click(no_wait_after=True)
        assert navigations == [base], navigations
        expect(page.locator('#setup')).to_be_visible()
        expect(page.locator('.player-item')).to_have_count(3)
        print('PASS: nouveau worker, anciens caches supprimés, partie préservée, un seul rechargement au menu et joueurs conservés', flush=True)

        # La même application fonctionne également à la racine d'un hébergement.
        root_context = pw.chromium.launch_persistent_context(
            user_data_dir=str(Path(tmp) / 'root-profile'), executable_path=CHROMIUM, headless=True,
        )
        root_page = root_context.new_page()
        root_page.goto(origin + '/', wait_until='load')
        root_page.wait_for_function('() => navigator.serviceWorker.controller !== null')
        assert root_page.evaluate('async () => (await navigator.serviceWorker.ready).scope') == origin + '/'
        assert not errors, errors
        root_context.close()
        context.close()
        print('PASS: chemins à la racine et en sous-dossier, aucune erreur JavaScript', flush=True)
    server.shutdown()

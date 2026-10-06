"""Vraies frontières, coordonnées, gestes tactiles, scores et tours dans Chromium."""
import json
import math
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/jdd-geography-review')
OUT.mkdir(exist_ok=True)
CHROMIUM = os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium')
countries = json.loads((REPO / 'data/geography/countries.geojson').read_text())
departments = json.loads((REPO / 'data/geography/departments.geojson').read_text())
cities = json.loads((REPO / 'data/geography/cities.json').read_text())
physical = json.loads((REPO / 'data/geography/physical.json').read_text())
river_names = {f['properties']['name'] for f in physical['rivers']['features']}
assert {'Loire','Seine','Rhône','Garonne','Dordogne','Amazonas','Nile','Congo','Mississippi','Chang Jiang','Murray'} <= river_names
assert (REPO / 'data/geography/physical.json').stat().st_size < 3_000_000
for kind in ['rivers','relief']:
    for feature in physical[kind]['features']:
        west,south,east,north=feature['bbox']
        assert -180<=west<=east<=180 and -90<=south<=north<=90
with Image.open(REPO / 'image/geography/mega-win.webp') as image:
    assert image.mode == 'RGBA' and image.getextrema()[3] == (0, 255)
    assert image.getpixel((0, 0))[3] == 0, 'Le jackpot doit avoir un vrai fond transparent.'
assert (REPO / 'image/geography/mega-win.webp').stat().st_size < 200_000
assert len(departments['features']) == 96
assert {f['properties']['code'] for f in departments['features']} == {f'{i:02}' for i in range(1, 96) if i != 20} | {'2A', '2B'}
for pool in cities.values():
    if not isinstance(pool, list) or not pool or not isinstance(pool[0], dict):
        continue
    assert len(pool) == len({c['id'] for c in pool})
    assert all(-85 <= c['lat'] <= 85 and -180 <= c['lng'] <= 180 for c in pool)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO), **kwargs)

    def translate_path(self, path):
        if path.startswith('/Jeu-du-duc/'):
            path = path[len('/Jeu-du-duc'):]
        return super().translate_path(path)

    def log_message(self, *args):
        pass


def point_inside(ring, x, y):
    inside = False
    for a, b in zip(ring, ring[1:]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def interior(feature):
    geom = feature['geometry']
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    # Choisir une terre à l'intérieur du polygone, puis cliquer à sa coordonnée projetée.
    for poly in sorted(polys, key=lambda p: len(p[0]), reverse=True):
        ring = poly[0]
        ys = [p[1] for p in ring]
        for fraction in [.5, .25, .75, .4, .6]:
            y = min(ys) + (max(ys) - min(ys)) * fraction
            intersections = sorted(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
                for a, b in zip(ring, ring[1:]) if (a[1] > y) != (b[1] > y))
            segments = sorted(zip(intersections[::2], intersections[1::2]), key=lambda p: p[1] - p[0], reverse=True)
            for left, right in segments:
                x = (left + right) / 2
                if not any(point_inside(hole, x, y) for hole in poly[1:]):
                    return [y, x]
    raise AssertionError(feature['properties'])


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROMIUM, headless=True)

        def home(people, width=393, height=852):
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True,
                                          is_mobile=width < 900, service_workers='block')
            context.add_init_script('localStorage.setItem("jdd.players", ' + json.dumps(json.dumps(people)) + ');'
                'window.offset = 0; const now = Date.now; Date.now = () => now() + offset;')
            page = context.new_page()
            page.on('pageerror', lambda err: errors.append(str(err)))
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            page.goto(base, wait_until='load')
            page.evaluate('''() => {
              const create = L.map;
              L.map = (...args) => { window.testMap = create(...args); return testMap; };
            }''')
            page.locator('#geographyBtn').click()
            return context, page

        def action(page, act):
            page.locator(f'#geography [data-geo="{act}"]').click()

        def state(page):
            return page.evaluate('JSON.parse(localStorage.getItem("jdd.geography.v1"))')

        def start(page, mode, zone='france'):
            page.locator(f'[data-geo-mode="{mode}"]').click()
            if mode == 'cities':
                page.locator(f'input[name="geo-zone"][value="{zone}"]').check()
            action(page, 'start')
            expect(page.locator('#geography')).to_have_attribute('data-screen', 'playing')

        def click_coordinate(page, point, focus=False):
            if focus:
                page.evaluate('p => { testMap.setView(p, 7, {animate:false}); }', point)
            page.locator('#geo-map').scroll_into_view_if_needed()
            xy = page.evaluate('''p => {
              const el = document.getElementById('geo-map'), b = el.getBoundingClientRect();
              const v = testMap.latLngToContainerPoint(p);
              return [b.x + el.clientLeft + v.x, b.y + el.clientTop + v.y];
            }''', point)
            page.mouse.click(*xy)

        def select_region(page, code, mode):
            feature = next(f for f in (countries if mode == 'countries' else departments)['features'] if f['properties']['code'] == code)
            click_coordinate(page, interior(feature), True)
            assert state(page)['guess'] == code, (code, state(page)['guess'])

        def layout(page):
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            assert page.locator('#geo-map img').count() == 0, 'La carte doit être vectorielle, sans image de fond.'

        context, page = home(['Alice'])
        assert page.locator('[data-geo-mode]').count() == 3
        start(page, 'cities')
        assert page.locator('#geo-map path.leaflet-interactive').count() == 242
        assert page.locator('#geo-map .leaflet-tooltip').count() == 0
        first = state(page)['targets'][0]
        click_coordinate(page, [first['lat'], first['lng']], True)
        assert page.locator('.geo-pin--guess').count() == 1
        # Déplacer l'épingle après une première sélection.
        click_coordinate(page, [first['lat'] + .5, first['lng']], True)
        guess = state(page)['guess']
        assert abs(guess['lat'] - first['lat'] - .5) < .03, (guess, first, page.evaluate('testMap.getCenter()'))
        # L'épingle elle-même peut aussi être tirée au doigt / à la souris.
        marker = page.locator('.geo-pin--guess').bounding_box()
        page.mouse.move(marker['x'] + 16, marker['y'] + 14)
        page.mouse.down()
        page.mouse.move(marker['x'] + 66, marker['y'] + 44, steps=5)
        page.mouse.up()
        page.wait_for_timeout(100)
        assert state(page)['guess'] != guess
        guess = state(page)['guess']
        page.evaluate('''() => { window.revealFrames=[]; window.revealDone=0;
          testMap.on('move',()=>revealFrames.push({time:performance.now(),zoom:testMap.getZoom(),center:testMap.getCenter()}));
          testMap.on('moveend',()=>{window.revealDone=performance.now()}); }''')
        action(page, 'validate')
        expect(page.locator('#geography')).to_have_attribute('data-screen', 'answer')
        result = state(page)['result']
        # Vérification indépendante par produit scalaire de vecteurs unitaires.
        a, b = math.radians(guess['lat']), math.radians(first['lat'])
        central = math.acos(min(1, math.sin(a) * math.sin(b) + math.cos(a) * math.cos(b) * math.cos(math.radians(guess['lng'] - first['lng']))))
        assert abs(result['km'] - 6371.0088 * central) < .001
        assert 0 < result['points'] < 1000
        assert page.locator('.geo-pin--guess').count() == page.locator('.geo-pin--truth').count() == 1
        assert page.locator('#geo-map path[stroke-dasharray]').count() == 1
        page.wait_for_function('() => revealDone && !document.querySelector(".geo-route--reveal")')
        frames=page.evaluate('revealFrames')
        assert len(frames)>=4, frames
        assert len({round(f['zoom'],3) for f in frames})>=3, frames
        assert 350 <= frames[-1]['time']-frames[0]['time'] <= 950, frames
        assert page.locator('#geo-map path[stroke-dasharray]').get_attribute('pathLength') is None
        points = state(page)['scores']
        click_coordinate(page, [first['lat'], first['lng']], True)
        assert state(page)['scores'] == points
        layout(page)
        page.screenshot(path=str(OUT / 'ville-reponse.png'), full_page=True)
        action(page, 'exit');page.locator('#geographyBtn').click();action(page, 'resume')
        expect(page.locator('#geography')).to_have_attribute('data-screen','answer')
        assert state(page)['scores']==points
        assert page.locator('.geo-pin--reveal, .geo-route--reveal, .geo-result--reveal').count()==0
        action(page, 'next')
        page.evaluate('offset += 31000')
        expect(page.locator('#geography')).to_have_attribute('data-screen', 'answer')
        assert state(page)['result']['timedOut'] and state(page)['result']['points'] == 0
        assert state(page)['result']['km'] is None
        action(page, 'next')
        saved = state(page)
        action(page, 'exit')
        page.locator('#playerInput').fill('Bob')
        page.locator('#addBtn').click()
        page.locator('#geographyBtn').click()
        action(page, 'resume')
        expect(page.locator('#geography')).to_have_attribute('data-screen', 'playing')
        assert state(page)['players'] == ['Alice'], 'La partie conserve sa bande de départ.'
        assert state(page)['index'] == saved['index']
        context.close()
        print('PASS: villes, épingle déplaçable, distance réelle, 30 s, reprise et absence de double score', flush=True)

        context, page = home(['Alice', 'Bob', 'Chloé'])
        start(page, 'countries')
        total = len(state(page)['targets'])
        assert total == 12 and len({t['id'] for t in state(page)['targets']}) == total
        for i in range(total):
            s = state(page)
            expect(page.locator('#geo-current-player')).to_have_text(['Alice', 'Bob', 'Chloé'][i % 3])
            code = s['targets'][i]['id']
            select_region(page, code, 'countries')
            assert page.locator('#geo-map .leaflet-tooltip').count() == 0
            action(page, 'validate')
            assert page.locator('#geo-mega-win').count() == 0
            assert state(page)['result']['correct'] and state(page)['result']['points'] == 1000
            assert page.locator(f'[data-geo-code="{code}"]').get_attribute('fill') == '#8bd5ae'
            if i == 0:
                page.screenshot(path=str(OUT / 'pays-reponse.png'), full_page=True)
            action(page, 'next')
        expect(page.locator('#geography')).to_have_attribute('data-screen', 'results')
        assert state(page)['scores'] == [4000, 4000, 4000]
        assert page.locator('.geo-ranking li').count() == 3
        action(page, 'replay')
        expect(page.locator('#geography')).to_have_attribute('data-screen', 'setup')
        context.close()
        print('PASS: pays cliqués à leurs coordonnées, tours équilibrés, cibles uniques et classement', flush=True)

        context, page = home(['Alice'])
        start(page, 'departments')
        assert page.locator('#geo-map path.leaflet-interactive').count() == 96
        assert page.locator('[data-geo-code="2A"]').count() == page.locator('[data-geo-code="2B"]').count() == 1
        code = state(page)['targets'][0]['id']
        wrong = '17' if code != '17' else '75'
        select_region(page, wrong, 'departments')
        action(page, 'validate')
        assert state(page)['result']['points'] == 0
        assert page.locator(f'[data-geo-code="{wrong}"]').get_attribute('fill') == '#f1a4b6'
        assert page.locator(f'[data-geo-code="{code}"]').get_attribute('fill') == '#8bd5ae'
        action(page, 'next')
        select_region(page, '75', 'departments')
        assert state(page)['guess'] == '75', 'Paris reste sélectionnable à fort zoom.'
        action(page, 'exit')
        context.close()
        print('PASS: 96 départements, Corse 2A/2B, Paris au zoom et révélation du bon choix', flush=True)

        context, page = home(['Alice'])
        # Auckland près de l'antiméridien : distance et ligne suivent le court trajet.
        page.evaluate('''() => {
          const shuffle = JDD.shuffle;
          JDD.shuffle = list => shuffle(list).sort((a,b) => (b.name === 'Auckland') - (a.name === 'Auckland'));
        }''')
        start(page, 'cities', 'world')
        assert state(page)['targets'][0]['name'] == 'Auckland'
        click_coordinate(page, [-36.85, -179], True)
        action(page, 'validate')
        assert state(page)['result']['km'] < 1000
        assert page.locator('.leaflet-geoLand-pane path').count() > 242, 'Les côtes sont répétées après le passage de l’antiméridien.'
        page.wait_for_function('() => !document.querySelector(".geo-route--reveal")')
        map_box = page.locator('#geo-map').bounding_box()
        for kind in ['guess', 'truth']:
            box = page.locator(f'.geo-pin--{kind}').bounding_box()
            assert map_box['x'] <= box['x'] + box['width'] / 2 <= map_box['x'] + map_box['width']
            assert map_box['y'] <= box['y'] + box['height'] / 2 <= map_box['y'] + map_box['height']
        context.close()
        print('PASS: ligne et épingles de part et d’autre de l’antiméridien', flush=True)

        # Le mouvement réduit garde la réponse et les points immédiatement lisibles.
        context,page=home(['Alice']);page.emulate_media(reduced_motion='reduce')
        start(page,'cities')
        city=state(page)['targets'][0]
        click_coordinate(page,[city['lat'],city['lng']],True);action(page,'validate')
        assert page.locator('.geo-pin--reveal, .geo-route--reveal, .geo-result--reveal').count()==0
        assert state(page)['scores']==[1000]
        expect(page.locator('#geo-mega-win')).to_be_visible()
        assert page.locator('.geo-win-particle').count()==0
        assert page.locator('.geo-mega-win-art').evaluate('el => getComputedStyle(el).animationName')=='none'
        action(page,'next');expect(page.locator('#geography')).to_have_attribute('data-screen','playing')
        expect(page.locator('#geo-mega-win')).to_be_hidden()
        context.close()
        # Quitter pendant le mouvement ne laisse aucun rappel vers une carte supprimée.
        context,page=home(['Alice']);start(page,'cities')
        city=state(page)['targets'][0]
        click_coordinate(page,[city['lat']+.5,city['lng']],True);action(page,'validate')
        action(page,'exit');page.wait_for_timeout(600)
        expect(page.locator('#setup')).to_be_visible()
        page.locator('#geographyBtn').click();action(page,'resume')
        assert len(state(page)['rows'])==1
        context.close()
        print('PASS: caméra et zoom continus en moins d’une seconde, mouvement réduit, reprise et sortie pendant la révélation',flush=True)

        # Le jackpot dépend des km réels, pas des points (le monde tolère 25 km).
        for zone in ['france','world']:
            context,page=home(['Alice']);start(page,'cities',zone)
            def place_km(km):
                city=state(page)['targets'][state(page)['index']]
                point=[city['lat']+km/6371.0088*180/math.pi,city['lng']]
                page.evaluate('''p => { testMap.setView(p,9,{animate:false});
                  testMap.fire('click',{latlng:L.latLng(p)}); }''',point)
            expect(page.locator('#geo-mega-win')).to_be_hidden()
            page.wait_for_function('() => document.querySelector(".geo-mega-win-art").complete && document.querySelector(".geo-mega-win-art").naturalWidth > 0')
            page.evaluate('''() => {window.jackpotTimes=[];
              new MutationObserver(records => jackpotTimes.push({hidden:records[records.length-1].target.hidden,time:performance.now()}))
                .observe(document.querySelector('#geo-mega-win'),{attributes:true,attributeFilter:['hidden']});}''')
            place_km(4.99);action(page,'validate')
            assert abs(state(page)['result']['km']-4.99)<.000001
            expect(page.locator('#geo-mega-win')).to_be_visible()
            assert page.locator('.geo-win-particle').count()==16
            assert page.locator('#geo-mega-win').evaluate('el => getComputedStyle(el).pointerEvents')=='none'
            assert page.locator('#geo-mega-win').evaluate('el => getComputedStyle(el).backgroundColor')=='rgba(0, 0, 0, 0)'
            assert state(page)['scores']==[1000] and len(state(page)['rows'])==1
            page.wait_for_timeout(500)
            map_box=page.locator('#geo-map').bounding_box();win_box=page.locator('#geo-mega-win').bounding_box()
            assert abs(map_box['x']-win_box['x'])<1 and abs(map_box['y']-win_box['y'])<1
            layout(page)
            if zone=='france':
                page.screenshot(path=str(OUT/'mega-win-mobile.png'))
                expect(page.locator('#geo-mega-win')).to_be_hidden(timeout=3000)
                assert page.locator('.geo-win-particle').count()==0
                times=page.evaluate('jackpotTimes')
                shown=next(t['time'] for t in times if not t['hidden']);ended=next(t['time'] for t in times if t['hidden'] and t['time']>shown)
                assert 1900<=ended-shown<=2300,times
                assert state(page)['scores']==[1000] and len(state(page)['rows'])==1
                action(page,'exit');page.locator('#geographyBtn').click();action(page,'resume')
                expect(page.locator('#geo-mega-win')).to_be_hidden()
            action(page,'next') # reste utilisable pendant l'overlay (Monde).
            expect(page.locator('#geo-mega-win')).to_be_hidden()
            assert page.locator('.geo-win-particle').count()==0
            place_km(5.01);action(page,'validate')
            assert abs(state(page)['result']['km']-5.01)<.000001
            expect(page.locator('#geo-mega-win')).to_be_hidden()
            action(page,'next');place_km(0);action(page,'validate')
            expect(page.locator('#geo-mega-win')).to_be_visible()
            action(page,'exit');page.wait_for_timeout(2100)
            page.locator('#geographyBtn').click();action(page,'resume')
            expect(page.locator('#geo-mega-win')).to_be_hidden()
            assert len(state(page)['rows'])==3
            context.close()
        print('PASS: MEGA WIN transparent et léger, seuil de 5 km France/Monde, durée 2 s, commandes libres et nettoyage sans replay',flush=True)

        context,page=home(['Alice']);start(page,'cities')
        page.evaluate('() => {testMap.setView([47.9,1.9],8,{animate:false});}')
        assert page.locator('[data-geo-river="Loire"]').count()>0
        assert page.locator('#geo-map .leaflet-tooltip').count()==0
        # Cliquer sur le tracé réel de la Loire doit poser l'épingle normalement.
        loire=next(f for f in physical['rivers']['features'] if f['properties']['name']=='Loire'
                   and any(47.7<p[1]<48.1 and 1.6<p[0]<2.2 for line in f['geometry']['coordinates'] for p in line))
        point=min((p for line in loire['geometry']['coordinates'] for p in line),key=lambda p:(p[0]-1.9)**2+(p[1]-47.9)**2)
        click_coordinate(page,[point[1],point[0]])
        guess=state(page)['guess'];assert abs(guess['lat']-point[1])<.005 and abs(guess['lng']-point[0])<.005
        assert page.locator('.geo-river-line').evaluate_all('nodes => nodes.every(n => getComputedStyle(n).pointerEvents === "none")')
        page.evaluate('() => {testMap.setView([45.8,6.8],7,{animate:false});}')
        assert page.locator('.geo-relief-shape').count()>0
        assert page.locator('.geo-relief-shape').evaluate_all('nodes => nodes.every(n => getComputedStyle(n).pointerEvents === "none")')
        page.evaluate('() => {testMap.setView([20,0],2,{animate:false});}')
        expect(page.locator('#geography')).to_have_attribute('data-screen','playing')
        assert page.locator('[data-geo-river="Nile"]').count()>0
        assert page.locator('[data-geo-river="Amazonas"]').count()>0
        assert page.locator('.geo-river-line').count()<150, 'Le monde garde seulement les grands fleuves à ce zoom.'
        action(page,'exit');context.close()
        context,page=home(['Alice']);start(page,'departments')
        select_region(page,'74','departments') # Le relief alpin ne masque pas la sélection.
        assert state(page)['guess']=='74'
        action(page,'validate');expect(page.locator('#geography')).to_have_attribute('data-screen','answer')
        action(page,'exit');context.close()
        print('PASS: Loire à Orléans, relief alpin, fleuves mondiaux filtrés par zoom, clics libres et départements sélectionnables sous le relief',flush=True)

        for width, height in [(320, 568), (360, 640), (393, 852), (430, 932), (852, 393), (1440, 900)]:
            context, page = home(['Alice'], width, height)
            start(page, 'cities', 'world')
            assert len(state(page)['targets']) == 10
            layout(page)
            zoom = page.evaluate('testMap.getZoom()')
            page.locator('.leaflet-control-zoom-in').click()
            assert page.evaluate('testMap.getZoom()') > zoom
            page.locator('.geo-map-reset').click()
            if width == 393:
                page.locator('#geo-map').scroll_into_view_if_needed()
                box = page.locator('#geo-map').bounding_box()
                x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
                cdp = context.new_cdp_session(page)
                initial_zoom = page.evaluate('testMap.getZoom()')
                def touch(kind, spread):
                    pts = [] if kind == 'touchEnd' else [{'x': x - spread, 'y': y, 'id': 0}, {'x': x + spread, 'y': y, 'id': 1}]
                    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})
                touch('touchStart', 30)
                for spread in [40, 55, 75, 95]:
                    touch('touchMove', spread)
                    page.wait_for_timeout(40)
                touch('touchEnd', 0)
                page.wait_for_timeout(100)
                assert page.evaluate('testMap.getZoom()') > initial_zoom
                center = page.evaluate('testMap.getCenter()')
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 0}]})
                for delta in [15, 30, 60, 90]:
                    cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + delta, 'y': y + delta / 2, 'id': 0}]})
                    page.wait_for_timeout(30)
                cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
                page.wait_for_timeout(100)
                assert page.evaluate('testMap.getCenter()') != center
                assert state(page)['guess'] is None, 'Glisser la carte ne pose pas une épingle.'
                page.screenshot(path=str(OUT / 'monde-mobile.png'), full_page=True)
            city=state(page)['targets'][0]
            page.evaluate('''p => {testMap.setView(p,7,{animate:false});
              testMap.fire('click',{latlng:L.latLng(p)});}''',[city['lat'],city['lng']])
            action(page,'validate');expect(page.locator('#geo-mega-win')).to_be_visible()
            page.wait_for_timeout(450)
            art=page.locator('.geo-mega-win-art').bounding_box()
            assert art['x']>=-1 and art['x']+art['width']<=width+1,art
            assert art['y']>=-1 and art['y']+art['height']<=height+1,art
            layout(page)
            action(page, 'exit')
            page.wait_for_timeout(100)
            context.close()
        print('PASS: six formats, zoom boutons, pinch et déplacement tactiles, jackpot entièrement visible même en paysage', flush=True)
        assert not errors, errors
        browser.close()
finally:
    server.shutdown()

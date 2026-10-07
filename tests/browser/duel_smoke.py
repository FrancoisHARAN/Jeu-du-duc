"""Vrais gestes tactiles, tours, passes, buts, identités et formats de Duel Foot."""

import json
import os
from pathlib import Path
import shutil
import threading
from PIL import Image
from http.server import ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright

from support.http import REPO, RepositoryHandler

OUT = Path('/tmp/jdd-duel-review')
OUT.mkdir(exist_ok=True)


Handler = RepositoryHandler


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
base = f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),
            headless=True,
        )

        def home(width=393, height=852, people=None):
            people = people if people is not None else ['Alex', 'Alex (invité)', 'Chloé']
            context = browser.new_context(
                viewport={'width': width, 'height': height},
                is_mobile=width < 900,
                has_touch=True,
                service_workers='block',
            )
            identities = [
                {
                    'id': '11111111-1111-4111-8111-111111111111',
                    'kind': 'account',
                    'name': 'Alex',
                    'label': 'Alex',
                },
                {
                    'id': '22222222-2222-4222-8222-222222222222',
                    'kind': 'guest',
                    'name': 'Alex',
                    'label': 'Alex (invité)',
                },
            ]
            context.add_init_script(
                'if(!localStorage.getItem("jdd.players"))localStorage.setItem("jdd.players",'
                + json.dumps(json.dumps(people))
                + ');'
                + 'if(!localStorage.getItem("jdd.participants.v1"))localStorage.setItem("jdd.participants.v1",'
                + json.dumps(json.dumps(identities))
                + ');'
            )
            context.add_init_script(
                "const fixture=sessionStorage.getItem('duel-fixture');if(fixture){localStorage.setItem('jdd.duel-football.v1',fixture);sessionStorage.removeItem('duel-fixture');}"
            )
            context.add_init_script(
                '''window.duelLabels=[];window.duelLetterTransforms=[];
                const fill=CanvasRenderingContext2D.prototype.fillText;
                CanvasRenderingContext2D.prototype.fillText=function(text,...args){
                    if(this.canvas.id==='duel-canvas'){
                        duelLabels.push(String(text));if(duelLabels.length>24)duelLabels.shift();
                        const t=this.getTransform();duelLetterTransforms.push({a:t.a,d:t.d});
                        if(duelLetterTransforms.length>24)duelLetterTransforms.shift();}
                    return fill.call(this,text,...args);};'''
            )
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base, wait_until='load')
            page.evaluate('Math.random=()=>.25')
            page.evaluate(
                '''() => { const shoot=JDDDuelPhysics.shoot;
                JDDDuelPhysics.shoot=(s,id,...args)=>{const accepted=shoot(s,id,...args);
                    if(accepted)window.duelLastLaunch={vx:s.bodies[id].vx,vy:s.bodies[id].vy};return accepted;}; }'''
            )
            assert page.locator('#footballBtn + #duelBtn').count() == 1
            page.locator('#duelBtn').click()
            return context, page

        def saved(page):
            return page.evaluate('JSON.parse(localStorage.getItem("jdd.duel-football.v1"))')

        def watch_board(page):
            page.evaluate(
                '''() => {
                window.duelRects=[];
                const sample=()=>{const c=document.getElementById('duel-canvas');
                    if(c){const r=c.getBoundingClientRect();duelRects.push([r.x,r.y,r.width,r.height,c.width,c.height]);}
                    window.duelRectFrame=requestAnimationFrame(sample);};sample();
            }'''
            )

        def assert_fixed_board(page):
            rects = page.evaluate('cancelAnimationFrame(window.duelRectFrame);duelRects')
            assert len(rects) > 5
            assert all(
                abs(value - rects[0][i]) < 0.25 for r in rects for i, value in enumerate(r)
            ), rects

        def seed(page, code):
            page.evaluate(
                '''code => {
                const match = JSON.parse(localStorage.getItem('jdd.duel-football.v1'));
                match.physics = JDDDuelPhysics.create(match.physics.formations, 0);
                match.ballRotation = JDDDuelBall.rotation();
                const s = match.physics;
                s.bodies.forEach((p,i)=>{if(i<10){p.x=i<5?52:348;p.y=130+i%5*105;}});
                s.bodies[10].x=166;s.bodies[11].x=234;
                new Function('s',code)(s);
                sessionStorage.setItem('duel-fixture',JSON.stringify(match));
            }''',
                code,
            )
            # Le navigateur recharge un vrai match sauvegardé, pas un état de test dans le module.
            page.reload(wait_until='load')
            page.locator('#duelBtn').click()
            page.locator('[data-duel="resume"]').click()

        def gesture(page, puck, dx=0, dy=120, cancel=False):
            bounds = page.locator('#duel-canvas').bounding_box()
            x = bounds['x'] + 2 + puck['x'] * (bounds['width'] - 4) / 400
            y = bounds['y'] + 2 + puck['y'] * (bounds['height'] - 4) / 680
            cdp = page.context.new_cdp_session(page)
            cdp.send(
                'Input.dispatchTouchEvent',
                {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 7}]},
            )
            cdp.send(
                'Input.dispatchTouchEvent',
                {'type': 'touchMove', 'touchPoints': [{'x': x + dx, 'y': y + dy, 'id': 7}]},
            )
            if not cancel:
                page.screenshot(path=str(OUT / 'tir-fleche.png'))
            cdp.send(
                'Input.dispatchTouchEvent',
                {'type': 'touchCancel' if cancel else 'touchEnd', 'touchPoints': []},
            )
            cdp.detach()

        def watch_ball(page):
            page.evaluate(
                '''() => {
                window.duelBallFrames=[];const draw=JDDDuelBall.draw;
                JDDDuelBall.draw=(ctx,b,q,...args)=>{
                    duelBallFrames.push({x:b.x,y:b.y,angle:b.angle,q:q.slice()});return draw(ctx,b,q,...args);};
            }'''
            )

        context, page = home()
        assert page.locator('[data-duel-player="0"] option').all_text_contents() == [
            'Choisir un joueur',
            'Alex',
            'Alex (invité)',
            'Chloé',
        ]
        page.locator('[data-duel-player="0"]').select_option('Chloé')
        page.locator('[data-duel-player="1"]').select_option('Chloé')
        assert (
            page.locator('[data-duel-player="0"]').input_value()
            != page.locator('[data-duel-player="1"]').input_value()
        )
        page.locator('[data-duel-player="0"]').select_option('Alex')
        page.locator('[data-duel-player="1"]').select_option('Alex (invité)')
        page.locator('input[name="duel-formation-0"][value="2-2-1"]').check()
        page.locator('input[name="duel-formation-1"][value="1-2-2"]').check()
        page.screenshot(path=str(OUT / 'formations-mobile.png'), full_page=True)
        page.locator('[data-duel="start"]').click()
        m = saved(page)
        assert [p['kind'] for p in m['players']] == ['account', 'guest']
        assert m['players'][0]['id'] != m['players'][1]['id']
        assert m['physics']['formations'] == ['2-2-1', '1-2-2']
        page.screenshot(path=str(OUT / 'terrain-mobile.png'))
        watch_board(page)
        gesture(page, m['physics']['bodies'][0], dy=40, cancel=True)
        assert saved(page)['physics']['moves'] == [0, 0]
        gesture(page, m['physics']['bodies'][0], dy=4)
        assert saved(page)['physics']['moves'] == [0, 0]
        gesture(page, m['physics']['bodies'][5], dy=-120)
        assert saved(page)['physics']['moves'] == [0, 0]
        gesture(page, m['physics']['bodies'][0], dy=160)
        s = saved(page)['physics']
        assert s['phase'] == 'moving' and s['moves'] == [1, 0]
        launch = page.evaluate('duelLastLaunch')
        assert abs(launch['vx']) < 0.1 and 650 < abs(launch['vy']) <= 720
        page.locator('[data-duel="pause"]').click()
        stopped = saved(page)
        page.wait_for_timeout(400)
        assert saved(page) == stopped
        assert_fixed_board(page)
        page.reload(wait_until='load')
        page.locator('#duelBtn').click()
        page.locator('[data-duel="resume"]').click()
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        assert saved(page)['physics']['moves'] == [1, 0]
        print(
            'PASS: identités compte/invité homonymes, sélection distincte, formations, vrais gestes, plafond 3 cm, annulation et pause/reprise',
            flush=True,
        )

        seed(page, '')
        keeper = saved(page)['physics']['bodies'][10]
        assert keeper['r'] == 20 and len(saved(page)['physics']['bodies']) == 13
        gesture(page, keeper, dx=-40, dy=-70)
        s = saved(page)['physics']
        assert s['active'] == 10 and s['moves'] == [1, 0]
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        print('PASS: gardien sélectionné et lancé avec un vrai geste tactile', flush=True)

        seed(
            page,
            "JDDDuelPhysics.shoot(s,0,20,0);Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{vx:100,vy:70});",
        )
        watch_ball(page)
        page.wait_for_timeout(450)
        frames = page.evaluate('duelBallFrames')
        assert len(frames) > 5 and all(f['angle'] == 0 for f in frames)
        assert (
            frames[0]['q'] != frames[-1]['q']
        ), 'Le ballon roule en volume même sans rotation de disque'
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        rotation = saved(page)['ballRotation']
        page.reload(wait_until='load')
        page.locator('#duelBtn').click()
        page.locator('[data-duel="resume"]').click()
        assert (
            saved(page)['ballRotation'] == rotation
        ), 'La reprise conserve les faces visibles du ballon'
        print(
            'PASS: roulement du ballon dans la direction du déplacement et orientation conservée à la reprise',
            flush=True,
        )

        seed(
            page,
            "Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:42,y:340});Object.assign(s.bodies[1],{x:65,y:340});"
            "s.phase='moving';s.active=1;s.action={shooter:0,receiver:1,elapsed:0};"
            "s.capture={id:1,stage:'align',coastQuiet:0,x:42,y:340,orbit:0,elapsed:0};",
        )
        watch_ball(page)
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        frames = page.evaluate('duelBallFrames')
        assert len(frames) > 5 and all(f['x'] == 42 and f['y'] == 340 for f in frames)
        assert saved(page)['physics']['active'] == 1 and saved(page)['physics']['turn'] == 0
        expect(page.locator('.duel-pass-note')).to_have_count(
            0
        )  # Une reprise ne rejoue pas la bulle.
        print(
            'PASS: réception près du mur, seul le pion pivote et le ballon reste strictement à sa position',
            flush=True,
        )

        seed(
            page,
            "Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:200,y:JDDDuelPhysics.FIELD.top-6});",
        )
        gesture(page, saved(page)['physics']['bodies'][0], dx=-20, dy=0)
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        assert saved(page)['physics']['scores'] == [0, 0]
        expect(page.locator('#duel .jdd-celebration')).to_have_count(0)
        print('PASS: ballon partiellement au-delà de la ligne sans but ni célébration', flush=True)

        seed(
            page,
            "Object.assign(s.bodies[0],{x:200,y:600});Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:200,y:560});Object.assign(s.bodies[1],{x:200,y:445});",
        )
        watch_board(page)
        gesture(page, saved(page)['physics']['bodies'][0])
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'moving')
        expect(page.locator('.duel-pass-bubble')).to_be_visible(timeout=12000)
        note = page.locator('.duel-pass-note')
        expect(note).to_have_attribute('data-receiver', '1')
        expect(note).to_have_text('Bonne passe !')
        assert note.evaluate('n=>getComputedStyle(n).pointerEvents') == 'none'
        assert note.locator('span').evaluate('n=>getComputedStyle(n).animationDuration') == '1.6s'
        bubble = note.locator('span').bounding_box()
        board = page.locator('#duel-canvas').bounding_box()
        assert bubble['width'] < 170 and bubble['x'] >= board['x'] and bubble['y'] >= board['y']
        assert bubble['x'] + bubble['width'] <= board['x'] + board['width']
        page.wait_for_timeout(180)
        page.screenshot(path=str(OUT / 'bonne-passe.png'))
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        s = saved(page)['physics']
        assert s['turn'] == 0 and s['active'] == 1 and s['passes'][0] == 1
        assert s['bodies'][1]['y'] < 400, 'Le receveur avance grâce à la passe'
        assert 29 < s['bodies'][1]['y'] - s['bodies'][12]['y'] < 33
        assert_fixed_board(page)
        page.screenshot(path=str(OUT / 'passe-recue.png'))
        expect(note).to_have_count(0, timeout=2000)
        gesture(page, s['bodies'][0])
        assert saved(page)['physics']['moves'][0] == 1
        page.locator('[data-duel="exit"]').click()
        expect(page.locator('#setup')).to_be_visible()
        page.locator('#duelBtn').click()
        page.locator('[data-duel="resume"]').click()
        assert saved(page)['physics']['active'] == 1
        gesture(page, s['bodies'][1], dx=45, dy=100)
        assert saved(page)['physics']['moves'][0] == 2
        print(
            'PASS: passe tactile, repositionnement aligné, receveur imposé, second tir immédiat et conservation après retour au menu',
            flush=True,
        )

        seed(
            page,
            "s.scores=[2,0];Object.assign(s.bodies[0],{x:200,y:120});Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:200,y:82});",
        )
        watch_board(page)
        page.evaluate(
            '''() => {
            window.goalAppearance=null;
            const observer=new MutationObserver(()=>{
                const art=document.querySelector('#duel .jdd-celebration-art');if(!art)return;
                observer.disconnect();const created=performance.now();
                const goalTime=JSON.parse(localStorage.getItem('jdd.duel-football.v1')).physics.goalTime;
                requestAnimationFrame(()=>window.goalAppearance={goalTime,paintDelay:performance.now()-created,
                    opacity:Number(getComputedStyle(art).opacity),ready:art.complete&&art.naturalWidth>0});
            });observer.observe(document.querySelector('#duel'),{childList:true,subtree:true});
        }'''
        )
        gesture(page, saved(page)['physics']['bodies'][0])
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'goal')
        scored_ball = saved(page)['physics']['bodies'][12]
        celebration = page.locator('#duel .jdd-celebration')
        expect(celebration).to_be_visible()
        assert celebration.evaluate('n=>getComputedStyle(n).pointerEvents') == 'none'
        assert celebration.evaluate('n=>getComputedStyle(n).backgroundColor') == 'rgba(0, 0, 0, 0)'
        assert celebration.evaluate('n=>getComputedStyle(n).animationDuration') == '2s'
        assert celebration.locator('.jdd-celebration-spark').count() == 12
        art = celebration.locator('img')
        expect(art).to_have_attribute('src', 'image/duel/goal.webp')
        assert art.evaluate('n=>n.complete && n.naturalWidth>0')
        page.wait_for_function('window.goalAppearance !== null')
        appearance = page.evaluate('goalAppearance')
        assert appearance['goalTime'] < 0.055 and appearance['paintDelay'] < 100
        assert appearance['opacity'] > 0.99 and appearance['ready'], appearance
        page.wait_for_timeout(650)
        assert float(art.evaluate('n=>getComputedStyle(n).opacity')) > 0.99
        moving_ball = saved(page)['physics']['bodies'][12]
        assert (
            abs(moving_ball['y'] - scored_ball['y']) > 2
        ), 'Le ballon continue à bouger après le but'
        page.screenshot(path=str(OUT / 'but.png'))
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'finished')
        assert_fixed_board(page)
        expect(celebration).to_have_count(0)
        expect(page.locator('.duel-result h2')).to_have_text('Alex gagne !')
        expect(page.locator('#duel-score-0')).to_have_text('3')
        assert saved(page)['physics']['winner'] == 0
        page.reload(wait_until='load')
        page.locator('#duelBtn').click()
        page.locator('[data-duel="resume"]').click()
        expect(page.locator('.duel-result h2')).to_have_text('Alex gagne !')
        page.locator('[data-duel="replay"]').click()
        assert page.locator('input[name="duel-formation-0"]:checked').input_value() == '2-2-1'
        assert page.locator('[data-duel-player="1"]').input_value() == 'Alex (invité)'
        page.locator('[data-duel="start"]').click()
        assert saved(page)['physics']['scores'] == [0, 0]
        context.close()
        print(
            'PASS: animation de but, victoire à trois, résultat conservé et nouvelle partie à zéro',
            flush=True,
        )
        print(
            'PASS: cadre fixe pendant les tirs, passes, pauses et buts, ballon toujours animé après un but',
            flush=True,
        )

        context, page = home(people=['François', 'Guillaume'])
        page.locator('[data-duel="start"]').click()
        seed(
            page,
            "s.turn=1;Object.assign(s.bodies[5],{x:200,y:80});Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:200,y:120});Object.assign(s.bodies[6],{x:200,y:235});",
        )
        page.emulate_media(reduced_motion='reduce')
        gesture(page, saved(page)['physics']['bodies'][5], dy=-120)
        expect(page.locator('.duel-pass-bubble')).to_be_visible(timeout=12000)
        note = page.locator('.duel-pass-note')
        assert note.evaluate('n=>new DOMMatrixReadOnly(getComputedStyle(n).transform).a') < -0.99
        assert (
            note.locator('span').evaluate('n=>getComputedStyle(n).animationName')
            == 'duel-pass-fade'
        )
        page.screenshot(path=str(OUT / 'bonne-passe-adversaire.png'))
        page.locator('[data-duel="pause"]').click()
        expect(note).to_have_count(0)
        page.locator('[data-duel="continue"]').click()
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        expect(note).to_have_count(0)
        context.close()
        print(
            'PASS: bulle BD 1,6 s au recalage, sans blocage ni mouvement du terrain, lisible des deux côtés et nettoyée à la pause sans replay',
            flush=True,
        )

        context, page = home()
        page.emulate_media(reduced_motion='reduce')
        page.locator('[data-duel="start"]').click()
        seed(
            page,
            "Object.assign(s.bodies[0],{x:200,y:120});Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:200,y:82});",
        )
        gesture(page, saved(page)['physics']['bodies'][0])
        celebration = page.locator('#duel .jdd-celebration')
        expect(celebration).to_be_visible()
        assert celebration.locator('img').evaluate('n=>getComputedStyle(n).animationName') == 'none'
        assert (
            celebration.locator('.jdd-celebration-spark').first.evaluate(
                'n=>getComputedStyle(n).display'
            )
            == 'none'
        )
        page.locator('[data-duel="pause"]').click()
        expect(celebration).to_have_count(0)
        page.locator('[data-duel="continue"]').click()
        expect(celebration).to_have_count(0)
        expect(page.locator('#duel')).to_have_attribute('data-phase', 'aim', timeout=12000)
        s = saved(page)['physics']
        assert s['scores'] == [1, 0] and s['turn'] == 1 and s['active'] is None
        expect(page.locator('#duel-turn')).to_have_attribute('data-team', '1')
        expect(page.locator('#duel-turn .duel-turn-text')).to_have_text('Alex · À toi !')
        expect(page.locator('.duel-player[data-team="1"]')).to_have_class('duel-player is-active')
        expect(page.locator('.duel-player[data-team="0"]')).to_have_class('duel-player')
        for team in [0, 1]:
            expected = page.evaluate(
                'team => JDDDuelPhysics.formationPositions('
                'JSON.parse(localStorage.getItem("jdd.duel-football.v1")).physics.formations[team], team, team===0)',
                team,
            )
            assert [
                {'x': p['x'], 'y': p['y']} for p in s['bodies'][team * 5 : team * 5 + 5]
            ] == expected
        gesture(page, s['bodies'][0], dy=80)
        assert saved(page)['physics']['moves'] == s['moves'], 'Le marqueur ne peut pas engager'
        gesture(page, s['bodies'][5], dy=-80)
        assert saved(page)['physics']['moves'] == [s['moves'][0], s['moves'][1] + 1]
        print(
            'PASS: après un but et une pause, le joueur qui a encaissé engage en attaque, le marqueur défend et ne peut pas tirer',
            flush=True,
        )
        seed(
            page,
            "Object.assign(s.bodies[0],{x:200,y:120});Object.assign(s.bodies[JDDDuelPhysics.BALL_ID],{x:200,y:82});",
        )
        gesture(page, saved(page)['physics']['bodies'][0])
        expect(celebration).to_be_visible()
        page.locator('[data-duel="exit"]').click()
        expect(celebration).to_have_count(0)
        context.close()
        asset = Image.open(REPO / 'image/duel/goal.webp')
        assert asset.mode == 'RGBA' and asset.getchannel('A').getextrema() == (0, 255)
        assert asset.getpixel((0, 0))[3] == 0
        print(
            'PASS: visuel transparent, overlay sans blocage, réduction des animations, nettoyage à la pause et au menu',
            flush=True,
        )

        for width, height in [
            (320, 568),
            (360, 640),
            (393, 852),
            (430, 932),
            (568, 320),
            (852, 393),
            (1280, 800),
        ]:
            context, page = home(width, height, ['François', 'Solène'])
            page.locator('[data-duel="start"]').click()
            page.wait_for_timeout(150)
            assert page.evaluate('duelLabels.slice(-12)') == ['F'] * 5 + ['S'] * 5 + ['F', 'S']
            transforms = page.evaluate('duelLetterTransforms.slice(-12)')
            assert [t['a'] > 0 and t['d'] > 0 for t in transforms] == [True] * 5 + [False] * 5 + [
                True,
                False,
            ]
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'), (
                width,
                height,
            )
            bounds = page.locator('#duel-canvas').bounding_box()
            assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= height + 1, (
                width,
                height,
                bounds,
            )
            assert bounds['width'] > 160 and bounds['height'] > 270, bounds
            assert (
                page.locator('#duel-canvas').evaluate('n=>getComputedStyle(n).touchAction')
                == 'none'
            )
            if width in [320, 852, 1280]:
                page.screenshot(path=str(OUT / f'terrain-{width}.png'))
            context.close()
        print(
            'PASS: sept formats, portrait/paysage/PC, terrain entièrement visible et pas de défilement tactile',
            flush=True,
        )
        context, page = home(320, 568, ['M' * 40, 'Solène'])
        page.locator('[data-duel="start"]').click()
        assert page.locator('.duel-scoreboard--longnames').count() == 1
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
        assert page.locator('.duel-player strong, .duel-turn-text').evaluate_all(
            'nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)'
        )
        context.close()
        context, page = home(people=[])
        expect(page.locator('[data-duel="start"]')).to_be_disabled()
        for name in ['Nico', 'Axel']:
            page.locator('#duel-players input').fill(name)
            page.locator('#duel-players .jdd-player-add').click()
        expect(page.locator('[data-duel="start"]')).to_be_enabled()
        page.locator('[data-duel="start"]').click()
        assert [p['name'] for p in saved(page)['players']] == ['Nico', 'Axel']
        context.close()
        assert not errors, errors
        browser.close()
        print('PASS: joueurs ajoutés depuis le duel et aucune erreur JavaScript', flush=True)
finally:
    server.shutdown()

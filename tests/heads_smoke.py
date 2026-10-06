#!/usr/bin/env python3
"""Devine Tête : intégration navigateur, capteurs simulés et affichage mobile."""
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
CHROMIUM = os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium')
assert CHROMIUM, 'Chromium est nécessaire.'
OUT = Path('/tmp/jdd-heads-review')
OUT.mkdir(exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO), **kwargs)

    def translate_path(self, path):
        if path.startswith('/Jeu-du-duc/'):
            path = path[len('/Jeu-du-duc'):]
        return super().translate_path(path)

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors = []

INIT = """(() => {
  localStorage.setItem('jdd.players', JSON.stringify(['Alice', 'Bob', 'Chloé']));
  window.testSounds = [];
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (Audio) {
    const create = Audio.prototype.createBufferSource;
    Audio.prototype.createBufferSource = function() {
      const source = create.call(this), context = this, start = source.start;
      source.start = function(...args) {
        if (source.buffer) testSounds.push({buffer: source.buffer, state: context.state});
        return start.apply(source, args);
      };
      return source;
    };
  }
  const originalNow = Date.now;
  window.testOffset = 0;
  Date.now = () => originalNow() + window.testOffset;
  window.testPermissionCalls = [];
  window.testPermission = 'granted';
  DeviceOrientationEvent.requestPermission = () => {
    window.testPermissionCalls.push(navigator.userActivation.isActive);
    if (testPermission === 'throw') return Promise.reject(new Error('Sensor unavailable'));
    if (testPermission === 'pending') return new Promise(resolve => window.testResolvePermission = resolve);
    return Promise.resolve(testPermission);
  };
  window.testEmit = () => {
    if (!window.testAngles) return;
    const event = new Event('deviceorientation');
    event.beta = testAngles[0]; event.gamma = testAngles[1];
    dispatchEvent(event);
  };
  window.testTilt = (beta, gamma) => {
    testAngles = [beta, gamma];
    clearInterval(window.testSensorLoop);
    testEmit();
    window.testSensorLoop = setInterval(testEmit, 30);
  };
})()"""

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROMIUM, headless=True)

        def new_page(width=393, height=852):
            context = browser.new_context(viewport={'width': width, 'height': height},
                                          is_mobile=width < 900, has_touch=True, service_workers='block')
            context.add_init_script(INIT)
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda err: errors.append(str(err)))
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            page.on('response', lambda res: errors.append(f'HTTP {res.status}: {res.url}') if res.status >= 400 else None)
            page.goto(base, wait_until='load')
            return context, page

        def advance(page, ms):
            page.evaluate('ms => { testOffset += ms; testEmit(); }', ms)
            page.wait_for_timeout(120)

        def phase(page, expected):
            expect(page.locator('#heads')).to_have_attribute('data-screen', expected)

        def click(page, action):
            page.locator(f'#heads [data-act="{action}"]').click()

        def sounds(page):
            return page.evaluate('''testSounds.map(({buffer, state}) => {
              const data = buffer.getChannelData(0);
              let energy = 0, peak = 0;
              for (const sample of data) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
              return {duration: buffer.duration, rms: Math.sqrt(energy / data.length), peak,
                      first: data[0], last: data[data.length - 1], state};
            })''')

        def setup(page, controls='buttons'):
            page.locator('#headsBtn').click()
            phase(page, 'setup')
            if controls == 'buttons':
                page.evaluate("testPermission = 'denied'")

        def begin_manual(page):
            page.locator('#hu-start').click()
            phase(page, 'ready')
            click(page, 'countdown')
            phase(page, 'countdown')
            advance(page, 3100)
            phase(page, 'playing')

        def layout(page, full=False):
            issues = page.evaluate('''full => {
              const bad=[];
              if(document.documentElement.scrollWidth > innerWidth+1) bad.push('page trop large');
              const targets = full ? '#heads button, #hu-word' : '#heads';
              for (const el of document.querySelectorAll(targets)) {
                if(!el.getClientRects().length) continue;
                const r=el.getBoundingClientRect();
                if(r.left < -1 || r.right > innerWidth+1 || el.scrollWidth > el.clientWidth+1) bad.push(el.id || el.className);
                if(full && (r.top < -1 || r.bottom > innerHeight+1)) bad.push('hors écran: '+(el.id || el.className));
                if(el.tagName === 'BUTTON' && r.height < 44) bad.push('cible trop petite');
              }
              return bad;
            }''', full)
            assert not issues, issues

        for width, height in [(320, 568), (360, 640), (393, 852), (430, 932), (568, 320), (852, 393), (1440, 900)]:
            context, page = new_page(width, height)
            uc = page.locator('#undercoverBtn').bounding_box()
            heads = page.locator('#headsBtn').bounding_box()
            people = page.locator('.home-players').bounding_box()
            assert people['y'] < uc['y'] and uc['y'] + uc['height'] <= heads['y']
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            setup(page)
            counts = page.evaluate('JDD.HEADS_DECKS.map(d => d.words.length)')
            assert counts == [60] * 7, counts
            expect(page.locator('#hu-player .jdd-player-choice[aria-pressed="true"]')).to_contain_text('Alice')
            layout(page)
            if width == 393:
                page.screenshot(path=str(OUT / 'setup.png'), full_page=True)
            begin_manual(page)
            layout(page, True)
            first = page.locator('#hu-word').inner_text()
            # Une double validation ne doit compter qu'un mot.
            page.locator('[data-act="correct"]').evaluate('b => { b.click(); b.click(); }')
            expect(page.locator('#hu-points')).to_have_text('1')
            expect(page.locator('#hu-word')).to_have_text('Trouvé !')
            assert len(sounds(page)) == 1, 'La double validation rejoue le son.'
            advance(page, 700)
            assert page.locator('#hu-word').inner_text() != first
            click(page, 'pass')
            feedback = sounds(page)
            assert len(feedback) == 2
            for sound in feedback:
                assert sound['state'] == 'running', sound
                assert .15 < sound['duration'] < .65, sound
                assert .01 < sound['rms'] < .2 and .05 < sound['peak'] < .65, sound
                assert abs(sound['first']) < .001 and abs(sound['last']) < .001, 'Clic aux bords du son.'
            assert abs(feedback[0]['duration'] - feedback[1]['duration']) > .1, 'Les deux retours sonores sont identiques.'
            advance(page, 700)
            if width in (393, 852):
                page.screenshot(path=str(OUT / f'playing-{width}.png'), full_page=True)
            click(page, 'pause')
            phase(page, 'paused')
            remaining = page.locator('.hu-pause-stats strong').inner_text()
            paused_ms = page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).active.remaining")
            advance(page, 5000)
            expect(page.locator('.hu-pause-stats strong')).to_have_text(remaining)
            click(page, 'resume')
            click(page, 'countdown')
            advance(page, 3100)
            phase(page, 'playing')
            resumed_ms = page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).active.deadline - Date.now()")
            assert paused_ms - 1000 < resumed_ms <= paused_ms, (paused_ms, resumed_ms)
            advance(page, 65000)
            phase(page, 'results')
            expect(page.locator('#hu-result-points')).to_have_text('1')
            expect(page.locator('.hu-results-list [data-status="pass"]')).to_have_count(1)
            page.locator('.hu-results-list [data-status="pass"] button').click()
            expect(page.locator('#hu-result-points')).to_have_text('2')
            expect(page.locator('.hu-score-list').first).to_contain_text('Alice')
            expect(page.locator('.hu-score-list').first.locator('li strong')).to_have_text('2 pts')
            if width == 393:
                page.screenshot(path=str(OUT / 'results.png'), full_page=True)
            click(page, 'next-round')
            phase(page, 'ready')
            expect(page.locator('.hu-ready h1')).to_have_text('Bob')
            click(page, 'exit')
            expect(page.locator('#setup')).to_be_visible()
            expect(page.locator('#heads')).to_be_hidden()
            assert not page.evaluate("document.body.classList.contains('hu-playing')")
            context.close()
            print(f'PASS {width}×{height}: placement, manche, pause, score, correction, joueur suivant, affichage', flush=True)

        context, page = new_page(568, 320)
        # Petit paquet contrôlé : les 2 banques sont fusionnées et le doublon disparaît.
        page.evaluate("""JDD.HEADS_DECKS = [
          {id:'a', name:'A', words:['Pizza', 'Crème brûlée']},
          {id:'b', name:'B', words:['Pizza', '<b>Les potes, oui !</b>', 'A'.repeat(60)]}
        ]""")
        setup(page)
        begin_manual(page)
        expect(page.locator('.hu-word-card .hu-window')).to_contain_text('FAIS DEVINER SANS DIRE LE MOT')
        seen = []
        for _ in range(4):
            word = page.locator('#hu-word').inner_text()
            assert word not in seen, (word, seen)
            seen.append(word)
            layout(page, True)
            assert page.locator('#hu-word b').count() == 0, 'Un mot est injecté comme du HTML.'
            click(page, 'correct')
            advance(page, 700)
        phase(page, 'results')
        expect(page.locator('.hu-results h1')).to_have_text('Tout le paquet est passé !')
        expect(page.locator('#hu-result-points')).to_have_text('4')
        context.close()
        print('PASS: toutes les banques fusionnées, doublons retirés, échappement HTML, mot long et fin de paquet', flush=True)

        context, page = new_page()
        # Les anciens filtres ne doivent pas laisser une partie des mots inaccessible.
        page.evaluate("""localStorage.setItem('jdd.heads.v1', JSON.stringify({
          config:{themes:['animaux'], duration:120, controls:'buttons', clues:'mime', sound:false, custom:'Souvenir de la bande'},
          history:[], totals:[{player:'Alice', points:12, rounds:3}], used:[]
        }))""")
        setup(page)
        assert page.locator('#heads .hu-rules, #heads [data-theme], #heads #hu-duration, #heads #hu-custom, #heads .hu-radio-row, #heads .hu-sound').count() == 0
        expect(page.locator('#hu-start')).to_have_text('Lancer la partie ↗')
        begin_manual(page)
        active = page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).active")
        assert active['duration'] == 60 and active['clues'] == 'describe'
        assert set(active['themes']) == set(page.evaluate('JDD.HEADS_DECKS.map(d=>d.id)'))
        assert 'Souvenir de la bande' in active['pool']
        assert set(page.evaluate('JDD.HEADS_DECKS.flatMap(d=>d.words)')).issubset(set(active['pool']))
        assert page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).totals[0].points") == 12
        context.close()
        print('PASS: anciens réglages remplacés pour les nouvelles manches, anciens mots et scores conservés', flush=True)

        context, page = new_page(852, 393)
        setup(page, 'motion')
        page.locator('#hu-start').click()
        phase(page, 'ready')
        assert page.evaluate('testPermissionCalls') == [True], 'Permission iOS hors activation utilisateur.'
        page.evaluate('testTilt(0, 90)')
        advance(page, 650)
        phase(page, 'countdown')
        advance(page, 3100)
        phase(page, 'playing')
        advance(page, 300)
        # Mouvement trop bref : aucune validation.
        page.evaluate('testTilt(0, 0)')
        page.wait_for_timeout(60)
        page.evaluate('testTilt(0, 90)')
        advance(page, 300)
        expect(page.locator('#hu-points')).to_have_text('0')
        for neutral_gamma in [90, -90]:
            page.evaluate('testTilt(0, 0)')  # écran vers le ciel = passer
            page.wait_for_timeout(230)
            expect(page.locator('#hu-word')).to_have_text('Passé !')
            before = page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).active.rows.length")
            advance(page, 1400)
            expect(page.locator('#hu-word')).to_have_text('Passé !')
            assert page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).active.rows.length") == before
            page.evaluate('g => testTilt(0, g)', neutral_gamma)
            advance(page, 350)
            assert page.locator('#hu-word').inner_text() != 'Passé !'
            page.evaluate('testTilt(180, 0)')  # écran vers le sol = trouvé
            page.wait_for_timeout(230)
            expect(page.locator('#hu-word')).to_have_text('Trouvé !')
            advance(page, 1000)
            page.evaluate('g => testTilt(0, g)', neutral_gamma)
            advance(page, 350)
        expect(page.locator('#hu-points')).to_have_text('2')
        rows = page.evaluate("JSON.parse(localStorage.getItem('jdd.heads.v1')).active.rows")
        assert [r['status'] for r in rows] == ['pass', 'correct', 'pass', 'correct'], rows
        gesture_sounds = sounds(page)
        assert len(gesture_sounds) == len(rows), 'Un geste joue le son plusieurs fois.'
        assert gesture_sounds[0]['duration'] == gesture_sounds[2]['duration']
        assert gesture_sounds[1]['duration'] == gesture_sounds[3]['duration']
        assert gesture_sounds[0]['duration'] != gesture_sounds[1]['duration']
        page.evaluate('clearInterval(testSensorLoop); testAngles = null')
        advance(page, 6000)
        phase(page, 'paused')
        expect(page.locator('.hu-paused')).to_contain_text('ne répondent plus')
        click(page, 'resume-buttons')
        click(page, 'countdown')
        advance(page, 3100)
        phase(page, 'playing')
        expect(page.locator('#hu-points')).to_have_text('2')
        # Le passage en arrière-plan conserve le temps et le mot.
        word = page.locator('#hu-word').inner_text()
        page.evaluate("Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
        phase(page, 'paused')
        page.evaluate("Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true})")
        click(page, 'exit')
        page.reload(wait_until='load')
        page.locator('#headsBtn').click()
        expect(page.locator('.hu-resume')).to_be_visible()
        click(page, 'resume')
        click(page, 'countdown')
        advance(page, 3100)
        phase(page, 'playing')
        expect(page.locator('#hu-word')).to_have_text(word)
        expect(page.locator('#hu-points')).to_have_text('2')
        context.close()
        print('PASS: permission depuis le clic, gestes haut/bas des deux côtés, anti-rebond, capteurs perdus, arrière-plan et reprise après rechargement', flush=True)

        for permission in ['denied', 'throw', 'absent', 'silent', 'pending']:
            context, page = new_page()
            setup(page, 'motion')
            if permission == 'absent':
                page.evaluate('window.DeviceOrientationEvent = undefined')
            else:
                page.evaluate('p => testPermission = p', 'granted' if permission == 'silent' else permission)
            page.locator('#hu-start').click()
            phase(page, 'ready')
            if permission == 'pending':
                click(page, 'exit')
                page.evaluate("testResolvePermission('granted')")
                page.wait_for_timeout(100)
                expect(page.locator('#setup')).to_be_visible()
                expect(page.locator('#heads')).to_be_hidden()
            else:
                if permission == 'silent':
                    advance(page, 4500)
                expect(page.locator('[data-act="countdown"]')).to_be_visible()
                begin = page.locator('[data-act="countdown"]')
                begin.click()
                advance(page, 3100)
                phase(page, 'playing')
                click(page, 'correct')
                expect(page.locator('#hu-points')).to_have_text('1')
            context.close()
        print('PASS: autorisation refusée, API absente, capteurs muets, erreur et sortie pendant la demande', flush=True)

        context, page = new_page()
        setup(page, 'motion')
        page.locator('#hu-start').click()
        page.evaluate('testTilt(0, 90)')
        advance(page, 650)
        phase(page, 'ready')  # paysage obligatoire pour les gestes
        page.set_viewport_size({'width': 852, 'height': 393})
        advance(page, 650)
        phase(page, 'countdown')
        page.set_viewport_size({'width': 393, 'height': 852})
        phase(page, 'ready')
        page.set_viewport_size({'width': 852, 'height': 393})
        advance(page, 650)
        advance(page, 3100)
        phase(page, 'playing')
        page.set_viewport_size({'width': 393, 'height': 852})
        phase(page, 'paused')
        expect(page.locator('.hu-paused')).to_contain_text('horizontale')
        context.close()
        print('PASS: préparation en paysage, interruption du compte à rebours et pause en portrait', flush=True)

        context, page = new_page()
        page.evaluate('window.AudioContext = window.webkitAudioContext = undefined')
        setup(page)
        begin_manual(page)
        click(page, 'correct')
        expect(page.locator('#hu-points')).to_have_text('1')
        advance(page, 700)
        click(page, 'pass')
        expect(page.locator('#hu-word')).to_have_text('Passé !')
        assert not sounds(page)
        context.close()
        print('PASS: sons distincts sans saturation ni clic, une lecture par bouton/geste, jeu disponible sans audio', flush=True)

        assert not errors, errors
        browser.close()
        print('PASS: aucune erreur JavaScript ou ressource manquante', flush=True)
finally:
    server.shutdown()
    server.server_close()

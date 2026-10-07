"""Séries individuelles, célébration Mister White et menus sur mobile / PC."""
import json
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/jdd-visual-feedback-review')
OUT.mkdir(exist_ok=True)
for name in ['hero', 'undercover', 'mascotte', 'culture', 'apero', 'hardcore',
             'torgnole', 'personnalise', 'geography', 'football']:
    with Image.open(REPO / f'image/home/{name}.webp') as art:
        assert art.mode == 'RGBA' and art.getextrema()[3] == (0, 255), name
        assert art.getpixel((0, 0))[3] == 0, name
with Image.open(REPO / 'image/undercover/white-win.webp') as art:
    assert art.mode == 'RGBA' and art.getpixel((0, 0))[3] == 0


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO), **kwargs)

    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=shutil.which('chromium'), headless=True)

        def home(width=393, height=852, undercover=None, reduced=False):
            context = browser.new_context(viewport={'width': width, 'height': height},
                is_mobile=width < 900, has_touch=True, service_workers='block',
                reduced_motion='reduce' if reduced else 'no-preference')
            script = "localStorage.setItem('jdd.players',JSON.stringify(['Alex','Alex (invité)']));"
            identities = [{'id': '11111111-1111-4111-8111-111111111111', 'kind': 'account', 'name': 'Alex', 'label': 'Alex'},
                          {'id': '22222222-2222-4222-8222-222222222222', 'kind': 'guest', 'name': 'Alex', 'label': 'Alex (invité)'}]
            script += 'localStorage.setItem("jdd.participants.v1",' + json.dumps(json.dumps(identities)) + ');'
            if undercover:
                script += 'localStorage.setItem("jdd.undercover.v2",' + json.dumps(json.dumps(undercover)) + ');'
            script += 'window.offset=0;const now=Date.now;Date.now=()=>now()+offset;'
            context.add_init_script(script)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/', wait_until='load')
            return context, page

        def next_question(page):
            page.evaluate('document.getElementById("currentQuestion").dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:innerWidth-5}))')

        context, page = home()
        page.evaluate('''() => {
          window.turn=0; JDD.nextPlayer=()=>['Alex','Alex (invité)'][turn++%2];
          JDD.DATA.culture=[];
          JDD.DATA.cultureMcq=[{question:'Quel nombre ?',choices:['Quatre','Cinq','Six','Sept'],answerIndex:0}];
          JDD.drawCard=(key,list)=>list[0];JDD.shuffle=list=>list;
          window.cultureEvents=[];JDDCloud.record=(event,rows)=>cultureEvents.push(rows);
        }''')
        page.locator('[data-mode="culture"]').click();page.locator('#startBtn').click()
        counts = [0, 0]
        for i in range(24):
            player = i % 2
            badge = page.locator('#cultureStreak')
            if counts[player] >= 2:
                expect(badge).to_be_visible()
                assert badge.get_attribute('aria-label') == f'{counts[player]} bonnes réponses de suite'
            else:
                expect(badge).to_be_hidden()
            # L'invité répond faux : sa série ne doit jamais afficher celle du compte.
            correct = player == 0
            page.locator('#mcqGrid button').nth(0 if correct else 1).click()
            counts[player] = counts[player] + 1 if correct else 0
            if i == 20:
                page.screenshot(path=str(OUT / 'culture-streak-10.png'), full_page=True)
            next_question(page)
        expect(page.locator('#cultureStreak')).to_have_attribute('aria-label', '12 bonnes réponses de suite')
        # Sauter la question rompt uniquement la série du joueur concerné.
        next_question(page);next_question(page)
        expect(page.locator('#cultureStreak')).to_be_hidden()
        assert len(page.evaluate('cultureEvents')) == 25, 'Une seule statistique par réponse, plus le début de partie.'
        # Les questions ouvertes peuvent aussi être arbitrées après révélation.
        page.evaluate("JDD.DATA.cultureMcq=[];JDD.DATA.culture=[{question:'Combien ?',answer:'Quatre'}]")
        for i in range(5):
            next_question(page)
            page.locator('#showAnswerBtn').click()
            page.locator('[data-culture-verdict="correct"]').click()
            assert page.locator('#cultureVerdicts button').evaluate_all('buttons=>buttons.every(button=>button.disabled)')
            page.wait_for_timeout(510)
        assert page.evaluate('cultureEvents.at(-1)[0].metrics.correct_answers') == 1
        assert page.evaluate('cultureEvents.at(-1)[0].metrics.answers_revealed') == 1
        page.locator('#backLogo').click();page.locator('[data-mode="debut"]').click();page.locator('#startBtn').click()
        expect(page.locator('#cultureStreak')).to_be_hidden()
        context.close()
        print('PASS: séries personnelles compte/invité homonymes, 12 réponses, erreur / saut, arbitrage ouvert et absence dans les autres modes', flush=True)

        for width, height in [(320, 568), (393, 852), (852, 393), (1280, 800)]:
            context, page = home(width, height)
            assert page.locator('#startBtn img').count() == 0
            page.locator('#geographyBtn').click()
            assert page.locator('.geo-mode strong').all_text_contents() == ['Ville', 'Département', 'Pays']
            assert page.locator('.geo-mode .jdd-arrow svg path').evaluate_all('nodes=>nodes.every(n=>n.getAttribute("d")==="M5 19 19 5M5 5h14v14")')
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
            if width == 393: page.screenshot(path=str(OUT / 'geographie-menu.png'), full_page=True)
            page.locator('[data-geo="exit"]').click();page.locator('#headsBtn').click()
            page.evaluate("DeviceOrientationEvent.requestPermission=()=>Promise.resolve('denied')")
            page.locator('#hu-start').click();page.locator('[data-act="buttons"], [data-act="countdown"]').click()
            page.evaluate('offset+=3100')
            expect(page.locator('#heads')).to_have_attribute('data-screen', 'playing')
            expect(page.locator('#hu-streak')).to_be_hidden()
            for count in range(1, 4):
                page.locator('[data-act="correct"]').click()
                page.wait_for_timeout(750)
                if count >= 2:
                    expect(page.locator('#hu-streak')).to_have_attribute('aria-label', f'{count} bonnes réponses de suite')
                    expect(page.locator('#hu-streak')).to_be_visible()
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
            if width == 393: page.screenshot(path=str(OUT / 'devine-tete-streak.png'), full_page=True)
            page.locator('[data-act="pause"]').click();page.locator('[data-act="resume"]').click()
            page.locator('[data-act="countdown"]').click()
            page.evaluate('offset+=3100')
            expect(page.locator('#heads')).to_have_attribute('data-screen', 'playing')
            expect(page.locator('#hu-streak')).to_have_attribute('aria-label', '3 bonnes réponses de suite')
            page.locator('[data-act="pass"]').click();expect(page.locator('#hu-streak')).to_be_hidden()
            context.close()
        print('PASS: menus Ville / Département / Pays, flèches SVG, lancement sans logo ; Devine Tête après 2 réponses, reprise et passage, quatre formats', flush=True)

        def white_game(guess=True, has_white=True):
            people = [{'id': str(i), 'name': name, 'score': 0} for i, name in enumerate(['Alex', 'Bob', 'Chloé'])]
            roles = ['white' if has_white else 'undercover', 'civil', 'civil']
            slots = [{'pid': str(i), 'role': role, 'seen': True, 'alive': True} for i, role in enumerate(roles)]
            return {'players': people, 'settings': {'count': 3, 'undercover': 0 if has_white else 1, 'white': int(has_white)},
                'game': {'phase': 'vote', 'words': {'civil': 'Chat', 'under': 'Chien'}, 'slots': slots,
                    'round': 1, 'starter': 1, 'modal': {'type': 'guess', 'slot': 0} if guess else {'type': 'eliminated', 'slot': 2}}}

        for guess, has_white, reduced in [(True, True, False), (False, True, False), (False, False, False), (True, True, True)]:
            saved = white_game(guess, has_white)
            if not guess: saved['game']['slots'][2]['alive'] = False
            context, page = home(undercover=saved, reduced=reduced)
            page.locator('#undercoverBtn').click()
            if guess:
                page.locator('#uc-guess-input').fill('chat');page.locator('[data-act="submit-guess"]').click()
            else: page.locator('[data-act="eliminated-ok"]').click()
            overlay = page.locator('.jdd-celebration')
            if has_white:
                expect(overlay).to_be_visible()
                assert overlay.evaluate('n=>getComputedStyle(n).pointerEvents') == 'none'
                assert overlay.evaluate('n=>getComputedStyle(n).backgroundColor') == 'rgba(0, 0, 0, 0)'
                page.wait_for_function('document.querySelector(".jdd-celebration-art").naturalWidth>0')
                if reduced: assert page.locator('.jdd-celebration-art').evaluate('n=>getComputedStyle(n).animationName') == 'none'
                else:
                    page.wait_for_timeout(300);page.screenshot(path=str(OUT / 'mister-white-victoire.png'), full_page=True)
                page.wait_for_timeout(1800)
                expect(overlay).to_have_count(0)
                page.reload(wait_until='load');page.locator('#undercoverBtn').click()
                expect(overlay).to_have_count(0)
            else: expect(overlay).to_have_count(0)
            context.close()
        print('PASS: Mister White devine / victoire des infiltrés, deux secondes transparentes, aucun effet pour Undercover seul, réduction des animations et aucune répétition', flush=True)
        assert not errors, errors
        browser.close()
finally:
    server.shutdown()

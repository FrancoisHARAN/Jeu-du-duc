#!/usr/bin/env python3
"""Joueurs communs, Undercover complet et présentation mobile dans Chromium."""
import json
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
CHROMIUM = os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium')
assert CHROMIUM, 'Chromium est nécessaire.'
OUT = Path('/tmp/jdd-shared-review')
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

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROMIUM, headless=True)

        def home(names=None, width=393, height=852):
            context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=True,
                                          is_mobile=width < 900, service_workers='block')
            if names:
                context.add_init_script('localStorage.setItem("jdd.players", ' + json.dumps(json.dumps(names)) + ')')
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
            page.goto(base, wait_until='load')
            return context, page

        def act(page, action):
            page.locator(f'#undercover [data-act="{action}"]').click()

        def uc_store(page):
            return page.evaluate('JSON.parse(localStorage.getItem("jdd.undercover.v2"))')

        def distribute(page, screenshot=False):
            act(page, 'start')
            act(page, 'close-modal')
            slots = uc_store(page)['game']['slots']
            assert all(slot['pid'] for slot in slots), 'Tous les prénoms doivent être repris sans ressaisie.'
            for i in range(len(slots)):
                page.locator(f'#undercover [data-act="pick-known"][data-slot="{i}"]').click()
                act(page, 'reveal')
                expect(page.locator('.uc-word')).not_to_be_empty()
                assert page.locator('.uc-word').evaluate('el => el.scrollWidth <= el.clientWidth')
                if screenshot and i == 0:
                    page.screenshot(path=str(OUT / 'undercover-secret.png'))
                act(page, 'word-ok')
            expect(page.locator('#undercover')).to_have_attribute('data-screen', 'describe')

        def eliminate(page, index):
            act(page, 'to-vote')
            page.locator(f'#undercover [data-act="vote"][data-slot="{index}"]').click()
            act(page, 'eliminate')
            act(page, 'eliminated-ok')

        context, page = home()
        people = page.locator('.home-players').bounding_box()
        assert people['y'] < page.locator('.home-hero').bounding_box()['y']
        page.screenshot(path=str(OUT / 'accueil.png'))
        page.locator('#headsBtn').click()
        expect(page.locator('#playersDialogMode')).to_have_text('Devine Tête')
        page.locator('#dialogPlayerInput').fill('Alice')
        page.locator('#dialogAddBtn').click()
        expect(page.locator('#dialogStartBtn')).to_be_disabled()
        page.locator('#dialogPlayerInput').fill('Bob')
        page.locator('#dialogStartBtn').click()
        expect(page.locator('#heads')).to_have_attribute('data-screen', 'setup')
        assert page.locator('#hu-player option').all_text_contents() == ['Alice', 'Bob']
        page.locator('#heads [data-act="edit-players"]').click()
        expect(page.locator('#playersDialog')).to_be_visible()
        page.locator('#dialogPlayerInput').fill('Chloé')
        page.locator('#dialogStartBtn').click()
        assert page.locator('#hu-player option').all_text_contents() == ['Alice', 'Bob', 'Chloé']
        page.locator('#hu-player').select_option('Chloé')
        page.locator('#heads [data-act="exit"]').click()
        assert page.evaluate('JDD.players') == ['Alice', 'Bob', 'Chloé']
        page.locator('#undercoverBtn').click()
        expect(page.locator('#uc-count-title')).to_contain_text('3 joueurs')
        assert [p['name'] for p in uc_store(page)['players']] == ['Alice', 'Bob', 'Chloé']
        page.screenshot(path=str(OUT / 'undercover-reglages.png'))
        distribute(page, True)
        original = uc_store(page)
        act(page, 'exit-app')
        page.locator('#playerInput').fill('Dani')
        page.locator('#addBtn').click()
        page.locator('#undercoverBtn').click()
        assert uc_store(page)['game'] == original['game'], 'Modifier la bande ne doit pas couper une partie en cours.'
        page.screenshot(path=str(OUT / 'undercover-description.png'))
        intruder = next(i for i, slot in enumerate(original['game']['slots']) if slot['role'] == 'undercover')
        eliminate(page, intruder)
        expect(page.locator('.uc-end h3')).to_have_text('Les Civils ont gagné !')
        end = uc_store(page)
        for slot in end['game']['slots']:
            player = next(p for p in end['players'] if p['id'] == slot['pid'])
            assert player['score'] == (2 if slot['role'] == 'civil' else 0)
        page.screenshot(path=str(OUT / 'undercover-resultats.png'))
        act(page, 'end-home')
        expect(page.locator('#uc-count-title')).to_contain_text('4 joueurs')
        assert sum(p['score'] for p in uc_store(page)['players']) == 4
        act(page, 'edit-players')
        page.locator('#dialogPlayerInput').fill('Emma')
        page.locator('#dialogStartBtn').click()
        expect(page.locator('#uc-count-title')).to_contain_text('5 joueurs')
        act(page, 'exit-app')
        page.locator('#headsBtn').click()
        assert page.locator('#hu-player option').all_text_contents() == ['Alice', 'Bob', 'Chloé', 'Dani', 'Emma']
        expect(page.locator('#hu-player')).to_have_value('Chloé')
        page.locator('#heads [data-act="exit"]').click()
        page.reload(wait_until='load')
        expect(page.locator('#playerList .player-item')).to_have_count(5)
        context.close()
        print('PASS: noms communs, modification depuis les 2 jeux, reprise, victoire et scores conservés', flush=True)

        # Limite officielle d'Undercover : pas de suppression silencieuse de noms.
        context, page = home([f'Joueur {i}' for i in range(1, 22)])
        page.locator('#undercoverBtn').click()
        expect(page.locator('#playersDialogStatus')).to_contain_text('20 joueurs maximum')
        expect(page.locator('#dialogStartBtn')).to_be_disabled()
        page.locator('#dialogPlayerList button[aria-label="Retirer Joueur 21"]').click()
        page.locator('#dialogStartBtn').click()
        assert len(uc_store(page)['players']) == 20
        context.close()

        context, page = home(['Alice', 'Bob', 'Chloé', 'Dani', 'Emma'])
        page.locator('#undercoverBtn').click()
        distribute(page)
        saved = uc_store(page)
        white = next(i for i, slot in enumerate(saved['game']['slots']) if slot['role'] == 'white')
        eliminate(page, white)
        page.locator('#uc-guess-input').fill(saved['game']['words']['civil'])
        act(page, 'submit-guess')
        expect(page.locator('.uc-end h3')).to_have_text('Mr. White a gagné !')
        saved = uc_store(page)
        winner = next(p for p in saved['players'] if p['id'] == saved['game']['slots'][white]['pid'])
        assert winner['score'] == 6
        context.close()
        print('PASS: limite de 20 joueurs explicite et victoire de Mr. White', flush=True)

        context, page = home()
        page.evaluate('''() => {
          localStorage.removeItem('jdd.players.shared-v1');
          localStorage.setItem('jdd.undercover.v2', JSON.stringify({
            players: [{id:'a',name:'Alice',score:7},{id:'b',name:'Bob',score:2},{id:'c',name:'Chloé',score:0}],
            settings:{count:3,undercover:1,white:0,hard:false}, game:null, usedPairs:[]
          }));
        }''')
        page.reload(wait_until='load')
        assert page.evaluate('JDD.players') == ['Alice', 'Bob', 'Chloé']
        page.locator('#undercoverBtn').click()
        assert uc_store(page)['players'][0]['score'] == 7
        act(page, 'exit-app')
        for name in ['Alice', 'Bob', 'Chloé']:
            page.locator(f'#playerList button[aria-label="Retirer {name}"]').click()
        page.reload(wait_until='load')
        assert page.evaluate('JDD.players') == []
        context.close()
        print('PASS: anciens noms Undercover récupérés avec leurs scores, retrait volontaire respecté', flush=True)

        for width, height in [(320, 568), (360, 640), (393, 852), (430, 932), (568, 320), (852, 393), (1440, 900)]:
            context, page = home(['Alice', 'Bob', 'Chloé'], width, height)
            page.locator('#undercoverBtn').click()
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
            assert page.locator('#undercover').evaluate('el => el.scrollWidth <= el.clientWidth')
            distribute(page)
            act(page, 'to-vote')
            assert not page.locator('#undercover').evaluate('el => el.scrollWidth > el.clientWidth')
            assert page.locator('#undercover [data-act="vote"]').first.bounding_box()['height'] >= 44
            act(page, 'quit')
            act(page, 'quit-confirm')
            expect(page.locator('#undercover')).to_have_attribute('data-screen', 'setup')
            context.close()
        assert not errors, errors
        browser.close()
        print('PASS: réglages, secrets, description, vote et confirmations sur 7 formats, sans erreur JavaScript', flush=True)
finally:
    server.shutdown()
    server.server_close()

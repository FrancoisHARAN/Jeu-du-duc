#!/usr/bin/env python3
"""Édition mobile des joueurs : position, saisies et réglages conservés."""
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
        for game, button, field, panel in [
            ('accueil', None, '#playerInput', None),
            ('Duel Foot', '#duelBtn', '#duel-players input', None),
            ('échecs', '#chessBtn', '#chess-players input', None),
            ('Devine Tête', '#headsBtn', '#hu-player input', None),
            ('géographie', '#geographyBtn', '#geo-players input', None),
            ('quiz foot', '#footballBtn', '#foot-players input', None),
            ('Undercover', '#undercoverBtn', '#uc-players input', '#undercover'),
            ('panneau joueurs', None, '#dialogPlayerInput', '.home-dialog-content'),
        ]:
            context = browser.new_context(viewport={'width': 393, 'height': 600},
                                          is_mobile=True, has_touch=True, service_workers='block')
            names = [] if panel == '.home-dialog-content' else [f'Joueur {i}' for i in range(1, 13)]
            context.add_init_script('localStorage.setItem("jdd.players", ' + json.dumps(json.dumps(names)) + ')')
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base, wait_until='load')
            navigations = []
            page.on('request', lambda request: navigations.append(request.url) if request.is_navigation_request() else None)
            if button:
                page.locator(button).click()
            if game == 'géographie':
                page.locator('[data-geo-mode="cities"]').click()
            if game == 'échecs':
                page.locator('.chess-roster summary').click()
                page.locator('input[name="chess-minutes"][value="10"]').check()
                page.locator('#chess-player-0').select_option('Joueur 5')
            if game == 'Duel Foot':
                assert page.locator('.duel-roster').evaluate('el => el.open')
                assert page.locator('.duel-roster').evaluate('el => Boolean(el.compareDocumentPosition(document.querySelector(".duel-contenders")) & Node.DOCUMENT_POSITION_FOLLOWING)')
                page.locator('#duel-player-0').select_option('Joueur 5')
                page.locator('input[name="duel-formation-0"][value="2-2-1"]').check()
            if game == 'panneau joueurs':
                page.locator('#startBtn').click()
                for name in [f'Joueur {i}' for i in range(1, 13)]:
                    page.locator(field).fill(name)
                    page.locator(field).press('Enter')
            input_ = page.locator(field)
            plus = page.locator('#addBtn' if game == 'accueil' else '#dialogAddBtn' if game == 'panneau joueurs' else field.rsplit(' ', 1)[0] + ' .jdd-player-add')
            for name, enter in [('Alice', True), ('Bob', False)]:
                input_.fill(name)
                input_.evaluate('''(el, panel) => {
                    el.scrollIntoView({block: 'start', behavior: 'instant'});
                    if (panel) document.querySelector(panel).scrollTop -= 80;
                    else scrollBy({top: -80, behavior: 'instant'});
                }''', panel)
                before = input_.evaluate('el => { window.savedField = el; return el.getBoundingClientRect().top; }')
                assert page.evaluate('(panel) => panel ? document.querySelector(panel).scrollTop : scrollY', panel) > 100, game
                if enter:
                    input_.press('Enter')
                else:
                    plus.click()
                expect(input_).to_have_value('')
                expect(input_).to_be_focused()
                assert input_.evaluate('el => el === window.savedField'), game
                after = input_.evaluate('el => el.getBoundingClientRect().top')
                assert abs(after - before) <= 2, (game, before, after)
                assert name in page.evaluate('JDD.players'), game
            # Une actualisation des comptes ne remplace pas le champ en cours.
            input_.fill('Prénom en cours')
            input_.evaluate('el => el.setSelectionRange(3, 6)')
            before = input_.evaluate('el => el.getBoundingClientRect().top')
            page.evaluate('''() => {
                JDDAccounts.updateDirectories();
                dispatchEvent(new Event('jdd:profiles'));
            }''')
            expect(input_).to_have_value('Prénom en cours')
            expect(input_).to_be_focused()
            assert input_.evaluate('el => el.selectionStart === 3 && el.selectionEnd === 6')
            assert abs(input_.evaluate('el => el.getBoundingClientRect().top') - before) <= 2, game
            # Retrait par le vrai bouton, avec brouillon et formulaire conservés.
            parent = '#playerList' if game == 'accueil' else '#dialogPlayerList' if game == 'panneau joueurs' else field.rsplit(' ', 1)[0]
            remove = page.locator(parent + ' button[aria-label="Retirer Bob"]')
            remove.evaluate('''(el, panel) => el.addEventListener('pointerdown', () => {
                window.beforeRemove = panel ? document.querySelector(panel).scrollTop : scrollY;
            }, {once: true})''', panel)
            remove.click()
            expect(input_).to_have_value('Prénom en cours')
            assert input_.evaluate('el => el === window.savedField'), game
            after = page.evaluate('(panel) => panel ? document.querySelector(panel).scrollTop : scrollY', panel)
            assert abs(after - page.evaluate('beforeRemove')) <= 2, (game, after, page.evaluate('beforeRemove'))
            assert 'Bob' not in page.evaluate('JDD.players')
            if game == 'Duel Foot':
                expect(page.locator('#duel-player-0')).to_have_value('Joueur 5')
                expect(page.locator('input[name="duel-formation-0"][value="2-2-1"]')).to_be_checked()
                assert page.locator('.duel-roster').evaluate('el => el.open')
                page.screenshot(path='/tmp/jdd-duel-players-first.png', full_page=True)
            if game == 'échecs':
                expect(page.locator('#chess-player-0')).to_have_value('Joueur 5')
                expect(page.locator('input[name="chess-minutes"][value="10"]')).to_be_checked()
                assert page.locator('.chess-roster').evaluate('el => el.open')
            assert not navigations, (game, navigations)
            context.close()
            print(f'PASS: {game}, ajout clavier/bouton, retrait, brouillon, focus et défilement conservés', flush=True)
        assert not errors, errors
        browser.close()
finally:
    server.shutdown()
    server.server_close()

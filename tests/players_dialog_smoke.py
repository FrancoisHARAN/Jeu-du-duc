#!/usr/bin/env python3
"""Parcours réel d'ajout de joueurs avant une partie, sur écran mobile."""
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

        def open_home(width=393, height=852):
            context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('dialog', lambda dialog: (errors.append('Alerte native : ' + dialog.message), dialog.accept()))
            page.goto(base, wait_until='load')
            return context, page

        # Culture G. peut se lancer à un joueur, même sans appuyer d'abord sur +.
        context, page = open_home()
        page.locator('[data-mode="culture"]').click()
        page.locator('#startBtn').click()
        expect(page.locator('#playersDialog')).to_be_visible()
        expect(page.locator('#dialogPlayerInput')).to_be_focused()
        page.keyboard.press('Shift+Tab')
        assert page.evaluate('document.activeElement.closest("#playersDialog") !== null')
        expect(page.locator('#playersDialogMode')).to_have_text('Culture G.')
        expect(page.locator('#dialogStartBtn')).to_be_disabled()
        page.locator('#dialogPlayerInput').fill(' Alice ')
        expect(page.locator('#dialogStartBtn')).to_be_enabled()
        page.locator('#dialogStartBtn').click()
        expect(page.locator('#playersDialog')).not_to_be_visible()
        expect(page.locator('#game')).to_be_visible()
        expect(page.locator('#game')).to_have_attribute('data-category', 'culture')
        assert page.evaluate('JDD.players') == ['Alice']
        page.locator('#backLogo').click()
        expect(page.locator('#homePlayerCount')).to_have_text('1 joueur')
        page.locator('#startBtn').click()
        expect(page.locator('#game')).to_be_visible()
        expect(page.locator('#playersDialog')).not_to_be_visible()
        context.close()

        # Tous les autres modes gardent leur minimum de deux joueurs.
        for mode in ['debut', 'hardcore', 'alcool', 'custom']:
            context, page = open_home()
            page.locator(f'[data-mode="{mode}"]').click()
            if mode == 'custom':
                for category, value in [('debut', 0), ('hardcore', 0), ('alcool', 0), ('culture', 100)]:
                    page.locator(f'#weight-{category}').evaluate('(el, value) => { el.value = value; el.dispatchEvent(new Event("input")); }', value)
            page.locator('#startBtn').click()
            page.locator('#dialogPlayerInput').fill('Alice')
            page.locator('#dialogPlayerInput').press('Enter')
            expect(page.locator('#dialogPlayerList .player-item')).to_have_count(1)
            expect(page.locator('#dialogStartBtn')).to_be_disabled()
            page.locator('#dialogPlayerInput').fill('alice')
            page.locator('#dialogAddBtn').click()
            expect(page.locator('#dialogPlayerInput')).to_have_attribute('aria-invalid', 'true')
            expect(page.locator('#playersDialogStatus')).to_contain_text('déjà')
            assert page.evaluate('JDD.players') == ['Alice']
            page.locator('#dialogPlayerInput').fill('Bob')
            expect(page.locator('#dialogStartBtn')).to_be_enabled()
            page.locator('#dialogStartBtn').click()
            expect(page.locator('#game')).to_be_visible()
            assert page.evaluate('JDD.players') == ['Alice', 'Bob']
            if mode == 'custom':
                expect(page.locator('#game')).to_have_attribute('data-category', 'culture')
            page.locator('#backLogo').click()
            expect(page.locator(f'[data-mode="{mode}"]')).to_have_attribute('aria-pressed', 'true')
            expect(page.locator('#playerList .player-item')).to_have_count(2)
            context.close()
        print('PASS: 5 modes, minimum 1/2 joueurs, prénom final au lancement, doublons et mode personnalisé', flush=True)

        # Ajout/retrait partagé avec l'accueil, fermeture, focus et persistance.
        context, page = open_home()
        page.locator('#startBtn').click()
        page.locator('#dialogAddBtn').click()
        expect(page.locator('#playersDialogStatus')).to_contain_text('Entre un prénom')
        page.locator('#dialogPlayerInput').fill('Alice')
        page.locator('#dialogAddBtn').click()
        page.locator('#closePlayersDialog').click()
        expect(page.locator('#startBtn')).to_be_focused()
        expect(page.locator('#homePlayerCount')).to_have_text('1 joueur')
        expect(page.locator('#playerList .player-item')).to_have_count(1)
        page.locator('#startBtn').click()
        expect(page.locator('#dialogPlayerList .player-item')).to_have_count(1)
        page.mouse.click(3, 3)
        expect(page.locator('#playersDialog')).not_to_be_visible()
        page.locator('#startBtn').click()
        page.locator('#dialogPlayerList button[aria-label="Retirer Alice"]').click()
        expect(page.locator('#homePlayerCount')).to_have_text('0 joueur')
        expect(page.locator('#dialogPlayerInput')).to_be_focused()
        page.locator('#dialogPlayerInput').fill('Alice')
        page.locator('#dialogAddBtn').click()
        page.locator('#dialogPlayerInput').fill('Bob')
        page.locator('#dialogAddBtn').click()
        expect(page.locator('#dialogStartBtn')).to_be_enabled()
        screenshot_dir = os.environ.get('PLAYER_DIALOG_SCREENSHOT_DIR')
        if screenshot_dir:
            path = Path(screenshot_dir)
            path.mkdir(parents=True, exist_ok=True)
            page.locator('#dialogPlayerInput').evaluate('el => el.blur()')
            page.screenshot(path=str(path / 'joueurs-mobile.png'))
        page.keyboard.press('Escape')
        expect(page.locator('#playersDialog')).not_to_be_visible()
        page.reload(wait_until='load')
        expect(page.locator('#playerList .player-item')).to_have_count(2)
        assert page.evaluate('JDD.players') == ['Alice', 'Bob']
        context.close()
        print('PASS: saisie vide, retrait, synchronisation, fermeture/Escape et prénoms conservés après rechargement', flush=True)

        # Petits écrans, paysage et clavier simulé : bouton accessible en défilant.
        for width, height in [(320, 568), (375, 667), (393, 852), (430, 932), (844, 390), (393, 400)]:
            context, page = open_home(width, height)
            page.locator('#startBtn').click()
            dialog = page.locator('#playersDialog')
            bounds = dialog.bounding_box()
            assert bounds['x'] >= 0 and bounds['y'] >= 0 and bounds['x'] + bounds['width'] <= width
            assert bounds['y'] + bounds['height'] <= height
            assert dialog.evaluate('el => el.scrollWidth <= el.clientWidth')
            assert page.locator('#dialogPlayerInput').evaluate('el => parseFloat(getComputedStyle(el).fontSize)') >= 16
            page.locator('#dialogPlayerInput').fill('Alice')
            page.locator('#dialogAddBtn').click()
            page.locator('#dialogPlayerInput').fill('Bob')
            page.locator('#dialogStartBtn').click()
            expect(page.locator('#game')).to_be_visible()
            context.close()
        assert not errors, errors
        browser.close()
        print('PASS: 6 formats mobiles dont paysage et hauteur réduite, sans erreur JavaScript ni alerte native', flush=True)
finally:
    server.shutdown()
    server.server_close()

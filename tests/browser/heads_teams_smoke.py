"""Édition directe des joueurs et points des équipes, sans perdre une manche en pause."""

import os
from pathlib import Path
import shutil
import threading
from http.server import ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright

from support.http import RepositoryHandler

OUT = Path('/tmp/jdd-teams-review')
OUT.mkdir(exist_ok=True)


Handler = RepositoryHandler


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),
            headless=True,
        )
        context = browser.new_context(
            viewport={'width': 393, 'height': 852},
            is_mobile=True,
            has_touch=True,
            service_workers='block',
        )
        context.add_init_script(
            '''
          if (!localStorage.getItem('jdd.players')) localStorage.setItem('jdd.players', JSON.stringify(['Alice','Bob','Chloé']));
          window.offset = 0; const now = Date.now; Date.now = () => now() + offset;
          DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied');
        '''
        )
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{server.server_port}', wait_until='load')
        page.locator('#headsBtn').click()

        def store():
            return page.evaluate('JSON.parse(localStorage.getItem("jdd.heads.v1"))')

        def action(act):
            page.locator(f'#heads [data-act="{act}"]').click()

        def advance(ms):
            page.evaluate('ms => offset += ms', ms)
            page.wait_for_timeout(120)

        def begin():
            expect(page.locator('#heads')).to_have_attribute('data-screen', 'ready')
            page.locator('#heads [data-act="countdown"], #heads [data-act="buttons"]').click()
            advance(3100)
            expect(page.locator('#heads')).to_have_attribute('data-screen', 'playing')

        assert page.locator('#hu-teams-enabled').count() == 0
        expect(page.locator('#hu-player .jdd-player-add')).to_be_visible()
        expect(page.locator('#hu-player .jdd-player-remove')).to_have_count(3)
        page.locator('#hu-player input').fill(' alice ')
        page.locator('#hu-player .jdd-player-add').click()
        expect(page.locator('.jdd-player-error')).to_contain_text('déjà')
        for name in ['David', 'Emma']:
            page.locator('#hu-player input').fill(name)
            page.locator('#hu-player .jdd-player-add').click()
            expect(page.locator('#hu-teams-enabled')).to_be_visible()
        page.locator('#hu-teams-enabled').check()
        teams = store()['teams']['members']
        assert sorted(sum(teams, [])) == ['Alice', 'Bob', 'Chloé', 'David', 'Emma']
        assert sorted(map(len, teams)) == [2, 3]
        name = teams[0][0]
        page.locator(f'[data-move-player="{name}"]').click()
        moved = store()['teams']['members']
        assert name not in moved[0] and name in moved[1]
        action('shuffle-teams')
        teams = store()['teams']['members']
        assert sorted(sum(teams, [])) == ['Alice', 'Bob', 'Chloé', 'David', 'Emma']
        assert len(set(sum(teams, []))) == 5 and abs(len(teams[0]) - len(teams[1])) == 1
        page.locator('#hu-player .jdd-player-choice').filter(has_text='Alice').click()
        team_index = next(i for i, group in enumerate(teams) if 'Alice' in group)
        page.screenshot(path=str(OUT / 'equipes.png'), full_page=True)
        page.locator('#hu-start').click()
        begin()
        expect(page.locator('.hu-live-team strong')).to_have_text(f'Équipe {team_index + 1}')
        assert page.locator('.hu-live-team small').inner_text() == ' · '.join(teams[team_index])
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.screenshot(path=str(OUT / 'cartes-equipe.png'))
        action('correct')
        advance(700)
        action('correct')
        advance(700)
        advance(60000)
        expect(page.locator('#heads')).to_have_attribute('data-screen', 'results')
        assert store()['teams']['totals'][team_index]['points'] == 2
        assert store()['totals'] == [], 'Les mots sont comptés pour l’équipe, pas pour un joueur.'
        page.locator('[data-correct-row="0"]').click()
        assert store()['teams']['totals'][team_index]['points'] == 1
        assert store()['history'][-1]['team']['members'] == teams[team_index]
        action('next-round')
        begin()
        active = store()['active']
        assert active['team']['index'] == 1 - team_index
        assert active['player'] in teams[1 - team_index]
        action('correct')
        advance(700)
        action('exit')
        page.locator('#headsBtn').click()
        expect(page.locator('[data-act="resume"]')).to_be_visible()
        assert store()['active']['team'] == active['team']
        # La même liste est modifiée directement, sans ouvrir une fenêtre système.
        for name in ['Emma', 'David']:
            page.locator(f'#hu-player [aria-label="Retirer {name}"]').click()
            page.wait_for_timeout(450)
        assert page.locator('#hu-teams-enabled').count() == 0
        assert not store()['teams']['enabled']
        assert (
            store()['active']['team'] == active['team']
        ), 'Les équipes de la manche en pause restent conservées.'
        action('resume')
        begin()
        assert page.locator('.hu-live-team small').inner_text() == ' · '.join(
            active['team']['members']
        )
        advance(60000)
        expect(page.locator('#heads')).to_have_attribute('data-screen', 'results')
        assert store()['teams']['totals'][1 - team_index]['points'] == 1
        action('settings')
        page.locator('#hu-start').click()
        begin()
        assert (
            store()['active']['team'] is None
        ), 'Sous quatre joueurs, la nouvelle manche est individuelle.'
        assert page.locator('.hu-live-team').count() == 0
        action('exit')
        assert page.evaluate('JDD.players') == ['Alice', 'Bob', 'Chloé']
        page.reload(wait_until='load')
        page.locator('#headsBtn').click()
        assert store()['teams']['totals'][team_index]['points'] == 1
        assert page.locator('#hu-teams-enabled').count() == 0
        assert not errors, errors
        context.close()
        browser.close()
        print(
            'PASS: +/− partagés, seuil quatre, transferts, mélange, points et corrections par équipe, alternance, reprise et stockage',
            flush=True,
        )
finally:
    server.shutdown()

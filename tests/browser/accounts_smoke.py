#!/usr/bin/env python3
"""Comptes/PWA sur Chromium, avec Supabase simulé et aucun email réel envoyé."""
import json
import os
from pathlib import Path
import shutil
import threading
from http.server import ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright
from urllib.parse import parse_qs, urlsplit
from support import accounts as fixtures
from support.accounts import (
    A,
    B,
    HOST,
    profiles,
    events,
    calls,
    uploads,
    auth_calls,
    control,
    deferred_stats,
    session,
    backend,
)
from support.http import REPO, RepositoryHandler as Handler

OUT = Path('/tmp/jdd-accounts-review')
OUT.mkdir(exist_ok=True)

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = fixtures.base = f'http://127.0.0.1:{server.server_port}/'
errors = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),
            headless=True,
        )

        def home(width=393, height=852, signed=False, pwa=False, old_heads=False):
            context = browser.new_context(
                viewport={'width': width, 'height': height},
                is_mobile=True,
                has_touch=True,
                service_workers='allow' if pwa else 'block',
            )
            context.route(HOST + '/**', backend)
            if signed:
                context.add_init_script(
                    'localStorage.setItem("jdd.auth.v1", '
                    + json.dumps(json.dumps(session(A)))
                    + ');'
                )
            if old_heads:
                saved = {
                    'config': {},
                    'history': [
                        {
                            'id': 'legacy',
                            'player': 'François',
                            'rows': [{'word': 'Chat', 'status': 'correct'}],
                            'themeLabel': 'Tous les mots',
                            'duration': 60,
                        }
                    ],
                    'totals': [{'player': 'François', 'points': 7, 'rounds': 1}],
                }
                context.add_init_script(
                    'if (!localStorage.getItem("jdd.heads.v1")) localStorage.setItem("jdd.heads.v1", '
                    + json.dumps(json.dumps(saved))
                    + ');'
                )
            context.add_init_script('window.DeviceOrientationEvent = undefined;')
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.set_default_timeout(10000)
            page.goto(base, wait_until='load')
            return context, page

        def settled(page):
            page.wait_for_function(
                '() => JDDCloud.status().pending === 0 && JDDCloud.status().state !== "syncing"'
            )

        def add_account(page, uid):
            page.locator(f'#accountPlayers [data-account-id="{uid}"]').click()

        def credential_form(page, mode):
            form = page.locator('#accountForm')
            expect(form).to_have_attribute('method', 'post')
            expect(form).to_have_attribute('autocomplete', 'on')
            expect(form).to_have_attribute('name', 'account-' + mode)
            action = urlsplit(form.get_attribute('action'))
            assert (action.scheme, action.netloc, action.path) == (
                urlsplit(base).scheme,
                urlsplit(base).netloc,
                urlsplit(base).path,
            ) and parse_qs(action.query) == {'account': [mode]}
            email = page.locator('#accountEmail')
            expect(email).to_have_attribute('type', 'email')
            expect(email).to_have_attribute('name', 'username')
            expect(email).to_have_attribute('autocomplete', 'username')
            expect(email).to_have_attribute('inputmode', 'email')
            expect(email).to_have_attribute('autocapitalize', 'none')
            expect(email).to_have_attribute('spellcheck', 'false')
            if mode != 'reset':
                password = page.locator('#accountPassword')
                expect(password).to_have_attribute('name', 'password')
                expect(password).to_have_attribute(
                    'autocomplete', 'current-password' if mode == 'login' else 'new-password'
                )
                expect(password).to_have_attribute('type', 'password')
                if mode != 'login':
                    expect(password).to_have_attribute('minlength', '12')
            if mode == 'signup':
                assert form.locator('input').evaluate_all('els=>els.map(el=>el.id)') == [
                    'accountEmail',
                    'accountPassword',
                    'accountName',
                ]
                expect(page.locator('#accountName')).to_have_attribute('name', 'given-name')
                expect(page.locator('#accountName')).to_have_attribute('autocomplete', 'given-name')

        # Prénom séparé de l'identifiant ; remplissage direct comme un gestionnaire.
        context, page = home()
        page.locator('#accountButton').click()
        credential_form(page, 'login')
        page.evaluate('()=>{accountDialog.close();JDDAccounts.open("login");}')
        page.wait_for_timeout(50)
        credential_form(page, 'login')
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountActions').get_by_text('Créer un compte', exact=True).click()
        credential_form(page, 'signup')
        expect(page.locator('#accountEmail')).to_have_value('francois@example.test')
        page.locator('#accountName').fill('François')
        page.locator('#accountPassword').fill('a-generated-password-long')
        page.get_by_role('button', name='Afficher le mot de passe', exact=True).click()
        expect(page.locator('#accountPassword')).to_have_attribute('type', 'text')
        page.get_by_role('button', name='Masquer le mot de passe', exact=True).click()
        expect(page.locator('#accountPassword')).to_have_attribute('type', 'password')
        page.locator('#accountActions').get_by_text('J’ai déjà un compte', exact=True).click()
        credential_form(page, 'login')
        expect(page.locator('#accountEmail')).to_have_value('francois@example.test')
        expect(page.locator('#accountPassword')).to_have_value('')
        page.locator('#accountActions').get_by_text('Mot de passe oublié', exact=True).click()
        credential_form(page, 'reset')
        expect(page.locator('#accountEmail')).to_have_value('francois@example.test')
        page.locator('#accountActions').get_by_text('J’ai déjà un compte', exact=True).click()
        page.locator('#accountActions').get_by_text('Créer un compte', exact=True).click()
        expect(page.locator('#accountName')).to_have_value('François')
        page.evaluate(
            '''()=>{accountEmail.value="francois@example.test";accountPassword.value="a-generated-password-long";}'''
        )
        # Pendant la requête, les champs restent dans FormData et ne sont pas désactivés.
        pending = []
        context.route(
            HOST + '/auth/v1/signup*',
            lambda route: (
                backend(route) if route.request.method == 'OPTIONS' else pending.append(route)
            ),
        )
        page.locator('#accountForm button[type="submit"]').click()
        page.wait_for_function('accountForm.getAttribute("aria-busy")==="true"')
        expect(page.locator('#accountEmail')).to_be_enabled()
        expect(page.locator('#accountPassword')).to_be_enabled()
        assert not page.locator('#accountPassword').is_editable()
        assert page.evaluate('Object.fromEntries(new FormData(accountForm))') == {
            'username': 'francois@example.test',
            'password': 'a-generated-password-long',
            'given-name': 'François',
        }
        assert pending
        backend(pending[0])
        expect(page.locator('#accountDialogTitle')).to_have_text('Confirmer mon email')
        call = next(c for c in reversed(auth_calls) if c['path'] == '/auth/v1/signup')
        assert (
            call['data']['email'] == 'francois@example.test'
            and call['data']['password'] == 'a-generated-password-long'
        )
        assert call['data']['data']['display_name'] == 'François'
        assert page.locator('#accountPassword').count() == 0
        assert page.evaluate(
            '!Object.values(localStorage).some(v=>v.includes("a-generated-password-long"))'
        )
        context.close()
        print(
            'PASS: formulaires POST distincts, email identifiant, prénom séparé, mot de passe suggéré, brouillons et envoi lisible sans stockage du secret',
            flush=True,
        )

        context, page = home()
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Créer un compte', exact=True).click()
        credential_form(page, 'signup')
        page.locator('#accountName').fill('François')
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialogTitle')).to_have_text('Confirmer mon email')
        expect(page.locator('#accountCode')).not_to_be_visible()
        page.locator('.account-code-details summary').click()
        expect(page.locator('#accountCode')).to_be_visible()
        expect(page.locator('#accountCode')).to_have_attribute('autocomplete', 'one-time-code')
        page.locator('#accountCode').fill('999999')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountStatus')).to_contain_text('Code invalide')
        page.locator('#accountCode').fill('123456')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialog')).not_to_be_visible()
        expect(page.locator('#accountButton')).to_contain_text('François')
        context.close()
        context, page = home()
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Mot de passe oublié', exact=True).click()
        credential_form(page, 'reset')
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountForm button[type="submit"]').click()
        page.locator('.account-code-details summary').click()
        expect(page.locator('#accountCode')).to_be_visible()
        page.locator('#accountCode').fill('123456')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountPassword')).to_be_visible()
        credential_form(page, 'recovery')
        expect(page.locator('#accountEmail')).to_have_value('private@example.test')
        assert not page.locator('#accountEmail').is_editable()
        page.locator('#accountPassword').fill('a-new-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialog')).not_to_be_visible()
        context.close()
        print('PASS: inscription, confirmation et récupération par code dans la PWA', flush=True)

        # L'email Supabase par défaut contient uniquement un lien : aucun code exigé.
        control['email_confirmed'] = False
        context, page = home()
        page.goto(base + 'index.html?campaign=home#custom', wait_until='load')
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Créer un compte', exact=True).click()
        page.locator('#accountName').fill('François')
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountCode')).not_to_be_visible()
        expect(page.locator('#accountForm')).to_contain_text('son lien')
        page.screenshot(path=str(OUT / 'confirmation-email.png'), full_page=True)
        page.locator('#accountActions').get_by_text('Renvoyer l’email', exact=True).click()
        expect(page.locator('#accountStatus')).to_contain_text('la demande d’envoi a été acceptée')
        assert (
            next(c for c in reversed(auth_calls) if c['path'] == '/auth/v1/resend')['data']['email']
            == 'francois@example.test'
        )
        page.reload(wait_until='load')
        page.locator('#accountButton').click()
        expect(page.locator('#accountDialogTitle')).to_have_text('Confirmer mon email')
        assert (
            page.evaluate('JSON.parse(localStorage.getItem("jdd.auth-pending.v1")).email')
            == 'francois@example.test'
        )
        assert 'password' not in page.evaluate('localStorage.getItem("jdd.auth-pending.v1")')
        before = len([c for c in auth_calls if c['path'] == '/auth/v1/verify'])
        page.locator('#accountForm').get_by_text('Se connecter', exact=True).click()
        expect(page.locator('#accountEmail')).to_have_value('francois@example.test')
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountStatus')).to_contain_text(
            'Ton email n’est pas encore confirmé'
        )
        expect(page.locator('#accountDialogTitle')).to_have_text('Confirmer mon email')
        assert page.evaluate('JDDAccounts.getUser()') is None
        # La confirmation reste vérifiée par Auth ; le bouton n'accorde aucun accès.
        control['email_confirmed'] = True
        page.locator('#accountForm').get_by_text('Se connecter', exact=True).click()
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialog')).not_to_be_visible()
        expect(page.locator('#accountButton')).to_contain_text('François')
        assert len([c for c in auth_calls if c['path'] == '/auth/v1/verify']) == before
        assert page.evaluate('localStorage.getItem("jdd.auth-pending.v1")') is None
        context.close()
        print(
            'PASS: email à lien seul, redirection propre, renvoi, confirmation persistante et connexion sans code',
            flush=True,
        )

        # Les blocages d'envoi sont expliqués ; aucun faux email envoyé ni message brut.
        context, page = home()
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Créer un compte', exact=True).click()
        page.locator('#accountName').fill('François')
        page.locator('#accountEmail').fill('francois@example.test')
        control['email_error'] = ('email_address_not_authorized', 400)
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountStatus')).to_contain_text(
            'L’envoi vers cette adresse est bloqué'
        )
        expect(page.locator('#accountDialogTitle')).to_have_text('Créer mon compte')
        assert page.evaluate('localStorage.getItem("jdd.auth-pending.v1")') is None
        control['email_error'] = None
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('.account-pending-email')).to_have_text('francois@example.test')
        for code, status, message in [
            ('over_email_send_rate_limit', 429, 'Le quota d’emails'),
            ('email_address_not_authorized', 400, 'L’envoi vers cette adresse est bloqué'),
            ('unexpected_failure', 500, 'L’email n’a pas pu être renvoyé'),
        ]:
            control['email_error'] = (code, status)
            page.locator('#accountActions').get_by_text('Renvoyer l’email', exact=True).click()
            expect(page.locator('#accountStatus')).to_contain_text(message)
            assert 'private@example.test' not in page.locator('#accountStatus').inner_text()
            expect(page.locator('#accountStatus')).to_have_class(
                'account-status account-status--error'
            )
        control['email_error'] = None
        page.locator('#accountActions').get_by_text('Renvoyer l’email', exact=True).click()
        expect(page.locator('#accountStatus')).to_contain_text('demande d’envoi a été acceptée')
        assert page.evaluate('JDDAccounts.getUser()') is None
        context.close()
        print(
            'PASS: destinataire bloqué, quota et panne distingués au renvoi, sans faux succès ni accès accordé',
            flush=True,
        )

        # Deux prénoms identiques sont deux profils, mais une seule session possède « Moi ».
        original_profiles = profiles[:]
        profiles[:] = [
            dict(original_profiles[0]),
            dict(original_profiles[1], display_name='François'),
        ]
        context, page = home(signed=True)
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(2)
        expect(page.locator('#accountPlayers .account-profile-self')).to_have_count(1)
        assert (
            page.locator('#accountPlayers .account-profile-self').evaluate(
                'el=>el.closest("button").dataset.accountId'
            )
            == A
        )
        page.locator('#playerInput').fill('François')
        page.locator('#addBtn').click()
        add_account(page, A)
        add_account(page, B)
        assert len(page.evaluate('JDDParticipants.all()')) == 3
        page.locator('#accountButton').click()
        expect(page.locator('.account-current-email')).to_contain_text('private@example.test')
        page.locator('#closeAccountDialog').click()
        assert 'private@example.test' not in page.locator('#setup').inner_text()
        profiles[:] = [profiles[0]]
        page.evaluate('JDDAccounts.refresh()')
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(1)
        roster = page.evaluate('JDDParticipants.all()')
        assert [(p['kind'], p['name']) for p in roster] == [
            ('guest', 'François'),
            ('account', 'François'),
        ]
        assert roster[1]['id'] == A and page.evaluate('JDDAccounts.getUser().id') == A
        context.close()
        profiles[:] = original_profiles
        print(
            'PASS: compte connecté marqué Moi, email privé, homonymes séparés et compte supprimé retiré de la bande',
            flush=True,
        )

        # Un téléphone neuf retrouve les mêmes UUID en se connectant, sans recréer le compte.
        pc_context, pc = home(1280, 800, signed=True)
        expect(pc.locator('#accountPlayers .account-profile')).to_have_count(6)
        context, page = home()
        expect(page.locator('#accountPlayers')).to_contain_text('Connecte-toi sur cet appareil')
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(0)
        signup_count = len([c for c in auth_calls if c['path'] == '/auth/v1/signup'])
        page.locator('#accountPlayers').get_by_text('Ajouter des comptes', exact=True).click()
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        ids = lambda p: p.locator('#accountPlayers .account-profile').evaluate_all(
            'nodes=>nodes.map(n=>n.dataset.accountId)'
        )
        assert (
            ids(page) == ids(pc)
            and page.evaluate('JDDAccounts.getUser().id')
            == pc.evaluate('JDDAccounts.getUser().id')
            == A
        )
        assert signup_count == len([c for c in auth_calls if c['path'] == '/auth/v1/signup'])
        add_account(page, A)
        page.locator('#playerInput').fill('François')
        page.locator('#addBtn').click()
        add_account(page, B)
        expect(page.locator('#homeRosterCount')).to_have_text('3 joueurs')
        assert page.locator('#playerList .account-kind').all_text_contents() == [
            'Compte',
            'Invité',
            'Compte',
        ]
        assert page.locator('#playerList .jdd-player-name').all_text_contents() == [
            'François',
            'François',
            'Axel',
        ]
        assert page.locator('#playerList').evaluate(
            'el=>Boolean(el.compareDocumentPosition(document.getElementById("playerForm"))&Node.DOCUMENT_POSITION_FOLLOWING)'
        )
        assert page.locator('#playerForm').evaluate(
            'el=>Boolean(el.compareDocumentPosition(document.getElementById("accountPlayers"))&Node.DOCUMENT_POSITION_FOLLOWING)'
        )
        widths = page.locator('#playerList .player-item').evaluate_all(
            'nodes=>nodes.map(n=>n.getBoundingClientRect().width)'
        )
        assert max(widths) - min(widths) < 1
        assert page.locator('#playerList .jdd-player-remove').first.bounding_box()['height'] >= 44
        expect(page.locator('#accountPlayers .account-profile').first).to_be_visible()
        assert (
            page.locator('#accountPlayers .account-profile').first.evaluate(
                'el=>el.getBoundingClientRect().height'
            )
            < 70
        )
        page.screenshot(path=str(OUT / 'bande-mobile.png'), full_page=True)
        pc.locator('#playerInput').fill('Invité')
        pc.locator('#addBtn').click()
        add_account(pc, A)
        pc.screenshot(path=str(OUT / 'bande-pc.png'), full_page=True)
        for game, root in [
            ('#headsBtn', '#hu-player'),
            ('#geographyBtn', '#geo-players'),
            ('#footballBtn', '#foot-players'),
            ('#duelBtn', '#duel-players'),
            ('#chessBtn', '#chess-players'),
        ]:
            page.locator(game).click()
            if game == '#geographyBtn':
                page.locator('[data-geo-mode="cities"]').click()
            if game == '#chessBtn':
                page.locator('.chess-roster summary').click()
            expect(page.locator(root + ' .jdd-player-summary')).to_have_text('3 joueurs')
            assert page.locator(root + ' .jdd-player-name').all_text_contents() == [
                'François',
                'François',
                'Axel',
            ]
            assert page.locator(root + ' .jdd-player-list').evaluate(
                'el=>Boolean(el.compareDocumentPosition(el.parentNode.querySelector(".jdd-player-input"))&Node.DOCUMENT_POSITION_FOLLOWING)'
            )
            field = page.locator(root + ' input')
            field.fill('Prénom en cours')
            field.evaluate('el => { window.savedAccountField = el; }')
            add = page.locator(root + ' [data-account-id="' + profiles[2]['id'] + '"]')
            add.evaluate(
                'el => el.addEventListener("pointerdown", () => { window.accountScroll = scrollY; }, {once:true})'
            )
            add.click()
            expect(page.locator(root + ' .jdd-player-summary')).to_have_text('4 joueurs')
            assert abs(page.evaluate('scrollY-accountScroll')) <= 2
            expect(field).to_have_value('Prénom en cours')
            assert field.evaluate('el => el === window.savedAccountField')
            page.wait_for_timeout(
                450
            )  # Respecter la protection contre le double appui sur Retirer.
            page.locator(
                root + ' button[aria-label="Retirer ' + profiles[2]['display_name'] + '"]'
            ).click()
            expect(page.locator(root + ' .jdd-player-summary')).to_have_text('3 joueurs')
            page.screenshot(path=str(OUT / f'bande-{root[1:]}.png'), full_page=True)
            if game == '#headsBtn':
                page.locator('#heads [data-act="exit"]').click()
            if game == '#geographyBtn':
                page.locator('#geography [data-geo="exit"]').click()
            if game == '#footballBtn':
                page.locator('#football [data-foot="exit"]').click()
            if game == '#duelBtn':
                page.locator('#duel [data-duel="exit"]').click()
            if game == '#chessBtn':
                page.locator('#chess [data-chess="exit"]').click()
        page.evaluate('JDD.clearAccountPlayers()')
        page.locator('#startBtn').click()
        expect(page.locator('#dialogRosterCount')).to_have_text('1 joueur')
        page.locator('#dialogAccountPlayers [data-account-id="' + A + '"]').click()
        page.locator('#dialogAccountPlayers [data-account-id="' + B + '"]').click()
        expect(page.locator('#dialogRosterCount')).to_have_text('3 joueurs')
        assert page.locator('#dialogPlayerList .account-kind').all_text_contents() == [
            'Invité',
            'Compte',
            'Compte',
        ]
        assert (
            page.locator('#dialogPlayerList').bounding_box()['y']
            < page.locator('#dialogPlayerForm').bounding_box()['y']
        )
        page.locator('#closePlayersDialog').click()
        # Nouveau compte cloud récupéré au retour au premier plan, sans reconnexion.
        extra = {
            'id': '10000000-0000-4000-8000-000000000009',
            'display_name': 'Yanis',
            'avatar_path': None,
            'created_at': '2026-10-06',
        }
        profiles.append(extra)
        page.evaluate('window.dispatchEvent(new Event("pageshow"))')
        page.wait_for_function(
            '() => JSON.parse(localStorage.getItem("jdd.account-cache.v1")).profiles.length===9'
        )
        page.locator('#accountPlayers').get_by_text('Afficher plus', exact=True).click()
        expect(
            page.locator('#accountPlayers [data-account-id="' + extra['id'] + '"]').first
        ).to_be_visible()
        profiles.pop()
        pc_context.close()
        context.close()
        print(
            'PASS: PC et téléphone neufs retrouvent les mêmes comptes cloud ; connexion locale explicite, compteur, ordre, capsules et retour PWA',
            flush=True,
        )

        # Les comptes sont utilisables et mis en cache même si les statistiques attendent.
        control['hold_stats'] = True
        context, page = home(signed=True)
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        page.locator('#accountButton').click()
        expect(page.locator('#profileStatistics')).to_contain_text('Chargement des statistiques')
        expect(page.locator('.home-statistics')).to_be_hidden()
        page.locator('#closeAccountDialog').click()
        page.wait_for_function(
            '() => JSON.parse(localStorage.getItem("jdd.account-cache.v1")).profiles.length===8'
        )
        assert (
            page.evaluate('JSON.parse(localStorage.getItem("jdd.account-cache.v1")).hasSnapshot')
            is False
        )
        add_account(page, A)
        control['hold_stats'] = False
        for route in deferred_stats:
            route.fulfill(
                content_type='application/json',
                body='[]',
                headers={'access-control-allow-origin': '*'},
            )
        deferred_stats.clear()
        page.wait_for_function(
            '() => JSON.parse(localStorage.getItem("jdd.account-cache.v1")).hasSnapshot'
        )
        control['profiles_error'] = True
        page.locator('#accountPlayers').get_by_text('Actualiser', exact=True).click()
        expect(page.locator('#accountPlayers')).to_contain_text(
            'Impossible de charger', timeout=15000
        )
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        control['profiles_error'] = False
        page.locator('#accountPlayers').get_by_text('Réessayer', exact=True).click()
        expect(
            page.locator('#accountPlayers').get_by_text('Actualiser', exact=True)
        ).to_be_visible()
        context.close()
        print(
            'PASS: statistiques lentes sans bloquer les profils, cache indépendant, erreur explicite et réessai conservant la bande',
            flush=True,
        )

        context, page = home(old_heads=True)
        expect(page.locator('#accountButton')).to_have_text('Se connecter')
        page.locator('#accountButton').click()
        credential_form(page, 'login')
        page.locator('#accountEmail').fill('François')
        page.locator('#accountPassword').fill('wrong-password')
        tokens_before = len([c for c in auth_calls if c['path'] == '/auth/v1/token'])
        page.locator('#accountForm button[type="submit"]').click()
        assert not page.locator('#accountEmail').evaluate('el=>el.validity.valid')
        assert len([c for c in auth_calls if c['path'] == '/auth/v1/token']) == tokens_before
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountPassword').fill('wrong-password')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountStatus')).to_contain_text('Vérifie ton email')
        expect(page.locator('#accountPassword')).to_have_value('wrong-password')
        expect(page.locator('#accountPassword')).to_be_editable()
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialog')).not_to_be_visible()
        expect(page.locator('#accountButton')).to_contain_text('François')
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        page.locator('#accountPlayers').get_by_text('Afficher plus', exact=True).click()
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(8)
        page.locator('#playerInput').fill('Axel')
        page.locator('#addBtn').click()
        add_account(page, A)
        add_account(page, B)
        roster = page.evaluate('JDDParticipants.all()')
        assert [(p['kind'], p['name']) for p in roster] == [
            ('guest', 'Axel'),
            ('account', 'François'),
            ('account', 'Axel'),
        ]
        assert roster[0]['id'] != B
        account_label = roster[2]['label']
        page.reload(wait_until='load')
        expect(page.locator('#accountButton')).to_contain_text('François')
        assert page.evaluate('JDDParticipants.all()') == roster
        page.screenshot(path=str(OUT / 'accueil-connecte.png'), full_page=True)
        assert 'private@example.test' not in page.locator('#setup').inner_text()
        print(
            'PASS: connexion persistante, six profils puis afficher plus, invité homonyme indépendant, emails absents',
            flush=True,
        )

        # Réponse hors ligne, puis réponse acceptée par le serveur mais accusé perdu.
        page.evaluate(
            '''label => { JDD.nextPlayer = () => label; JDD.DATA.culture = [];
          JDD.DATA.cultureMcq = [{id:'test-answer',question:'Capitale de la France ?',choices:['Paris','Lyon','Nice','Lille'],answerIndex:0}]; }''',
            account_label,
        )
        page.locator('[data-mode="culture"]').click()
        page.locator('#startBtn').click()
        settled(page)
        context.set_offline(True)
        page.locator('.mcq-btn').filter(has_text='Paris').click()
        page.wait_for_function('() => JDDCloud.status().pending === 1')
        queued = page.evaluate('JSON.parse(localStorage.getItem("jdd.cloud-outbox.v1"))[0]')
        assert queued['participants'][0]['account_id'] == B
        control['drop_answer'] = True
        context.set_offline(False)
        page.wait_for_function('() => JDDCloud.status().state === "error"')
        page.evaluate('JDDCloud.flush()')
        settled(page)
        attempts = [c for c in calls if c['p_event_id'] == queued['id']]
        assert len(attempts) == 2 and attempts[0]['p_revision'] == attempts[1]['p_revision']
        assert events[queued['id']]['p_participants'] == [
            {'account_id': B, 'metrics': {'questions_answered': 1, 'correct_answers': 1}}
        ]
        page.locator('#backLogo').click()
        expect(
            page.locator(
                '[data-exploit="culture-correct"] .account-podium-row[data-account-id="'
                + B
                + '"] .account-podium-value'
            )
        ).to_have_text('1')
        assert page.locator('#statisticsPlayer').count() == 0
        print(
            'PASS: Culture G. attribuée au bon compte, mode avion, réessai du même ID sans double statistique',
            flush=True,
        )

        # Undercover garde les identités du début même si la bande change.
        page.locator('#undercoverBtn').click()
        page.locator('#undercover [data-act="start"]').click()
        page.locator('#undercover [data-act="close-modal"]').click()
        game = page.evaluate('JSON.parse(localStorage.getItem("jdd.undercover.v2")).game')
        for i in range(len(game['slots'])):
            page.locator(f'#undercover [data-act="pick-known"][data-slot="{i}"]').click()
            page.locator('#undercover [data-act="reveal"]').click()
            page.locator('#undercover [data-act="word-ok"]').click()
        page.evaluate('JDD.clearAccountPlayers()')
        infiltrator = next(i for i, s in enumerate(game['slots']) if s['role'] == 'undercover')
        page.locator('#undercover [data-act="to-vote"]').click()
        page.locator(f'#undercover [data-act="vote"][data-slot="{infiltrator}"]').click()
        expect(page.locator('#undercover [data-act="eliminate"]')).to_be_enabled()
        page.locator('#undercover [data-act="eliminate"]').click()
        page.locator('#undercover [data-act="eliminated-ok"]').click()
        settled(page)
        saved = events[game['cloud']['id']]
        assert {p['account_id'] for p in saved['p_participants']} == {A, B}
        assert all(p['metrics']['games'] == 1 for p in saved['p_participants'])
        page.locator('#undercover [data-act="end-home"]').click()
        page.locator('#undercover [data-act="exit-app"]').click()
        add_account(page, A)
        add_account(page, B)
        print(
            'PASS: résultats Undercover, identités figées et aucune attribution à l’invité',
            flush=True,
        )

        # Devine Tête et correction : une nouvelle révision remplace le bilan.
        page.set_viewport_size({'width': 852, 'height': 393})
        page.locator('#headsBtn').click()
        page.locator('#hu-player .jdd-player-choice').filter(has_text='François').click()
        page.locator('#hu-start').click()
        page.locator('#heads [data-act="countdown"]').click()
        expect(page.locator('#heads')).to_have_attribute('data-screen', 'playing', timeout=10000)
        page.locator('#heads [data-act="correct"]').click()
        page.wait_for_timeout(700)
        page.locator('#heads [data-act="pause"]').click()
        page.locator('#heads [data-act="finish"]').click()
        settled(page)
        heads = next(e for e in events.values() if e['p_mode'] == 'heads')
        assert heads['p_participants'][0]['account_id'] == A
        assert heads['p_participants'][0]['metrics']['words_found'] == 1
        totals = page.evaluate('JSON.parse(localStorage.getItem("jdd.heads.v1")).totals')
        assert len(totals) == 2
        assert next(t for t in totals if not t.get('participant'))['points'] == 7
        assert next(t for t in totals if t.get('participant', {}).get('id') == A)['points'] == 1
        page.locator('#heads [data-correct-row="0"]').click()
        settled(page)
        assert events[heads['p_event_id']]['p_revision'] == 2
        assert events[heads['p_event_id']]['p_participants'][0]['metrics']['words_found'] == 0
        totals = page.evaluate('JSON.parse(localStorage.getItem("jdd.heads.v1")).totals')
        assert next(t for t in totals if not t.get('participant'))['points'] == 7
        page.locator('#heads [data-act="exit"]').click()
        print('PASS: manche Devine Tête et correction sans doubler les parties', flush=True)

        # Une reprise Géographie au dernier bilan conserve l’identité initiale.
        feature = next(
            f
            for f in json.loads((REPO / 'data/geography/countries.geojson').read_text())['features']
            if f['properties'].get('quiz')
        )
        target = {'id': feature['properties']['code'], 'name': feature['properties']['name']}
        page.evaluate(
            '''target => { const cloud = JDDCloud.begin('geography',['François']);
          localStorage.setItem('jdd.geography.v1', JSON.stringify({mode:'countries',zone:'monde',players:['François'],scores:[1000],cloud,
          targets:[target],index:0,guess:target.id,result:{km:null,correct:true,rating:'PARFAIT 👑',points:1000,timedOut:false},
          rows:[{target:target.id,player:'François',guess:target.id,correct:true,rating:'PARFAIT 👑',points:1000}],remaining:1000,deadline:0,finished:false})); }''',
            target,
        )
        page.locator('#geographyBtn').click()
        page.locator('#geography [data-geo="resume"]').click()
        page.locator('#geography [data-geo="next"]').click()
        settled(page)
        geo = next(e for e in events.values() if e['p_mode'] == 'geography')
        assert (
            geo['p_participants'][0]['account_id'] == A
            and geo['p_participants'][0]['metrics']['points'] == 1000
        )
        assert geo['p_payload']['city_measurements'] == {}
        page.locator('#geography [data-geo="exit"]').click()
        print('PASS: partie Géographie reprise et points du bon compte', flush=True)

        # Foot : les points de l'équipe sont attribués aux comptes du départ,
        # même si leurs profils ont été retirés de la bande pendant la partie.
        page.evaluate(
            'window.footNow=Date.now;window.footOffset=0;Date.now=()=>footNow()+footOffset'
        )
        page.locator('#footballBtn').click()
        expect(page.locator('#football')).to_have_attribute('data-screen', 'setup')
        page.locator('[name="foot-format"][value="teams"]').check()
        page.locator('[data-foot-move="0"]').click()  # Axel invité
        page.locator('[data-foot-move="1"]').click()  # François compte
        expect(page.locator('[data-team="0"]')).to_contain_text('Axel')  # Axel compte
        page.locator('[data-foot="start"]').click()
        football_id = page.evaluate('JSON.parse(localStorage.getItem("jdd.football.v2")).cloud.id')
        page.evaluate('JDD.clearAccountPlayers()')
        control['block_rpc'] = True
        for camp in range(2):
            page.locator('[data-foot="begin"]').click()
            for _ in range(5):
                action = 'correct' if camp == 0 else 'wrong'
                page.locator(f'[data-foot="{action}"]').click()
                expect(page.locator('#football')).to_have_attribute('data-screen', 'feedback')
                page.evaluate('footOffset+=600')
                expect(page.locator('#football')).to_have_attribute('data-screen', 'playing')
            page.evaluate('footOffset+=61000')
            expect(page.locator('#football')).to_have_attribute(
                'data-screen', 'results' if camp else 'round-end'
            )
            if camp == 0:
                page.locator('[data-foot="next"]').click()
        expect(page.locator('#football')).to_have_attribute('data-screen', 'results')
        page.wait_for_function('() => JDDCloud.status().state === "error"')
        queued = page.evaluate('JSON.parse(localStorage.getItem("jdd.cloud-outbox.v1"))')
        event = next(e for e in queued if e['id'] == football_id)
        assert {p['account_id'] for p in event['participants']} == {A, B}
        assert all(
            p['metrics']['points'] == 5
            and p['metrics']['correct_answers'] == 5
            and p['metrics']['wins'] == 1
            for p in event['participants']
        )
        assert 'invité' not in json.dumps(event['payload']) and 'Axel' not in json.dumps(
            event['payload']
        )
        # Une correction hors connexion remplace la révision en attente.
        page.locator('[data-foot="var"]').click()
        page.locator('#foot-review-round').select_option('0')
        page.locator('[data-foot-review="0"][data-result="wrong"]').click()
        revised = next(
            e
            for e in page.evaluate('JSON.parse(localStorage.getItem("jdd.cloud-outbox.v1"))')
            if e['id'] == football_id
        )
        assert revised['id'] == football_id and revised['revision'] == 2
        assert all(
            p['metrics']['points'] == 4 and p['metrics']['games'] == 1
            for p in revised['participants']
        )
        page.wait_for_function('() => JDDCloud.status().state === "error"')
        control['block_rpc'] = False
        page.evaluate('JDDCloud.flush()')
        settled(page)
        assert len([e for e in events if e == football_id]) == 1
        assert events[football_id]['p_revision'] == 2
        # Une correction après synchronisation met à jour la même partie.
        page.locator('[data-foot-review="0"][data-result="correct"]').click()
        settled(page)
        assert events[football_id]['p_revision'] == 3
        assert all(
            p['metrics']['games'] == 1
            and p['metrics']['points'] == 5
            and p['metrics']['turns'] == 1
            for p in events[football_id]['p_participants']
        )
        page.locator('[data-foot="close-var"]').click()
        page.evaluate('Date.now=footNow')
        page.locator('[data-foot="exit"]').click()
        page.locator('#accountButton').click()
        page.locator('#profileStatistics .account-mode-stats--football summary').click()
        expect(
            page.locator('#profileStatistics .account-mode-stats--football dt')
            .get_by_text('Bonnes réponses', exact=True)
            .locator('xpath=following-sibling::dd[1]')
        ).to_have_text('5')
        page.locator('#closeAccountDialog').click()
        add_account(page, A)
        add_account(page, B)
        print(
            'PASS: foot 60 s en équipes, identités du départ, invité homonyme exclu et VAR synchronisée sans doubler les parties',
            flush=True,
        )

        # Photo réencodée et stockée sous le dossier du propriétaire.
        page.locator('#accountButton').click()
        page.locator('#accountName').fill('Prénom en cours')
        page.locator('#accountName').evaluate('el => el.setSelectionRange(3, 6)')
        profile_position = page.locator('#accountDialog').evaluate('el => el.scrollTop')
        page.locator('#accountPhoto').set_input_files(REPO / 'image/app/favicon-purple-32.png')
        expect(page.locator('#accountStatus')).to_have_text('Photo enregistrée.')
        expect(page.locator('#accountName')).to_have_value('Prénom en cours')
        expect(page.locator('#accountName')).to_be_focused()
        assert page.locator('#accountName').evaluate(
            'el => el.selectionStart === 3 && el.selectionEnd === 6'
        )
        assert (
            abs(page.locator('#accountDialog').evaluate('el => el.scrollTop') - profile_position)
            <= 2
        )
        assert uploads and uploads[-1].startswith('/storage/v1/object/avatars/' + A + '/')
        page.locator('#closeAccountDialog').click()
        print('PASS: photo convertie en WebP, avatar et dossier propre au compte', flush=True)

        # Les résultats de François restent en attente si Axel se connecte.
        control['block_rpc'] = True
        page.evaluate(
            '''() => { const e = JDDCloud.begin('culture',['François']);
          JDDCloud.record(e,e.participants.map(participant=>({participant,metrics:{questions_answered:1}}))); }'''
        )
        page.wait_for_function('() => JDDCloud.status().state === "error"')
        old_calls = len(calls)
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Se déconnecter', exact=True).click()
        expect(page.locator('#accountButton')).to_have_text('Se connecter')
        assert all(p['kind'] == 'guest' for p in page.evaluate('JDDParticipants.all()'))
        page.locator('#accountButton').click()
        page.locator('#accountEmail').fill('axel@example.test')
        page.locator('#accountPassword').fill('another-test-password')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountButton')).to_contain_text('Axel')
        page.evaluate('JDDCloud.flush()')
        assert len(calls) == old_calls and page.evaluate('JDDCloud.status().pending') == 0
        assert any(
            e['host'] == A
            for e in page.evaluate('JSON.parse(localStorage.getItem("jdd.cloud-outbox.v1"))')
        )
        control['block_rpc'] = False
        context.close()
        print(
            'PASS: déconnexion et changement de compte sans envoyer les résultats du précédent',
            flush=True,
        )

        context, page = home(signed=True, pwa=True)
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        page.wait_for_function('() => navigator.serviceWorker.controller !== null', timeout=30000)
        assert 'private@example.test' not in page.evaluate(
            'localStorage.getItem("jdd.account-cache.v1")'
        )
        context.set_offline(True)
        control['offline'] = True
        page.reload(wait_until='load')
        expect(page.locator('#accountButton')).to_contain_text('François')
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        expect(page.locator('#accountStatistics')).to_contain_text('Derniers exploits synchronisés')
        add_account(page, A)
        add_account(page, B)
        page.locator('#playerInput').fill('Alice')
        page.locator('#addBtn').click()
        page.locator('#undercoverBtn').click()
        expect(page.locator('#undercover [data-act="start"]')).to_be_enabled()
        cache_urls = page.evaluate(
            '''async () => { const out=[]; for (const key of await caches.keys())
          for (const req of await (await caches.open(key)).keys()) out.push(req.url); return out; }'''
        )
        assert all('/auth/v1/' not in url and '/rest/v1/' not in url for url in cache_urls)
        context.close()
        control['offline'] = False
        print(
            'PASS: PWA relancée hors ligne, comptes connus disponibles, données Auth/API absentes du cache worker',
            flush=True,
        )

        for width, height in [(320, 568), (393, 852), (430, 932), (852, 393)]:
            context, page = home(width, height)
            page.locator('#accountButton').click()
            for mode in ['login', 'signup', 'reset']:
                if mode == 'signup':
                    page.locator('#accountActions').get_by_text(
                        'Créer un compte', exact=True
                    ).click()
                if mode == 'reset':
                    page.locator('#accountActions').get_by_text(
                        'J’ai déjà un compte', exact=True
                    ).click()
                    page.locator('#accountActions').get_by_text(
                        'Mot de passe oublié', exact=True
                    ).click()
                credential_form(page, mode)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                bounds = page.locator('#accountDialog').bounding_box()
                assert (
                    bounds['x'] >= 0
                    and bounds['y'] >= 0
                    and bounds['x'] + bounds['width'] <= width + 1
                    and bounds['y'] + bounds['height'] <= height + 1
                )
                if mode != 'reset':
                    toggle = page.locator('.account-password-toggle').bounding_box()
                    assert toggle['width'] >= 44 and toggle['height'] >= 44
                if width in [320, 393]:
                    page.screenshot(path=str(OUT / f'{mode}-{width}.png'))
            page.locator('#closeAccountDialog').click()
            expect(page.locator('#accountForm input')).to_have_count(0)
            context.close()
            context, page = home(width, height, signed=True)
            expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#accountButton').click()
            bounds = page.locator('#accountDialog').bounding_box()
            assert (
                bounds['x'] >= 0
                and bounds['y'] >= 0
                and bounds['x'] + bounds['width'] <= width + 1
                and bounds['y'] + bounds['height'] <= height + 1
            )
            if width == 393:
                page.screenshot(path=str(OUT / 'mon-compte.png'))
            context.close()
        assert not errors, errors
        browser.close()
        print(
            'PASS: petits téléphones et paysage, dialogues accessibles, aucune erreur JavaScript',
            flush=True,
        )
finally:
    server.shutdown()

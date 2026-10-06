#!/usr/bin/env python3
"""Comptes/PWA sur Chromium, avec Supabase simulé et aucun email réel envoyé."""
import base64
import json
import os
from pathlib import Path
import shutil
import threading
import time
from urllib.parse import parse_qs, urlsplit
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/jdd-accounts-review')
OUT.mkdir(exist_ok=True)
A = '10000000-0000-4000-8000-000000000001'
B = '10000000-0000-4000-8000-000000000002'
HOST = 'https://jyuzvxhnolzwcviycljm.supabase.co'
profiles = [{'id': A, 'display_name': 'François', 'avatar_path': None, 'created_at': '2026-10-01'},
            {'id': B, 'display_name': 'Axel', 'avatar_path': None, 'created_at': '2026-10-02'}]
profiles += [{'id': f'10000000-0000-4000-8000-{i:012d}', 'display_name': name, 'avatar_path': None, 'created_at': '2026-10-03'}
             for i, name in enumerate(['Nico', 'Léa', 'Lou', 'Paul', 'Emma', 'Zoé'], 3)]
events, calls, uploads, auth_calls = {}, [], [], []
control = {'drop_answer': False, 'block_rpc': False, 'offline': False, 'email_confirmed': True}


def user(uid):
    return {'id': uid, 'aud': 'authenticated', 'role': 'authenticated', 'email': 'private@example.test',
            'app_metadata': {'provider': 'email'}, 'user_metadata': {'display_name': 'François' if uid == A else 'Axel'},
            'created_at': '2026-10-01T00:00:00Z'}


def session(uid):
    encode = lambda x: base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
    token = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({'sub': uid, 'role': 'authenticated', 'exp': int(time.time()) + 3600}) + '.testing'
    return {'access_token': token, 'refresh_token': 'test-refresh-' + uid, 'token_type': 'bearer',
            'expires_in': 3600, 'expires_at': int(time.time()) + 3600, 'user': user(uid)}


def actor(request):
    try:
        part = request.headers['authorization'].split()[1].split('.')[1]
        return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))['sub']
    except Exception:
        return None


def backend(route):
    if control['offline']:
        route.abort('internetdisconnected')
        return
    request = route.request
    path = request.url.split(HOST)[-1].split('?')[0]
    data = request.post_data_json if request.method in ['POST', 'PATCH'] and 'application/json' in request.headers.get('content-type', '') else {}
    if path.startswith('/auth/v1/') and request.method != 'OPTIONS':
        auth_calls.append({'path':path, 'url':request.url, 'data':data})
        if path in ['/auth/v1/signup','/auth/v1/recover','/auth/v1/resend']:
            # L'adresse de retour doit être le dossier du site, sans paramètres Auth.
            redirect = parse_qs(urlsplit(request.url).query).get('redirect_to',[None])[0]
            assert redirect == base, (path,redirect,base)
    headers = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
    def reply(value, status=200):
        route.fulfill(status=status, content_type='application/json', body=json.dumps(value), headers=headers)
    if request.method == 'OPTIONS':
        reply({})
    elif path == '/auth/v1/token':
        if not control['email_confirmed']:
            reply({'msg':'Email not confirmed','code':'email_not_confirmed'},400)
        elif data.get('password') == 'wrong-password':
            reply({'msg': 'Invalid login credentials', 'code': 'invalid_credentials'}, 400)
        else:
            reply(session(B if data.get('email', '').startswith('axel') else A))
    elif path == '/auth/v1/signup':
        assert len(data['password']) >= 12
        reply({'user': user(A), 'identities': []})
    elif path in ['/auth/v1/logout', '/auth/v1/recover', '/auth/v1/resend']:
        reply({})
    elif path == '/auth/v1/verify':
        assert data['type'] in ['signup','recovery']
        reply(session(A) if data['token']=='123456' else {'msg':'Invalid code'}, 200 if data['token']=='123456' else 403)
    elif path == '/auth/v1/user':
        reply(user(actor(request) or A))
    elif path == '/rest/v1/profiles':
        assert actor(request), 'Les profils nécessitent une session'
        if request.method == 'PATCH':
            assert 'id=eq.' + actor(request) in request.url
            next(p for p in profiles if p['id'] == actor(request)).update(data)
            reply(None)
        else:
            assert all('email' not in p for p in profiles)
            reply(profiles)
    elif path == '/rest/v1/player_statistics':
        totals = {}
        for event in events.values():
            for p in event['p_participants']:
                for metric, value in p['metrics'].items():
                    key = (p['account_id'], event['p_mode'], metric)
                    totals[key] = totals.get(key, 0) + value
        reply([{'player_id': p, 'mode': mode, 'metric': metric, 'total': value} for (p, mode, metric), value in totals.items()])
    elif path == '/rest/v1/rpc/record_game_event':
        calls.append(data)
        assert data['p_host_id'] == actor(request), 'Un résultat ne peut changer d’organisateur'
        if control['block_rpc']:
            route.abort('failed')
            return
        old = events.get(data['p_event_id'])
        if not old or old['p_revision'] < data['p_revision']:
            events[data['p_event_id']] = data
        if control['drop_answer'] and data['p_payload'].get('question_id') == 'test-answer':
            control['drop_answer'] = False
            route.abort('failed')
        else:
            reply(not old or old['p_revision'] < data['p_revision'])
    elif path == '/storage/v1/object/sign/avatars':
        reply([{'path': p, 'signedURL': '/object/sign/avatars/' + p + '?token=test'} for p in data['paths']])
    elif path.startswith('/storage/v1/object/avatars/') and request.method == 'POST':
        assert 'multipart/form-data' in request.headers.get('content-type', '')
        assert b'Content-Type: image/webp' in request.post_data_buffer
        assert b'RIFF' in request.post_data_buffer and b'WEBP' in request.post_data_buffer
        uploads.append(path)
        reply({'Key': path.split('/object/')[-1]})
    elif path == '/storage/v1/object/avatars' and request.method == 'DELETE':
        reply([])
    elif path.startswith('/storage/v1/object/sign/avatars/'):
        route.fulfill(content_type='image/png', body=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZsQAAAAASUVORK5CYII='), headers=headers)
    else:
        raise AssertionError(f'Requête Supabase imprévue : {request.method} {path}')


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO), **kwargs)
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/'
errors = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'), headless=True)
        def home(width=393, height=852, signed=False, pwa=False, old_heads=False):
            context = browser.new_context(viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True, service_workers='allow' if pwa else 'block')
            context.route(HOST + '/**', backend)
            if signed:
                context.add_init_script('localStorage.setItem("jdd.auth.v1", ' + json.dumps(json.dumps(session(A))) + ');')
            if old_heads:
                saved={'config':{},'history':[{'id':'legacy','player':'François','rows':[{'word':'Chat','status':'correct'}],'themeLabel':'Tous les mots','duration':60}],
                       'totals':[{'player':'François','points':7,'rounds':1}]}
                context.add_init_script('if (!localStorage.getItem("jdd.heads.v1")) localStorage.setItem("jdd.heads.v1", '+json.dumps(json.dumps(saved))+');')
            context.add_init_script('window.DeviceOrientationEvent = undefined;')
            page = context.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.set_default_timeout(10000)
            page.goto(base, wait_until='load')
            return context, page

        def settled(page):
            page.wait_for_function('() => JDDCloud.status().pending === 0 && JDDCloud.status().state !== "syncing"')

        def add_account(page, uid):
            page.locator(f'#accountPlayers [data-account-id="{uid}"]').click()

        context,page=home()
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Créer un compte',exact=True).click()
        page.locator('#accountName').fill('François')
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialogTitle')).to_have_text('Confirmer mon email')
        expect(page.locator('#accountCode')).not_to_be_visible()
        page.locator('.account-code-details summary').click()
        expect(page.locator('#accountCode')).to_be_visible()
        page.locator('#accountCode').fill('999999')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountStatus')).to_contain_text('Code invalide')
        page.locator('#accountCode').fill('123456')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialog')).not_to_be_visible()
        expect(page.locator('#accountButton')).to_contain_text('François')
        context.close()
        context,page=home()
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Mot de passe oublié',exact=True).click()
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountForm button[type="submit"]').click()
        page.locator('.account-code-details summary').click()
        expect(page.locator('#accountCode')).to_be_visible()
        page.locator('#accountCode').fill('123456')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountPassword')).to_be_visible()
        page.locator('#accountPassword').fill('a-new-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialog')).not_to_be_visible()
        context.close()
        print('PASS: inscription, confirmation et récupération par code dans la PWA',flush=True)

        # L'email Supabase par défaut contient uniquement un lien : aucun code exigé.
        control['email_confirmed']=False
        context,page=home()
        page.goto(base+'index.html?campaign=home#custom',wait_until='load')
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Créer un compte',exact=True).click()
        page.locator('#accountName').fill('François')
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountCode')).not_to_be_visible()
        expect(page.locator('#accountForm')).to_contain_text('son lien')
        page.screenshot(path=str(OUT/'confirmation-email.png'),full_page=True)
        page.locator('#accountActions').get_by_text('Renvoyer l’email',exact=True).click()
        expect(page.locator('#accountStatus')).to_contain_text('un email vient d’être envoyé')
        assert next(c for c in reversed(auth_calls) if c['path']=='/auth/v1/resend')['data']['email']=='francois@example.test'
        page.reload(wait_until='load'); page.locator('#accountButton').click()
        expect(page.locator('#accountDialogTitle')).to_have_text('Confirmer mon email')
        assert page.evaluate('JSON.parse(localStorage.getItem("jdd.auth-pending.v1")).email')=='francois@example.test'
        assert 'password' not in page.evaluate('localStorage.getItem("jdd.auth-pending.v1")')
        before=len([c for c in auth_calls if c['path']=='/auth/v1/verify'])
        page.locator('#accountForm').get_by_text('J’ai confirmé mon email',exact=True).click()
        expect(page.locator('#accountEmail')).to_have_value('francois@example.test')
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountStatus')).to_contain_text('la confirmation du compte')
        assert page.evaluate('JDDAccounts.getUser()') is None
        # La confirmation reste vérifiée par Auth ; le bouton n'accorde aucun accès.
        control['email_confirmed']=True
        page.locator('#accountPassword').fill('a-test-password-long')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountDialog')).not_to_be_visible()
        expect(page.locator('#accountButton')).to_contain_text('François')
        assert len([c for c in auth_calls if c['path']=='/auth/v1/verify'])==before
        assert page.evaluate('localStorage.getItem("jdd.auth-pending.v1")') is None
        context.close()
        print('PASS: email à lien seul, redirection propre, renvoi, confirmation persistante et connexion sans code',flush=True)

        context, page = home(old_heads=True)
        expect(page.locator('#accountButton')).to_have_text('Se connecter')
        page.locator('#accountButton').click()
        page.locator('#accountEmail').fill('francois@example.test')
        page.locator('#accountPassword').fill('wrong-password')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountStatus')).to_contain_text('Vérifie ton email')
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
        assert [(p['kind'], p['name']) for p in roster] == [('guest','Axel'),('account','François'),('account','Axel')]
        assert roster[0]['id'] != B
        account_label = roster[2]['label']
        page.reload(wait_until='load')
        expect(page.locator('#accountButton')).to_contain_text('François')
        assert page.evaluate('JDDParticipants.all()') == roster
        page.screenshot(path=str(OUT / 'accueil-connecte.png'), full_page=True)
        assert 'private@example.test' not in page.locator('#setup').inner_text()
        print('PASS: connexion persistante, six profils puis afficher plus, invité homonyme indépendant, emails absents', flush=True)

        # Réponse hors ligne, puis réponse acceptée par le serveur mais accusé perdu.
        page.evaluate('''label => { JDD.nextPlayer = () => label; JDD.DATA.culture = [];
          JDD.DATA.cultureMcq = [{id:'test-answer',question:'Capitale de la France ?',choices:['Paris','Lyon','Nice','Lille'],answerIndex:0}]; }''', account_label)
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
        assert events[queued['id']]['p_participants'] == [{'account_id':B,'metrics':{'questions_answered':1,'correct_answers':1}}]
        page.locator('#backLogo').click()
        page.locator('#statisticsPlayer').select_option(B)
        page.locator('.account-mode-stats--culture summary').click()
        expect(page.locator('.account-mode-stats--culture')).to_contain_text('Bonnes réponses')
        print('PASS: Culture G. attribuée au bon compte, mode avion, réessai du même ID sans double statistique', flush=True)

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
        infiltrator = next(i for i,s in enumerate(game['slots']) if s['role'] == 'undercover')
        page.locator('#undercover [data-act="to-vote"]').click()
        page.locator(f'#undercover [data-act="vote"][data-slot="{infiltrator}"]').click()
        expect(page.locator('#undercover [data-act="eliminate"]')).to_be_enabled()
        page.locator('#undercover [data-act="eliminate"]').click()
        page.locator('#undercover [data-act="eliminated-ok"]').click()
        settled(page)
        saved = events[game['cloud']['id']]
        assert {p['account_id'] for p in saved['p_participants']} == {A,B}
        assert all(p['metrics']['games'] == 1 for p in saved['p_participants'])
        page.locator('#undercover [data-act="end-home"]').click()
        page.locator('#undercover [data-act="exit-app"]').click()
        add_account(page,A)
        add_account(page,B)
        print('PASS: résultats Undercover, identités figées et aucune attribution à l’invité', flush=True)

        # Devine Tête et correction : une nouvelle révision remplace le bilan.
        page.set_viewport_size({'width':852,'height':393})
        page.locator('#headsBtn').click()
        page.locator('#hu-player .jdd-player-choice').filter(has_text='François').click()
        page.locator('#hu-start').click()
        page.locator('#heads [data-act="countdown"]').click()
        expect(page.locator('#heads')).to_have_attribute('data-screen','playing',timeout=10000)
        page.locator('#heads [data-act="correct"]').click()
        page.wait_for_timeout(700)
        page.locator('#heads [data-act="pause"]').click()
        page.locator('#heads [data-act="finish"]').click()
        settled(page)
        heads = next(e for e in events.values() if e['p_mode']=='heads')
        assert heads['p_participants'][0]['account_id']==A
        assert heads['p_participants'][0]['metrics']['words_found']==1
        totals=page.evaluate('JSON.parse(localStorage.getItem("jdd.heads.v1")).totals')
        assert len(totals)==2
        assert next(t for t in totals if not t.get('participant'))['points']==7
        assert next(t for t in totals if t.get('participant',{}).get('id')==A)['points']==1
        page.locator('#heads [data-correct-row="0"]').click()
        settled(page)
        assert events[heads['p_event_id']]['p_revision']==2
        assert events[heads['p_event_id']]['p_participants'][0]['metrics']['words_found']==0
        totals=page.evaluate('JSON.parse(localStorage.getItem("jdd.heads.v1")).totals')
        assert next(t for t in totals if not t.get('participant'))['points']==7
        page.locator('#heads [data-act="exit"]').click()
        print('PASS: manche Devine Tête et correction sans doubler les parties', flush=True)

        # Une reprise Géographie au dernier bilan conserve l’identité initiale.
        feature = next(f for f in json.loads((REPO/'data/geography/countries.geojson').read_text())['features'] if f['properties'].get('quiz'))
        target={'id':feature['properties']['code'],'name':feature['properties']['name']}
        page.evaluate('''target => { const cloud = JDDCloud.begin('geography',['François']);
          localStorage.setItem('jdd.geography.v1', JSON.stringify({mode:'countries',zone:'monde',players:['François'],scores:[1000],cloud,
          targets:[target],index:0,guess:target.id,result:{km:null,correct:true,rating:'PARFAIT 👑',points:1000,timedOut:false},
          rows:[{target:target.id,player:'François',guess:target.id,correct:true,rating:'PARFAIT 👑',points:1000}],remaining:1000,deadline:0,finished:false})); }''',target)
        page.locator('#geographyBtn').click()
        page.locator('#geography [data-geo="resume"]').click()
        page.locator('#geography [data-geo="next"]').click()
        settled(page)
        geo=next(e for e in events.values() if e['p_mode']=='geography')
        assert geo['p_participants'][0]['account_id']==A and geo['p_participants'][0]['metrics']['points']==1000
        page.locator('#geography [data-geo="exit"]').click()
        print('PASS: partie Géographie reprise et points du bon compte',flush=True)

        # Foot : les points de l'équipe sont attribués aux comptes du départ,
        # même si leurs profils ont été retirés de la bande pendant la partie.
        page.locator('#footballBtn').click()
        expect(page.locator('#football')).to_have_attribute('data-screen','setup')
        page.locator('[name="foot-format"][value="teams"]').check()
        page.locator('[data-foot-team="0"]').select_option('1')  # Axel invité
        page.locator('[data-foot-team="1"]').select_option('0')  # François compte
        page.locator('[data-foot-team="2"]').select_option('0')  # Axel compte
        page.locator('[data-foot="start"]').click()
        football_id=page.evaluate('JSON.parse(localStorage.getItem("jdd.football.v1")).cloud.id')
        page.evaluate('JDD.clearAccountPlayers()')
        control['block_rpc']=True
        for i in range(10):
            page.locator('[data-foot="begin"]').click()
            page.locator('[data-foot="reveal"]').click()
            action = 'correct' if i%2==0 else 'wrong'
            page.locator(f'[data-foot="{action}"]').click()
            page.locator('[data-foot="next"]').click()
        expect(page.locator('#football')).to_have_attribute('data-screen','results')
        page.wait_for_function('() => JDDCloud.status().state === "error"')
        queued=page.evaluate('JSON.parse(localStorage.getItem("jdd.cloud-outbox.v1"))')
        event=next(e for e in queued if e['id']==football_id)
        assert {p['account_id'] for p in event['participants']}=={A,B}
        assert all(p['metrics']['points']==5 and p['metrics']['correct_answers']==5 and p['metrics']['wins']==1 for p in event['participants'])
        assert 'invité' not in json.dumps(event['payload']) and 'Axel' not in json.dumps(event['payload'])
        control['block_rpc']=False
        page.evaluate('JDDCloud.flush()'); settled(page)
        assert len([e for e in events if e==football_id])==1
        page.locator('[data-foot="exit"]').click()
        page.locator('#statisticsPlayer').select_option(B)
        page.locator('.account-mode-stats--football summary').click()
        expect(page.locator('.account-mode-stats--football')).to_contain_text('Bonnes réponses')
        expect(page.locator('.account-mode-stats--football dd').nth(2)).to_have_text('5')
        add_account(page,A); add_account(page,B)
        print('PASS: foot en équipes, comptes du départ, invité homonyme exclu et synchronisation après coupure',flush=True)

        # Photo réencodée et stockée sous le dossier du propriétaire.
        page.locator('#accountButton').click()
        page.locator('#accountPhoto').set_input_files(REPO/'image/app/favicon-purple-32.png')
        expect(page.locator('#accountStatus')).to_have_text('Photo enregistrée.')
        assert uploads and uploads[-1].startswith('/storage/v1/object/avatars/'+A+'/')
        page.locator('#closeAccountDialog').click()
        print('PASS: photo convertie en WebP, avatar et dossier propre au compte',flush=True)

        # Les résultats de François restent en attente si Axel se connecte.
        control['block_rpc']=True
        page.evaluate('''() => { const e = JDDCloud.begin('culture',['François']);
          JDDCloud.record(e,e.participants.map(participant=>({participant,metrics:{questions_answered:1}}))); }''')
        page.wait_for_function('() => JDDCloud.status().state === "error"')
        old_calls=len(calls)
        page.locator('#accountButton').click()
        page.locator('#accountActions').get_by_text('Se déconnecter',exact=True).click()
        expect(page.locator('#accountButton')).to_have_text('Se connecter')
        assert all(p['kind']=='guest' for p in page.evaluate('JDDParticipants.all()'))
        page.locator('#accountButton').click()
        page.locator('#accountEmail').fill('axel@example.test')
        page.locator('#accountPassword').fill('another-test-password')
        page.locator('#accountForm button[type="submit"]').click()
        expect(page.locator('#accountButton')).to_contain_text('Axel')
        page.evaluate('JDDCloud.flush()')
        assert len(calls)==old_calls and page.evaluate('JDDCloud.status().pending')==0
        assert any(e['host']==A for e in page.evaluate('JSON.parse(localStorage.getItem("jdd.cloud-outbox.v1"))'))
        control['block_rpc']=False
        context.close()
        print('PASS: déconnexion et changement de compte sans envoyer les résultats du précédent',flush=True)

        context,page=home(signed=True,pwa=True)
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        page.wait_for_function('() => navigator.serviceWorker.controller !== null')
        assert 'private@example.test' not in page.evaluate('localStorage.getItem("jdd.account-cache.v1")')
        context.set_offline(True)
        control['offline']=True
        page.reload(wait_until='load')
        expect(page.locator('#accountButton')).to_contain_text('François')
        expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
        expect(page.locator('#accountStatistics')).to_contain_text('Dernières statistiques synchronisées')
        add_account(page,A)
        add_account(page,B)
        page.locator('#playerInput').fill('Alice')
        page.locator('#addBtn').click()
        page.locator('#undercoverBtn').click()
        expect(page.locator('#undercover [data-act="start"]')).to_be_enabled()
        cache_urls=page.evaluate('''async () => { const out=[]; for (const key of await caches.keys())
          for (const req of await (await caches.open(key)).keys()) out.push(req.url); return out; }''')
        assert all('/auth/v1/' not in url and '/rest/v1/' not in url for url in cache_urls)
        context.close()
        control['offline']=False
        print('PASS: PWA relancée hors ligne, comptes connus disponibles, données Auth/API absentes du cache worker',flush=True)

        for width,height in [(320,568),(393,852),(430,932),(852,393)]:
            context,page=home(width,height,signed=True)
            expect(page.locator('#accountPlayers .account-profile')).to_have_count(6)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#accountButton').click()
            bounds=page.locator('#accountDialog').bounding_box()
            assert bounds['x']>=0 and bounds['y']>=0 and bounds['x']+bounds['width']<=width+1 and bounds['y']+bounds['height']<=height+1
            if width==393: page.screenshot(path=str(OUT/'mon-compte.png'))
            context.close()
        assert not errors, errors
        browser.close()
        print('PASS: petits téléphones et paysage, dialogues accessibles, aucune erreur JavaScript',flush=True)
finally:
    server.shutdown()

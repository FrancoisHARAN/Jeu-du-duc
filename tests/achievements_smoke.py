#!/usr/bin/env python3
"""Profil/exploits sur plusieurs écrans avec de vrais calculs et une API de contrôle."""
import json
import os
from pathlib import Path
import shutil
import threading
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

REPO = Path(__file__).resolve().parents[1]
# Réutiliser seulement les fixtures Auth/REST, sans lancer leur suite de scénarios.
ns = {'__file__': str(REPO/'tests/accounts_smoke.py'), '__name__': 'fixtures'}
source = (REPO/'tests/accounts_smoke.py').read_text().split('server = ThreadingHTTPServer')[0]
exec(compile(source, ns['__file__'], 'exec'), ns)
server = ThreadingHTTPServer(('127.0.0.1', 0), ns['Handler'])
threading.Thread(target=server.serve_forever, daemon=True).start()
base = ns['base'] = f'http://127.0.0.1:{server.server_port}/'
A,B,C,D = [p['id'] for p in ns['profiles'][:4]]
ns['profiles'][2]['display_name']='Alexandre-Christophe'
metrics = {
 A: {'football':{'games':100,'wins':80,'points':300,'correct_answers':300,'questions_answered':350},
     'undercover':{'games':12,'white_games':8,'white_wins':4,'wins':6},'culture':{'games':9,'questions_answered':25,'correct_answers':20},
     'geography':{'games':15,'turns':200,'perfect_places':5,'city_france_turns':50,'city_france_km':5000,'city_world_turns':10,'city_world_km':6000,'distance_turns':60,'measured_distance_km':11000},
     'heads':{'games':10,'words_found':45,'words_passed':12},'debut':{'games':7,'cards_seen':40}},
 B: {'football':{'games':1,'wins':1},'undercover':{'games':1,'white_games':1,'white_wins':1},'culture':{'games':1,'questions_answered':19,'correct_answers':19}},
 C: {'football':{'games':5,'wins':5},'undercover':{'games':12,'white_games':8,'white_wins':4,'wins':6},'culture':{'games':2,'questions_answered':100,'correct_answers':90},
     'geography':{'games':2,'turns':30,'city_france_turns':5,'city_france_km':550,'distance_turns':5,'measured_distance_km':550},'heads':{'games':2,'words_found':20}},
 D: {'football':{'games':20,'wins':10},'undercover':{'games':2,'white_games':1,'white_wins':0}}
}
for uid,modes in metrics.items():
    for mode,m in modes.items():
        ns['events'][uid+mode]={'p_mode':mode,'p_revision':1,'p_participants':[{'account_id':uid,'metrics':m}]}
errors=[]
out=Path('/tmp/jdd-achievements-review');out.mkdir(exist_ok=True)
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),headless=True)
        for width,height in [(320,568),(393,852),(1300,900)]:
            context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<700,has_touch=width<700,service_workers='block')
            context.route(ns['HOST']+'/**',ns['backend'])
            context.add_init_script('localStorage.setItem("jdd.auth.v1",'+json.dumps(json.dumps(ns['session'](A)))+');')
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(10000)
            page.goto(base,wait_until='load')
            expect(page.locator('.home-statistics')).to_be_visible()
            expect(page.locator('.home-statistics h2')).to_have_text('Les exploits de la bande')
            expect(page.locator('.account-exploit')).to_have_count(6)
            expect(page.locator('[data-exploit="football-rate"] .account-podium-row')).to_have_count(3)
            assert page.locator('[data-exploit="football-rate"] li').evaluate_all('items=>items.map(i=>i.dataset.accountId)')==[A,C,D]
            assert page.locator('[data-exploit="white-wins"] li').evaluate_all('items=>items.map(i=>i.dataset.rank)')==['1','1','3']
            assert page.locator('#statisticsPlayer').count()==0
            page.evaluate('scrollTo(0, document.getElementById("accountStatistics").getBoundingClientRect().top + scrollY - 80)')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.locator('.account-podium-value').evaluate_all('nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth+1)')
            page.screenshot(path=str(out/f'exploits-{width}.png'))
            page.locator('#accountStatistics').get_by_role('button',name='Afficher plus',exact=True).click()
            assert page.locator('.account-exploit').count()>6
            page.locator('[data-exploit-filter="geography"]').click()
            expect(page.locator('[data-exploit="geo-distance-france"] .account-podium-value').first).to_have_text('100 km')
            assert page.locator('.account-exploit').evaluate_all('nodes=>nodes.every(n=>n.classList.contains("account-exploit--geography"))')
            page.locator('[data-exploit="geo-distance-france"] summary').click()
            expect(page.locator('.account-exploit[data-exploit="geo-distance-france"]')).to_contain_text('5 placements minimum')
            page.locator('#accountButton').click()
            expect(page.locator('#profileStatistics')).to_contain_text('Mes statistiques')
            expect(page.locator('#profileStatistics .account-mode-stats')).to_have_count(6)
            page.locator('#profileStatistics .account-mode-stats--geography summary').click()
            expect(page.locator('#profileStatistics .account-mode-stats--geography')).to_contain_text('183,3 km')
            page.locator('#profileStatistics .account-mode-stats--football summary').click()
            expect(page.locator('#profileStatistics .account-mode-stats--football')).to_contain_text('80 %')
            page.locator('#accountName').fill('Prénom en cours')
            ns['events'][A+'football']['p_participants'][0]['metrics']['wins']=70
            page.evaluate('dispatchEvent(new Event("jdd:statistics"))')
            expect(page.locator('#profileStatistics .account-mode-stats--football')).to_contain_text('70 %')
            expect(page.locator('#accountName')).to_have_value('Prénom en cours')
            assert page.locator('#profileStatistics .account-mode-stats--football').get_attribute('open') is not None
            page.locator('#profileStatistics').scroll_into_view_if_needed()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(out/f'profil-{width}.png'))
            ns['events'][A+'football']['p_participants'][0]['metrics']['wins']=80
            page.locator('#closeAccountDialog').click()
            page.locator('[data-exploit-filter="football"]').click()
            page.locator('#accountButton').click()
            page.locator('#accountActions').get_by_role('button',name='Se déconnecter',exact=True).click()
            expect(page.locator('.home-statistics')).to_be_hidden()
            expect(page.locator('#profileStatistics')).to_be_hidden()
            context.close()
        print('PASS: tops 3, filtres, affichage progressif, profil propre et responsive 320/393/1300 px',flush=True)
        # Aucune carte vide, et un premier résultat apparaît sans recharger.
        ns['events'].clear()
        context=browser.new_context(service_workers='block')
        context.route(ns['HOST']+'/**',ns['backend'])
        context.add_init_script('localStorage.setItem("jdd.auth.v1",'+json.dumps(json.dumps(ns['session'](A)))+');')
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='load')
        page.locator('#accountButton').click()
        expect(page.locator('#profileStatistics')).to_contain_text('Aucune partie enregistrée')
        expect(page.locator('.home-statistics')).to_be_hidden()
        ns['events']['first']={'p_mode':'heads','p_revision':1,'p_participants':[{'account_id':A,'metrics':{'games':1,'words_found':3}}]}
        page.evaluate('dispatchEvent(new Event("jdd:statistics"))')
        expect(page.locator('#profileStatistics .account-mode-stats--heads')).to_be_visible()
        page.locator('#closeAccountDialog').click()
        expect(page.locator('[data-exploit="heads-found"] .account-podium-value')).to_have_text('3')
        assert page.locator('.account-exploit').count()==3
        # La moyenne vient du nombre de placements mesurés, sans invité ni tour manqué.
        page.locator('#accountPlayers [data-account-id="'+A+'"]').click()
        page.locator('#playerInput').fill('Axel');page.locator('#addBtn').click()
        target=json.loads((REPO/'data/geography/cities.json').read_text())['france'][0]
        page.evaluate("""target => {
          const cloud=JDDCloud.begin('geography',['François','Axel']);
          const rows=[['François',0],['Axel',55],['François',120],['Axel',66],['François',null]]
            .map(([player,km])=>({target:target.id,player,km,correct:km===0,rating:km===0?'PARFAIT 👑':'Raté',points:km===0?1000:0}));
          localStorage.setItem('jdd.geography.v1',JSON.stringify({mode:'cities',zone:'france',players:['François','Axel'],scores:[1000,0],cloud,
            targets:Array(5).fill(target),index:4,guess:null,result:{km:null,correct:false,rating:'Raté',points:0,timedOut:true},
            rows,remaining:0,deadline:0,finished:false}));
        }""",target)
        page.locator('#geographyBtn').click();page.locator('[data-geo="resume"]').click();page.locator('[data-geo="next"]').click()
        page.wait_for_function('JDDCloud.status().pending===0 && JDDCloud.status().state!=="syncing"')
        geo=next(e for e in ns['events'].values() if e['p_mode']=='geography')
        assert geo['p_payload']['city_measurements']=={A:{'distance_turns':2,'measured_distance_km':120}}
        assert len(geo['p_participants'])==1
        page.locator('[data-geo="exit"]').click();page.locator('#accountButton').click()
        page.locator('#profileStatistics .account-mode-stats--geography summary').click()
        expect(page.locator('#profileStatistics .account-mode-stats--geography')).to_contain_text('60 km')
        expect(page.locator('#profileStatistics .account-mode-stats--geography')).to_contain_text('2 placements mesurés')
        page.locator('#closeAccountDialog').click()
        assert page.locator('.account-exploit[data-exploit="geo-distance-france"]').count()==0
        print('PASS: capture de distances par UUID, invité exclu, tour manqué exclu et moyenne affichée au profil',flush=True)
        context.close();browser.close()
        assert not errors,errors
        print('PASS: correction visible sans perdre les champs saisis, déconnexion, aucun exploit à zéro et premier résultat dynamique',flush=True)
finally:
    server.shutdown()

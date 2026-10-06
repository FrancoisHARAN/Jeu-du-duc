#!/usr/bin/env python3
"""Quiz foot : filtrage, arbitrage, chrono, équipes, sauvegarde et formats mobiles."""
import collections
import json
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/jdd-football-review'); OUT.mkdir(exist_ok=True)
bank = json.loads((REPO / 'data/football.questions.json').read_text())['questions']
assert len(bank) == 4631 and len({q['id'] for q in bank}) == 4631
assert collections.Counter(q['difficulty'] for q in bank) == {'AMATEUR':1369, 'CONNAISSEUR':1383, 'EXPERT':1378, 'FOOTIX':501}
assert sum(q['category'] == '' for q in bank) == 2

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(REPO), **kwargs)
    def translate_path(self, path): return super().translate_path(path.replace('/Jeu-du-duc/', '/', 1))
    def log_message(self, *args): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'), headless=True)
        def home(people=None, width=393, height=852):
            context = browser.new_context(viewport={'width':width, 'height':height}, is_mobile=width < 900, has_touch=True, service_workers='block')
            people = people if people is not None else ['Axel', 'Nico', 'François']
            context.add_init_script('if (!localStorage.getItem("jdd.players")) localStorage.setItem("jdd.players", '+json.dumps(json.dumps(people))+'); window.offset=0; const realNow=Date.now; Date.now=()=>realNow()+offset;')
            page=context.new_page(); page.on('pageerror', lambda e: errors.append(str(e))); page.set_default_timeout(10000)
            page.goto(base, wait_until='load'); page.locator('#footballBtn').click()
            expect(page.locator('#football')).to_have_attribute('data-screen','setup')
            return context,page
        def act(page, name): page.locator(f'#football [data-foot="{name}"]').click()
        def saved(page): return page.evaluate('JSON.parse(localStorage.getItem("jdd.football.v1"))')
        def layout(page):
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), page.viewport_size
            assert page.locator('#football [data-foot="exit"]').bounding_box()['height'] >= 44
        def answer(page, correct=True):
            act(page,'begin'); expect(page.locator('#football')).to_have_attribute('data-screen','playing')
            act(page,'reveal'); expect(page.locator('#football')).to_have_attribute('data-screen','judging')
            act(page, 'correct' if correct else 'wrong'); expect(page.locator('#football')).to_have_attribute('data-screen','answer')
            act(page,'next')

        context,page=home()
        assert page.locator('#geographyBtn').evaluate('el=>el.nextElementSibling.id') == 'footballBtn'
        expect(page.locator('#foot-players .jdd-player-item')).to_have_count(3)
        page.locator('[name="foot-difficulty"][value="EXPERT"]').check()
        page.locator('#football details summary').click()
        page.locator('[data-foot-category][value="Équipe de France"]').check()
        page.locator('[data-foot-category][value="Coupe du Monde"]').check()
        act(page,'start')
        m=saved(page); assert len(m['questions'])==12 and m['players']==['Axel','Nico','François']
        assert all(q['difficulty']=='EXPERT' and q['category'] in ['Équipe de France','Coupe du Monde'] for q in m['questions'])
        assert len({q['question'].lower().strip() for q in m['questions']})==12
        for i in range(12): answer(page, correct=i%3==0)
        expect(page.locator('#football')).to_have_attribute('data-screen','results')
        assert saved(page)['scores']==[4,0,0]
        expect(page.locator('.foot-ranking li').first).to_contain_text('Axel')
        assert page.evaluate('JDDModules.football.hasActiveGame()') is False
        page.screenshot(path=str(OUT/'classement.png'),full_page=True); layout(page); context.close()
        print('PASS: classeur complet, catégories exactes, difficulté, questions distinctes et tours équitables, classement',flush=True)

        context,page=home(['Alice','Bob','Chloé','Duc'])
        page.locator('[name="foot-format"][value="teams"]').check()
        page.locator('[data-foot-team="2"]').select_option('1')
        act(page,'start'); assert saved(page)['sides'][0]['members']==['Alice']
        assert saved(page)['sides'][1]['members']==['Bob','Chloé','Duc']
        for i in range(10): answer(page,correct=i%2==1)
        assert saved(page)['scores']==[0,5]
        expect(page.locator('.foot-ranking li').first).to_contain_text('Équipe 2')
        expect(page.locator('.foot-ranking li').first).to_contain_text('Chloé')
        context.close(); print('PASS: équipes éditables et victoire collective',flush=True)

        context,page=home(['Axel','Nico'])
        page.locator('[name="foot-mode"][value="shotgun"]').check()
        page.locator('[name="foot-difficulty"][value="FOOTIX"]').check()
        act(page,'start'); assert len(saved(page)['questions'])==10
        for i in range(10):
            act(page,'begin'); act(page,'reveal')
            page.locator(f'[data-foot-award="{i%2}"]').click(); act(page,'next')
        expect(page.locator('#football h1')).to_have_text('Égalité !')
        assert saved(page)['scores']==[5,5]
        assert page.locator('.foot-ranking [data-winner="true"]').count()==2
        context.close(); print('PASS: Shotgun oral, premier gagnant validé et égalité sans faux vainqueur',flush=True)

        context,page=home(['Alice','Bob'])
        act(page,'start'); act(page,'begin'); page.evaluate('offset += 7000')
        page.wait_for_timeout(150)
        act(page,'exit'); expect(page.locator('#setup')).to_be_visible()
        remainder=saved(page)['remaining']; assert 21000 < remainder < 24000
        page.locator('#footballBtn').click(); act(page,'resume')
        expect(page.locator('#football')).to_have_attribute('data-screen','paused')
        assert saved(page)['remaining']==remainder
        act(page,'continue'); page.evaluate('offset += 31000')
        expect(page.locator('#football')).to_have_attribute('data-screen','answer')
        assert saved(page)['rows'][0]['reason']=='timeout' and saved(page)['scores']==[0,0]
        act(page,'next'); act(page,'begin'); act(page,'reveal')
        # Le résultat de l'arbitrage, les noms et le tirage survivent au rechargement.
        before=saved(page)
        page.reload(wait_until='load'); page.locator('#footballBtn').click(); act(page,'resume')
        expect(page.locator('#football')).to_have_attribute('data-screen','judging')
        assert saved(page)['questions']==before['questions'] and saved(page)['index']==1
        act(page,'correct'); assert saved(page)['scores']==[0,1]
        act(page,'next'); act(page,'begin')
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))")
        expect(page.locator('#football')).to_have_attribute('data-screen','paused')
        remainder=saved(page)['remaining']; page.evaluate('offset += 5000')
        page.wait_for_timeout(200); assert saved(page)['remaining']==remainder
        page.evaluate("delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))")
        act(page,'continue')
        act(page,'pass'); assert saved(page)['rows'][-1]['reason']=='pass'
        page.evaluate('''() => {const m=JSON.parse(localStorage.getItem('jdd.football.v1'));m.rows=[];
          localStorage.setItem('jdd.football.v1',JSON.stringify(m));}''')
        page.reload(wait_until='load'); page.locator('#footballBtn').click()
        expect(page.locator('#football')).to_have_attribute('data-screen','setup')
        assert page.locator('[data-foot="resume"]').count()==0
        layout(page); context.close(); print('PASS: chrono, temps écoulé sans point, pause/menu, reprise et arbitrage sauvegardé',flush=True)

        context,page=home(['Alice','Bob','Chloé','Duc'])
        page.locator('[name="foot-mode"][value="shotgun"]').check()
        page.locator('[name="foot-format"][value="teams"]').check()
        act(page,'start'); act(page,'begin'); act(page,'reveal')
        assert page.locator('[data-foot-award]').count()==2
        page.locator('[data-foot-award="1"]').click(); assert saved(page)['scores']==[0,1]
        act(page,'next'); act(page,'begin')
        page.evaluate("offset+=31000;document.querySelector('[data-foot=\"reveal\"]').click()")
        expect(page.locator('#football')).to_have_attribute('data-screen','answer')
        assert saved(page)['rows'][-1]['reason']=='timeout' and saved(page)['scores']==[0,1]
        assert page.locator('[data-foot-award]').count()==0
        context.close(); print('PASS: Shotgun en équipes et aucune validation possible après le délai',flush=True)

        context,page=home(['Alice','Bob'])
        page.locator('[name="foot-length"][value="20"]').check(); act(page,'start')
        assert len(saved(page)['questions'])==20
        for i in range(20):
            act(page,'begin'); act(page,'pass'); act(page,'next')
        expect(page.locator('#football h1')).to_have_text('Aucun point marqué')
        assert page.locator('.foot-ranking [data-winner="true"]').count()==0
        context.close(); print('PASS: partie longue et aucun vainqueur artificiel avec zéro point',flush=True)

        context,page=home([])
        expect(page.locator('[data-foot="start"]')).to_be_disabled()
        page.locator('#foot-players input[type="text"]').fill('Nouveau')
        page.locator('#foot-players .jdd-player-add').click()
        assert page.evaluate('JDD.players')==['Nouveau']
        page.locator('[name="foot-mode"][value="shotgun"]').check(); act(page,'start')
        expect(page.locator('#foot-error')).to_contain_text('au moins 2')
        page.locator('[name="foot-mode"][value="classic"]').check()
        page.locator('[name="foot-format"][value="teams"]').check(); act(page,'start')
        expect(page.locator('#foot-error')).to_be_visible()
        page.locator('[name="foot-format"][value="individual"]').check()
        page.locator('#football details summary').click()
        page.locator('[data-foot-category][value="Entraîneurs / sélectionneurs"]').check()
        page.locator('[name="foot-difficulty"][value="FOOTIX"]').check(); act(page,'start')
        expect(page.locator('#foot-error')).to_be_visible()
        context.close(); print('PASS: invités partagés, minimum de joueurs et filtre sans questions gérés',flush=True)

        for width,height in [(320,568),(360,800),(393,852),(430,932),(844,390),(1280,800)]:
            context,page=home(width=width,height=height); layout(page)
            page.locator('[name="foot-format"][value="teams"]').check(); layout(page)
            page.screenshot(path=str(OUT/f'reglages-{width}.png'),full_page=True)
            act(page,'start'); act(page,'begin'); layout(page)
            assert page.locator('.foot-word').evaluate_all('els=>els.every(el=>getComputedStyle(el).whiteSpace==="nowrap")')
            page.screenshot(path=str(OUT/f'question-{width}.png'),full_page=True)
            # Un mot exceptionnellement long reste entier et l'affichage réduit sa taille.
            page.locator('.foot-question').evaluate('el=>el.textContent="A".repeat(70)')
            page.set_viewport_size({'width':width+1,'height':height}); page.wait_for_timeout(100)
            assert page.locator('.foot-question').evaluate('el=>el.scrollWidth<=el.clientWidth')
            assert page.locator('.foot-question').evaluate('el=>getComputedStyle(el).overflowWrap')=='normal'
            page.screenshot(path=str(OUT/f'mot-long-{width}.png'),full_page=True)
            act(page,'reveal'); layout(page); context.close()
        print('PASS: six formats, paysage, cibles tactiles et mots entiers',flush=True)
        assert not errors,errors
        browser.close()
finally:
    server.shutdown()

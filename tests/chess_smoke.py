"""Échecs sur téléphone : gestes, configuration, règles, horloges et reprise."""
from pathlib import Path
import json
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/jdd-chess-review'); OUT.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(REPO), **kwargs)
    def translate_path(self, path): return super().translate_path(path.replace('/Jeu-du-duc/', '/', 1))
    def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
        def home(width=393, height=852, people=None):
            people = people if people is not None else ['François', 'François (invité)', 'Solène']
            context = browser.new_context(viewport={'width':width,'height':height}, has_touch=True, is_mobile=width<900, service_workers='block')
            ids = [{'id':'11111111-1111-4111-8111-111111111111','kind':'account','name':'François','label':'François'},
                {'id':'22222222-2222-4222-8222-222222222222','kind':'guest','name':'François','label':'François (invité)'}]
            context.add_init_script('if(!localStorage.getItem("jdd.players"))localStorage.setItem("jdd.players",'+json.dumps(json.dumps(people))+');'
                +'if(!localStorage.getItem("jdd.participants.v1"))localStorage.setItem("jdd.participants.v1",'+json.dumps(json.dumps(ids))+');'
                +'Math.random=()=>.25;const fixture=sessionStorage.getItem("chess-fixture");if(fixture){localStorage.setItem("jdd.chess.v1",fixture);sessionStorage.removeItem("chess-fixture");}')
            page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(base,wait_until='load')
            assert page.locator('#duelBtn + #chessBtn').count()==1
            page.locator('#chessBtn').tap()
            return context,page
        def saved(page): return page.evaluate('JSON.parse(localStorage.getItem("jdd.chess.v1"))')
        def play(page,a,b):
            page.locator(f'[data-square="{a}"]').tap()
            assert page.locator(f'[data-square="{b}"]').evaluate('n=>n.classList.contains("is-target")||n.classList.contains("is-capture")'),(a,b)
            page.locator(f'[data-square="{b}"]').tap()
        def seed(page,fen,clock=None):
            page.evaluate('''([fen,clock])=>{const old=JSON.parse(localStorage.getItem('jdd.chess.v1'));
                const s=JDDChessMatch.create(old.players,old.minutes,0,Date.now(),fen);JDDChessMatch.pause(s);
                if(clock!==null)s.remaining.w=clock;sessionStorage.setItem('chess-fixture',JSON.stringify(JDDChessMatch.snapshot(s)));}''',[fen,clock])
            page.reload(wait_until='load');page.locator('#chessBtn').tap();page.locator('[data-chess="resume"]').tap()

        context,page=home()
        assert page.locator('[data-chess-player="0"] option').all_text_contents()==['Choisir un joueur','François','François (invité)','Solène']
        page.locator('[data-chess-player="1"]').select_option('François')
        assert page.locator('[data-chess-player="0"]').input_value()!=page.locator('[data-chess-player="1"]').input_value()
        page.locator('[data-chess-player="0"]').select_option('François')
        page.locator('[data-chess-player="1"]').select_option('François (invité)')
        assert page.locator('input[name="chess-minutes"]').evaluate_all('ns=>ns.map(n=>n.value)')==['2','5','10','20']
        page.locator('input[name="chess-minutes"][value="2"]').check()
        page.screenshot(path=str(OUT/'configuration-mobile.png'),full_page=True)
        page.locator('[data-chess="start"]').tap()
        s=saved(page);assert [v['kind'] for v in s['players']]==['account','guest'];assert s['players'][0]['id']!=s['players'][1]['id']
        assert s['minutes']==2 and s['remaining']['b']==120000
        assert page.locator('[data-square]').count()==64 and page.locator('#chess-board .chess-piece').count()==32
        board=page.locator('#chess-board').bounding_box();assert board['width']>370 and board['x']<=10
        page.screenshot(path=str(OUT/'plateau-mobile.png'))
        page.wait_for_timeout(1100);expect(page.locator('#chess-clock-w')).to_have_text('1:59');expect(page.locator('#chess-clock-b')).to_have_text('2:00')
        play(page,'e2','e4');s=saved(page);assert s['moves']==[{'from':'e2','to':'e4'}]
        assert s['fen'].split()[1]=='b'
        page.wait_for_timeout(1100);assert saved(page)['remaining']['w']==s['remaining']['w']
        page.locator('[data-square="e7"]').tap();page.locator('[data-square="e4"]').tap();assert saved(page)['fen']==s['fen']
        page.locator('[data-square="g1"]').tap();assert page.locator('.chess-square.is-selected').count()==0
        page.locator('[data-chess="pause"]').tap();expect(page.locator('#chess-dialog')).to_be_visible()
        remaining=saved(page)['remaining'];page.wait_for_timeout(500);assert saved(page)['remaining']==remaining
        page.locator('[data-chess="continue"]').tap();play(page,'e7','e5')
        page.locator('.chess-toolbar [data-chess="exit"]').tap();expect(page.locator('#setup')).to_be_visible()
        old=saved(page);page.reload(wait_until='load');page.locator('#chessBtn').tap();page.locator('[data-chess="resume"]').tap()
        assert saved(page)['fen']==old['fen'] and saved(page)['moves']==old['moves']
        print('PASS: identités compte/invité, attribution des blancs, configuration courte, horloges alternées, coups invalides, pause et reprise',flush=True)

        seed(page,'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')
        play(page,'e1','g1');expect(page.locator('[data-square="f1"]')).to_have_attribute('aria-label','f1, Tour blanche')
        play(page,'e8','c8');expect(page.locator('[data-square="d8"]')).to_have_attribute('aria-label','d8, Tour noire')
        seed(page,'4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
        play(page,'a7','a8');expect(page.locator('#chess-dialog')).to_be_visible();assert page.locator('[data-promotion]').count()==4
        before=saved(page)['remaining']['w'];page.wait_for_timeout(250)
        page.locator('[data-promotion="q"]').tap();expect(page.locator('[data-square="a8"]')).to_have_attribute('aria-label','a8, Dame blanche')
        assert saved(page)['remaining']['w']<before and saved(page)['moves'][0]['promotion']=='q'
        page.screenshot(path=str(OUT/'promotion.png'))
        seed(page,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
        for a,b in [('e2','e4'),('a7','a6'),('e4','e5'),('d7','d5'),('e5','d6')]:play(page,a,b)
        expect(page.locator('[data-square="d5"]')).to_have_attribute('aria-label','d5, case vide')
        print('PASS: deux roques tactiles, quatre choix de promotion avec horloge active et prise en passant',flush=True)

        seed(page,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
        for a,b in [('f2','f3'),('e7','e5'),('g2','g4'),('d8','h4')]:play(page,a,b)
        expect(page.locator('#chess')).to_have_attribute('data-phase','finished')
        assert saved(page)['result']=={'kind':'mate','winner':'b'} and not saved(page)['running']
        expect(page.locator('[data-chess="replay"]')).to_be_visible();assert page.locator('[data-square]:disabled').count()==64
        seed(page,'7k/5Q2/5K2/8/8/8/8/8 b - - 0 1');assert saved(page)['result']['kind']=='stalemate'
        seed(page,'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',80)
        expect(page.locator('#chess')).to_have_attribute('data-phase','finished',timeout=2500);assert saved(page)['result']=={'kind':'timeout','winner':'b'}
        expect(page.locator('#chess-clock-w')).to_have_text('0:00')
        print('PASS: mat, pat, temps écoulé et plateau bloqué à la fin',flush=True)
        context.close()

        for width,height in [(320,568),(360,640),(393,852),(430,932),(568,320),(852,393),(1280,800)]:
            context,page=home(width,height,['François','Solène'])
            page.locator('[data-chess="start"]').tap();page.wait_for_timeout(150)
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),(width,height)
            bounds=page.locator('#chess-board').bounding_box()
            assert bounds['width']>290 or height<400
            assert bounds['y']>=0 and bounds['y']+bounds['height']<=height+1,(width,height,bounds)
            if width<500:assert bounds['width']>=width-22,(width,bounds)
            if width in [320,852,1280]:page.screenshot(path=str(OUT/f'plateau-{width}.png'))
            context.close()
        context,page=home(320,568,['M'*40,'Solène']);page.locator('[data-chess="start"]').tap()
        assert page.locator('.chess-player-name strong').evaluate_all('ns=>ns.every(n=>n.scrollWidth<=n.clientWidth+1)')
        context.close()
        context,page=home(people=[]);expect(page.locator('[data-chess="start"]')).to_be_disabled()
        for name in ['Nicolas','Solène']:
            page.locator('#chess-players input').fill(name);page.locator('#chess-players .jdd-player-add').tap()
        expect(page.locator('[data-chess="start"]')).to_be_enabled();page.locator('[data-chess="start"]').tap()
        assert [p['name'] for p in saved(page)['players']]==['Nicolas','Solène'];context.close()
        im=Image.open(REPO/'image/home/chess.webp');assert im.mode=='RGBA' and im.getpixel((0,0))[3]==0
        assert not errors,errors;browser.close()
        print('PASS: sept formats, plateau large sur téléphone, noms longs, ajout des joueurs, visuel transparent et aucune erreur JavaScript',flush=True)
finally:server.shutdown()

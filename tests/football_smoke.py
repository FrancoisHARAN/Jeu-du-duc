#!/usr/bin/env python3
"""Manches foot : 60 s continues, retour 500 ms, VAR, reprise et mobile."""
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
bank = json.loads((REPO/'data/football.questions.json').read_text())['questions']
lookup = {q['id']:q for q in bank}
assert len(bank)==4631 and len(lookup)==4631
assert collections.Counter(q['difficulty'] for q in bank)=={'AMATEUR':1369,'CONNAISSEUR':1383,'EXPERT':1378,'FOOTIX':501}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(REPO),**kwargs)
    def translate_path(self,path): return super().translate_path(path.replace('/Jeu-du-duc/','/',1))
    def log_message(self,*args): pass

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors=[]
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),headless=True)
        def home(people=None,width=393,height=852,fixture=None,old_settings=None):
            context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<900,has_touch=True,service_workers='block')
            context.add_init_script('''if (!localStorage.getItem('jdd.players')) localStorage.setItem('jdd.players', %s);
              const origin=Number(sessionStorage.getItem('test-foot-origin'))||Date.now();sessionStorage.setItem('test-foot-origin',origin);
              window.offset=Number(sessionStorage.getItem('test-foot-offset'))||0;Date.now=()=>origin+offset;
              window.testSounds=[];
              const Audio=window.AudioContext||window.webkitAudioContext;
              if(Audio){const create=Audio.prototype.createBufferSource;
                Audio.prototype.createBufferSource=function(){
                  const source=create.call(this),audio=this,start=source.start;
                  source.start=function(...args){if(source.buffer)testSounds.push({buffer:source.buffer,audio});return start.apply(source,args);};
                  return source;
                };
              }'''%json.dumps(json.dumps(people if people is not None else ['François','Solène'])))
            if fixture: context.route('**/data/football.questions.json',lambda route:route.fulfill(json={'questions':fixture}))
            if old_settings: context.add_init_script('localStorage.setItem("jdd.football.settings.v1", %s)'%json.dumps(json.dumps(old_settings)))
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(10000)
            page.goto(base,wait_until='load');page.locator('#footballBtn').click()
            expect(page.locator('#football')).to_have_attribute('data-screen','setup')
            return context,page
        def act(page,name): page.locator(f'#football [data-foot="{name}"]').click()
        def saved(page): return page.evaluate('JSON.parse(localStorage.getItem("jdd.football.v2"))')
        def sounds(page):
            return page.evaluate('''testSounds.map(({buffer,audio})=>{
              const samples=buffer.getChannelData(0);let energy=0,peak=0,crossings=0;
              samples.forEach((value,i)=>{energy+=value*value;peak=Math.max(peak,Math.abs(value));if(i&&value*samples[i-1]<0)crossings++;});
              return {duration:buffer.duration,rms:Math.sqrt(energy/samples.length),peak,first:samples[0],last:samples.at(-1),frequency:crossings/(2*buffer.duration),state:audio.state};
            })''')
        def advance(page,ms):
            page.evaluate('ms=>{offset+=ms;sessionStorage.setItem("test-foot-offset",offset);}',ms)
            page.wait_for_timeout(80)
        def respond(page,action='correct'):
            act(page,action)
            expect(page.locator('#football')).to_have_attribute('data-screen','feedback')
            advance(page,501)
            expect(page.locator('#football')).to_have_attribute('data-screen','playing')
        def end(page):
            advance(page,60000)
            expect(page.locator('#football')).to_have_attribute('data-screen','results' if saved(page)['finished'] else 'round-end')
        def layout(page,live=False):
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'),page.viewport_size
            if live:
                for action in ['correct','wrong']:
                    control=page.locator(f'[data-foot="{action}"]');box=control.bounding_box()
                    assert box['height']>=44 and box['y']+box['height']<=page.viewport_size['height']+1,(page.viewport_size,box)
                assert page.locator('.foot-question').evaluate('el=>el.scrollWidth<=el.clientWidth')
                assert page.locator('.foot-answer').evaluate('el=>el.scrollWidth<=el.clientWidth')
                assert page.locator('.foot-question-area').evaluate('el=>el.scrollHeight<=el.clientHeight+1'),page.viewport_size
                body=page.locator('.foot-card-body').bounding_box()
                q=page.locator('.foot-question').bounding_box();a=page.locator('.foot-answer').bounding_box()
                assert q['y']>=body['y']-1 and a['y']+a['height']<=body['y']+body['height']+1,(page.viewport_size,q,a,body)

        context,page=home(old_settings={'difficulty':'AMATEUR','mode':'shotgun','rounds':2,'format':'individual','categories':[]})
        assert page.locator('[name="foot-mode"], [name="foot-rounds"]').count()==0
        assert page.locator('#football fieldset').count()==2
        assert page.locator('#foot-roster [name="foot-format"]').count()==2
        assert page.locator('#foot-roster #foot-players').count()==1
        page.locator('[name="foot-difficulty"][value="EXPERT"]').check()
        page.locator('#football details summary').click()
        page.locator('[data-foot-category][value="Équipe de France"]').check()
        page.locator('[data-foot-category][value="Coupe du Monde"]').check()
        act(page,'start');m=saved(page)
        assert m['totalRounds']==2 and m['rounds']==1 and m['mode']=='classic' and m['players']==['François','Solène']
        assert all(lookup[q]['difficulty']=='EXPERT' and lookup[q]['category'] in ['Équipe de France','Coupe du Monde'] for q in m['deck'])
        expect(page.locator('.foot-handoff')).to_contain_text('Solène')
        act(page,'begin');expect(page.locator('#foot-timer')).to_have_text('01:00')
        assert page.locator('[data-foot="reveal"], [data-foot="next"]').count()==0
        expect(page.locator('.foot-answer')).to_be_visible()
        deadline=saved(page)['deadline'];first=page.locator('.foot-question').inner_text()
        # Deux appuis rapprochés ne valident pas deux questions pendant le retour visuel.
        page.evaluate('''()=>{const b=document.querySelector('[data-foot="correct"]');b.click();b.click();document.querySelector('[data-foot="wrong"]').click();}''')
        assert len(saved(page)['rows'])==1 and saved(page)['scores']==[1,0]
        assert len(sounds(page))==1, 'Un double appui ne doit pas rejouer le son.'
        expect(page.locator('.foot-feedback')).to_contain_text('+1')
        advance(page,499);expect(page.locator('#football')).to_have_attribute('data-screen','feedback')
        advance(page,1);expect(page.locator('#football')).to_have_attribute('data-screen','playing')
        assert saved(page)['deadline']==deadline and saved(page)['remaining']==59500
        assert page.locator('.foot-question').inner_text()!=first
        respond(page,'wrong');respond(page,'pass');respond(page)
        assert len(saved(page)['rows'])==4 and saved(page)['scores']==[2,0]
        assert len({r['question'] for r in saved(page)['rows']})==4
        feedback=sounds(page)
        assert len(feedback)==4
        assert [round(s['duration'],2) for s in feedback]==[.55,.38,.28,.55]
        for sound in feedback:
            assert sound['state']=='running',sound
            assert .01<sound['rms']<.2 and .05<sound['peak']<.65,sound
            assert abs(sound['first'])<.001 and abs(sound['last'])<.001,'Clic aux bords du son.'
        assert 80<feedback[1]['frequency']<250,feedback[1]
        assert feedback[0]['frequency']>1000,'La clochette doit être distincte du buzzer grave.'
        end(page)
        act(page,'var');expect(page.locator('#football')).to_have_attribute('data-screen','review')
        page.locator('[data-foot-review="1"][data-result="correct"]').click()
        assert saved(page)['scores']==[3,0]
        page.locator('[data-foot-review="0"][data-result="wrong"]').click()
        assert saved(page)['scores']==[2,0]
        act(page,'close-var');act(page,'next');act(page,'begin')
        respond(page);end(page)
        expect(page.locator('.foot-ranking li').first).to_contain_text('François')
        assert saved(page)['scores']==[2,1]
        # Modifier une ancienne manche après le classement peut changer le vainqueur.
        act(page,'var');page.locator('#foot-review-round').select_option('0')
        for i in [1,3]:page.locator(f'[data-foot-review="{i}"][data-result="wrong"]').click()
        act(page,'close-var');expect(page.locator('#football h1')).to_have_text('Solène gagne !')
        assert saved(page)['scores']==[0,1]
        assert len(sounds(page))==5,'La VAR et les bilans ne doivent pas rejouer les sons de la manche.'
        # Les sons joués par les deux jeux doivent être identiques échantillon par échantillon.
        act(page,'exit');page.locator('#headsBtn').click();page.locator('#hu-start').click()
        page.locator('#heads [data-act="buttons"]').click();advance(page,3100)
        expect(page.locator('#heads')).to_have_attribute('data-screen','playing')
        page.locator('#heads [data-act="correct"]').click();advance(page,700)
        page.locator('#heads [data-act="pass"]').click()
        assert page.evaluate('''()=>{
          const same=(a,b)=>{const x=a.buffer.getChannelData(0),y=b.buffer.getChannelData(0);return x.length===y.length&&x.every((v,i)=>v===y[i]);};
          return testSounds.length===7&&same(testSounds[0],testSounds[5])&&same(testSounds[2],testSounds[6]);
        }'''),'Le souffle ou la clochette diffère entre les jeux.'
        page.reload(wait_until='load');page.locator('#footballBtn').click();act(page,'resume')
        expect(page.locator('#football h1')).to_have_text('Solène gagne !')
        context.close();print('PASS: filtres, 500 ms chronométrés, anti-double-appui, buzzer grave, sons identiques à Devine Tête et VAR sans répétition sonore',flush=True)

        context,page=home(['Axel','Nico','François','Solène'])
        page.locator('[name="foot-format"][value="teams"]').check()
        assert page.locator('#foot-roster .foot-choices').evaluate('el=>el.nextElementSibling.id==="foot-teams"')
        expect(page.locator('.foot-team-table')).to_have_count(2)
        page.locator('[data-foot-move="0"]').click()
        expect(page.locator('[data-team="1"]')).to_contain_text('Axel')
        expect(page.locator('[data-team="0"]')).not_to_contain_text('Axel')
        page.locator('[data-foot-move="1"]').click()
        expect(page.locator('[data-team="0"]')).to_contain_text('Nico')
        page.locator('[name="foot-format"][value="individual"]').check()
        expect(page.locator('#foot-teams')).to_be_hidden()
        expect(page.locator('#foot-players .jdd-player-list')).to_be_visible()
        page.locator('[name="foot-format"][value="teams"]').check()
        expect(page.locator('#foot-players .jdd-player-list')).to_be_hidden()
        assert page.locator('.foot-team-table li > span').all_text_contents()==['Nico','François','Axel','Solène']
        page.screenshot(path=str(OUT/'setup-teams-393.png'),full_page=True)
        act(page,'start');assert saved(page)['totalRounds']==2 and saved(page)['rounds']==1
        for r in range(2):
            assert saved(page)['round']==r
            expect(page.locator('.foot-handoff strong').first).to_have_text('Équipe 2' if r==0 else 'Équipe 1')
            act(page,'begin');respond(page,'correct' if r==0 else 'wrong');end(page)
            if r==0:act(page,'next')
        assert saved(page)['scores']==[1,0]
        assert [sum(row['turn']==i for row in saved(page)['rows']) for i in [0,1]]==[1,1]
        assert saved(page)['finished'] and page.locator('[data-foot="next"]').count()==0
        act(page,'setup');act(page,'start')
        assert saved(page)['round']==0 and saved(page)['scores']==[0,0] and saved(page)['totalRounds']==2
        act(page,'exit');page.locator('#footballBtn').click()
        page.get_by_role('button',name='Retirer Nico',exact=True).click()
        assert 'Nico' not in page.evaluate('JSON.parse(localStorage.getItem("jdd.players"))')
        page.locator('#foot-players input[type="text"]').fill('Emma');page.locator('#foot-players .jdd-player-add').click()
        act(page,'shuffle')
        assert sorted(page.locator('.foot-team-table li > span').all_text_contents())==['Axel','Emma','François','Solène']
        assert [table.locator('li').count() for table in page.locator('.foot-team-table').all()]==[2,2]
        context.close();print('PASS: équipes sous le choix, flèches gauche/droite, un seul tour et nouvelle partie à zéro',flush=True)

        context,page=home(['Axel','Nico']);act(page,'start')
        for r in range(2):
            act(page,'begin');respond(page);end(page)
            if r==0:act(page,'next')
        expect(page.locator('#football h1')).to_have_text('Égalité !')
        act(page,'var');page.locator('[data-foot-review="1"][data-result="wrong"]').click();act(page,'close-var')
        assert saved(page)['scores']==[1,0]
        expect(page.locator('#football h1')).to_have_text('Axel gagne !')
        context.close();print('PASS: chacun joue une fois, égalité et vainqueur recalculé par la VAR',flush=True)

        context,page=home();act(page,'start');act(page,'begin')
        advance(page,7000);act(page,'pause');remaining=saved(page)['remaining'];assert remaining==53000
        advance(page,4000);assert saved(page)['remaining']==remaining
        page.reload(wait_until='load');page.locator('#footballBtn').click();act(page,'resume')
        expect(page.locator('#football')).to_have_attribute('data-screen','paused')
        act(page,'continue');expect(page.locator('#foot-timer')).to_have_text('00:53')
        act(page,'correct');before=saved(page);act(page,'exit')
        page.locator('#footballBtn').click();act(page,'resume');act(page,'continue')
        assert saved(page)['cursor']==1 and saved(page)['scores']==[1,0]
        assert page.locator('.foot-question').inner_text()==lookup[before['deck'][1]]['question']
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
        expect(page.locator('#football')).to_have_attribute('data-screen','paused')
        remaining=saved(page)['remaining'];advance(page,10000);assert saved(page)['remaining']==remaining
        page.evaluate('delete document.hidden')
        page.evaluate('testSounds[0].audio.suspend()');act(page,'continue')
        page.wait_for_function("testSounds[0].audio.state==='running'")
        advance(page,remaining-1)
        expect(page.locator('#football')).to_have_attribute('data-screen','playing')
        page.evaluate("offset+=1;sessionStorage.setItem('test-foot-offset',offset);document.querySelector('[data-foot=\"correct\"]').click()")
        expect(page.locator('#football')).to_have_attribute('data-screen','round-end')
        assert saved(page)['scores']==[1,0] and len(saved(page)['rows'])==1
        assert len(sounds(page))==1,'Un appui après la fin du chrono ne doit pas jouer de son.'
        context.close();print('PASS: pause, arrière-plan, reprise pendant le retour visuel et aucun point après 60 secondes',flush=True)

        context,page=home(['Solo'],fixture=[bank[0]])
        page.locator('[name="foot-difficulty"][value="EXPERT"]').check();act(page,'start');act(page,'begin');respond(page)
        expect(page.locator('.foot-exhausted')).to_be_visible()
        expect(page.locator('[data-foot="correct"]')).to_be_disabled()
        assert saved(page)['remaining']==59499
        end(page);assert saved(page)['scores']==[1]
        context.close();print('PASS: un thème épuisé ne répète pas ses questions et conserve les 60 secondes',flush=True)

        context,page=home()
        page.evaluate('window.AudioContext=window.webkitAudioContext=undefined')
        act(page,'start');act(page,'begin');respond(page);respond(page,'wrong');respond(page,'pass')
        assert saved(page)['scores']==[1,0] and len(saved(page)['rows'])==3 and not sounds(page)
        context.close();print('PASS: sans Web Audio, les trois actions et le chrono restent fonctionnels',flush=True)

        context,page=home([]);expect(page.locator('[data-foot="start"]')).to_be_disabled()
        page.locator('#foot-players input[type="text"]').fill('Invité');page.locator('.jdd-player-add').click()
        page.locator('[name="foot-format"][value="teams"]').check();act(page,'start')
        expect(page.locator('#foot-error')).to_contain_text('au moins 2')
        page.locator('[name="foot-format"][value="individual"]').check()
        page.locator('#football details summary').click()
        page.locator('[data-foot-category][value="Entraîneurs / sélectionneurs"]').check()
        page.locator('[name="foot-difficulty"][value="FOOTIX"]').check();act(page,'start')
        expect(page.locator('#foot-error')).to_contain_text('Aucune question')
        context.close()

        # Question/réponse les plus longues du vrai classeur et mots composés entiers.
        longest=max(bank,key=lambda q:len(q['question'])+len(q['answer']))
        compound=next(q for q in bank if 'Saint-Germain' in q['question'])
        for width,height in [(320,568),(360,800),(393,852),(430,932),(844,390),(1280,800)]:
            context,page=home(width=width,height=height,fixture=[longest,compound])
            page.locator('[name="foot-difficulty"][value="MIXED"]').check()
            page.locator('[name="foot-format"][value="teams"]').check()
            layout(page)
            tables=page.locator('.foot-team-table').all()
            left,right=[table.bounding_box() for table in tables]
            assert abs(left['y']-right['y'])<1 and left['x']+left['width']<=right['x']
            for control in page.locator('.foot-team-table button').all():
                box=control.bounding_box();assert box['width']>=44 and box['height']>=44
            page.screenshot(path=str(OUT/f'setup-teams-{width}.png'),full_page=True)
            act(page,'start')
            page.screenshot(path=str(OUT/f'chrono-ready-{width}.png'),full_page=True)
            act(page,'begin');layout(page,live=True)
            assert page.locator('.foot-word').evaluate_all('els=>els.every(el=>getComputedStyle(el).whiteSpace==="nowrap")')
            page.screenshot(path=str(OUT/f'chrono-live-{width}.png'),full_page=True)
            act(page,'correct');page.screenshot(path=str(OUT/f'chrono-feedback-{width}.png'),full_page=True)
            advance(page,501);layout(page,live=True)
            end(page);act(page,'var');layout(page)
            page.screenshot(path=str(OUT/f'chrono-var-{width}.png'),full_page=True)
            context.close()
        assert not errors,errors
        print('PASS: six formats, paysage, boutons visibles, grands textes et mots entiers',flush=True)
        browser.close()
finally:server.shutdown()

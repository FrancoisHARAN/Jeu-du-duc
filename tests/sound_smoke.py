#!/usr/bin/env python3
"""Son global : aucun démarrage audio en mode muet, persistance et réactivation."""
import os
from pathlib import Path
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/jdd-sound-review'); OUT.mkdir(exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(REPO),**kwargs)
    def translate_path(self,path): return super().translate_path(path.replace('/Jeu-du-duc/','/',1))
    def log_message(self,*args): pass

INIT = '''
  if(!localStorage.getItem('jdd.players'))localStorage.setItem('jdd.players',JSON.stringify(['François','Solène']));
  const now=Date.now;window.offset=0;Date.now=()=>now()+offset;
  window.DeviceOrientationEvent=undefined;
  window.testContexts=[];window.testStarts=[];window.testMediaPlays=[];
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(Audio){
    window.AudioContext=new Proxy(Audio,{construct(target,args){const audio=Reflect.construct(target,args);testContexts.push(audio);return audio;}});
    for(const Type of [AudioBufferSourceNode,OscillatorNode]){
      const start=Type.prototype.start;
      Type.prototype.start=function(...args){testStarts.push(this);return start.apply(this,args);};
    }
  }
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(...args){testMediaPlays.push(this);return play.apply(this,args);};
'''
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors=[]
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),headless=True)
        context=browser.new_context(viewport={'width':393,'height':852},is_mobile=True,has_touch=True,service_workers='block')
        context.add_init_script(INIT)
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(10000)
        page.goto(base,wait_until='load')
        def sound(on):
            expect(page.locator('#soundToggle')).to_have_attribute('aria-pressed',str(on).lower())
            expect(page.locator('[data-sound-icon="on"]')).to_be_visible() if on else expect(page.locator('[data-sound-icon="on"]')).to_be_hidden()
            expect(page.locator('[data-sound-icon="off"]')).to_be_hidden() if on else expect(page.locator('[data-sound-icon="off"]')).to_be_visible()
        def advance(ms): page.evaluate('ms=>offset+=ms',ms);page.wait_for_timeout(100)
        def foot(action): page.locator(f'#football [data-foot="{action}"]').click()
        def start_foot():
            page.locator('#footballBtn').click();foot('start');foot('begin')
        def silent():
            assert page.evaluate('testStarts.length===0&&testContexts.length===0&&testMediaPlays.length===0')
        def rapidity():
            page.locator('[data-mode="debut"]').click()
            page.evaluate('window.savedRandom=Math.random;Math.random=()=>0')
            page.locator('#startBtn').click()
            expect(page.locator('#typeBox')).to_have_text('RAPIDITÉ')
            page.evaluate('Math.random=savedRandom')
        sound(True)
        assert page.locator('.home-brand').count()==0
        page.locator('#soundToggle').click();sound(False)
        assert page.evaluate('localStorage.getItem("jdd.sound.enabled.v1")')=='false'

        page.locator('#headsBtn').click();page.locator('#hu-start').click()
        page.locator('#heads [data-act="countdown"]').click();advance(3100)
        expect(page.locator('#heads')).to_have_attribute('data-screen','playing')
        page.locator('#heads [data-act="correct"]').click();advance(700)
        expect(page.locator('#hu-points')).to_have_text('1')
        page.locator('#heads [data-act="pass"]').click();advance(700)
        # La fin du chrono inclut aussi des bips.
        advance(60000)
        expect(page.locator('#heads')).to_have_attribute('data-screen','results')
        page.locator('#heads [data-act="exit"]').click();silent()
        start_foot()
        for action in ['correct','wrong','pass']:
            foot(action);advance(501)
        expect(page.locator('#foot-score')).to_have_text('1')
        foot('exit');silent()
        rapidity();silent()
        assert page.locator('#rapidite-audio').evaluate('el=>el.muted&&el.paused')
        page.locator('#backLogo').click()
        page.reload(wait_until='load');sound(False);silent()
        print('PASS: Devine Tête, foot et Rapidité fonctionnent sans créer ni démarrer de sortie audio ; choix conservé après rechargement',flush=True)

        page.locator('#soundToggle').click();sound(True)
        start_foot();foot('correct')
        assert page.evaluate('testContexts.length===1&&testStarts.length===1&&JDDSound.destination().gain.value===1')
        page.evaluate('JDDSound.setEnabled(false)')
        page.wait_for_function('testContexts[0].state==="suspended"')
        assert page.evaluate('JDDSound.destination().gain.value===0')
        advance(501);foot('wrong');advance(501);foot('pass');advance(501)
        assert page.evaluate('testStarts.length')==1
        foot('exit');sound(False)
        page.locator('#soundToggle').click();sound(True)
        start_foot();foot('wrong');advance(501);foot('pass');advance(501)
        assert page.evaluate('testStarts.length===3&&testContexts.length===1')
        foot('exit')
        page.evaluate('''()=>{JDDSound.setEnabled(false);JDDSound.setEnabled(true);JDDSound.getContext();}''')
        page.wait_for_function('testContexts[0].state==="running"')
        assert page.evaluate('testStarts.length===3&&JDDSound.destination().gain.value===1')
        page.locator('#headsBtn').click();page.locator('#hu-start').click()
        page.locator('#heads [data-act="countdown"]').click();advance(3100)
        expect(page.locator('#heads')).to_have_attribute('data-screen','playing')
        page.locator('#heads [data-act="correct"]').click();advance(700)
        assert page.evaluate('testContexts.length===1&&testStarts.length>3')
        page.locator('#heads [data-act="exit"]').click()
        rapidity()
        page.wait_for_function('document.getElementById("rapidite-audio").paused===false')
        page.locator('#backLogo').click();page.locator('#soundToggle').click();sound(False)
        assert page.locator('#rapidite-audio').evaluate('el=>el.muted&&el.paused')
        print('PASS: arrêt immédiat des sons en cours, contexte suspendu, réactivation sans ancien son en attente et arrêt du MP3',flush=True)

        page.evaluate('''()=>{
          window.futureAudio=new Audio('song/rapidite.mp3');document.body.append(futureAudio);
          window.futureVideo=document.createElement('video');futureVideo.muted=true;document.body.append(futureVideo);
        }''')
        page.wait_for_function('futureAudio.muted&&futureVideo.muted')
        page.evaluate('futureAudio.muted=false');page.wait_for_function('futureAudio.muted')
        n=page.evaluate('testMediaPlays.length')
        page.evaluate('JDDSound.play(futureAudio)')
        assert page.evaluate('testMediaPlays.length')==n
        page.locator('#soundToggle').click()
        assert page.evaluate('!futureAudio.muted&&futureVideo.muted'), 'Le son global ne doit pas activer une vidéo initialement muette.'
        page.locator('#soundToggle').click()
        second=context.new_page();second.goto(base,wait_until='load')
        expect(second.locator('#soundToggle')).to_have_attribute('aria-pressed','false')
        second.locator('#soundToggle').click();sound(True)
        second.close()
        page.evaluate('''()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='jdd.sound.enabled.v1')throw new Error('storage blocked');return originalSetItem.call(this,key,value);};}''')
        page.locator('#soundToggle').click();sound(False)
        page.locator('#soundToggle').click();sound(True)
        page.evaluate('()=>{Storage.prototype.setItem=originalSetItem;}')
        print('PASS: nouveaux médias, autres onglets, vidéo déjà muette et réglage opérationnel sans stockage disponible',flush=True)
        context.close()

        for width,height in [(320,568),(393,852),(844,390),(1280,800)]:
            context=browser.new_context(viewport={'width':width,'height':height},is_mobile=width<900,has_touch=True,service_workers='block')
            page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(base,wait_until='load')
            button=page.locator('#soundToggle').bounding_box();account=page.locator('#accountButton').bounding_box()
            assert button['width']>=44 and button['height']>=44 and button['x']+button['width']<account['x']
            assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
            page.locator('#soundToggle').focus();page.keyboard.press('Space')
            expect(page.locator('#soundToggle')).to_have_attribute('aria-pressed','false')
            page.screenshot(path=str(OUT/f'muted-{width}.png'),full_page=True)
            page.keyboard.press('Enter');expect(page.locator('#soundToggle')).to_have_attribute('aria-pressed','true')
            context.close()
        assert not errors,errors
        browser.close();print('PASS: bouton unique, clavier, quatre tailles mobile/PC et aucune erreur JavaScript',flush=True)
finally: server.shutdown()

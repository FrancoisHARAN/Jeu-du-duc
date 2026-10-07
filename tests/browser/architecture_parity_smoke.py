from pathlib import Path
import json, threading
import os
import shutil
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect
from support.http import REPO, RepositoryHandler as Handler

OUT = Path('/tmp/jdd-architecture-review')
OUT.mkdir(exist_ok=True)
expected = json.loads((REPO / 'tests/fixtures/screens.json').read_text())
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/'
records = {}
with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),
        headless=True,
    )
    for width, height in [(393, 852), (1440, 900)]:
        for name, button, root in [
            ('home', None, '#setup'),
            ('duel', '#duelBtn', '#duel'),
            ('chess', '#chessBtn', '#chess'),
            ('heads', '#headsBtn', '#heads'),
            ('undercover', '#undercoverBtn', '#undercover'),
            ('geography', '#geographyBtn', '#geography'),
            ('football', '#footballBtn', '#football'),
            ('culture', None, '#game'),
        ]:
            context = browser.new_context(
                viewport={'width': width, 'height': height},
                is_mobile=width < 900,
                has_touch=width < 900,
                service_workers='block',
            )
            context.add_init_script(
                '''localStorage.setItem('jdd.players',JSON.stringify(['Alice','Bob','Chloé','Dani']));let uuidIndex=0;crypto.randomUUID=()=>`10000000-0000-4000-8000-${String(++uuidIndex).padStart(12,'0')}`;Date.now=()=>1791460800000;let seed=12345;Math.random=()=>(seed=seed*16807%2147483647)/2147483647;'''
            )
            page = context.new_page()
            page.goto(base, wait_until='load')
            if button:
                page.locator(button).click()
            if name == 'geography':
                page.locator('[data-geo-mode="cities"]').click()
            if name == 'culture':
                page.evaluate(
                    "JDD.DATA.culture=[];JDD.drawCard=()=>({id:'parity-fixture',question:'Quel nombre est premier ?',choices:['7','8','9','10'],answerIndex:0});"
                )
                page.locator('[data-mode="culture"]').click()
                page.locator('#startBtn').click()
            expect(page.locator(root)).to_be_visible()
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(550)
            page.evaluate('document.activeElement?.blur()')
            key = f'{name}-{width}'
            records[key] = page.locator(root).evaluate(
                '''el=>({html:el.outerHTML,text:el.innerText,nodes:[...el.querySelectorAll('h1,h2,input,select,button,summary')].filter(n=>n.getClientRects().length).map(n=>({tag:n.tagName,id:n.id,text:n.textContent,box:[n.getBoundingClientRect().width,n.getBoundingClientRect().height],css:['color','backgroundColor','fontFamily','fontSize','borderRadius','display'].map(p=>getComputedStyle(n)[p])}))})'''
            )
            page.screenshot(path=str(OUT / (key + '.png')), full_page=True, animations='disabled')
            context.close()
    browser.close()
assert records == expected, [
    (key, part)
    for key in records
    for part in records[key]
    if records[key][part] != expected[key][part]
]
(OUT / 'records.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))
server.shutdown()
server.server_close()
print(
    'PASS: seize écrans inchangés par rapport à 385a4a8 : DOM, textes visibles, dimensions et styles sur téléphone et PC.'
)

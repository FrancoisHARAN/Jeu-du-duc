#!/usr/bin/env python3
"""Import Culture G., photos, mélange et bonnes réponses dans Chromium."""
import io
import json
import os
from pathlib import Path
import re
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image
from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[1]
CHROMIUM = os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium')
assert CHROMIUM, 'Chromium est nécessaire.'
OUT = Path('/tmp/jdd-culture-review')
OUT.mkdir(exist_ok=True)
bank = [json.loads(line.strip().rstrip(',')) for line in
        (REPO / 'data/culture.imported.js').read_text().splitlines() if line.lstrip().startswith('{')]
assert len(bank) == len({q['id'] for q in bank}) == 7632
assert sum(bool(q.get('image')) for q in bank) == 234
assert sum(bool(q.get('choiceImages')) for q in bank) == 14
assert len({q['category'] for q in bank}) == 36
for q in bank:
    assert len(q['choices']) == len(set(q['choices'])) == 4 and q['answerIndex'] == 0
    assert q['category'] and q['source']['localId'] and q['source']['cloudId']
    if q.get('choiceImages'):
        assert len(q['choiceImages']) == 4 and all(q['choiceImages'])
print('PASS: 7 632 lignes, 36 catégories, 248 questions visuelles et quatre réponses par question', flush=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO), **kwargs)

    def translate_path(self, path):
        if path.startswith('/Jeu-du-duc/'):
            path = path[len('/Jeu-du-duc'):]
        return super().translate_path(path)

    def log_message(self, *args):
        pass


fixture = io.BytesIO()
Image.new('RGB', (480, 320), '#a7d5bc').save(fixture, format='PNG')
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors = []

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROMIUM, headless=True)

        def new_page(width=393, height=852):
            context = browser.new_context(viewport={'width': width, 'height': height},
                                          is_mobile=width < 900, has_touch=True, service_workers='block')
            context.add_init_script("localStorage.setItem('jdd.players', JSON.stringify(['Alice', 'Bob']));")
            page = context.new_page()
            page.set_default_timeout(10000)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://quizimagescm.s3.eu-west-3.amazonaws.com/**',
                       lambda route: route.fulfill(content_type='image/png', body=fixture.getvalue()))
            page.goto(base, wait_until='load')
            page.evaluate('''() => {
              window.imported = JDD.DATA.cultureMcq.filter(q => q.id && q.id.startsWith('classeur-'));
              window.originalBank = JSON.stringify(imported);
              window.testQuestion = imported.find(q => !q.image && !q.choiceImages);
              JDD.DATA.culture = [];
              JDD.drawCard = () => testQuestion;
              let seed = 4321;
              Math.random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
            }''')
            page.locator('[data-mode="culture"]').click()
            page.locator('#startBtn').click()
            return context, page

        def render(page, question):
            page.evaluate('question => { testQuestion = question; }', question)
            page.locator('.game-next-hint').dispatch_event('click', {'clientX': page.viewport_size['width'] - 1})
            expect(page.locator('.mcq-btn')).to_have_count(4)
            expect(page.locator('.mcq-btn').first).to_be_enabled()

        def verify_answer(page, question, choose_wrong=False):
            buttons = page.locator('.mcq-btn')
            if question.get('choiceImages'):
                shown = page.locator('#mcqGrid .quiz-image').evaluate_all('images => images.map(img => img.src)')
                assert sorted(shown) == sorted(question['choiceImages'])
                correct = shown.index(question['choiceImages'][0])
                assert not re.search(r'[A-F0-9]{8}-[A-F0-9-]{27}', page.locator('#game').inner_text())
            else:
                shown = buttons.all_text_contents()
                assert sorted(shown) == sorted(question['choices'])
                correct = shown.index(question['choices'][0])
            selected = (correct + 1) % 4 if choose_wrong else correct
            buttons.nth(selected).click()
            expect(buttons.nth(correct)).to_have_class(re.compile(r'mcq-correct'))
            expect(page.locator('.mcq-correct')).to_have_count(1)
            expect(page.locator('.mcq-wrong')).to_have_count(int(choose_wrong))
            assert buttons.evaluate_all('buttons => buttons.every(button => button.disabled)')
            return correct

        context, page = new_page()
        assert page.evaluate('imported.length') == 7632
        # Tous les médias du classeur sont liés à leur question / leur réponse.
        for i, question in enumerate(q for q in bank if q.get('image') or q.get('choiceImages')):
            render(page, question)
            if question.get('image'):
                expect(page.locator('#questionMedia')).to_be_visible()
                assert page.locator('#questionMedia img').get_attribute('src') == question['image']
                prompt = question.get('imageTitle') or 'Quelle est la bonne réponse pour cette image ?'
                assert prompt[0].lower() + prompt[1:] in page.locator('#currentQuestion').inner_text()
                assert question['question'] not in page.locator('#currentQuestion').inner_text()
            else:
                expect(page.locator('#questionMedia')).to_be_hidden()
            expect(page.locator('#questionMediaStatus')).to_be_hidden()
            expect(page.locator('#gameModeLabel')).to_have_text('Culture G.')
            expect(page.locator('#typeBox')).to_have_text('CULTURE G.')
            verify_answer(page, question, choose_wrong=i % 2 == 0)
        assert page.evaluate('JSON.stringify(imported) === originalBank')
        print('PASS: les 248 questions visuelles, leurs 290 photos et la bonne réponse restent associées après mélange', flush=True)

        text_question = bank[248]
        positions = set()
        for _ in range(40):
            render(page, text_question)
            positions.add(verify_answer(page, text_question))
        assert positions == {0, 1, 2, 3}, positions
        expect(page.locator('#questionMedia')).to_be_hidden()
        assert page.locator('#questionMedia img').count() == 0
        print('PASS: bonne réponse dans chacune des quatre positions, mauvaises réponses et nettoyage des anciennes photos', flush=True)

        image_question = {**bank[0], 'image': bank[0]['image'] + '?error-test=1'}
        target = image_question['image']
        page.route(target, lambda route: route.fulfill(status=404, body='indisponible'))
        page.evaluate('q => { testQuestion = q; }', image_question)
        page.locator('.game-next-hint').dispatch_event('click', {'clientX': 392})
        expect(page.locator('#questionMediaStatus')).to_contain_text('Une image n’a pas pu être chargée')
        assert page.locator('.mcq-btn').evaluate_all('buttons => buttons.every(button => button.disabled)')
        page.unroute(target)
        page.get_by_role('button', name='Réessayer', exact=True).click()
        expect(page.locator('.mcq-btn').first).to_be_enabled()
        expect(page.locator('#questionMediaStatus')).to_be_hidden()
        verify_answer(page, image_question)
        # Une URL neuve évite que le cache d'images décodées du navigateur
        # masque la seconde panne simulée.
        image_question = {**bank[0], 'image': bank[0]['image'] + '?error-test=2'}
        target = image_question['image']
        page.route(target, lambda route: route.fulfill(status=404, body='indisponible'))
        page.evaluate('q => { testQuestion = q; }', image_question)
        page.locator('.game-next-hint').dispatch_event('click', {'clientX': 392})
        expect(page.locator('#questionMediaStatus')).to_contain_text('Une image n’a pas pu être chargée')
        page.evaluate('q => { testQuestion = q; }', text_question)
        page.get_by_role('button', name='Question suivante', exact=True).click()
        expect(page.locator('#questionMediaStatus')).to_be_hidden()
        verify_answer(page, text_question)
        context.close()
        print('PASS: image absente, réponses bloquées, réessai et passage à la question suivante', flush=True)

        long_questions = [q for q in bank if not q.get('image') and not q.get('choiceImages') and
                          any(len(word) > 21 for text in [q['question'], *q['choices']] for word in re.split(r'\s+', text))]
        for width, height in [(320, 568), (360, 640), (393, 852), (430, 932), (568, 320), (852, 393), (1440, 900)]:
            context, page = new_page(width, height)
            for question in [bank[0], bank[2], *long_questions]:
                render(page, question)
                page.wait_for_function('''() => document.documentElement.scrollWidth <= innerWidth + 1 &&
                  [...document.querySelectorAll('#currentQuestion, .mcq-btn, .mcq-label')]
                  .every(el => el.scrollWidth <= el.clientWidth + 1)''')
                assert page.locator('#currentQuestion').evaluate('el => getComputedStyle(el).hyphens') == 'none'
                for image in page.locator('#game .quiz-image').all():
                    assert image.evaluate('el => el.naturalWidth > 0 && getComputedStyle(el).objectFit === "contain"')
                if width == 393 and question['id'] in ['classeur-1', 'classeur-3']:
                    page.screenshot(path=str(OUT / f'{question["id"]}.png'), full_page=True)
            context.close()
            print(f'PASS {width}×{height}: photos entières, quatre cartes, noms longs et URL sans débordement', flush=True)

        assert not errors, errors
        browser.close()
        print('PASS: aucune erreur JavaScript ; photos de contrôle, serveur réel non vérifié', flush=True)
finally:
    server.shutdown()
    server.server_close()

#!/usr/bin/env python3
"""Classeur Drapeaux : fidélité, sept formats, réponses mélangées et interactions tactiles."""
import argparse
from collections import Counter
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import threading
from http.server import ThreadingHTTPServer

from PIL import Image
from playwright.sync_api import expect, sync_playwright

from support.http import REPO, RepositoryHandler

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workbook', type=Path)
parser.add_argument(
    '--interactions-only',
    action='store_true',
    help='Contrôle ciblé après une modification des interactions.',
)
args = parser.parse_args()
source = (REPO / 'data/culture.flags.js').read_text()
data = json.loads(source[source.index('= ') + 2 :].strip().rstrip(';'))
assets = json.loads((REPO / 'data/culture.flags.images.json').read_text())
assert len(data['catalog']) == len({e['code'] for e in data['catalog']}) == 229
assert len(data['questions']) == len({q['id'] for q in data['questions']}) == 915
assert Counter(q['kind'] for q in data['questions']) == {
    'country': 229,
    'flag': 229,
    'capital': 228,
    'map': 229,
}
assert len(assets) == len(set(assets)) == 458
assert set(assets) == {e[key] for e in data['catalog'] for key in ['flag', 'map']}
for asset in assets:
    with Image.open(REPO / asset) as image:
        image.verify()
if args.workbook:
    spec = importlib.util.spec_from_file_location(
        'flags_import', REPO / 'tools/imports/import_flags_workbook.py'
    )
    importer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(importer)
    catalog, questions, embedded = importer.read_workbook(args.workbook)
    assert data == {'catalog': catalog, 'questions': questions}
    assert all((REPO / path).read_bytes() == value for path, value in embedded.items())
print('PASS: 229 fiches, 915 lignes sources et 458 PNG fidèles au classeur', flush=True)


Handler = RepositoryHandler


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}/Jeu-du-duc/'
errors = []
out = Path('/tmp/jdd-flags-review')
out.mkdir(exist_ok=True)
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            executable_path=os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium'),
            headless=True,
        )

        def create_page(width=393, height=852):
            context = browser.new_context(
                viewport={'width': width, 'height': height},
                is_mobile=width < 900,
                has_touch=True,
                service_workers='block',
            )
            context.add_init_script(
                "localStorage.setItem('jdd.players', JSON.stringify(['Alice', 'Bob']));"
            )
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base, wait_until='load')
            page.evaluate(
                '''() => {
              window.flagBank = JDD.DATA.cultureMcq.filter(q => q.flagKind);
              window.originalFlags = JSON.stringify(flagBank);
              window.testQuestion = flagBank.find(q => q.id === 'drapeaux-country-fr');
              JDD.DATA.culture = [];
              window.realDrawCard = JDD.drawCard;
              JDD.drawCard = () => testQuestion;
              const prepare = JDD.prepareFlagQuestion;
              JDD.prepareFlagQuestion = q => { window.lastFlagQuestion = prepare(q); return lastFlagQuestion; };
              window.recorded = [];
              JDDCloud.record = (event, rows, detail) => { recorded.push({rows, detail}); return Promise.resolve(); };
            }'''
            )
            page.locator('[data-mode="culture"]').click()
            page.locator('#startBtn').click()
            expect(page.locator('.mcq-btn').first).to_be_enabled()
            return context, page

        def render(page, identifier):
            page.evaluate('id => { testQuestion = flagBank.find(q => q.id === id); }', identifier)
            page.locator('.game-next-hint').dispatch_event(
                'click', {'clientX': page.viewport_size['width'] - 1}
            )
            kind = identifier.split('-')[1]
            if kind == 'spell':
                expect(page.locator('.flag-letter').first).to_be_enabled()
                expect(page.get_by_role('button', name='Passer', exact=True)).to_be_enabled()
            elif kind == 'match':
                expect(page.locator('.flag-match-image').first).to_be_enabled()
                expect(page.get_by_role('button', name='Passer', exact=True)).to_have_count(0)
            else:
                expect(page.locator('.mcq-btn').first).to_be_enabled()
                expect(page.get_by_role('button', name='Passer', exact=True)).to_have_count(0)
            return page.evaluate('lastFlagQuestion')

        def answer_mcq(page, q, wrong=False):
            if q.get('choiceImages'):
                shown = page.locator('#mcqGrid img').evaluate_all(
                    'nodes => nodes.map(img => img.getAttribute("src"))'
                )
                assert set(shown) == set(q['choiceImages'])
                correct = shown.index(q['choiceImages'][q['answerIndex']])
            else:
                shown = page.locator('.mcq-label').all_text_contents()
                assert set(shown) == set(q['choices'])
                correct = shown.index(q['choices'][q['answerIndex']])
            page.locator('.mcq-btn').nth((correct + 1) % len(shown) if wrong else correct).click()
            expect(page.locator('.mcq-correct')).to_have_count(1)
            expect(page.locator('.mcq-wrong')).to_have_count(int(wrong))
            assert page.locator('.mcq-btn').evaluate_all(
                'nodes => nodes.every(node => node.disabled)'
            )
            return correct

        context, page = create_page()
        page.evaluate(
            '''() => {
          const check = (condition, message) => { if (!condition) throw Error(message); };
          check(flagBank.length === 1602, 'Nombre de cartes');
          check(new Set(flagBank.map(() => realDrawCard('flags-test', flagBank).id)).size === 1602,
            'Historique indépendant par pays et format');
          const catalog = new Map(JDD.FLAG_DATA.catalog.map(e => [e.code, e]));
          for (let run=0;run<3;run++) for (const template of flagBank) {
            const q = JDD.prepareFlagQuestion(template), entry = catalog.get(q.code);
            if (q.flagKind === 'spell') check(q.answer === entry.name, q.id);
            else if (q.flagKind === 'match') {
              check(q.pairs.length === 4 && new Set(q.pairs.map(e=>e.code)).size===4, q.id);
              check(q.pairs.every(e => catalog.get(e.code).name===e.label && catalog.get(e.code).flag===e.image), q.id);
            } else {
              check(q.choices.length >= 3 && new Set(q.choices).size === q.choices.length, q.id);
              if(q.flagKind==='color') {
                check(!entry.visibleColors.includes(q.choices[0]), 'Couleur présente proposée comme absente : '+q.id);
                check(q.choices.slice(1).every(c=>entry.colors.includes(c)), q.id);
              } else if(q.flagKind==='capital') check(q.choices[0]===entry.capital && q.image===entry.flag, q.id);
              else if(q.flagKind==='country') check(q.choices[0]===entry.name && q.image===entry.flag, q.id);
              else check(q.choices[0]===entry.name && q.choiceImages[0]===entry.flag, q.id);
            }
          }
          check(JSON.stringify(flagBank) === originalFlags, 'Banque modifiée par les tirages');
        }'''
        )
        print(
            'PASS: 1 602 cartes, sept formats, choix distincts et réponses conservées sur trois tirages complets',
            flush=True,
        )

        qcm_cases = (
            data['questions']
            if not args.interactions_only
            else [q for q in data['questions'] if q['code'] == 'fr']
        )
        for index, template in enumerate(qcm_cases):
            q = render(page, template['id'])
            if q['flagKind'] in ['flag', 'capital']:
                country = next(e['name'] for e in data['catalog'] if e['code'] == q['code'])
                expect(page.locator('#currentQuestion')).to_contain_text(country)
            answer_mcq(page, q, wrong=index % 2 == 0)
        color_cases = (
            data['catalog']
            if not args.interactions_only
            else [e for e in data['catalog'] if e['code'] in ['fr', 'es', 'bz']]
        )
        for entry in color_cases:
            q = render(page, 'drapeaux-color-' + entry['code'])
            assert (
                page.locator('#questionMedia img').evaluate('img => getComputedStyle(img).filter')
                == 'grayscale(1)'
            )
            answer_mcq(page, q)
            assert (
                page.locator('#questionMedia img').evaluate('img => getComputedStyle(img).filter')
                == 'none'
            )
        print(
            f'PASS: {len(qcm_cases)} QCM et {len(color_cases)} couleurs, vrais visuels, corrections et mélange correct',
            flush=True,
        )

        def spell(page, identifier, wrong=False):
            q = render(page, identifier)
            expected = page.evaluate(
                'answer => [...JDD.normalizeFlagName(answer)].filter(c=>/[A-Z]/.test(c))',
                q['answer'],
            )
            buttons = page.locator('.flag-letter')
            # Placer puis retirer une lettre doit restaurer exactement ce bouton.
            buttons.first.click()
            page.locator('.flag-letter-slot').first.click()
            expect(buttons.first).to_be_enabled()
            assert page.locator('.flag-letter-slot').first.inner_text() == ''
            if wrong:
                other = next(i for i, char in enumerate(expected) if char != expected[0])
                expected[0], expected[other] = expected[other], expected[0]
            for char in expected:
                available = page.locator('.flag-letter:not(:disabled)').all()
                choice = next(b for b in available if b.inner_text() == char)
                choice.click()
            expect(page.locator('.flag-submit')).to_be_enabled()
            count = page.evaluate(
                'recorded.filter(e => e.detail?.question_id === lastFlagQuestion.id).length'
            )
            page.locator('.flag-submit').click()
            expect(page.locator('#answerText')).to_contain_text(q['answer'])
            expect(page.locator('.flag-spelling')).to_have_class(
                re.compile('flag-answer-' + ('wrong' if wrong else 'correct'))
            )
            assert (
                page.evaluate(
                    'recorded.filter(e => e.detail?.question_id === lastFlagQuestion.id).length'
                )
                == count + 1
            )
            assert page.evaluate('recorded.at(-1).detail.correct') == (not wrong)
            expect(page.get_by_role('button', name='Passer', exact=True)).to_have_count(0)

        spell(page, 'drapeaux-spell-fr')
        page.evaluate('testQuestion = flagBank.find(q => q.id === "drapeaux-country-fr")')
        page.locator('#mcqGrid').dispatch_event('click', {'clientX': 392})
        expect(page.locator('.mcq-btn')).to_have_count(4)
        spell(page, 'drapeaux-spell-ci', wrong=True)
        spell(page, 'drapeaux-spell-sx')
        print(
            'PASS: lettres répétées, retrait, accents, noms longs et un seul résultat par carte',
            flush=True,
        )

        # Passer fonctionne sans réponse et avec des lettres déjà placées.
        page.evaluate(
            '''() => {
            const draw=JDD.drawCard;window.skipDraws=0;
            JDD.drawCard=(...args)=>{skipDraws++;return draw(...args);};
        }'''
        )
        for partial in [False, True]:
            render(page, 'drapeaux-spell-fr')
            if partial:
                page.locator('.flag-letter').first.click()
            expect(page.locator('.flag-submit')).to_be_disabled()
            draws = page.evaluate('skipDraws')
            results = page.evaluate('recorded.length')
            page.evaluate(
                '''() => {
                window.staleSkip=document.querySelector('.flag-skip');
                testQuestion=flagBank.find(q=>q.id==='drapeaux-country-np');
            }'''
            )
            skip = page.get_by_role('button', name='Passer', exact=True)
            if partial:
                skip.press('Enter')
            else:
                skip.tap()
            expect(page.locator('.mcq-btn').first).to_be_enabled()
            expect(page.get_by_role('button', name='Passer', exact=True)).to_have_count(0)
            assert page.evaluate('lastFlagQuestion.id') == 'drapeaux-country-np'
            assert page.evaluate('skipDraws') == draws + 1
            assert page.evaluate('recorded.length') == results
            page.evaluate('staleSkip.click()')
            assert page.evaluate('skipDraws') == draws + 1
        print(
            'PASS: Passer sans lettres ou après saisie partielle, toucher/clavier, une seule carte suivante et aucun résultat attribué',
            flush=True,
        )

        for wrong in [False, True]:
            q = render(page, 'drapeaux-match-fr')
            if wrong:
                page.locator('.flag-match-image').first.click()
                chosen = page.locator('.flag-match-image').first.get_attribute('data-flag-code')
                page.locator(f'.flag-match-name:not([data-flag-code="{chosen}"])').first.click()
                expect(page.locator('.flag-match-status')).to_contain_text('Réessaie')
            for pair in q['pairs']:
                page.locator(f'.flag-match-image[data-flag-code="{pair["code"]}"]').click()
                page.locator(f'.flag-match-name[data-flag-code="{pair["code"]}"]').click()
            expect(page.locator('.flag-match-status')).to_have_text('4 / 4')
            assert page.evaluate('recorded.at(-1).detail.correct') == (not wrong)
            assert page.locator('.flag-matching button').evaluate_all(
                'buttons => buttons.every(b=>b.disabled)'
            )
        print(
            'PASS: associations par tap, erreurs corrigibles et résultat tenant compte des erreurs',
            flush=True,
        )

        # Les formats interactifs comptent dans la série du bon joueur, même en alternance.
        context.close()
        context, page = create_page()
        page.evaluate(
            "window.nextFlagPlayer=0; JDD.nextPlayer=()=>['Alice','Bob'][nextFlagPlayer++%2]"
        )
        spell(page, 'drapeaux-spell-fr')  # Alice : une bonne réponse.
        q = render(page, 'drapeaux-country-fr')
        answer_mcq(page, q, wrong=True)  # Bob : aucune série.
        q = render(page, 'drapeaux-match-fr')
        for pair in q['pairs']:
            page.locator(f'.flag-match-image[data-flag-code="{pair["code"]}"]').click()
            page.locator(f'.flag-match-name[data-flag-code="{pair["code"]}"]').click()
        q = render(page, 'drapeaux-country-fr')
        expect(page.locator('#cultureStreak')).to_be_hidden()
        answer_mcq(page, q, wrong=True)
        q = render(page, 'drapeaux-country-fr')
        expect(page.locator('#cultureStreak')).to_be_visible()
        expect(page.locator('#cultureStreak')).to_have_attribute(
            'aria-label', '2 bonnes réponses de suite'
        )
        answer_mcq(page, q, wrong=True)
        expect(page.locator('#cultureStreak')).to_be_hidden()
        print(
            'PASS: séries par joueur, lettres et associations incluses ; navigation habituelle après validation',
            flush=True,
        )

        page.evaluate("JDD.nextPlayer=()=> 'Alice'")
        spell(page, 'drapeaux-spell-fr')
        spell(page, 'drapeaux-spell-fr')
        render(page, 'drapeaux-spell-sx')
        expect(page.locator('#cultureStreak')).to_have_attribute(
            'aria-label', '2 bonnes réponses de suite'
        )
        results = page.evaluate('recorded.length')
        page.evaluate("testQuestion=flagBank.find(q=>q.id==='drapeaux-country-fr')")
        page.get_by_role('button', name='Passer', exact=True).tap()
        expect(page.locator('#cultureStreak')).to_be_hidden()
        assert page.evaluate('recorded.length') == results
        print('PASS: une question passée interrompt la série du joueur', flush=True)

        samples = [
            'drapeaux-country-fr',
            'drapeaux-flag-np',
            'drapeaux-capital-fr',
            'drapeaux-map-tr',
            'drapeaux-color-es',
            'drapeaux-spell-sx',
            'drapeaux-match-sx',
        ]
        context.close()
        for width, height in [(320, 568), (393, 852), (852, 393), (1440, 900)]:
            context, page = create_page(width, height)
            for identifier in samples:
                render(page, identifier)
                page.wait_for_function(
                    '''() => document.documentElement.scrollWidth <= innerWidth + 1 &&
                  [...document.querySelectorAll('#currentQuestion, .flag-spelling-word, .flag-match-name, .mcq-label')]
                  .every(el => el.scrollWidth <= el.clientWidth + 1)'''
                )
                if width == 393:
                    page.screenshot(path=str(out / (identifier + '.png')), full_page=True)
                if identifier.startswith('drapeaux-spell-'):
                    skip = page.get_by_role('button', name='Passer', exact=True)
                    expect(skip).to_be_visible()
                    bounds = skip.bounding_box()
                    assert bounds['width'] >= 44 and bounds['height'] >= 44
            # Retour à un QCM ordinaire : aucune interaction/image/consigne résiduelle.
            page.evaluate(
                'testQuestion = {question:"Quelle couleur ?", choices:["Bleu","Vert","Rouge","Jaune"],answerIndex:0}'
            )
            page.locator('.game-next-hint').dispatch_event('click', {'clientX': width - 1})
            expect(page.locator('.mcq-btn')).to_have_count(4)
            expect(page.locator('#questionMedia')).to_be_hidden()
            assert page.locator('#game').get_attribute('data-flag-kind') is None
            page.get_by_role('button', name='Bleu', exact=True).click()
            expect(page.locator('.mcq-correct')).to_have_count(1)
            context.close()
            print(
                f'PASS {width}×{height}: sept formats lisibles, mots entiers, retour aux autres questions',
                flush=True,
            )
        assert not errors, errors
        browser.close()
finally:
    server.shutdown()
    server.server_close()

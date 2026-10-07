#!/usr/bin/env python3
"""Import des fiches, questions et images intégrées du classeur Drapeaux (openpyxl, Pillow)."""
import argparse
import colorsys
import io
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from openpyxl import load_workbook
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
NS = {'x': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
EMBED = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed'
MODES = {'Pays depuis drapeau': 'country', 'Drapeau depuis pays': 'flag',
         'Capitale': 'capital', 'Drapeau depuis carte': 'map'}


def color_family(rgb):
    hue, saturation, value = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    hue *= 360
    if value < .18:
        return 'Noir'
    if saturation < .15:
        return 'Blanc' if value > .9 else 'Gris'
    if hue < 15 or hue >= 338:
        return 'Rouge'
    if hue < 40:
        return 'Marron' if value < .65 else 'Orange'
    if hue < 65:
        return 'Jaune'
    if hue < 160:
        return 'Vert'
    if hue < 265:
        return 'Bleu'
    return 'Violet' if hue < 305 else 'Rose'


def read_workbook(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        catalog_rows = list(workbook['Drapeaux et cartes'].values)
        question_rows = list(workbook['Questions'].values)
    finally:
        workbook.close()
    assert catalog_rows[3][0:2] == ('Code', 'Nom français'), 'Colonnes du catalogue inattendues.'
    assert question_rows[4][0:3] == ('N°', 'Mode', 'Question française'), 'Colonnes des questions inattendues.'
    catalog, questions, assets = [], [], {}
    with ZipFile(path) as archive:
        relations = {r.attrib['Id']: r.attrib['Target'].lstrip('/') for r in
                     ET.fromstring(archive.read('xl/drawings/_rels/drawing1.xml.rels'))}
        embedded = {}
        for anchor in ET.fromstring(archive.read('xl/drawings/drawing1.xml')):
            row = int(anchor.find('x:from/x:row', NS).text)
            col = int(anchor.find('x:from/x:col', NS).text)
            rid = anchor.find('.//a:blip', NS).attrib[EMBED]
            if (row, col) in embedded:
                raise ValueError(f'Deux images dans la même cellule : {row}, {col}.')
            embedded[row, col] = archive.read(relations[rid])
        for index, row in enumerate(catalog_rows[4:], 4):
            code, name, _, _, capital, level, continent, kind, hex_colors, flag, map_path = row
            if not re.fullmatch('[a-z]{2}', code):
                raise ValueError(f'Code invalide : {code}.')
            entry = {'code': code, 'name': name, 'capital': capital, 'level': level,
                     'continent': continent, 'type': kind}
            for col, field, source_path in [(2, 'flag', flag), (3, 'map', map_path)]:
                if source_path != f'{"flags" if col == 2 else "maps"}/{code}.png':
                    raise ValueError(f'Chemin image inattendu : {source_path}.')
                data = embedded[index, col]
                with Image.open(io.BytesIO(data)) as image:
                    image.verify()
                target = 'image/culture/drapeaux/' + source_path
                entry[field] = target
                assets[target] = data  # Extraction exacte, sans recompression ni recadrage.
            entry['sourceColors'] = [c.strip() for c in hex_colors.split(',')]
            entry['colors'] = list(dict.fromkeys(color_family(tuple(bytes.fromhex(c[1:])))
                                                for c in entry['sourceColors']))
            # Les armoiries peuvent contenir des couleurs absentes de la colonne source.
            # Ne jamais les proposer comme « couleur absente » si elles sont dans l'image.
            with Image.open(io.BytesIO(embedded[index, 2])) as image:
                pixels = image.convert('RGBA').convert('RGB').getcolors(image.width * image.height)
                entry['visibleColors'] = sorted({color_family(rgb) for _, rgb in pixels} | set(entry['colors']))
            catalog.append(entry)
        by_code = {entry['code']: entry for entry in catalog}
        if len(by_code) != len(catalog):
            raise ValueError('Code de pays en double.')
        for row in question_rows[5:]:
            number, mode, prompt, shown, answer, code, level, continent, kind, image, response_image = row
            entry = by_code[code]
            question_kind = MODES[mode]
            expected_image = entry['map' if question_kind == 'map' else 'flag']
            if image and 'image/culture/drapeaux/' + image != expected_image:
                raise ValueError(f'Mauvaise image liée à la question {number}.')
            if response_image and 'image/culture/drapeaux/' + response_image != entry['flag']:
                raise ValueError(f'Mauvais drapeau réponse à la question {number}.')
            if question_kind == 'country' and answer != entry['name']:
                raise ValueError(f'Mauvaise réponse pays à la question {number}.')
            if question_kind == 'capital' and answer != entry['capital']:
                raise ValueError(f'Mauvaise capitale à la question {number}.')
            questions.append({'id': f'drapeaux-{question_kind}-{code}', 'kind': question_kind,
                              'code': code, 'question': prompt,
                              'source': {'workbookId': number, 'mode': mode, 'shown': shown,
                                         'answer': answer, 'level': level,
                                         'continent': continent, 'type': kind}})
    if len(questions) != len({q['id'] for q in questions}):
        raise ValueError('Questions en double.')
    return catalog, questions, assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    catalog, questions, assets = read_workbook(args.workbook)
    for path, data in assets.items():
        target = args.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    data_dir = args.root / 'data'
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / 'culture.flags.js').write_text(
        '// Données françaises et images extraites du classeur Drapeaux_jeu_du_duc_questions_FR.xlsx.\n'
        'JDD.FLAG_DATA = ' + json.dumps({'catalog': catalog, 'questions': questions},
                                      ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    (data_dir / 'culture.flags.images.json').write_text(
        json.dumps(sorted(assets), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'{len(catalog)} fiches, {len(questions)} questions sources, {len(assets)} images extraites.')


if __name__ == '__main__':
    main()

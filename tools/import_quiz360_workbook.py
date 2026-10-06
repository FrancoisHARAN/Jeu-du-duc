#!/usr/bin/env python3
"""Import du classeur Quiz360 et de ses images locales (openpyxl et Pillow)."""
import argparse
import json
from pathlib import Path, PurePosixPath
import shutil

from openpyxl import load_workbook
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
HEADERS = (
    'ID', 'Catégorie originale', 'Niveau', 'Type', 'Question déchiffrée',
    'Bonne réponse (choix 1)', 'Choix 2', 'Choix 3', 'Choix 4',
    'Image dans l’archive', 'Lien Wikipédia', 'Vidéo YouTube', 'Cible', 'Info',
)
IMAGE_FOLDER = 'image/culture/quiz360'


def read_questions(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    questions, images = [], {}
    try:
        rows = iter(workbook['Questions FR'].values)
        if tuple(next(rows)) != HEADERS:
            raise ValueError('Colonnes Quiz360 inattendues : vérifier le classeur avant import.')
        for line, row in enumerate(rows, start=2):
            if not any(value is not None for value in row):
                continue
            local_id, category, level, kind, question, correct = row[:6]
            if not isinstance(local_id, int) or not isinstance(question, str) or not question.strip():
                raise ValueError(f'Identifiant ou question manquant à la ligne {line}.')
            entry = {
                'id': f'quiz360-{local_id}', 'category': category, 'question': question,
                'source': {'name': 'Quiz360', 'localId': local_id, 'type': kind,
                           'level': level, 'target': row[12]},
            }
            if kind == 'Vrai/Faux':
                if correct not in ('true', 'false') or any(value is not None for value in row[6:10]):
                    raise ValueError(f'Vrai/faux incomplet ou ambigu à la ligne {line}.')
                entry.update(choices=['Vrai', 'Faux'], answerIndex=0 if correct == 'true' else 1, vf=True)
                entry['source']['originalAnswer'] = correct
            elif kind in ('Texte', 'Image'):
                choices = list(row[5:9])
                if not all(isinstance(c, str) and c.strip() for c in choices) or len(set(choices)) != 4:
                    raise ValueError(f'Les quatre réponses doivent être distinctes et complètes à la ligne {line}.')
                entry.update(choices=choices, answerIndex=0)
                if bool(row[9]) != (kind == 'Image'):
                    raise ValueError(f'Image manquante ou inattendue à la ligne {line}.')
            else:
                raise ValueError(f'Type de question inconnu à la ligne {line} : {kind}.')
            if row[9]:
                original = PurePosixPath(row[9])
                if len(original.parts) != 2 or original.parts[0] != 'images' or original.suffix not in ('.jpg', '.png'):
                    raise ValueError(f'Chemin image invalide à la ligne {line}.')
                file = path.parent.joinpath(*original.parts)
                if not file.is_file() or file.resolve().parent != (path.parent / 'images').resolve():
                    raise ValueError(f'Image locale manquante à la ligne {line} : {original}.')
                asset = f'{IMAGE_FOLDER}/{original.name}'
                if asset not in images:
                    with Image.open(file) as image:
                        image.verify()
                    images[asset] = file
                entry['image'] = asset
                entry['source']['archiveImage'] = str(original)
                # Le libellé source (« Petunia », « Zimbabwe »…) nomme l'image :
                # le rendu existant utilise sa question neutre, sans révéler la réponse.
            for field, value in [('wikipedia', row[10]), ('youtube', row[11])]:
                if value:
                    entry[field] = value
            if row[13] is not None:
                entry['source']['info'] = row[13]
            questions.append(entry)
        if len({q['id'] for q in questions}) != len(questions):
            raise ValueError('Identifiants Quiz360 en double.')
        return questions, images
    finally:
        workbook.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output-root', type=Path, default=REPO)
    parser.add_argument('--include-review', action='store_true', help='Inclure les lignes signalées après validation de leur contenu.')
    args = parser.parse_args()
    questions, images = read_questions(args.workbook)
    reasons = json.loads((REPO / 'tools/quiz360_review.json').read_text(encoding='utf-8'))
    pending = [dict(question=q, reason=reasons[q['id']]) for q in questions if q['id'] in reasons]
    if set(reasons) != {entry['question']['id'] for entry in pending}:
        raise ValueError('Une ligne signalée ne correspond plus au classeur.')
    playable = questions if args.include_review else [q for q in questions if q['id'] not in reasons]
    data = args.output_root / 'data'
    data.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(q, ensure_ascii=False, separators=(',', ':')) for q in playable]
    (data / 'culture.quiz360.js').write_text(
        '// Questions ajoutées depuis Quiz360_questions_fr_dechiffrees.xlsx.\n'
        '// Images locales ; catégories et métadonnées conservées.\n'
        'JDD.registerMcq([\n  ' + ',\n  '.join(lines) + '\n]);\n', encoding='utf-8')
    (data / 'culture.quiz360.images.json').write_text(
        json.dumps(sorted(images), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (data / 'culture.quiz360.review.json').write_text(
        json.dumps([] if args.include_review else pending, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for asset, file in images.items():
        destination = args.output_root / asset
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, destination)
    print(f'{len(playable)} questions jouables, {len(questions) - len(playable)} en attente ; '
          f'{sum(bool(q.get("image")) for q in playable)} questions illustrées, '
          f'{sum(q.get("vf", False) for q in playable)} vrai/faux, {len(images)} images locales.')


if __name__ == '__main__':
    main()

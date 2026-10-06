#!/usr/bin/env python3
"""Import fidèle du classeur Culture G. (nécessite openpyxl)."""
import argparse
import json
from pathlib import Path

from openpyxl import load_workbook

HEADERS = (
    'ID local', 'ID cloud', 'Catégorie', 'Type', 'Question déchiffrée',
    'Bonne réponse déchiffrée', 'Mauvaise réponse 1', 'Mauvaise réponse 2',
    'Mauvaise réponse 3', 'URL image question', 'URL image bonne réponse',
    'URL image mauvaise réponse 1', 'URL image mauvaise réponse 2',
    'URL image mauvaise réponse 3', 'Lien Wikipédia déchiffré', 'Crédit image',
    'Titre image', 'Note', 'Pourcentage',
)


def read_questions(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook['Questions et réponses']
        rows = iter(sheet.values)
        if tuple(next(rows)) != HEADERS:
            raise ValueError('Les colonnes du classeur ont changé : vérifier le format avant import.')
        questions = []
        for row in rows:
            if not any(value is not None for value in row):
                continue
            local_id, cloud_id, category, kind, question = row[:5]
            choices = list(row[5:9])
            if not isinstance(question, str) or not all(isinstance(c, str) and c for c in choices):
                raise ValueError(f'Question ou réponses manquantes à la ligne {len(questions) + 2}.')
            entry = {
                'id': f'classeur-{local_id}', 'category': category,
                'question': question, 'choices': choices, 'answerIndex': 0,
                'source': {'localId': local_id, 'cloudId': cloud_id, 'type': kind,
                           'rating': row[17], 'successRate': row[18]},
            }
            for field, value in [('image', row[9]), ('wikipedia', row[14]),
                                 ('imageCredit', row[15]), ('imageTitle', row[16])]:
                if value and value != 'null':
                    entry[field] = value
            if any(row[10:14]):
                if not all(row[10:14]):
                    raise ValueError(f'Images de réponses incomplètes pour {entry["id"]}.')
                entry['choiceImages'] = list(row[10:14])
            if kind == 'Question en image' and not entry.get('image'):
                raise ValueError(f'Image de question manquante pour {entry["id"]}.')
            if kind == 'Réponses en images' and not entry.get('choiceImages'):
                raise ValueError(f'Images de réponses manquantes pour {entry["id"]}.')
            questions.append(entry)
        if len({q['id'] for q in questions}) != len(questions):
            raise ValueError('Identifiants locaux en double.')
        return questions
    finally:
        workbook.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data/culture.imported.js')
    args = parser.parse_args()
    questions = read_questions(args.workbook)
    lines = [json.dumps(q, ensure_ascii=False, separators=(',', ':')) for q in questions]
    args.output.write_text(
        '// Questions ajoutées depuis Jeu_du_duc_questions_dechiffrees.xlsx.\n'
        '// Catégories et métadonnées conservées ; réponses mélangées à l’affichage.\n'
        'JDD.registerMcq([\n  ' + ',\n  '.join(lines) + '\n]);\n', encoding='utf-8')
    print(f'{len(questions)} questions importées, {sum(bool(q.get("image")) for q in questions)} images de questions, '
          f'{sum(bool(q.get("choiceImages")) for q in questions)} questions avec réponses en images.')


if __name__ == '__main__':
    main()

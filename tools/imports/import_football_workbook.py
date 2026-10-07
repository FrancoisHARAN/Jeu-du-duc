"""Import déterministe du classeur fourni, sans exécuter de formule.

Usage : python tools/imports/import_football_workbook.py /chemin/Questions_football_jeu_du_duc_fr.xlsx
Nécessite openpyxl ; aucune dépendance à l'exécution de l'application.
"""

import argparse
import collections
import hashlib
import json
from pathlib import Path

import openpyxl


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    args = parser.parse_args()
    source = args.workbook
    repo = Path(__file__).resolve().parents[2]
    sheet = openpyxl.load_workbook(source, read_only=True, data_only=True)['Questions']
    rows = list(sheet.values)
    assert rows[0] == (
        'ID',
        'Question',
        'Réponse',
        'Thème',
        'Difficulté',
        'Difficulté source',
        'ID document',
    )
    questions = []
    for row in rows[1:]:
        ident, question, answer, category, difficulty, original_difficulty, document = row
        assert isinstance(ident, int) and question and answer
        assert difficulty in ('AMATEUR', 'CONNAISSEUR', 'EXPERT', 'FOOTIX')
        questions.append(
            dict(
                id=ident,
                question=question,
                answer=answer,
                category=category,
                difficulty=difficulty,
                sourceDifficulty=original_difficulty,
                sourceId=document,
            )
        )
    assert len(questions) == len({q['id'] for q in questions})
    result = dict(
        source=source.name,
        sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        questions=questions,
    )
    (repo / 'data/football.questions.json').write_text(
        json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n'
    )
    print(
        f"{len(questions)} questions importées ; {dict(collections.Counter(q['difficulty'] for q in questions))}"
    )


if __name__ == '__main__':
    main()

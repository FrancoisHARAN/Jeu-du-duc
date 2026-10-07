#!/usr/bin/env python3
"""Importe les règles du classeur Picolo dans data/picolo.cards.js.

Les cartes listées dans tools/imports/config/picolo_excluded.json (pack bar, stories, pub, réseaux sociaux, vitesse) sont ignorées.

Usage : python tools/imports/import_picolo_workbook.py /chemin/Jeu_a_boire_Picolo_regles_fr.xlsx

Les textes sont convertis au format du jeu ({p1}… joueurs, {n} gorgées, {team} équipe, « cul sec »).
La catégorie et le type de chaque carte viennent de tools/imports/config/picolo_classification.json
(classement fait carte par carte selon son contenu, voir docs/games/party.md).
"""
import argparse
import collections
import json
from pathlib import Path
import re

import openpyxl

UNCENSOR = {
    'mastur*er': 'masturber',
    'mastur*é': 'masturbé',
    'mast*urbé': 'masturbé',
    'fellati**': 'fellation',
    'coui**es': 'couilles',
    'couill*es': 'couilles',
    'sp*rme': 'sperme',
    'sodo*mie': 'sodomie',
    'mast*rbé': 'masturbé',
    'b*tes': 'bites',
    'porn*graphiques': 'pornographiques',
    'bi**': 'bite',
    'mastur*ant': 'masturbant',
    'sodom**': 'sodomie',
    'anuling*s': 'anulingus',
    'put*in': 'putain',
    'mer**': 'merde',
    'bi*te': 'bite',
    'chi*er': 'chier',
    'cou*ille': 'couille',
    'pé*tasse': 'pétasse',
    'p*ute': 'pute',
    'pu*tain': 'putain',
    'm*erde': 'merde',
    'mastur*ais': 'masturbais',
    'm*rde': 'merde',
    'mastur*ations': 'masturbations',
    'mastur*és': 'masturbés',
    'bukk*ake': 'bukkake',
    'coui***': 'couilles',
    'suceu**': 'suceuse',
    'bukka**': 'bukkake',
    'masturb*tion': 'masturbation',
    'sod*mie': 'sodomie',
    'N*que': 'Nique',
}
# verbe + « $ pénalités » / « une pénalité » / « autant de pénalités » / « -les » : prendre -> boire
DRINK = {
    'prennent': 'boivent',
    'prend': 'boit',
    'prends': 'bois',
    'Prends': 'Bois',
    'prendra': 'boira',
    'prenez': 'buvez',
    'Prenez': 'Buvez',
    'prendre': 'boire',
    'prendront': 'boiront',
    'prenant': 'buvant',
    'prendras': 'boiras',
    'Prend': 'Boit',
    'prendrez': 'boirez',
    'prendrai': 'boirai',
}
ULTIME = {
    'prend': 'fait',
    'prends': 'fais',
    'Prends': 'Fais',
    'prendre': 'faire',
    'prendra': 'fera',
    'prennent': 'font',
    'prenez': 'faites',
    'Prenez': 'Faites',
    'prendras': 'feras',
    'prendront': 'feront',
    'effectue': 'fait',
    'effectuera': 'fera',
    'effectuer': 'faire',
    'effectuant': 'faisant',
    'effectuent': 'font',
    'effectué': 'fait',
    'effectues': 'fais',
    'effectuez': 'faites',
}
PICOLO = [
    (r'#picoloapp', '#jeududuc'),
    (r'jouer à Picolo', 'jouer au Jeu du Duc'),
    (r'démarrer Picolo', 'démarrer le Jeu du Duc'),
    (r'qui tient Picolo', 'qui tient le téléphone'),
    (r'parties Picolo', 'parties de Jeu du Duc'),
    (r"n'as pas Picolo", "n'as pas le Jeu du Duc"),
    (r'\bun Picolo\b', 'un Jeu du Duc'),
    (r'\ble Picolo\b', 'le Jeu du Duc'),
    (r'\bde Picolo\b', 'du Jeu du Duc'),
    (r'\bà Picolo\b', 'au Jeu du Duc'),
    (r'\bPicolo\b', 'le Jeu du Duc'),
]


def convert(text):
    t = re.sub(r'\s+', ' ', str(text)).strip()
    for k, v in UNCENSOR.items():
        t = t.replace(k, v)
    for pat, rep in PICOLO:
        t = re.sub(pat, rep, t)
    # pénalité ultime -> cul sec
    t = re.sub(
        r"\b(\w+) (?:la|une|leur) pénalité ultime",
        lambda m: (
            f"{ULTIME[m.group(1)]} un cul sec"
            if m.group(1) in ULTIME
            else f"{m.group(1)} un cul sec"
        ),
        t,
    )
    t = re.sub(
        r'(?:la |une )?[Pp]énalité ultime',
        lambda m: 'Cul sec' if m.group(0)[0] in 'P' else 'cul sec',
        t,
    )
    # prendre des pénalités -> boire des gorgées
    t = re.sub(
        r"\b("
        + '|'.join(DRINK)
        + r")\b(?=(?: ensemble| tous deux| tous| toutes| chacun)?(?: \$| une| 1| \d+| autant de| deux| toutes les| les| ses| leurs?| ta| tes)? ?pénalit|-les|-en \$)",
        lambda m: DRINK[m.group(1)],
        t,
    )
    t = (
        t.replace('pénalités', 'gorgées')
        .replace('Pénalités', 'Gorgées')
        .replace('pénalité', 'gorgée')
        .replace('Pénalité', 'Gorgée')
    )
    # marqueurs : joueurs, équipe, nombre de gorgées
    n = 0

    def player(m):
        nonlocal n
        n += 1
        return '{p%d}' % n

    t = re.sub(r'%s', player, t)
    t = t.replace('%t', '{team}').replace('$', '{n}')
    # « {p1}, donne… ou fait un cul sec » : on s'adresse au joueur, donc à la 2e personne
    if t.startswith('{p1}, '):
        t = t.replace(' ou fait un cul sec', ' ou fais un cul sec').replace(
            ' Ou fait un cul sec', ' Ou fais un cul sec'
        )
        t = re.sub(r'\b([Oo]u) boit ', r'\1 bois ', t)
    return t, n


def load(src):
    rows = list(
        openpyxl.load_workbook(src, read_only=True, data_only=True)['Règles FR'].iter_rows(
            values_only=True
        )
    )[1:]
    out = []
    for r in rows:
        text, n = convert(r[1])
        out.append(
            {
                'id': r[0],
                'raw': r[1],
                'text': text,
                'pack': r[2],
                'stype': r[3],
                'n': n,
                'min': max(int(r[4] or 0), n),
                'key': r[5] or None,
                'parent': r[6] or None,
            }
        )
    return out


def build(src):
    root = Path(__file__).resolve().parents[2]
    classification = json.loads(
        (root / 'tools/imports/config/picolo_classification.json').read_text(encoding='utf-8')
    )
    # Cartes retirées par le propriétaire, y compris les défis de vitesse et leurs suites.
    excluded = json.loads(
        (root / 'tools/imports/config/picolo_excluded.json').read_text(encoding='utf-8')
    )
    cards = load(src)
    removed = {
        c['id']
        for c in cards
        if c['pack'] in excluded['packs_exclus'] or str(c['id']) in excluded['cartes']
    }
    removed_keys = {c['key'] for c in cards if c['id'] in removed and c['key']}
    cards = [c for c in cards if c['id'] not in removed and c['parent'] not in removed_keys]
    print(f'{len(removed)} cartes retirées (et les suites de {len(removed_keys)} règles)')
    kids = collections.defaultdict(list)
    for c in cards:
        if c['parent']:
            kids[c['parent']].append(c)
    out, follow = [], {}
    for c in cards:
        if c['parent']:
            continue
        mode, kind = classification[str(c['id'])]
        war = 1 if c['pack'] == 'war' or '{team}' in c['text'] else 0
        out.append([c['id'], mode, kind, c['text'], c['min'], war, c['key']])
        if c['key']:
            # mini-jeux (types 1, 11, 23) : la suite arrive à la carte suivante ; virus : 6 à 12 cartes plus tard
            nxt = 1 if c['stype'] in (1, 11, 23) and c['key'] != 'beretta' else 0
            follow[c['key']] = {
                'next': nxt,
                'items': [[k['id'], k['text'], k['min']] for k in kids[c['key']]],
            }
    body = json.dumps({'cards': out, 'follow': follow}, ensure_ascii=False, separators=(',', ':'))
    (root / 'data/picolo.cards.js').write_text(
        '// Cartes importées de Picolo (Jeu_a_boire_Picolo_regles_fr.xlsx, 5 569 règles) et réparties par contenu entre\n'
        '// Apéro chiantos (debut), Sexy pas raffiné (hardcore) et Torgnole express (alcool). Format : voir scripts/core/picolo.js.\n'
        'JDD.registerPicolo(' + body + ');\n',
        encoding='utf-8',
    )
    count = collections.Counter(c[1] for c in out)
    print(
        f"{len(out)} cartes ({dict(count)}), {sum(len(v['items']) for v in follow.values())} suites pour {len(follow)} règles"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    args = parser.parse_args()
    build(args.workbook)


if __name__ == '__main__':
    main()

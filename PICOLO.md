# Cartes importées de Picolo

`Jeu_a_boire_Picolo_regles_fr.xlsx` (5 569 règles, packs default, silly, war,
hot et bar) est ajouté aux cartes de soirée, sans retirer les cartes existantes.

## Répartition

Chaque carte de départ (5 066) a été classée selon son contenu dans l'une des
trois catégories, avec son type (Vérité, Action ou Tout le monde) :

- **Apéro chiantos** : questions, « tu préfères », jeux de listes et de culture,
  petits défis ; boire n'est que la sanction.
- **Sexy pas raffiné** : tout ce qui touche au sexe, à la nudité, à la drague
  ou aux bisous, quel que soit le pack d'origine.
- **Torgnole express** : les cartes où l'on boit et fait boire, cul sec, défis
  trash ou extrêmes, défis de bar avec des inconnus.

Le classement est enregistré dans `tools/picolo_classification.json`.
Les 503 cartes de suite (fins de règle, suites de mini-jeux) suivent la
catégorie de leur carte de départ.

## Conversion des textes

- `%s` devient le prénom d'un joueur (`{p1}` à `{p4}`), `%t` l'équipe (`{team}`)
  et `$` un nombre de gorgées tiré entre 2 et 4 (`{n}`).
- « prendre des pénalités » devient « boire des gorgées », et « pénalité ultime »
  devient « cul sec ».
- Les mots censurés par des astérisques sont écrits en entier, et Picolo est
  remplacé par le Jeu du Duc (`#picoloapp` devient `#jeududuc`).

## Fonctionnement dans le jeu (`scripts/core/picolo.js`)

- Une carte n'est tirée que s'il y a assez de joueurs. Certaines cartes en
  demandent plus que les prénoms qu'elles citent (« vous exclus »).
- **Règles (virus)** : la carte « Règle » reste en vigueur, et sa « Fin de règle »
  arrive 6 à 12 cartes plus tard, avec les mêmes joueurs.
- **Mini-jeux** (mot interdit, dictée, champions, poker…) : la « Suite » arrive à
  la carte suivante.
- **Équipes** (pack war) : dès 4 joueurs, la bande est répartie en deux équipes,
  Bleue et Rouge. La composition s'affiche sous chaque carte « Équipes » et reste
  la même tant que la liste de joueurs ne change pas.
- Les règles en cours et les équipes sont gardées après un rechargement et
  remises à zéro au lancement d'une nouvelle partie.

## Reproduire l'import

Avec Python et `openpyxl` :

```sh
python tools/import_picolo_workbook.py /chemin/Jeu_a_boire_Picolo_regles_fr.xlsx
```

Ensuite, changer les `?v=` de `data/picolo.cards.js` dans `index.html` et le
suffixe de `CACHE_NAME` dans `service-worker.js`.

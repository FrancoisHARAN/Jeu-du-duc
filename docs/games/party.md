# Cartes importées de Picolo

`Jeu_a_boire_Picolo_regles_fr.xlsx` (5 569 règles, packs default, silly, war,
hot et bar) complète les banques de cartes de soirée après les exclusions ci-dessous.

## Cartes retirées

À la demande du propriétaire, `tools/imports/config/picolo_excluded.json` écarte :
- tout le pack **bar** (447 défis avec des inconnus dans un bar) ;
- les 510 cartes « poste une phrase ou une story… #picoloapp », faites pour la pub de l'appli ;
- les cartes de pub (« si tu n'as pas l'appli », « note-la 5 étoiles »…) et celles où il faut
  agir sur les réseaux sociaux ou se servir de son téléphone (publier, liker, ajouter en ami, envoyer un snap,
  un texto ou une photo, lire ses SMS, prêter son portable…) ;
- les défis où il faut sortir ou aller voir des voisins ou des inconnus ;
- les défis de vitesse, de réflexe et de réponse dans un temps limité, ainsi
  que leurs suites. La catégorie Rapidité et son déclenchement aléatoire sont retirés du jeu.

Les aveux sur ses habitudes (« Ceux qui ont déjà posté bourrés sur un réseau social boivent »),
les jeux de listes et les « tu préfères » qui parlent de réseaux sociaux restent.

## Répartition

Chaque carte de départ a été classée selon son contenu dans l'une des
trois catégories, avec son type (Vérité, Action ou Tout le monde) :

- **Apéro chiantos** : questions, « tu préfères », jeux de listes et de culture,
  petits défis ; boire n'est que la sanction.
- **Sexy pas raffiné** : tout ce qui touche au sexe, à la nudité, à la drague
  ou aux bisous, quel que soit le pack d'origine.
- **Torgnole express** : les cartes où l'on boit et fait boire, cul sec, défis
  trash ou extrêmes.

Le classement est enregistré dans `tools/imports/config/picolo_classification.json`.
Les cartes de suite retenues (fins de règle, suites de mini-jeux) suivent la
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
- Les suites sauvegardées dont le texte a été retiré de la banque sont ignorées.

## Reproduire l'import

Avec Python et `openpyxl` :

```sh
python tools/imports/import_picolo_workbook.py /chemin/Jeu_a_boire_Picolo_regles_fr.xlsx
```

Ensuite, changer les `?v=` de `data/picolo.cards.js` dans `index.html` et le
suffixe de `CACHE_NAME` dans `service-worker.js`.

# Questions du classeur Culture G.

`data/culture.imported.js` ajoute les 7 632 lignes de
`Jeu_du_duc_questions_dechiffrees.xlsx` aux questions déjà présentes :

- 7 384 QCM textuels ;
- 234 questions avec une image ;
- 14 questions avec quatre réponses en images.

Les quatre réponses sont reprises dans l'ordre du classeur, avec `answerIndex: 0`
pour la colonne « Bonne réponse déchiffrée ». L'affichage mélange des objets
contenant la réponse, sa photo, son crédit et son indicateur de validité :
le mélange ne change jamais la bonne réponse dans les données.

`category` conserve la catégorie originale sans l'afficher. `source` conserve
les identifiants, le type, la note numérique et le pourcentage ; cette note
n'est pas une explication à afficher. Les liens Wikipédia, titres et crédits
sont également conservés. Les questions identiques dans le classeur restent
présentes : aucune suppression ni réécriture du contenu n'a été effectuée.

Une question en image contient un UUID au lieu d'un texte dans le classeur.
L'écran utilise son « Titre image » quand il existe (quatre lignes), sinon une
invitation neutre à choisir la réponse correspondant à l'image. Les UUID des
questions et des réponses illustrées ne sont jamais affichés au joueur.
Les photos sont affichées entières, sans recadrage ; les crédits fournis suivent
leur photo, y compris après mélange des propositions.

## Images et hors connexion

Le classeur contient 290 URL d'images, toutes sur
`https://quizimagescm.s3.eu-west-3.amazonaws.com`, sans fichiers intégrés.
Les images sont demandées au moment d'afficher la question. Les quatre réponses
restent désactivées jusqu'au chargement de toutes les images nécessaires.
Une erreur propose de réessayer ou de passer, sans révéler la bonne réponse.

Le service worker conserve les photos déjà demandées dans son cache pour les
retrouver hors connexion. Les photos jamais chargées nécessitent Internet.
Le réseau reste prioritaire, et les anciens caches sont supprimés après mise
à jour du worker, comme pour le reste de l'application. Le navigateur peut
effacer son stockage ; le serveur externe peut aussi devenir indisponible.

L'accès à ce serveur a été refusé par le proxy de l'environnement de développement
lors de l'import. Son domaine a été ajouté au brouillon des paramètres réseau,
à enregistrer et publier pour vérifier les images réelles. Les tests navigateur
utilisent des images locales de contrôle ; ils ne prouvent pas la disponibilité
de ces 290 URL sur le serveur d'origine.

La banque complète est incluse dans le cache essentiel de la PWA. Le rechargement
au retour au menu est protégé contre les notifications répétées de changement
de worker, qui pouvaient annuler une navigation déjà commencée. La mise à jour
attend toujours la fin de la partie en cours.

## Reproduire l'import

Avec Python et `openpyxl` :

```sh
python tools/import_culture_workbook.py /chemin/Jeu_du_duc_questions_dechiffrees.xlsx
```

Le script vérifie les colonnes et les images attendues avant d'écrire la banque.
Il ne modifie pas les autres fichiers de questions. Après un nouvel import,
versionner les assets dans `index.html`, incrémenter le cache du service worker,
puis exécuter `python tests/culture_smoke.py` et `python tests/pwa_smoke.py`.

## Vague Quiz360 du 6 octobre 2026

L'archive `Quiz360_questions_fr_dechiffrees.zip` est ajoutée séparément dans
`data/culture.quiz360.js`, sans remplacer les banques précédentes. Sur ses
6 950 lignes, 6 947 sont jouables :

- 6 026 QCM textuels ;
- 359 QCM illustrés ;
- 562 vrai/faux, traduits en boutons « Vrai » / « Faux ».

La première proposition du classeur est la bonne réponse pour les QCM ;
elle est mélangée à l'affichage par le système existant. Pour les vrai/faux,
`true` correspond à Vrai et `false` à Faux, sans inverser le résultat.
Les catégories originales (y compris la catégorie absente de la ligne 5179),
identifiants, niveaux, types, cibles et métadonnées sont conservés dans le code.
Les trois doublons exacts du fichier restent conservés avec leurs identifiants.
Aucune réécriture éditoriale des questions n'a été effectuée.

Les libellés des questions illustrées nomment souvent ce qui est montré
(« Petunia », « Zimbabwe »…) : ils restent dans les données, mais le jeu
affiche son invitation neutre existante pour ne pas donner la réponse.
Chaque photo est reliée à sa ligne et chaque bonne réponse reste reliée
à sa question lors du mélange des propositions.

Les 336 photos fournies sont copiées sans modification dans
`image/culture/quiz360/`. Leur liste `data/culture.quiz360.images.json` est
chargée par le worker à l'installation ; toutes les photos sont mises en
cache, même si leur question n'a jamais été vue. Cette vague fonctionne
donc entièrement hors connexion après la première installation du cache
avec Internet. Les limites des anciennes photos externes restent décrites
plus haut. Le cache v20 remplace les anciens caches ; le réseau reste
prioritaire pour récupérer les futurs changements.

Trois lignes contradictoires ont été signalées au propriétaire et conservées
dans `data/culture.quiz360.review.json`, sans les faire apparaître en partie :

- 1623 : l'anthophobie est associée aux contacts humains, contre les fleurs
  à la ligne 1622 ;
- 4671 et 4921 : la deuxième plus grande ville francophone est tantôt Paris,
  tantôt Montréal, sans date ni périmètre.

Leur contenu original n'est pas supprimé ni corrigé automatiquement. Les
motifs sont dans `tools/quiz360_review.json`. Pour reproduire l'import après
extraction complète du ZIP :

```sh
python tools/import_quiz360_workbook.py /chemin/Quiz360_questions_fr_dechiffrees.xlsx
```

Le script nécessite `openpyxl` et `Pillow`, vérifie les colonnes, les réponses,
les identifiants et toutes les images avant d'écrire la banque. Une éventuelle
validation explicite des lignes signalées permet l'option `--include-review`.
Les tests Culture G. contrôlent les 607 questions visuelles des deux imports,
les 562 nouveaux vrai/faux, le mélange des réponses et le rendu mobile.
Le test PWA vérifie aussi les 336 vraies photos hors ligne sous
`/Jeu-du-duc/`, puis les mises à jour et la suppression des anciens caches.

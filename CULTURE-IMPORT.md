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

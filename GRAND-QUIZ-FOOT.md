# Grand Quiz Foot

Jeu mobile sur un téléphone partagé, placé sous Géographie. La bande est
reprise automatiquement par le même éditeur de joueurs que les autres jeux.
Un invité et un compte portant le même prénom restent deux identités.

## Questions

`data/football.questions.json` contient les 4 631 lignes de la feuille
**Questions** du fichier `Questions_football_jeu_du_duc_fr.xlsx` fourni.
Les questions, réponses, thèmes, identifiants et niveaux source sont conservés
sans réécriture. L'empreinte SHA-256 du classeur figure dans le JSON.
Les trois niveaux demandés comptent 1 369 questions Amateur, 1 383 Connaisseur
et 1 378 Expert. Les 501 questions Footix restent accessibles via un quatrième
choix. Les deux thèmes vides sont affichés « Non classées » ; les variantes
de casse des thèmes source sont conservées séparément.

Réimport reproductible (Python et openpyxl, hors application) :

```sh
python tools/import-football.py /chemin/Questions_football_jeu_du_duc_fr.xlsx
```

La banque est le contenu fourni, sans vérification factuelle externe. Les
questions datées ou portant sur des records restent celles du classeur.
Le tirage évite de poser deux fois le même texte de question dans une partie,
même si le classeur contient plusieurs exemplaires. Un thème sans sélection
signifie tous les thèmes ; plusieurs thèmes cochés sont réunis.

## Parties

- **Classique** : alternance des joueurs ou équipes, réponse orale en 30 s,
  puis l'arbitre vérifie et valide « Bonne réponse » (+1) ou « Mauvaise réponse »
  (0). « Personne ne trouve » et le temps écoulé valent 0.
- **Shotgun** : même question pour tous. L'arbitre garde le téléphone, écoute
  les réponses, ouvre la réponse avant la fin des 30 s puis attribue 1 point
  au premier joueur ou à la première équipe ayant répondu juste. « Personne »
  ou le temps écoulé valent 0. L'arbitrage repose sur l'ordre des réponses
  entendues : aucun buzzer à distance ou connexion simultanée n'est nécessaire.
- **Équipes** : deux équipes préremplies et modifiables ; chaque équipe doit
  avoir au moins un membre. Un bouton mélange les joueurs de façon équilibrée.
- **Durée** : cible de 10 ou 20 questions ; le classique arrondit au nombre de
  camps pour donner autant de tours à tous. Si le filtre contient moins de
  questions distinctes, la partie utilise le nombre disponible en conservant
  cette équité ; impossible de lancer si aucun tour complet n'est possible.
- **Chrono** : démarre uniquement lorsque l'on affiche la question. La vérification
  arrête le chrono. Masquer l'application ou revenir au menu met la question
  en pause ; reprendre demande un geste explicite. Le classement conserve les
  égalités et ne désigne aucun vainqueur quand tous les scores sont nuls.

Une partie en cours est enregistrée sous `jdd.football.v1` avec son tirage,
ses scores, ses équipes et les identités du départ. Les préférences utilisent
`jdd.football.settings.v1`. La banque, l'illustration et les fichiers du jeu
sont précachés par le service worker ; le jeu fonctionne en mode avion après
une première installation complète.

## Statistiques et validation

Les résultats des comptes sont envoyés en fin de partie via `JDDCloud`, avec
un événement unique et une révision : les réessais ne doublent pas les points.
Les invités gardent uniquement le résultat local. En équipes, les tours et
points reviennent à chaque membre ; en Shotgun, un tour est une question
proposée à tous, et seule une réponse correcte validée est comptée comme
réponse donnée. L'application ne devine pas le nombre d'essais oraux ratés.
Les réponses sont arbitrées entre amis, sans prétention d'anti-triche.

L'extension SQL `202610060002_football.sql` doit être appliquée après la migration
des comptes. Elle ajoute le mode football à la contrainte et au RPC en
conservant les vérifications, les droits et les politiques RLS. Aucun accès
d'administration Supabase n'est disponible dans cet environnement : les
migrations ne sont pas appliquées automatiquement. Voir `SUPABASE.md`.

La recherche Internet demandée a été tentée sur GitHub, domaine autorisé par
l'environnement, sans résultat pertinent. Les sites de règles et les moteurs
de recherche ne figurent pas dans les domaines autorisés. Ces règles suivent
donc la demande fournie, et ne sont pas présentées comme une reproduction
vérifiée des règles officielles d'un jeu commercial.

```sh
python tests/football_smoke.py
python tests/accounts_smoke.py
python tests/pwa_smoke.py
JDD_PGLITE_MODULE=/chemin/pglite/dist/index.js node tests/accounts_security.mjs
```

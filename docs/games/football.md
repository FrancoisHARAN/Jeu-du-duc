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
python tools/imports/import_football_workbook.py /chemin/Questions_football_jeu_du_duc_fr.xlsx
```

La banque est le contenu fourni, sans vérification factuelle externe. Les
questions datées ou portant sur des records restent celles du classeur.
Le tirage évite de poser deux fois le même texte de question dans une manche,
même si le classeur contient plusieurs exemplaires. Un thème sans sélection
signifie tous les thèmes ; plusieurs thèmes cochés sont réunis.

## Parties

- **Classique** : chaque joueur ou équipe dispose de 60 secondes pour répondre
  oralement à autant de questions que possible. Le camp adverse tient le
  téléphone et voit la question avec sa réponse. Un appui sur « Correct »
  rapporte 1 point ; « Incorrect » et « Passer » valent 0. Le retour visuel
  vert, rose ou jaune dure 0,5 seconde, puis la question suivante apparaît
  automatiquement. Ces 0,5 seconde font partie des 60 secondes.
- **Shotgun** : 60 secondes de questions communes à tous. L'arbitre garde
  le téléphone et touche directement le nom du premier joueur ou de la
  première équipe ayant répondu juste (+1). Il peut passer une question.
  L'arbitrage repose sur l'ordre des réponses
  entendues : aucun buzzer à distance ou connexion simultanée n'est nécessaire.
- **Équipes** : deux équipes préremplies et modifiables ; chaque équipe doit
  avoir au moins un membre. Un bouton mélange les joueurs de façon équilibrée.
- **Durée** : 1 ou 2 tours. En classique, chaque camp joue une manche de
  60 secondes par tour ; en Shotgun, chaque tour est une manche commune.
  Aucun nombre de questions ne limite la partie. Une fois le filtre épuisé,
  aucune question n'est répétée avant la prochaine manche ; le chrono termine
  ses 60 secondes. Un filtre vide empêche de lancer la partie.
- **Difficulté** : Amateur, Connaisseur, Expert ou Footix ; « Tous les niveaux »
  mélange les difficultés du classeur dans le même tirage.
- **Chrono** : démarre sur « GO ! » et continue pendant les validations. À zéro,
  le bilan apparaît automatiquement ; une réponse encore ouverte ne compte
  pas comme incorrecte. Masquer l'application ou revenir au menu met la manche
  en pause ; reprendre demande un geste explicite. Le classement conserve les
  égalités et ne désigne aucun vainqueur quand tous les scores sont nuls.
- **VAR** : l'icône en haut à droite du bilan et du classement permet de
  corriger les réponses de n'importe quelle manche déjà jouée. Le score,
  le classement et les statistiques sont recalculés. En Shotgun, on peut
  changer le camp qui reçoit le point. Les corrections sont conservées
  immédiatement et restent accessibles via « Dernier classement ».

Une partie en cours est enregistrée sous `jdd.football.v2` avec son tirage,
ses scores, ses équipes et les identités du départ. Les préférences utilisent
`jdd.football.settings.v1`. L'ancienne sauvegarde v1 est conservée sans être
reprise dans les nouvelles règles. La banque, l'illustration et les fichiers du jeu
sont précachés par le service worker ; le jeu fonctionne en mode avion après
une première installation complète.

## Statistiques et validation

Les résultats des comptes sont envoyés en fin de partie via `JDDCloud`, avec
un événement unique et une révision : les réessais et corrections VAR ne
doublent pas les parties. Une correction après la fin envoie une nouvelle
révision du même événement, y compris après une coupure de connexion.
Les invités gardent uniquement le résultat local. En équipes, les manches et
points reviennent à chaque membre ; un tour joué correspond désormais à une
manche de 60 secondes. En classique, les réponses validées correctes ou
incorrectes comptent dans « Questions répondues », et les passes sont exclues.
En Shotgun, seule une réponse correcte attribuée à un camp est comptée comme
réponse donnée. L'application ne devine pas le nombre d'essais oraux ratés.
Le détail complet reste sur le téléphone ; le cloud reçoit les totaux et
les 500 dernières décisions sous forme compacte, sans noms d'invités.
Les réponses sont arbitrées entre amis, sans prétention d'anti-triche.

L'extension SQL `202610060002_football.sql` doit être appliquée après la migration
des comptes. Elle ajoute le mode football à la contrainte et au RPC en
conservant les vérifications, les droits et les politiques RLS. Aucun accès
d'administration Supabase n'est disponible dans cet environnement : les
migrations ne sont pas appliquées automatiquement. Voir `docs/backend/supabase.md`.

La recherche Internet demandée a été tentée sur GitHub, domaine autorisé par
l'environnement, sans résultat pertinent. Les sites de règles et les moteurs
de recherche ne figurent pas dans les domaines autorisés. Ces règles suivent
donc la demande fournie, et ne sont pas présentées comme une reproduction
vérifiée des règles officielles d'un jeu commercial.

```sh
python tests/browser/football_smoke.py
python tests/browser/accounts_smoke.py
python tests/browser/pwa_smoke.py
JDD_PGLITE_MODULE=/chemin/pglite/dist/index.js node tests/unit/accounts_security.mjs
```

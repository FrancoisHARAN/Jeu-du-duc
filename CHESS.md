# Échecs

Un duel local sur le même appareil, accessible juste sous Duel Foot. La
configuration utilise les joueurs partagés compte/invité et leurs identités,
avec deux sélecteurs et une seule cadence : 2, 5, 10 ou 20 minutes par joueur,
sans incrément. Les blancs sont attribués au hasard et jouent en premier.
Le choix Ajouter des joueurs ouvre l'éditeur partagé lorsque nécessaire.

## Plateau et règles

Le plateau garde les blancs en bas, sans rotation entre les coups. Toucher une
pièce affiche ses cases légales ; toucher la destination joue immédiatement.
Le plateau occupe presque toute la largeur du téléphone avec 8 pixels de marge.
Les pièces Staunton sont des SVG originaux, en crème et violet, avec les contours
et les couleurs de Jeu du Duc. Une courte animation suit la pièce déplacée et
respecte la réduction des mouvements. Le visuel du menu reprend l'image fournie,
avec le cavalier, la couronne et la tour, transparence et compression WebP sans perte à 1 254 pixels.

`vendor/chess/chess.js` fournit chess.js 1.4.0, conservé localement sous licence
BSD-2-Clause avec sa licence et sa provenance. Le moteur valide tous les coups,
les échecs, pièces clouées, deux roques et droits perdus, prise en passant et
promotions. Une promotion demande dame, tour, fou ou cavalier ; l'horloge continue
pendant ce choix. Le mat, le pat, le matériel insuffisant, la triple répétition
et la règle des 50 coups terminent automatiquement la partie. L'abandon et une
nulle convenue entre les deux joueurs sont également disponibles.

## Horloges et reprise

`scripts/core/chess-match.js` gère la partie et les deux horloges indépendamment
du DOM. Un coup valide change l'horloge active ; un geste invalide conserve le
trait et consomme toujours le temps du joueur. Les horloges commencent au
lancement, sans action supplémentaire. À zéro, l'autre joueur gagne sauf s'il
ne peut pas mater, notamment avec un roi seul. Les actions Pause et Menu arrêtent
explicitement le temps. Passer l'application en arrière-plan ne l'arrête pas :
le temps réel écoulé est déduit au retour, sans dépendre du rythme des timers.

La sauvegarde locale `jdd.chess.v1` contient les joueurs, la cadence, les temps,
la position initiale, tous les coups et le résultat. La reprise reconstruit les
coups avec le moteur, afin de préserver les droits de roque, prises en passant,
compteur de 50 coups et répétitions. Elle rejette les sauvegardes incohérentes.
Un rechargement comptabilise le temps écoulé d'une horloge active puis met la
partie en pause à l'accueil jusqu'à Reprendre. Les boutons, cases et promotions
fonctionnent au toucher comme au clavier. Le son discret des coups respecte
l'interrupteur sonore global. La partie reste locale et n'ajoute aucune table
ou statistique au Grand Quiz Foot. Tous les fichiers utiles sont précachés par
la PWA ; aucun service d'échecs distant ni téléchargement en cours de partie.

## Vérification

- `node tests/chess_match.cjs` : positions de référence (perft), règles spéciales,
  légalité, cadence, horloges, résultats et répétition conservée à la reprise.
- `python tests/chess_smoke.py` : vrais gestes tactiles, configuration, identités,
  horloges, roques, promotion, prise en passant, mat, pat, fin au temps et sept
  formats téléphone, paysage et PC.
- `python tests/pwa_smoke.py` : moteur, pièces, visuel, horloges et reprise hors
  connexion, navigation vers les autres jeux et mise à jour de la PWA.

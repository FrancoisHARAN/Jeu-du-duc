# Duel Foot

Un match local sur le même téléphone, accessible sous Grand Quiz Foot. Les deux
joueurs sont choisis dans la bande existante, avec leurs identités compte/invité
et leurs avatars. Chaque joueur choisit 1-2-2, 2-1-2 ou 2-2-1 ; cinq pions par
camp et premier à trois buts. Les premiers joueurs de la bande sont présélectionnés.

## Contrôle et physique

Le canvas reçoit les Pointer Events, avec capture du doigt pendant le tir et
zone de sélection de 44 pixels minimum. Le vecteur de lancement est opposé au
glissement ; 3 cm CSS (environ 113 pixels) donnent la puissance maximale, quelle
que soit la taille du terrain. Un petit déplacement ou un geste annulé ne tire
pas. La flèche et son pourcentage montrent la puissance plafonnée.

`scripts/core/duel-physics.js` contient un moteur indépendant du rendu : onze
disques avec masse, vitesse, rotation, impulsions normales et tangentielles,
friction progressive. Le pas de 1/120 seconde est subdivisé quand nécessaire,
avec au plus trois unités parcourues par sous-pas. Dix passes du solveur corrigent
les contacts. Le terrain utilise des segments avec extrémités rondes et quatre
arcs de rayon 56 ; les poches des buts possèdent leurs murs latéraux et arrière.
Les mêmes coordonnées servent au dessin et aux collisions. Le ballon est plus
petit que les pions ; les touches décentrées changent sa direction et sa rotation.

Le premier contact avec un coéquipier autre que le tireur capture la passe.
Un ressort amorti retient le ballon ; le receveur suit un petit arc autour de lui
vers l'alignement avec le but adverse. Les disques gênants gardent leur masse et
sont poussés par les collisions. Près d'un mur, l'angle réalisable le plus proche
est choisi. Une fois les mouvements terminés, le receveur est le seul pion actif
et peut immédiatement rejouer. Aucun bouton entre les tirs. Sans passe ni but,
le tour change. Un but exige le franchissement complet du ballon, puis une
animation de 1,1 seconde et une remise aux formations ; le joueur qui encaisse
reprend. À trois buts, le résultat reste affiché jusqu'à Rejouer ou Menu.

## Intégration

`scripts/app/duel-football.js` gère les formations, le terrain, les gestes et les
écrans. La simulation utilise requestAnimationFrame et s'arrête quand elle est
immobile. Un départ au menu, une pause, un rechargement ou le passage en
arrière-plan conserve les positions, le tour, le receveur, les scores et les
identités dans `jdd.duel-football.v1`. Les états invalides sont ignorés. La reprise
ne compte pas le temps passé en arrière-plan. Les sons de tir et de but respectent
l'interrupteur global ; la célébration respecte la réduction des animations.

Le match est local et ne requiert pas de nouvelle table Supabase. Ses scores ne
sont pas mélangés aux statistiques du Grand Quiz Foot. Scripts, style et icône
sont précachés par la PWA et fonctionnent hors connexion, à la racine comme dans
le sous-dossier GitHub Pages.

## Vérification

- `node tests/duel_physics.cjs` : formations, angles, vitesse maximale, rebonds,
  limites, passes enchaînées, poussée des obstacles, reprise et victoire à trois.
  Les positions sont contrôlées à chaque pas de 150 actions déterministes.
- `python tests/duel_smoke.py` : vrais gestes tactiles Chromium, identités
  homonymes, choix des joueurs, annulations, sauvegarde, passes, buts et sept
  formats mobiles/paysage/PC.
- `python tests/pwa_smoke.py` : précache, match hors connexion, navigation vers
  les autres jeux et mise à jour sans interrompre une partie.

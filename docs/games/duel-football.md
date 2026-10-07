# Duel Foot

Un match local sur le même téléphone, accessible sous Grand Quiz Foot. Les deux
joueurs sont choisis dans la bande existante, avec leurs identités compte/invité
et leurs avatars. Chaque joueur choisit 1-2-2, 2-1-2 ou 2-2-1 ; cinq pions de
champ et un gardien par camp, premier à trois buts. Les premiers joueurs de la
bande sont présélectionnés. Tous les pions portent l'initiale du prénom de leur
équipe, orientée vers son propriétaire : camp inférieur à 0°, camp supérieur
à 180° pour jouer face à face. Le gardien, plus grand, démarre sur sa ligne de but ;
son rayon est de 20 contre 15 pour les autres pions. Il est jouable, mobile et
peut recevoir des passes comme tous ses coéquipiers.
L'engagement initial est tiré au sort une seule fois. L'équipe qui engage garde
sa formation de base ; celle qui défend conserve les mêmes lignes, rapprochées
du but et resserrées en largeur. Après un but, l'équipe qui l'a encaissé engage
en attaque et le marqueur se remet en défense. Les positions ne changent pas
entre deux tirs.

## Contrôle et physique

Le canvas reçoit les Pointer Events, avec capture du doigt pendant le tir et
zone de sélection de 44 pixels minimum. Le vecteur de lancement est opposé au
glissement ; 3 cm CSS (environ 113 pixels) donnent la puissance maximale, quelle
que soit la taille du terrain. Un petit déplacement ou un geste annulé ne tire
pas. La flèche et son pourcentage montrent la puissance plafonnée.

`scripts/core/duel-physics.js` contient un moteur indépendant du rendu : treize
disques avec masse, vitesse, rotation, impulsions normales et tangentielles,
friction progressive. Le pas de 1/120 seconde est subdivisé quand nécessaire,
avec au plus trois unités parcourues par sous-pas. Dix passes du solveur corrigent
les contacts. Le terrain utilise des segments avec extrémités rondes et quatre
arcs de rayon 56 ; les poches des buts possèdent leurs murs latéraux et arrière.
Les mêmes coordonnées servent au dessin et aux collisions. Le ballon est plus
petit que les pions ; les touches décentrées changent sa direction et sa rotation.

Le premier contact avec un coéquipier autre que le tireur enregistre la passe.
Une liaison souple entre le ballon et le receveur applique des impulsions égales
et opposées : aucun ancrage fixe ne coupe leur inertie. Le tireur poursuit sa
course et peut pousser le receveur ; une passe forte avance davantage. Le recalage
commence quand tous les disques ralentissent. Le ballon reste fixe à sa position
d'arrêt ; seul le receveur pivote autour avec un ressort amorti et des collisions,
sans téléportation. Le ballon est temporairement immobile dans le solveur pendant
ce recalage, puis reprend sa masse et sa physique normales au prochain tir.
Huit unités séparent les bords du ballon et du receveur, au lieu de quatre,
pour faciliter les frappes décentrées. Cet
espace reste identique pour un gardien. Les disques gênants gardent leur masse et
sont poussés par les collisions. Près d'un mur, l'angle réalisable le plus proche
est choisi. Une fois les mouvements terminés, le receveur est le seul pion actif
et peut immédiatement rejouer. Aucun bouton entre les tirs. Sans passe ni but,
le tour change. Un but exige le franchissement complet du contour visible du
ballon au-delà du bord extérieur de la ligne peinte, dans l'ouverture du but.
Le franchissement déclenche immédiatement une animation de deux secondes
pendant laquelle les disques continuent à rebondir
et à ralentir, puis une remise aux formations ; l'équipe qui a encaissé reprend.
Le score est verrouillé pendant la célébration, même si le ballon ressort du but.
À trois buts, le résultat reste affiché jusqu'à Rejouer ou Menu.

Une bulle « Bonne passe ! » apparaît au début du recalage, pendant 1,6 seconde.
Elle suit le receveur, tournée vers son propriétaire, en laissant le ballon visible,
sans intercepter les gestes ni déplacer le terrain. Elle disparaît au début du
geste suivant, à la pause, au menu ou au
but ; elle ne rejoue pas à la reprise et respecte la réduction des animations.

## Intégration

`scripts/app/duel-football.js` gère les formations, le terrain, les gestes et les
écrans. La simulation utilise requestAnimationFrame et s'arrête quand elle est
immobile. Un départ au menu, une pause, un rechargement ou le passage en
arrière-plan conserve les positions, le tour, le receveur, les scores et les
identités dans `jdd.duel-football.v1`. Le format physique v3 reprend les sauvegardes
v1 et v2 ; les gardiens manquants sont ajoutés dans des emplacements libres près
de leur but, sans déplacer les anciens pions ou le ballon ni perdre les scores
ou le receveur. Les états invalides sont ignorés. La reprise ne compte pas le
temps passé en arrière-plan. Les sons de tir et de but respectent
l'interrupteur global. Le visuel transparent `image/duel/goal.webp` est préchargé
et décodé dès l'entrée dans le duel. La célébration apparaît à pleine opacité,
avec un rebond initial de 80 ms, petites pulsations, pièces et éclats,
puis disparition en deux secondes. Il reste au-dessus du terrain sans bloquer
les commandes et disparaît
au menu ou à la pause ; la réduction des animations est respectée.
Le bandeau de tour garde une hauteur fixe. Les changements de score ou de phase
ne redimensionnent plus le canvas ; seuls un changement de taille d'écran et
le chargement des polices peuvent le faire. Les marges et le score sont plus
compacts pour laisser davantage de place au terrain mobile.

`scripts/core/duel-ball.js` projette les 32 panneaux d'un ballon sur une sphère
dans le Canvas 2D, avec ombre et brillance fixes. Sa rotation sur trois axes suit
le déplacement réel, les rebonds et le spin, sans modifier le moteur physique.
L'orientation est sauvegardée dans le match et réinitialisée à l'engagement.
Le rendu n'ajoute ni bibliothèque, ni texture, ni contexte WebGL.

Le match est local et ne requiert pas de nouvelle table Supabase. Ses scores ne
sont pas mélangés aux statistiques du Grand Quiz Foot. Scripts, style et icône
sont précachés par la PWA et fonctionnent hors connexion, à la racine comme dans
le sous-dossier GitHub Pages.

## Vérification

- `node tests/unit/duel_physics.cjs` : formations, angles, vitesse maximale, rebonds,
  limites, ballon fixe au recalage, passes enchaînées, poussée des obstacles,
  seuil exact des deux buts, reprise et victoire à trois.
  Les positions sont contrôlées à chaque pas de 150 actions déterministes.
- `python tests/browser/duel_smoke.py` : vrais gestes tactiles Chromium, identités
  homonymes, choix des joueurs, annulations, sauvegarde, passes, buts et sept
  formats mobiles/paysage/PC.
- `node tests/unit/duel_ball.cjs` : couverture de la sphère, roulement, directions,
  rotations, normalisation et indépendance de la physique.
- `python tests/browser/pwa_smoke.py` : précache, match hors connexion, navigation vers
  les autres jeux et mise à jour sans interrompre une partie.

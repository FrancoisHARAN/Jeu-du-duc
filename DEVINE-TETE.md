# Devine Tête

Jeu de devinettes ajouté sous Undercover. Il reprend le principe de Heads Up!
et de Guess Up / Devine Tête : le joueur tient un mot sur son front et ses amis
le lui font deviner pendant une manche chronométrée.

## Règles dans Jeu du duc

- Inscrire au moins deux prénoms en haut de l’accueil : la liste sert à tous les jeux.
  Le bouton « Modifier les joueurs » de Devine Tête permet aussi de compléter cette même liste.
- Choisir qui devine sur les cartes de joueurs, puis appuyer sur « Lancer la partie ».
- Tous les mots sont mélangés automatiquement, sans sélection de thèmes.
- Les nouvelles manches durent 60 secondes, avec l'inclinaison et les sons activés automatiquement.
- Les amis donnent des indices sans prononcer le mot ni une partie du mot.
- Téléphone à l’horizontale sur le front, écran vers les amis.
- Baisser l’écran vers le sol = trouvé, lever vers le ciel = passer.
  Revenir au front entre deux mots.
- Un mot trouvé vaut un point ; un mot passé ne retire aucun point.
- Le compte à rebours démarre après trois secondes de préparation. En mode
  inclinaison, il attend d’abord la position du téléphone au front.
- Le chrono se met en pause quand l’application passe en arrière-plan ou
  quand le téléphone revient en portrait pendant une manche avec les gestes.
- Le bilan permet de corriger une validation. Les prénoms de l’accueil
  servent à proposer le joueur suivant et à afficher les scores.

Les 420 mots des sept thèmes sont une sélection propre à ce projet, sans
modification des banques des autres jeux. Ils ne se répètent pas dans une
manche ; le tirage privilégie aussi les mots non vus dans les manches précédentes.
Les mots personnalisés déjà enregistrés rejoignent le mélange automatiquement.
Les trente dernières manches restent sur le téléphone ; les scores sont accessibles
dans une section repliée sous le bouton de lancement. Une manche en pause conserve
ses mots et sa durée jusqu'à sa fin.

Une clochette aiguë à deux notes confirme un mot trouvé ; un souffle ascendant
accompagne un mot passé. Ces sons originaux sont générés localement avec Web Audio,
activé depuis le bouton de lancement, et fonctionnent aussi hors connexion.

## Capteurs et PWA

`DeviceOrientationEvent.requestPermission()` est appelé directement depuis
le bouton de départ, lorsqu’il existe (notamment sur iPhone). Le site doit être
en HTTPS, comme GitHub Pages. Les boutons servent de remplacement si l’accès
est refusé, si aucun capteur ne répond ou si l’utilisateur les préfère.

Le geste utilise la composante verticale de la normale à l’écran,
`cos(beta) * cos(gamma)`, et fonctionne dans les deux sens du paysage. Un seuil,
un maintien minimum et un retour à la position neutre évitent les validations
multiples. Aucun accès à la caméra ou au microphone n’est demandé.

Le navigateur ne force pas le verrouillage paysage sur iOS : le joueur tourne
le téléphone et désactive son verrouillage portrait si nécessaire. Le maintien
de l’écran allumé est demandé aux navigateurs qui le proposent ; ailleurs, le
réglage de veille du téléphone continue de s’appliquer.

HTML, CSS, logique et mots sont inclus dans le cache PWA. Sons produits sur
le téléphone avec Web Audio. Le jeu fonctionne hors connexion une fois le
chargement initial terminé. Les nouvelles versions suivent le mécanisme réseau
prioritaire déjà utilisé par Jeu du duc.

## Recherche et validation

Sources consultées le 5 octobre 2026 :

- [Description publique d’Over-the-Head Charades](https://github.com/SomaRe/heads-up-charades-game#readme) :
  thèmes, téléphone sur la tête, compte à rebours, gestes, scores et écran de fin.
  Ses gestes gauche/droite diffèrent de ceux retenus ici : haut/bas, selon la
  demande et les captures fournies de Guess Up / Devine Tête.
- [Exemple de charades HTML5 avec orientation](https://github.com/alegogit/html5-charades#readme).
- [MDN : autorisation des mouvements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static)
  et [axes d’orientation](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Orientation_and_motion_data_explained),
  lus via les sources publiques officielles du dépôt `mdn/content`.

L’accès direct à l’App Store était bloqué par la politique réseau de
l’environnement (403) ; les fiches commerciales n’ont pas pu être consultées.
Les captures fournies par le propriétaire confirment les gestes haut/bas.

`python3 tests/heads_smoke.py` vérifie les manches, les gestes simulés dans les
deux sens paysage, les permissions accordées/refusées, les capteurs absents,
les pauses, les scores, le mélange des banques, les anciens réglages et les dimensions mobiles.
`python3 tests/pwa_smoke.py` vérifie le cache et le hors connexion.
Un essai sur de vrais iPhone/Android reste nécessaire pour confirmer le ressenti
et le sens des gestes avec leur matériel.

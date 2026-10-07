# Architecture actuelle

## Chargement et responsabilités

`index.html` est l'entrée du site. Ses scripts classiques `defer` s'exécutent
dans l'ordre du document ; ils communiquent par les API `window.JDD*`. Ce modèle
reste volontairement conservé : le remplacer par une compilation ou des imports
ES changerait le déploiement, les chemins et le fonctionnement hors connexion.

1. `scripts/core/init.js` initialise `JDD`, les registres de questions et le mélange.
2. `scripts/core/dom.js` définit l'échappement HTML et la transaction qui conserve
   le défilement, le focus et la sélection d'un champ pendant une mise à jour locale.
3. Les moteurs, helpers visuels, sonores, participants et services cloud sont chargés.
4. Les écrans enregistrent leurs modules dans `JDDModules`. Les contenus peuvent
   enregistrer leurs banques sans modifier les questions originales.
5. `scripts/app/main-game.js` relie l'accueil, les joueurs, les réglages, la
   navigation et le tirage des cartes. Il initialise les modules indépendamment :
   un module indisponible ne bloque pas les autres.
6. `scripts/pwa.js` enregistre le worker au chargement. Les imports de données qui
   suivent `main-game.js` sont prêts avant qu'une partie démarre, grâce à la garde
   `DOMContentLoaded` conservée dans ce dernier.

## Carte des fonctionnalités

Tous les chemins ci-dessous sont relatifs à la racine du dépôt.

| Fonctionnalité | Règles/services | Écran et contenu |
| --- | --- | --- |
| Soirée, mix personnalisé | `core/picolo.js`, `core/history.js`, `core/showQuestion.js` | `app/main-game.js`, `data/{debut,hardcore,alcool}.text.js`, `data/picolo.cards.js` |
| Culture G. | `core/culture-flags.js`, tirage commun | `app/culture-questions.js`, `app/culture-flags.js`, banques `data/culture.*` |
| Undercover | état et règles locaux dans le module | `app/undercover.js`, `data/undercover.pairs.js` |
| Devine Tête | manches, capteurs et équipes locaux | `app/heads-up.js`, `data/heads.*` |
| Géographie | cartes Leaflet et calculs du module | `app/geography.js`, `data/geography/` |
| Grand Quiz Foot | arbitrage, chrono et corrections du module | `app/football.js`, `data/football.questions.json` |
| Duel Foot | `core/duel-physics.js`, `core/duel-ball.js` | `app/duel-football.js` |
| Échecs | `vendor/chess/`, `core/chess-match.js`, `core/chess-pieces.js` | `app/chess.js` |
| Comptes/statistiques | `core/participants.js`, `core/cloud.js`, `core/statistics.js` | `app/accounts.js`, SQL `supabase/migrations/` |
| Joueurs communs | identités `JDDParticipants`, bande tenue par `main-game.js` | `app/player-editor.js` ; le choix de deux joueurs est partagé entre les deux duels |
| Son et visuels | `core/sound.js`, `core/feedback-sounds.js`, `core/visual-feedback.js` | styles et illustrations existants |

Le préfixe complet des fichiers `core/*` et `app/*` est `scripts/`.
Chaque écran possède sa feuille de style. Le découpage des autres jeux reste
local à leur module : leurs sauvegardes, transitions et timers forment un ensemble
cohérent. Les scinder davantage sans besoin mesuré créerait des dépendances et un
risque de régression.

`core/showQuestion.js` porte un nom historique mais gère réellement les paquets de
cartes et leur historique stable. Son chemin est conservé. Le rendu de Culture G.
est isolé dans une fabrique `JDDCultureQuestions.create(...)` qui reçoit le DOM,
les réglages et trois callbacks ; elle ne possède ni la navigation ni le tirage.

## Identités, événements et persistance

Un nom affiché n'est pas une identité. `JDDParticipants` distingue les UUID de
comptes et les identifiants d'invités, y compris les homonymes. Une partie capture
les participants et l'organisateur au départ. Les résultats cloud utilisent ces
identités capturées ; modifier la bande ne réattribue pas une partie commencée.

`jdd:players` et les callbacks `onPlayersChanged` actualisent les écrans.
`jdd:profiles`, `jdd:statistics`, `jdd:cloud` et les événements réseau/visibilité
mettent à jour les comptes, statistiques et synchronisations. Les mises à jour de
formulaires sont locales et conservent les champs, sections et réglages.

| Clé locale conservée | Donnée |
| --- | --- |
| `jdd.players`, `jdd.players.shared-v1` | Bande et repère de reprise des anciens joueurs Undercover |
| `jdd.participants.v1` | Identités des comptes/invités |
| `jdd.decks`, `jdd.picolo` | Historique des cartes, règles/suites et équipes |
| `jdd.settings` | Réglages de soirée |
| `jdd.undercover.v2` | Partie et scores Undercover |
| `jdd.heads.v1` | Manches, historique, mots et équipes Devine Tête |
| `jdd.geography.v1` | Partie de géographie |
| `jdd.football.v2`, `jdd.football.settings.v1` | Partie et réglages du quiz foot |
| `jdd.duel-football.v1`, `jdd.chess.v1` | Duels et horloges |
| `jdd.sound.enabled.v1` | Préférence sonore |
| `jdd.auth.v1`, `jdd.account-cache.v1`, `jdd.account-frequency.v1`, `jdd.auth-pending.v1` | Session, snapshot des comptes, fréquence de sélection et confirmation en cours |
| `jdd.cloud-outbox.v1` | Résultats en attente avec organisateur et révision |

Les noms, formats et migrations de ces clés sont conservés. Les anciennes parties
et files hors ligne ne sont ni effacées ni réinitialisées par la remise à plat.
Le repère de défilement d'un rechargement automatique reste en `sessionStorage`
sous `jdd.pwa.position:<périmètre>`. Les invariants exacts restent dans le code et
dans les tests de reprise ; ne pas inventer une migration lors d'un rangement.

## Chemins publics et PWA

Le manifest conserve `id`, `scope` et `start_url` à `./`. Le worker reste à la racine
avec le même périmètre et préfixe de cache. Le réseau est prioritaire ; le cache
sert de secours, y compris avec les requêtes audio partielles. Les données Auth,
REST et avatars privés ne deviennent pas des ressources publiques du worker.

Les 94 ressources de précache antérieures sont conservées. Deux modules internes
s'y ajoutent, ainsi qu'au chargement HTML ; les catalogues d'images Culture G.
restent inchangés. Une nouvelle version attend le retour à l'accueil et la fin
d'une saisie avant de recharger ; elle restaure le défilement.

Les PNG sources, anciennes icônes et URLs publiques historiques restent en place.
Les deux fichiers de drapeaux Papua/WEST Papua sont binaires identiques mais sont
référencés par deux contenus distincts : conserver les deux chemins évite de
modifier leurs données. Le manifeste de contrôle protège toutes les images
existantes utiles ou conservées pour compatibilité.

## Backend et préparation des données

Supabase constitue le backend distant ; le dépôt contient ses quatre migrations
SQL et deux modèles d'emails, sans changer leur contenu ni les appliquer à la
production pendant un nettoyage. Le SDK 2.117.2 est présent localement dans
`vendor/supabase` pour le navigateur et comme dépendance Node pour les outils.
Ces deux distributions ont des cibles différentes et sont volontairement gardées.

`tools/imports/config/` regroupe les décisions d'import, exclusions et lignes à
revoir. Les banques publiées et les données en attente restent dans `data/`.
Les scripts de géographie préparent les fichiers locaux ; le navigateur ne
charge ni Shapely, ni NumPy, ni les classeurs source.

Les mentions historiques de `DEVINE-TETE.md` et `GEOGRAPHIE.md` dans les fichiers
générés renvoient désormais à [Devine Tête](games/heads-up.md) et
[Géographie](games/geography.md). Leurs commentaires et métadonnées d'origine
restent conservés avec les banques, sans réécriture des données publiées.

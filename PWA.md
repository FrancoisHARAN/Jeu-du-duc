# Installer Jeu du duc

Site : https://francoisharan.github.io/Jeu-du-duc/

## iPhone

1. Ouvrir le site dans Safari (si le lien est dans l'application Google, l'ouvrir dans Safari).
2. Appuyer sur **Partager**, puis **Ajouter à l'écran d'accueil**.
3. Activer **Ouvrir comme app** si cette option est proposée. Vérifier le nom **Jeu du duc**.
4. Lancer le jeu depuis l'icône du roi.

Un ancien raccourci avec la lettre « L » peut conserver son ancien nom et son
icône. Le remplacer une seule fois par ce nouvel ajout. Il n'est ensuite pas
nécessaire de supprimer l'application pour les mises à jour du jeu.

iOS donne aux icônes un fond carré arrondi : la tête détourée est placée sur
un fond crème, sans fond violet dans l'illustration elle-même.

## Android

1. Ouvrir le site dans Chrome.
2. Choisir **Installer l'application** ou **Ajouter à l'écran d'accueil**.
3. Lancer le jeu depuis l'icône du roi.

## Après un commit sur GitHub

Attendre que GitHub Pages ait terminé le déploiement. Avec une connexion
Internet, fermer complètement Jeu du duc, puis le rouvrir depuis son icône.
Sur iPhone, fermer aussi l'application depuis le sélecteur d'applications si
l'ancien écran reste affiché. Le HTML, les scripts, les questions, le CSS et les
images sont recherchés sur le réseau à chaque chargement, même si le service
worker n'a pas changé. Aucune réinstallation n'est nécessaire.

Le worker est vérifié au lancement, au retour dans l'application et au retour
de la connexion. Une nouvelle version du worker s'active dès que son
téléchargement est terminé ; les
anciens caches de ce jeu sont supprimés. Une partie en cours n'est pas rechargée
automatiquement : le rechargement attend le retour à l'accueil.

## Hors connexion

Après une première ouverture en ligne et la fin du téléchargement initial, les
jeux, questions, illustrations, sons et polices sont disponibles hors connexion.
Une première visite sans connexion ne permet pas d'installer ni de télécharger
le jeu. Sans réseau, les nouveautés attendent la prochaine ouverture en ligne.

## Fichiers et publication

Le site reste en HTML/CSS/JavaScript, sans compilation ni changement du
déploiement GitHub Pages. Tous les chemins partent du dossier du projet :
le manifest et le worker fonctionnent sous `/Jeu-du-duc/` et à la racine.

- `manifest.webmanifest` : nom, lancement standalone, chemins et icônes Android.
- `index.html` : titre, icône Apple, balises iOS et chargement de la PWA.
- `image/app/` : dessin détouré, icône Apple 180 px, icônes 192/512 px, icône
  Android maskable et favicon.
- `scripts/pwa.js` : enregistrement et vérification du worker.
- `service-worker.js` : réseau prioritaire, cache de secours, audio hors ligne
  et suppression des anciennes versions des caches.
- `styles/pwa.css` et `fonts/` : polices locales et adaptation aux zones système.

Les réponses du cache ne bloquent pas les nouveaux fichiers : après quatre
secondes de réseau lent, la version disponible s'affiche et la requête continue
en arrière-plan pour actualiser le prochain lancement. Les données des joueurs
et les parties Undercover restent dans leur stockage actuel.

Lors d'un changement du worker, changer aussi le suffixe de `CACHE_NAME`.
Une modification des autres fichiers ne demande aucune action sur le worker :
ils sont actualisés par la stratégie réseau prioritaire. Si de nouvelles
ressources deviennent indispensables hors ligne, les ajouter à `SHELL_FILES`.

Les polices Montserrat sont distribuées avec leur licence dans `fonts/OFL.txt`.

## Vérification automatisée

Avec Python, Playwright, Pillow et Chromium disponibles :

```sh
python3 tests/pwa_smoke.py
```

Le test utilise une copie temporaire du site et un profil Chromium dédié. Il
vérifie les icônes, les critères d'installation, les chemins GitHub Pages,
le mode avion, les jeux, l'audio, les mises à jour sans changement du worker,
les mises à jour de CSS ou de questions seules et la suppression des anciens
caches. Le dépôt et les profils habituels du navigateur ne sont pas modifiés.

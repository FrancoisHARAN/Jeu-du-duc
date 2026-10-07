# Maintenance et validation

Toutes les commandes se lancent depuis la racine. Lire d'abord le
[README](../README.md), l'[architecture](architecture.md) et la documentation du
jeu concerné. Le site reste statique ; Node et Python sont de l'outillage.

## Installation et variables

```sh
npm ci
python3 -m pip install -r requirements-test.txt
```

Installer Chromium système, puis définir `PWA_TEST_CHROMIUM` si l'exécutable n'est
pas nommé `chromium`. Python 3.11+ et Node 24.5+ sont les cibles documentées.
`requirements-tools.txt` ajoute uniquement le formatage Python et les outils de
préparation géographique aux dépendances de test. Les versions sont fixées ; ne
pas mettre à jour le moteur chess.js, Leaflet ou Supabase dans une simple refonte.

Les outils cloud lisent `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` dans
l'environnement du processus. `.env.example` décrit leurs noms ; il ne contient
pas de secret et `.env` n'est pas chargé implicitement. Dans un environnement
géré, utiliser les variables fournies et conserver le proxy configuré.

```sh
npm run supabase:check -- --local
npm run supabase:check
```

La première commande vérifie la configuration sans réseau ; la seconde contrôle
les paramètres Auth en lecture seule, sans sélectionner une table. Le navigateur
utilise sa configuration publique séparée dans `scripts/supabase-config.js`.
Les secrets privilégiés, sessions, photos privées, bundles, classeurs source,
profils de navigateur et sorties de test n'ont pas leur place dans le dépôt.

## Tests et contrôles

```sh
npm run check
npm test
# Pour limiter les ressources, ou cibler une famille :
python3 tools/maintenance/run_tests.py --jobs 1
npm run test:unit
npm run test:browser
```

Le lanceur découvre les suites Node de `tests/unit/` et tous les
`*_smoke.py` de `tests/browser/`. Il n'écarte aucun jeu et exécute toutes les suites
même si une autre échoue. Chaque suite possède son processus et son stockage de
test. Le rapport JSON indique le code de sortie, la durée et le fichier de log.
Les logs sont dans `/tmp/jdd-test-logs`, le rapport dans `/tmp/jdd-test-results.json`.

Le serveur de test partagé et la simulation Supabase sont dans
`tests/browser/support/`. Les scénarios comptes et exploits importent ces fixtures
directement ; aucun test n'exécute une portion extraite du texte d'un autre test.
Les cas PWA et audio gardent leurs réponses HTTP spécifiques. Les contrôles SQL
exécutent les vraies migrations dans PGlite, jamais sur le projet distant.

`check_project.mjs` vérifie la syntaxe JS, les imports locaux, les références du
HTML/CSS, les liens Markdown, les catalogues d'images, le précache, la cohérence du
lock npm et l'absence de valeurs ressemblant à des secrets privilégiés. Les tests
Chromium vérifient les références dynamiques, clics, gestes, profils, statistiques,
reprises et mode avion que l'analyse statique ne peut pas garantir.

`tests/fixtures/compatibility.json` protège la base approuvée avant nettoyage
(`385a4a8`) : données et assets octet pour octet, ordre des scripts, DOM statique,
algorithmes indépendamment de leur formatage et fonctions Culture G. déplacées.
`screens.json` conserve le DOM et les styles de seize écrans mobile/PC. Ces
contrôles complètent les tests de gameplay, sans réécrire leurs attentes. Une
évolution intentionnelle des contenus ou du jeu nécessite de mettre à jour les
contrats concernés avec ses tests ; ne pas masquer une régression en régénérant
automatiquement ces références.

On peut exécuter une suite directement, par exemple :

```sh
node tests/unit/chess_match.cjs
python3 tests/browser/duel_smoke.py
python3 tests/browser/flags_smoke.py --workbook /chemin/Drapeaux_jeu_du_duc_questions_FR.xlsx
```

Les tests n'attestent pas la réception d'emails réels, le déploiement distant ou
les capteurs physiques d'un iPhone. Compléter ces points sur appareils et services
réels quand l'accès est disponible.

## Conventions

JavaScript propriétaire : deux espaces, points-virgules, guillemets simples et
formatage Prettier fixé. Python : quatre espaces, noms `snake_case`, garde
`if __name__ == '__main__'` pour les outils et formatage Black fixé. Les API,
classes CSS, clés persistantes et noms de fichiers publics existants constituent
des contrats ; les renommer ne fait pas partie d'une correction de formatage.

```sh
npm run format
npm run format:check
python3 -m pip install -r requirements-tools.txt
npm run format:python
npm run format:python:check
```

Les banques générées, distributions tierces, archives, HTML, CSS et configuration
publique restent exclus du formatage automatique. Les littéraux HTML embarqués
dans le JS ne sont pas reformatés : leurs espaces peuvent être visibles. Les
constantes de gameplay restent avec leur moteur ; ne pas fusionner des fonctions
qui se ressemblent si leurs délais, seuils, formats ou effets diffèrent.

## Importer et publier

Les importeurs sont dans `tools/imports/`, leurs décisions dans `config/`, les
préparateurs cartographiques dans `tools/geography/`. Les formats et procédures
sont détaillés dans les documents de chaque jeu et de Culture G. Un réimport
constitue une modification de contenu : il ne fait pas partie d'un nettoyage.

Après une modification, vérifier les suites pertinentes, les références et le
diff. Pour les nouvelles ressources nécessaires hors connexion, compléter
`SHELL_FILES`. Le worker est réseau prioritaire ; ses changements demandent un
nouveau suffixe `CACHE_NAME`. Conserver le scope et les anciennes URLs requises
par une installation existante. Versionner les scripts modifiés dans `index.html`.

La [règle de publication](../AGENTS.md) du propriétaire demande de committer et
pousser sur la branche actuelle après vérification, sans push forcé. Vérifier
GitHub Pages si l'environnement peut l'atteindre ; signaler précisément une
vérification bloquée sans prétendre que le déploiement a été constaté.

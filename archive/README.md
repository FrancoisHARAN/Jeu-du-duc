# Archives conservées

Ces fichiers ne sont ni chargés par `index.html`, ni précachés, ni utilisés par un
jeu actif. Ils sont conservés à l'identique pour leur valeur historique.

| Emplacement | Origine | Motif |
| --- | --- | --- |
| `prototypes/killer/killer.js` | `scripts/app/killer.js` | Prototype lié à un DOM `killer-screen` absent du site actuel |
| `prototypes/killer/gestures.js` | `data/killer.gestures.js` | Banque du même prototype, sans consommateur chargé |

Le prototype n'est pas autonome : son ancien DOM n'est pas dans l'application
actuelle. Ne pas le réintroduire comme dépendance du jeu sans une tâche explicite
sur cette fonctionnalité. Ses octets originaux sont vérifiés par le test de
compatibilité. `image/killer.png` garde son URL publique historique par prudence.

Les PNG sources et anciennes illustrations publiques restent dans `image/` pour
conserver leurs URLs ; leur statut est décrit dans l'[audit](../docs/audit-2026-10-08.md).
Les données en attente de validation éditoriale restent dans `data/` et leurs
motifs dans `tools/imports/config/` : ce sont des entrées maintenues, pas des
prototypes à supprimer.

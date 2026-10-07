# Visuels et retours de jeu

Les onze illustrations utilisées dans l'accueil et les en-têtes partagés sont
des WebP avec transparence réelle, y compris le logo Géographie fourni. Les
PNG originaux restent disponibles comme sources ; ils ne sont pas précachés.
Les zones violettes de l'accueil partagent la couleur `#6b62cc`.

Les flèches de navigation utilisent le tracé SVG de l'accueil. Les flèches de
déplacement d'équipes et de gestes gardent leur direction et utilisent le même
trait. Le bouton de lancement de l'accueil contient seulement son libellé et
sa flèche. Les modes Géographie sont Ville, Département et Pays, dans cet ordre.

Culture G affiche une petite flamme à partir de deux bonnes réponses de suite,
sur la prochaine question du joueur. Les séries sont séparées par identité
compte/invité, conservées pendant la partie et remises à zéro à son lancement.
Une mauvaise réponse ou une question passée rompt uniquement la série du joueur
concerné. Les QCM et vrai/faux sont évalués automatiquement ; pour une question
ouverte, Correct / Incorrect apparaissent après révélation de la réponse.
L'arbitrage met à jour le même événement cloud que la révélation, en conservant
le compteur de réponses révélées. Les séries restent un décor sans bonus de points.

Devine Tête affiche la flamme après deux mots trouvés sans passer. La série est
déduite des derniers résultats de la manche : une pause/reprise la conserve,
passer ou lancer une nouvelle manche la remet à zéro.

Une victoire Mister White déclenche pendant deux secondes l'illustration fournie
détourée, avec rebond et petits éclats. Cela concerne un mot correctement deviné
ou une victoire du camp des infiltrés qui attribue des points à Mister White.
L'overlay est transparent et n'intercepte aucune commande ; il ne se répète pas
à la reprise d'un résultat. Sortir ou rejouer le nettoie immédiatement.

Les animations de transformation/opacité respectent la réduction des animations.
Les visuels, scripts et styles sont précachés par la PWA. `tests/visual_feedback_smoke.py`
vérifie les homonymes, les séries, les resets, les victoires et quatre formats d'écran.

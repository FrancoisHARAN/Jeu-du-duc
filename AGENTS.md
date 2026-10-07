# Publication des changements

Règle demandée par le propriétaire du projet : après chaque travail terminé
qui modifie le projet, vérifier les changements, créer le commit et le pousser
sur GitHub afin que GitHub Pages puisse publier la nouvelle version.

Conserver les changements existants et utiliser la branche de publication
actuelle. Ne jamais forcer un push. Si le commit, le push ou la vérification
du déploiement sont bloqués, expliquer clairement quelle étape n'a pas abouti.

# Retours à la ligne

Dans les questions, les réponses et les mots à deviner, conserver les mots
entiers. Désactiver la césure automatique et les retours au milieu d'un mot :
faire les retours à la ligne entre les mots. Si un mot exceptionnellement long
ne tient pas à l'écran, adapter son affichage sans le couper ni le tronquer.
Ne pas modifier le contenu des questions pour corriger leur mise en page.

# Textes de l'interface

Préférence du propriétaire à appliquer partout dans l'application : garder
uniquement les textes utiles pour jouer, choisir ou agir. Éviter les accroches
décoratives, les sous-titres qui répètent une information évidente et les
compteurs sans utilité dans l'écran concerné. Garder les libellés des actions,
les erreurs et les consignes indispensables. Cette règle porte sur l'interface ;
le contenu des questions et des mots à deviner est conservé.

# Stabilité des formulaires

Lors d'une saisie, d'un ajout ou retrait de joueur, d'un changement de réglage
ou d'une actualisation de comptes, conserver la position de défilement de la
page et des panneaux, le champ actif, les saisies, les choix et les sections
dépliées. Mettre à jour les éléments concernés sur place ; ne pas reconstruire
tout le formulaire ni ramener la page en haut pour une modification locale.
Un rechargement automatique conserve également la position de lecture.
Cette règle s'applique à toutes les pages actuelles et futures. Le retour en
haut reste adapté à l'ouverture volontaire d'un nouvel écran ou d'une partie.

# Architecture et maintenance

Lire `README.md`, `docs/architecture.md` et `docs/maintenance.md` avant une
modification structurelle. Le site reste statique, avec ses chemins publics et
ses formats de stockage existants. Les outils et tests sont organisés par rôle ;
les données générées, distributions tierces et archives gardent leur contenu.
Utiliser les helpers partagés existants lorsque leur comportement correspond
exactement au besoin. Ne pas fusionner des logiques de jeux seulement parce
qu'elles se ressemblent. Vérifier les contrats de compatibilité et les parcours
concernés ; documenter toute évolution intentionnelle de ces contrats.

# Comptes et statistiques de Jeu du Duc

Le site reste une PWA statique, publiée sur GitHub Pages. Supabase fournit
Auth, PostgreSQL et un bucket privé pour les avatars. Les invités continuent
à jouer sans compte. Les profils et statistiques sont visibles uniquement
aux utilisateurs connectés ; les emails restent dans Supabase Auth.

## Deux profils pour le même prénom

Chaque adresse inscrite crée un utilisateur Auth distinct. Le profil de jeu
est créé dès l'inscription ; il ne prouve pas que l'email est confirmé.
Les coches de la bande indiquent les joueurs ajoutés à la partie, pas les
sessions connectées. Une confirmation valide seulement l'UUID concerné.
Le repère « Moi » identifie la seule session connectée ; « Mon compte »
affiche son adresse email uniquement à son propriétaire.

Pour conserver un seul compte de test, ouvrir **Authentication → Users**,
vérifier les adresses et les dates de confirmation, puis supprimer uniquement
l'utilisateur en trop via **Delete user**. La suppression efface son profil,
ses résultats et les parties qu'il a organisées. Si Supabase refuse la suppression
parce que le compte possède une photo, supprimer d'abord son dossier dans le
bucket `avatars`. Ne pas supprimer seulement sa ligne dans `profiles` :
cela laisserait un utilisateur Auth sans profil. Recharger ensuite l'application ;
le profil supprimé est retiré de la liste et de la bande après lecture en ligne.

Appliquer `supabase/migrations/202610060003_confirmed_profiles.sql` dans
**SQL Editor**, après les deux migrations précédentes, pour que les inscriptions
non confirmées restent invisibles aux autres joueurs. Cette migration reprend
les états Auth actuels sans supprimer ni fusionner les comptes. La confirmation
est synchronisée par un trigger protégé ; le client ne peut pas modifier cet état.
Ce script est relançable si la colonne `is_confirmed` existe déjà : copier la
version complète actuelle, jusqu'à `commit;`, puis l'exécuter. Il complète le
trigger et le filtre sans supprimer les profils ni les résultats.

## Aucun email reçu

Le service email intégré de Supabase est réservé aux essais : il accepte
uniquement les adresses des membres de l'organisation Supabase et impose un
quota très bas. La [documentation officielle](https://supabase.com/docs/guides/auth/auth-smtp)
décrit ces restrictions. Créer un compte dans le jeu ne fait pas de son adresse
un membre de l'organisation Supabase.

Configurer **Authentication → Emails → SMTP Settings** avec un fournisseur
SMTP externe pour envoyer les confirmations aux amis. Cela n'exige pas de
passer Supabase en Pro. Les modèles du service intégré restent ceux par défaut
tant que leur personnalisation n'est pas autorisée ; la PWA accepte le lien
de confirmation. Avec un SMTP personnalisé, les modèles à code du dépôt sont
utilisables. Garder leurs identifiants SMTP uniquement dans Supabase.

L'application distingue les erreurs de destinataire non autorisé et de quota
au lieu de promettre un email envoyé. Une réponse Auth positive au renvoi
indique seulement que la demande a été acceptée, pas que le message est livré.
En cas d'absence malgré cela, consulter les journaux Auth du projet et l'état
de confirmation du compte dans **Authentication → Users**.

## Si l'email renvoie vers localhost:3000

Dans le [tableau de bord du projet](https://supabase.com/dashboard/project/jyuzvxhnolzwcviycljm/auth/url-configuration),
ouvrir **Authentication → URL Configuration**, puis enregistrer :

```text
Site URL : https://francoisharan.github.io/Jeu-du-duc/
Redirect URLs : https://francoisharan.github.io/Jeu-du-duc/
```

L'application fournit déjà cette adresse de retour dans les demandes
d'inscription, de renvoi et de récupération. Si cette adresse n'est pas
autorisée, Supabase peut revenir vers sa Site URL par défaut (`localhost:3000`).
La clé publishable du site ne permet pas de modifier ces réglages.

Le modèle d'email par défaut contient uniquement un lien. L'application accepte
ce parcours : confirmer le lien puis se connecter avec l'email et le mot de passe.
Le code est proposé dans **Mon email contient un code**, uniquement s'il figure
dans l'email. L'étape et l'adresse attendue sont conservées sur le téléphone en
cas de redémarrage ; aucun mot de passe n'est conservé par ce mécanisme.

Pour utiliser un code dans la PWA, ouvrir **Authentication → Email Templates →
Confirm signup**, coller `supabase/email-confirmation.html`, puis enregistrer.
Faire de même dans **Reset password** avec `supabase/email-recovery.html`.
Supabase ne lit pas les fichiers du dépôt : ces modèles doivent être collés
explicitement dans son tableau de bord. `{{ .Token }}` affiche le code.

Après modification, demander un **nouvel email** depuis le jeu. Un ancien lien
ne change pas après avoir corrigé les réglages et peut déjà avoir été utilisé.
Si le lien a été validé avant de tomber sur localhost, le compte peut déjà être
confirmé : essayer directement **J'ai confirmé mon email**, puis la connexion.

## Activation sur le projet Supabase

Les migrations sont préparées et vérifiées localement. Elles n'ont pas été exécutées
sur le projet distant : l'environnement ne dispose d'aucun accès SQL ou
d'administration Supabase, et le domaine du projet n'est pas autorisé par
sa politique réseau actuelle.

1. Dans **SQL Editor**, exécuter le contenu de
   `supabase/migrations/202610060001_accounts_and_statistics.sql` une fois.
   La transaction crée les profils, les résultats, les règles RLS, le calcul
   des statistiques et le bucket privé `avatars`. Elle reprend aussi les
   comptes éventuellement déjà présents. Ne pas réexécuter une migration
   déjà appliquée ; conserver son historique pour les évolutions suivantes.
   Exécuter ensuite `supabase/migrations/202610060002_football.sql` pour
   autoriser les résultats du Grand Quiz Foot. Si la première migration est
  déjà appliquée, exécuter uniquement cette deuxième migration.
   Les manches de foot de 60 secondes et la VAR réutilisent cette migration :
   une correction envoie une nouvelle révision du même résultat, sans ajouter
   de partie. Les statistiques incluent les questions répondues et correctes.
   Appliquer ensuite `supabase/migrations/202610060003_confirmed_profiles.sql`
   pour limiter l'annuaire aux profils confirmés et au compte connecté.
2. Dans **Authentication → URL Configuration**, définir le Site URL sur
   `https://francoisharan.github.io/Jeu-du-duc/` et ajouter cette même URL aux
   Redirect URLs. Pour une prévisualisation, autoriser explicitement son URL
   exacte. Aucune redirection fournie par un joueur n'est utilisée par le site.
3. Dans les réglages du fournisseur **Email**, activer la confirmation des
   emails et imposer au moins 12 caractères aux mots de passe. Activer la
   protection contre les mots de passe compromis si le forfait la propose.
   Conserver les limites de tentatives de Supabase Auth. Configurer un
   service SMTP de production : le service email intégré de développement
   peut limiter les destinataires et les envois. Le site n'envoie aucun email
   lui-même et ne stocke jamais de mot de passe.
4. Avec un **SMTP personnalisé**, dans **Authentication → Emails**, utiliser les modèles
   `supabase/email-confirmation.html` pour **Confirm signup** et
   `supabase/email-recovery.html` pour **Reset password**. Ils affichent le
   code à six chiffres `{{ .Token }}` : confirmation et récupération peuvent
   ainsi se terminer dans la PWA, même si l'email s'ouvre dans une autre app.
   Régler la durée de validité des codes à 10 minutes ; garder les limites
   de tentatives et de renvoi d'Auth. Le lien de confirmation est aussi conservé.
5. Vérifier sur deux comptes de contrôle : inscription, confirmation,
   connexion, récupération du mot de passe, photo, partie avec un ami,
   rechargement, déconnexion et résultat hors connexion puis synchronisé.
   Les codes fonctionnent dans la PWA d'origine. Un éventuel lien de
   récupération utilise PKCE et doit s'ouvrir dans le navigateur de la demande.

La clé dans `scripts/supabase-config.js` est une clé **publishable** (ou anon),
prévue pour un site public. Ne jamais y placer une clé secret, service_role,
un mot de passe de base de données ou un jeton d'administration. Une nouvelle
URL de projet nécessite aussi la mise à jour des domaines autorisés dans la
Content Security Policy d'`index.html`.

## Accès de cet environnement de développement

Ajouter uniquement `jyuzvxhnolzwcviycljm.supabase.co` aux domaines autorisés,
en conservant les autres domaines et les presets existants. La tentative
d'enregistrement du brouillon a retourné `draft_not_editable` : le brouillon
est verrouillé et sa modification n'a pas été enregistrée. Le fichier
`supabase/environment-network.json` conserve la liste proposée. Si les
paramètres ne sont plus modifiables dans cette conversation, ouvrir une
nouvelle configuration depuis les paramètres de l'environnement. Enregistrer
puis publier cette configuration avant de retester l'accès distant.

Cet accès réseau permettra de tester Auth et l'API publique ; la clé
publishable ne donne aucun droit pour créer les tables ou administrer Auth.
L'application sur les téléphones n'utilise pas le proxy de développement.

## Identités et résultats

- Un invité reçoit un UUID local. Un compte garde l'UUID Supabase. Saisir un
  prénom n'associe jamais un invité à un compte existant. Les anciennes
  listes de prénoms sont reprises comme invités, sans attribution historique
  de leurs scores à des comptes.
- Les jeux conservent une copie des identités au départ de la partie. Les
  changements de la bande ou du compte connecté ne changent pas ses joueurs.
  Les homonymes sont distingués dans les libellés des parties.
- Les comptes sont proposés six par six, avec le compte connecté en premier
  puis les profils le plus souvent ajoutés depuis ce téléphone.
- Les nouvelles parties Undercover, Géographie et Grand Quiz Foot sont comptées à leur fin.
  Devine Tête compte une manche comme une partie ; en équipes, les points et
  mots de la manche reviennent aux membres de l'équipe qui devine. Une
  correction remplace son résultat précédent.
- Grand Quiz Foot compte les parties, victoires, points, tours et bonnes
  réponses. En équipes, chaque membre reçoit les statistiques de son équipe.
  Les ex æquo avec au moins un point sont tous gagnants ; une partie sans
  point n'attribue aucune victoire. Aucun nom d'invité n'est envoyé dans le
  résultat cloud. Voir `GRAND-QUIZ-FOOT.md` pour les règles d'arbitrage.
- Questions et défis comptent une partie au lancement. Culture G. compte
  séparément les QCM/vrai-faux répondus et les réponses ouvertes dévoilées.
  Une réponse dévoilée n'est jamais supposée correcte. Le mode personnalisé
  compte sa partie dans « Personnalisé » et ses cartes dans leur catégorie.
- Un événement garde un UUID et une révision, y compris après une coupure.
  La file persistante est séparée par organisateur. Une reprise ne duplique
  pas les résultats et un autre compte connecté ne peut pas envoyer ceux
  de l'organisateur précédent. La synchronisation se fait quand l'application
  est ouverte avec du réseau ; iOS ne garantit pas une tâche en arrière-plan.
- Après une première connexion en ligne, les profils et dernières statistiques
  synchronisées restent consultables hors connexion sur ce téléphone. La
  déconnexion efface ce cache. Une photo indisponible revient à l'initiale.
- Le navigateur peut effacer son stockage : les résultats déjà synchronisés
  restent dans Supabase, les résultats encore uniquement locaux peuvent être
  perdus. Le jeu signale une sauvegarde locale indisponible ou une attente de
  synchronisation. Ne pas nettoyer le stockage avant d'avoir synchronisé.

## Droits et données

Les comptes connectés voient les prénoms, photos et statistiques de tous les
comptes, comme demandé. Un organisateur peut attribuer des résultats aux
comptes sélectionnés, sans invitation supplémentaire. Les scores reposent
donc sur la confiance entre organisateurs : cette version n'est pas un
classement compétitif protégé contre la triche. Un compte supplémentaire
créé sur le site dispose de ces mêmes droits de jeu.

Les tables de résultats ne sont pas directement modifiables depuis le client.
La fonction `record_game_event` vérifie l'identité de l'organisateur, les
comptes, les métriques et la révision dans une transaction. Les détails d'une
partie sont lisibles par son organisateur et ses participants ; les autres
comptes peuvent lire les statistiques partagées. Seul le propriétaire peut
modifier son prénom ou sa photo. Les fichiers d'avatars sont limités à 2 Mo
dans le bucket privé, avec URLs signées. Le navigateur réencode les photos
en WebP de 384 pixels, sans conserver les métadonnées de la photo originale.

La Content Security Policy refuse les scripts externes, les scripts inline
et l'évaluation de chaînes en JavaScript. Le SDK Supabase 2.117.2 et sa licence
MIT sont inclus dans `vendor/supabase/`, aussi pour le hors connexion.
Les réponses Auth et API ne sont pas mises en cache par le service worker.

La suppression d'un utilisateur dans Supabase Auth supprime son profil,
ses résultats et les parties qu'il a organisées (y compris leurs résultats)
par cascade. Les fichiers de sa photo doivent être supprimés
du bucket par l'administrateur ; une suppression de compte autonome et des
sauvegardes/restaurations de production restent à prévoir si souhaitées.
Protéger le compte administrateur Supabase avec une authentification multifacteur.

## Vérifications reproductibles

```sh
python tests/accounts_smoke.py
python tests/pwa_smoke.py
```

Le premier utilise le vrai SDK avec une API de contrôle : aucune inscription
ni aucun email ne sont envoyés au vrai service. Il vérifie les homonymes,
la connexion, les photos, les jeux, les corrections, la file hors ligne et
le changement de compte. Les contrôles de droits exécutent réellement la
migration dans PostgreSQL embarqué, avec des schémas Auth/Storage de contrôle :

```sh
npm --cache /tmp/jdd-npm-cache install --prefix /tmp/jdd-db-check --no-audit --no-fund @electric-sql/pglite@0.3.14
JDD_PGLITE_MODULE=/tmp/jdd-db-check/node_modules/@electric-sql/pglite/dist/index.js node tests/accounts_security.mjs
```

Ces contrôles locaux ne remplacent pas la vérification des réglages du projet
Supabase et des emails réels après activation, ni les essais sur iPhone/Android.

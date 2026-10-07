# Notes historiques d'import

Ces observations décrivent les environnements utilisés lors des imports des
6–7 octobre 2026, pas un état actuel des services distants.

L'accès aux images externes Culture G. sur
`quizimagescm.s3.eu-west-3.amazonaws.com` avait été refusé par le proxy de
l'environnement. Un domaine ajouté à un brouillon de configuration ne prouvait
pas son activation. Les tests utilisaient donc des images de contrôle et
n'attestaient pas la disponibilité des 290 URLs externes.

La banque Quiz360 avait été intégrée avec un cache nommé v20. Ce numéro est
historique : la version courante est définie uniquement par `CACHE_NAME` dans
`service-worker.js`. Le fonctionnement réseau prioritaire et les limites des
images externes sont documentés dans les procédures actuelles.

Les tests locaux validaient la migration des moyennes géographiques, mais
l'environnement ne permettait pas de l'appliquer au projet Supabase distant.
Le statut de production doit être vérifié dans l'historique des migrations du
projet ; un résultat de test local ne constitue pas une preuve de déploiement.

# Géographie

Le jeu est placé sous Devine Tête et utilise les mêmes prénoms que l'accueil.
Un joueur peut jouer seul ; à plusieurs, les tours alternent. L'ajout et le
retrait des prénoms sont aussi disponibles dans les préparatifs de chaque jeu.
Une partie commencée conserve sa bande, même si l'accueil est modifié ensuite.

## Parties et scores

- Environ dix manches : dix en solo, arrondies au multiple du nombre de joueurs
  supérieur ou égal à dix pour que chacun ait autant de tours (trois joueurs : douze).
- Trente secondes par tour, dès que la carte est prête. Une sélection peut être
  modifiée jusqu'à la validation. Au bout des trente secondes, le dernier choix
  est validé ; sans choix, le score est zéro.
- Chaque cible ne revient qu'une fois dans une partie.
- Ville : jusqu'à 1 000 points, selon la distance géodésique entre l'épingle et
  le centre de la ville. Maximum jusqu'à 5 km en France et 25 km dans le monde,
  puis `1000 × exp(-(distance - tolérance) / échelle)`, arrondi, avec une échelle
  de 140 km en France et 1 600 km dans le monde. La distance affichée utilise
  la formule haversine, rayon terrestre moyen 6 371,0088 km ; aucun calcul en pixels.
- Appréciations villes : parfait / super / nul / éclaté au sol. Seuils France :
  10 / 60 / 200 km ; monde : 50 / 500 / 2 000 km.
- Pays et départements : 1 000 points pour le bon polygone, zéro sinon.
- Le bilan de chaque tour affiche la sélection et la vraie réponse ; le dernier
  tour mène au classement. Rejouer et revenir au menu restent disponibles.
- Sortir de Géographie ou mettre l'application en arrière-plan met le tour en
  pause. La partie et ses scores restent enregistrés localement.

## Cartes réelles et données

Leaflet 1.9.4 est conservé dans `vendor/leaflet/` avec sa licence BSD-2-Clause.
Les cartes sont des couches GeoJSON vectorielles projetées depuis leurs
coordonnées WGS84. Les frontières répondent aux clics ; les cartes acceptent
le déplacement, les boutons de zoom et les gestes tactiles à deux doigts.
Les villes utilisent des marqueurs déplaçables et une ligne suivant le plus
court arc terrestre. Aucun fond en image, serveur de tuiles ni clé d'API.

Sources récupérées le 6 octobre 2026 :

- [Natural Earth, pays 1:50 millions](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson)
  et [villes 1:10 millions](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_populated_places_simple.geojson),
  domaine public. Propriétés conservées pour les pays : code, nom français,
  éligibilité au tirage. Les coordonnées des frontières ne sont pas modifiées.
- [France GeoJSON, départements simplifiés](https://github.com/gregoiredavid/france-geojson/blob/master/departements-version-simplifiee.geojson) :
  tracés IGN / Admin Express COG 2018 et codes INSEE, Licence ouverte Etalab.
  Les 96 départements métropolitains sont présents, dont Corse-du-Sud (2A),
  Haute-Corse (2B), Paris (75) et la petite couronne. Les coordonnées originales
  et les codes restent conservés ; la simplification de la source allège les contours.
- [Leaflet 1.9.4](https://github.com/Leaflet/Leaflet/tree/v1.9.4), distribution
  locale issue du paquet officiel sur jsDelivr.

`data/geography/` contient 242 formes pays/territoires, dont 159 pays choisis
pour les questions, 96 départements, 81 villes françaises et 140 villes du monde.
Les petits territoires restent dessinés, même lorsqu'ils sont exclus du tirage.
La sélection de villes garde les centres Natural Earth ; 23 villes françaises
connues ont des centres WGS84 explicitement ajoutés (Avignon, Saint-Malo, La Baule,
Cannes, Saint-Tropez, Carcassonne, Sarlat-la-Canéda, Colmar, Chamonix, Épinal, Pau,
Chartres, Blois, Vannes, Quimper, La Roche-sur-Yon, Albi, Cahors, Périgueux, Angoulême,
Valence, Chambéry, Évreux). Ces coordonnées sont dans `cities.json` et représentent
un centre-ville, pas les limites communales.

Les contours mondiaux sont une carte de culture générale à cette échelle,
pas une carte cadastrale ; les très petites îles peuvent demander beaucoup
de zoom. Les pays à noms contestés suivent les données de Natural Earth.

## PWA et validation

Tous les fichiers de Géographie, les données et Leaflet sont dans `SHELL_FILES`
du service worker. Une première ouverture en ligne télécharge ces ressources ;
les trois jeux peuvent ensuite fonctionner hors connexion. Le réseau reste
prioritaire lors des mises à jour, selon le mécanisme PWA existant.

`python tests/geography_smoke.py` vérifie les coordonnées cliquées, l'édition
des épingles, la distance, la révélation des polygones, les points, le chrono,
l'alternance, l'absence de doublons, la reprise, six formats d'écran, le pinch
et le déplacement tactiles dans Chromium. `python tests/pwa_smoke.py` vérifie
les données et les trois cartes en mode hors connexion sous `/Jeu-du-duc/`.
Un essai sur iPhone et Android réels complète les gestes simulés du navigateur.

# Géographie

Le jeu est placé sous Devine Tête et utilise les mêmes prénoms que l'accueil.
Un joueur peut jouer seul ; à plusieurs, les tours alternent. L'ajout et le
retrait des prénoms sont aussi disponibles dans les préparatifs de chaque jeu.
Une partie commencée conserve sa bande, même si l'accueil est modifié ensuite.
Le logo fourni (`image/home/geography.webp`) est partagé par la carte d'accueil,
le menu Géographie et la fenêtre d'ajout des joueurs. Le dessin fourni est
détouré sur fond transparent et précaché pour l'utilisation hors connexion.

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
- Pays : 1 000 points pour le bon polygone, zéro sinon.
- Départements : 1 000 points pour la bonne réponse, 250 pour un département
  limitrophe, zéro sinon. Les voisins partagent une frontière terrestre réelle ;
  être simplement proche ne suffit pas. La bonne réponse reste verte, le voisin
  choisi est jaune et une autre erreur est rose. Un voisin rapporte des points
  mais ne compte pas comme une bonne réponse ou un placement parfait dans les stats.
- Le bilan de chaque tour affiche la sélection et la vraie réponse ; le dernier
  tour mène au classement. Rejouer et revenir au menu restent disponibles.
- Sortir de Géographie ou mettre l'application en arrière-plan met le tour en
  pause. La partie et ses scores restent enregistrés localement.

## Cartes réelles et données

Leaflet 1.9.4 est conservé dans `vendor/leaflet/` avec sa licence BSD-2-Clause.
Les cartes sont des couches GeoJSON vectorielles projetées depuis leurs
coordonnées WGS84. Les frontières répondent aux clics ; les cartes acceptent
le déplacement, les boutons de zoom et les gestes tactiles à deux doigts.
À la validation d'une ville, la caméra rejoint la réponse en 450 ms, avec
apparition de l'épingle verte et tracé progressif de la distance. Le score
est calculé et enregistré immédiatement ; on peut passer au tour suivant
sans attendre. Une reprise de réponse et le réglage « réduire les animations »
affichent directement le résultat. La transition ne s'applique pas aux pays
ou aux départements.

Une ville validée à 5 km ou moins déclenche « MEGA WIN » pendant deux secondes,
en France comme dans le monde. Le visuel fourni est détouré, encodé en WebP avec
transparence et précaché pour la PWA. L'overlay reste au-dessus de la carte sans
fond ni interception des commandes ; rebond, pièces et éclats utilisent des
animations CSS de transformation/opacité. Passer au tour suivant ou quitter
nettoie immédiatement l'effet. Il ne rejoue pas lors d'une reprise et ne change
ni le barème ni les statistiques. Avec les animations réduites, seule
l'illustration apparaît, sans rebond ni particules.

Les villes utilisent des marqueurs déplaçables et une ligne suivant le plus
court arc terrestre. Aucun fond en image, serveur de tuiles ni clé d'API.

Les trois cartes affichent les grands fleuves en bleu doux. Leurs tracés et leur
style sont conservés ; les fleuves secondaires apparaissent avec le zoom.
Le relief utilise des contours d'altitude ETOPO10 (NOAA), à 400, 1 000 et
2 000 mètres, lissés et découpés au littoral. Les niveaux sont superposés dans
un beige proche du fond, à 22–24 % d'opacité par niveau. Les collines de
400 mètres apparaissent à partir du zoom 3,75 ; les détails des petits massifs
à partir du zoom 5,5. La grille d'origine a un pas de dix minutes d'arc, soit
environ 18 km à l'équateur : ces repères restent régionaux, sans précision locale.

La carte Département contient exclusivement la France métropolitaine, Corse
comprise. Les fleuves et reliefs sont découpés suivant l'union des 96 départements.
Le fond terrestre est au niveau 350, les repères physiques à 390, et les
frontières départementales, opaques, à 410. Les zones non sélectionnées gardent
un remplissage transparent ; une sélection ou réponse conserve sa couleur pleine.
Les nouvelles couches n'interceptent aucun clic ou geste. Seules les formes
de la zone visible sont montées ; la destination est préparée avant le vol
de révélation, y compris lorsque la réponse traverse l'antiméridien.

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
  La propriété `neighbors` contient les codes des départements avec lesquels
  chaque polygone partage une ligne de frontière : 238 paires, symétriques.
- [Leaflet 1.9.4](https://github.com/Leaflet/Leaflet/tree/v1.9.4), distribution
  locale issue du paquet officiel sur jsDelivr.
- [Natural Earth, fleuves 1:10 millions](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_rivers_lake_centerlines.geojson),
  domaine public. `physical.json` conserve les 1 155 tracés hydrographiques
  existants, généralisés à environ 110 m en France/alentours et 440 m ailleurs.
  Les 41 segments métropolitains sont découpés uniquement pour le mode Département.
- [ETOPO10](https://github.com/g2e/etopo10), grille de dix minutes d'arc dérivée
  d'[ETOPO1 NOAA](https://doi.org/10.7289/V5C8276M), données du domaine public.
  Source récupérée le 7 octobre 2026. Les seuils d'altitude donnent 1 441 contours
  mondiaux et 18 contours découpés en métropole. Le lissage léger et la
  interpolation et la généralisation des polygones évitent les limites en escalier
  de la grille. La licence MIT de la distribution est conservée dans
  `data/geography/etopo-license.txt`.

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

`tools/geography/prepare_physical.py` reproduit le relief et le découpage français
avec Python, NumPy, SciPy, ContourPy et Shapely, uniquement pendant la préparation.
Télécharger `etopo10_ice_g_i2.bin` et son `.hdr` depuis la source ci-dessus ; les
fleuves mondiaux approuvés sont repris sans modification du fichier existant :

```sh
python tools/geography/prepare_physical.py --elevation /chemin/etopo10_ice_g_i2.bin --header /chemin/etopo10_ice_g_i2.hdr
```

Le fichier enregistre les empreintes SHA-256 des sources. Le navigateur lit
directement les polygones préparés, sans grille raster ni calcul de contours.
Le fichier local pèse environ 4,29 Mio avant compression (environ 1,41 Mio
compressé), sans nouvelle requête ni dépendance d'exécution.

`python tools/geography/prepare_department_neighbors.py` régénère les voisins à partir des
contours locaux avec Shapely, sans déplacer les coordonnées. Cette préparation
reste hors navigateur : le jeu et la PWA lisent directement les voisins dans
le GeoJSON déjà précaché, sans requête ni dépendance supplémentaire.

`python tests/browser/geography_smoke.py` vérifie les coordonnées cliquées, l'édition
des épingles, la distance, la révélation des polygones, les points, le chrono,
l'alternance, l'absence de doublons, la reprise, six formats d'écran, le pinch
et le déplacement tactiles dans Chromium. `python tests/browser/pwa_smoke.py` vérifie
les données, les trois cartes et les points limitrophes hors connexion sous `/Jeu-du-duc/`.
Un essai sur iPhone et Android réels complète les gestes simulés du navigateur.

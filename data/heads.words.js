/* Paquets originaux pour Devine Tête, indépendants des questions et d'Undercover. */
(function (global) {
  const deck = (id, name, icon, color, words) => ({
    id, name, icon, color,
    words: words.split('|').map(word => word.trim()).filter(Boolean),
  });
  global.JDD = global.JDD || {};
  global.JDD.HEADS_DECKS = [
    deck('quotidien', 'La vie de tous les jours', '✦', '#f9d570',
      'Brosse à dents|Machine à laver|Télécommande|Réveil|Aspirateur|Parapluie|Canapé|Oreiller|Chaussette|Ascenseur|Escalator|Feu rouge|Rond-point|Caddie|Distributeur de billets|Sac à dos|Chargeur|Bougie|Sèche-cheveux|Tondeuse|Trottinette|Vélo|Scooter|Train|Avion|Valise|Passeport|Piscine|Plage|Tente|Barbecue|Hamac|Manette|Micro-ondes|Grille-pain|Tire-bouchon|Éponge|Dentifrice|Ventilateur|Radiateur|Jumelles|Boussole|Dictionnaire|Puzzle|Jeu de cartes|Appareil photo|Carte bancaire|Boîte aux lettres|Imprimante|Peignoir|Cafetière'),
    deck('animaux', 'Drôles de bêtes', '🐸', '#a7d5bc',
      'Lion|Girafe|Éléphant|Zèbre|Rhinocéros|Hippopotame|Guépard|Panthère|Tigre|Panda|Koala|Kangourou|Gorille|Chimpanzé|Orang-outan|Paresseux|Suricate|Lémurien|Loup|Renard|Ours polaire|Pingouin|Phoque|Dauphin|Baleine|Requin|Pieuvre|Méduse|Hippocampe|Crabe|Homard|Crocodile|Tortue|Serpent|Caméléon|Grenouille|Escargot|Abeille|Papillon|Moustique|Araignée|Fourmi|Coccinelle|Aigle|Hibou|Perroquet|Flamant rose|Paon|Autruche|Poule|Coq|Canard|Cygne|Cochon|Vache|Chèvre|Mouton|Cheval|Âne'),
    deck('ecran', 'Films & séries', '🎬', '#aac7e4',
      'Titanic|Harry Potter|Le Roi Lion|Shrek|Toy Story|Le Monde de Nemo|La Reine des neiges|Ratatouille|Monstres et Compagnie|Les Indestructibles|Aladdin|Mulan|Vaiana|L’Âge de glace|Kung Fu Panda|Madagascar|Retour vers le futur|Jurassic Park|Star Wars|Le Seigneur des anneaux|Pirates des Caraïbes|Indiana Jones|James Bond|Mission impossible|Spider-Man|Batman|Superman|Iron Man|Deadpool|Avatar|Matrix|Inception|Interstellar|Les Dents de la mer|E.T.|S.O.S. Fantômes|Rocky|Intouchables|Le Dîner de cons|Les Visiteurs|La Grande Vadrouille|Mission Cléopâtre|Les Ch’tis|OSS 117|Amélie Poulain|La Cité de la peur|Friends|Les Simpson|Malcolm|Kaamelott|Bref|Stranger Things|Game of Thrones|Breaking Bad|La Casa de Papel|Squid Game|Mercredi'),
    deck('celebrites', 'Têtes connues', '⭐', '#f0a6c5',
      'Kylian Mbappé|Zinédine Zidane|Lionel Messi|Cristiano Ronaldo|Serena Williams|Rafael Nadal|Roger Federer|Usain Bolt|Michael Jordan|Léon Marchand|Teddy Riner|Antoine Dupont|Simone Biles|Tony Parker|Omar Sy|Jean Dujardin|Louis de Funès|Pierre Niney|Marion Cotillard|Audrey Tautou|Alain Chabat|Jean Reno|Florence Foresti|Jamel Debbouze|Gad Elmaleh|Kev Adams|Blanche Gardin|François Damiens|Dwayne Johnson|Leonardo DiCaprio|Brad Pitt|Tom Cruise|Johnny Depp|Will Smith|Jackie Chan|Charlie Chaplin|Beyoncé|Rihanna|Lady Gaga|Taylor Swift|Adele|Michael Jackson|Madonna|Elvis Presley|Freddie Mercury|Bob Marley|Stromae|Angèle|Aya Nakamura|Céline Dion|Johnny Hallyday|Édith Piaf|Soprano|Orelsan|Jul|Mylène Farmer|David Guetta|Squeezie|Thomas Pesquet|Léna Situations'),
    deck('miam', 'À table !', '🍕', '#f49e73',
      'Pizza|Burger|Frites|Kebab|Tacos|Sushi|Ramen|Pad thaï|Couscous|Paella|Raclette|Fondue|Tartiflette|Choucroute|Cassoulet|Lasagnes|Spaghettis|Risotto|Raviolis|Croque-monsieur|Omelette|Soupe|Baguette|Croissant|Pain au chocolat|Crêpe|Gaufre|Pancake|Chouquette|Macaron|Mille-feuille|Tarte au citron|Tiramisu|Mousse au chocolat|Crème brûlée|Glace|Barbe à papa|Pop-corn|Chips|Guacamole|Houmous|Camembert|Roquefort|Mozzarella|Cornichon|Olive|Avocat|Pastèque|Ananas|Banane|Fraise|Kiwi|Noix de coco|Piment|Moutarde|Ketchup|Mayonnaise'),
    deck('actions', 'Ça se mime', '🎭', '#c9b3ef',
      'Pêcher|Maquillage|Douche|Château de sable|Peau de banane|Toile d’araignée|Câlin|Massage|Moonwalk|Tir à l’arc|Parachute|Robot|Hoquet|Éternuer|Fou rire|Bras de fer|Cinéma'),
    deck('soiree', 'Entre potes', '🥳', '#f7c3d0',
      'After|Karaoké|DJ|Dancefloor|Videur|Tournée générale|Happy hour|Cocktail|Mojito|Spritz|Décapsuleur|Baby-foot|Billard|Beer pong|Blind test|Boule à facettes|Pogo|Ola|Applaudissements|Playlist|Microphone|Selfie|WhatsApp|Taxi|Covoiturage|Brunch|Déguisement|Perruque|Confettis|Piñata|Fête surprise|Gâteau d’anniversaire|Toast|Pique-nique|Apéro|Plateau de fromage'),
  ];
})(window);

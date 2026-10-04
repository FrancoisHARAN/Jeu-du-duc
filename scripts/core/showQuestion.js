// Paquets de cartes : chaque carte sort une fois avant que le paquet ne soit remélangé.
// L'ordre restant est mémorisé pour ne pas revoir les mêmes cartes après un rechargement.
(function(){
  const STORAGE_KEY = 'jdd.decks';
  let decks = {};
  try { decks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { decks = {}; }

  function save(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)); } catch (e) { /* stockage indisponible */ }
  }

  JDD.drawCard = function(key, pool){
    if (!Array.isArray(pool) || !pool.length) return null;
    let deck = decks[key];
    if (!deck || deck.size !== pool.length || !Array.isArray(deck.order) || !deck.order.length) {
      deck = decks[key] = { size: pool.length, order: JDD.shuffle(pool.map((_, i) => i)) };
    }
    const card = pool[deck.order.pop()];
    save();
    return card;
  };
})();

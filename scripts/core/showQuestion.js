// Paquets de cartes : chaque carte sort une fois avant que le paquet ne soit remélangé.
// Les cartes déjà vues sont mémorisées par une empreinte de leur texte, pas par leur position :
// une mise à jour qui ajoute ou retire des cartes ne fait pas revoir celles déjà jouées.
(function(){
  const STORAGE_KEY = 'jdd.decks';
  let decks = {};
  try { decks = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { decks = {}; }

  function save(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decks)); } catch (e) { /* stockage indisponible */ }
  }

  // Empreinte courte et stable (FNV-1a 32 bits) : quelques caractères par carte vue.
  function cardId(card){
    const text = typeof card === 'string' ? card : `${card.question || card.text || ''}|${card.answer || ''}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  const idCache = new WeakMap();
  function idsOf(pool){
    let ids = idCache.get(pool);
    if (!ids || ids.length !== pool.length) {
      ids = pool.map(cardId);
      idCache.set(pool, ids);
    }
    return ids;
  }

  JDD.drawCard = function(key, pool){
    if (!Array.isArray(pool) || !pool.length) return null;
    const ids = idsOf(pool);
    const old = decks[key] || {};
    let seen;
    if (Array.isArray(old.seen)) {
      seen = new Set(old.seen);
    } else if (old.size === pool.length && Array.isArray(old.order)) {
      // ancien format (positions restantes) : les cartes vues sont celles qui n'y sont plus
      const left = new Set(old.order);
      seen = new Set(ids.filter((_, i) => !left.has(i)));
    } else {
      seen = new Set();
    }
    let candidates = [];
    ids.forEach((id, i) => { if (!seen.has(id)) candidates.push(i); });
    if (!candidates.length) {
      seen.clear();
      candidates = ids.map((_, i) => i);
    }
    const index = candidates[Math.floor(Math.random() * candidates.length)];
    seen.add(ids[index]);
    const present = new Set(ids);
    decks[key] = { seen: [...seen].filter((id) => present.has(id)) }; // oublie les cartes retirées
    save();
    return pool[index];
  };
})();

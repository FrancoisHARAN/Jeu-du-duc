// BEGIN safe-pick-and-show
(function(){
  const DATA = JDD.DATA;

  function pickText(pool){
    if (!Array.isArray(pool) || !pool.length) return ["VÉRITÉ", "{player}, raconte un truc marrant."];
    let picked, tries = 0;
    do {
      picked = pool[Math.floor(Math.random() * pool.length)];
      tries++;
    } while (typeof picked !== 'string' && tries < 50);
    if (typeof picked !== 'string') picked = pool.find(x => typeof x==='string') || "VÉRITÉ|{player}, raconte un truc marrant.";
    if (typeof picked === 'string') return picked.split("|");
    return ["VÉRITÉ", "{player}, raconte un truc marrant."];
  }

  JDD._pickText = pickText;
  JDD._DATA_REF = DATA;
})();
 // END safe-pick-and-show

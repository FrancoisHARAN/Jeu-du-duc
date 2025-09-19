// BEGIN safe-pick-and-show
(function(){
  const DATA = JDD.DATA;

  function pickText(pool){
    if (!Array.isArray(pool)) pool = [];
    let picked, tries = 0;
    do { picked = pool[Math.floor(Math.random()*pool.length)]; tries++; }
    while (typeof picked !== 'string' && tries < 50);
    if (typeof picked !== 'string') picked = pool.find(x => typeof x==='string') || "VÉRITÉ|{player}, raconte un truc marrant.";
    return picked.split("|");
  }

  JDD._pickText = pickText;
  JDD.pickText = pickText;
})();
// END safe-pick-and-show

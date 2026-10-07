// Rotation équitable des joueurs : chacun passe une fois par « tour de table »
// (ordre mélangé), sans tomber deux fois de suite sur la même personne.
(function () {
  let bag = [];
  let last = null;

  JDD.nextPlayer = function (players) {
    if (!Array.isArray(players) || !players.length) return null;
    bag = bag.filter((name) => players.includes(name));
    if (!bag.length) {
      bag = JDD.shuffle(players.slice());
      if (bag.length > 1 && bag[0] === last) bag.push(bag.shift());
    }
    last = bag.shift();
    return last;
  };

  JDD.pickOther = function (players, exclude) {
    const others = (players || []).filter((name) => name !== exclude);
    if (!others.length) return exclude || null;
    return others[Math.floor(Math.random() * others.length)];
  };
})();

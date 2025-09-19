// BEGIN history-50
JDD.players = JDD.players || [];
const history = [];

function histLimit() { return Math.max(0, Math.ceil(JDD.players.length * 0.5)); }
function trim() {
  for (let i = history.length - 1; i >= 0; i--) if (!JDD.players.includes(history[i])) history.splice(i, 1);
  while (history.length > histLimit()) history.shift();
}
function remember(name) { if (name) { history.push(name); trim(); } }

JDD.pickWithHistory = function(exclusions = [], { register = true } = {}) {
  if (!JDD.players.length) return null;
  trim();
  const lim = histLimit();
  const recent = lim > 0 ? history.slice(-lim) : [];
  const excl = new Set([...(Array.isArray(exclusions) ? exclusions : [exclusions]).filter(Boolean), ...recent]);
  let candidates = JDD.players.filter(n => !excl.has(n));
  if (!candidates.length) {
    const ex2 = new Set(exclusions);
    candidates = JDD.players.filter(n => !ex2.has(n));
  }
  const chosen = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  if (chosen && register) remember(chosen);
  return chosen;
};
// END history-50

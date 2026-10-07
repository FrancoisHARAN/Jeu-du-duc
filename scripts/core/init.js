// BEGIN registry
window.JDD = window.JDD || {};
JDD.DATA = JDD.DATA || { debut: [], hardcore: [], alcool: [], culture: [], cultureMcq: [] };

JDD.registerQuestions = function(mode, list){
  if (!Array.isArray(list)) return;
  if (!Array.isArray(JDD.DATA[mode])) JDD.DATA[mode] = [];
  JDD.DATA[mode].push(
    ...list.filter(item => {
      if (typeof item === 'string') return true;
      if (!item || typeof item !== 'object') return false;
      if (typeof item.question === 'string') return true;
      return typeof item.text === 'string';
    })
  );
};

JDD.registerMcq = function(list){
  if (!Array.isArray(list)) return;
  if (!Array.isArray(JDD.DATA.cultureMcq)) JDD.DATA.cultureMcq = [];
  JDD.DATA.cultureMcq.push(...list.filter(o => o && typeof o === 'object' && Array.isArray(o.choices)));
};

JDD.UNDERCOVER_PAIRS = JDD.UNDERCOVER_PAIRS || [];
JDD.registerUndercoverPairs = function(list){
  if (!Array.isArray(list)) return;
  const entries = list
    .filter(item => item && typeof item.civil === 'string' && typeof item.under === 'string')
    .map(item => ({ civil: item.civil.trim(), under: item.under.trim() }))
    .filter(item => item.civil && item.under);
  JDD.UNDERCOVER_PAIRS.push(...entries);
};
// END registry

// Mélange de Fisher-Yates (uniforme, contrairement à sort(() => Math.random() - 0.5))
JDD.shuffle = function(list){
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

// Les mises à jour d'un formulaire gardent le champ et la position de lecture.
{
  let updating = false;
  JDD.preservePosition = function(update) {
    if (updating) return update();
    const active = document.activeElement;
    const focused = active?.matches('input, textarea, select') ? active : null;
    const range = focused && typeof focused.selectionStart === 'number'
      ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    const anchor = active?.getClientRects().length ? active : null;
    const top = anchor?.getBoundingClientRect().top;
    const x = window.scrollX, y = window.scrollY;
    const scrollers = [...document.querySelectorAll('dialog[open], .home-dialog-content, #undercover, .account-profile-grid')]
      .filter(node => node.getClientRects().length)
      .map(node => ({ node, parent: node.parentElement, top: node.scrollTop, left: node.scrollLeft }));
    updating = true;
    try { return update(); }
    finally {
      const field = focused?.isConnected ? focused : focused?.id ? document.getElementById(focused.id) : null;
      if (field && field !== document.activeElement) {
        field.focus({ preventScroll: true });
        if (range) field.setSelectionRange(...range);
      }
      const restored = scrollers.map(entry => {
        const node = entry.node.isConnected ? entry.node
          : entry.node.classList.contains('account-profile-grid') ? entry.parent?.querySelector('.account-profile-grid') : null;
        if (node) { node.scrollTop = entry.top; node.scrollLeft = entry.left; }
        return node;
      });
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
      const reference = anchor?.isConnected ? anchor : field;
      if (reference?.getClientRects().length && top !== undefined) {
        const delta = reference.getBoundingClientRect().top - top;
        const parent = restored.findLast(node => node && node.contains(reference));
        if (parent) parent.scrollTop += delta;
        else window.scrollTo({ left: x, top: y + delta, behavior: 'instant' });
      }
      updating = false;
    }
  };
}

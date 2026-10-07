/* Helpers de présentation partagés ; aucune règle de jeu ni donnée persistante. */
JDD.escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

// Les mises à jour d'un formulaire gardent le champ et la position de lecture.
{
  let updating = false;
  JDD.preservePosition = function (update) {
    if (updating) return update();
    const active = document.activeElement;
    const focused = active?.matches('input, textarea, select') ? active : null;
    const range =
      focused && typeof focused.selectionStart === 'number'
        ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection]
        : null;
    const anchor = active?.getClientRects().length ? active : null;
    const top = anchor?.getBoundingClientRect().top;
    const x = window.scrollX,
      y = window.scrollY;
    const scrollers = [
      ...document.querySelectorAll(
        'dialog[open], .home-dialog-content, #undercover, .account-profile-grid'
      ),
    ]
      .filter((node) => node.getClientRects().length)
      .map((node) => ({
        node,
        parent: node.parentElement,
        top: node.scrollTop,
        left: node.scrollLeft,
      }));
    updating = true;
    try {
      return update();
    } finally {
      const field = focused?.isConnected
        ? focused
        : focused?.id
          ? document.getElementById(focused.id)
          : null;
      if (field && field !== document.activeElement) {
        field.focus({ preventScroll: true });
        if (range) field.setSelectionRange(...range);
      }
      const restored = scrollers.map((entry) => {
        const node = entry.node.isConnected
          ? entry.node
          : entry.node.classList.contains('account-profile-grid')
            ? entry.parent?.querySelector('.account-profile-grid')
            : null;
        if (node) {
          node.scrollTop = entry.top;
          node.scrollLeft = entry.left;
        }
        return node;
      });
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
      const reference = anchor?.isConnected ? anchor : field;
      if (reference?.getClientRects().length && top !== undefined) {
        const delta = reference.getBoundingClientRect().top - top;
        const parent = restored.findLast((node) => node && node.contains(reference));
        if (parent) parent.scrollTop += delta;
        else window.scrollTo({ left: x, top: y + delta, behavior: 'instant' });
      }
      updating = false;
    }
  };
}

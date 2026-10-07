/* Icônes, petites séries et célébrations sans bloquer les commandes. */
(function (global) {
  'use strict';
  const celebrations = new WeakMap();
  function arrow(direction = 'diagonal') {
    const path = direction === 'diagonal' ? 'M5 19 19 5M5 5h14v14' : 'M5 12h14m-7-7 7 7-7 7';
    return `<span class="jdd-arrow jdd-arrow--${direction}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></span>`;
  }
  function streak(count) {
    count = Math.max(0, Math.floor(Number(count) || 0));
    if (count < 2) return '';
    return `<svg class="jdd-streak-art" viewBox="0 0 88 96" aria-hidden="true"><g class="jdd-streak-fire" stroke="#252124" stroke-width="3.5" stroke-linejoin="round"><path d="M44 4c8 15 6 22 13 27l8-14c0 22 15 26 15 42 0 20-16 29-36 29S9 76 9 59c0-12 8-22 12-31l6 15C37 34 31 20 44 4Z" fill="#f49e73"/><path d="M43 29c8 13 5 19 13 27l5-9c5 12 9 18 4 27-5 10-34 12-42 0-6-10 3-18 7-24l4 8c5-7 6-17 9-29Z" fill="#ffd938"/></g><rect x="7" y="72" width="74" height="20" rx="10" fill="#f7c3d0" stroke="#252124" stroke-width="3"/><text x="44" y="68" text-anchor="middle" fill="#fff9e9" stroke="#252124" stroke-width="4" paint-order="stroke" font-family="Montserrat,Arial,sans-serif" font-size="${count > 99 ? 24 : 32}" font-weight="900">${count}</text><text x="44" y="86" text-anchor="middle" fill="#252124" font-family="Montserrat,Arial,sans-serif" font-size="11" font-weight="900">STREAK</text></svg>`;
  }
  function updateStreak(element, count) {
    if (!element) return;
    element.hidden = count < 2;
    element.setAttribute('aria-label', `${count} bonnes réponses de suite`);
    element.innerHTML = streak(count);
  }
  function clearCelebration(root) {
    const active = celebrations.get(root);
    if (!active) return;
    clearTimeout(active.timer);
    active.node.remove();
    celebrations.delete(root);
  }
  function celebrate(root, image) {
    clearCelebration(root);
    const node = document.createElement('div');
    node.className = 'jdd-celebration';
    node.setAttribute('aria-hidden', 'true');
    const art = document.createElement('img');
    art.src = image;
    art.alt = '';
    art.className = 'jdd-celebration-art';
    art.draggable = false;
    node.appendChild(art);
    for (let i = 0; i < 12; i++) {
      const particle = document.createElement('i');
      particle.className = 'jdd-celebration-spark';
      const angle = (i * Math.PI) / 6;
      particle.style.setProperty('--spark-x', `${Math.cos(angle) * 42}vmin`);
      particle.style.setProperty('--spark-y', `${Math.sin(angle) * 42}vmin`);
      particle.style.setProperty('--spark-delay', `${(i % 4) * 35}ms`);
      node.appendChild(particle);
    }
    root.appendChild(node);
    celebrations.set(root, { node, timer: setTimeout(() => clearCelebration(root), 2000) });
  }
  const icons = Object.freeze({
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  });
  global.JDDVisuals = { icons, arrow, streak, updateStreak, celebrate, clearCelebration };
})(window);

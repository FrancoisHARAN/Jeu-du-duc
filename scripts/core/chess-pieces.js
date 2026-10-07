/* Pièces Staunton originales, plates et lisibles : aucune police système requise. */
(function (global) {
  'use strict';
  const shapes = {
    p: '<circle cx="24" cy="12" r="6.3"/><path d="M19 19h10l-1 6c1 6 6 7 7 13H13c1-6 6-7 7-13Z"/>',
    r: '<path d="M12 7h6v6h4V7h4v6h4V7h6v14l-5 2 2 15H15l2-15-5-2Z"/><path d="M17 22h14" fill="none"/>',
    n: '<path d="m15 7 3 5 9-4 8 10-1 10 2 10H13l2-7 12-9-8 2-7-2-2-5 8-6-1-4Z"/><circle cx="23" cy="16" r="1.6" fill="currentColor" stroke="none"/><path d="m27 11 5 6" fill="none"/>',
    b: '<path d="M24 5c4 4 10 9 10 15 0 4-4 7-10 7s-10-3-10-7c0-6 6-11 10-15Z"/><path d="m26 11-6 7" fill="none"/><path d="m19 27-1 6-5 5h22l-5-5-1-6Z"/>',
    q: '<path d="m12 14 6 6 6-9 6 9 6-6-5 18H17Z"/><circle cx="11" cy="12" r="3"/><circle cx="24" cy="8" r="3"/><circle cx="37" cy="12" r="3"/><path d="m17 32-3 6h20l-3-6Z"/>',
    k: '<path d="M22 5h4v4h4v4h-4v5h-4v-5h-4V9h4Z"/><path d="M24 19c-10-7-15 1-11 8l5 6h12l5-6c4-7-1-15-11-8Z"/><path d="m18 33-4 5h20l-4-5Z"/>',
  };
  function piece(type, color) {
    const fill = color === 'w' ? '#fff9e9' : '#57476c', shine = color === 'w' ? '#c9b3ef' : '#9a80c5';
    return `<svg class="chess-piece chess-piece--${color}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g fill="${fill}" stroke="#252124" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" color="#252124">${shapes[type] || shapes.p}<path d="M11 38h26l2 5H9Z"/></g><path d="M13 40h21" stroke="${shine}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  global.JDDChessPieces = { piece };
})(window);

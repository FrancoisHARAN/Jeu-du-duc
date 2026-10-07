/* Règles chess.js, deux horloges locales, historique complet pour la reprise. */
(function (global) {
  'use strict';
  const rules = typeof module !== 'undefined' && module.exports ? require('../../vendor/chess/chess.js') : global.JDDChessRules;
  const { Chess, DEFAULT_POSITION } = rules;
  const MINUTES = [2, 5, 10, 20], RESULTS = ['mate', 'stalemate', 'material', 'repetition', 'fifty', 'timeout', 'resign', 'agreement'];
  const other = color => color === 'w' ? 'b' : 'w';
  function end(s, kind, winner = null) { s.result = { kind, winner }; s.running = false; }
  function boardResult(s) {
    const g = s.game;
    if (g.isCheckmate()) end(s, 'mate', other(g.turn()));
    else if (g.isStalemate()) end(s, 'stalemate');
    else if (g.isInsufficientMaterial()) end(s, 'material');
    else if (g.isThreefoldRepetition()) end(s, 'repetition');
    else if (g.isDrawByFiftyMoves()) end(s, 'fifty');
  }
  function canMate(s, color) {
    return !s.game.isInsufficientMaterial() && s.game.board().flat().some(p => p?.color === color && p.type !== 'k');
  }
  function sync(s, now = Date.now()) {
    if (!s.running || s.result || !Number.isFinite(now)) return;
    const turn = s.game.turn(), elapsed = Math.max(0, now - s.lastTick);
    s.remaining[turn] = Math.max(0, s.remaining[turn] - elapsed); s.lastTick = Math.max(s.lastTick, now);
    if (s.remaining[turn] === 0) end(s, 'timeout', canMate(s, other(turn)) ? other(turn) : null);
  }
  function create(people, minutes = 5, first = Math.random() < .5 ? 0 : 1, now = Date.now(), fen = DEFAULT_POSITION) {
    const game = new Chess(fen), duration = MINUTES.includes(minutes) ? minutes : 5;
    const s = { version: 1, players: (first === 1 ? [people[1], people[0]] : people).map(p => ({ ...p })), minutes: duration,
      initialFen: game.fen(), game, moves: [], remaining: { w: duration * 60000, b: duration * 60000 }, lastTick: now, running: true, result: null };
    boardResult(s); return s;
  }
  function move(s, from, to, promotion, now = Date.now()) {
    sync(s, now);
    if (!s.running || s.result) return null;
    let played;
    try { played = s.game.move({ from, to, ...(promotion ? { promotion } : {}) }); } catch (_) { return null; }
    s.moves.push({ from, to, ...(played.promotion ? { promotion: played.promotion } : {}) });
    s.lastTick = Math.max(s.lastTick, now); boardResult(s); return played;
  }
  function pause(s, now = Date.now()) { sync(s, now); s.running = false; }
  function resume(s, now = Date.now()) { if (!s.result) { s.lastTick = now; s.running = true; } }
  function resign(s, now = Date.now()) { sync(s, now); if (!s.result) end(s, 'resign', other(s.game.turn())); }
  function agreeDraw(s, now = Date.now()) { sync(s, now); if (!s.result) end(s, 'agreement'); }
  function snapshot(s, now = Date.now()) {
    sync(s, now);
    return { version: 1, players: s.players.map(p => ({ ...p })), minutes: s.minutes, initialFen: s.initialFen, fen: s.game.fen(),
      moves: s.moves.map(m => ({ ...m })),
      remaining: { ...s.remaining }, lastTick: s.lastTick, running: s.running, result: s.result ? { ...s.result } : null };
  }
  function restore(raw, now = Date.now()) {
    if (!raw || raw.version !== 1 || !MINUTES.includes(raw.minutes) || !Array.isArray(raw.players) || raw.players.length !== 2
      || raw.players.some(p => !p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40 || typeof p.label !== 'string' || p.label.length > 100)
      || raw.players[0].label === raw.players[1].label || typeof raw.initialFen !== 'string' || typeof raw.fen !== 'string'
      || !Array.isArray(raw.moves) || raw.moves.length > 20000 || !raw.remaining
      || ['w', 'b'].some(c => !Number.isFinite(raw.remaining[c]) || raw.remaining[c] < 0 || raw.remaining[c] > raw.minutes * 60000)
      || !Number.isFinite(raw.lastTick) || typeof raw.running !== 'boolean'
      || (raw.result !== null && (!raw.result || !RESULTS.includes(raw.result.kind) || ![null, 'w', 'b'].includes(raw.result.winner)))) return null;
    try {
      const s = create(raw.players, raw.minutes, 0, now, raw.initialFen);
      for (const m of raw.moves) {
        if (!m || !/^[a-h][1-8]$/.test(m.from) || !/^[a-h][1-8]$/.test(m.to) || (m.promotion && !/^[qrbn]$/.test(m.promotion))) return null;
        s.game.move(m);
        s.moves.push({ ...m });
      }
      if (s.game.fen() !== raw.fen) return null;
      s.remaining = { ...raw.remaining }; s.running = raw.running; s.lastTick = raw.lastTick;
      s.result = raw.result ? { ...raw.result } : null; boardResult(s); sync(s, now);
      if (s.result) s.running = false;
      return s;
    } catch (_) { return null; }
  }
  const api = { MINUTES, create, move, sync, pause, resume, resign, agreeDraw, snapshot, restore, other };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.JDDChessMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);

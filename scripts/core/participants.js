/* Les identités restent distinctes des prénoms utilisés par les jeux. */
(function (global) {
  'use strict';
  const KEY = 'jdd.participants.v1';
  function uuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((n) => n.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10).join(''),
    ].join('-');
  }
  const clean = (value) => String(value).normalize('NFC').replace(/\s+/g, ' ').trim();
  let roster = [];
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(roster));
    } catch (_) {
      /* disponible en mémoire */
    }
  }
  function restore(names) {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (_) {
      /* anciens joueurs */
    }
    if (!Array.isArray(saved)) saved = [];
    roster = names.map((label) => {
      const old = saved.find(
        (p) =>
          p &&
          p.label === label &&
          typeof p.name === 'string' &&
          ['guest', 'account'].includes(p.kind) &&
          /^[0-9a-f-]{36}$/i.test(p.id)
      );
      return old
        ? { id: old.id, kind: old.kind, name: old.name, label }
        : { id: uuid(), kind: 'guest', name: label, label };
    });
    save();
  }
  function uniqueLabel(name, kind) {
    let label = name,
      n = 1;
    while (roster.some((p) => p.label.toLocaleLowerCase('fr') === label.toLocaleLowerCase('fr'))) {
      label = `${name} (${kind === 'account' ? 'compte' : 'invité'}${n > 1 ? ` ${n}` : ''})`;
      n++;
    }
    return label;
  }
  function addGuest(name) {
    name = clean(name);
    if (!name || name.length > 40) return { error: 'Choisis un prénom de 40 caractères maximum.' };
    if (
      roster.some(
        (p) => p.kind === 'guest' && p.name.toLocaleLowerCase('fr') === name.toLocaleLowerCase('fr')
      )
    ) {
      return { error: 'Ce prénom invité est déjà dans la bande. Choisis-en un autre.' };
    }
    const p = { id: uuid(), kind: 'guest', name, label: uniqueLabel(name, 'guest') };
    roster.push(p);
    save();
    return { participant: p };
  }
  function addAccount(profile) {
    if (roster.some((p) => p.kind === 'account' && p.id === profile.id)) return null;
    const name = clean(profile.display_name);
    const p = { id: profile.id, kind: 'account', name, label: uniqueLabel(name, 'account') };
    roster.push(p);
    save();
    return p;
  }
  function remove(label) {
    roster = roster.filter((p) => p.label !== label);
    save();
  }
  function get(label) {
    const p = roster.find((p) => p.label === label);
    return p ? { ...p } : null;
  }
  function capture(names) {
    return names.map(get).filter(Boolean);
  }
  global.JDDParticipants = {
    restore,
    addGuest,
    addAccount,
    remove,
    get,
    capture,
    all: () => roster.map((p) => ({ ...p })),
    labels: () => roster.map((p) => p.label),
    uuid,
  };
})(window);

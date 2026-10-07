window.JDD = window.JDD || {};
JDD.DATA = JDD.DATA || { debut: [], hardcore: [], alcool: [], culture: [], cultureMcq: [] };

JDD.registerQuestions = function (mode, list) {
  if (!Array.isArray(list)) return;
  if (!Array.isArray(JDD.DATA[mode])) JDD.DATA[mode] = [];
  JDD.DATA[mode].push(
    ...list.filter((item) => {
      if (typeof item === 'string') return true;
      if (!item || typeof item !== 'object') return false;
      if (typeof item.question === 'string') return true;
      return typeof item.text === 'string';
    })
  );
};

JDD.registerMcq = function (list) {
  if (!Array.isArray(list)) return;
  if (!Array.isArray(JDD.DATA.cultureMcq)) JDD.DATA.cultureMcq = [];
  JDD.DATA.cultureMcq.push(
    ...list.filter((o) => o && typeof o === 'object' && Array.isArray(o.choices))
  );
};

JDD.UNDERCOVER_PAIRS = JDD.UNDERCOVER_PAIRS || [];
JDD.registerUndercoverPairs = function (list) {
  if (!Array.isArray(list)) return;
  const entries = list
    .filter((item) => item && typeof item.civil === 'string' && typeof item.under === 'string')
    .map((item) => ({ civil: item.civil.trim(), under: item.under.trim() }))
    .filter((item) => item.civil && item.under);
  JDD.UNDERCOVER_PAIRS.push(...entries);
};

// Mélange de Fisher-Yates (uniforme, contrairement à sort(() => Math.random() - 0.5))
JDD.shuffle = function (list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

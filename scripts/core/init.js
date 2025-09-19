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
// END registry

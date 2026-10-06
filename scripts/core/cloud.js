/* Supabase Auth et file persistante : un résultat conserve son ID après un réessai. */
(function (global) {
  'use strict';
  const config = global.JDD_SUPABASE_CONFIG || {};
  const client = config.url && config.publishableKey && global.supabase
    ? global.supabase.createClient(config.url, config.publishableKey, { global: { fetch: async (input, options = {}) => {
      const abort = new AbortController(), stop = () => abort.abort();
      const timer = setTimeout(stop, 12000);
      options.signal?.addEventListener('abort', stop, { once: true });
      if (options.signal?.aborted) stop();
      try { return await fetch(input, { ...options, signal: abort.signal }); }
      finally { clearTimeout(timer); options.signal?.removeEventListener('abort', stop); }
    } }, auth: {
      storageKey: 'jdd.auth.v1', persistSession: true, autoRefreshToken: true,
      detectSessionInUrl: true, flowType: 'pkce',
    } }) : null;
  const KEY = 'jdd.cloud-outbox.v1';
  let user = null, queue = [], flushing = false, retry = null, persistenceError = false;
  let state = 'idle';
  try { queue = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { queue = []; }
  if (!Array.isArray(queue)) queue = [];
  queue = queue.filter(e => e && typeof e.id === 'string' && typeof e.host === 'string' && Array.isArray(e.participants));
  function emit() { global.dispatchEvent(new CustomEvent('jdd:cloud', { detail: { state, pending: pending(), persistenceError } })); }
  function pending() { return queue.filter(e => e.host === user?.id).length; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(queue)); persistenceError = false; }
    catch (_) { persistenceError = true; }
    emit();
  }
  function begin(mode, names) {
    return { id: global.JDDParticipants.uuid(), host: user?.id || null, mode,
      occurredAt: new Date().toISOString(), participants: global.JDDParticipants.capture(names), revision: 0 };
  }
  function record(event, rows, payload = {}) {
    if (!event?.host || !event.id) return;
    const participants = rows.filter(row => row.participant?.kind === 'account')
      .map(row => ({ account_id: row.participant.id, metrics: row.metrics }));
    if (!participants.length) return;
    event.revision = (event.revision || 0) + 1;
    const next = { id: event.id, host: event.host, mode: event.mode, occurredAt: event.occurredAt,
      revision: event.revision, participants, payload };
    const index = queue.findIndex(e => e.id === next.id && e.host === next.host);
    if (index < 0) queue.push(next); else queue[index] = next;
    save(); void flush();
  }
  async function flush() {
    if (!client || flushing || !user || !navigator.onLine) { if (!navigator.onLine) { state = 'offline'; emit(); } return; }
    clearTimeout(retry); flushing = true; state = 'syncing'; emit();
    const host = user.id;
    try {
      while (user?.id === host) {
        const event = queue.find(e => e.host === host);
        if (!event) break;
        const { error } = await client.rpc('record_game_event', {
          p_host_id: event.host, p_event_id: event.id, p_mode: event.mode, p_revision: event.revision,
          p_occurred_at: event.occurredAt, p_participants: event.participants, p_payload: event.payload,
        });
        if (error) { state = 'error'; break; }
        // Une correction arrivée pendant la requête reste dans la file.
        queue = queue.filter(e => !(e.id === event.id && e.host === host && e.revision === event.revision));
        save();
      }
      if (state !== 'error') { state = 'idle'; global.dispatchEvent(new Event('jdd:statistics')); }
    } catch (_) { state = 'error'; }
    finally {
      flushing = false; emit();
      if (pending()) retry = setTimeout(flush, 30000);
    }
  }
  function setUser(next) {
    user = next; state = navigator.onLine ? 'idle' : 'offline'; emit();
    if (user) void flush(); else clearTimeout(retry);
  }
  global.addEventListener('online', flush);
  global.addEventListener('offline', () => { state = 'offline'; emit(); });
  global.addEventListener('visibilitychange', () => { if (!document.hidden) void flush(); });
  global.JDDCloud = { client, begin, record, flush, setUser, currentUser: () => user,
    status: () => ({ state, pending: pending(), persistenceError }) };
})(window);

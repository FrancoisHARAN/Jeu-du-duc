/* Compte et bande : seuls les profils de jeu sont partagés, jamais les emails. */
(function (global) {
  'use strict';
  const cloud = global.JDDCloud, client = cloud.client;
  const config = global.JDD_SUPABASE_CONFIG || {};
  let user = null, profiles = [], statistics = [], directories = [], selectedStats = '', generation = 0;
  let dialog, accountForm, formMode = 'login', loading = false, directoryError = false, statsError = false, refreshTimer;
  let confirmationEmail = '', recoveryEmail = '';
  let hasSnapshot = false, usingCached = false;
  const usageKey = 'jdd.account-frequency.v1';
  const cacheKey = 'jdd.account-cache.v1';
  let frequency = {};
  try { frequency = JSON.parse(localStorage.getItem(usageKey) || '{}') || {}; } catch (_) { /* pas de stockage */ }
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
  function safeAvatar(url) {
    try { const u = new URL(url); return u.origin === new URL(config.url).origin && u.pathname.startsWith('/storage/v1/') ? u.href : null; } catch (_) { return null; }
  }
  function avatar(profile, className = '') {
    const node = el('span', `account-avatar ${className}`, Array.from(profile?.display_name || '?')[0].toLocaleUpperCase('fr'));
    node.setAttribute('aria-hidden', 'true');
    const url = safeAvatar(profile?.avatar_url);
    if (url) {
      const image = el('img'); image.src = url; image.alt = ''; image.loading = 'lazy';
      image.addEventListener('error', () => image.remove(), { once: true }); node.append(image);
    }
    return node;
  }
  function profileFor(label) { const p = global.JDDParticipants.get(label); return p?.kind === 'account' ? profiles.find(row => row.id === p.id) : null; }
  function orderedProfiles() {
    return profiles.slice().sort((a, b) => Number(b.id === user?.id) - Number(a.id === user?.id)
      || (frequency[b.id] || 0) - (frequency[a.id] || 0) || a.display_name.localeCompare(b.display_name, 'fr'));
  }
  function mountDirectory(container, maximum = 30) {
    if (!container) return;
    const entry = { container, maximum, count: 6 };
    directories.push(entry); renderDirectory(entry);
    return { update: () => renderDirectory(entry) };
  }
  function renderDirectory(entry) {
    const { container, maximum } = entry;
    container.replaceChildren(); container.className = 'account-directory';
    if (!user) {
      const connect = el('button', 'account-text-button', 'Ajouter des comptes'); connect.type = 'button';
      connect.addEventListener('click', () => open('login')); container.append(connect); return;
    }
    container.append(el('h3', '', 'Les comptes de la bande'));
    if (directoryError || !profiles.length) {
      container.append(el('p', 'account-help', directoryError ? 'Les comptes ne sont pas disponibles.' : 'Chargement des comptes…'));
      if (directoryError) { const retry = el('button', 'account-text-button', 'Réessayer'); retry.type = 'button'; retry.addEventListener('click', refresh); container.append(retry); }
      return;
    }
    const grid = el('div', 'account-profile-grid');
    const current = global.JDDParticipants.all();
    orderedProfiles().slice(0, entry.count).forEach(profile => {
      const added = current.some(p => p.kind === 'account' && p.id === profile.id);
      const button = el('button', 'account-profile'); button.type = 'button'; button.dataset.accountId = profile.id;
      button.setAttribute('aria-pressed', String(added)); button.setAttribute('aria-label', `${added ? 'Déjà ajouté' : 'Ajouter'} : ${profile.display_name}`);
      button.append(avatar(profile), el('span', 'account-profile-name', profile.display_name));
      if (added) button.append(el('span', 'account-profile-check', '✓'));
      button.addEventListener('click', () => {
        if (added) return;
        const error = global.JDD.addAccountPlayer?.(profile, maximum);
        if (error) { const message = el('p', 'account-help', error); message.setAttribute('role', 'alert'); container.append(message); return; }
        frequency[profile.id] = Math.min(100000, (frequency[profile.id] || 0) + 1);
        try { localStorage.setItem(usageKey, JSON.stringify(frequency)); } catch (_) { /* ordre disponible en mémoire */ }
        updateDirectories();
      });
      grid.append(button);
    });
    container.append(grid);
    fitNames(container);
    if (profiles.length > entry.count) {
      const more = el('button', 'account-text-button', 'Afficher plus'); more.type = 'button';
      more.addEventListener('click', () => { entry.count += 6; renderDirectory(entry); }); container.append(more);
    }
  }
  function fitNames(container) {
    requestAnimationFrame(() => {
      container.querySelectorAll('.account-profile-name, .account-entry > span:last-child, .account-stats-player strong').forEach(node => {
        node.style.fontSize = '';
        let size = parseFloat(getComputedStyle(node).fontSize);
        while (node.scrollWidth > node.clientWidth + 1 && size > 7) { size -= .5; node.style.fontSize = `${size}px`; }
      });
    });
  }
  function updateDirectories() {
    directories = directories.filter(entry => entry.container.isConnected);
    directories.forEach(renderDirectory);
  }
  async function refresh() {
    if (!user || !client) return;
    if (!navigator.onLine) {
      directoryError = !profiles.length; statsError = !hasSnapshot; usingCached = true;
      updateDirectories(); renderStatistics(); return;
    }
    const request = ++generation, id = user.id;
    try {
      const [directory, stats] = await Promise.all([
        client.from('profiles').select('id,display_name,avatar_path,created_at').order('created_at'),
        client.from('player_statistics').select('player_id,mode,metric,total'),
      ]);
      if (request !== generation || id !== user?.id) return;
      directoryError = Boolean(directory.error) && !profiles.length;
      statsError = Boolean(stats.error) && !hasSnapshot;
      usingCached = Boolean(directory.error || stats.error);
      if (!directory.error) {
        profiles = directory.data || [];
        const paths = profiles.filter(p => p.avatar_path).map(p => p.avatar_path);
        if (paths.length) {
          const signed = await client.storage.from('avatars').createSignedUrls(paths, 3600);
          if (request !== generation || id !== user?.id) return;
          for (const row of signed.data || []) {
            const p = profiles.find(p => p.avatar_path === row.path); if (p) p.avatar_url = safeAvatar(row.signedUrl);
          }
        }
      }
      if (!stats.error) statistics = stats.data || [];
      if (!directory.error && !stats.error) {
        hasSnapshot = true; usingCached = false;
        try { localStorage.setItem(cacheKey, JSON.stringify({ owner: id, profiles, statistics })); } catch (_) { /* cache facultatif */ }
      }
    } catch (_) { if (request === generation) { directoryError = !profiles.length; statsError = !hasSnapshot; usingCached = true; } }
    if (request === generation) {
      renderAccountButton(); updateDirectories(); renderStatistics();
      global.dispatchEvent(new Event('jdd:profiles'));
    }
  }
  function renderAccountButton() {
    const button = document.getElementById('accountButton'); if (!button) return;
    const profile = profiles.find(p => p.id === user?.id);
    button.replaceChildren();
    if (user) button.append(avatar(profile || { display_name: user.user_metadata?.display_name || 'Joueur' }));
    button.append(el('span', '', user ? profile?.display_name || 'Mon compte' : 'Se connecter'));
    button.setAttribute('aria-label', user ? 'Ouvrir mon compte' : 'Se connecter');
    fitNames(button.parentElement);
  }
  const modeLabels = { undercover: 'Undercover', heads: 'Devine Tête', geography: 'Géographie', football: 'Grand Quiz Foot', culture: 'Culture G.',
    debut: 'Apéro chiantos', hardcore: 'Sexy pas raffiné', alcool: 'Torgnole express', custom: 'Personnalisé', rapidite: 'Rapidité' };
  const metricLabels = { games: 'Parties jouées', wins: 'Victoires', points: 'Points', white_games: 'Parties en Mr. White', white_wins: 'Victoires en Mr. White',
    undercover_games: 'Parties en Undercover', undercover_wins: 'Victoires en Undercover', civil_games: 'Parties en civil', civil_wins: 'Victoires en civil',
    questions_answered: 'Questions répondues', correct_answers: 'Bonnes réponses', answers_revealed: 'Réponses dévoilées', cards_seen: 'Cartes jouées',
    words_found: 'Mots trouvés', words_passed: 'Mots passés', turns: 'Tours joués', correct_places: 'Zones trouvées', distance_km: 'Kilomètres à côté', perfect_places: 'Placements parfaits' };
  function renderStatistics() {
    const root = document.getElementById('accountStatistics'); if (!root) return;
    root.replaceChildren();
    if (!user) {
      root.append(el('p', 'account-help', 'Connecte-toi pour retrouver les statistiques de la bande.'));
      const login = el('button', 'account-button', 'Se connecter'); login.type = 'button'; login.addEventListener('click', () => open('login')); root.append(login); return;
    }
    if (statsError || directoryError) {
      root.append(el('p', 'account-help', 'Les statistiques ne sont pas disponibles.'));
      const retry = el('button', 'account-text-button', 'Réessayer'); retry.type = 'button'; retry.addEventListener('click', refresh); root.append(retry); return;
    }
    if (!profiles.length) { root.append(el('p', 'account-help', 'Chargement des statistiques…')); return; }
    if (!profiles.some(p => p.id === selectedStats)) selectedStats = user.id;
    const label = el('label', 'account-stats-label', 'Les stats de qui ?'); label.htmlFor = 'statisticsPlayer';
    const select = el('select'); select.id = 'statisticsPlayer';
    orderedProfiles().forEach(p => { const option = el('option', '', p.display_name); option.value = p.id; select.append(option); });
    select.value = selectedStats; select.addEventListener('change', () => { selectedStats = select.value; renderStatistics(); });
    const profile = profiles.find(p => p.id === selectedStats);
    const heading = el('div', 'account-stats-player'); heading.append(avatar(profile), el('strong', '', profile?.display_name || 'Joueur'));
    root.append(label, select, heading);
    fitNames(root);
    if (usingCached || !navigator.onLine) root.append(el('p', 'account-help', 'Dernières statistiques synchronisées.'));
    const rows = statistics.filter(r => r.player_id === selectedStats);
    const total = rows.filter(r => r.metric === 'games').reduce((n, r) => n + Number(r.total), 0);
    root.append(el('p', 'account-stat-total', `${total.toLocaleString('fr-FR')} partie${total > 1 ? 's' : ''} jouée${total > 1 ? 's' : ''}`));
    Object.entries(modeLabels).forEach(([mode, name]) => {
      const details = el('details', `account-mode-stats account-mode-stats--${mode}`); details.append(el('summary', '', name));
      const list = el('dl', 'account-metrics');
      const relevant = mode === 'undercover' ? ['games','wins','white_wins','undercover_wins','civil_wins','points']
        : mode === 'heads' ? ['games','words_found','words_passed','points']
        : mode === 'geography' ? ['games','wins','turns','correct_places','perfect_places','points','distance_km']
        : mode === 'football' ? ['games','wins','points','turns','correct_answers']
        : mode === 'culture' ? ['games','questions_answered','correct_answers','answers_revealed'] : ['games','cards_seen'];
      relevant.forEach(metric => {
        const value = rows.find(r => r.mode === mode && r.metric === metric)?.total || 0;
        list.append(el('dt', '', metricLabels[metric]), el('dd', '', Number(value).toLocaleString('fr-FR')));
      }); details.append(list); root.append(details);
    });
  }
  function renderSync() {
    const node = document.getElementById('accountSync'); if (!node) return;
    const { state, pending, persistenceError } = cloud.status();
    node.hidden = !user || (!pending && !persistenceError); node.replaceChildren();
    if (node.hidden) return;
    node.append(el('span', '', persistenceError ? 'Le stockage du téléphone est plein. Garde le jeu ouvert pour synchroniser.'
      : state === 'offline' ? 'Résultats sur ce téléphone · synchronisation au retour du réseau.'
      : state === 'syncing' ? 'Synchronisation des résultats…' : 'Des résultats attendent la synchronisation.'));
    if (state !== 'offline' && state !== 'syncing') {
      const retry = el('button', 'account-text-button', 'Réessayer'); retry.type = 'button'; retry.addEventListener('click', cloud.flush); node.append(retry);
    }
  }
  function status(message, error = false) {
    const node = document.getElementById('accountStatus'); node.textContent = message; node.classList.toggle('account-status--error', error);
  }
  function open(mode = user ? 'profile' : ['confirm','verify-reset'].includes(formMode) ? formMode : 'login') {
    formMode = mode; loading = false;
    renderForm(); if (!dialog.open) dialog.showModal();
  }
  function renderForm() {
    const signup = formMode === 'signup', profileMode = formMode === 'profile', recovery = formMode === 'recovery', reset = formMode === 'reset';
    const verification = ['confirm', 'verify-reset'].includes(formMode);
    document.getElementById('accountDialogTitle').textContent = profileMode ? 'Mon compte' : signup ? 'Créer mon compte' : verification ? 'Code reçu par email' : recovery ? 'Nouveau mot de passe' : reset ? 'Retrouver mon compte' : 'Se connecter';
    accountForm.replaceChildren(); status('');
    const field = (id, title, type, autocomplete, value = '') => {
      const label = el('label', '', title); label.htmlFor = id; const input = el('input');
      Object.assign(input, { id, name: id, type, autocomplete, value, required: true });
      if (type === 'password') { input.maxLength = 128; if (signup || recovery) input.minLength = 12; }
      if (id === 'accountName') { input.maxLength = 40; input.autocapitalize = 'words'; }
      accountForm.append(label, input); return input;
    };
    if (profileMode) {
      const p = profiles.find(p => p.id === user?.id);
      accountForm.append(avatar(p || { display_name: user?.user_metadata?.display_name || 'Joueur' }, 'account-avatar--large'));
      field('accountName', 'Prénom', 'text', 'given-name', p?.display_name || user?.user_metadata?.display_name || 'Joueur');
      const file = el('input'); Object.assign(file, { id: 'accountPhoto', type: 'file', accept: 'image/jpeg,image/png,image/webp' });
      file.hidden = true; file.setAttribute('aria-label', 'Photo de profil');
      const choose = el('button', 'account-photo-button', 'Ajouter une photo'); choose.type = 'button'; choose.addEventListener('click', () => file.click());
      file.addEventListener('change', uploadPhoto); accountForm.append(choose, file);
      const removePhoto = el('button', 'account-text-button', 'Retirer la photo'); removePhoto.type = 'button'; removePhoto.hidden = !p?.avatar_path;
      removePhoto.addEventListener('click', removeAvatar); accountForm.append(removePhoto);
    } else if (verification) {
      const code = field('accountCode', 'Code à 6 chiffres', 'text', 'one-time-code');
      code.inputMode = 'numeric'; code.pattern = '[0-9]{6}'; code.minLength = code.maxLength = 6;
    } else {
      if (signup) field('accountName', 'Prénom', 'text', 'given-name');
      if (!recovery) field('accountEmail', 'Email', 'email', 'email');
      if (!reset) field('accountPassword', signup || recovery ? 'Mot de passe · 12 caractères minimum' : 'Mot de passe', 'password', signup || recovery ? 'new-password' : 'current-password');
    }
    const submit = el('button', 'account-button', profileMode ? 'Enregistrer' : signup ? 'Créer mon compte' : verification ? 'Confirmer le code' : recovery ? 'Enregistrer le mot de passe' : reset ? 'Recevoir le code' : 'Se connecter');
    submit.type = 'submit'; accountForm.append(submit);
    const actions = document.getElementById('accountActions'); actions.replaceChildren();
    const action = (text, fn) => { const button = el('button', 'account-text-button', text); button.type = 'button'; button.addEventListener('click', fn); actions.append(button); };
    if (profileMode) action('Se déconnecter', signOut);
    else if (verification) {
      action(formMode === 'confirm' ? 'J’ai déjà confirmé mon email' : 'Renvoyer un code', () => open(formMode === 'confirm' ? 'login' : 'reset'));
      if (formMode === 'confirm') action('Renvoyer un code', async () => {
        if (loading || !client) return; busy(true);
        try {
          const { error } = await client.auth.resend({ type: 'signup', email: confirmationEmail, options: { emailRedirectTo: redirectUrl() } });
          if (error) throw error; status('Si le compte attend une confirmation, un code vient d’être envoyé.');
        } catch (_) { status('Le code n’a pas pu être renvoyé. Réessaie dans un moment.', true); }
        finally { busy(false); }
      });
    } else if (!recovery) {
      action(signup || reset ? 'J’ai déjà un compte' : 'Créer un compte', () => open(signup || reset ? 'login' : 'signup'));
      if (!signup && !reset) action('Mot de passe oublié', () => open('reset'));
    }
  }
  function busy(value) {
    loading = value;
    dialog.querySelectorAll('button:not(.account-dialog-close), input').forEach(node => { node.disabled = value; });
    accountForm.setAttribute('aria-busy', String(value));
  }
  const redirectUrl = () => new URL('./', location.href).href;
  async function submit(event) {
    event.preventDefault(); if (loading) return;
    if (!client) { status('La connexion n’est pas disponible pour le moment.', true); return; }
    busy(true); status('');
    const value = id => document.getElementById(id)?.value || '';
    if (['signup','profile'].includes(formMode) && !value('accountName').trim()) {
      status('Entre un prénom.', true); busy(false); return;
    }
    try {
      let result;
      if (formMode === 'login') result = await client.auth.signInWithPassword({ email: value('accountEmail').trim(), password: value('accountPassword') });
      if (formMode === 'signup') result = await client.auth.signUp({ email: value('accountEmail').trim(), password: value('accountPassword'),
        options: { data: { display_name: value('accountName').trim() }, emailRedirectTo: redirectUrl() } });
      if (formMode === 'reset') result = await client.auth.resetPasswordForEmail(value('accountEmail').trim(), { redirectTo: redirectUrl() });
      if (formMode === 'confirm') result = await client.auth.verifyOtp({ email: confirmationEmail, token: value('accountCode').trim(), type: 'signup' });
      if (formMode === 'verify-reset') result = await client.auth.verifyOtp({ email: recoveryEmail, token: value('accountCode').trim(), type: 'recovery' });
      if (formMode === 'recovery') result = await client.auth.updateUser({ password: value('accountPassword') });
      if (formMode === 'profile') result = await client.from('profiles').update({ display_name: value('accountName').trim() }).eq('id', user.id);
      if (result?.error) throw result.error;
      if (formMode === 'signup' && !result.data.session) {
        confirmationEmail = value('accountEmail').trim(); formMode = 'confirm'; renderForm(); status('Entre le code reçu par email, ou confirme avec le lien.');
      } else if (formMode === 'reset') {
        recoveryEmail = value('accountEmail').trim(); formMode = 'verify-reset'; renderForm(); status('Si un compte correspond à cet email, un code vient d’être envoyé.');
      } else if (formMode === 'verify-reset') { formMode = 'recovery'; renderForm(); }
      else if (formMode === 'profile') { await refresh(); status('Prénom enregistré.'); }
      else { if (formMode === 'recovery') formMode = 'profile'; dialog.close(); }
    } catch (error) {
      status(error.status === 429 ? 'Trop de tentatives. Réessaie dans un moment.'
        : ['confirm','verify-reset'].includes(formMode) && [400,401,403].includes(error.status) ? 'Code invalide ou expiré. Demande un nouveau code.'
        : formMode === 'login' && [400,401].includes(error.status) ? 'Vérifie ton email, ton mot de passe et la confirmation du compte.'
        : 'Impossible de terminer. Vérifie ta connexion puis réessaie.', true);
    } finally { busy(false); const password = document.getElementById('accountPassword'); if (password) password.value = ''; }
  }
  async function signOut() {
    busy(true);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw error;
      applySession(null); global.JDD.clearAccountPlayers?.(); dialog.close();
    } catch (_) { status('La déconnexion n’a pas abouti. Réessaie.', true); }
    finally { busy(false); }
  }
  async function uploadPhoto(event) {
    const file = event.target.files[0]; if (!file || loading) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10485760) {
      status('Choisis une photo JPG, PNG ou WebP de moins de 10 Mo.', true); return;
    }
    busy(true); let objectUrl;
    try {
      const image = new Image(); objectUrl = URL.createObjectURL(file); image.src = objectUrl; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      canvas.getContext('2d').drawImage(image, (image.naturalWidth-size)/2, (image.naturalHeight-size)/2, size, size, 0,0,384,384);
      const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .85));
      if (!photo || photo.type !== 'image/webp') throw new Error('photo');
      const id = user.id, path = `${id}/${global.JDDParticipants.uuid()}.webp`, old = profiles.find(p => p.id === id)?.avatar_path;
      const uploaded = await client.storage.from('avatars').upload(path, photo, { contentType: 'image/webp', upsert: false });
      if (uploaded.error) throw uploaded.error;
      const updated = await client.from('profiles').update({ avatar_path: path }).eq('id', id);
      if (updated.error) { await client.storage.from('avatars').remove([path]); throw updated.error; }
      if (old) await client.storage.from('avatars').remove([old]);
      await refresh(); renderForm(); status('Photo enregistrée.');
    } catch (_) { status('La photo n’a pas pu être enregistrée. Réessaie.', true); }
    finally { if (objectUrl) URL.revokeObjectURL(objectUrl); busy(false); }
  }
  async function removeAvatar() {
    if (loading) return; busy(true);
    try {
      const old = profiles.find(p => p.id === user.id)?.avatar_path;
      const { error } = await client.from('profiles').update({ avatar_path: null }).eq('id', user.id); if (error) throw error;
      if (old) await client.storage.from('avatars').remove([old]);
      await refresh(); renderForm(); status('Photo retirée.');
    } catch (_) { status('Impossible de retirer la photo. Réessaie.', true); }
    finally { busy(false); }
  }
  function applySession(session, recovery = false) {
    const previous = user?.id; user = session?.user || null;
    if (previous !== user?.id) {
      ++generation; profiles = []; statistics = []; selectedStats = ''; directoryError = statsError = false;
      hasSnapshot = usingCached = false;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (user && cached?.owner === user.id && Array.isArray(cached.profiles) && Array.isArray(cached.statistics)) {
          profiles = cached.profiles; statistics = cached.statistics;
          hasSnapshot = usingCached = true;
        } else localStorage.removeItem(cacheKey);
      } catch (_) { /* pas de cache */ }
      if (previous && !user) global.JDD.clearAccountPlayers?.();
    }
    cloud.setUser(user); renderAccountButton(); updateDirectories(); renderStatistics(); renderSync();
    if (user) void refresh();
    if (recovery) open('recovery');
  }
  function init() {
    dialog = document.getElementById('accountDialog'); accountForm = document.getElementById('accountForm');
    document.getElementById('accountButton').addEventListener('click', () => open());
    document.getElementById('closeAccountDialog').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { const password = document.getElementById('accountPassword'); if (password) password.value = ''; });
    accountForm.addEventListener('submit', submit);
    mountDirectory(document.getElementById('accountPlayers')); mountDirectory(document.getElementById('dialogAccountPlayers'));
    renderAccountButton(); renderStatistics();
    if (client) {
      client.auth.onAuthStateChange((event, session) => { setTimeout(() => applySession(session, event === 'PASSWORD_RECOVERY'), 0); });
    }
  }
  global.addEventListener('jdd:players', updateDirectories);
  global.addEventListener('jdd:cloud', renderSync);
  global.addEventListener('jdd:statistics', () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 600); });
  global.addEventListener('online', refresh);
  global.addEventListener('offline', () => { if (user) void refresh(); });
  global.addEventListener('resize', () => { fitNames(document.getElementById('setup')); });
  global.addEventListener('visibilitychange', () => { if (!document.hidden && user) void refresh(); });
  global.JDDAccounts = { mountDirectory, avatar, profileFor, updateDirectories, refresh, open, getUser: () => user };
  document.addEventListener('DOMContentLoaded', init, { once: true });
})(window);

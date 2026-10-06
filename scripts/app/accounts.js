/* Compte et bande : seuls les profils de jeu sont partagés, jamais les emails. */
(function (global) {
  'use strict';
  const cloud = global.JDDCloud, client = cloud.client;
  const config = global.JDD_SUPABASE_CONFIG || {};
  let user = null, profiles = [], statistics = [], directories = [], generation = 0, exploitFilter = 'all', exploitLimit = 6;
  let dialog, accountForm, formMode = 'login', loading = false, directoryError = false, statsError = false, refreshTimer;
  let confirmationEmail = '', recoveryEmail = '';
  // Brouillons non secrets, conservés seulement tant que cette page reste ouverte.
  let emailDraft = null, nameDraft = '';
  const readOnlyStates = new WeakMap();
  const pendingKey = 'jdd.auth-pending.v1';
  try {
    const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    if (pending && ['confirm','verify-reset'].includes(pending.mode) && typeof pending.email === 'string'
      && pending.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pending.email)) {
      formMode = pending.mode;
      if (pending.mode === 'confirm') confirmationEmail = pending.email;
      else recoveryEmail = pending.email;
    }
  } catch (_) { /* stockage facultatif */ }
  function rememberPending(mode, email) {
    try { localStorage.setItem(pendingKey, JSON.stringify({mode, email})); } catch (_) { /* facultatif */ }
  }
  function clearPending() {
    try { localStorage.removeItem(pendingKey); } catch (_) { /* facultatif */ }
  }
  let hasSnapshot = false, usingCached = false, directoryLoaded = false, directoryCached = false, refreshWork = null;
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
      container.append(el('p', 'account-help', 'Connecte-toi sur cet appareil pour retrouver les comptes de la bande.'));
      const connect = el('button', 'account-text-button', 'Ajouter des comptes'); connect.type = 'button';
      connect.addEventListener('click', () => open('login')); container.append(connect); return;
    }
    const heading = el('div', 'account-directory-heading');
    const retry = el('button', 'account-text-button', directoryError ? 'Réessayer' : 'Actualiser'); retry.type = 'button';
    retry.addEventListener('click', refresh); heading.append(el('h3', '', 'Les comptes de la bande'), retry); container.append(heading);
    if (directoryError) container.append(el('p', 'account-help', navigator.onLine ? 'Impossible de charger les comptes. Vérifie ta connexion et réessaie.' : 'Connecte cet appareil à Internet pour charger les comptes.'));
    else if (directoryCached || !navigator.onLine) container.append(el('p', 'account-help', 'Derniers comptes synchronisés sur cet appareil.'));
    if (!profiles.length) {
      if (!directoryError) container.append(el('p', 'account-help', directoryLoaded ? 'Aucun compte confirmé disponible.' : 'Chargement des comptes…'));
      return;
    }
    const grid = el('div', 'account-profile-grid');
    const current = global.JDDParticipants.all();
    orderedProfiles().slice(0, entry.count).forEach(profile => {
      const added = current.some(p => p.kind === 'account' && p.id === profile.id);
      const button = el('button', 'account-profile'); button.type = 'button'; button.dataset.accountId = profile.id;
      button.setAttribute('aria-pressed', String(added)); button.setAttribute('aria-label', `${added ? 'Déjà ajouté' : 'Ajouter'} : ${profile.display_name}`);
      const text = el('span', 'account-profile-text');
      text.append(el('span', 'account-profile-name', profile.display_name)); button.append(avatar(profile), text);
      if (profile.id === user.id) {
        text.append(el('span', 'account-profile-self', 'Moi'));
        button.setAttribute('aria-label', `${added ? 'Déjà ajouté' : 'Ajouter'} : ${profile.display_name}, mon compte connecté`);
      }
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
      container.querySelectorAll('.account-profile-name, .account-entry > span:last-child').forEach(node => {
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
  function saveSnapshot() {
    if (!user || !directoryLoaded) return;
    try { localStorage.setItem(cacheKey, JSON.stringify({ owner: user.id, profiles, statistics, hasSnapshot })); } catch (_) { /* cache facultatif */ }
  }
  function publishProfiles() {
    renderAccountButton(); updateDirectories(); renderStatistics();
    global.dispatchEvent(new Event('jdd:profiles'));
  }
  async function refresh() {
    if (!user || !client) return;
    if (!navigator.onLine) {
      directoryError = !directoryLoaded; statsError = !hasSnapshot; usingCached = directoryCached = true;
      updateDirectories(); renderStatistics(); return;
    }
    if (refreshWork?.id === user.id) { refreshWork.again = true; return refreshWork.promise; }
    const request = ++generation, id = user.id;
    const current = () => request === generation && id === user?.id;
    const work = { id, again: false };
    refreshWork = work;
    work.promise = Promise.all([
      (async () => {
        try {
          const directory = await client.from('profiles').select('id,display_name,avatar_path,created_at').order('created_at');
          if (!current()) return;
          directoryError = Boolean(directory.error); directoryCached = directoryError;
          if (directory.error) { publishProfiles(); return; }
          profiles = directory.data || []; directoryLoaded = true;
          global.JDD.retainAccountPlayers?.(profiles.map(p => p.id));
          saveSnapshot(); publishProfiles(); // Les comptes sont utilisables avant les photos et les statistiques.
          const paths = profiles.filter(p => p.avatar_path).map(p => p.avatar_path);
          if (paths.length) {
            const signed = await client.storage.from('avatars').createSignedUrls(paths, 3600);
            if (!current()) return;
            for (const row of signed.data || []) {
              const p = profiles.find(p => p.avatar_path === row.path); if (p) p.avatar_url = safeAvatar(row.signedUrl);
            }
            saveSnapshot(); publishProfiles();
          }
        } catch (_) { if (current()) { directoryError = directoryCached = true; publishProfiles(); } }
      })(),
      (async () => {
        try {
          const stats = await client.from('player_statistics').select('player_id,mode,metric,total');
          if (!current()) return;
          statsError = Boolean(stats.error) && !hasSnapshot; usingCached = Boolean(stats.error);
          if (!stats.error) { statistics = stats.data || []; hasSnapshot = true; }
          saveSnapshot(); renderStatistics();
        } catch (_) { if (current()) { statsError = !hasSnapshot; usingCached = true; renderStatistics(); } }
      })(),
    ]).finally(() => {
      if (refreshWork === work) refreshWork = null;
      if (current() && work.again) { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 600); }
    });
    return work.promise;
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
  function appendStatisticsState(root) {
    if (statsError) {
      root.append(el('p', 'account-help', 'Les statistiques ne sont pas disponibles.'));
      const retry = el('button', 'account-text-button', 'Réessayer'); retry.type = 'button';
      retry.addEventListener('click', refresh); root.append(retry);
    } else root.append(el('p', 'account-help', 'Chargement des statistiques…'));
  }
  function renderStatistics() {
    const model = global.JDDStatistics.model(profiles, statistics);
    renderPersonalStatistics(model); renderExploits(model);
  }
  function renderPersonalStatistics(model) {
    const root = document.getElementById('profileStatistics'); if (!root) return;
    const opened = new Set([...root.querySelectorAll('details[open]')].map(node => node.dataset.mode));
    root.replaceChildren(); root.hidden = !user || formMode !== 'profile';
    if (root.hidden) return;
    root.append(el('h3', '', 'Mes statistiques'));
    if (!hasSnapshot) { appendStatisticsState(root); return; }
    if (usingCached || !navigator.onLine) root.append(el('p', 'account-help', 'Dernières statistiques synchronisées.'));
    const data = model.personal(user.id);
    if (!data.modes.length) { root.append(el('p', 'account-help', 'Aucune partie enregistrée.')); return; }
    if (data.games > 0) root.append(el('p', 'account-stat-total', global.JDDStatistics.plural(data.games, 'partie jouée')));
    data.modes.forEach(({mode,title,rows}) => {
      const details = el('details', `account-mode-stats account-mode-stats--${mode}`);
      details.dataset.mode = mode; details.open = opened.has(mode); details.append(el('summary', '', title));
      const list = el('dl', 'account-metrics');
      rows.forEach(row => {
        const value = el('dd', '', row.value);
        if (row.detail) value.append(el('small', 'account-metric-detail', row.detail));
        list.append(el('dt', '', row.label), value);
      }); details.append(list); root.append(details);
    });
  }
  function renderExploits(model) {
    const root = document.getElementById('accountStatistics'); if (!root) return;
    const section = root.closest('.home-statistics');
    const focusedFilter = document.activeElement?.dataset.exploitFilter;
    const openedRules = new Set([...root.querySelectorAll('.account-exploit-rule[open]')].map(node => node.dataset.exploit));
    root.replaceChildren(); section.hidden = !user || !hasSnapshot || !model.cards.length;
    if (section.hidden) return;
    if (usingCached || statsError || !navigator.onLine) root.append(el('p', 'account-help', 'Derniers exploits synchronisés.'));
    const filters = el('div', 'account-exploit-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', 'Filtrer les exploits par jeu');
    const available = new Set(model.cards.map(card => card.mode));
    if (!available.has(exploitFilter)) exploitFilter = 'all';
    const choices = [['all','Tous'], ...Object.entries(global.JDDStatistics.modes).filter(([mode]) => available.has(mode))];
    choices.forEach(([mode,name]) => {
      const button = el('button', 'account-exploit-filter', name); button.type = 'button'; button.dataset.exploitFilter = mode;
      button.setAttribute('aria-pressed', String(mode === exploitFilter));
      button.addEventListener('click', () => { exploitFilter = mode; exploitLimit = 6; renderExploits(model); });
      filters.append(button);
    }); root.append(filters);
    const cards = model.cards.filter(card => exploitFilter === 'all' || card.mode === exploitFilter);
    const grid = el('div', 'account-exploit-grid');
    cards.slice(0,exploitLimit).forEach(card => {
      const panel = el('section', `account-exploit account-exploit--${card.mode}`); panel.dataset.exploit = card.id;
      const title = el('h3', '', card.title); title.id = `exploit-${card.id}`; panel.setAttribute('aria-labelledby', title.id); panel.append(title);
      const list = el('ol', 'account-podium'); list.setAttribute('aria-label', `Top 3 · ${card.title}`);
      card.rows.forEach(row => {
        const item = el('li', 'account-podium-row'); item.dataset.accountId = row.profile.id;
        item.dataset.rank = row.rank;
        const rank = el('span', 'account-podium-rank', String(row.rank)); rank.setAttribute('aria-label', `Place ${row.rank}${row.tied ? ', ex æquo' : ''}`);
        const text = el('span', 'account-podium-player'); text.append(el('strong', 'account-profile-name', row.profile.display_name));
        text.append(el('small', '', `${row.detail}${row.tied ? ' · ex æquo' : ''}`));
        item.append(rank, avatar(row.profile), text, el('b', 'account-podium-value', row.value)); list.append(item);
      }); panel.append(list);
      if (card.rule) {
        const rule = el('details', 'account-exploit-rule'); rule.dataset.exploit = card.id; rule.open = openedRules.has(card.id);
        rule.append(el('summary', '', 'Calcul du classement'), el('p', '', card.rule)); panel.append(rule);
      }
      grid.append(panel);
    }); root.append(grid); fitNames(root);
    if (cards.length > exploitLimit) {
      const more = el('button', 'account-text-button', 'Afficher plus'); more.type = 'button';
      more.addEventListener('click', () => { exploitLimit += 6; renderExploits(model); }); root.append(more);
    }
    if (focusedFilter) [...filters.children].find(node => node.dataset.exploitFilter === focusedFilter)?.focus({preventScroll:true});
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
  function authError(error, fallback) {
    const messages = {
      email_address_not_authorized: 'L’envoi vers cette adresse est bloqué par le service email du site. L’administrateur doit configurer les envois.',
      over_email_send_rate_limit: 'Le quota d’emails du site est atteint. Attends son renouvellement avant de demander un nouvel email.',
      over_request_rate_limit: 'Trop de tentatives. Réessaie dans un moment.',
      email_provider_disabled: 'La connexion par email est désactivée sur le site. L’administrateur doit l’activer.',
      email_address_invalid: 'Vérifie que ton adresse email est correcte.',
      email_not_confirmed: 'Ton email n’est pas encore confirmé. Ouvre le lien de confirmation ou demande un nouvel email.',
    };
    // Traduire seulement les erreurs connues : ne pas afficher les messages bruts du serveur.
    return Object.hasOwn(messages,error?.code) ? messages[error.code]
      : error?.status === 429 ? messages.over_request_rate_limit : fallback;
  }
  function rememberDraft() {
    const email = document.getElementById('accountEmail');
    if (email && !email.readOnly) emailDraft = email.value.trim();
    if (formMode === 'signup') nameDraft = document.getElementById('accountName')?.value || '';
  }
  function open(mode = user ? 'profile' : ['confirm','verify-reset'].includes(formMode) ? formMode : 'login') {
    if (loading) return;
    rememberDraft();
    formMode = mode; loading = false;
    renderForm(); if (!dialog.open) dialog.showModal();
  }
  function renderForm() {
    const signup = formMode === 'signup', profileMode = formMode === 'profile', recovery = formMode === 'recovery', reset = formMode === 'reset';
    const verification = ['confirm', 'verify-reset'].includes(formMode);
    document.getElementById('accountDialogTitle').textContent = profileMode ? 'Mon compte' : signup ? 'Créer mon compte' : verification ? 'Confirmer mon email' : recovery ? 'Nouveau mot de passe' : reset ? 'Retrouver mon compte' : 'Se connecter';
    accountForm.replaceChildren(); status('');
    renderStatistics();
    accountForm.name = `account-${formMode}`;
    accountForm.method = 'post'; accountForm.autocomplete = 'on';
    const formUrl = new URL(redirectUrl()); formUrl.searchParams.set('account', formMode);
    accountForm.action = formUrl.href;
    let submitContainer = accountForm;
    const field = (id, title, type, autocomplete, value = '', container = accountForm) => {
      const label = el('label', '', title); label.htmlFor = id; const input = el('input');
      const name = {accountEmail:'username',accountPassword:'password',accountName:'given-name',accountCode:'one-time-code'}[id];
      Object.assign(input, { id, name, type, autocomplete, value, required: true });
      input.spellcheck = false;
      if (id === 'accountEmail') { input.maxLength = 254; input.inputMode = 'email'; input.autocapitalize = 'none'; input.enterKeyHint = reset ? 'send' : 'next'; }
      if (id === 'accountName') { input.maxLength = 40; input.autocapitalize = 'words'; input.enterKeyHint = 'done'; }
      container.append(label);
      if (type === 'password') {
        input.maxLength = 128; input.autocapitalize = 'none'; input.enterKeyHint = signup ? 'next' : 'go';
        if (signup || recovery) { input.minLength = 12; input.setAttribute('passwordrules', 'minlength: 12; maxlength: 128;'); }
        const box = el('div', 'account-password-field'), toggle = el('button', 'account-password-toggle', 'Voir');
        toggle.type = 'button'; toggle.setAttribute('aria-controls', id); toggle.setAttribute('aria-pressed', 'false');
        toggle.setAttribute('aria-label', 'Afficher le mot de passe');
        toggle.addEventListener('click', () => {
          const show = input.type === 'password'; input.type = show ? 'text' : 'password';
          toggle.textContent = show ? 'Masquer' : 'Voir'; toggle.setAttribute('aria-pressed', String(show));
          toggle.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
        });
        box.append(input, toggle); container.append(box);
      } else container.append(input);
      return input;
    };
    if (profileMode) {
      const p = profiles.find(p => p.id === user?.id);
      accountForm.append(avatar(p || { display_name: user?.user_metadata?.display_name || 'Joueur' }, 'account-avatar--large'));
      accountForm.append(el('p', 'account-help account-current-email', `Connecté avec ${user.email || 'ton compte'}`));
      field('accountName', 'Prénom', 'text', 'given-name', p?.display_name || user?.user_metadata?.display_name || 'Joueur');
      const file = el('input'); Object.assign(file, { id: 'accountPhoto', type: 'file', accept: 'image/jpeg,image/png,image/webp' });
      file.hidden = true; file.setAttribute('aria-label', 'Photo de profil');
      const choose = el('button', 'account-photo-button', 'Ajouter une photo'); choose.type = 'button'; choose.addEventListener('click', () => file.click());
      file.addEventListener('change', uploadPhoto); accountForm.append(choose, file);
      const removePhoto = el('button', 'account-text-button', 'Retirer la photo'); removePhoto.type = 'button'; removePhoto.hidden = !p?.avatar_path;
      removePhoto.addEventListener('click', removeAvatar); accountForm.append(removePhoto);
    } else if (verification) {
      accountForm.append(el('p', 'account-help', formMode === 'confirm'
        ? 'Ouvre l’email de confirmation, appuie sur son lien puis reviens te connecter.'
        : 'Ouvre le lien reçu par email pour choisir un nouveau mot de passe.'));
      accountForm.append(el('p', 'account-help account-pending-email', formMode === 'confirm' ? confirmationEmail : recoveryEmail));
      if (formMode === 'confirm') {
        const confirmed = el('button', 'account-button', 'Se connecter'); confirmed.type = 'button';
        confirmed.addEventListener('click', () => open('login')); accountForm.append(confirmed);
      }
      const details = el('details', 'account-code-details');
      details.append(el('summary', '', 'Mon email contient un code'));
      const fields = el('div', 'account-code-fields'); details.append(fields); accountForm.append(details);
      const code = field('accountCode', 'Code à 6 chiffres', 'text', 'one-time-code', '', fields);
      code.inputMode = 'numeric'; code.pattern = '[0-9]{6}'; code.minLength = code.maxLength = 6;
      submitContainer = fields;
    } else {
      const email = field('accountEmail', 'Email', 'email', 'username', recovery ? user?.email || recoveryEmail : emailDraft ?? (confirmationEmail || recoveryEmail));
      if (recovery) email.readOnly = true;
      if (!reset) field('accountPassword', signup || recovery ? 'Mot de passe · 12 caractères minimum' : 'Mot de passe', 'password', signup || recovery ? 'new-password' : 'current-password');
      if (signup) field('accountName', 'Prénom', 'text', 'given-name', nameDraft);
    }
    const submit = el('button', 'account-button', profileMode ? 'Enregistrer' : signup ? 'Créer mon compte' : verification ? 'Confirmer le code' : recovery ? 'Enregistrer le mot de passe' : reset ? 'Recevoir l’email' : 'Se connecter');
    submit.type = 'submit'; submitContainer.append(submit);
    const actions = document.getElementById('accountActions'); actions.replaceChildren();
    const action = (text, fn) => { const button = el('button', 'account-text-button', text); button.type = 'button'; button.addEventListener('click', fn); actions.append(button); };
    if (profileMode) action('Se déconnecter', signOut);
    else if (verification) {
      action('Changer d’adresse email', () => open(formMode === 'confirm' ? 'signup' : 'reset'));
      if (formMode === 'verify-reset') {
        action('Renvoyer l’email', () => open('reset'));
        action('Retour à la connexion', () => open('login'));
      }
      if (formMode === 'confirm') action('Renvoyer l’email', async () => {
        if (loading || !client) return; busy(true);
        try {
          const { error } = await client.auth.resend({ type: 'signup', email: confirmationEmail, options: { emailRedirectTo: redirectUrl() } });
          if (error) throw error; status('Si le compte attend une confirmation, la demande d’envoi a été acceptée. Vérifie aussi les spams. Si ton compte est déjà confirmé, connecte-toi.');
        } catch (error) { status(authError(error, 'L’email n’a pas pu être renvoyé. Réessaie dans un moment.'), true); }
        finally { busy(false); }
      });
    } else if (!recovery) {
      action(signup || reset ? 'J’ai déjà un compte' : 'Créer un compte', () => open(signup || reset ? 'login' : 'signup'));
      if (!signup && !reset) action('Mot de passe oublié', () => open('reset'));
    }
  }
  function busy(value) {
    loading = value;
    // Laisser les identifiants lisibles par le gestionnaire lors de l’envoi AJAX.
    dialog.querySelectorAll('button:not(.account-dialog-close), input[type="file"]').forEach(node => { node.disabled = value; });
    accountForm.querySelectorAll('input:not([type="file"])').forEach(input => {
      if (value) {
        if (!readOnlyStates.has(input)) readOnlyStates.set(input, input.readOnly);
        input.readOnly = true;
      } else if (readOnlyStates.has(input)) {
        input.readOnly = readOnlyStates.get(input); readOnlyStates.delete(input);
      }
    });
    accountForm.setAttribute('aria-busy', String(value));
  }
  // Utiliser le dossier public de la PWA, sans paramètres ni fragments de connexion.
  const redirectUrl = () => new URL('./', document.querySelector('link[rel="manifest"]').href).href;
  async function submit(event) {
    event.preventDefault(); if (loading) return;
    if (!client) { status('La connexion n’est pas disponible pour le moment.', true); return; }
    const values = Object.fromEntries(['accountEmail','accountPassword','accountName','accountCode'].map(id => [id, document.getElementById(id)?.value || '']));
    const value = id => values[id] || '';
    rememberDraft();
    busy(true); status('');
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
        confirmationEmail = value('accountEmail').trim(); formMode = 'confirm'; rememberPending(formMode, confirmationEmail); renderForm();
      } else if (formMode === 'reset') {
        recoveryEmail = value('accountEmail').trim(); formMode = 'verify-reset'; rememberPending(formMode, recoveryEmail); renderForm(); status('La demande a été acceptée. Si un compte correspond à cet email, vérifie ta boîte mail et les spams.');
      } else if (formMode === 'verify-reset') { formMode = 'recovery'; renderForm(); }
      else if (formMode === 'profile') { await refresh(); status('Prénom enregistré.'); }
      else { clearPending(); formMode = user ? 'profile' : 'login'; dialog.close(); }
    } catch (error) {
      if (formMode === 'login' && error.code === 'email_not_confirmed') {
        confirmationEmail = value('accountEmail').trim(); formMode = 'confirm'; rememberPending(formMode, confirmationEmail); renderForm();
      }
      status(authError(error,
        ['confirm','verify-reset'].includes(formMode) && [400,401,403].includes(error.status) ? 'Code invalide ou expiré. Demande un nouvel email.'
        : formMode === 'login' && [400,401].includes(error.status) ? 'Vérifie ton email, ton mot de passe et la confirmation du compte.'
        : 'Impossible de terminer. Vérifie ta connexion puis réessaie.'), true);
    } finally { busy(false); }
  }
  async function signOut() {
    busy(true);
    try {
      const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw error;
      applySession(null); formMode = 'login'; clearPending(); global.JDD.clearAccountPlayers?.(); dialog.close();
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
      ++generation; profiles = []; statistics = []; exploitFilter = 'all'; exploitLimit = 6; directoryError = statsError = false;
      hasSnapshot = usingCached = directoryLoaded = directoryCached = false;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (user && cached?.owner === user.id && Array.isArray(cached.profiles) && Array.isArray(cached.statistics)) {
          profiles = cached.profiles; statistics = cached.statistics;
          hasSnapshot = cached.hasSnapshot !== false; usingCached = directoryLoaded = directoryCached = true;
        } else localStorage.removeItem(cacheKey);
      } catch (_) { /* pas de cache */ }
      if (previous && !user) global.JDD.clearAccountPlayers?.();
    }
    cloud.setUser(user); renderAccountButton(); updateDirectories(); renderStatistics(); renderSync();
    if (user) clearPending();
    if (user) void refresh();
    if (recovery) open('recovery');
  }
  function init() {
    dialog = document.getElementById('accountDialog'); accountForm = document.getElementById('accountForm');
    document.getElementById('accountButton').addEventListener('click', () => open());
    document.getElementById('closeAccountDialog').addEventListener('click', () => dialog.close());
    // Retirer le formulaire fermé : aucun mot de passe conservé dans un champ caché.
    dialog.addEventListener('close', () => { if (!dialog.open) { rememberDraft(); accountForm.replaceChildren(); } });
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
  global.addEventListener('pageshow', () => { if (user) void refresh(); });
  global.JDDAccounts = { mountDirectory, avatar, profileFor, updateDirectories, refresh, open, getUser: () => user };
  document.addEventListener('DOMContentLoaded', init, { once: true });
})(window);

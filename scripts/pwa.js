(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const workerURL = new URL('../service-worker.js', document.currentScript.src);
  const appURL = new URL('./', workerURL);
  const positionKey = `jdd.pwa.position:${appURL.pathname}`;
  const startedControlled = Boolean(navigator.serviceWorker.controller);
  let registration;
  let reloadPending = false;
  let reloadStarted = false;

  // Pas de rechargement pendant une saisie (fenêtre des joueurs ouverte, champ actif).
  function busy() {
    const active = document.activeElement;
    return Boolean(document.querySelector('dialog[open]'))
      || Boolean(active && active.matches && active.matches('input, textarea, select'));
  }

  // Une mise à jour ne coupe jamais une partie en cours.
  function reloadOnHome() {
    const home = document.getElementById('setup');
    if (!reloadStarted && reloadPending && document.visibilityState === 'visible' && home && !home.classList.contains('hidden') && !busy()) {
      // Le transfert de contrôle peut être signalé de nouveau pendant la
      // navigation : ne jamais annuler le rechargement déjà en cours.
      reloadStarted = true;
      reloadPending = false;
      try { sessionStorage.setItem(positionKey, JSON.stringify({ x: window.scrollX, y: window.scrollY })); } catch (_) {}
      // L'ancienne page reste affichée jusqu'à l'arrivée de la nouvelle (jusqu'à 4 s) :
      // plus rien ne doit y être lancé, la partie serait coupée par le rechargement.
      document.body.inert = true;
      document.body.style.pointerEvents = 'none';
      window.location.reload();
    }
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (startedControlled && !reloadStarted) {
      reloadPending = true;
      reloadOnHome();
    }
  });

  const home = document.getElementById('setup');
  if (home) {
    new MutationObserver(reloadOnHome).observe(home, { attributes: true, attributeFilter: ['class'] });
  }
  // La saisie terminée, la mise à jour en attente peut s'appliquer (le délai laisse « Lancer la partie » masquer l'accueil).
  const playersDialog = document.getElementById('playersDialog');
  if (playersDialog) playersDialog.addEventListener('close', () => setTimeout(reloadOnHome, 0));
  document.getElementById('accountDialog')?.addEventListener('close', () => setTimeout(reloadOnHome, 0));
  document.addEventListener('focusout', () => setTimeout(reloadOnHome, 0));

  function checkWorker() {
    if (registration && navigator.onLine) {
      registration.update().catch(() => {
        // Une connexion coupée conserve la version disponible hors ligne.
      });
    }
  }

  window.addEventListener('load', async () => {
    try {
      const position = JSON.parse(sessionStorage.getItem(positionKey));
      sessionStorage.removeItem(positionKey);
      if (position && Number.isFinite(position.x) && Number.isFinite(position.y) && position.x >= 0 && position.y >= 0) {
        requestAnimationFrame(() => window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' }));
      }
    } catch (_) { /* La mise à jour reste disponible sans stockage de session. */ }
    try {
      registration = await navigator.serviceWorker.register(workerURL.href, {
        scope: appURL.pathname,
        updateViaCache: 'none',
      });
      checkWorker();
    } catch (error) {
      console.warn('Le mode hors connexion est indisponible.', error);
    }
  }, { once: true });

  window.addEventListener('online', checkWorker);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      reloadOnHome();
      checkWorker();
    }
  });
}());

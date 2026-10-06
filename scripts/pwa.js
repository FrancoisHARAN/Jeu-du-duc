(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const workerURL = new URL('../service-worker.js', document.currentScript.src);
  const appURL = new URL('./', workerURL);
  const startedControlled = Boolean(navigator.serviceWorker.controller);
  let registration;
  let reloadPending = false;
  let reloadStarted = false;

  // Une mise à jour ne coupe jamais une partie en cours.
  function reloadOnHome() {
    const home = document.getElementById('setup');
    if (!reloadStarted && reloadPending && document.visibilityState === 'visible' && home && !home.classList.contains('hidden')) {
      // Le transfert de contrôle peut être signalé de nouveau pendant la
      // navigation : ne jamais annuler le rechargement déjà en cours.
      reloadStarted = true;
      reloadPending = false;
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

  function checkWorker() {
    if (registration && navigator.onLine) {
      registration.update().catch(() => {
        // Une connexion coupée conserve la version disponible hors ligne.
      });
    }
  }

  window.addEventListener('load', async () => {
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

/* Réglage commun à tous les sons, actuels et futurs.
 * Lecteur audio/vidéo : JDDSound.play(element).
 * Web Audio : getContext() (null si muet), destination() puis track(source).
 * Ne pas créer de contexte ni appeler play() directement dans un jeu.
 */
(function (global) {
  'use strict';
  const KEY = 'jdd.sound.enabled.v1';
  let enabled = true,
    audio = null,
    output = null,
    suspending = null;
  const sources = new Set(),
    media = new Set(),
    originalMute = new WeakMap();
  try {
    enabled = localStorage.getItem(KEY) !== 'false';
  } catch (_) {
    /* Choix en mémoire. */
  }

  function silenceMedia(item) {
    item.muted = true;
    // Ne pas démarrer un lecteur audio silencieux qui pourrait couper la musique.
    if (item.tagName === 'AUDIO') item.pause();
  }
  function registerMedia(item) {
    if (media.has(item)) return;
    media.add(item);
    originalMute.set(item, item.muted);
    item.addEventListener('play', () => {
      if (!enabled) silenceMedia(item);
    });
    item.addEventListener('volumechange', () => {
      if (enabled) originalMute.set(item, item.muted);
      else if (!item.muted) silenceMedia(item);
    });
    if (!enabled) silenceMedia(item);
  }
  function scan(node) {
    if (node instanceof global.HTMLMediaElement) registerMedia(node);
    node.querySelectorAll?.('audio,video').forEach(registerMedia);
  }
  function renderButton() {
    const button = document.getElementById('soundToggle');
    if (!button) return;
    const label = enabled ? 'Couper le son du jeu' : 'Activer le son du jeu';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.setAttribute('aria-pressed', String(enabled));
    button.dataset.muted = String(!enabled);
    button.querySelector('[data-sound-icon="on"]').toggleAttribute('hidden', !enabled);
    button.querySelector('[data-sound-icon="off"]').toggleAttribute('hidden', enabled);
  }
  function setEnabled(next, persist = true) {
    next = Boolean(next);
    if (next !== enabled) {
      if (!next) media.forEach((item) => originalMute.set(item, item.muted));
      enabled = next;
      if (output) output.gain.value = enabled ? 1 : 0;
      if (!enabled) {
        sources.forEach((source) => {
          try {
            source.stop();
          } catch (_) {
            /* Déjà terminé. */
          }
        });
        sources.clear();
        if (audio && audio.state !== 'closed') {
          const pending = audio.suspend().catch(() => {});
          suspending = pending;
          pending.then(() => {
            if (suspending === pending) suspending = null;
          });
        }
      }
      media.forEach((item) => {
        if (enabled) item.muted = originalMute.get(item);
        else silenceMedia(item);
      });
      global.dispatchEvent(new CustomEvent('jdd:sound', { detail: { enabled } }));
    }
    if (persist) {
      try {
        localStorage.setItem(KEY, String(enabled));
      } catch (_) {
        /* Choix en mémoire. */
      }
    }
    renderButton();
  }
  function getContext() {
    // En mode muet, aucune création ni reprise de session audio sur le téléphone.
    if (!enabled) return null;
    try {
      const Audio = global.AudioContext || global.webkitAudioContext;
      if ((!audio || audio.state === 'closed') && Audio) {
        audio = new Audio();
        output = audio.createGain();
        output.gain.value = 1;
        output.connect(audio.destination);
      }
      if (audio && (suspending || ['suspended', 'interrupted'].includes(audio.state)))
        audio.resume().catch(() => {});
      return audio;
    } catch (_) {
      return null;
    }
  }
  function track(source) {
    sources.add(source);
    source.addEventListener('ended', () => sources.delete(source), { once: true });
  }
  function play(item) {
    registerMedia(item);
    if (!enabled) {
      silenceMedia(item);
      return;
    }
    try {
      item.play()?.catch(() => {});
    } catch (_) {
      /* Le jeu continue sans son. */
    }
  }
  global.JDDSound = {
    isEnabled: () => enabled,
    setEnabled,
    getContext,
    destination: () => output,
    track,
    play,
  };
  global.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) {
      try {
        setEnabled(localStorage.getItem(KEY) !== 'false', false);
      } catch (_) {
        /* Choix en mémoire. */
      }
    }
  });
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      scan(document);
      new MutationObserver((records) =>
        records.forEach((record) => record.addedNodes.forEach(scan))
      ).observe(document.body, { childList: true, subtree: true });
      document.getElementById('soundToggle')?.addEventListener('click', () => setEnabled(!enabled));
      renderButton();
    },
    { once: true }
  );
})(window);

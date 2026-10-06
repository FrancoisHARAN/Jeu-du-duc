/* Retours sonores communs à Devine Tête et Grand Quiz Foot, disponibles hors ligne. */
(function (global) {
  'use strict';
  function build(audio) {
    // Sons originaux, calculés une fois par contexte : aucun téléchargement.
    const rate = audio.sampleRate;
    const makeBuffer = (duration, sample) => {
      const buffer = audio.createBuffer(1, Math.ceil(rate * duration), rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = sample(i / rate);
      return buffer;
    };
    const bell = (t, frequency, decay) => {
      if (t < 0) return 0;
      const phase = 2 * Math.PI * frequency * t;
      const attack = Math.min(1, t / .004);
      return attack * (Math.sin(phase) * Math.exp(-t / decay)
        + .2 * Math.sin(phase * 2) * Math.exp(-t / .055)
        + .08 * Math.sin(phase * 3.86) * Math.exp(-t / .035));
    };
    // Clochette de Devine Tête : deux notes montantes.
    const correct = makeBuffer(.55, t => Math.min(1, (.55 - t) / .04)
      * (.16 * bell(t, 1318.51, .105) + .2 * bell(t - .065, 1975.53, .15)));

    // Souffle de Devine Tête : bruit filtré et petit mouvement tonal.
    let seed = 173, lower = 0, upper = 0;
    const pass = makeBuffer(.28, t => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 2147483648 - 1;
      const progress = t / .28;
      lower += (1 - Math.exp(-2 * Math.PI * (500 + 2200 * progress) / rate)) * (noise - lower);
      upper += (1 - Math.exp(-2 * Math.PI * (2800 + 4200 * progress) / rate)) * (noise - upper);
      const envelope = Math.pow(Math.sin(Math.PI * progress), 1.4);
      const glide = Math.sin(2 * Math.PI * (480 * t + 2200 * t * t));
      return envelope * (.45 * (upper - lower) + .035 * glide);
    });

    // Buzzer grave descendant, avec harmoniques audibles sur un téléphone.
    const wrong = makeBuffer(.38, t => {
      const phase = 2 * Math.PI * (150 * t - 50 * t * t);
      const buzz = Math.sin(phase) + .35 * Math.sin(3 * phase) + .18 * Math.sin(5 * phase);
      const envelope = Math.min(1, t / .01, (.38 - t) / .04);
      const tremolo = .8 + .2 * Math.cos(2 * Math.PI * 30 * t);
      return envelope * tremolo * (.18 * buzz + .065 * Math.sin(2 * Math.PI * 110 * t));
    });
    return { correct, pass, wrong };
  }
  global.JDDFeedbackSounds = { build };
})(window);

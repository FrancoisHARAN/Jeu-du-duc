/* Cartes WGS84 vectorielles : Leaflet local, Natural Earth et IGN/Admin Express. */
(function (global) {
  'use strict';
  const STORE_KEY = 'jdd.geography.v1';
  const TURN_MS = 30000;
  const NEIGHBOR_POINTS = 250;
  const REVEAL_SECONDS = .45;
  const CELEBRATION_MS = 2000;
  const MODES = { cities: 'Où est la ville ?', countries: 'Trouve le pays', departments: 'Trouve le département' };
  const HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/></svg>';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root, options, data, loading, map, regions, physicalLayers, guessMarker, clock, editor, celebrationTimer;
  let match = null, phase = 'menu', opened = false, chosenMode = 'cities', zone = 'france', request = 0;
  const names = () => options.getSuggestedNames().slice();
  const target = () => match.targets[match.index];
  const player = () => match.players[match.index % match.players.length];
  const isCity = () => match.mode === 'cities';

  async function loadData() {
    if (data) return data;
    if (!loading) loading = Promise.all(['countries.geojson', 'departments.geojson', 'cities.json', 'physical.json'].map(async file => {
      const response = await fetch(`data/geography/${file}`);
      if (!response.ok) throw new Error('Carte indisponible');
      return response.json();
    })).then(([countries, departments, cities, physical]) => {
      data = { countries, departments, cities, physical }; return data;
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(match)); } catch (_) { /* facultatif */ }
  }
  function disposeMap() {
    clearCelebration();
    if (map) map.remove();
    map = regions = physicalLayers = guessMarker = null;
    clearInterval(clock); clock = null;
  }
  function setPhase(next) { phase = next; root.dataset.screen = next; }
  function topbar(label = 'Géographie') {
    return `<header class="geo-topbar"><button class="geo-pill" data-geo="exit" type="button" aria-label="Revenir au menu principal">${HOME} Menu</button><span class="geo-pill geo-pill--green">${escape(label)}</span></header>`;
  }
  function windowBar(label) {
    return `<div class="geo-window"><span class="geo-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${escape(label)}</span><span aria-hidden="true">✦</span></div>`;
  }
  function renderMenu() {
    disposeMap(); setPhase('menu');
    root.innerHTML = `${topbar()}<section class="geo-panel">${windowBar('GÉOGRAPHIE')}<div class="geo-intro"><img src="image/home/geography.svg" width="400" height="400" alt=""><h1>Géographie</h1></div><div class="geo-menu">${Object.entries(MODES).map(([mode, label], i) => `<button type="button" class="geo-mode" data-geo-mode="${mode}"><span class="geo-mode-number">0${i + 1}</span><strong>${escape(label)}</strong><span aria-hidden="true">↗</span></button>`).join('')}${match && !match.finished ? '<button type="button" class="geo-button geo-button--green" data-geo="resume">Reprendre la partie</button>' : ''}</div><div class="geo-floor" aria-hidden="true"></div></section>`;
    global.scrollTo(0, 0);
  }
  function roundCount(people) { return people.length ? Math.ceil(10 / people.length) * people.length : 10; }
  function renderSetup(mode) {
    disposeMap(); chosenMode = mode; setPhase('setup');
    root.innerHTML = `${topbar(MODES[mode])}<section class="geo-panel">${windowBar(MODES[mode])}<div class="geo-settings"><h1>${escape(MODES[mode])}</h1>${mode === 'cities' ? `<fieldset class="geo-zones"><legend>Les villes</legend><label><input type="radio" name="geo-zone" value="france" ${zone === 'france' ? 'checked' : ''}>France</label><label><input type="radio" name="geo-zone" value="world" ${zone === 'world' ? 'checked' : ''}>Monde</label></fieldset>` : ''}${mode === 'departments' ? `<p class="geo-help">Bonne réponse : 1 000 pts · Limitrophe : ${NEIGHBOR_POINTS} pts</p>` : ''}<fieldset class="geo-player-picker"><legend>Qui joue ?</legend><div id="geo-players"></div></fieldset><p id="geo-format" class="geo-help"></p><button type="button" class="geo-button" data-geo="start">Lancer la partie ↗</button><p id="geo-error" role="alert" hidden></p><button type="button" class="geo-link" data-geo="menu">Retour à Géographie</button></div><div class="geo-floor" aria-hidden="true"></div></section>`;
    editor = global.JDDPlayerEditor.mount(root.querySelector('#geo-players'), {
      getNames: names, addPlayer: options.addPlayer, removePlayer: options.removePlayer,
    });
    onPlayersChanged(); global.scrollTo(0, 0);
  }
  function onPlayersChanged() {
    if (!opened || phase !== 'setup') return;
    editor.update();
    root.querySelector('[data-geo="start"]').disabled = !names().length;
    root.querySelector('#geo-format').textContent = `${roundCount(names())} manches · 30 secondes par tour`;
  }
  async function start() {
    if (!names().length || phase !== 'setup') return;
    const id = ++request;
    const button = root.querySelector('[data-geo="start"]');
    button.disabled = true; button.textContent = 'Chargement de la carte…';
    try {
      await loadData();
      if (id !== request || !opened || phase !== 'setup') return;
      const people = names();
      if (!people.length) { onPlayersChanged(); return; }
      const pool = chosenMode === 'cities' ? data.cities[zone]
        : (chosenMode === 'countries' ? data.countries : data.departments).features
          .filter(f => chosenMode !== 'countries' || f.properties.quiz)
          .map(f => ({ id: f.properties.code, name: f.properties.name || f.properties.nom }));
      match = { mode: chosenMode, zone, players: people, scores: people.map(() => 0),
        cloud: global.JDDCloud.begin('geography', people),
        targets: global.JDD.shuffle(pool.slice()).slice(0, roundCount(people)), index: 0,
        guess: null, result: null, rows: [], remaining: TURN_MS, deadline: 0, finished: false };
      beginTurn();
    } catch (_) {
      if (id !== request || phase !== 'setup') return;
      const error = root.querySelector('#geo-error');
      error.textContent = 'La carte n’a pas pu être chargée. Reconnecte-toi puis réessaie.'; error.hidden = false;
      button.disabled = false; button.textContent = 'Réessayer';
    }
  }
  function baseStyle() { return { color: '#574f83', weight: 1, fillColor: '#fff9e9', fillOpacity: 1 }; }
  function answerStyle(feature) {
    const code = feature.properties.code;
    if (match.result && code === target().id) return { ...baseStyle(), fillColor: '#8bd5ae', color: '#18714a', weight: 3 };
    if (match.guess === code) return { ...baseStyle(), fillColor: match.result && !match.result.neighbor ? '#f1a4b6' : '#ffd938', color: '#252124', weight: 3 };
    return baseStyle();
  }
  function icon(kind) {
    return global.L.divIcon({ className: `geo-pin geo-pin--${kind}`, html: `<span><b>${kind === 'truth' ? '✓' : '●'}</b></span>`, iconSize: [32, 40], iconAnchor: [16, 39] });
  }
  function placePin(point) {
    if (phase !== 'playing' || !isCity()) return;
    match.guess = { lat: Math.max(-85, Math.min(85, point.lat)), lng: ((point.lng + 180) % 360 + 360) % 360 - 180 };
    if (guessMarker) guessMarker.setLatLng(match.guess);
    else {
      guessMarker = global.L.marker(match.guess, { draggable: true, bubblingMouseEvents: true, icon: icon('guess'), title: 'Ton épingle' }).addTo(map);
      guessMarker.on('dragend', () => placePin(guessMarker.getLatLng()));
    }
    root.querySelector('[data-geo="validate"]').disabled = false;
    root.querySelector('#geo-selection').textContent = 'Épingle placée. Tu peux la déplacer.';
    save();
  }
  function makeMap() {
    const L = global.L;
    map = L.map(root.querySelector('#geo-map'), { zoomControl: false, attributionControl: false, minZoom: 0, maxZoom: 12,
      zoomSnap: .25, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, touchZoom: true, scrollWheelZoom: true, doubleClickZoom: false,
      maxBounds: [[-86, -180], [86, 180]], maxBoundsViscosity: 1 });
    if (isCity()) map.getContainer().classList.add('geo-map--cities');
    map.createPane('geoLand').style.zIndex = '350';
    L.control.zoom({ position: 'topright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(map);
    const countries = match.mode !== 'departments';
    regions = L.geoJSON(countries ? data.countries : data.departments, {
      pane: 'geoLand',
      noClip: isCity(), // Garder les contours complets pendant le déplacement/zoom des villes.
      style: f => isCity() ? baseStyle() : answerStyle(f),
      onEachFeature(feature, layer) {
        if (isCity()) return;
        // Aucun nom avant la validation : les frontières restent seules visibles.
        layer.on('click', event => {
          L.DomEvent.stopPropagation(event);
          if (phase !== 'playing') return;
          match.guess = feature.properties.code;
          regions.setStyle(answerStyle);
          layer.bringToFront();
          root.querySelector('#geo-selection').textContent = 'Zone sélectionnée. Tu peux changer ton choix.';
          root.querySelector('[data-geo="validate"]').disabled = false;
          save();
        });
        layer.on('add', () => {
          const path = layer.getElement();
          if (!path) return;
          path.setAttribute('data-geo-code', feature.properties.code);
        });
      },
    }).addTo(map);
    if (isCity()) map.on('click', event => placePin(event.latlng));
    if (isCity() && match.guess) placePin(match.guess);
    homeMap();
    makePhysicalLayers();
    const reset = L.control({ position: 'topright' });
    reset.onAdd = () => {
      const button = L.DomUtil.create('button', 'geo-map-reset');
      button.type = 'button'; button.textContent = '⌖'; button.title = 'Recentrer la carte'; button.setAttribute('aria-label', 'Recentrer la carte');
      L.DomEvent.disableClickPropagation(button); L.DomEvent.disableScrollPropagation(button);
      L.DomEvent.on(button, 'click', homeMap); return button;
    };
    reset.addTo(map);
    requestAnimationFrame(() => { if (map) map.invalidateSize(); });
  }
  function shiftedFeature(feature, offset) {
    if (!offset) return feature;
    const shift = coordinates => typeof coordinates[0] === 'number'
      ? [coordinates[0] + offset, ...coordinates.slice(1)] : coordinates.map(shift);
    return { ...feature, geometry: { ...feature.geometry, coordinates: shift(feature.geometry.coordinates) } };
  }
  function makePhysicalLayers() {
    const L = global.L, pane = map.createPane('geoPhysical');
    pane.style.zIndex = '390'; pane.style.pointerEvents = 'none';
    const common = { pane: 'geoPhysical', interactive: false, noClip: isCity() };
    const relief = L.geoJSON(null, { ...common, style: { stroke: false, fillColor: '#d8c7a7', fillOpacity: .58, className: 'geo-relief-shape' } }).addTo(map);
    const riverStyle = feature => ({ color: '#75a8bf', opacity: .95, weight: Math.min(2.8, 1.05 + map.getZoom() * .14) + (feature.properties.rank <= 2 ? .25 : 0), lineCap: 'round', lineJoin: 'round', className: 'geo-river-line' });
    const rivers = L.geoJSON(null, { ...common, style: riverStyle, onEachFeature(feature, layer) {
      layer.on('add', () => layer.getElement()?.setAttribute('data-geo-river', feature.properties.name));
    } }).addTo(map);
    const offsets = new Set([0]), signatures = new Map();
    const refresh = (views = [{ bounds: map.getBounds().pad(.25), zoom: map.getZoom() }]) => {
      for (const [key, layer] of [['relief', relief], ['rivers', rivers]]) {
        const features = [], ids = [];
        data.physical[key].features.forEach((feature, index) => {
          for (const offset of offsets) {
            const [west, south, east, north] = feature.bbox;
            if (!views.some(view => (key !== 'rivers' || view.zoom >= feature.properties.min_zoom)
              && west + offset <= view.bounds.getEast() && east + offset >= view.bounds.getWest()
              && south <= view.bounds.getNorth() && north >= view.bounds.getSouth())) continue;
            features.push(shiftedFeature(feature, offset)); ids.push(`${index}:${offset}`);
          }
        });
        const signature = ids.join('|');
        if (signatures.get(key) !== signature) {
          layer.clearLayers(); layer.addData({ type: 'FeatureCollection', features }); signatures.set(key, signature);
        }
      }
      rivers.setStyle(riverStyle);
    };
    physicalLayers = {
      refresh,
      addWorldCopy(offset) { offsets.add(offset); },
      prepare(bounds, maxZoom) {
        const zoom = Math.min(maxZoom, map.getBoundsZoom(bounds, false, L.point(90, 90)));
        const center = L.bounds(map.project(bounds.getSouthWest(), zoom), map.project(bounds.getNorthEast(), zoom)).getCenter();
        const half = map.getSize().divideBy(2);
        const destination = L.latLngBounds(map.unproject(center.subtract(half), zoom), map.unproject(center.add(half), zoom)).pad(.25);
        // Préparer aussi la destination : aucun relief/fleuve ne surgit à la fin du vol.
        refresh([{ bounds: map.getBounds().pad(.25), zoom: map.getZoom() }, { bounds: destination, zoom }]);
      },
    };
    map.on('moveend', () => physicalLayers.refresh());
    refresh();
  }
  function homeMap() {
    if (!map) return;
    const france = match.mode === 'departments' || (isCity() && match.zone === 'france');
    map.fitBounds(france ? [[41.2, -5.3], [51.2, 9.7]] : [[-57, -178], [78, 178]], { padding: [18, 18], animate: false });
  }
  function beginTurn(resuming = false) {
    if (!resuming) { match.guess = null; match.result = null; match.remaining = TURN_MS; }
    renderTurn();
    match.deadline = Date.now() + match.remaining;
    save();
    clock = setInterval(tick, 100);
  }
  function renderTurn() {
    disposeMap(); setPhase(match.result ? 'answer' : 'playing');
    const current = player(), index = match.index % match.players.length;
    const prompt = isCity() ? `Où est ${target().name} ?` : `Trouve : ${target().name}${match.mode === 'departments' ? ` (${target().id})` : ''}`;
    root.innerHTML = `${topbar()}<section class="geo-panel geo-turn">${windowBar(MODES[match.mode])}<div class="geo-stats"><strong id="geo-current-player">${escape(current)}</strong><span>Manche ${match.index + 1} / ${match.targets.length}</span><span id="geo-score">${match.scores[index]} pts</span><strong id="geo-timer" aria-label="Temps restant">${Math.ceil(match.remaining / 1000)} s</strong></div><h1 class="geo-prompt">${escape(prompt)}</h1><div class="geo-map-stage"><div id="geo-map" class="geo-map" role="region" aria-label="Carte interactive, déplacement et zoom à deux doigts"></div>${isCity() ? '<div id="geo-mega-win" class="geo-mega-win" hidden aria-hidden="true"><img class="geo-mega-win-art" src="image/geography/mega-win.webp" width="768" height="768" alt="" decoding="async" draggable="false"></div>' : ''}</div><div class="geo-answer"><p id="geo-selection" class="geo-help" role="status">${isCity() ? 'Touche la carte pour placer ton épingle.' : 'Touche une zone sur la carte.'}</p><div id="geo-result" role="status"></div><button type="button" class="geo-button" data-geo="validate" ${match.guess ? '' : 'disabled'}>Valider</button></div><details class="geo-map-sources"><summary>Données cartographiques</summary><p>Frontières, fleuves et grands reliefs : Natural Earth (domaine public). Départements : IGN / Admin Express via France GeoJSON (Licence ouverte). Carte : Leaflet.</p></details><div class="geo-floor" aria-hidden="true"></div></section>`;
    makeMap();
    if (match.result) reveal();
    global.scrollTo(0, 0);
  }
  function tick() {
    if (!opened || phase !== 'playing') return;
    match.remaining = Math.max(0, match.deadline - Date.now());
    const timer = root.querySelector('#geo-timer');
    timer.textContent = `${Math.ceil(match.remaining / 1000)} s`;
    timer.classList.toggle('geo-time-low', match.remaining <= 5000);
    if (!match.remaining) validate(true);
  }
  function distance(a, b) {
    // Distance géodésique sur sphère moyenne terrestre, formule haversine.
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
  }
  function validate(timedOut = false) {
    if (phase !== 'playing') return;
    match.remaining = Math.max(0, match.deadline - Date.now());
    if (!timedOut && !match.remaining) timedOut = true;
    if (!match.guess && !timedOut) return;
    // Si le chrono finit pendant un déplacement, retenir la position visible.
    if (isCity() && guessMarker) {
      const point = guessMarker.getLatLng();
      match.guess = { lat: Math.max(-85, Math.min(85, point.lat)), lng: ((point.lng + 180) % 360 + 360) % 360 - 180 };
    }
    clearInterval(clock); clock = null;
    const km = isCity() && match.guess ? distance(match.guess, target()) : null;
    const correct = !isCity() && match.guess === target().id;
    const neighbor = match.mode === 'departments' && !correct && Boolean(match.guess)
      && data.departments.features.find(f => f.properties.code === target().id)?.properties.neighbors?.includes(match.guess) === true;
    const thresholds = match.zone === 'france' ? [10, 60, 200] : [50, 500, 2000];
    const rating = isCity() ? km === null ? 'ÉCLATÉ AU SOL 💀' : km <= thresholds[0] ? 'PARFAIT 👑' : km <= thresholds[1] ? 'SUPER 🔥' : km <= thresholds[2] ? 'NUL 😬' : 'ÉCLATÉ AU SOL 💀' : correct ? 'PARFAIT 👑' : neighbor ? 'LIMITROPHE 👍' : 'RATÉ 😬';
    const points = isCity() ? km === null ? 0 : Math.round(1000 * Math.exp(-Math.max(0, km - (match.zone === 'france' ? 5 : 25)) / (match.zone === 'france' ? 140 : 1600))) : correct ? 1000 : neighbor ? NEIGHBOR_POINTS : 0;
    match.result = { km, correct, neighbor, rating, points, timedOut };
    match.scores[match.index % match.players.length] += points;
    match.rows.push({ target: target().id, player: player(), guess: match.guess, ...match.result });
    match.deadline = 0; setPhase('answer'); save(); reveal(true);
    if (isCity() && Number.isFinite(km) && km <= 5) celebrate();
  }
  function clearCelebration() {
    clearTimeout(celebrationTimer); celebrationTimer = null;
    const overlay = root?.querySelector('#geo-mega-win');
    if (!overlay) return;
    if (!overlay.hidden) overlay.hidden = true;
    overlay.querySelectorAll('.geo-win-particle').forEach(particle => particle.remove());
  }
  function celebrate() {
    clearCelebration();
    const overlay = root.querySelector('#geo-mega-win');
    if (!overlay) return;
    // Centrer dans la portion visible de la carte, même après le scroll du bouton.
    const bounds = overlay.parentElement.getBoundingClientRect();
    const top = Math.max(0, -bounds.top), bottom = Math.max(0, bounds.bottom - global.innerHeight);
    const visibleHeight = bounds.height - top - bottom;
    if (visibleHeight > 0) {
      overlay.style.top = `${top}px`; overlay.style.bottom = `${bottom}px`;
    }
    // Une seule illustration et 16 petites particules ; aucun canvas ni boucle JS.
    if (!global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const radius = Math.min(bounds.width, visibleHeight > 0 ? visibleHeight : bounds.height) * .52;
      for (let i = 0; i < 16; i++) {
        const sparkle = i >= 10, angle = (i * 137.5 - 100) * Math.PI / 180;
        const particle = document.createElement('span');
        particle.className = `geo-win-particle ${sparkle ? 'geo-win-sparkle' : 'geo-win-coin'}`;
        particle.style.setProperty('--win-x', `${Math.cos(angle) * radius}px`);
        particle.style.setProperty('--win-y', `${Math.sin(angle) * radius}px`);
        particle.style.setProperty('--win-fall', `${Math.sin(angle) * radius + radius * .4}px`);
        particle.style.setProperty('--win-spin', `${(i % 2 ? -1 : 1) * (180 + i * 35)}deg`);
        particle.style.setProperty('--win-delay', `${i % 5 * 35}ms`);
        if (sparkle) particle.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2C19 11 21 13 30 16C21 19 19 21 16 30C13 21 11 19 2 16C11 13 13 11 16 2Z" fill="currentColor" stroke="#252124" stroke-width="2.5" stroke-linejoin="round"/></svg>';
        overlay.appendChild(particle);
      }
    }
    overlay.hidden = false;
    celebrationTimer = setTimeout(clearCelebration, CELEBRATION_MS);
  }
  function reveal(animate = false) {
    const L = global.L, result = match.result;
    const motion = animate && isCity() && !global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isCity()) {
      if (guessMarker) guessMarker.dragging.disable();
      let truthLng = target().lng;
      if (match.guess) {
        while (truthLng - match.guess.lng > 180) truthLng -= 360;
        while (truthLng - match.guess.lng < -180) truthLng += 360;
      }
      map.setMaxBounds([[-86, -360], [86, 360]]);
      if (Math.abs(truthLng) > 180) {
        const offset = truthLng > 180 ? 360 : -360;
        // Répéter les vraies côtes au passage du méridien, avec la même projection.
        L.geoJSON({ type: 'FeatureCollection', features: data.countries.features.map(feature => shiftedFeature(feature, offset)) },
          { pane: 'geoLand', style: baseStyle, interactive: false, noClip: true }).addTo(map);
        physicalLayers.addWorldCopy(offset);
      }
      const truthIcon = icon('truth');
      if (motion) truthIcon.options.className += ' geo-pin--reveal';
      const truth = L.marker([target().lat, truthLng], { icon: truthIcon, title: target().name }).addTo(map);
      truth.bindTooltip(escape(target().name), { permanent: true, direction: 'top', offset: [0, -35] });
      if (match.guess) {
        if (!guessMarker) guessMarker = L.marker(match.guess, { icon: icon('guess'), title: 'Ton épingle' }).addTo(map);
        // Plus court arc terrestre ; longitude déroulée pour traverser correctement l'antiméridien.
        const line = greatCircle(match.guess, target());
        const route = L.polyline(line, { color: '#6b36ad', weight: 3, dashArray: '7 5', interactive: false, noClip: true }).addTo(map);
        if (motion) drawRoute(route.getElement());
        const bounds = L.latLngBounds(line), options = { padding: [45, 45], maxZoom: match.zone === 'france' ? 9 : 6 };
        physicalLayers.prepare(bounds, options.maxZoom);
        if (motion) map.flyToBounds(bounds, { ...options, duration: REVEAL_SECONDS });
        else map.fitBounds(bounds, { ...options, animate: false });
      } else {
        const point = [target().lat, target().lng], zoom = match.zone === 'france' ? 7 : 4;
        physicalLayers.prepare(L.latLngBounds([point]), zoom);
        if (motion) map.flyTo(point, zoom, { duration: REVEAL_SECONDS });
        else map.setView(point, zoom, { animate: false });
      }
    } else {
      regions.setStyle(answerStyle);
      const bounds = L.latLngBounds([]);
      regions.eachLayer(layer => {
        if ([target().id, match.guess].includes(layer.feature.properties.code)) {
          layer.bringToFront(); bounds.extend(layer.getBounds());
          layer.bindTooltip(escape(layer.feature.properties.name || layer.feature.properties.nom), { sticky: true });
        }
      });
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [35, 35], maxZoom: match.mode === 'departments' ? 9 : 5, animate: false });
    }
    root.querySelector('#geo-timer').textContent = result.timedOut ? '0 s' : `${Math.ceil(match.remaining / 1000)} s`;
    root.querySelector('#geo-score').textContent = `${match.scores[match.index % match.players.length]} pts`;
    root.querySelector('#geo-selection').innerHTML = isCity() ? '<span class="geo-key-guess">● Ton épingle</span> · <span class="geo-key-truth">✓ La ville</span>'
      : result.correct ? 'Bonne réponse !' : `Ton choix : ${escape(regionName(match.guess))}. En vert : ${escape(target().name)}.`;
    root.querySelector('#geo-result').innerHTML = `<strong>${escape(result.rating)}</strong>${result.timedOut ? '<span>Temps écoulé</span>' : ''}${isCity() ? `<span>${result.km === null ? 'Aucune épingle placée' : `${result.km.toLocaleString('fr-FR', { maximumFractionDigits: result.km < 10 ? 1 : 0 })} km de la ville`}</span>` : ''}<b>+${result.points} pts</b>`;
    if (motion) root.querySelector('#geo-result').classList.add('geo-result--reveal');
    const button = root.querySelector('[data-geo="validate"]');
    button.dataset.geo = 'next'; button.disabled = false;
    button.textContent = match.index === match.targets.length - 1 ? 'Voir le classement' : `Au tour de ${match.players[(match.index + 1) % match.players.length]} ↗`;
  }
  function drawRoute(path) {
    if (!path) return;
    // La longueur normalisée suit le zoom SVG pendant le mouvement de caméra.
    // Retirer ensuite la normalisation pour retrouver les pointillés en pixels.
    path.setAttribute('pathLength', '1'); path.classList.add('geo-route--reveal');
    const finish = () => {
      path.classList.remove('geo-route--reveal'); path.removeAttribute('pathLength');
      path.removeEventListener('animationend', finish); path.removeEventListener('animationcancel', finish);
    };
    path.addEventListener('animationend', finish); path.addEventListener('animationcancel', finish);
  }
  function regionName(code) {
    const features = match.mode === 'countries' ? data.countries.features : data.departments.features;
    const feature = features.find(f => f.properties.code === code);
    return feature ? feature.properties.name || feature.properties.nom : 'Aucune réponse';
  }
  function greatCircle(a, b) {
    const rad = Math.PI / 180;
    const vector = p => [Math.cos(p.lat * rad) * Math.cos(p.lng * rad), Math.cos(p.lat * rad) * Math.sin(p.lng * rad), Math.sin(p.lat * rad)];
    const av = vector(a), bv = vector(b), angle = distance(a, b) / 6371.0088, sin = Math.sin(angle), line = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      if (Math.abs(sin) < 1e-8) { line.push([a.lat + (b.lat - a.lat) * t, a.lng + (((b.lng - a.lng + 540) % 360) - 180) * t]); continue; }
      const u = Math.sin((1 - t) * angle) / sin, v = Math.sin(t * angle) / sin;
      const xyz = av.map((value, j) => u * value + v * bv[j]);
      let lng = Math.atan2(xyz[1], xyz[0]) / rad;
      const previous = line.length ? line[line.length - 1][1] : a.lng;
      while (lng - previous > 180) lng -= 360;
      while (lng - previous < -180) lng += 360;
      line.push([Math.atan2(xyz[2], Math.hypot(xyz[0], xyz[1])) / rad, lng]);
    }
    return line;
  }
  function next() {
    if (phase !== 'answer') return;
    match.index += 1;
    if (match.index >= match.targets.length) { match.finished = true; recordCloudMatch(); save(); renderResults(); }
    else beginTurn();
  }
  function recordCloudMatch() {
    if (!match.cloud) return;
    const best = Math.max(...match.scores), cityMeasurements = {};
    global.JDDCloud.record(match.cloud, match.players.map((name, index) => {
      const rows = match.rows.filter(r => r.player === name);
      const participant = match.cloud.participants.find(p => p.label === name);
      if (match.mode === 'cities' && participant?.kind === 'account') {
        const measured = rows.filter(row => Number.isFinite(row.km));
        cityMeasurements[participant.id] = { distance_turns: measured.length, measured_distance_km: Math.round(measured.reduce((sum,row) => sum + row.km,0)) };
      }
      return { participant, metrics: {
        games: 1, wins: Number(match.players.length > 1 && best > 0 && match.scores[index] === best), points: match.scores[index],
        turns: rows.length, correct_places: rows.filter(r => r.correct).length,
        perfect_places: rows.filter(r => r.rating.startsWith('PARFAIT')).length,
        distance_km: Math.round(rows.reduce((sum, r) => sum + (r.km || 0), 0)),
      } };
    }), { map_mode: match.mode, zone: match.zone, rows: match.rows, city_measurements: cityMeasurements });
  }
  function renderResults() {
    disposeMap(); setPhase('results');
    const ranking = match.players.map((name, i) => ({ name, points: match.scores[i] })).sort((a, b) => b.points - a.points);
    root.innerHTML = `${topbar()}<section class="geo-panel">${windowBar('CLASSEMENT')}<div class="geo-settings"><h1>${match.players.length === 1 ? 'Ton score' : 'Le classement'}</h1><ol class="geo-ranking">${ranking.map((row, i) => `<li><span class="geo-rank">${i ? i + 1 : '👑'}</span><strong>${escape(row.name)}</strong><b>${row.points.toLocaleString('fr-FR')} pts</b></li>`).join('')}</ol><button type="button" class="geo-button" data-geo="replay">Rejouer ↗</button><button type="button" class="geo-link" data-geo="menu">Retour à Géographie</button></div><div class="geo-floor" aria-hidden="true"></div></section>`;
    global.scrollTo(0, 0);
  }
  function pause() {
    if (!match || match.finished) return;
    if (phase === 'playing') {
      match.remaining = Math.max(0, match.deadline - Date.now());
      if (isCity() && guessMarker) {
        const point = guessMarker.getLatLng();
        match.guess = { lat: Math.max(-85, Math.min(85, point.lat)), lng: ((point.lng + 180) % 360 + 360) % 360 - 180 };
      }
    }
    match.deadline = 0; clearInterval(clock); clock = null; save();
  }
  async function resume() {
    const id = ++request;
    try {
      await loadData();
      if (!opened || id !== request || !match || match.finished) return;
      if (match.result) renderTurn();
      else { beginTurn(true); if (match.remaining <= 0) validate(true); }
    } catch (_) { renderSetup(match.mode); root.querySelector('#geo-error').textContent = 'Reconnecte-toi pour charger les cartes.'; root.querySelector('#geo-error').hidden = false; }
  }
  function init(config) {
    root = document.getElementById('geography'); options = config;
    root.addEventListener('click', event => {
      const mode = event.target.closest('[data-geo-mode]');
      if (mode) { ++request; renderSetup(mode.dataset.geoMode); return; }
      const button = event.target.closest('[data-geo]');
      if (!button || button.disabled) return;
      switch (button.dataset.geo) {
        case 'exit': ++request; pause(); opened = false; disposeMap(); document.body.classList.remove('geo-open'); options.onExit(); break;
        case 'menu': ++request; pause(); renderMenu(); break;
        case 'start': start(); break;
        case 'validate': validate(); break;
        case 'next': next(); break;
        case 'resume': resume(); break;
        case 'replay': renderSetup(match.mode); break;
      }
    });
    root.addEventListener('change', event => { if (event.target.name === 'geo-zone') zone = event.target.value; });
    document.addEventListener('visibilitychange', () => {
      if (opened && document.hidden && phase === 'playing') { pause(); renderMenu(); }
    });
    global.addEventListener('pagehide', () => { if (opened) pause(); });
  }
  function onOpen() {
    opened = true; document.body.classList.add('geo-open');
    if (!match) {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY));
        if (saved && ['cities', 'countries', 'departments'].includes(saved.mode) && Array.isArray(saved.players) && saved.players.length
          && saved.players.every(n => typeof n === 'string') && Array.isArray(saved.targets) && saved.targets.length
          && saved.targets.every(t => t && typeof t.id === 'string' && typeof t.name === 'string')
          && Array.isArray(saved.scores) && saved.scores.length === saved.players.length && saved.scores.every(Number.isFinite)
          && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < saved.targets.length && Number.isFinite(saved.remaining) && Array.isArray(saved.rows)) {
          match = saved;
          if (match.deadline) match.remaining = Math.max(0, match.deadline - Date.now());
          match.deadline = 0;
        }
      } catch (_) { /* stockage indisponible ou ancienne sauvegarde */ }
    }
    renderMenu();
  }
  global.JDDModules = global.JDDModules || {};
  global.JDDModules.geography = { init, onOpen, onPlayersChanged, hasActiveGame: () => Boolean(match && !match.finished) };
})(window);

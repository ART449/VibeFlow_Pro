(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const showControl = VF.modules.showControl = {};

  const state = {
    shows: [],
    activeShowId: '',
    activeSceneId: '',
    midiState: null,
    logEntries: []
  };

  let refs = {};
  let unsubs = [];

  function el(id) {
    return document.getElementById(id);
  }

  function nowLabel() {
    return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function cleanString(value) {
    return String(value || '').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showScenes() {
    return VF.modules.showScenes;
  }

  function midi() {
    return VF.modules.midi;
  }

  function setToast(message, type) {
    if (!refs.toast) return;
    refs.toast.textContent = message;
    refs.toast.className = 'show-toast show';
    if (type) refs.toast.classList.add(type);
    clearTimeout(setToast._timerId);
    setToast._timerId = setTimeout(() => {
      refs.toast.className = 'show-toast';
    }, 2400);
  }

  function addLog(text, tone) {
    state.logEntries.unshift({
      id: 'log_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      text: cleanString(text),
      tone: cleanString(tone) || 'info',
      at: nowLabel()
    });
    state.logEntries = state.logEntries.slice(0, 24);
    renderLog();
  }

  function getActiveShow() {
    return state.shows.find((show) => show.id === state.activeShowId) || null;
  }

  function getActiveScene() {
    const show = getActiveShow();
    if (!show) return null;
    return show.scenes.find((scene) => scene.id === state.activeSceneId) || show.scenes[0] || null;
  }

  function syncSelection() {
    if (!state.shows.length) {
      const starter = showScenes().buildStarterShow('bar-karaoke');
      state.shows = [showScenes().saveLocal(starter)];
    }

    if (!state.activeShowId || !state.shows.some((show) => show.id === state.activeShowId)) {
      state.activeShowId = state.shows[0] ? state.shows[0].id : '';
    }

    const activeShow = getActiveShow();
    if (activeShow) {
      if (!state.activeSceneId || !activeShow.scenes.some((scene) => scene.id === state.activeSceneId)) {
        state.activeSceneId = activeShow.scenes[0] ? activeShow.scenes[0].id : '';
      }
    } else {
      state.activeSceneId = '';
    }
  }

  function replaceShow(show) {
    const normalized = showScenes().saveLocal(show);
    state.shows = showScenes().listLocal();
    state.activeShowId = normalized.id;
    syncSelection();
    renderAll();
    return normalized;
  }

  function updateShowField(field, value) {
    const activeShow = getActiveShow();
    if (!activeShow) return;
    activeShow[field] = value;
    replaceShow(activeShow);
  }

  function updateScene(sceneId, field, value) {
    const activeShow = getActiveShow();
    if (!activeShow) return;
    activeShow.scenes = activeShow.scenes.map((scene) => {
      if (scene.id !== cleanString(sceneId)) return scene;
      scene[field] = value;
      return scene;
    });
    replaceShow(activeShow);
  }

  function updateCue(sceneId, cueId, field, value) {
    const activeShow = getActiveShow();
    if (!activeShow) return;
    activeShow.scenes = activeShow.scenes.map((scene) => {
      if (scene.id !== cleanString(sceneId)) return scene;
      scene.cueStack = scene.cueStack.map((cue) => {
        if (cue.id !== cleanString(cueId)) return cue;
        cue[field] = value;
        return cue;
      });
      return scene;
    });
    replaceShow(activeShow);
  }

  function updateMapping(mappingId, field, value) {
    const activeShow = getActiveShow();
    if (!activeShow) return;
    activeShow.mappings = activeShow.mappings.map((mapping) => {
      if (mapping.id !== cleanString(mappingId)) return mapping;
      mapping[field] = value;
      return mapping;
    });
    replaceShow(activeShow);
  }

  function renderCapabilities() {
    const caps = midi().getCapabilityReport();
    const cards = [
      { label: 'Web MIDI', state: caps.webMidi ? 'Disponible' : 'No disponible', tone: caps.webMidi ? 'ok' : 'warn', desc: 'Ideal para pads, knobs, faders y MIDI Learn.' },
      { label: 'WebHID', state: caps.webHid ? 'Disponible' : 'Parcial', tone: caps.webHid ? 'ok' : 'subtle', desc: 'Puede ayudar con algunos controladores DJ/HID, pero no seria mi columna vertebral.' },
      { label: 'Web Serial', state: caps.webSerial ? 'Disponible' : 'Parcial', tone: caps.webSerial ? 'ok' : 'subtle', desc: 'Sirve para hardware DIY, footswitches y gateways custom.' },
      { label: 'OSC / QLC+ / OLA', state: 'Bridge local', tone: 'bridge', desc: 'El camino serio para mixers, luces, macros y software de escenario.' },
      { label: 'OBS / Video', state: 'Bridge local', tone: 'bridge', desc: 'Conviene usar OBS WebSocket para overlays, stream y pantallas.' },
      { label: 'Ableton Link / OS2L', state: 'Fase avanzada', tone: 'bridge', desc: 'Perfecto para DJ y conciertos cuando ya exista cue stack estable.' }
    ];

    refs.capabilities.innerHTML = cards.map((card) => {
      return '<article class="cap-card ' + card.tone + '">' +
        '<div class="cap-label">' + escapeHtml(card.label) + '</div>' +
        '<div class="cap-state">' + escapeHtml(card.state) + '</div>' +
        '<p>' + escapeHtml(card.desc) + '</p>' +
      '</article>';
    }).join('');
  }

  function renderShowList() {
    refs.showList.innerHTML = state.shows.map((show) => {
      const active = show.id === state.activeShowId ? ' active' : '';
      return '<button class="show-card' + active + '" type="button" data-show-id="' + escapeHtml(show.id) + '">' +
        '<span class="show-card-title">' + escapeHtml(show.name) + '</span>' +
        '<span class="show-card-meta">' + escapeHtml(show.venueType) + ' · ' + String(show.scenes.length) + ' escenas · ' + String(show.mappings.length) + ' mappings</span>' +
      '</button>';
    }).join('');
  }

  function renderShowMeta() {
    const activeShow = getActiveShow();
    if (!activeShow) return;
    refs.showName.value = activeShow.name;
    refs.showVenue.value = activeShow.venueType;
    refs.showNotes.value = activeShow.notes;
    refs.showBridge.textContent = activeShow.bridgeMode === 'recommended' ? 'Bridge local recomendado' : activeShow.bridgeMode;
  }

  function renderSceneList() {
    const activeShow = getActiveShow();
    const activeScene = getActiveScene();
    if (!activeShow) return;

    refs.sceneList.innerHTML = activeShow.scenes.map((scene) => {
      const active = activeScene && activeScene.id === scene.id ? ' active' : '';
      return '<button class="scene-card' + active + '" type="button" data-scene-id="' + escapeHtml(scene.id) + '">' +
        '<span class="scene-dot" style="background:' + escapeHtml(scene.color) + '"></span>' +
        '<span class="scene-main">' +
          '<strong>' + escapeHtml(scene.name) + '</strong>' +
          '<span>' + escapeHtml(scene.mode) + ' · ' + String(scene.cueStack.length) + ' cues</span>' +
        '</span>' +
      '</button>';
    }).join('');

    if (!activeScene) return;
    refs.sceneName.value = activeScene.name;
    refs.sceneMode.value = activeScene.mode;
    refs.sceneColor.value = activeScene.color;
    refs.sceneNotes.value = activeScene.notes;
  }

  function actionOptions(selected) {
    return showScenes().ACTION_KINDS.map((item) => {
      return '<option value="' + escapeHtml(item.value) + '"' + (item.value === selected ? ' selected' : '') + '>' + escapeHtml(item.label) + '</option>';
    }).join('');
  }

  function transportOptions(selected) {
    return showScenes().TRANSPORTS.map((item) => {
      return '<option value="' + escapeHtml(item.value) + '"' + (item.value === selected ? ' selected' : '') + '>' + escapeHtml(item.label) + '</option>';
    }).join('');
  }

  function renderCueList() {
    const activeScene = getActiveScene();
    if (!activeScene) {
      refs.cueList.innerHTML = '<div class="empty-card">Selecciona una escena para construir la cue stack.</div>';
      return;
    }

    refs.cueList.innerHTML = activeScene.cueStack.map((cue) => {
      return '<article class="cue-card">' +
        '<div class="cue-head">' +
          '<strong>' + escapeHtml(cue.label) + '</strong>' +
          '<div class="cue-actions">' +
            '<button type="button" data-simulate-cue="' + escapeHtml(cue.id) + '">Simular</button>' +
            '<button type="button" data-remove-cue="' + escapeHtml(cue.id) + '">Eliminar</button>' +
          '</div>' +
        '</div>' +
        '<div class="cue-grid">' +
          '<label><span>Label</span><input type="text" data-cue-id="' + escapeHtml(cue.id) + '" data-cue-field="label" value="' + escapeHtml(cue.label) + '"></label>' +
          '<label><span>Accion</span><select data-cue-id="' + escapeHtml(cue.id) + '" data-cue-field="actionKind">' + actionOptions(cue.actionKind) + '</select></label>' +
          '<label><span>Transporte</span><select data-cue-id="' + escapeHtml(cue.id) + '" data-cue-field="transport">' + transportOptions(cue.transport) + '</select></label>' +
          '<label><span>Delay (ms)</span><input type="number" min="0" step="50" data-cue-id="' + escapeHtml(cue.id) + '" data-cue-field="delayMs" value="' + String(cue.delayMs) + '"></label>' +
          '<label class="cue-span-2"><span>Target</span><input type="text" data-cue-id="' + escapeHtml(cue.id) + '" data-cue-field="target" value="' + escapeHtml(cue.target) + '" placeholder="qlc:scene/main-song, mixer:vocal-fx, twin:load-current..."></label>' +
          '<label class="cue-span-2"><span>Payload</span><textarea data-cue-id="' + escapeHtml(cue.id) + '" data-cue-field="payload" placeholder="Parametros, preset, macro o JSON corto.">' + escapeHtml(cue.payload) + '</textarea></label>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderMappings() {
    const activeShow = getActiveShow();
    if (!activeShow) return;

    refs.mappingList.innerHTML = activeShow.mappings.length ? activeShow.mappings.map((mapping) => {
      return '<article class="mapping-card">' +
        '<div class="cue-head">' +
          '<strong>' + escapeHtml(mapping.label) + '</strong>' +
          '<div class="cue-actions">' +
            '<button type="button" data-learn-map="' + escapeHtml(mapping.id) + '">Learn</button>' +
            '<button type="button" data-remove-map="' + escapeHtml(mapping.id) + '">Eliminar</button>' +
          '</div>' +
        '</div>' +
        '<div class="cue-grid">' +
          '<label><span>Label</span><input type="text" data-map-id="' + escapeHtml(mapping.id) + '" data-map-field="label" value="' + escapeHtml(mapping.label) + '"></label>' +
          '<label><span>Accion</span><select data-map-id="' + escapeHtml(mapping.id) + '" data-map-field="actionKind">' + actionOptions(mapping.actionKind) + '</select></label>' +
          '<label><span>Firma</span><input type="text" data-map-id="' + escapeHtml(mapping.id) + '" data-map-field="signature" value="' + escapeHtml(mapping.signature) + '" placeholder="captura MIDI"></label>' +
          '<label><span>Target</span><input type="text" data-map-id="' + escapeHtml(mapping.id) + '" data-map-field="target" value="' + escapeHtml(mapping.target) + '" placeholder="scene:<id>, qlc:scene/opening..."></label>' +
          '<label class="cue-span-2"><span>Payload</span><textarea data-map-id="' + escapeHtml(mapping.id) + '" data-map-field="payload" placeholder="Opcional.">' + escapeHtml(mapping.payload) + '</textarea></label>' +
        '</div>' +
      '</article>';
    }).join('') : '<div class="empty-card small">Todavia no hay mappings. Empieza con un pad, un knob o un footswitch y usa MIDI Learn.</div>';
  }

  function renderDeviceState() {
    const midiState = state.midiState || midi().getState();
    const inputs = Array.isArray(midiState.inputs) ? midiState.inputs : [];
    const outputs = Array.isArray(midiState.outputs) ? midiState.outputs : [];
    const hardware = [
      '<div class="device-pill ' + (midiState.accessGranted ? 'ok' : '') + '">MIDI ' + (midiState.accessGranted ? 'conectado' : 'sin permiso') + '</div>',
      '<div class="device-pill">Entradas: ' + String(inputs.length) + '</div>',
      '<div class="device-pill">Salidas: ' + String(outputs.length) + '</div>'
    ];

    refs.deviceStats.innerHTML = hardware.join('');

    const cards = [];
    if (inputs.length) {
      cards.push('<div class="device-group"><h4>Entradas</h4>' + inputs.map((port) => '<div class="device-row"><strong>' + escapeHtml(port.name) + '</strong><span>' + escapeHtml(port.manufacturer) + ' · ' + escapeHtml(port.state) + '</span></div>').join('') + '</div>');
    }
    if (outputs.length) {
      cards.push('<div class="device-group"><h4>Salidas</h4>' + outputs.map((port) => '<div class="device-row"><strong>' + escapeHtml(port.name) + '</strong><span>' + escapeHtml(port.manufacturer) + ' · ' + escapeHtml(port.state) + '</span></div>').join('') + '</div>');
    }
    if (!cards.length) cards.push('<div class="empty-card small">No hay puertos MIDI listados. Si estas en Chrome o Edge, conecta el dispositivo y usa "Conectar MIDI".</div>');
    refs.deviceList.innerHTML = cards.join('');

    refs.lastMidi.textContent = midiState.lastMessage ? midi().describeMessage(midiState.lastMessage) : 'Sin mensaje MIDI capturado todavia.';
    refs.deviceHint.textContent = midiState.lastError || 'La recomendacion pro sigue siendo browser + bridge local para mixers, luces y video.';
  }

  function renderBlueprint() {
    refs.blueprint.innerHTML = [
      { title: 'MVP inmediato', copy: 'Web MIDI + MIDI Learn + escenas/cue stack + SFX + teleprompter.' },
      { title: 'Paso venue-ready', copy: 'Bridge local + OSC + QLC+ para luces y macros con mixers.' },
      { title: 'Paso streaming', copy: 'OBS WebSocket + overlays + pantallas y salida para escenario.' },
      { title: 'Version conciertos', copy: 'Setlist, roles de operador, stage display, rehearsals y safety layer.' }
    ].map((item) => {
      return '<article class="bp-card"><h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.copy) + '</p></article>';
    }).join('');
  }

  function renderAdditions() {
    refs.additions.innerHTML = [
      'Setlist engine con cues por cancion y por bloque.',
      'Roles: operador FOH, karaoke host, luces y stage manager.',
      'Macros de seguridad para blackout, mute global y panic stop.',
      'Modo ensayo con simulacion de cues sin disparar hardware real.',
      'Bridge local para QLC+, OLA, OBS, OSC y mixers digitales.',
      'Ableton Link y OS2L cuando el producto ya tenga timeline y BPM estables.'
    ].map((item) => '<li>' + escapeHtml(item) + '</li>').join('');
  }

  function renderLog() {
    refs.liveLog.innerHTML = state.logEntries.length ? state.logEntries.map((entry) => {
      return '<div class="log-row ' + escapeHtml(entry.tone) + '"><strong>' + escapeHtml(entry.at) + '</strong><span>' + escapeHtml(entry.text) + '</span></div>';
    }).join('') : '<div class="empty-card small">Aqui apareceran las simulaciones de escenas y cues para validar tu flujo antes de mover hardware real.</div>';
  }

  function renderAll() {
    syncSelection();
    renderCapabilities();
    renderShowList();
    renderShowMeta();
    renderSceneList();
    renderCueList();
    renderMappings();
    renderDeviceState();
    renderBlueprint();
    renderAdditions();
    renderLog();
  }

  async function learnMapping(mappingId) {
    try {
      setToast('Esperando el siguiente mensaje MIDI...', 'ok');
      const message = await midi().learnNextMessage(12000);
      const activeShow = getActiveShow();
      if (!activeShow) return;
      const binding = midi().messageToBinding(message);
      activeShow.mappings = activeShow.mappings.map((mapping) => {
        if (mapping.id !== cleanString(mappingId)) return mapping;
        mapping.signature = binding.signature;
        mapping.portId = binding.portId;
        mapping.portName = binding.portName;
        mapping.type = binding.type;
        mapping.channel = binding.channel;
        mapping.data1 = binding.data1;
        return mapping;
      });
      replaceShow(activeShow);
      addLog('Binding aprendido: ' + midi().describeMessage(message), 'ok');
      setToast('Mapping MIDI aprendido.', 'ok');
    } catch (error) {
      setToast(error && error.message ? error.message : 'No se pudo capturar el mensaje MIDI.', 'warn');
    }
  }

  function simulateCue(cueId) {
    const activeScene = getActiveScene();
    if (!activeScene) return;
    const cue = activeScene.cueStack.find((item) => item.id === cleanString(cueId));
    if (!cue) return;
    addLog('Simulacion -> ' + showScenes().describeCue(cue), cue.transport === 'browser' ? 'ok' : 'info');
    setToast('Cue simulada: ' + cue.label, 'ok');
  }

  function bindEvents() {
    refs.showCreateBar.addEventListener('click', () => {
      const show = showScenes().saveLocal(showScenes().buildStarterShow('bar-karaoke'));
      state.shows = showScenes().listLocal();
      state.activeShowId = show.id;
      state.activeSceneId = show.scenes[0] ? show.scenes[0].id : '';
      addLog('Se creo un preset Bar Karaoke + DJ.', 'ok');
      renderAll();
    });

    refs.showCreateDj.addEventListener('click', () => {
      const show = showScenes().saveLocal(showScenes().buildStarterShow('dj-night'));
      state.shows = showScenes().listLocal();
      state.activeShowId = show.id;
      state.activeSceneId = show.scenes[0] ? show.scenes[0].id : '';
      addLog('Se creo un preset DJ Night.', 'ok');
      renderAll();
    });

    refs.showCreateConcert.addEventListener('click', () => {
      const show = showScenes().saveLocal(showScenes().buildStarterShow('concert-stage'));
      state.shows = showScenes().listLocal();
      state.activeShowId = show.id;
      state.activeSceneId = show.scenes[0] ? show.scenes[0].id : '';
      addLog('Se creo un preset Concert Stage.', 'ok');
      renderAll();
    });

    refs.showList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-show-id]');
      if (!button) return;
      state.activeShowId = button.getAttribute('data-show-id') || '';
      state.activeSceneId = '';
      renderAll();
    });

    refs.showSave.addEventListener('click', () => {
      const activeShow = getActiveShow();
      if (!activeShow) return;
      replaceShow(activeShow);
      setToast('Show guardado localmente.', 'ok');
    });

    refs.showDelete.addEventListener('click', () => {
      const activeShow = getActiveShow();
      if (!activeShow) return;
      showScenes().removeLocal(activeShow.id);
      state.shows = showScenes().listLocal();
      syncSelection();
      addLog('Se elimino el show activo.', 'warn');
      renderAll();
    });

    refs.showName.addEventListener('change', () => updateShowField('name', refs.showName.value));
    refs.showVenue.addEventListener('change', () => updateShowField('venueType', refs.showVenue.value));
    refs.showNotes.addEventListener('change', () => updateShowField('notes', refs.showNotes.value));

    refs.sceneAdd.addEventListener('click', () => {
      const activeShow = getActiveShow();
      if (!activeShow) return;
      const scene = showScenes().createScene('Nueva escena', activeShow.venueType === 'concert-stage' ? 'concert' : 'karaoke');
      activeShow.scenes.push(scene);
      const next = replaceShow(activeShow);
      state.activeSceneId = scene.id;
      addLog('Se agrego una nueva escena.', 'ok');
      state.shows = showScenes().listLocal();
      state.activeShowId = next.id;
      renderAll();
    });

    refs.sceneDuplicate.addEventListener('click', () => {
      const activeShow = getActiveShow();
      const activeScene = getActiveScene();
      if (!activeShow || !activeScene) return;
      const copy = JSON.parse(JSON.stringify(activeScene));
      copy.id = '';
      copy.name = activeScene.name + ' Copy';
      copy.sortOrder = activeShow.scenes.length;
      copy.cueStack = activeScene.cueStack.map((cue) => Object.assign({}, cue, { id: '' }));
      activeShow.scenes.push(copy);
      replaceShow(activeShow);
      addLog('Escena duplicada para experimentar sin tocar la original.', 'ok');
    });

    refs.sceneRemove.addEventListener('click', () => {
      const activeShow = getActiveShow();
      const activeScene = getActiveScene();
      if (!activeShow || !activeScene || activeShow.scenes.length <= 1) return;
      activeShow.scenes = activeShow.scenes.filter((scene) => scene.id !== activeScene.id);
      replaceShow(activeShow);
      addLog('Escena eliminada.', 'warn');
    });

    refs.sceneList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-scene-id]');
      if (!button) return;
      state.activeSceneId = button.getAttribute('data-scene-id') || '';
      renderAll();
    });

    refs.sceneName.addEventListener('change', () => {
      const activeScene = getActiveScene();
      if (activeScene) updateScene(activeScene.id, 'name', refs.sceneName.value);
    });

    refs.sceneMode.addEventListener('change', () => {
      const activeScene = getActiveScene();
      if (activeScene) updateScene(activeScene.id, 'mode', refs.sceneMode.value);
    });

    refs.sceneColor.addEventListener('input', () => {
      const activeScene = getActiveScene();
      if (activeScene) updateScene(activeScene.id, 'color', refs.sceneColor.value);
    });

    refs.sceneNotes.addEventListener('change', () => {
      const activeScene = getActiveScene();
      if (activeScene) updateScene(activeScene.id, 'notes', refs.sceneNotes.value);
    });

    refs.cueAdd.addEventListener('click', () => {
      const activeShow = getActiveShow();
      const activeScene = getActiveScene();
      if (!activeShow || !activeScene) return;
      activeScene.cueStack.push(showScenes().createCue('macro'));
      replaceShow(activeShow);
      addLog('Cue agregada a la escena actual.', 'ok');
    });

    refs.cueList.addEventListener('click', (event) => {
      const simulateBtn = event.target.closest('[data-simulate-cue]');
      if (simulateBtn) {
        simulateCue(simulateBtn.getAttribute('data-simulate-cue'));
        return;
      }

      const removeBtn = event.target.closest('[data-remove-cue]');
      if (removeBtn) {
        const activeShow = getActiveShow();
        const activeScene = getActiveScene();
        if (!activeShow || !activeScene) return;
        const next = showScenes().removeCue(activeShow, activeScene.id, removeBtn.getAttribute('data-remove-cue'));
        replaceShow(next);
        addLog('Cue eliminada.', 'warn');
      }
    });

    refs.cueList.addEventListener('change', (event) => {
      const field = event.target.getAttribute('data-cue-field');
      const cueId = event.target.getAttribute('data-cue-id');
      const activeScene = getActiveScene();
      if (!field || !cueId || !activeScene) return;
      const value = field === 'delayMs' ? Math.max(0, Math.round(Number(event.target.value) || 0)) : event.target.value;
      updateCue(activeScene.id, cueId, field, value);
    });

    refs.mappingAdd.addEventListener('click', () => {
      const activeShow = getActiveShow();
      if (!activeShow) return;
      activeShow.mappings.push(showScenes().createMapping());
      replaceShow(activeShow);
      addLog('Mapping lista para MIDI Learn.', 'ok');
    });

    refs.mappingList.addEventListener('click', (event) => {
      const learnBtn = event.target.closest('[data-learn-map]');
      if (learnBtn) {
        learnMapping(learnBtn.getAttribute('data-learn-map'));
        return;
      }

      const removeBtn = event.target.closest('[data-remove-map]');
      if (removeBtn) {
        const activeShow = getActiveShow();
        if (!activeShow) return;
        const next = showScenes().removeMapping(activeShow, removeBtn.getAttribute('data-remove-map'));
        replaceShow(next);
        addLog('Mapping eliminada.', 'warn');
      }
    });

    refs.mappingList.addEventListener('change', (event) => {
      const field = event.target.getAttribute('data-map-field');
      const mapId = event.target.getAttribute('data-map-id');
      if (!field || !mapId) return;
      updateMapping(mapId, field, event.target.value);
    });

    refs.midiConnect.addEventListener('click', async () => {
      try {
        await midi().requestAccess();
        setToast('Web MIDI conectado.', 'ok');
      } catch (error) {
        setToast(error && error.message ? error.message : 'No se pudo conectar Web MIDI.', 'warn');
      }
    });

    refs.midiRefresh.addEventListener('click', () => {
      midi().refreshPorts();
      setToast('Puertos MIDI refrescados.', 'ok');
    });

    refs.captureMidi.addEventListener('click', async () => {
      try {
        setToast('Esperando un pad, knob o fader...', 'ok');
        const message = await midi().learnNextMessage(12000);
        addLog('Ultimo mensaje capturado: ' + midi().describeMessage(message), 'ok');
        refs.lastMidi.textContent = midi().describeMessage(message);
      } catch (error) {
        setToast(error && error.message ? error.message : 'No se recibio mensaje MIDI.', 'warn');
      }
    });
  }

  function cacheRefs() {
    refs = {
      capabilities: el('show-capabilities'),
      showList: el('show-list'),
      showCreateBar: el('show-create-bar'),
      showCreateDj: el('show-create-dj'),
      showCreateConcert: el('show-create-concert'),
      showName: el('show-name'),
      showVenue: el('show-venue'),
      showNotes: el('show-notes'),
      showBridge: el('show-bridge'),
      showSave: el('show-save'),
      showDelete: el('show-delete'),
      sceneList: el('scene-list'),
      sceneAdd: el('scene-add'),
      sceneDuplicate: el('scene-duplicate'),
      sceneRemove: el('scene-remove'),
      sceneName: el('scene-name'),
      sceneMode: el('scene-mode'),
      sceneColor: el('scene-color'),
      sceneNotes: el('scene-notes'),
      cueAdd: el('cue-add'),
      cueList: el('cue-list'),
      mappingAdd: el('mapping-add'),
      mappingList: el('mapping-list'),
      midiConnect: el('midi-connect'),
      midiRefresh: el('midi-refresh'),
      captureMidi: el('capture-midi'),
      deviceStats: el('device-stats'),
      deviceList: el('device-list'),
      lastMidi: el('last-midi'),
      deviceHint: el('device-hint'),
      blueprint: el('show-blueprint'),
      additions: el('show-additions'),
      liveLog: el('show-live-log'),
      toast: el('show-toast')
    };
  }

  showControl.init = function() {
    cacheRefs();
    state.shows = showScenes().listLocal();
    state.midiState = midi().getState();
    syncSelection();

    unsubs.forEach((dispose) => {
      try { dispose(); } catch {}
    });
    unsubs = [
      midi().subscribe((snapshot) => {
        state.midiState = snapshot;
        renderDeviceState();
      }),
      midi().subscribeMessages((message) => {
        refs.lastMidi.textContent = midi().describeMessage(message);
      })
    ];

    bindEvents();
    renderAll();
  };
})(window.VibeFlow);

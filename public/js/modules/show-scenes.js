(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const showScenes = VF.modules.showScenes = {};
  const STORAGE_KEY = 'byflow_show_control_v1';

  function now() {
    return Date.now();
  }

  function makeId(prefix) {
    return String(prefix || 'item') + '_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function cleanString(value) {
    return String(value || '').trim();
  }

  function clampDelay(value) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.max(0, Math.round(num)) : 0;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeCue(rawCue, index) {
    const cue = rawCue || {};
    return {
      id: cleanString(cue.id) || makeId('cue'),
      sortOrder: Number.isFinite(Number(cue.sortOrder)) ? Math.round(Number(cue.sortOrder)) : index,
      label: cleanString(cue.label) || ('Cue ' + String(index + 1)),
      actionKind: cleanString(cue.actionKind) || 'macro',
      transport: cleanString(cue.transport) || 'bridge',
      target: cleanString(cue.target),
      payload: cleanString(cue.payload),
      delayMs: clampDelay(cue.delayMs),
      enabled: cue.enabled !== false,
      notes: cleanString(cue.notes),
      midiBindingId: cleanString(cue.midiBindingId)
    };
  }

  function normalizeScene(rawScene, index) {
    const scene = rawScene || {};
    const cueStack = (Array.isArray(scene.cueStack) ? scene.cueStack : Array.isArray(scene.cues) ? scene.cues : [])
      .map((cue, cueIndex) => normalizeCue(cue, cueIndex));

    return {
      id: cleanString(scene.id) || makeId('scene'),
      sortOrder: Number.isFinite(Number(scene.sortOrder)) ? Math.round(Number(scene.sortOrder)) : index,
      name: cleanString(scene.name) || ('Escena ' + String(index + 1)),
      mode: cleanString(scene.mode) || 'karaoke',
      color: cleanString(scene.color) || '#00d5ff',
      notes: cleanString(scene.notes),
      autoAdvance: !!scene.autoAdvance,
      cueStack
    };
  }

  function normalizeMapping(rawMapping, index) {
    const mapping = rawMapping || {};
    return {
      id: cleanString(mapping.id) || makeId('map'),
      sortOrder: Number.isFinite(Number(mapping.sortOrder)) ? Math.round(Number(mapping.sortOrder)) : index,
      label: cleanString(mapping.label) || ('Control ' + String(index + 1)),
      transport: cleanString(mapping.transport) || 'midi',
      portId: cleanString(mapping.portId),
      portName: cleanString(mapping.portName),
      signature: cleanString(mapping.signature),
      type: cleanString(mapping.type) || 'cc',
      channel: Number.isFinite(Number(mapping.channel)) ? Math.max(1, Math.round(Number(mapping.channel))) : 1,
      data1: Number.isFinite(Number(mapping.data1)) ? Math.max(0, Math.round(Number(mapping.data1))) : 0,
      data2Min: Number.isFinite(Number(mapping.data2Min)) ? Math.max(0, Math.round(Number(mapping.data2Min))) : 0,
      data2Max: Number.isFinite(Number(mapping.data2Max)) ? Math.max(0, Math.round(Number(mapping.data2Max))) : 127,
      actionKind: cleanString(mapping.actionKind) || 'scene',
      target: cleanString(mapping.target),
      payload: cleanString(mapping.payload),
      notes: cleanString(mapping.notes)
    };
  }

  function sortByOrder(items) {
    return items.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }

  showScenes.ACTION_KINDS = [
    { value: 'macro', label: 'Macro general' },
    { value: 'scene', label: 'Cambiar escena' },
    { value: 'karaoke', label: 'Accion karaoke' },
    { value: 'teleprompter', label: 'Teleprompter' },
    { value: 'lyrics', label: 'LRC / letra' },
    { value: 'sfx', label: 'SFX / DJ pad' },
    { value: 'midi', label: 'MIDI out' },
    { value: 'osc', label: 'OSC' },
    { value: 'lights', label: 'Luces' },
    { value: 'mixer', label: 'Mixer' },
    { value: 'obs', label: 'OBS / video' }
  ];

  showScenes.TRANSPORTS = [
    { value: 'bridge', label: 'Bridge local' },
    { value: 'browser', label: 'Browser directo' },
    { value: 'midi', label: 'MIDI' },
    { value: 'osc', label: 'OSC' },
    { value: 'artnet', label: 'Art-Net / sACN' },
    { value: 'obs-websocket', label: 'OBS WebSocket' },
    { value: 'manual', label: 'Manual / operador' }
  ];

  showScenes.VENUE_TYPES = [
    { value: 'bar-karaoke', label: 'Bar Karaoke' },
    { value: 'dj-night', label: 'DJ Night' },
    { value: 'concert-stage', label: 'Concierto' },
    { value: 'rehearsal', label: 'Ensayo' }
  ];

  showScenes.createCue = function(actionKind) {
    return normalizeCue({
      label: 'Nueva cue',
      actionKind: actionKind || 'macro',
      transport: actionKind === 'midi' ? 'midi' : 'bridge',
      target: '',
      payload: '',
      delayMs: 0,
      enabled: true,
      notes: ''
    }, 0);
  };

  showScenes.createScene = function(name, mode) {
    return normalizeScene({
      name: name || 'Nueva escena',
      mode: mode || 'karaoke',
      color: '#00d5ff',
      notes: '',
      autoAdvance: false,
      cueStack: [showScenes.createCue('macro')]
    }, 0);
  };

  showScenes.createMapping = function() {
    return normalizeMapping({
      label: 'Nuevo control',
      transport: 'midi',
      signature: '',
      actionKind: 'scene',
      target: '',
      payload: ''
    }, 0);
  };

  showScenes.createEmptyShow = function() {
    return {
      schemaVersion: 1,
      id: makeId('show'),
      name: 'Show ByFlow',
      venueType: 'bar-karaoke',
      bridgeMode: 'recommended',
      notes: '',
      scenes: [showScenes.createScene('Bienvenida', 'karaoke')],
      mappings: [],
      createdAt: now(),
      updatedAt: now()
    };
  };

  showScenes.normalize = function(rawShow) {
    const base = showScenes.createEmptyShow();
    const input = rawShow || {};
    const scenes = sortByOrder((Array.isArray(input.scenes) ? input.scenes : []).map((scene, index) => normalizeScene(scene, index)));
    const mappings = sortByOrder((Array.isArray(input.mappings) ? input.mappings : []).map((mapping, index) => normalizeMapping(mapping, index)));

    return {
      schemaVersion: 1,
      id: cleanString(input.id) || base.id,
      name: cleanString(input.name) || base.name,
      venueType: cleanString(input.venueType) || base.venueType,
      bridgeMode: cleanString(input.bridgeMode) || base.bridgeMode,
      notes: cleanString(input.notes),
      scenes: scenes.length ? scenes : base.scenes,
      mappings,
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : base.createdAt,
      updatedAt: Number.isFinite(Number(input.updatedAt)) ? Number(input.updatedAt) : now()
    };
  };

  showScenes.buildStarterShow = function(kind) {
    const preset = cleanString(kind) || 'bar-karaoke';
    if (preset === 'dj-night') {
      return showScenes.normalize({
        name: 'DJ Night Control',
        venueType: 'dj-night',
        notes: 'Preset para DJ, pads, luces y cambios de energia por escena.',
        scenes: [
          {
            name: 'Warm Up',
            mode: 'music',
            color: '#22c55e',
            cueStack: [
              { label: 'Subir ambientacion', actionKind: 'lights', transport: 'bridge', target: 'qlc:scene/warmup', payload: 'fade=3000' },
              { label: 'Lower thirds OBS', actionKind: 'obs', transport: 'obs-websocket', target: 'scene:WarmupCam', payload: 'studioMode=true' }
            ]
          },
          {
            name: 'Drop / Pico',
            mode: 'dj',
            color: '#ff006e',
            cueStack: [
              { label: 'Strobe suave', actionKind: 'lights', transport: 'bridge', target: 'qlc:chaser/drop', payload: 'speed=fast' },
              { label: 'Airhorn', actionKind: 'sfx', transport: 'browser', target: 'airhorn', payload: '' },
              { label: 'Macro mixer', actionKind: 'mixer', transport: 'bridge', target: 'mixer:fx-bank-a', payload: 'preset=club' }
            ]
          }
        ]
      });
    }

    if (preset === 'concert-stage') {
      return showScenes.normalize({
        name: 'Concert Stage',
        venueType: 'concert-stage',
        notes: 'Preset para setlist, cambios de acto, pantallas y luces de concierto.',
        scenes: [
          {
            name: 'Apertura',
            mode: 'concert',
            color: '#f59e0b',
            cueStack: [
              { label: 'Pantalla intro', actionKind: 'obs', transport: 'obs-websocket', target: 'scene:IntroWall', payload: 'transition=Fade' },
              { label: 'Blackout -> intro', actionKind: 'lights', transport: 'bridge', target: 'qlc:scene/opening', payload: 'fade=2500' }
            ]
          },
          {
            name: 'Tema principal',
            mode: 'concert',
            color: '#00d5ff',
            cueStack: [
              { label: 'Lanzar letra gemelo', actionKind: 'teleprompter', transport: 'bridge', target: 'twin:start', payload: 'songPackage=main' },
              { label: 'Snapshot mixer', actionKind: 'mixer', transport: 'bridge', target: 'mixer:snapshot/main-song', payload: 'recall=true' },
              { label: 'Escena de luces', actionKind: 'lights', transport: 'bridge', target: 'qlc:scene/main-song', payload: 'bpm=128' }
            ]
          },
          {
            name: 'Finale',
            mode: 'concert',
            color: '#ef4444',
            cueStack: [
              { label: 'Audience cam', actionKind: 'obs', transport: 'obs-websocket', target: 'scene:Crowd', payload: 'transition=Cut' },
              { label: 'Blinders finale', actionKind: 'lights', transport: 'bridge', target: 'qlc:scene/finale', payload: 'intensity=100' }
            ]
          }
        ]
      });
    }

    if (preset === 'rehearsal') {
      return showScenes.normalize({
        name: 'Ensayo Tecnico',
        venueType: 'rehearsal',
        notes: 'Preset ligero para probar mappings, letras y cue stack.',
        scenes: [
          {
            name: 'Line Check',
            mode: 'rehearsal',
            color: '#a855f7',
            cueStack: [
              { label: 'Test mixer', actionKind: 'mixer', transport: 'bridge', target: 'mixer:line-check', payload: 'channels=all' },
              { label: 'Test teleprompter', actionKind: 'teleprompter', transport: 'browser', target: 'lyrics-preview', payload: 'scroll=manual' }
            ]
          }
        ]
      });
    }

    return showScenes.normalize({
      name: 'Bar Karaoke + DJ',
      venueType: 'bar-karaoke',
      notes: 'Preset mixto para karaoke, DJ pads, teleprompter y show ligero.',
      scenes: [
        {
          name: 'Bienvenida',
          mode: 'karaoke',
          color: '#22c55e',
          cueStack: [
            { label: 'Abrir TV karaoke', actionKind: 'teleprompter', transport: 'browser', target: 'display:main', payload: 'open=true' },
            { label: 'Warm lights', actionKind: 'lights', transport: 'bridge', target: 'qlc:scene/welcome', payload: 'fade=2000' }
          ]
        },
        {
          name: 'Cantante en vivo',
          mode: 'karaoke',
          color: '#00d5ff',
          cueStack: [
            { label: 'Cargar gemelo', actionKind: 'teleprompter', transport: 'bridge', target: 'twin:load-current', payload: 'followClock=true' },
            { label: 'Subir reverb vocal', actionKind: 'mixer', transport: 'bridge', target: 'mixer:vocal-fx', payload: 'reverb=35' }
          ]
        },
        {
          name: 'Break DJ',
          mode: 'dj',
          color: '#ff006e',
          cueStack: [
            { label: 'Pad aplausos', actionKind: 'sfx', transport: 'browser', target: 'applause', payload: '' },
            { label: 'Chase break', actionKind: 'lights', transport: 'bridge', target: 'qlc:chaser/break', payload: 'speed=medium' }
          ]
        }
      ]
    });
  };

  showScenes.listLocal = function() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw)
        .map((item) => showScenes.normalize(item))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  };

  showScenes.saveLocal = function(show) {
    const normalized = showScenes.normalize(show);
    normalized.updatedAt = now();
    const list = showScenes.listLocal().filter((item) => item.id !== normalized.id);
    list.unshift(normalized);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 80)));
    return showScenes.normalize(normalized);
  };

  showScenes.removeLocal = function(showId) {
    const list = showScenes.listLocal().filter((item) => item.id !== cleanString(showId));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  showScenes.describeCue = function(cue) {
    const normalized = normalizeCue(cue, 0);
    return [
      normalized.actionKind.toUpperCase(),
      normalized.target || 'sin target',
      normalized.delayMs > 0 ? ('+' + String(normalized.delayMs) + 'ms') : 'ahora'
    ].join(' · ');
  };

  showScenes.removeCue = function(show, sceneId, cueId) {
    const normalizedShow = showScenes.normalize(show);
    normalizedShow.scenes = normalizedShow.scenes.map((scene) => {
      if (scene.id !== cleanString(sceneId)) return scene;
      scene.cueStack = scene.cueStack
        .filter((cue) => cue.id !== cleanString(cueId))
        .map((cue, index) => normalizeCue(cue, index));
      return scene;
    });
    return showScenes.normalize(normalizedShow);
  };

  showScenes.removeMapping = function(show, mappingId) {
    const normalizedShow = showScenes.normalize(show);
    normalizedShow.mappings = normalizedShow.mappings
      .filter((mapping) => mapping.id !== cleanString(mappingId))
      .map((mapping, index) => normalizeMapping(mapping, index));
    return showScenes.normalize(normalizedShow);
  };

  showScenes.clone = function(show) {
    return clone(showScenes.normalize(show));
  };
})(window.VibeFlow);

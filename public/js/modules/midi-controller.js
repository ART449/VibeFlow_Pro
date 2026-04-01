/**
 * MIDI Controller — ByFlow DJ Mixer
 * Conecta controladores DJ fisicos (Pioneer, Hercules, Numark, Behringer, Yamaha)
 * via Web MIDI API. Mapeo automatico + mapeo custom.
 *
 * Compatible con cualquier controlador MIDI USB/BT que mande CC, Note On/Off.
 */
(function(VF) {
  'use strict';
  VF.modules = VF.modules || {};
  var midi = VF.modules.midiController = {};

  // ═══ STATE ═══
  var _midiAccess = null;
  var _inputs = [];
  var _connected = false;
  var _learning = false;
  var _learnTarget = null;
  var _mapping = {};
  var _lastCC = {};

  // ═══ DEFAULT MAPPINGS (common DJ controllers) ═══
  // Format: { 'cc-CHANNEL-CC_NUMBER': 'action' }
  // These cover most generic MIDI DJ controllers
  var DEFAULT_MAPPINGS = {
    // ── Crossfader (usually CC 7 or CC 1 on channel 0) ──
    'cc-0-7': 'crossfade',
    'cc-0-1': 'crossfade',

    // ── Deck A (channel 0, low CCs) ──
    'cc-0-16': 'a-volume',      // Volume fader A
    'cc-0-17': 'a-eq-low',      // EQ Low A
    'cc-0-18': 'a-eq-mid',      // EQ Mid A
    'cc-0-19': 'a-eq-high',     // EQ High A
    'note-0-36': 'a-play',      // Play/Pause A (pad/button)
    'note-0-37': 'a-cue',       // CUE A
    'note-0-38': 'a-hot1',      // Hot Cue 1 A
    'note-0-39': 'a-hot2',      // Hot Cue 2 A
    'note-0-40': 'a-kill-low',  // Kill Low A
    'note-0-41': 'a-kill-mid',  // Kill Mid A
    'note-0-42': 'a-kill-high', // Kill High A
    'cc-0-20': 'a-pitch',       // Pitch/tempo bend A

    // ── Deck B (channel 1 or higher CCs on channel 0) ──
    'cc-1-16': 'b-volume',
    'cc-0-22': 'b-volume',
    'cc-1-17': 'b-eq-low',
    'cc-0-23': 'b-eq-low',
    'cc-1-18': 'b-eq-mid',
    'cc-0-24': 'b-eq-mid',
    'cc-1-19': 'b-eq-high',
    'cc-0-25': 'b-eq-high',
    'note-1-36': 'b-play',
    'note-0-44': 'b-play',
    'note-1-37': 'b-cue',
    'note-0-45': 'b-cue',
    'note-1-38': 'b-hot1',
    'note-0-46': 'b-hot1',
    'note-1-39': 'b-hot2',
    'note-0-47': 'b-hot2',
    'note-1-40': 'b-kill-low',
    'note-1-41': 'b-kill-mid',
    'note-1-42': 'b-kill-high',

    // ── Global ──
    'note-0-48': 'sync',         // Sync button
    'note-0-49': 'autodj-toggle', // AutoDJ toggle
    'note-0-50': 'autodj-next',  // Skip to next (AutoDJ)

    // ── Pioneer DDJ common mappings ──
    'cc-0-54': 'crossfade',     // Pioneer crossfader
    'cc-0-13': 'a-volume',      // Pioneer volume A
    'cc-0-14': 'b-volume',      // Pioneer volume B

    // ── Hercules common mappings ──
    'cc-0-48': 'a-eq-low',
    'cc-0-49': 'a-eq-mid',
    'cc-0-50': 'a-eq-high',
    'cc-0-51': 'b-eq-low',
    'cc-0-52': 'b-eq-mid',
    'cc-0-53': 'b-eq-high',
  };

  // ═══ INIT ═══
  midi.init = async function() {
    if (!navigator.requestMIDIAccess) {
      console.warn('[MIDI] Web MIDI API no soportado en este navegador');
      return false;
    }

    try {
      _midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      _scanInputs();

      // Listen for connect/disconnect
      _midiAccess.onstatechange = function(e) {
        _scanInputs();
        if (e.port.state === 'connected' && e.port.type === 'input') {
          showToast('🎛️ MIDI conectado: ' + e.port.name);
        } else if (e.port.state === 'disconnected' && e.port.type === 'input') {
          showToast('🎛️ MIDI desconectado: ' + e.port.name);
        }
        _updateMidiUI();
      };

      // Load saved mapping
      _loadMapping();
      _injectMidiUI();

      return true;
    } catch (e) {
      console.error('[MIDI] Error:', e.message);
      return false;
    }
  };

  // ═══ SCAN INPUTS ═══
  function _scanInputs() {
    _inputs = [];
    if (!_midiAccess) return;

    _midiAccess.inputs.forEach(function(input) {
      _inputs.push({
        id: input.id,
        name: input.name,
        manufacturer: input.manufacturer,
        state: input.state
      });

      // Attach message handler
      input.onmidimessage = _handleMIDI;
    });

    _connected = _inputs.length > 0;
  }

  // ═══ MIDI MESSAGE HANDLER ═══
  function _handleMIDI(msg) {
    var data = msg.data;
    if (!data || data.length < 2) return;

    var status = data[0];
    var type = status >> 4;     // 8=noteOff, 9=noteOn, 11=CC, 14=pitchBend
    var channel = status & 0x0F;
    var param = data[1];        // note number or CC number
    var value = data.length > 2 ? data[2] : 0; // velocity or CC value

    var key = '';
    if (type === 11) {
      // CC (Control Change)
      key = 'cc-' + channel + '-' + param;
      _lastCC[key] = value;
    } else if (type === 9 && value > 0) {
      // Note On
      key = 'note-' + channel + '-' + param;
    } else if (type === 8 || (type === 9 && value === 0)) {
      // Note Off — ignore for now
      return;
    } else {
      return;
    }

    // MIDI Learn mode
    if (_learning && _learnTarget) {
      _mapping[key] = _learnTarget;
      _learning = false;
      _learnTarget = null;
      _saveMapping();
      showToast('🎛️ Mapeado: ' + key + ' → ' + _mapping[key]);
      _updateMidiUI();
      return;
    }

    // Execute mapped action
    var action = _mapping[key] || DEFAULT_MAPPINGS[key];
    if (action) {
      _executeAction(action, value, type === 11);
    }

    // Update monitor
    _updateMonitor(key, value);
  }

  // ═══ ACTION EXECUTOR ═══
  function _executeAction(action, value, isCC) {
    var mixer = VF.modules.djMixer;
    var autoDJ = VF.modules.autoDJ;
    if (!mixer) return;

    // CC value 0-127 → normalize to 0-1
    var norm = value / 127;
    // CC value → EQ range -12 to +12
    var eqVal = (norm * 24) - 12;

    switch (action) {
      // ── Crossfader ──
      case 'crossfade':
        mixer.setCrossfade(norm);
        var cf = document.getElementById('dj-crossfader');
        if (cf) cf.value = Math.round(norm * 100);
        break;

      // ── Deck A ──
      case 'a-play':     mixer.deckToggle('a'); break;
      case 'a-cue':      mixer.deckCue('a'); break;
      case 'a-hot1':     mixer.deckHotCue('a', 0); break;
      case 'a-hot2':     mixer.deckHotCue('a', 1); break;
      case 'a-volume':   mixer.deckVol('a', norm); _syncSlider('a', 'vol', norm * 100); break;
      case 'a-eq-low':   mixer.deckEQ('a', 'low', eqVal); _syncSlider('a', 'low', eqVal); break;
      case 'a-eq-mid':   mixer.deckEQ('a', 'mid', eqVal); _syncSlider('a', 'mid', eqVal); break;
      case 'a-eq-high':  mixer.deckEQ('a', 'high', eqVal); _syncSlider('a', 'high', eqVal); break;
      case 'a-kill-low': mixer.deckKill('a', 'low'); break;
      case 'a-kill-mid': mixer.deckKill('a', 'mid'); break;
      case 'a-kill-high':mixer.deckKill('a', 'high'); break;
      case 'a-pitch':    if (mixer.getDeck('a')) mixer.getDeck('a').audio.playbackRate = 0.5 + norm; break;

      // ── Deck B ──
      case 'b-play':     mixer.deckToggle('b'); break;
      case 'b-cue':      mixer.deckCue('b'); break;
      case 'b-hot1':     mixer.deckHotCue('b', 0); break;
      case 'b-hot2':     mixer.deckHotCue('b', 1); break;
      case 'b-volume':   mixer.deckVol('b', norm); _syncSlider('b', 'vol', norm * 100); break;
      case 'b-eq-low':   mixer.deckEQ('b', 'low', eqVal); _syncSlider('b', 'low', eqVal); break;
      case 'b-eq-mid':   mixer.deckEQ('b', 'mid', eqVal); _syncSlider('b', 'mid', eqVal); break;
      case 'b-eq-high':  mixer.deckEQ('b', 'high', eqVal); _syncSlider('b', 'high', eqVal); break;
      case 'b-kill-low': mixer.deckKill('b', 'low'); break;
      case 'b-kill-mid': mixer.deckKill('b', 'mid'); break;
      case 'b-kill-high':mixer.deckKill('b', 'high'); break;

      // ── Global ──
      case 'sync':          mixer.sync(); break;
      case 'autodj-toggle': if (autoDJ) autoDJ.toggle(); break;
      case 'autodj-next':   break; // future: skip track
    }
  }

  function _syncSlider(deckId, type, value) {
    var deck = document.getElementById('dj-deck-' + deckId);
    if (!deck) return;
    var slider;
    if (type === 'vol') {
      slider = deck.querySelector('.dj-vol input[type="range"]');
    } else {
      var bands = deck.querySelectorAll('.dj-eq-band');
      var idx = type === 'low' ? 0 : type === 'mid' ? 1 : 2;
      if (bands[idx]) slider = bands[idx].querySelector('input[type="range"]');
    }
    if (slider) slider.value = Math.round(value);
  }

  // ═══ MIDI LEARN ═══
  midi.startLearn = function(targetAction) {
    _learning = true;
    _learnTarget = targetAction;
    showToast('🎛️ Mueve el control que quieres asignar a: ' + targetAction);
    _updateMidiUI();
  };

  midi.cancelLearn = function() {
    _learning = false;
    _learnTarget = null;
    _updateMidiUI();
  };

  // ═══ MAPPING PERSISTENCE ═══
  function _saveMapping() {
    try {
      localStorage.setItem('byflow_midi_mapping', JSON.stringify(_mapping));
    } catch (_) {}
  }

  function _loadMapping() {
    try {
      var saved = localStorage.getItem('byflow_midi_mapping');
      if (saved) _mapping = JSON.parse(saved);
    } catch (_) {}
  }

  midi.resetMapping = function() {
    _mapping = {};
    localStorage.removeItem('byflow_midi_mapping');
    showToast('Mapeo MIDI reseteado a defaults');
    _updateMidiUI();
  };

  // ═══ STATUS ═══
  midi.isConnected = function() { return _connected; };
  midi.getInputs = function() { return _inputs; };
  midi.getMapping = function() { return Object.assign({}, DEFAULT_MAPPINGS, _mapping); };

  // ═══ MONITOR ═══
  function _updateMonitor(key, value) {
    var mon = document.getElementById('midi-monitor');
    if (!mon) return;
    var line = key + ' = ' + value;
    mon.textContent = line;
    mon.style.color = '#00f5a0';
    setTimeout(function() { mon.style.color = 'rgba(255,255,255,.3)'; }, 300);
  }

  // ═══ UI ═══
  function _injectMidiUI() {
    if (document.getElementById('midi-panel')) return;

    var panel = document.createElement('div');
    panel.id = 'midi-panel';
    panel.className = 'midi-panel';
    panel.innerHTML = ''
      + '<div class="midi-header">'
      + '  <span>🎛️ MIDI</span>'
      + '  <span class="midi-status" id="midi-status">' + (_connected ? '🟢 Conectado' : '🔴 Sin controlador') + '</span>'
      + '</div>'
      + '<div class="midi-devices" id="midi-devices">'
      + (_inputs.length ? _inputs.map(function(i) { return '<div class="midi-device">' + i.name + ' <small>(' + (i.manufacturer || 'Generic') + ')</small></div>'; }).join('') : '<div class="midi-none">Conecta un controlador MIDI USB</div>')
      + '</div>'
      + '<div class="midi-monitor-wrap">'
      + '  <span class="midi-monitor-label">Ultimo:</span>'
      + '  <span class="midi-monitor" id="midi-monitor">—</span>'
      + '</div>'
      + '<div class="midi-actions">'
      + '  <button class="midi-btn" onclick="midiResetMapping()">Reset Mapeo</button>'
      + '  <button class="midi-btn" onclick="midiRefresh()">Buscar Dispositivos</button>'
      + '</div>';

    var djPanel = document.getElementById('dj-mixer-panel');
    if (djPanel) djPanel.appendChild(panel);
  }

  function _updateMidiUI() {
    var statusEl = document.getElementById('midi-status');
    if (statusEl) statusEl.textContent = _connected ? '🟢 ' + _inputs[0].name : '🔴 Sin controlador';

    var devicesEl = document.getElementById('midi-devices');
    if (devicesEl) {
      devicesEl.innerHTML = _inputs.length
        ? _inputs.map(function(i) { return '<div class="midi-device">' + i.name + ' <small>(' + (i.manufacturer || 'Generic') + ')</small></div>'; }).join('')
        : '<div class="midi-none">Conecta un controlador MIDI USB</div>';
    }
  }

  // ═══ PUBLIC ═══
  midi.refresh = function() {
    _scanInputs();
    _updateMidiUI();
    showToast(_connected ? '🎛️ ' + _inputs.length + ' dispositivo(s) MIDI' : '🎛️ No se encontraron controladores MIDI');
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { midi.init(); });
  } else {
    setTimeout(function() { midi.init(); }, 600);
  }

})(window.VibeFlow = window.VibeFlow || {});

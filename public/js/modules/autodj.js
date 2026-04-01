/**
 * AutoDJ / GFlow DJ — ByFlow
 * DJ automático con estilos aprendidos de DJs famosos.
 * Controla el DJ Mixer (dj-mixer.js) con lógica de transición inteligente.
 *
 * Estilos: tiesto, carlcox, djsnake, chill, art-atr, custom
 */
(function(VF) {
  'use strict';
  VF.modules = VF.modules || {};
  var auto = VF.modules.autoDJ = {};

  // ═══ DJ STYLES (patrones aprendidos) ═══
  var STYLES = {
    tiesto: {
      name: 'Tiësto',
      emoji: '🦁',
      description: 'EDM progresivo, builds largos, drops epicos',
      bpmRange: [124, 132],
      trackDuration: [180, 300],       // 3-5 min por track
      transitionDuration: [16, 32],    // 16-32 beats de transicion
      transitionType: ['crossfade', 'eqswap', 'echo'],
      energyCurve: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.7, 0.8, 1.0, 0.6], // build-drop-build
      eqStyle: { cutLowOnIncoming: true, buildWithHighs: true },
      genreProgression: ['progressive-house', 'electro', 'big-room', 'trance', 'progressive-house'],
      dropIntensity: 0.9,
      breakdownLength: [8, 16],        // 8-16 beats
    },
    carlcox: {
      name: 'Carl Cox',
      emoji: '👑',
      description: 'Techno puro, transiciones largas, EQ mixing',
      bpmRange: [126, 136],
      trackDuration: [240, 420],       // 4-7 min
      transitionDuration: [32, 64],    // transiciones LARGAS
      transitionType: ['eqswap', 'crossfade'],
      energyCurve: [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.8, 0.75, 0.7, 0.65],
      eqStyle: { cutLowOnIncoming: true, swapBass: true, longBlend: true },
      genreProgression: ['techno', 'tech-house', 'acid', 'techno', 'minimal'],
      dropIntensity: 0.6,
      breakdownLength: [4, 8],
    },
    djsnake: {
      name: 'DJ Snake',
      emoji: '🐍',
      description: 'Trap/reggaeton, cuts rapidos, drops agresivos',
      bpmRange: [90, 150],
      trackDuration: [120, 210],       // 2-3.5 min (cortos)
      transitionDuration: [4, 16],     // transiciones RAPIDAS
      transitionType: ['cut', 'echo', 'backspin'],
      energyCurve: [0.7, 0.9, 1.0, 0.5, 0.8, 1.0, 0.6, 1.0, 0.9, 0.7],
      eqStyle: { cutLowOnIncoming: false, hardCuts: true },
      genreProgression: ['trap', 'reggaeton', 'moombahton', 'dubstep', 'pop'],
      dropIntensity: 1.0,
      breakdownLength: [2, 4],
    },
    chill: {
      name: 'Chill Vibes',
      emoji: '🌊',
      description: 'Lo-fi, ambient, transiciones de 30s, todo suave',
      bpmRange: [65, 90],
      trackDuration: [180, 360],
      transitionDuration: [32, 64],
      transitionType: ['crossfade'],
      energyCurve: [0.3, 0.35, 0.4, 0.45, 0.5, 0.45, 0.4, 0.35, 0.3, 0.3],
      eqStyle: { cutLowOnIncoming: false, gentleFade: true },
      genreProgression: ['lofi', 'jazz', 'ambient', 'neo-soul', 'lofi'],
      dropIntensity: 0.1,
      breakdownLength: [0, 0],
    },
    'art-atr': {
      name: 'ArT-AtR',
      emoji: '🐝',
      description: 'Hip-hop/trap mexicano, mezcla de generos, impredecible',
      bpmRange: [80, 150],
      trackDuration: [150, 270],
      transitionDuration: [8, 24],
      transitionType: ['crossfade', 'cut', 'echo', 'eqswap'],
      energyCurve: [0.5, 0.7, 0.9, 0.4, 0.8, 1.0, 0.3, 0.9, 0.7, 0.5],
      eqStyle: { cutLowOnIncoming: true, hardCuts: false },
      genreProgression: ['hip-hop', 'trap', 'reggaeton', 'rnb', 'drill', 'corrido', 'lofi'],
      dropIntensity: 0.8,
      breakdownLength: [4, 8],
    }
  };

  // ═══ STATE ═══
  var _active = false;
  var _currentStyle = 'art-atr';
  var _playlist = [];
  var _currentTrackIdx = 0;
  var _transitionTimer = null;
  var _activeDeck = 'a';
  var _energyIdx = 0;
  var _transitionsCount = 0;

  // ═══ INIT ═══
  auto.init = function() {
    _injectAutoDJUI();
  };

  // ═══ STYLE MANAGEMENT ═══
  auto.setStyle = function(styleId) {
    if (!STYLES[styleId]) return;
    _currentStyle = styleId;
    var s = STYLES[styleId];
    showToast(s.emoji + ' Estilo: ' + s.name + ' — ' + s.description);
    _updateStyleUI();
  };

  auto.getStyle = function() { return STYLES[_currentStyle]; };
  auto.getStyleList = function() { return STYLES; };

  // ═══ PLAYLIST ═══
  auto.setPlaylist = function(tracks) {
    _playlist = tracks; // [{url, name, genre, bpm}]
    _currentTrackIdx = 0;
    _updatePlaylistUI();
  };

  auto.addToPlaylist = function(track) {
    _playlist.push(track);
    _updatePlaylistUI();
  };

  auto.loadFilesToPlaylist = function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = function() {
      var files = Array.from(input.files || []);
      files.forEach(function(f) {
        _playlist.push({
          url: URL.createObjectURL(f),
          name: f.name.replace(/\.[^.]+$/, ''),
          genre: 'unknown',
          bpm: 0,
          file: f
        });
      });
      _updatePlaylistUI();
      showToast(files.length + ' tracks agregados a la playlist');
    };
    input.click();
  };

  // ═══ AUTO MIX ENGINE ═══
  auto.start = function() {
    if (_playlist.length < 2) {
      showToast('Necesitas al menos 2 tracks en la playlist');
      return;
    }
    _active = true;
    _activeDeck = 'a';
    _energyIdx = 0;
    _transitionsCount = 0;

    // Load first track on deck A
    var mixer = VF.modules.djMixer;
    var trackA = _playlist[0];
    mixer.getDeck('a').loadTrack(trackA.url, trackA.name);
    mixer.getDeck('a').play();
    mixer.setCrossfade(0); // full A

    _currentTrackIdx = 0;
    _scheduleNextTransition();

    showToast('🤖 AutoDJ: ' + STYLES[_currentStyle].emoji + ' ' + STYLES[_currentStyle].name + ' — Mezclando ' + _playlist.length + ' tracks');
    _updateAutoDJUI();
  };

  auto.stop = function() {
    _active = false;
    clearTimeout(_transitionTimer);
    showToast('AutoDJ detenido');
    _updateAutoDJUI();
  };

  auto.isActive = function() { return _active; };

  // ═══ TRANSITION LOGIC ═══
  function _scheduleNextTransition() {
    if (!_active) return;

    var style = STYLES[_currentStyle];
    var minDur = style.trackDuration[0] * 1000;
    var maxDur = style.trackDuration[1] * 1000;
    var trackPlaytime = minDur + Math.random() * (maxDur - minDur);

    // Adjust based on energy curve
    var energy = style.energyCurve[_energyIdx % style.energyCurve.length];
    // High energy = shorter tracks, low energy = longer
    trackPlaytime = trackPlaytime * (1.5 - energy);

    _transitionTimer = setTimeout(function() {
      _executeTransition();
    }, trackPlaytime);
  }

  function _executeTransition() {
    if (!_active) return;
    var mixer = VF.modules.djMixer;
    var style = STYLES[_currentStyle];

    // Next track
    _currentTrackIdx = (_currentTrackIdx + 1) % _playlist.length;
    var nextTrack = _playlist[_currentTrackIdx];
    var incomingDeck = _activeDeck === 'a' ? 'b' : 'a';

    // Load next track on incoming deck
    mixer.getDeck(incomingDeck).loadTrack(nextTrack.url, nextTrack.name);

    // Pick transition type
    var transTypes = style.transitionType;
    var transType = transTypes[Math.floor(Math.random() * transTypes.length)];

    // Transition duration
    var minTrans = style.transitionDuration[0] * 500; // in ms (beats * ~500ms at 120bpm)
    var maxTrans = style.transitionDuration[1] * 500;
    var transDuration = minTrans + Math.random() * (maxTrans - minTrans);

    // EQ prep: cut low on incoming
    if (style.eqStyle.cutLowOnIncoming) {
      mixer.getDeck(incomingDeck).setEQ('low', -24);
    }

    // Start incoming
    mixer.getDeck(incomingDeck).play();

    // Execute transition based on type
    switch (transType) {
      case 'crossfade':
        _crossfadeTransition(incomingDeck, transDuration, style);
        break;
      case 'eqswap':
        _eqSwapTransition(incomingDeck, transDuration, style);
        break;
      case 'cut':
        _cutTransition(incomingDeck, style);
        break;
      case 'echo':
        _echoTransition(incomingDeck, transDuration, style);
        break;
      default:
        _crossfadeTransition(incomingDeck, transDuration, style);
    }

    _transitionsCount++;
    _energyIdx++;
    _activeDeck = incomingDeck;

    // Schedule next
    _scheduleNextTransition();
  }

  // ═══ UI SYNC — Mover sliders visualmente como Yamaha ═══
  function _syncSliderUI(selector, value) {
    var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el && el.tagName === 'INPUT') {
      el.value = value;
      // Trigger visual update + glow effect
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow = '0 0 8px rgba(251,191,36,.4)';
      setTimeout(function() { el.style.boxShadow = ''; }, 300);
    }
  }

  function _syncCrossfaderUI(value) {
    var cf = document.getElementById('dj-crossfader');
    if (cf) {
      cf.value = Math.round(value * 100);
      // Glow on crossfader track
      var track = cf.parentElement;
      if (track) {
        track.style.transition = 'filter 0.2s';
        track.style.filter = 'brightness(1.5)';
        setTimeout(function() { track.style.filter = ''; }, 200);
      }
    }
  }

  function _syncEQUI(deckId, band, db) {
    // Find the EQ slider for this deck/band
    var deck = document.getElementById('dj-deck-' + deckId);
    if (!deck) return;
    var bands = deck.querySelectorAll('.dj-eq-band');
    var idx = band === 'low' ? 0 : band === 'mid' ? 1 : 2;
    if (bands[idx]) {
      var slider = bands[idx].querySelector('input[type="range"]');
      _syncSliderUI(slider, Math.round(db));

      // Kill button visual feedback
      var killBtn = bands[idx].querySelector('.dj-kill');
      if (killBtn) {
        var isKilled = db <= -20;
        killBtn.style.background = isKilled ? 'rgba(239,68,68,.4)' : '';
        killBtn.style.color = isKilled ? '#fff' : '';
      }
    }
  }

  function _syncVolumeUI(deckId, vol) {
    var deck = document.getElementById('dj-deck-' + deckId);
    if (!deck) return;
    var volSlider = deck.querySelector('.dj-vol input[type="range"]');
    _syncSliderUI(volSlider, Math.round(vol * 100));
  }

  function _crossfadeTransition(incomingDeck, duration, style) {
    var mixer = VF.modules.djMixer;
    var steps = 40;
    var stepTime = duration / steps;
    var startVal = incomingDeck === 'b' ? 0 : 1;
    var endVal = incomingDeck === 'b' ? 1 : 0;

    var step = 0;
    var interval = setInterval(function() {
      step++;
      var progress = step / steps;
      // Smooth S-curve for more natural feel
      var curve = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      var val = startVal + (endVal - startVal) * curve;
      mixer.setCrossfade(val);
      _syncCrossfaderUI(val);

      // Restore EQ on incoming at 60%
      if (step === Math.floor(steps * 0.6) && style.eqStyle.cutLowOnIncoming) {
        mixer.getDeck(incomingDeck).setEQ('low', 0);
        _syncEQUI(incomingDeck, 'low', 0);
      }

      if (step >= steps) {
        clearInterval(interval);
        var outgoing = incomingDeck === 'a' ? 'b' : 'a';
        mixer.getDeck(outgoing).pause();
      }
    }, stepTime);
  }

  function _eqSwapTransition(incomingDeck, duration, style) {
    var mixer = VF.modules.djMixer;
    var outgoing = incomingDeck === 'a' ? 'b' : 'a';
    var halfDuration = duration / 2;

    // Phase 1: bring in highs of incoming, crossfader center
    mixer.getDeck(incomingDeck).setEQ('high', 0);
    mixer.getDeck(incomingDeck).setEQ('mid', -6);
    mixer.getDeck(incomingDeck).setEQ('low', -24);
    mixer.setCrossfade(0.5);
    _syncEQUI(incomingDeck, 'high', 0);
    _syncEQUI(incomingDeck, 'mid', -6);
    _syncEQUI(incomingDeck, 'low', -24);
    _syncCrossfaderUI(0.5);

    setTimeout(function() {
      // Phase 2: swap bass — incoming gets bass, outgoing loses it
      mixer.getDeck(incomingDeck).setEQ('low', 0);
      mixer.getDeck(incomingDeck).setEQ('mid', 0);
      mixer.getDeck(outgoing).setEQ('low', -24);
      mixer.getDeck(outgoing).setEQ('mid', -6);
      _syncEQUI(incomingDeck, 'low', 0);
      _syncEQUI(incomingDeck, 'mid', 0);
      _syncEQUI(outgoing, 'low', -24);
      _syncEQUI(outgoing, 'mid', -6);
    }, halfDuration);

    setTimeout(function() {
      // Phase 3: kill outgoing highs, then fade out
      mixer.getDeck(outgoing).setEQ('high', -24);
      _syncEQUI(outgoing, 'high', -24);
      setTimeout(function() {
        mixer.getDeck(outgoing).pause();
        mixer.getDeck(outgoing).setEQ('low', 0);
        mixer.getDeck(outgoing).setEQ('mid', 0);
        mixer.getDeck(outgoing).setEQ('high', 0);
        _syncEQUI(outgoing, 'low', 0);
        _syncEQUI(outgoing, 'mid', 0);
        _syncEQUI(outgoing, 'high', 0);
        var finalCf = incomingDeck === 'b' ? 1 : 0;
        mixer.setCrossfade(finalCf);
        _syncCrossfaderUI(finalCf);
      }, 2000);
    }, duration);
  }

  function _cutTransition(incomingDeck, style) {
    var mixer = VF.modules.djMixer;
    var outgoing = incomingDeck === 'a' ? 'b' : 'a';

    // Instant cut — snap all controls
    mixer.getDeck(incomingDeck).setEQ('low', 0);
    _syncEQUI(incomingDeck, 'low', 0);
    var finalCf = incomingDeck === 'b' ? 1 : 0;
    mixer.setCrossfade(finalCf);
    _syncCrossfaderUI(finalCf);
    mixer.getDeck(outgoing).pause();
  }

  function _echoTransition(incomingDeck, duration, style) {
    var mixer = VF.modules.djMixer;

    // Start at center
    mixer.setCrossfade(0.5);
    _syncCrossfaderUI(0.5);
    mixer.getDeck(incomingDeck).setEQ('low', -12);
    _syncEQUI(incomingDeck, 'low', -12);

    // Crossfade with visual sync
    _crossfadeTransition(incomingDeck, duration, style);
  }

  // ═══ GROK INTEGRATION ═══
  auto.askGrokForNext = async function(context) {
    try {
      var prompt = 'Eres GFlow DJ, el DJ inteligente de ByFlow. '
        + 'Estilo actual: ' + STYLES[_currentStyle].name + '. '
        + 'Tracks tocados: ' + _transitionsCount + '. '
        + 'Energia actual: ' + STYLES[_currentStyle].energyCurve[_energyIdx % STYLES[_currentStyle].energyCurve.length] + '. '
        + (context || '')
        + 'Sugiere: 1) siguiente genero, 2) tipo de transicion (crossfade/cut/echo/eqswap), 3) energia (0.1-1.0). Responde en JSON: {"genre":"","transition":"","energy":0.0}';

      var r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt, system: 'Eres un DJ profesional. Responde solo JSON.' })
      });
      var d = await r.json();
      if (d.response) {
        try {
          var parsed = JSON.parse(d.response.replace(/```json?|```/g, '').trim());
          return parsed;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  };

  // ═══ UI ═══
  function _injectAutoDJUI() {
    if (document.getElementById('autodj-panel')) return;

    var styleButtons = Object.keys(STYLES).map(function(id) {
      var s = STYLES[id];
      return '<button class="autodj-style-btn' + (id === _currentStyle ? ' active' : '') + '" data-style="' + id + '" onclick="autoDJSetStyle(\'' + id + '\')">'
        + s.emoji + ' ' + s.name + '</button>';
    }).join('');

    var panel = document.createElement('div');
    panel.id = 'autodj-panel';
    panel.className = 'autodj-panel';
    panel.innerHTML = ''
      + '<div class="autodj-section">'
      + '  <div class="autodj-title">🤖 AutoDJ</div>'
      + '  <div class="autodj-styles">' + styleButtons + '</div>'
      + '  <div class="autodj-playlist" id="autodj-playlist">'
      + '    <div class="autodj-empty">Carga tracks para empezar</div>'
      + '  </div>'
      + '  <div class="autodj-actions">'
      + '    <button class="autodj-btn autodj-load" onclick="autoDJLoadFiles()">📂 Cargar Tracks</button>'
      + '    <button class="autodj-btn autodj-go" id="autodj-toggle" onclick="autoDJToggle()">▶ INICIAR</button>'
      + '  </div>'
      + '  <div class="autodj-status" id="autodj-status"></div>'
      + '</div>';

    // Insert after crossfader in DJ panel
    var djPanel = document.getElementById('dj-mixer-panel');
    if (djPanel) {
      djPanel.appendChild(panel);
    }
  }

  function _updateStyleUI() {
    document.querySelectorAll('.autodj-style-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.style === _currentStyle);
    });
  }

  function _updatePlaylistUI() {
    var el = document.getElementById('autodj-playlist');
    if (!el) return;
    if (!_playlist.length) {
      el.innerHTML = '<div class="autodj-empty">Carga tracks para empezar</div>';
      return;
    }
    el.innerHTML = _playlist.map(function(t, i) {
      var playing = _active && i === _currentTrackIdx;
      return '<div class="autodj-track' + (playing ? ' playing' : '') + '">'
        + '<span class="autodj-track-num">' + (i + 1) + '</span>'
        + '<span class="autodj-track-name">' + (t.name || 'Track') + '</span>'
        + (t.bpm ? '<span class="autodj-track-bpm">' + t.bpm + '</span>' : '')
        + '</div>';
    }).join('');
  }

  function _updateAutoDJUI() {
    var btn = document.getElementById('autodj-toggle');
    if (btn) {
      btn.textContent = _active ? '⏹ DETENER' : '▶ INICIAR';
      btn.classList.toggle('autodj-active', _active);
    }
    var status = document.getElementById('autodj-status');
    if (status) {
      status.textContent = _active
        ? STYLES[_currentStyle].emoji + ' Mezclando — ' + _transitionsCount + ' transiciones'
        : '';
    }
    _updatePlaylistUI();
  }

  // ═══ PUBLIC API ═══
  auto.toggle = function() {
    if (_active) auto.stop();
    else auto.start();
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { auto.init(); });
  } else {
    setTimeout(function() { auto.init(); }, 500);
  }

})(window.VibeFlow = window.VibeFlow || {});

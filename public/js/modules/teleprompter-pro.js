/**
 * ByFlow Teleprompter PRO — Features avanzadas
 * 1. Voice-following scroll (Web Speech API)
 * 2. Countdown 3-2-1
 * 3. Focus line (linea iluminada)
 * 4. Marcadores de escenario [AD-LIB] [HOOK] [RESPIRA] [DROP]
 * 5. Loop mode (auto-restart)
 * 6. Velocidad adaptativa por densidad de linea
 */
(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const tpPro = VF.modules.teleprompterPro = {};

  // ═══════════════════════════════════════════════════════════════════════
  // 1. VOICE-FOLLOWING SCROLL (Web Speech API)
  // ═══════════════════════════════════════════════════════════════════════
  let _recognition = null;
  let _voiceActive = false;
  let _voiceWordBuffer = [];
  const _VOICE_SUPPORTED = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  tpPro.isVoiceSupported = function() { return _VOICE_SUPPORTED; };
  tpPro.isVoiceActive = function() { return _voiceActive; };

  tpPro.toggleVoiceScroll = function() {
    if (_voiceActive) {
      tpPro.stopVoiceScroll();
    } else {
      tpPro.startVoiceScroll();
    }
  };

  tpPro.startVoiceScroll = function() {
    if (!_VOICE_SUPPORTED) {
      showToast('Tu navegador no soporta reconocimiento de voz', 'error');
      return;
    }
    if (!tpState.words.length) {
      showToast('Carga una letra primero', 'warning');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    _recognition = new SpeechRecognition();
    _recognition.continuous = true;
    _recognition.interimResults = true;
    _recognition.lang = 'es-MX';
    _recognition.maxAlternatives = 3;

    _voiceWordBuffer = [];
    _voiceActive = true;
    _updateVoiceBtn();

    _recognition.onresult = function(event) {
      const results = event.results;
      for (let i = event.resultIndex; i < results.length; i++) {
        const transcript = results[i][0].transcript.toLowerCase().trim();
        const spokenWords = transcript.split(/\s+/).filter(function(w) { return w.length > 0; });

        spokenWords.forEach(function(spoken) {
          _matchAndAdvance(spoken);
        });
      }
    };

    _recognition.onerror = function(e) {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.warn('Voice error:', e.error);
      if (e.error === 'not-allowed') {
        showToast('Permite acceso al microfono para usar Voice Scroll', 'error');
        tpPro.stopVoiceScroll();
      }
    };

    _recognition.onend = function() {
      // Auto-restart if still active (speech recognition times out)
      if (_voiceActive && _recognition) {
        try { _recognition.start(); } catch(e) {}
      }
    };

    try {
      _recognition.start();
      showToast('Voice Scroll activado — canta y el teleprompter te sigue', 'success');
    } catch(e) {
      showToast('Error iniciando microfono: ' + e.message, 'error');
      _voiceActive = false;
      _updateVoiceBtn();
    }
  };

  tpPro.stopVoiceScroll = function() {
    _voiceActive = false;
    if (_recognition) {
      try { _recognition.stop(); } catch(e) {}
      _recognition = null;
    }
    _updateVoiceBtn();
    showToast('Voice Scroll desactivado');
  };

  function _normalizeWord(w) {
    return w.toLowerCase()
      .replace(/[.,;:!?¡¿"'()\[\]{}\-—–…]/g, '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function _matchAndAdvance(spokenWord) {
    var normalized = _normalizeWord(spokenWord);
    if (!normalized || normalized.length < 2) return;

    // Search forward from current position
    var searchStart = Math.max(0, tpState.currentIdx);
    var searchEnd = Math.min(searchStart + 20, tpState.words.length);

    for (var i = searchStart; i < searchEnd; i++) {
      var target = _normalizeWord(tpState.words[i]);
      // Fuzzy match: exact, starts-with, or >60% similarity
      if (target === normalized || target.startsWith(normalized) || normalized.startsWith(target)) {
        // Advance to this word and all words before it
        for (var j = tpState.currentIdx + 1; j <= i; j++) {
          window.VibeFlow.modules.lyrics.highlightWord(j);
        }
        return;
      }
    }
  }

  function _updateVoiceBtn() {
    var btn = document.getElementById('btn-voice-scroll');
    if (!btn) return;
    if (_voiceActive) {
      btn.classList.add('voice-active');
      btn.title = 'Voice Scroll ACTIVO — click para desactivar';
    } else {
      btn.classList.remove('voice-active');
      btn.title = 'Voice Scroll — el teleprompter sigue tu voz';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. COUNTDOWN 3-2-1
  // ═══════════════════════════════════════════════════════════════════════
  let _countdownEnabled = true;
  let _countdownTimer = null;

  tpPro.toggleCountdown = function() {
    _countdownEnabled = !_countdownEnabled;
    var btn = document.getElementById('btn-countdown-toggle');
    if (btn) {
      btn.classList.toggle('accent-green', _countdownEnabled);
      btn.title = _countdownEnabled ? 'Countdown 3-2-1 activado' : 'Countdown desactivado';
    }
    showToast('Countdown ' + (_countdownEnabled ? 'activado' : 'desactivado'));
  };

  tpPro.isCountdownEnabled = function() { return _countdownEnabled; };

  tpPro.startWithCountdown = function(callback) {
    if (!_countdownEnabled) {
      callback();
      return;
    }

    // Create overlay
    var overlay = document.createElement('div');
    overlay.id = 'tp-countdown-overlay';
    overlay.className = 'tp-countdown-overlay';
    overlay.innerHTML = '<div class="tp-countdown-number" id="tp-countdown-num">3</div>';
    document.querySelector('.center').appendChild(overlay);

    var count = 3;
    var numEl = document.getElementById('tp-countdown-num');

    function tick() {
      if (count <= 0) {
        overlay.classList.add('tp-countdown-go');
        numEl.textContent = 'GO!';
        numEl.style.color = 'var(--g)';
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          callback();
        }, 400);
        return;
      }
      numEl.textContent = count;
      numEl.classList.remove('tp-countdown-pop');
      void numEl.offsetWidth; // force reflow
      numEl.classList.add('tp-countdown-pop');
      count--;
      _countdownTimer = setTimeout(tick, 800);
    }

    tick();
  };

  tpPro.cancelCountdown = function() {
    clearTimeout(_countdownTimer);
    var overlay = document.getElementById('tp-countdown-overlay');
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 3. FOCUS LINE (linea central iluminada)
  // ═══════════════════════════════════════════════════════════════════════
  let _focusLineEnabled = true;

  tpPro.toggleFocusLine = function() {
    _focusLineEnabled = !_focusLineEnabled;
    var area = document.getElementById('tp-area');
    if (area) {
      area.classList.toggle('tp-focus-line-active', _focusLineEnabled);
    }
    var btn = document.getElementById('btn-focus-line');
    if (btn) btn.classList.toggle('accent-green', _focusLineEnabled);
    showToast('Focus line ' + (_focusLineEnabled ? 'activada' : 'desactivada'));
  };

  tpPro.isFocusLineEnabled = function() { return _focusLineEnabled; };

  // Init focus line on load
  tpPro.initFocusLine = function() {
    var area = document.getElementById('tp-area');
    if (area && _focusLineEnabled) {
      area.classList.add('tp-focus-line-active');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 4. MARCADORES DE ESCENARIO
  // ═══════════════════════════════════════════════════════════════════════
  var MARKERS = {
    '[AD-LIB]':  { color: '#ff6b9d', label: 'AD-LIB', icon: '\uD83C\uDFA4' },
    '[HOOK]':    { color: '#fbbf24', label: 'HOOK',   icon: '\uD83C\uDFB5' },
    '[RESPIRA]': { color: '#34d399', label: 'RESPIRA', icon: '\uD83D\uDCA8' },
    '[DROP]':    { color: '#3a86ff', label: 'DROP',   icon: '\u26A1' },
    '[PAUSA]':   { color: '#a78bfa', label: 'PAUSA',  icon: '\u23F8' },
    '[CORO]':    { color: '#f97316', label: 'CORO',   icon: '\uD83D\uDD01' },
    '[INTRO]':   { color: '#06b6d4', label: 'INTRO',  icon: '\u25B6' },
    '[OUTRO]':   { color: '#ef4444', label: 'OUTRO',  icon: '\u23F9' },
    '[PUENTE]':  { color: '#8b5cf6', label: 'PUENTE', icon: '\uD83C\uDF09' },
    '[VERSO]':   { color: '#10b981', label: 'VERSO',  icon: '\u270D' }
  };

  tpPro.processMarkers = function() {
    var display = document.getElementById('tp-display');
    if (!display) return;

    var lines = display.querySelectorAll('.tp-line');
    lines.forEach(function(lineEl) {
      var text = lineEl.textContent;
      Object.keys(MARKERS).forEach(function(marker) {
        if (text.toUpperCase().indexOf(marker) !== -1) {
          var m = MARKERS[marker];
          lineEl.classList.add('tp-marker-line');
          lineEl.style.setProperty('--marker-color', m.color);

          // Add marker badge if not already there
          if (!lineEl.querySelector('.tp-marker-badge')) {
            var badge = document.createElement('span');
            badge.className = 'tp-marker-badge';
            badge.style.cssText = 'background:' + m.color + '22;color:' + m.color + ';border:1px solid ' + m.color + '44;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;margin-right:8px;letter-spacing:1px;';
            badge.textContent = m.icon + ' ' + m.label;
            lineEl.insertBefore(badge, lineEl.firstChild);
          }

          // Remove the marker text from words
          var words = lineEl.querySelectorAll('.tp-word');
          words.forEach(function(wordEl) {
            var wText = wordEl.textContent.toUpperCase();
            Object.keys(MARKERS).forEach(function(mk) {
              var parts = mk.replace('[', '').replace(']', '');
              if (wText === parts || wText === mk || wText === '[' + parts + ']') {
                wordEl.style.display = 'none';
              }
            });
          });
        }
      });
    });
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 5. LOOP MODE
  // ═══════════════════════════════════════════════════════════════════════
  let _loopEnabled = false;

  tpPro.toggleLoop = function() {
    _loopEnabled = !_loopEnabled;
    var btn = document.getElementById('btn-loop');
    if (btn) btn.classList.toggle('accent-green', _loopEnabled);
    showToast('Loop ' + (_loopEnabled ? 'activado — la letra se repite' : 'desactivado'));
  };

  tpPro.isLoopEnabled = function() { return _loopEnabled; };

  tpPro.handleScrollEnd = function() {
    if (_loopEnabled && tpState.words.length > 0) {
      setTimeout(function() {
        window.VibeFlow.modules.lyrics.tpReset();
        tpPro.startWithCountdown(function() {
          window.VibeFlow.modules.lyrics.startAutoScroll();
        });
      }, 1500);
      return true; // handled
    }
    return false; // not handled
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 6. VELOCIDAD ADAPTATIVA POR DENSIDAD DE LINEA
  // ═══════════════════════════════════════════════════════════════════════
  let _adaptiveSpeedEnabled = true;

  tpPro.toggleAdaptiveSpeed = function() {
    _adaptiveSpeedEnabled = !_adaptiveSpeedEnabled;
    var btn = document.getElementById('btn-adaptive-speed');
    if (btn) btn.classList.toggle('accent-green', _adaptiveSpeedEnabled);
    showToast('Velocidad adaptativa ' + (_adaptiveSpeedEnabled ? 'activada' : 'desactivada'));
  };

  tpPro.isAdaptiveSpeedEnabled = function() { return _adaptiveSpeedEnabled; };

  /**
   * Calculate delay for a line based on word count.
   * More words = more time per line. Returns multiplier.
   */
  tpPro.getLineSpeedMultiplier = function(lineIdx) {
    if (!_adaptiveSpeedEnabled) return 1.0;
    if (!tpState.lines || !tpState.lines[lineIdx]) return 1.0;

    var line = tpState.lines[lineIdx];
    var wordCount = line.words ? line.words.length : 0;

    // Average ~5-7 words per line is "normal" speed
    // Fewer words = faster, more words = slower
    var avgWords = 6;
    if (wordCount <= 2) return 0.6;  // Short line, go fast
    if (wordCount <= 4) return 0.8;
    if (wordCount <= 7) return 1.0;  // Normal
    if (wordCount <= 10) return 1.3; // Dense line
    return 1.5; // Very dense — slow down
  };

  // ═══════════════════════════════════════════════════════════════════════
  // HOOK: Patch toggleAutoScroll to add countdown
  // ═══════════════════════════════════════════════════════════════════════
  var _originalToggle = null;

  tpPro.patchAutoScroll = function() {
    var lyricsModule = VF.modules.lyrics;
    if (!lyricsModule) return;

    // Patch toggleAutoScroll to add countdown
    _originalToggle = lyricsModule.toggleAutoScroll;
    lyricsModule.toggleAutoScroll = function() {
      if (tpState.autoScrolling) {
        // Stopping — no countdown needed
        lyricsModule.stopAutoScroll();
        if (typeof _ytPlayer !== 'undefined' && _ytPlayer && typeof _ytPlayer.pauseVideo === 'function') {
          try { _ytPlayer.pauseVideo(); } catch(e) {}
        }
        var audioBar = document.getElementById('ab-audio');
        if (audioBar && !audioBar.paused) audioBar.pause();
      } else {
        // Starting — add countdown
        tpPro.startWithCountdown(function() {
          lyricsModule.startAutoScroll();
          if (typeof _ytPlayer !== 'undefined' && _ytPlayer && typeof _ytPlayer.playVideo === 'function') {
            try { _ytPlayer.playVideo(); } catch(e) {}
          }
          var audioBar2 = document.getElementById('ab-audio');
          if (audioBar2 && audioBar2.paused && audioBar2.src) audioBar2.play();
        });
      }
    };

    // Patch stopAutoScroll to check loop
    var _originalStop = lyricsModule.stopAutoScroll;
    lyricsModule.stopAutoScroll = function() {
      var wasEnd = tpState.currentIdx >= tpState.words.length - 1;
      _originalStop.call(lyricsModule);
      if (wasEnd) {
        tpPro.handleScrollEnd();
      }
    };

    // Patch buildPlainDisplay and buildLRCDisplay to process markers after
    var _origBuildPlain = lyricsModule.buildPlainDisplay;
    lyricsModule.buildPlainDisplay = function(text, el) {
      _origBuildPlain.call(lyricsModule, text, el);
      setTimeout(function() { tpPro.processMarkers(); }, 50);
    };

    var _origBuildLRC = lyricsModule.buildLRCDisplay;
    lyricsModule.buildLRCDisplay = function(lrcLines, el) {
      _origBuildLRC.call(lyricsModule, lrcLines, el);
      setTimeout(function() { tpPro.processMarkers(); }, 50);
    };
  };

  // ═══════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════
  tpPro.init = function() {
    tpPro.patchAutoScroll();
    tpPro.initFocusLine();
    _injectProControls();
  };

  function _injectProControls() {
    // Add pro buttons to player controls
    var ctrlGroups = document.querySelectorAll('.player-controls .ctrl-group');
    var lastGroup = ctrlGroups[ctrlGroups.length - 1];
    if (!lastGroup || document.getElementById('btn-voice-scroll')) return;

    // Create pro controls group
    var proGroup = document.createElement('div');
    proGroup.className = 'ctrl-group tp-pro-group';
    proGroup.innerHTML =
      // Voice Scroll button
      (_VOICE_SUPPORTED ?
        '<button class="ctrl-btn" id="btn-voice-scroll" onclick="window.VibeFlow.modules.teleprompterPro.toggleVoiceScroll()" title="Voice Scroll — el teleprompter sigue tu voz">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>' +
        '</button>' : '') +
      // Loop button
      '<button class="ctrl-btn" id="btn-loop" onclick="window.VibeFlow.modules.teleprompterPro.toggleLoop()" title="Loop — repetir letra">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>' +
      '</button>' +
      // Countdown toggle
      '<button class="ctrl-btn accent-green" id="btn-countdown-toggle" onclick="window.VibeFlow.modules.teleprompterPro.toggleCountdown()" title="Countdown 3-2-1 activado">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      '</button>';

    lastGroup.parentNode.insertBefore(proGroup, lastGroup.nextSibling);
  }

  // Auto-init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { tpPro.init(); });
  } else {
    setTimeout(function() { tpPro.init(); }, 200);
  }

})(window.VibeFlow);

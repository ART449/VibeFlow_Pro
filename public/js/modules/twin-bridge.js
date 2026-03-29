(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const twinBridge = VF.modules.twinBridge = {};
  const LAST_SESSION_KEY = 'byflow_twin_last_session_v1';

  const state = {
    inited: false,
    sessionId: '',
    transport: null,
    twinWindow: null,
    soundcloudBusy: false,
    lastSentAt: 0,
    lastProgressMs: 0,
    lastDurationMs: 0,
    history: [],
    trackMeta: {
      title: '',
      artist: '',
      sourceKind: '',
      sourceRef: '',
      sourceSongId: '',
      sourceAudioName: ''
    }
  };

  function lrcEngine() {
    return VF.modules.lrcEngine;
  }

  function songPackage() {
    return VF.modules.songPackage;
  }

  function twinSync() {
    return VF.modules.twinSync;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function hasTpState() {
    return typeof tpState !== 'undefined' && tpState;
  }

  function cleanString(value) {
    return String(value || '').trim();
  }

  function ensureGlobals() {
    const defaults = {
      _ytPlayer: null,
      _scWidget: null,
      _playerSyncInterval: null,
      _activePlayerType: null,
      _twinMode: false,
      _playerEndIsCleanup: false,
      _karaokeTwinWin: null,
      jmAudio: null,
      _autoQueueEnabled: localStorage.getItem('byflow_autoqueue') !== '0'
    };

    Object.keys(defaults).forEach((key) => {
      if (typeof window[key] === 'undefined') window[key] = defaults[key];
    });
  }

  function formatPlayerTime(valueMs) {
    const totalSeconds = Math.max(0, Math.floor((Number(valueMs) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ':' + String(seconds).padStart(2, '0');
  }

  function normalizeSourceKind(playerType) {
    const map = {
      youtube: 'youtube',
      soundcloud: 'soundcloud',
      jamendo: 'jamendo',
      local: 'local-audio',
      audio: 'audio-url'
    };
    return map[cleanString(playerType)] || '';
  }

  function currentTitleArtist() {
    const meta = {
      title: cleanString(state.trackMeta.title),
      artist: cleanString(state.trackMeta.artist)
    };

    if (!meta.title) {
      const npTitle = cleanString(el('np-title') && el('np-title').textContent);
      if (npTitle && npTitle !== 'ByFlow') meta.title = npTitle;
    }
    if (!meta.artist) {
      const npArtist = cleanString(el('np-artist') && el('np-artist').textContent);
      if (npArtist && npArtist !== 'Vive Cantando') meta.artist = npArtist;
    }
    if (!meta.title) {
      const nsSong = cleanString(el('ns-song') && el('ns-song').textContent);
      if (nsSong && nsSong !== '-') meta.title = nsSong;
    }

    return meta;
  }

  function rawLyricsText() {
    if (hasTpState() && cleanString(tpState.rawText)) return cleanString(tpState.rawText);
    if (hasTpState() && Array.isArray(tpState.lines) && tpState.lines.length) {
      return tpState.lines.map((line) => cleanString(line.text)).filter(Boolean).join('\n');
    }
    return '';
  }

  function currentPlaybackState() {
    ensureGlobals();

    const playback = {
      currentTimeMs: 0,
      durationMs: state.lastDurationMs || 0,
      playing: !!(hasTpState() && tpState.autoScrolling),
      rate: hasTpState() ? (Number(tpState.speed) || 1) : 1,
      activeLineIndex: hasTpState() ? Number(tpState.currentLine) : -1,
      activeWordIndex: hasTpState() ? Number(tpState.currentIdx) : -1
    };

    if (window._activePlayerType === 'youtube' && window._ytPlayer && typeof _ytPlayer.getCurrentTime === 'function') {
      try {
        playback.currentTimeMs = Math.max(0, Math.round((Number(_ytPlayer.getCurrentTime()) || 0) * 1000));
        playback.durationMs = Math.max(0, Math.round((Number(_ytPlayer.getDuration && _ytPlayer.getDuration()) || 0) * 1000));
        playback.playing = !!(hasTpState() && tpState.autoScrolling);
        playback.rate = 1;
      } catch {}
    } else if (window._activePlayerType === 'soundcloud' && window._scWidget) {
      playback.currentTimeMs = state.lastProgressMs || 0;
      playback.durationMs = state.lastDurationMs || 0;
      playback.playing = !!(hasTpState() && tpState.autoScrolling);
      playback.rate = 1;
    } else if (window._activePlayerType === 'jamendo' && window.jmAudio) {
      playback.currentTimeMs = Math.max(0, Math.round((Number(jmAudio.currentTime) || 0) * 1000));
      playback.durationMs = Number.isFinite(jmAudio.duration) ? Math.max(0, Math.round(jmAudio.duration * 1000)) : 0;
      playback.playing = !jmAudio.paused;
      playback.rate = Number(jmAudio.playbackRate) || 1;
    } else if (window._activePlayerType === 'local' && typeof localAudio !== 'undefined' && localAudio) {
      playback.currentTimeMs = Math.max(0, Math.round((Number(localAudio.currentTime) || 0) * 1000));
      playback.durationMs = Number.isFinite(localAudio.duration) ? Math.max(0, Math.round(localAudio.duration * 1000)) : 0;
      playback.playing = !localAudio.paused;
      playback.rate = Number(localAudio.playbackRate) || 1;
    } else if (window._activePlayerType === 'audio' && typeof abAudio !== 'undefined' && abAudio) {
      playback.currentTimeMs = Math.max(0, Math.round((Number(abAudio.currentTime) || 0) * 1000));
      playback.durationMs = Number.isFinite(abAudio.duration) ? Math.max(0, Math.round(abAudio.duration * 1000)) : 0;
      playback.playing = !abAudio.paused;
      playback.rate = Number(abAudio.playbackRate) || 1;
    } else if (hasTpState() && tpState.isLRC) {
      const liveElapsedMs = tpState.autoScrolling && tpState.startTime > 0
        ? Math.max(0, performance.now() - tpState.startTime)
        : Math.max(0, Number(tpState.pauseOffset) || 0);
      playback.currentTimeMs = Math.round(liveElapsedMs * playback.rate);
      playback.playing = !!tpState.autoScrolling;
    }

    state.lastProgressMs = playback.currentTimeMs;
    if (playback.durationMs > 0) state.lastDurationMs = playback.durationMs;
    return playback;
  }

  function buildCurrentPackage() {
    const lyricsText = rawLyricsText();
    const meta = currentTitleArtist();
    const sourceKind = cleanString(state.trackMeta.sourceKind) || normalizeSourceKind(window._activePlayerType) || 'live-karaoke';

    return songPackage().normalize({
      id: 'live_' + ensureSession(),
      title: meta.title,
      artist: meta.artist,
      sourceSongId: cleanString(state.trackMeta.sourceSongId),
      sourceKind,
      sourceRef: cleanString(state.trackMeta.sourceRef),
      sourceAudioName: cleanString(state.trackMeta.sourceAudioName),
      timingMode: hasTpState() && tpState.isLRC ? 'line' : 'manual',
      globalOffsetMs: hasTpState() ? Math.round((Number(tpState.syncOffset) || 0) * 1000) : 0,
      lyricsPlain: lrcEngine().isLikelyLRC(lyricsText) ? '' : lyricsText,
      lrcText: lrcEngine().isLikelyLRC(lyricsText) ? lyricsText : '',
      cues: lrcEngine().textToCues(lyricsText),
      updatedAt: Date.now()
    });
  }

  function ensureSession() {
    if (state.sessionId) return state.sessionId;
    const cached = localStorage.getItem(LAST_SESSION_KEY);
    state.sessionId = cached || twinSync().createSessionId();
    localStorage.setItem(LAST_SESSION_KEY, state.sessionId);
    return state.sessionId;
  }

  function twinUrl() {
    return location.origin + '/twin-player.html?session=' + encodeURIComponent(ensureSession());
  }

  function ensureTransport() {
    if (state.transport) return state.transport;
    state.transport = twinSync().createTransport(ensureSession());
    return state.transport;
  }

  function syncProgressUi(playback) {
    const info = playback || currentPlaybackState();
    const fill = el('player-progress-fill');
    const current = el('player-time-current');
    const total = el('player-time-total');
    const openBtn = el('btn-open-twin');
    const copyBtn = el('btn-copy-twin');
    let ratio = 0;

    if (info.durationMs > 0) {
      ratio = Math.max(0, Math.min(1, info.currentTimeMs / info.durationMs));
    } else if (hasTpState() && tpState.lines && tpState.lines.length && info.activeLineIndex >= 0) {
      ratio = Math.max(0, Math.min(1, (info.activeLineIndex + 1) / tpState.lines.length));
    }

    if (fill) fill.style.width = (ratio * 100).toFixed(2) + '%';
    if (current) current.textContent = formatPlayerTime(info.currentTimeMs);
    if (total) total.textContent = info.durationMs > 0 ? formatPlayerTime(info.durationMs) : '--:--';

    if (typeof window._waveformSetPlaying === 'function') window._waveformSetPlaying(!!info.playing);

    const meta = currentTitleArtist();
    if (typeof window._waveformUpdateNowPlaying === 'function') {
      window._waveformUpdateNowPlaying(meta.title || 'ByFlow', meta.artist || 'Vive Cantando');
    }

    if (openBtn) {
      openBtn.style.display = 'inline-flex';
      openBtn.title = 'Abrir Twin Player local (sesion ' + ensureSession() + ')';
    }
    if (copyBtn) {
      copyBtn.style.display = 'inline-flex';
      copyBtn.title = 'Copiar link del Twin Player (sesion ' + ensureSession() + ')';
    }
  }

  function syncNow(kind) {
    if (!lrcEngine() || !songPackage() || !twinSync()) return null;

    const now = Date.now();
    if (kind === 'tick' && now - state.lastSentAt < 180) {
      syncProgressUi();
      return null;
    }
    state.lastSentAt = now;

    const playback = currentPlaybackState();
    const payload = songPackage().toTwinPayload(buildCurrentPackage(), playback);
    payload.kind = cleanString(kind) || 'state';
    payload.sessionId = ensureSession();

    ensureTransport().send('state', payload);
    syncProgressUi(playback);
    return payload;
  }

  function updateTwinBadge() {
    const badge = el('tp-mode-badge');
    if (!badge) return;

    const baseLabel = badge.dataset.baseLabel || badge.textContent || '';
    const baseClass = badge.dataset.baseClass || badge.className || '';
    const names = {
      youtube: 'YouTube',
      soundcloud: 'SoundCloud',
      jamendo: 'Jamendo',
      local: 'Audio local',
      audio: 'Audio'
    };

    if (window._twinMode && window._activePlayerType) {
      badge.textContent = 'Gemelo: ' + (names[window._activePlayerType] || window._activePlayerType);
      badge.className = 'tp-lrc-badge lrc';
      return;
    }

    if (baseLabel) badge.textContent = baseLabel;
    if (baseClass) badge.className = baseClass;
  }

  function copyText(value) {
    const text = cleanString(value);
    if (!text) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('Link del gemelo copiado'))
        .catch(() => showToast('No se pudo copiar el link', 'warning'));
      return;
    }

    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      showToast('Link del gemelo copiado');
    } catch {
      showToast('No se pudo copiar el link', 'warning');
    } finally {
      area.remove();
    }
  }

  function renderSessionHistory() {
    const list = el('session-history-list');
    if (!list) return;
    if (!state.history.length) {
      list.innerHTML = '<div style="text-align:center;opacity:.4;">Empieza a cantar para ver tu historial</div>';
      return;
    }

    const icons = {
      youtube: 'YT',
      soundcloud: 'SC',
      jamendo: 'JM',
      local: 'AU',
      audio: 'AU'
    };

    list.innerHTML = state.history.slice().reverse().map((item) =>
      '<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;gap:10px;">' +
        '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          (icons[item.source] || 'MU') + ' ' + escHtml(cleanString(item.title).substring(0, 48)) +
          (item.artist ? ' - ' + escHtml(item.artist) : '') +
        '</span>' +
        '<span style="opacity:.4;flex:none;">' + escHtml(item.time) + '</span>' +
      '</div>'
    ).join('');
  }

  twinBridge.addToHistory = function(title, artist, source) {
    const entry = {
      title: cleanString(title),
      artist: cleanString(artist),
      source: cleanString(source),
      time: new Date().toLocaleTimeString()
    };

    if (!entry.title) return;
    state.history.push(entry);
    state.history = state.history.slice(-100);
    sessionStorage.setItem('bf_history', JSON.stringify(state.history));
    renderSessionHistory();
  };

  twinBridge.setTrackMeta = function(meta) {
    const input = meta || {};
    state.trackMeta = {
      title: cleanString(input.title) || state.trackMeta.title,
      artist: cleanString(input.artist) || state.trackMeta.artist,
      sourceKind: cleanString(input.sourceKind) || state.trackMeta.sourceKind,
      sourceRef: cleanString(input.sourceRef) || state.trackMeta.sourceRef,
      sourceSongId: cleanString(input.sourceSongId) || state.trackMeta.sourceSongId,
      sourceAudioName: cleanString(input.sourceAudioName) || state.trackMeta.sourceAudioName
    };
    syncProgressUi();
    syncNow('track');
  };

  twinBridge.onLyricsChanged = function() {
    syncNow('lyrics');
    updateTwinBadge();
  };

  twinBridge.onSyncOffsetChanged = function() {
    syncNow('offset');
  };

  twinBridge.onCursorChanged = function() {
    syncNow('cursor');
  };

  twinBridge.onAutoScrollChanged = function() {
    syncNow(hasTpState() && tpState.autoScrolling ? 'play' : 'pause');
    updateTwinBadge();
  };

  twinBridge.onPlayerPlay = function(playerType) {
    ensureGlobals();
    window._activePlayerType = cleanString(playerType) || window._activePlayerType;
    window._twinMode = true;

    if (hasTpState() && tpState.words.length > 0 && !tpState.autoScrolling) {
      startAutoScroll();
    } else {
      syncNow('play');
    }

    updateTwinBadge();
    syncProgressUi();
  };

  twinBridge.onPlayerPause = function() {
    ensureGlobals();

    if (window._twinMode && hasTpState() && tpState.autoScrolling) {
      stopAutoScroll();
    } else {
      syncNow('pause');
    }

    updateTwinBadge();
    syncProgressUi();
  };

  twinBridge.onPlayerEnd = function() {
    ensureGlobals();
    window._twinMode = false;
    window._activePlayerType = null;
    twinBridge.stopPlayerSync();

    if (hasTpState() && tpState.autoScrolling) {
      stopAutoScroll();
    } else {
      syncNow('end');
    }

    updateTwinBadge();
    syncProgressUi({
      currentTimeMs: 0,
      durationMs: 0,
      playing: false,
      rate: 1,
      activeLineIndex: hasTpState() ? Number(tpState.currentLine) : -1,
      activeWordIndex: hasTpState() ? Number(tpState.currentIdx) : -1
    });

    if (!window._playerEndIsCleanup && window._autoQueueEnabled && (typeof currentMode === 'undefined' || currentMode !== 'remote')) {
      const next = typeof colaCache !== 'undefined' && Array.isArray(colaCache)
        ? colaCache.find((item) => item.estado === 'esperando')
        : null;
      if (next && typeof siguienteCantante === 'function') {
        setTimeout(() => siguienteCantante(), 2000);
      }
    }
  };

  twinBridge.feedTimeToLRC = function(currentTimeSec) {
    const currentMs = Math.max(0, Math.round((Number(currentTimeSec) || 0) * 1000));
    state.lastProgressMs = currentMs;

    if (!hasTpState() || !tpState.isLRC || !tpState.lrcData || !tpState.autoScrolling) {
      syncNow('tick');
      return;
    }

    const elapsed = (Number(currentTimeSec) || 0) + (Number(tpState.syncOffset) || 0);
    let activeLine = -1;

    for (let i = tpState.lrcData.length - 1; i >= 0; i--) {
      if (elapsed >= tpState.lrcData[i].time) {
        activeLine = i;
        break;
      }
    }

    if (activeLine >= 0 && activeLine !== tpState.currentLine) {
      const line = tpState.lines[activeLine];
      if (line && line.words.length > 0) {
        for (let lineIdx = tpState.currentLine + 1; lineIdx <= activeLine; lineIdx++) {
          const prevLine = tpState.lines[lineIdx];
          if (!prevLine) continue;
          prevLine.words.forEach((word) => {
            const node = document.getElementById('tw-' + word.globalIdx);
            if (node && !node.classList.contains('tp-done')) {
              node.classList.remove('tp-active');
              node.classList.add('tp-done');
            }
          });
        }

        highlightWord(line.words[0].globalIdx);

        if (line.words.length > 1) {
          const nextLineTime = activeLine + 1 < tpState.lrcData.length
            ? tpState.lrcData[activeLine + 1].time
            : tpState.lrcData[activeLine].time + 5;
          const lineDuration = (nextLineTime - tpState.lrcData[activeLine].time) * 1000;
          const wordDelay = lineDuration / line.words.length;

          for (let wordIdx = 1; wordIdx < line.words.length; wordIdx++) {
            setTimeout(() => {
              if (tpState.currentLine === activeLine && tpState.autoScrolling) {
                highlightWord(line.words[wordIdx].globalIdx);
              }
            }, wordDelay * wordIdx);
          }
        }
      }
    }

    syncNow('tick');
  };

  twinBridge.startPlayerSync = function() {
    ensureGlobals();
    twinBridge.stopPlayerSync();

    window._playerSyncInterval = window.setInterval(() => {
      if (window._activePlayerType === 'youtube' && window._ytPlayer && typeof _ytPlayer.getCurrentTime === 'function') {
        try {
          state.lastDurationMs = Math.max(0, Math.round((Number(_ytPlayer.getDuration && _ytPlayer.getDuration()) || 0) * 1000));
          twinBridge.feedTimeToLRC(_ytPlayer.getCurrentTime());
        } catch {
          syncNow('tick');
        }
        return;
      }

      if (window._activePlayerType === 'soundcloud' && window._scWidget) {
        if (state.soundcloudBusy) return;
        state.soundcloudBusy = true;
        try {
          _scWidget.getPosition((pos) => {
            state.lastProgressMs = Math.max(0, Math.round(Number(pos) || 0));
            state.soundcloudBusy = false;
            twinBridge.feedTimeToLRC(state.lastProgressMs / 1000);
          });
          _scWidget.getDuration((duration) => {
            state.lastDurationMs = Math.max(0, Math.round(Number(duration) || 0));
          });
        } catch {
          state.soundcloudBusy = false;
          syncNow('tick');
        }
        return;
      }

      syncNow('tick');
    }, 80);
  };

  twinBridge.stopPlayerSync = function() {
    ensureGlobals();
    if (window._playerSyncInterval) {
      clearInterval(window._playerSyncInterval);
      window._playerSyncInterval = null;
    }
  };

  twinBridge.seekActivePlayerFromEvent = function(event) {
    const track = event && event.currentTarget;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    if (!rect.width) return;

    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const playback = currentPlaybackState();
    if (playback.durationMs <= 0) {
      syncProgressUi(playback);
      return;
    }

    const targetMs = Math.round(playback.durationMs * pct);

    if (window._activePlayerType === 'youtube' && window._ytPlayer && typeof _ytPlayer.seekTo === 'function') {
      try { _ytPlayer.seekTo(targetMs / 1000, true); } catch {}
    } else if (window._activePlayerType === 'soundcloud' && window._scWidget && typeof _scWidget.seekTo === 'function') {
      try { _scWidget.seekTo(targetMs); } catch {}
    } else if (window._activePlayerType === 'jamendo' && window.jmAudio) {
      jmAudio.currentTime = targetMs / 1000;
    } else if (window._activePlayerType === 'local' && typeof localAudio !== 'undefined' && localAudio) {
      localAudio.currentTime = targetMs / 1000;
    } else if (window._activePlayerType === 'audio' && typeof abAudio !== 'undefined' && abAudio) {
      abAudio.currentTime = targetMs / 1000;
    }

    state.lastProgressMs = targetMs;
    syncNow('seek');
  };

  twinBridge.openTwinPlayerDisplay = function() {
    const url = twinUrl();
    syncNow('snapshot');

    if (state.twinWindow && !state.twinWindow.closed) {
      state.twinWindow.focus();
      return;
    }

    state.twinWindow = window.open(url, 'byflow-main-twin-player', 'width=1600,height=900,menubar=no,toolbar=no,location=no,status=no');
    if (!state.twinWindow) showToast('Popup bloqueado', 'warning');
  };

  twinBridge.copyTwinPlayerLink = function() {
    copyText(twinUrl());
  };

  twinBridge.init = function() {
    if (state.inited) return;
    ensureGlobals();
    state.inited = true;
    state.history = JSON.parse(sessionStorage.getItem('bf_history') || '[]');
    renderSessionHistory();
    updateTwinBadge();
    syncProgressUi();

    // Auto-detect YouTube player and start sync
    setInterval(function() {
      if (window._ytPlayer && typeof _ytPlayer.getCurrentTime === 'function' && typeof _ytPlayer.getPlayerState === 'function') {
        try {
          var ytState = _ytPlayer.getPlayerState();
          if (ytState === 1 && !window._twinMode) {
            twinBridge.onPlayerPlay('youtube');
            twinBridge.startPlayerSync();
          }
        } catch(e) {}
      }
    }, 2000);
  };

  ensureGlobals();
  window.addToHistory = twinBridge.addToHistory;
  window.renderSessionHistory = renderSessionHistory;
  window.onPlayerPlay = twinBridge.onPlayerPlay;
  window.onPlayerPause = twinBridge.onPlayerPause;
  window.onPlayerEnd = twinBridge.onPlayerEnd;
  window._startTwinSync = twinBridge.startPlayerSync;
  window._stopTwinSync = twinBridge.stopPlayerSync;
  window._feedTimeToLRC = twinBridge.feedTimeToLRC;
  window.startPlayerSync = twinBridge.startPlayerSync;
  window.stopPlayerSync = twinBridge.stopPlayerSync;
  window.onMusicTimeUpdate = twinBridge.feedTimeToLRC;
  window.updateTwinBadge = updateTwinBadge;
  window.openTwinPlayerDisplay = twinBridge.openTwinPlayerDisplay;
  window.copyTwinPlayerLink = twinBridge.copyTwinPlayerLink;
  window.seekPlayerProgress = twinBridge.seekActivePlayerFromEvent;
})(window.VibeFlow);

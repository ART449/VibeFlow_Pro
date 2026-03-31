(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const lyrics = VF.modules.lyrics = {};

  function notifyTwinBridge(method) {
    const bridge = VF.modules.twinBridge;
    if (!bridge || typeof bridge[method] !== 'function') return;
    bridge[method]();
  }

  function updateSyncLabel() {
    const el = document.getElementById('tp-sync-label');
    if (!el) return;
    const v = tpState.syncOffset;
    el.textContent = (v >= 0 ? '+' : '') + v.toFixed(1) + 's';
    el.className = 'tp-sync-label' + (v < 0 ? ' negative' : v > 0 ? ' positive' : '');
  }

  lyrics.tpSyncNudge = function(delta) {
    tpState.syncOffset = Math.round((tpState.syncOffset + delta) * 10) / 10;
    tpState.syncOffset = Math.max(-30, Math.min(30, tpState.syncOffset));
    updateSyncLabel();
    notifyTwinBridge('onSyncOffsetChanged');
  };

  lyrics.tpSyncReset = function() {
    tpState.syncOffset = 0;
    updateSyncLabel();
    notifyTwinBridge('onSyncOffsetChanged');
  };

  lyrics.parseLRC = function(text) {
    const lines = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    text.split('\n').forEach((line) => {
      const m = line.match(regex);
      if (!m) return;
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      const time = min * 60 + sec + ms / 1000;
      const txt = m[4].trim();
      if (txt) lines.push({ time, text: txt });
    });
    lines.sort((a, b) => a.time - b.time);
    return lines.length > 2 ? lines : null;
  };

  lyrics.setLyrics = function(text) {
    lyrics.stopAutoScroll();
    tpState.rawText = text;
    tpState.currentIdx = -1;
    tpState.currentLine = -1;
    tpState.lrcData = null;
    tpState.isLRC = false;
    tpState.pauseOffset = 0;
    tpState.syncOffset = 0;
    tpState.wordTimingsMs = [];
    tpState.playbackEndMs = 0;
    updateSyncLabel();

    const el = document.getElementById('tp-display');
    const welcome = document.getElementById('tp-welcome');

    if (!text || !text.trim()) {
      if (welcome) welcome.style.display = '';
      lyrics.updateProgress(0);
      lyrics.updateModeBadge();
      notifyTwinBridge('onLyricsChanged');
      return;
    }
    if (welcome) welcome.style.display = 'none';

    const lrc = lyrics.parseLRC(text);
    if (lrc) {
      tpState.isLRC = true;
      tpState.lrcData = lrc;
      lyrics.buildLRCDisplay(lrc, el);
    } else {
      lyrics.buildPlainDisplay(text, el);
    }

    rebuildPlaybackMetrics();
    lyrics.updateWordCounter();
    lyrics.updateProgress(0);
    lyrics.updateModeBadge();
    notifyTwinBridge('onLyricsChanged');
  };

  lyrics.buildLRCDisplay = function(lrcLines, el) {
    tpState.lines = [];
    tpState.words = [];
    _wordToLine = {};
    let globalIdx = 0;

    let html = '';
    lrcLines.forEach((line, li) => {
      const lineWords = line.text.split(/\s+/).filter((w) => w);
      const lineObj = { text: line.text, words: [], lineIdx: li, time: line.time };

      const wordsHtml = lineWords.map((w) => {
        lineObj.words.push({ text: w, globalIdx });
        tpState.words.push(w);
        _wordToLine[globalIdx] = lineObj.lineIdx;
        const h = '<span id="tw-' + globalIdx + '" class="tp-word" onclick="tpClickWord(' + globalIdx + ')">' + escHtml(w) + '</span>';
        globalIdx++;
        return h;
      }).join(' ');

      tpState.lines.push(lineObj);
      html += '<div class="tp-line" id="tl-' + li + '">' + wordsHtml + '</div>';
    });

    el.innerHTML = html;
  };

  lyrics.buildPlainDisplay = function(text, el) {
    tpState.lines = [];
    tpState.words = [];
    _wordToLine = {};
    let globalIdx = 0;

    const rawLines = text.split(/\n/).map((l) => l.trim());
    let html = '';

    rawLines.forEach((line) => {
      if (!line) {
        html += '<div class="tp-line-break"></div>';
        return;
      }
      const lineWords = line.split(/\s+/).filter((w) => w);
      const lineObj = { text: line, words: [], lineIdx: tpState.lines.length };

      const wordsHtml = lineWords.map((w) => {
        lineObj.words.push({ text: w, globalIdx });
        tpState.words.push(w);
        _wordToLine[globalIdx] = lineObj.lineIdx;
        const h = '<span id="tw-' + globalIdx + '" class="tp-word" onclick="tpClickWord(' + globalIdx + ')">' + escHtml(w) + '</span>';
        globalIdx++;
        return h;
      }).join(' ');

      tpState.lines.push(lineObj);
      html += '<div class="tp-line" id="tl-' + lineObj.lineIdx + '">' + wordsHtml + '</div>';
    });

    el.innerHTML = html;
  };

  function clearPlaybackLoop() {
    if (tpState.playbackRafId) {
      cancelAnimationFrame(tpState.playbackRafId);
      tpState.playbackRafId = 0;
    }
  }

  function clearLegacyTimers() {
    clearInterval(tpState.intervalId);
    clearInterval(tpState.lrcTimerId);
    tpState.intervalId = null;
    tpState.lrcTimerId = null;
    clearPlaybackLoop();
  }

  function centerLineInView(lineEl) {
    const area = document.getElementById('tp-area');
    if (!area || !lineEl) return;
    const targetTop = Math.max(0, lineEl.offsetTop - Math.max(40, (area.clientHeight - lineEl.offsetHeight) * 0.5));
    const behavior = Math.abs(area.scrollTop - targetTop) > 24 ? 'smooth' : 'auto';
    area.scrollTo({ top: targetTop, behavior });
  }

  function buildLrcWordTimings() {
    const timings = [];
    tpState.lines.forEach((line, lineIdx) => {
      if (!line || !line.words.length) return;
      const currentLine = tpState.lrcData && tpState.lrcData[lineIdx];
      const nextLine = tpState.lrcData && tpState.lrcData[lineIdx + 1];
      const lineStartMs = Math.max(0, Math.round(Number(currentLine && currentLine.time) * 1000));
      const nextLineMs = nextLine
        ? Math.max(lineStartMs + 180, Math.round(Number(nextLine.time) * 1000))
        : lineStartMs + Math.max(2400, line.words.length * 420);
      const spanMs = Math.max(180, nextLineMs - lineStartMs);

      line.words.forEach((word, wordIdx) => {
        const portion = line.words.length === 1 ? 0 : wordIdx / line.words.length;
        timings[word.globalIdx] = Math.round(lineStartMs + (spanMs * portion));
      });
    });
    return timings.filter((value) => Number.isFinite(value));
  }

  function buildManualWordTimings() {
    const timings = [];
    let cursorMs = 0;

    tpState.lines.forEach((line) => {
      if (!line || !line.words.length) {
        cursorMs += 360;
        return;
      }

      line.words.forEach((word) => {
        timings[word.globalIdx] = Math.round(cursorMs);
        const wordAdvance = 260 + Math.min(420, Math.max(0, String(word.text || '').length - 1) * 26);
        cursorMs += wordAdvance;
      });

      cursorMs += 380;
    });

    return timings.filter((value) => Number.isFinite(value));
  }

  function rebuildPlaybackMetrics() {
    tpState.wordTimingsMs = tpState.isLRC ? buildLrcWordTimings() : buildManualWordTimings();
    tpState.playbackEndMs = tpState.wordTimingsMs.length
      ? tpState.wordTimingsMs[tpState.wordTimingsMs.length - 1] + (tpState.isLRC ? 2200 : 1200)
      : 0;
  }

  function resolveWordIndexAtElapsedMs(elapsedMs) {
    const timings = tpState.wordTimingsMs || [];
    if (!timings.length || elapsedMs < timings[0]) return -1;

    let low = 0;
    let high = timings.length - 1;
    let answer = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (timings[mid] <= elapsedMs) {
        answer = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return answer;
  }

  function currentWordBaseMs() {
    if (tpState.currentIdx >= 0 && tpState.wordTimingsMs && Number.isFinite(tpState.wordTimingsMs[tpState.currentIdx])) {
      return tpState.wordTimingsMs[tpState.currentIdx];
    }
    if (tpState.currentLine >= 0 && tpState.lines[tpState.currentLine] && tpState.lines[tpState.currentLine].words[0]) {
      return tpState.wordTimingsMs[tpState.lines[tpState.currentLine].words[0].globalIdx] || 0;
    }
    return 0;
  }

  function getExternalElapsedMs() {
    if (typeof _ytPlayer !== 'undefined' && _ytPlayer && typeof _ytPlayer.getCurrentTime === 'function') {
      try {
        return Math.max(0, Math.round((Number(_ytPlayer.getCurrentTime()) || 0) * 1000));
      } catch {}
    }

    if (typeof localAudio !== 'undefined' && localAudio && Number.isFinite(localAudio.currentTime)) {
      return Math.max(0, Math.round(localAudio.currentTime * 1000));
    }

    if (typeof jmAudio !== 'undefined' && jmAudio && Number.isFinite(jmAudio.currentTime)) {
      return Math.max(0, Math.round(jmAudio.currentTime * 1000));
    }

    const audioBar = document.getElementById('ab-audio');
    if (audioBar && Number.isFinite(audioBar.currentTime)) {
      return Math.max(0, Math.round(audioBar.currentTime * 1000));
    }

    return null;
  }

  function getInternalElapsedMs() {
    if (tpState.startTime > 0) {
      return Math.max(0, Math.round((performance.now() - tpState.startTime) * (Number(tpState.speed) || 1)));
    }
    return Math.max(0, Math.round(Number(tpState.pauseOffset) || 0));
  }

  function setInternalStartFromMs(startMs) {
    const speed = Math.max(0.2, Number(tpState.speed) || 1);
    tpState.startTime = performance.now() - (Math.max(0, Number(startMs) || 0) / speed);
  }

  function baseElapsedMs() {
    const externalMs = getExternalElapsedMs();
    if (externalMs !== null) return Math.max(0, externalMs);
    return Math.max(0, getInternalElapsedMs());
  }

  function activeElapsedMs() {
    const offsetMs = tpState.isLRC ? Math.round((Number(tpState.syncOffset) || 0) * 1000) : 0;
    return Math.max(0, baseElapsedMs() + offsetMs);
  }

  function syncPlaybackWord(elapsedMs) {
    const nextWordIdx = resolveWordIndexAtElapsedMs(elapsedMs);
    if (nextWordIdx >= 0 && nextWordIdx !== tpState.currentIdx) {
      lyrics.highlightWord(nextWordIdx);
    }
    return nextWordIdx;
  }

  function playbackFrame() {
    if (!tpState.autoScrolling) return;
    const elapsedMs = activeElapsedMs();
    syncPlaybackWord(elapsedMs);
    if (tpState.playbackEndMs > 0 && elapsedMs >= tpState.playbackEndMs) {
      lyrics.stopAutoScroll();
      return;
    }
    tpState.playbackRafId = requestAnimationFrame(playbackFrame);
  }

  lyrics.tpClickWord = function(idx) {
    if (tpState.isLRC && tpState.lrcData && _twinMode && _activePlayerType) {
      const lineIdx = _wordToLine[idx];
      if (lineIdx !== undefined && tpState.lrcData[lineIdx]) {
        let playerTime = null;
        if (_activePlayerType === 'youtube' && _ytPlayer && typeof _ytPlayer.getCurrentTime === 'function') {
          try { playerTime = _ytPlayer.getCurrentTime(); } catch {}
        } else if (_activePlayerType === 'local' && typeof localAudio !== 'undefined' && localAudio) {
          playerTime = localAudio.currentTime;
        }
        if (playerTime !== null) {
          const lrcTime = tpState.lrcData[lineIdx].time;
          tpState.syncOffset = Math.round((playerTime - lrcTime) * 10) / 10;
          tpState.syncOffset = Math.max(-30, Math.min(30, tpState.syncOffset));
          updateSyncLabel();
          notifyTwinBridge('onSyncOffsetChanged');
          showToast('Sync ajustado: ' + (tpState.syncOffset >= 0 ? '+' : '') + tpState.syncOffset.toFixed(1) + 's', 'success');
        }
      }
    }
    lyrics.highlightWord(idx);
  };

  lyrics.highlightWord = function(idx) {
    if (idx < 0 || idx >= tpState.words.length) return;
    if (idx === tpState.currentIdx && _wordToLine[idx] === tpState.currentLine) return;
    const prevIdx = tpState.currentIdx;
    const prevLineIdx = tpState.currentLine;
    if (prevIdx >= 0 && idx > prevIdx) {
      for (let i = prevIdx; i < idx; i++) {
        const node = document.getElementById('tw-' + i);
        if (node) {
          node.classList.remove('tp-active');
          node.classList.add('tp-done');
        }
      }
    } else if (prevIdx >= 0 && idx < prevIdx) {
      for (let i = idx; i <= prevIdx; i++) {
        const node = document.getElementById('tw-' + i);
        if (node) {
          node.classList.remove('tp-active', 'tp-done');
        }
      }
    } else if (prevIdx >= 0) {
      const prev = document.getElementById('tw-' + prevIdx);
      if (prev) prev.classList.remove('tp-active');
    }

    const next = document.getElementById('tw-' + idx);
    if (next) {
      next.classList.remove('tp-done');
      next.classList.add('tp-active');
      const lineIdx = _wordToLine[idx];
      if (lineIdx !== undefined && lineIdx !== tpState.currentLine) {
        const lineEl = document.getElementById('tl-' + lineIdx);
        if (lineEl) {
          if (tpState._scrollRAF) cancelAnimationFrame(tpState._scrollRAF);
          tpState._scrollRAF = requestAnimationFrame(() => {
            centerLineInView(lineEl);
          });
        }
      }
    }

    tpState.currentIdx = idx;
    const newLine = _wordToLine[idx];
    if (newLine !== undefined && newLine !== tpState.currentLine) {
      lyrics.updateLineHighlights(newLine);
      tpState.currentLine = newLine;
    }

    lyrics.updateWordCounter();
    lyrics.updateProgress((idx + 1) / tpState.words.length);
    if (socket && socket.connected) {
      socket.emit('tp_scroll', { currentWord: idx, isPlaying: tpState.autoScrolling });
    }
    if (tpState.currentLine !== prevLineIdx) notifyTwinBridge('onCursorChanged');
  };

  lyrics.updateLineHighlights = function(activeLineIdx) {
    tpState.lines.forEach((line, i) => {
      const el = document.getElementById('tl-' + line.lineIdx);
      if (!el) return;
      el.classList.remove('tp-line-active', 'tp-line-next', 'tp-line-done');
      if (i === activeLineIdx) el.classList.add('tp-line-active');
      else if (i === activeLineIdx + 1) el.classList.add('tp-line-next');
      else if (i < activeLineIdx) el.classList.add('tp-line-done');
    });
  };

  lyrics.updateProgress = function(ratio) {
    const fill = document.getElementById('tp-progress-fill');
    if (fill) fill.style.width = Math.min(100, ratio * 100).toFixed(1) + '%';
  };

  lyrics.updateModeBadge = function() {
    const badge = document.getElementById('tp-mode-badge');
    if (!badge) return;
    if (tpState.isLRC) {
      badge.className = 'tp-lrc-badge';
      badge.textContent = 'LRC sincronizado';
    } else if (tpState.words.length > 0) {
      badge.className = 'tp-lrc-badge manual';
      badge.textContent = 'Modo manual - ' + tpState.lines.length + ' lineas';
    } else {
      badge.className = 'tp-lrc-badge manual';
      badge.textContent = 'Sin letra';
    }
    badge.dataset.baseLabel = badge.textContent;
    badge.dataset.baseClass = badge.className;
  };

  lyrics.tpNext = function() {
    if (tpState.currentIdx < tpState.words.length - 1) lyrics.highlightWord(tpState.currentIdx + 1);
  };

  lyrics.tpPrev = function() {
    if (tpState.currentIdx > 0) lyrics.highlightWord(tpState.currentIdx - 1);
  };

  lyrics.tpNextLine = function() {
    const nextL = tpState.currentLine + 1;
    if (nextL < tpState.lines.length) lyrics.highlightWord(tpState.lines[nextL].words[0].globalIdx);
  };

  lyrics.tpPrevLine = function() {
    const prevL = tpState.currentLine - 1;
    if (prevL >= 0) lyrics.highlightWord(tpState.lines[prevL].words[0].globalIdx);
  };

  lyrics.tpReset = function() {
    lyrics.stopAutoScroll();
    tpState.currentIdx = -1;
    tpState.currentLine = -1;
    tpState.pauseOffset = 0;
    lyrics.setLyrics(tpState.rawText);
  };

  lyrics.tpSpeedUp = function() {
    tpState.speed = Math.min(tpState.speed + 0.2, 5.0);
    document.getElementById('speed-label').textContent = tpState.speed.toFixed(1) + 'x';
    if (socket) socket.emit('tp_speed', { speed: tpState.speed });
    if (tpState.autoScrolling) {
      lyrics.stopAutoScroll();
      lyrics.startAutoScroll();
    }
  };

  lyrics.tpSpeedDown = function() {
    tpState.speed = Math.max(tpState.speed - 0.2, 0.2);
    document.getElementById('speed-label').textContent = tpState.speed.toFixed(1) + 'x';
    if (socket) socket.emit('tp_speed', { speed: tpState.speed });
    if (tpState.autoScrolling) {
      lyrics.stopAutoScroll();
      lyrics.startAutoScroll();
    }
  };

  lyrics.toggleAutoScroll = function() {
    if (tpState.autoScrolling) {
      lyrics.stopAutoScroll();
      // Also pause YouTube/audio if playing
      if (typeof _ytPlayer !== 'undefined' && _ytPlayer && typeof _ytPlayer.pauseVideo === 'function') {
        try { _ytPlayer.pauseVideo(); } catch(e) {}
      }
      var audioBar = document.getElementById('ab-audio');
      if (audioBar && !audioBar.paused) audioBar.pause();
    } else {
      lyrics.startAutoScroll();
      // Also resume YouTube/audio
      if (typeof _ytPlayer !== 'undefined' && _ytPlayer && typeof _ytPlayer.playVideo === 'function') {
        try { _ytPlayer.playVideo(); } catch(e) {}
      }
      var audioBar2 = document.getElementById('ab-audio');
      if (audioBar2 && audioBar2.paused && audioBar2.src) audioBar2.play();
    }
  };

  lyrics.startAutoScroll = function() {
    if (!tpState.words.length) return;
    rebuildPlaybackMetrics();
    clearLegacyTimers();
    _stopTwinSync();

    tpState.autoScrolling = true;
    lyrics.updatePlayBtn();
    notifyTwinBridge('onAutoScrollChanged');

    if (tpState.isLRC && tpState.lrcData) lyrics.startLRCPlayback();
    else lyrics.startManualScroll();
  };

  lyrics.startManualScroll = function() {
    setInternalStartFromMs(tpState.pauseOffset > 0 ? tpState.pauseOffset : currentWordBaseMs());
    clearPlaybackLoop();
    playbackFrame();
  };

  lyrics.startLRCPlayback = function() {
    clearPlaybackLoop();

    if (_twinMode && _activePlayerType) {
      _startTwinSync();
      return;
    }

    setInternalStartFromMs(tpState.pauseOffset > 0 ? tpState.pauseOffset : currentWordBaseMs());
    playbackFrame();
  };

  lyrics.syncToExternalTime = function(currentTimeSec) {
    if (!tpState.autoScrolling || !tpState.words.length) return -1;
    const elapsedMs = Math.max(0, Math.round(((Number(currentTimeSec) || 0) + (tpState.isLRC ? (Number(tpState.syncOffset) || 0) : 0)) * 1000));
    const nextWordIdx = syncPlaybackWord(elapsedMs);
    if (tpState.playbackEndMs > 0 && elapsedMs >= tpState.playbackEndMs) {
      lyrics.stopAutoScroll();
    }
    return nextWordIdx;
  };

  lyrics.stopAutoScroll = function() {
    tpState.autoScrolling = false;
    tpState.pauseOffset = baseElapsedMs();
    clearLegacyTimers();
    _stopTwinSync();
    lyrics.updatePlayBtn();
    notifyTwinBridge('onAutoScrollChanged');
  };

  lyrics.updatePlayBtn = function() {
    document.getElementById('ico-play').style.display = tpState.autoScrolling ? 'none' : 'block';
    document.getElementById('ico-pause').style.display = tpState.autoScrolling ? 'block' : 'none';
    const hasWords = tpState.words.length > 0;
    const playBtn = document.getElementById('btn-play');
    if (playBtn) {
      playBtn.style.opacity = hasWords ? '' : '0.5';
      playBtn.style.pointerEvents = hasWords ? '' : 'none';
    }
    document.querySelectorAll('.ctrl-btn:not(#btn-play)').forEach((btn) => {
      btn.style.opacity = hasWords ? '' : '0.5';
      btn.style.pointerEvents = hasWords ? '' : 'none';
    });
    const nsBtn = document.querySelector('.ns-next-btn');
    if (nsBtn) {
      nsBtn.style.opacity = hasWords ? '' : '0.5';
      nsBtn.style.pointerEvents = hasWords ? '' : 'none';
    }
  };

  lyrics.updateWordCounter = function() {
    const c = Math.max(0, tpState.currentIdx + 1);
    document.getElementById('word-counter').textContent = c + '/' + tpState.words.length;
  };

  lyrics.tpToggleFullscreen = function() {
    const center = document.querySelector('.center');
    const isFS = center.classList.toggle('tp-fullscreen');
    ['.player-bar', '.mobile-nav', '#audio-bar', '.topbar'].forEach((sel) => {
      const el = document.querySelector(sel);
      if (el) el.style.display = isFS ? 'none' : '';
    });

    const btn = document.querySelector('.tp-fullscreen-btn');
    if (isFS) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6m10-10h-6V4M4 10h6V4m10 10h-6v6"/></svg>';
      showToast('Pantalla completa - ESC para salir');
    } else {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
    }
  };

  lyrics.openLyricsSearch = function() {
    document.getElementById('lyrics-overlay').classList.add('open');
    const nsName = document.getElementById('ns-song');
    if (nsName && nsName.textContent && nsName.textContent !== '-') {
      document.getElementById('lyrics-search-title').value = nsName.textContent;
    }
    setTimeout(() => document.getElementById('lyrics-search-title').focus(), 100);
  };

  lyrics.closeLyricsSearch = function() {
    document.getElementById('lyrics-overlay').classList.remove('open');
  };

  lyrics.searchLyricsOnline = async function() {
    const title = document.getElementById('lyrics-search-title').value.trim();
    const artist = document.getElementById('lyrics-search-artist').value.trim();
    if (!title) {
      showToast('Escribe el titulo de la cancion');
      return;
    }

    const results = document.getElementById('lyrics-results');
    results.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:24px;animation:pulse 1s infinite;">...</div><div style="font-size:12px;color:var(--sub);margin-top:8px;">Buscando letras...</div></div>';

    try {
      let url = 'https://lrclib.net/api/search?track_name=' + encodeURIComponent(title);
      if (artist) url += '&artist_name=' + encodeURIComponent(artist);

      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();

      if (!data.length) {
        const q = title.toLowerCase();
        const localHits = (typeof _artLetras !== 'undefined' ? _artLetras : []).filter((l) =>
          l.titulo.toLowerCase().includes(q) || l.letra.toLowerCase().includes(q)
        );
        if (localHits.length) {
          window._lyricsSearchResults = localHits.map((l) => ({ trackName: l.titulo, artistName: 'ArT-AtR', plainLyrics: l.letra }));
          results.innerHTML = '<div style="text-align:center;font-size:9px;color:var(--g);margin-bottom:8px;">Encontrado en Mis Letras (ArT-AtR)</div>' +
            localHits.map((l, i) => {
              const preview = l.letra.split('\n').slice(0, 4).join(' / ');
              return `
            <div style="padding:10px;border:1px solid rgba(0,255,136,.2);border-radius:8px;margin-bottom:6px;background:rgba(0,255,136,.04);">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <div style="font-size:12px;font-weight:700;">${escHtml(l.titulo)}</div>
                  <div style="font-size:10px;color:var(--sub);">ArT-AtR &middot; ${escHtml(l.tema)}</div>
                </div>
                <span style="font-size:10px;background:rgba(0,255,136,.15);color:var(--g);padding:2px 6px;border-radius:4px;">LOCAL</span>
              </div>
              <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:6px;font-style:italic;line-height:1.4;">${escHtml(preview.substring(0, 120))}...</div>
              <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="tp-search-lyrics-btn" style="flex:1;justify-content:center;font-size:10px;padding:6px;" onclick="loadOnlineLyrics(${i},false)">Cargar al Teleprompter</button>
              </div>
            </div>`;
            }).join('');
          return;
        }

        results.innerHTML = '<div style="text-align:center;padding:30px;font-size:12px;">' +
          '<div style="opacity:.4;margin-bottom:16px;">No se encontraron letras para "' + escHtml(title) + '"</div>' +
          (iaOnline && iaBackend === 'grok'
            ? '<button onclick="grokWriteLyrics(\'' + escHtml(title).replace(/'/g, "\\'") + '\',\'' + escHtml(artist).replace(/'/g, "\\'") + '\')" style="padding:10px 20px;background:linear-gradient(135deg,#8b5cf6,#06b6d4);border:none;border-radius:10px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">GFlow: escribir letra + LRC</button>'
            : '<div style="opacity:.5;">Intenta con otro titulo o artista</div>') +
          '</div>';
        return;
      }

      results.innerHTML = data.slice(0, 15).map((item, i) => {
        const hasLRC = item.syncedLyrics && item.syncedLyrics.length > 10;
        const hasPlain = item.plainLyrics && item.plainLyrics.length > 10;
        const duration = item.duration
          ? Math.floor(item.duration / 60) + ':' + String(Math.floor(item.duration % 60)).padStart(2, '0')
          : '';
        return `
          <div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,.02);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <div style="font-size:12px;font-weight:700;">${escHtml(item.trackName || title)}</div>
                <div style="font-size:10px;color:var(--sub);">${escHtml(item.artistName || artist || 'Artista')}${duration ? ' &middot; ' + duration : ''}</div>
              </div>
              <div style="display:flex;gap:4px;">
                ${hasLRC ? '<span class="tp-lrc-badge" style="font-size:10px;">LRC</span>' : ''}
                ${hasPlain ? '<span class="tp-lrc-badge manual" style="font-size:10px;">TXT</span>' : ''}
              </div>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;">
              ${hasLRC ? '<button class="tp-search-lyrics-btn" style="flex:1;justify-content:center;font-size:10px;padding:6px;" onclick="loadOnlineLyrics(' + i + ',true)">Cargar LRC sincronizado</button>' : ''}
              ${hasPlain ? '<button class="tp-search-lyrics-btn" style="flex:1;justify-content:center;font-size:10px;padding:6px;background:rgba(131,56,236,.08);border-color:rgba(131,56,236,.2);color:var(--s);" onclick="loadOnlineLyrics(' + i + ',false)">Cargar texto plano</button>' : ''}
            </div>
          </div>`;
      }).join('');

      window._lyricsSearchResults = data.slice(0, 15);
    } catch (err) {
      results.innerHTML = '<div style="text-align:center;padding:30px;opacity:.4;font-size:12px;">Error buscando letras<br><small>' + escHtml(err.message) + '</small></div>';
    }
  };

  lyrics.loadOnlineLyrics = function(idx, useLRC) {
    const item = window._lyricsSearchResults && window._lyricsSearchResults[idx];
    if (!item) return;

    const lyricsText = useLRC ? item.syncedLyrics : item.plainLyrics;
    if (!lyricsText) {
      showToast('No hay letra disponible');
      return;
    }

    lyrics.setLyrics(lyricsText);
    if (socket) socket.emit('tp_lyrics', { lyrics: lyricsText });
    lyrics.closeLyricsSearch();

    const type = useLRC ? 'LRC sincronizado' : 'texto';
    showToast('Letra cargada (' + type + '): ' + (item.trackName || 'cancion'));

    const titulo = item.trackName || document.getElementById('lyrics-search-title').value;
    const artista = item.artistName || document.getElementById('lyrics-search-artist').value;
    if (titulo) {
      fetch('/api/canciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, artista, letra: lyricsText })
      }).catch(() => {});
    }
  };
})(window.VibeFlow);

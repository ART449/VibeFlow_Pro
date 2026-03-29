(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const lyrics = VF.modules.lyrics = {};

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
  };

  lyrics.tpSyncReset = function() {
    tpState.syncOffset = 0;
    updateSyncLabel();
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
    updateSyncLabel();

    const el = document.getElementById('tp-display');
    const welcome = document.getElementById('tp-welcome');

    if (!text || !text.trim()) {
      if (welcome) welcome.style.display = '';
      lyrics.updateProgress(0);
      lyrics.updateModeBadge();
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

    lyrics.updateWordCounter();
    lyrics.updateProgress(0);
    lyrics.updateModeBadge();
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
          showToast('Sync ajustado: ' + (tpState.syncOffset >= 0 ? '+' : '') + tpState.syncOffset.toFixed(1) + 's', 'success');
        }
      }
    }
    lyrics.highlightWord(idx);
  };

  lyrics.highlightWord = function(idx) {
    if (idx < 0 || idx >= tpState.words.length) return;

    const prev = document.getElementById('tw-' + tpState.currentIdx);
    if (prev) {
      prev.classList.remove('tp-active');
      prev.classList.add('tp-done');
    }

    const next = document.getElementById('tw-' + idx);
    if (next) {
      next.classList.add('tp-active');
      const lineIdx = _wordToLine[idx];
      if (lineIdx !== undefined && lineIdx !== tpState.currentLine) {
        const lineEl = document.getElementById('tl-' + lineIdx);
        if (lineEl) {
          if (tpState._scrollRAF) cancelAnimationFrame(tpState._scrollRAF);
          tpState._scrollRAF = requestAnimationFrame(() => {
            lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    if (tpState.autoScrolling) lyrics.stopAutoScroll();
    else lyrics.startAutoScroll();
  };

  lyrics.startAutoScroll = function() {
    if (!tpState.words.length) return;
    clearInterval(tpState.intervalId);
    tpState.intervalId = null;
    clearInterval(tpState.lrcTimerId);
    tpState.lrcTimerId = null;
    _stopTwinSync();

    tpState.autoScrolling = true;
    lyrics.updatePlayBtn();

    if (tpState.isLRC && tpState.lrcData) lyrics.startLRCPlayback();
    else lyrics.startManualScroll();
  };

  lyrics.startManualScroll = function() {
    clearInterval(tpState.intervalId);
    tpState.intervalId = null;

    const baseInterval = Math.max(100, 500 / tpState.speed);
    let skipTicks = 0;
    const lineStartSet = new Set();
    tpState.lines.forEach((l) => {
      if (l.words.length > 0) lineStartSet.add(l.words[0].globalIdx);
    });

    tpState.intervalId = setInterval(() => {
      if (skipTicks > 0) {
        skipTicks--;
        return;
      }
      if (tpState.currentIdx >= tpState.words.length - 1) {
        lyrics.stopAutoScroll();
        return;
      }

      const nextIdx = tpState.currentIdx + 1;
      lyrics.highlightWord(nextIdx);
      if (nextIdx > 0 && lineStartSet.has(nextIdx)) skipTicks = 2;
    }, baseInterval);
  };

  lyrics.startLRCPlayback = function() {
    clearInterval(tpState.lrcTimerId);
    tpState.lrcTimerId = null;

    if (_twinMode && _activePlayerType) {
      _startTwinSync();
      return;
    }

    const now = performance.now();
    if (tpState.pauseOffset > 0) {
      tpState.startTime = now - tpState.pauseOffset;
    } else {
      let startOffset = 0;
      if (tpState.currentLine >= 0 && tpState.lrcData[tpState.currentLine]) {
        startOffset = tpState.lrcData[tpState.currentLine].time * 1000;
      }
      tpState.startTime = now - startOffset;
    }

    tpState.lrcTimerId = setInterval(() => {
      const elapsed = ((performance.now() - tpState.startTime) / 1000) * tpState.speed + tpState.syncOffset;
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
          for (let li = tpState.currentLine + 1; li <= activeLine; li++) {
            const prevLine = tpState.lines[li];
            if (!prevLine) continue;
            prevLine.words.forEach((w) => {
              const el = document.getElementById('tw-' + w.globalIdx);
              if (el && !el.classList.contains('tp-done')) {
                el.classList.remove('tp-active');
                el.classList.add('tp-done');
              }
            });
          }

          lyrics.highlightWord(line.words[0].globalIdx);
          const lineWordCount = line.words.length;
          if (lineWordCount > 1) {
            const nextLineTime = activeLine + 1 < tpState.lrcData.length
              ? tpState.lrcData[activeLine + 1].time
              : tpState.lrcData[activeLine].time + 5;
            const lineDuration = (nextLineTime - tpState.lrcData[activeLine].time) * 1000 / tpState.speed;
            const wordDelay = lineDuration / lineWordCount;
            for (let wi = 1; wi < lineWordCount; wi++) {
              setTimeout(() => {
                if (tpState.currentLine === activeLine && tpState.autoScrolling) {
                  lyrics.highlightWord(line.words[wi].globalIdx);
                }
              }, wordDelay * wi);
            }
          }
        }
      }

      if (activeLine >= tpState.lrcData.length - 1) {
        setTimeout(() => lyrics.stopAutoScroll(), 2000);
      }
    }, 50);
  };

  lyrics.stopAutoScroll = function() {
    tpState.autoScrolling = false;
    clearInterval(tpState.intervalId);
    clearInterval(tpState.lrcTimerId);
    _stopTwinSync();
    if (tpState.isLRC && tpState.startTime > 0) {
      tpState.pauseOffset = performance.now() - tpState.startTime;
    }
    lyrics.updatePlayBtn();
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

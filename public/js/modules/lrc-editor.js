(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const editor = VF.modules.lrcEditor = {};

  const state = {
    pkg: null,
    cues: [],
    displayStyle: null,
    catalogSongs: [],
    activeIdx: 0,
    objectUrl: '',
    lastPreviewIdx: -1,
    lastPreviewSignature: '',
    twinSessionId: '',
    twinTransport: null,
    twinWindow: null,
    twinLastSentAt: 0
  };
  const LAST_SESSION_KEY = 'byflow_twin_last_session_v1';

  function engine() {
    return VF.modules.lrcEngine;
  }

  function packages() {
    return VF.modules.songPackage;
  }

  function styleHelper() {
    return VF.modules.teleprompterStyle || null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function audioEl() {
    return el('lrc-audio');
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function toast(message, tone) {
    const node = el('lrc-toast');
    if (!node) return;
    node.textContent = message;
    node.className = 'lrc-toast show' + (tone ? ' ' + tone : '');
    clearTimeout(node._timer);
    node._timer = setTimeout(() => {
      node.className = 'lrc-toast';
    }, 2400);
  }

  function copyText(value, successMessage) {
    const text = String(value || '');
    if (!text) {
      toast('No hay contenido para copiar', 'warn');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => toast(successMessage || 'Copiado', 'ok'))
        .catch(() => toast('No se pudo copiar', 'warn'));
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      toast(successMessage || 'Copiado', 'ok');
    } catch {
      toast('No se pudo copiar', 'warn');
    } finally {
      area.remove();
    }
  }

  function revokeAudioUrl() {
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = '';
    }
  }

  function syncPackageFromForm() {
    if (!state.pkg) state.pkg = packages().createEmpty();
    state.pkg.title = (el('pkg-title').value || '').trim();
    state.pkg.artist = (el('pkg-artist').value || '').trim();
    state.pkg.globalOffsetMs = Math.round(Number(el('pkg-offset').value || 0));
    state.pkg.notes = (el('pkg-notes').value || '').trim();
    state.pkg.sourceAudioName = (el('pkg-audio-name').textContent || '').trim();
    state.pkg.displayStyle = state.displayStyle;
  }

  function refreshDerived() {
    syncPackageFromForm();
    state.pkg = packages().withCues(state.pkg, state.cues);
    return state.pkg;
  }

  function populateStyleChoices() {
    const helper = styleHelper();
    const fontSelect = el('tp-style-font-family');
    const presetWrap = el('tp-style-presets');
    if (!helper) return;

    if (fontSelect && !fontSelect.options.length) {
      fontSelect.innerHTML = helper.fontOptions().map((item) =>
        '<option value="' + item.id + '">' + item.label + '</option>'
      ).join('');
    }

    if (presetWrap && !presetWrap.children.length) {
      presetWrap.innerHTML = helper.presetOptions().map((item) =>
        '<button type="button" class="ghost" data-style-preset="' + item.id + '">' + item.label + '</button>'
      ).join('');
    }
  }

  function renderStyleControls() {
    const helper = styleHelper();
    if (!helper) return;
    populateStyleChoices();
    const style = helper.normalize(state.displayStyle);
    state.displayStyle = style;

    const fontSelect = el('tp-style-font-family');
    const alignSelect = el('tp-style-align');
    if (fontSelect) fontSelect.value = style.fontPreset;
    if (alignSelect) alignSelect.value = style.textAlign;

    const sliderValues = {
      'tp-style-font-size': style.fontSizeRem.toFixed(1),
      'tp-style-line-height': style.lineHeight.toFixed(2),
      'tp-style-letter-spacing': style.letterSpacingEm.toFixed(3),
      'tp-style-max-width': String(Math.round(style.maxWidthPx)),
      'tp-style-glow': style.glowAlpha.toFixed(2),
      'tp-style-top-padding': String(Math.round(style.stageTopVh)),
      'tp-style-bottom-padding': String(Math.round(style.stageBottomVh)),
      'tp-style-active-scale': style.activeScale.toFixed(2)
    };

    Object.keys(sliderValues).forEach((id) => {
      const node = el(id);
      if (node) node.value = sliderValues[id];
    });

    const labels = {
      'tp-style-font-size-val': style.fontSizeRem.toFixed(1) + 'rem',
      'tp-style-line-height-val': style.lineHeight.toFixed(2),
      'tp-style-letter-spacing-val': style.letterSpacingEm.toFixed(3) + 'em',
      'tp-style-max-width-val': Math.round(style.maxWidthPx) + 'px',
      'tp-style-glow-val': style.glowAlpha.toFixed(2),
      'tp-style-top-padding-val': Math.round(style.stageTopVh) + 'vh',
      'tp-style-bottom-padding-val': Math.round(style.stageBottomVh) + 'vh',
      'tp-style-active-scale-val': style.activeScale.toFixed(2) + 'x'
    };

    Object.keys(labels).forEach((id) => {
      const node = el(id);
      if (node) node.textContent = labels[id];
    });

    document.querySelectorAll('[data-style-preset]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-style-preset') === style.presetKey);
    });
  }

  function applyPreviewStyle() {
    const helper = styleHelper();
    const preview = el('preview-lines');
    if (!helper || !preview) return;
    state.displayStyle = helper.applyToElement(preview, state.displayStyle);
  }

  function previewSignature() {
    return state.cues.map((cue) => [cue.id, cue.text].join('::')).join('\n');
  }

  function renderPreviewLines(force) {
    const inner = el('preview-lines-inner');
    if (!inner) return;
    if (!state.cues.length) {
      state.lastPreviewSignature = '';
      state.lastPreviewIdx = -1;
      inner.innerHTML = '<div class="empty-card">El preview del teleprompter aparecera aqui.</div>';
      return;
    }

    const signature = previewSignature();
    if (!force && signature === state.lastPreviewSignature) return;
    state.lastPreviewSignature = signature;
    state.lastPreviewIdx = -1;
    inner.innerHTML = state.cues.map((cue, index) =>
      '<div class="preview-line" data-preview-idx="' + index + '">' + escapeHtml(cue.text) + '</div>'
    ).join('');
  }

  function setDisplayStyle(nextStyle, options) {
    const helper = styleHelper();
    if (!helper) return;
    const opts = options || {};
    let style = nextStyle;
    if (typeof nextStyle === 'string') style = helper.preset(nextStyle);
    state.displayStyle = helper.normalize(style || state.displayStyle);
    if (opts.persistDefault) helper.save(state.displayStyle);
    if (state.pkg) state.pkg.displayStyle = state.displayStyle;
    renderStyleControls();
    applyPreviewStyle();
    updatePreview(false);
    broadcastTwinState('style');
  }

  function getTwinSync() {
    return VF.modules.twinSync;
  }

  function ensureTwinSession() {
    if (state.twinSessionId) return state.twinSessionId;
    const cached = localStorage.getItem(LAST_SESSION_KEY);
    state.twinSessionId = cached || (getTwinSync() && typeof getTwinSync().createSessionId === 'function'
      ? getTwinSync().createSessionId()
      : ('twin_' + Date.now().toString(36)));
    localStorage.setItem(LAST_SESSION_KEY, state.twinSessionId);
    renderTwinMeta();
    return state.twinSessionId;
  }

  function ensureTwinTransport() {
    const twinSync = getTwinSync();
    if (!twinSync || state.twinTransport) return state.twinTransport;
    state.twinTransport = twinSync.createTransport(ensureTwinSession());
    return state.twinTransport;
  }

  function twinUrl() {
    return location.origin + '/twin-player.html?session=' + encodeURIComponent(ensureTwinSession());
  }

  function renderTwinMeta() {
    const sessionEl = el('twin-session-label');
    const linkEl = el('twin-link-label');
    if (sessionEl) sessionEl.textContent = ensureTwinSession();
    if (linkEl) linkEl.textContent = twinUrl();
  }

  function broadcastTwinState(kind) {
    const transport = ensureTwinTransport();
    if (!transport) return;

    const now = Date.now();
    if (kind === 'tick' && now - state.twinLastSentAt < 180) return;
    state.twinLastSentAt = now;

    const payload = packages().toTwinPayload(refreshDerived(), currentPlayback());
    payload.kind = kind || 'state';
    payload.sessionId = ensureTwinSession();
    transport.send('state', payload);
  }

  function openTwinWindow() {
    const url = twinUrl();
    ensureTwinTransport();
    broadcastTwinState('snapshot');
    if (state.twinWindow && !state.twinWindow.closed) {
      state.twinWindow.focus();
      return;
    }
    state.twinWindow = window.open(url, 'byflow-twin-player', 'width=1600,height=900,menubar=no,toolbar=no,location=no,status=no');
  }

  function copyTwinLink() {
    copyText(twinUrl(), 'Link del gemelo copiado');
  }

  function firstSuggestedIdx(cues) {
    const issues = engine().collectIssues(cues);
    if (!issues.total) return 0;
    const untimedIdx = cues.findIndex((cue) => cue.timeMs === null);
    if (untimedIdx >= 0) return untimedIdx;
    return Math.min(cues.length - 1, Math.max(0, state.activeIdx));
  }

  function loadPackage(rawPkg) {
    state.pkg = packages().normalize(rawPkg);
    state.cues = engine().cloneCues(state.pkg.cues);
    state.displayStyle = styleHelper() ? styleHelper().normalize(state.pkg.displayStyle || styleHelper().load()) : state.pkg.displayStyle;
    state.activeIdx = firstSuggestedIdx(state.cues);
    state.lastPreviewIdx = -1;
    state.lastPreviewSignature = '';

    el('pkg-title').value = state.pkg.title;
    el('pkg-artist').value = state.pkg.artist;
    el('pkg-offset').value = String(state.pkg.globalOffsetMs || 0);
    el('pkg-notes').value = state.pkg.notes || '';
    el('lyrics-source').value = state.pkg.lyricsPlain || '';
    el('pkg-audio-name').textContent = state.pkg.sourceAudioName || 'Sin audio de referencia';

    renderStyleControls();
    applyPreviewStyle();
    renderEverything();
    broadcastTwinState('package');
  }

  function currentPlayback() {
    const audio = audioEl();
    return {
      currentTimeMs: audio ? Math.round((audio.currentTime || 0) * 1000) : 0,
      playing: !!(audio && !audio.paused),
      rate: audio ? Number(audio.playbackRate || 1) : 1
    };
  }

  function updatePlaybackUi() {
    const audio = audioEl();
    const currentMs = audio ? Math.round((audio.currentTime || 0) * 1000) : 0;
    const durationMs = audio && Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0;
    const playBtn = el('lrc-play-pause');

    el('lrc-audio-clock').textContent = engine().formatClockValue(currentMs) + (durationMs ? ' / ' + engine().formatClockValue(durationMs) : '');
    if (playBtn) playBtn.textContent = audio && !audio.paused ? 'Pausar' : 'Play';

    updatePreview();
    broadcastTwinState('tick');
  }

  function setActiveIdx(idx) {
    if (!state.cues.length) {
      state.activeIdx = 0;
      renderEverything();
      return;
    }
    state.activeIdx = Math.max(0, Math.min(state.cues.length - 1, idx));
    renderEditorList();
    updatePreview();
  }

  function setCueTime(idx, timeMs) {
    if (!state.cues[idx]) return;
    state.cues[idx] = {
      id: state.cues[idx].id,
      text: state.cues[idx].text,
      timeMs: timeMs === null ? null : Math.max(0, Math.round(timeMs))
    };
    refreshDerived();
    renderEditorList();
    updatePreview();
    renderStats();
    broadcastTwinState('cue');
  }

  function rebuildFromTextarea() {
    const text = el('lyrics-source').value;
    if (!text.trim()) {
      toast('Pega una letra o carga una cancion primero', 'warn');
      return;
    }

    const nextCues = engine().textToCues(text);
    const preserveTiming = !engine().isLikelyLRC(text) && nextCues.length === state.cues.length;
    if (preserveTiming) {
      nextCues.forEach((cue, index) => {
        cue.timeMs = state.cues[index] ? state.cues[index].timeMs : null;
      });
    }

    state.cues = nextCues;
    state.activeIdx = firstSuggestedIdx(state.cues);
    refreshDerived();
    renderEverything();
    toast('Lineas listas para sincronizar', 'ok');
    broadcastTwinState('rebuild');
  }

  function captureCurrentTime(targetIdx) {
    const audio = audioEl();
    if (!audio || !Number.isFinite(audio.currentTime)) {
      toast('Carga un audio de referencia primero', 'warn');
      return;
    }
    const idx = Number.isFinite(targetIdx) ? targetIdx : state.activeIdx;
    setCueTime(idx, Math.round(audio.currentTime * 1000));
    if (el('lrc-auto-advance').checked && idx < state.cues.length - 1) {
      state.activeIdx = idx + 1;
      renderEditorList();
    }
    toast('Linea marcada en ' + engine().formatClockValue(audio.currentTime * 1000), 'ok');
  }

  function nudgeActive(deltaMs) {
    if (!state.cues[state.activeIdx]) return;
    const current = state.cues[state.activeIdx].timeMs;
    if (current === null) {
      toast('La linea activa aun no tiene tiempo', 'warn');
      return;
    }
    setCueTime(state.activeIdx, current + deltaMs);
  }

  function clearAllTimes() {
    state.cues = state.cues.map((cue) => ({ id: cue.id, text: cue.text, timeMs: null }));
    refreshDerived();
    renderEverything();
    toast('Timeline limpiada', 'ok');
    broadcastTwinState('clear');
  }

  function autoSpread() {
    const audio = audioEl();
    const durationMs = audio && Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0;
    state.cues = engine().buildDraftTimings(state.cues, durationMs, {
      leadInMs: 10000,
      tailOutMs: 6000
    });
    state.activeIdx = 0;
    refreshDerived();
    renderEverything();
    toast('Borrador de tiempos generado', 'ok');
    broadcastTwinState('draft');
  }

  function normalizeTimeline() {
    state.cues = engine().normalizeTimeline(state.cues, 120);
    refreshDerived();
    renderEverything();
    toast('Timeline normalizada', 'ok');
    broadcastTwinState('normalize');
  }

  function saveLocalPackage() {
    const pkg = refreshDerived();
    if (!pkg.title) {
      toast('Ponle titulo a la cancion', 'warn');
      return;
    }
    state.pkg = packages().saveLocal(pkg);
    renderLibrary();
    toast('Song Package guardado localmente', 'ok');
    broadcastTwinState('save-local');
  }

  async function saveToCatalog() {
    const pkg = refreshDerived();
    if (!pkg.title) {
      toast('Ponle titulo a la cancion', 'warn');
      return;
    }

    const body = {
      titulo: pkg.title,
      artista: pkg.artist,
      letra: pkg.lrcText || pkg.lyricsPlain,
      displayStyle: pkg.displayStyle
    };

    let targetId = pkg.sourceSongId;
    if (!targetId) {
      const match = state.catalogSongs.find((song) =>
        String(song.titulo || '').toLowerCase() === pkg.title.toLowerCase() &&
        String(song.artista || '').toLowerCase() === pkg.artist.toLowerCase()
      );
      if (match) targetId = match.id;
    }

    const url = targetId ? '/api/canciones/' + targetId : '/api/canciones';
    const method = targetId ? 'PATCH' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');

      state.pkg.sourceSongId = data.id || targetId || '';
      state.pkg.sourceKind = 'catalog';
      state.pkg.sourceRef = state.pkg.sourceSongId;
      await fetchCatalog();
      toast('Catalogo karaoke actualizado', 'ok');
      broadcastTwinState('save-catalog');
    } catch (error) {
      toast(error.message, 'warn');
    }
  }

  function renderStats() {
    const issues = engine().collectIssues(state.cues);
    const pkg = refreshDerived();
    const catalogMode = pkg.lrcText ? 'Listo para karaoke sincronizado' : 'Solo texto plano por ahora';

    el('lrc-stats').innerHTML =
      '<span class="stat-pill">' + issues.timed + '/' + issues.total + ' lineas con tiempo</span>' +
      '<span class="stat-pill' + (issues.untimed ? ' warn' : '') + '">' + issues.untimed + ' sin tiempo</span>' +
      '<span class="stat-pill' + (issues.backwards ? ' warn' : '') + '">' + issues.backwards + ' fuera de orden</span>' +
      '<span class="stat-pill subtle">' + escapeHtml(catalogMode) + '</span>';
  }

  function renderEditorList() {
    const list = el('cue-list');
    if (!state.cues.length) {
      list.innerHTML = '<div class="empty-card">Construye lineas desde la letra para empezar a sincronizar.</div>';
      return;
    }

    list.innerHTML = state.cues.map((cue, index) => {
      const active = index === state.activeIdx ? ' active' : '';
      const timed = cue.timeMs !== null ? ' timed' : ' untimed';
      return '<div class="cue-row' + active + timed + '" data-idx="' + index + '">' +
        '<button class="cue-index" data-action="select" data-idx="' + index + '">' + String(index + 1).padStart(2, '0') + '</button>' +
        '<input class="cue-time-input" data-idx="' + index + '" value="' + (cue.timeMs !== null ? engine().formatClockValue(cue.timeMs) : '') + '" placeholder="--:--.--">' +
        '<div class="cue-text">' + escapeHtml(cue.text) + '</div>' +
        '<div class="cue-actions">' +
          '<button data-action="now" data-idx="' + index + '">Now</button>' +
          '<button data-action="clear" data-idx="' + index + '">X</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function updatePreview(forceRender) {
    const preview = el('preview-lines');
    const previewInner = el('preview-lines-inner');
    const audio = audioEl();
    if (!preview || !previewInner) return;
    applyPreviewStyle();
    renderPreviewLines(!!forceRender);
    if (!state.cues.length) return;

    const pkg = refreshDerived();
    const playback = currentPlayback();
    const hasAudioSource = !!(audio && audio.src);
    const resolvedIdx = pkg.lrcText && hasAudioSource
      ? engine().resolveActiveCueIndex(state.cues, playback.currentTimeMs, pkg.globalOffsetMs)
      : state.activeIdx;

    previewInner.querySelectorAll('.preview-line').forEach((line, index) => {
      line.classList.toggle('past', resolvedIdx >= 0 && index < resolvedIdx);
      line.classList.toggle('active', index === resolvedIdx);
      line.classList.toggle('next', resolvedIdx >= 0 && index === resolvedIdx + 1);
    });

    if (resolvedIdx >= 0 && resolvedIdx !== state.lastPreviewIdx) {
      state.lastPreviewIdx = resolvedIdx;
      const active = previewInner.querySelector('[data-preview-idx="' + resolvedIdx + '"]');
      if (active) {
        const targetTop = Math.max(0, active.offsetTop - Math.max(32, (preview.clientHeight - active.offsetHeight) * 0.5));
        const behavior = Math.abs(preview.scrollTop - targetTop) > 24 ? 'smooth' : 'auto';
        preview.scrollTo({ top: targetTop, behavior });
      }
    }

    const twinPayload = packages().toTwinPayload(pkg, playback);
    el('twin-payload').textContent = JSON.stringify(twinPayload, null, 2);
    renderTwinMeta();
  }

  function renderLibrary() {
    const localFilter = (el('lrc-local-filter').value || '').trim().toLowerCase();
    const catalogFilter = (el('lrc-catalog-filter').value || '').trim().toLowerCase();
    const localList = packages().listLocal().filter((pkg) =>
      !localFilter ||
      pkg.title.toLowerCase().includes(localFilter) ||
      pkg.artist.toLowerCase().includes(localFilter)
    );
    const catalogList = state.catalogSongs.filter((song) => {
      if (!catalogFilter) return true;
      return String(song.titulo || '').toLowerCase().includes(catalogFilter) ||
        String(song.artista || '').toLowerCase().includes(catalogFilter);
    });

    el('local-package-list').innerHTML = localList.length
      ? localList.map((pkg) => {
        const issues = engine().collectIssues(pkg.cues);
        return '<div class="library-card">' +
          '<button class="library-main" data-load-local="' + pkg.id + '">' +
            '<div class="library-title">' + escapeHtml(pkg.title || 'Sin titulo') + '</div>' +
            '<div class="library-meta">' + escapeHtml(pkg.artist || 'Sin artista') + '</div>' +
            '<div class="library-chips">' +
              '<span>' + issues.timed + '/' + issues.total + ' timed</span>' +
              '<span>' + (pkg.lrcText ? 'LRC' : 'TXT') + '</span>' +
            '</div>' +
          '</button>' +
          '<button class="library-trash" data-delete-local="' + pkg.id + '" aria-label="Borrar package">X</button>' +
        '</div>';
      }).join('')
      : '<div class="empty-card small">Todavia no guardas Song Packages locales.</div>';

    el('catalog-song-list').innerHTML = catalogList.length
      ? catalogList.slice(0, 120).map((song) => {
        const hasLrc = engine().isLikelyLRC(song.letra);
        return '<button class="library-main catalog" data-load-song="' + song.id + '">' +
          '<div class="library-title">' + escapeHtml(song.titulo || 'Sin titulo') + '</div>' +
          '<div class="library-meta">' + escapeHtml(song.artista || 'Sin artista') + '</div>' +
          '<div class="library-chips">' +
            '<span>' + (hasLrc ? 'LRC' : 'TXT') + '</span>' +
            '<span>' + ((song.letra || '').length > 0 ? 'Con letra' : 'Sin letra') + '</span>' +
          '</div>' +
        '</button>';
      }).join('')
      : '<div class="empty-card small">No encontre canciones para ese filtro.</div>';
  }

  function renderEverything() {
    renderStats();
    renderEditorList();
    renderLibrary();
    updatePlaybackUi();
  }

  async function fetchCatalog() {
    try {
      const response = await fetch('/api/canciones');
      state.catalogSongs = await response.json();
    } catch {
      state.catalogSongs = [];
      toast('No pude leer el catalogo', 'warn');
    }
    renderLibrary();
  }

  function loadLocalAudio(file) {
    if (!file) return;
    revokeAudioUrl();
    state.objectUrl = URL.createObjectURL(file);
    const audio = audioEl();
    audio.src = state.objectUrl;
    audio.load();
    el('pkg-audio-name').textContent = file.name;
    state.pkg.sourceKind = 'local-audio';
    state.pkg.sourceAudioName = file.name;
    toast('Audio listo para sincronizar', 'ok');
    broadcastTwinState('audio');
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
      try {
        const text = String(reader.result || '');
        if (/\.json$/i.test(file.name)) {
          loadPackage(packages().importJSON(text));
          toast('Package JSON cargado', 'ok');
          return;
        }

        const next = packages().createEmpty();
        next.title = file.name.replace(/\.[^.]+$/, '');
        next.lyricsPlain = text;
        next.cues = engine().textToCues(text);
        loadPackage(next);
        toast('Letra importada al estudio', 'ok');
      } catch (error) {
        toast(error.message || 'Archivo invalido', 'warn');
      }
    };
    reader.readAsText(file);
  }

  function bindEditorEvents() {
    el('cue-list').addEventListener('click', (event) => {
      const action = event.target && event.target.getAttribute('data-action');
      const idx = Number(event.target && event.target.getAttribute('data-idx'));

      if (action === 'select') {
        setActiveIdx(idx);
        return;
      }
      if (action === 'now') {
        setActiveIdx(idx);
        captureCurrentTime(idx);
        return;
      }
      if (action === 'clear') {
        setCueTime(idx, null);
        return;
      }

      const row = event.target.closest('.cue-row');
      if (row) setActiveIdx(Number(row.getAttribute('data-idx')));
    });

    el('cue-list').addEventListener('change', (event) => {
      if (!event.target.classList.contains('cue-time-input')) return;
      const idx = Number(event.target.getAttribute('data-idx'));
      const value = event.target.value.trim();
      const parsed = value ? engine().parseClockValue(value) : null;
      if (value && parsed === null) {
        toast('Usa formato mm:ss.cc', 'warn');
        renderEditorList();
        return;
      }
      setCueTime(idx, parsed);
    });
  }

  function bindLibraryEvents() {
    document.addEventListener('click', (event) => {
      const localTrigger = event.target.closest('[data-load-local]');
      const localId = localTrigger && localTrigger.getAttribute('data-load-local');
      if (localId) {
        const pkg = packages().listLocal().find((item) => item.id === localId);
        if (pkg) loadPackage(pkg);
        return;
      }

      const deleteTrigger = event.target.closest('[data-delete-local]');
      const deleteId = deleteTrigger && deleteTrigger.getAttribute('data-delete-local');
      if (deleteId) {
        packages().removeLocal(deleteId);
        renderLibrary();
        toast('Package local eliminado', 'ok');
        return;
      }

      const songTrigger = event.target.closest('[data-load-song]');
      const songId = songTrigger && songTrigger.getAttribute('data-load-song');
      if (songId) {
        const song = state.catalogSongs.find((item) => item.id === songId);
        if (song) loadPackage(packages().fromCatalogSong(song));
      }
    });
  }

  function seekBy(deltaMs) {
    const audio = audioEl();
    if (!audio) return;
    audio.currentTime = Math.max(0, (audio.currentTime || 0) + (deltaMs / 1000));
    updatePlaybackUi();
  }

  function togglePlayback() {
    const audio = audioEl();
    if (!audio || !audio.src) {
      toast('Carga un audio primero', 'warn');
      return;
    }
    if (audio.paused) audio.play().catch(() => toast('No se pudo reproducir', 'warn'));
    else audio.pause();
  }

  function bindHotkeys() {
    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const isTyping = target && (
        target.tagName === 'TEXTAREA' ||
        (target.tagName === 'INPUT' && !target.classList.contains('cue-time-input'))
      );

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveLocalPackage();
        return;
      }

      if (isTyping) return;

      if (event.key === ' ') {
        event.preventDefault();
        if (event.shiftKey) togglePlayback();
        else captureCurrentTime();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIdx(state.activeIdx - 1);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIdx(state.activeIdx + 1);
        return;
      }

      const lower = event.key.toLowerCase();
      if (lower === 'a') {
        event.preventDefault();
        nudgeActive(event.shiftKey ? -500 : -100);
      } else if (lower === 'd') {
        event.preventDefault();
        nudgeActive(event.shiftKey ? 500 : 100);
      } else if (lower === 'j') {
        event.preventDefault();
        seekBy(-2000);
      } else if (lower === 'k') {
        event.preventDefault();
        seekBy(2000);
      }
    });
  }

  function bindStyleEvents() {
    const helper = styleHelper();
    if (!helper) return;
    populateStyleChoices();

    const fontSelect = el('tp-style-font-family');
    const alignSelect = el('tp-style-align');
    if (fontSelect) {
      fontSelect.addEventListener('change', (event) => {
        const option = helper.fontOptions().find((item) => item.id === event.target.value) || helper.fontOptions()[0];
        setDisplayStyle(Object.assign({}, state.displayStyle, {
          presetKey: '',
          fontPreset: option.id,
          fontFamily: option.value
        }));
      });
    }
    if (alignSelect) {
      alignSelect.addEventListener('change', (event) => {
        setDisplayStyle(Object.assign({}, state.displayStyle, {
          presetKey: '',
          textAlign: event.target.value
        }));
      });
    }

    const sliderConfig = [
      ['tp-style-font-size', 'fontSizeRem'],
      ['tp-style-line-height', 'lineHeight'],
      ['tp-style-letter-spacing', 'letterSpacingEm'],
      ['tp-style-max-width', 'maxWidthPx'],
      ['tp-style-glow', 'glowAlpha'],
      ['tp-style-top-padding', 'stageTopVh'],
      ['tp-style-bottom-padding', 'stageBottomVh'],
      ['tp-style-active-scale', 'activeScale']
    ];

    sliderConfig.forEach((item) => {
      const node = el(item[0]);
      if (!node) return;
      node.addEventListener('input', (event) => {
        setDisplayStyle(Object.assign({}, state.displayStyle, {
          presetKey: '',
          [item[1]]: Number(event.target.value)
        }));
      });
    });

    document.addEventListener('click', (event) => {
      const presetBtn = event.target.closest('[data-style-preset]');
      if (presetBtn) {
        setDisplayStyle(helper.preset(presetBtn.getAttribute('data-style-preset')));
      }
    });

    const saveBtn = el('tp-style-save-default');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        helper.save(state.displayStyle);
        toast('Look base guardado', 'ok');
      });
    }

    const resetBtn = el('tp-style-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        setDisplayStyle(helper.defaultStyle());
      });
    }
  }

  editor.init = function() {
    loadPackage(packages().createEmpty());
    bindEditorEvents();
    bindLibraryEvents();
    bindHotkeys();
    bindStyleEvents();

    el('lyrics-build-cues').addEventListener('click', rebuildFromTextarea);
    el('lrc-auto-spread').addEventListener('click', autoSpread);
    el('lrc-normalize').addEventListener('click', normalizeTimeline);
    el('lrc-clear-all').addEventListener('click', clearAllTimes);
    el('lrc-capture-now').addEventListener('click', () => captureCurrentTime());
    el('lrc-clear-current').addEventListener('click', () => setCueTime(state.activeIdx, null));
    el('lrc-play-pause').addEventListener('click', togglePlayback);
    el('lrc-seek-back').addEventListener('click', () => seekBy(-2000));
    el('lrc-seek-forward').addEventListener('click', () => seekBy(2000));
    el('lrc-save-local').addEventListener('click', saveLocalPackage);
    el('lrc-save-catalog').addEventListener('click', saveToCatalog);
    el('lrc-export-lrc').addEventListener('click', () => {
      const pkg = refreshDerived();
      packages().exportLRC(pkg);
    });
    el('lrc-export-json').addEventListener('click', () => {
      const pkg = refreshDerived();
      packages().exportJSON(pkg);
    });
    el('lrc-copy-lrc').addEventListener('click', () => {
      const pkg = refreshDerived();
      copyText(pkg.lrcText || pkg.lyricsPlain, 'LRC copiado');
    });
    el('lrc-copy-twin').addEventListener('click', () => {
      const pkg = refreshDerived();
      copyText(JSON.stringify(packages().toTwinPayload(pkg, currentPlayback()), null, 2), 'Payload gemelo copiado');
    });
    el('lrc-open-twin').addEventListener('click', openTwinWindow);
    el('lrc-copy-twin-link').addEventListener('click', copyTwinLink);

    el('lrc-audio-file').addEventListener('change', (event) => loadLocalAudio(event.target.files && event.target.files[0]));
    el('lrc-import-file').addEventListener('change', (event) => handleImportFile(event.target.files && event.target.files[0]));
    el('lrc-local-filter').addEventListener('input', renderLibrary);
    el('lrc-catalog-filter').addEventListener('input', renderLibrary);

    ['pkg-title', 'pkg-artist', 'pkg-offset', 'pkg-notes'].forEach((id) => {
      el(id).addEventListener('input', () => {
        refreshDerived();
        renderStats();
        updatePreview();
        broadcastTwinState('meta');
      });
    });

    const audio = audioEl();
    ['timeupdate', 'loadedmetadata', 'play', 'pause', 'seeked', 'ratechange', 'durationchange'].forEach((eventName) => {
      audio.addEventListener(eventName, updatePlaybackUi);
    });

    ensureTwinSession();
    ensureTwinTransport();
    renderTwinMeta();
    fetchCatalog();
  };
})(window.VibeFlow);

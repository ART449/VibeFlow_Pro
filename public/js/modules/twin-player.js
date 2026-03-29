(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const twinPlayer = VF.modules.twinPlayer = {};

  const state = {
    sessionId: '',
    transport: null,
    envelope: null,
    cues: [],
    rafId: 0,
    lastResolvedIdx: -1
  };

  function engine() {
    return VF.modules.lrcEngine;
  }

  function sync() {
    return VF.modules.twinSync;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function parseQuery() {
    const params = new URLSearchParams(location.search);
    return {
      sessionId: params.get('session') || ''
    };
  }

  function renderHeader() {
    const payload = state.envelope && state.envelope.payload;
    el('twin-session').textContent = state.sessionId || '-';
    el('twin-title').textContent = payload && payload.title ? payload.title : 'Esperando package...';
    el('twin-artist').textContent = payload && payload.artist ? payload.artist : 'Sin artista';
    el('twin-mode').textContent = payload && payload.playing ? 'En vivo' : 'En espera';
  }

  function setStatus(ok, label) {
    const dot = el('twin-conn-dot');
    const text = el('twin-conn-text');
    if (dot) dot.classList.toggle('ok', !!ok);
    if (text) text.textContent = label || (ok ? 'Conectado' : 'Sin enlace');
  }

  function setCuesFromPayload(payload) {
    const sourceText = payload && payload.lrcText ? payload.lrcText : payload && payload.lyricsPlain ? payload.lyricsPlain : '';
    state.cues = engine().textToCues(sourceText);
    state.lastResolvedIdx = -1;
    renderLines();
  }

  function renderLines() {
    const display = el('twin-lines');
    if (!state.cues.length) {
      display.innerHTML = '<div class="twin-empty">Todavia no llega un Song Package al gemelo.</div>';
      return;
    }

    display.innerHTML = state.cues.map((cue, index) =>
      '<div class="twin-line" data-line-idx="' + index + '">' + escapeHtml(cue.text) + '</div>'
    ).join('');
  }

  function effectiveTimeMs() {
    const payload = state.envelope && state.envelope.payload;
    if (!payload) return 0;
    const base = Math.max(0, Math.round(Number(payload.currentTimeMs) || 0));
    if (!payload.playing) return base;

    const stamp = Number(state.envelope.ts) || Date.now();
    const drift = Math.max(0, Date.now() - stamp);
    const rate = Number(payload.rate) || 1;
    return Math.max(0, Math.round(base + drift * rate));
  }

  function updateClock() {
    const payload = state.envelope && state.envelope.payload;
    const currentMs = effectiveTimeMs();
    const currentLabel = engine().formatClockValue(currentMs);
    const offsetLabel = payload ? ((payload.globalOffsetMs >= 0 ? '+' : '') + String(payload.globalOffsetMs || 0) + 'ms') : '0ms';
    el('twin-clock').textContent = currentLabel;
    el('twin-offset').textContent = offsetLabel;
  }

  function updateProgress() {
    const fill = el('twin-progress-fill');
    if (!fill || !state.cues.length) return;
    const resolvedIdx = resolveActiveIdx();
    const pct = resolvedIdx < 0 ? 0 : Math.min(100, ((resolvedIdx + 1) / state.cues.length) * 100);
    fill.style.width = pct.toFixed(2) + '%';
  }

  function resolveActiveIdx() {
    const payload = state.envelope && state.envelope.payload;
    if (!payload || !state.cues.length) return -1;
    const byTime = engine().resolveActiveCueIndex(state.cues, effectiveTimeMs(), Number(payload.globalOffsetMs) || 0);
    if (byTime >= 0) return byTime;
    const fallbackLine = Number(payload.activeLineIndex);
    return Number.isFinite(fallbackLine) ? fallbackLine : -1;
  }

  function updateActiveLine() {
    const idx = resolveActiveIdx();
    if (idx === state.lastResolvedIdx) return;
    state.lastResolvedIdx = idx;

    const lines = document.querySelectorAll('.twin-line');
    lines.forEach((line, lineIdx) => {
      line.classList.toggle('past', idx >= 0 && lineIdx < idx);
      line.classList.toggle('active', lineIdx === idx);
    });

    if (idx >= 0) {
      const active = document.querySelector('.twin-line.active');
      if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function renderEnvelope() {
    renderHeader();
    updateClock();
    updateProgress();
    updateActiveLine();
  }

  function loop() {
    renderEnvelope();
    state.rafId = requestAnimationFrame(loop);
  }

  function consumeEnvelope(envelope) {
    if (!envelope || !envelope.payload) return;
    const prevPayload = state.envelope && state.envelope.payload;
    const prevSignature = prevPayload ? [prevPayload.songId, prevPayload.lrcText, prevPayload.lyricsPlain].join('::') : '';
    const nextPayload = envelope.payload;
    const nextSignature = [nextPayload.songId, nextPayload.lrcText, nextPayload.lyricsPlain].join('::');

    state.envelope = envelope;
    setStatus(true, 'Sesion local activa');
    if (prevSignature !== nextSignature) setCuesFromPayload(nextPayload);
    renderEnvelope();
  }

  twinPlayer.init = function() {
    const query = parseQuery();
    state.sessionId = query.sessionId || localStorage.getItem('byflow_twin_last_session_v1') || '';

    if (!state.sessionId) {
      setStatus(false, 'Falta session');
      return;
    }

    localStorage.setItem('byflow_twin_last_session_v1', state.sessionId);
    renderHeader();

    const snapshot = sync().loadSnapshot(state.sessionId);
    if (snapshot) consumeEnvelope(snapshot);
    else setStatus(false, 'Esperando emisor');

    state.transport = sync().createTransport(state.sessionId, function(message) {
      consumeEnvelope(message);
    });

    cancelAnimationFrame(state.rafId);
    loop();
  };
})(window.VibeFlow);

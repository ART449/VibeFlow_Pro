var allSongs = [];
var abAudio = null;
var dragSrcId = null;
var mesasCollapsed = localStorage.getItem('mesas_collapsed') !== 'false';
var localAudio = null;
var _tutorialStep = 0;
var TUTORIAL_STEPS = 5;
var _palabrasProhibidas = ['puta', 'puto', 'mierda', 'coño', 'pendejo', 'culero', 'chinga', 'verga', 'idiota', 'fuck', 'shit', 'bitch', 'asshole'];

(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const misc = VF.modules.miscUi = {};

  function expose(name, value) {
    misc[name] = value;
    window[name] = value;
  }

  function escHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  function showToast(msg, type) {
    const t = document.getElementById('toast');
    if (!t) return;
    const icons = { success: '\u2714', error: '\u2715', warning: '!', info: '\u2139' };
    t.className = '';
    if (type && icons[type]) {
      t.innerHTML = '<span class="t-icon">' + icons[type] + '</span><span class="t-msg">' + escHtml(msg) + '</span>';
      t.classList.add('t-' + type);
    } else {
      t.innerHTML = '<span class="t-msg">' + escHtml(msg) + '</span>';
    }
    t.offsetHeight;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  async function fetchSongs() {
    try {
      const r = await fetch('/api/canciones');
      allSongs = await r.json();
    } catch {
      allSongs = [];
    }
  }

  function openCatalog() {
    fetchSongs().then(() => renderCatalog());
    document.getElementById('catalog-overlay').classList.add('open');
    document.getElementById('catalog-search').value = '';
    setTimeout(() => document.getElementById('catalog-search').focus(), 100);
  }

  function closeCatalog() {
    document.getElementById('catalog-overlay').classList.remove('open');
  }

  function filterCatalog() {
    renderCatalog(document.getElementById('catalog-search').value.trim());
  }

  function renderCatalog(filter) {
    const q = (filter || '').toLowerCase();
    const list = q ? allSongs.filter((song) => (song.titulo || '').toLowerCase().includes(q) || (song.artista || '').toLowerCase().includes(q)) : allSongs;
    const el = document.getElementById('catalog-list');
    const count = document.getElementById('catalog-count');
    if (!el || !count) return;
    count.textContent = list.length + ' cancion' + (list.length !== 1 ? 'es' : '');
    if (!list.length) {
      el.innerHTML = '<div class="catalog-empty">No se encontraron canciones' + (q ? ' para "' + escHtml(q) + '"' : '') + '</div>';
      return;
    }
    el.innerHTML = list.map((song) => `
      <div class="catalog-item">
        <div class="ci-icon">&#x1F3B5;</div>
        <div class="ci-info">
          <div class="ci-title">${escHtml(song.titulo)}</div>
          <div class="ci-artist">${escHtml(song.artista || 'Sin artista')}</div>
        </div>
        <div class="ci-actions">
          <button class="ci-btn load" onclick="loadSong('${song.id}')" title="Cargar en teleprompter">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Cargar
          </button>
          <button class="ci-btn del" onclick="deleteSong('${song.id}')" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          </button>
        </div>
      </div>`).join('');
  }

  async function loadSong(id) {
    const song = allSongs.find((item) => item.id === id);
    if (!song) return;
    if (song.letra) {
      setLyrics(song.letra);
      if (window.socket) window.socket.emit('tp_lyrics', { lyrics: song.letra });
      showToast('\u2705 Cargada: ' + song.titulo);
    } else {
      showToast('\u26A0\uFE0F "' + song.titulo + '" no tiene letra');
    }
    closeCatalog();
  }

  async function deleteSong(id) {
    try {
      await fetch('/api/canciones/' + id, { method: 'DELETE' });
      allSongs = allSongs.filter((song) => song.id !== id);
      renderCatalog(document.getElementById('catalog-search').value.trim());
      showToast('\u{1F5D1}\uFE0F Cancion eliminada');
    } catch {}
  }

  function makeDraggable(el, id) {
    el.setAttribute('draggable', 'true');
    el.dataset.itemId = id;
    el.addEventListener('dragstart', (event) => {
      dragSrcId = id;
      el.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      document.querySelectorAll('.queue-item.drag-over').forEach((item) => item.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', async (event) => {
      event.preventDefault();
      el.classList.remove('drag-over');
      const targetId = el.dataset.itemId;
      if (!dragSrcId || dragSrcId === targetId) return;
      const ids = (window.colaCache || []).map((item) => item.id);
      const srcIdx = ids.indexOf(dragSrcId);
      const targetIdx = ids.indexOf(targetId);
      if (srcIdx === -1 || targetIdx === -1) return;
      ids.splice(srcIdx, 1);
      ids.splice(targetIdx, 0, dragSrcId);
      try {
        await fetch('/api/cola/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: ids })
        });
        fetchCola();
      } catch {}
      dragSrcId = null;
    });
  }

  function openLegalModal() {
    document.getElementById('legal-overlay').classList.add('open');
  }

  function closeLegalModal() {
    document.getElementById('legal-overlay').classList.remove('open');
  }

  function toggleMesasPanel() {
    mesasCollapsed = !mesasCollapsed;
    localStorage.setItem('mesas_collapsed', mesasCollapsed);
    applyMesasCollapse();
  }

  function applyMesasCollapse() {
    const grid = document.getElementById('grid-mesas');
    const icon = document.getElementById('mesas-toggle-icon');
    if (grid) grid.classList.toggle('collapsed', mesasCollapsed);
    if (icon) icon.classList.toggle('collapsed', mesasCollapsed);
  }

  function forceCloseWelcome() {
    const overlay = document.getElementById('welcome-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .3s';
      setTimeout(() => overlay.classList.add('hidden'), 300);
    }
  }

  function welcomeSelect(mode) {
    if (mode === 'remote') {
      forceCloseWelcome();
      if (typeof dismissWelcome === 'function') dismissWelcome();
      setMode(mode);
      return;
    }
    const freeModes = ['karaoke', 'estudio'];
    const uid = localStorage.getItem('byflow_user_uid');
    if (!freeModes.includes(mode) && !uid && !window._fbUser) {
      showToast('Inicia sesion para usar este modo', 'warning');
      return;
    }
    const proModes = ['youtube', 'ia'];
    if (proModes.includes(mode) && !isPremium()) {
      showToast('Modo PRO - Necesitas licencia activa. Usa DEMO-BYFLOW-2026 para probar.', 'warning');
      return;
    }
    const card = document.querySelector('.welcome-card[data-mode="' + mode + '"]');
    if (card) {
      const rect = card.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      ripple.classList.add('wc-ripple');
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (rect.width / 2 - size / 2) + 'px';
      ripple.style.top = (rect.height / 2 - size / 2) + 'px';
      card.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);
    }
    setTimeout(() => {
      forceCloseWelcome();
      try { dismissWelcome(); } catch {}
      setMode(mode);
    }, 150);
  }

  function toggleModeMore() {
    const dd = document.getElementById('mode-dropdown');
    if (dd) dd.classList.toggle('open');
  }

  function closeModeMore() {
    const dd = document.getElementById('mode-dropdown');
    if (dd) dd.classList.remove('open');
  }

  function togglePlayerBar() {
    const pb = document.getElementById('player-bar-main');
    const fx = document.querySelector('.fx-bar');
    const btn = document.getElementById('player-bar-toggle');
    if (!pb) return;
    pb.classList.toggle('collapsed');
    const collapsed = pb.classList.contains('collapsed');
    if (fx) fx.style.display = collapsed ? 'none' : '';
    if (btn) btn.innerHTML = collapsed ? '&#x25B2;' : '&#x25BC;';
    localStorage.setItem('byflow_player_hidden', collapsed ? '1' : '');
  }

  function seekPlayerProgress(event) {
    const track = event.currentTarget;
    const rect = track.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    const fill = document.getElementById('player-progress-fill');
    if (fill) fill.style.width = pct + '%';
  }

  function toggleSidebar() {
    const sb = document.querySelector('.sidebar');
    const btn = document.getElementById('toggle-sidebar');
    if (!sb) return;
    sb.classList.toggle('panel-hidden');
    if (btn) btn.innerHTML = sb.classList.contains('panel-hidden') ? '&#x25B6;' : '&#x25C0;';
    localStorage.setItem('byflow_sidebar_hidden', sb.classList.contains('panel-hidden') ? '1' : '');
  }

  function toggleRightPanel() {
    const rp = document.querySelector('.right-panel');
    const btn = document.getElementById('toggle-right');
    if (!rp) return;
    rp.classList.toggle('panel-hidden');
    if (btn) btn.innerHTML = rp.classList.contains('panel-hidden') ? '&#x25C0;' : '&#x25B6;';
    localStorage.setItem('byflow_right_hidden', rp.classList.contains('panel-hidden') ? '1' : '');
  }

  function textoLimpio(texto) {
    if (!texto) return true;
    const lower = texto.toLowerCase();
    return !_palabrasProhibidas.some((item) => lower.includes(item));
  }

  function openLocalAudio() {
    return VF.modules.player.openLocalAudio.apply(this, arguments);
  }

  function handleLocalAudio() {
    return VF.modules.player.handleLocalAudio.apply(this, arguments);
  }

  function openTutorial() {
    _tutorialStep = 0;
    updateTutorial();
    document.getElementById('tutorial-overlay').classList.add('open');
  }

  function closeTutorial() {
    document.getElementById('tutorial-overlay').classList.remove('open');
    localStorage.setItem('byflow_tutorial_done', '1');
  }

  function nextTutorialStep() {
    _tutorialStep += 1;
    if (_tutorialStep >= TUTORIAL_STEPS) {
      closeTutorial();
      return;
    }
    updateTutorial();
  }

  function updateTutorial() {
    document.querySelectorAll('.tutorial-step').forEach((step) => step.classList.remove('active'));
    const step = document.querySelector('.tutorial-step[data-step="' + _tutorialStep + '"]');
    if (step) step.classList.add('active');
    const dots = document.getElementById('tutorial-dots');
    if (!dots) return;
    dots.innerHTML = '';
    for (let i = 0; i < TUTORIAL_STEPS; i += 1) {
      const dot = document.createElement('div');
      dot.className = 'tutorial-dot' + (i === _tutorialStep ? ' active' : '');
      dot.onclick = () => {
        _tutorialStep = i;
        updateTutorial();
      };
      dots.appendChild(dot);
    }
    const nextBtn = document.getElementById('tutorial-next');
    if (nextBtn) nextBtn.textContent = _tutorialStep === TUTORIAL_STEPS - 1 ? 'Empezar' : 'Siguiente';
    const skipBtn = document.getElementById('tutorial-skip');
    if (skipBtn) skipBtn.style.display = _tutorialStep === TUTORIAL_STEPS - 1 ? 'none' : '';
  }

  function adRenderMini(container) {
    if (typeof isPremium === 'function' && isPremium()) return;
    fetch('/api/ads').then((response) => response.json()).then((ads) => {
      if (!Array.isArray(ads) || !ads.length) return;
      const ad = ads[Math.floor(Math.random() * ads.length)];
      const el = document.createElement('a');
      el.className = 'ad-mini';
      el.href = ad.url || '#';
      el.target = ad.url && ad.url.startsWith('http') ? '_blank' : '_self';
      el.rel = 'noopener';
      el.innerHTML = '<div class="ad-mini-icon" style="background:' + (ad.bg || 'rgba(255,138,0,.1)') + ';">' +
        (ad.id === 'pro' ? '&#x2B50;' : '&#x1F4E2;') + '</div>' +
        '<div class="ad-mini-text"><div class="ad-mini-title">' + (ad.title || '') + '</div>' +
        '<div class="ad-mini-desc">' + (ad.text || '').substring(0, 60) + '</div></div>' +
        '<span class="ad-mini-tag">Ad</span>';
      const target = typeof container === 'string' ? document.getElementById(container) : container;
      if (target) target.appendChild(el);
    }).catch(() => {});
  }

  function bindStaticUi() {
    document.addEventListener('keydown', (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      switch (event.key) {
        case ' ':
          event.preventDefault();
          toggleAutoScroll();
          break;
        case 'ArrowRight':
          event.preventDefault();
          tpNext();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          tpPrev();
          break;
        case 'ArrowUp':
          event.preventDefault();
          tpSpeedUp();
          break;
        case 'ArrowDown':
          event.preventDefault();
          tpSpeedDown();
          break;
        case 'r':
        case 'R':
          tpReset();
          break;
        case 'f':
        case 'F':
          tpToggleFullscreen();
          break;
        case 'l':
        case 'L':
          openLyricsSearch();
          break;
        case 'Escape':
          if (document.querySelector('.center.tp-fullscreen')) tpToggleFullscreen();
          closeCatalog();
          closeLegalModal();
          closeLyricsSearch();
          closeColaModal();
          closeLyricStudio();
          break;
        case 'PageDown':
          event.preventDefault();
          tpNextLine();
          break;
        case 'PageUp':
          event.preventDefault();
          tpPrevLine();
          break;
        case '[':
          tpSyncNudge(-0.5);
          showToast('Sync: ' + (tpState.syncOffset >= 0 ? '+' : '') + tpState.syncOffset.toFixed(1) + 's', 'info');
          break;
        case ']':
          tpSyncNudge(0.5);
          showToast('Sync: ' + (tpState.syncOffset >= 0 ? '+' : '') + tpState.syncOffset.toFixed(1) + 's', 'info');
          break;
        case '\\':
          tpSyncReset();
          showToast('Sync reset', 'info');
          break;
      }
    }, true);

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.mode-more')) closeModeMore();
    });

    if (localStorage.getItem('byflow_player_hidden') === '1') {
      document.getElementById('player-bar-main')?.classList.add('collapsed');
      const fx = document.querySelector('.fx-bar');
      if (fx) fx.style.display = 'none';
      const btn = document.getElementById('player-bar-toggle');
      if (btn) btn.innerHTML = '&#x25B2;';
    }

    (function initWaveform() {
      const canvas = document.getElementById('waveform-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const bars = 80;
      let heights = Array.from({ length: bars }, () => Math.random() * 0.3 + 0.1);
      let isPlaying = false;

      function resize() {
        const wrap = canvas.parentElement;
        canvas.width = wrap.offsetWidth * 2;
        canvas.height = wrap.offsetHeight * 2;
      }

      function draw() {
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const barW = w / bars;
        const gap = 2;
        for (let i = 0; i < bars; i += 1) {
          if (isPlaying) heights[i] += (Math.random() - 0.5) * 0.08;
          heights[i] = Math.max(0.05, Math.min(1, heights[i]));
          const barH = heights[i] * h * 0.85;
          const x = i * barW + gap / 2;
          const gradient = ctx.createLinearGradient(0, h - barH, 0, h);
          gradient.addColorStop(0, 'rgba(0,229,255,0.8)');
          gradient.addColorStop(1, 'rgba(0,184,212,0.3)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x, h - barH, barW - gap, barH);
        }
        requestAnimationFrame(draw);
      }

      resize();
      window.addEventListener('resize', resize);
      draw();

      window._waveformSetPlaying = function(playing) {
        isPlaying = playing;
      };
      window._waveformUpdateNowPlaying = function(title, artist) {
        const t = document.getElementById('np-title');
        const a = document.getElementById('np-artist');
        if (t) t.textContent = title || 'ByFlow';
        if (a) a.textContent = artist || 'Vive Cantando';
      };
    })();

    if (localStorage.getItem('byflow_sidebar_hidden') === '1') {
      document.querySelector('.sidebar')?.classList.add('panel-hidden');
      const btn = document.getElementById('toggle-sidebar');
      if (btn) btn.innerHTML = '&#x25B6;';
    }
    if (localStorage.getItem('byflow_right_hidden') === '1') {
      document.querySelector('.right-panel')?.classList.add('panel-hidden');
      const btn = document.getElementById('toggle-right');
      if (btn) btn.innerHTML = '&#x25C0;';
    }
    if (!localStorage.getItem('byflow_tutorial_done')) {
      setTimeout(openTutorial, 1500);
    }
    setTimeout(() => {
      const cola = document.getElementById('lista-cola');
      if (cola && cola.parentNode) adRenderMini(cola.parentNode);
    }, 5000);
    setTimeout(() => {
      const uid = localStorage.getItem('byflow_user_uid') || 'anon';
      fetch('/api/analytics/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      }).catch(() => {});
    }, 3000);

    (function bindWelcomeButtons() {
      const gBtn = document.getElementById('btn-google-login');
      if (gBtn) {
        gBtn.addEventListener('click', () => {
          if (typeof socialLogin === 'function') socialLogin('google');
          else showToast('Cargando... intenta en 2 segundos', 'warning');
        });
      }

      const qBtn = document.getElementById('btn-quick-enter');
      if (qBtn) {
        qBtn.addEventListener('click', () => {
          const name = (document.getElementById('bf-name-input').value || '').trim();
          const email = (document.getElementById('bf-email-input').value || '').trim();
          if (!name) {
            showToast('Escribe tu nombre para entrar', 'warning');
            document.getElementById('bf-name-input').focus();
            return;
          }
          if (!email || !email.includes('@')) {
            showToast('Escribe un email valido para identificarte', 'warning');
            document.getElementById('bf-email-input').focus();
            return;
          }
          localStorage.setItem('byflow_user_name', name);
          localStorage.setItem('byflow_user_email', email);
          localStorage.setItem('byflow_user_uid', 'email_' + btoa(email).replace(/=/g, ''));
          showToast('Bienvenido, ' + name + '!', 'success');
          fetch('/api/analytics/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: email, name, type: 'register' })
          }).catch(() => {});
          forceCloseWelcome();
          try { if (typeof dismissWelcome === 'function') dismissWelcome(); } catch {}
          setMode('karaoke');
        });
      }

      const nameInp = document.getElementById('bf-name-input');
      const emailInp = document.getElementById('bf-email-input');
      if (nameInp) nameInp.addEventListener('keydown', (event) => { if (event.key === 'Enter' && emailInp) emailInp.focus(); });
      if (emailInp && qBtn) emailInp.addEventListener('keydown', (event) => { if (event.key === 'Enter') qBtn.click(); });
    })();
  }

  expose('escHtml', escHtml);
  expose('showToast', showToast);
  expose('fetchSongs', fetchSongs);
  expose('openCatalog', openCatalog);
  expose('closeCatalog', closeCatalog);
  expose('filterCatalog', filterCatalog);
  expose('renderCatalog', renderCatalog);
  expose('loadSong', loadSong);
  expose('deleteSong', deleteSong);
  expose('makeDraggable', makeDraggable);
  expose('openLegalModal', openLegalModal);
  expose('closeLegalModal', closeLegalModal);
  expose('toggleMesasPanel', toggleMesasPanel);
  expose('applyMesasCollapse', applyMesasCollapse);
  expose('_forceCloseWelcome', forceCloseWelcome);
  expose('welcomeSelect', welcomeSelect);
  expose('toggleModeMore', toggleModeMore);
  expose('closeModeMore', closeModeMore);
  expose('togglePlayerBar', togglePlayerBar);
  expose('seekPlayerProgress', seekPlayerProgress);
  expose('toggleSidebar', toggleSidebar);
  expose('toggleRightPanel', toggleRightPanel);
  expose('textoLimpio', textoLimpio);
  expose('openLocalAudio', openLocalAudio);
  expose('handleLocalAudio', handleLocalAudio);
  expose('openTutorial', openTutorial);
  expose('closeTutorial', closeTutorial);
  expose('nextTutorialStep', nextTutorialStep);
  expose('updateTutorial', updateTutorial);
  expose('adRenderMini', adRenderMini);
  bindStaticUi();
})(window.VibeFlow = window.VibeFlow || {});

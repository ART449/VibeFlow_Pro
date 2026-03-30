(function initVibeFlowModeSwitch(ns) {
  'use strict';

  const utils = ns.Utils || { exposeGlobal() {} };

  let currentMode = 'karaoke';
  let _previousMode = 'karaoke';

  function syncGlobals() {
    utils.exposeGlobal('currentMode', currentMode);
    utils.exposeGlobal('_previousMode', _previousMode);
  }

  function updateBodyModeClass(mode) {
    document.body.className = document.body.className.replace(/mode-\S+/g, '').trim();
    document.body.classList.add('mode-' + mode);
  }

  function toast(message, type) {
    if (typeof showToast === 'function') return showToast(message, type);
    if (utils.showToast) return utils.showToast(message, type);
  }

  function resetPanels() {
    const sidebar = document.querySelector('.sidebar');
    const rightPanel = document.querySelector('.right-panel');
    const iaPanel = document.getElementById('ia-panel');
    const ytPanel = document.getElementById('yt-panel');
    const baresPanel = document.getElementById('bares-panel');
    const settingsPanel = document.getElementById('settings-panel');
    const vistasPanel = document.getElementById('vistas-panel');
    const estudioPanel = document.getElementById('estudio-panel');

    if (sidebar) sidebar.style.display = 'none';
    if (rightPanel) rightPanel.style.display = 'none';
    if (iaPanel) { iaPanel.classList.remove('active'); iaPanel.style.display = 'none'; }
    if (ytPanel) { ytPanel.classList.remove('active'); ytPanel.style.display = 'none'; }
    if (baresPanel) { baresPanel.classList.remove('active'); baresPanel.style.display = 'none'; }
    if (settingsPanel) { settingsPanel.classList.remove('active'); settingsPanel.style.display = 'none'; }
    if (vistasPanel) { vistasPanel.classList.remove('active'); vistasPanel.style.display = 'none'; }
    if (estudioPanel) { estudioPanel.classList.remove('active'); estudioPanel.style.display = 'none'; }

    return {
      sidebar,
      rightPanel,
      iaPanel,
      ytPanel,
      baresPanel,
      settingsPanel,
      vistasPanel,
      estudioPanel
    };
  }

  function restoreShellElements() {
    const topbar = document.querySelector('.topbar');
    const playerBar = document.querySelector('.player-bar');
    const fxBar = document.querySelector('.fx-bar');
    const vizBar = document.getElementById('viz-container');
    const nsNext = document.querySelector('.ns-next-btn');
    const fsBtn = document.querySelector('.tp-fullscreen-btn');
    const tpWelcome = document.getElementById('tp-welcome');
    const mobileNavEl = document.querySelector('.mobile-nav');
    const centerEl = document.querySelector('.center');

    if (topbar) topbar.style.display = '';
    if (playerBar) playerBar.style.display = '';
    if (fxBar) fxBar.style.display = '';
    if (vizBar) vizBar.style.display = '';
    if (nsNext) nsNext.style.display = '';
    if (fsBtn) fsBtn.style.display = '';
    if (tpWelcome) tpWelcome.style.display = '';
    if (mobileNavEl) mobileNavEl.style.display = '';
    if (centerEl) centerEl.style.paddingBottom = '';
  }

  function toggleMode(mode) {
    if (currentMode === mode) {
      setMode(_previousMode || 'karaoke');
    } else {
      setMode(mode);
    }
  }

  function setMode(mode) {
    const barModeActive = typeof isBarMode !== 'undefined' && isBarMode;
    const fbUser = typeof _fbUser !== 'undefined' ? _fbUser : null;

    if (mode === 'bares' && !barModeActive) {
      toast('Modo Bares disponible solo desde POS o enlace de bar', 'info');
      return;
    }

    const noAuthModes = ['settings', 'remote'];
    if (!noAuthModes.includes(mode)) {
      const uid = localStorage.getItem('byflow_user_uid');
      if (!uid && !fbUser) {
        toast('Inicia sesion primero', 'warning');
        return;
      }
    }

    const proModes = ['youtube', 'bares', 'ia'];
    if (proModes.includes(mode) && typeof isPremium === 'function' && !isPremium()) {
      toast('Modo PRO - Necesitas licencia activa', 'warning');
      return;
    }

    if (currentMode && currentMode !== mode) _previousMode = currentMode;
    currentMode = mode;
    syncGlobals();

    localStorage.setItem('byflow_last_mode', mode);
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));

    updateBodyModeClass(mode);

    const shell = resetPanels();
    restoreShellElements();

    const isMobile = window.innerWidth <= 900;
    if (mode === 'karaoke') {
      if (shell.sidebar && !isMobile) shell.sidebar.style.display = 'flex';
      if (shell.rightPanel && !isMobile) shell.rightPanel.style.display = 'flex';
    } else if (mode === 'remote') {
      const topbar = document.querySelector('.topbar');
      const playerBar = document.querySelector('.player-bar');
      const fxBar = document.querySelector('.fx-bar');
      const vizBar = document.getElementById('viz-container');
      const mobileNav = document.querySelector('.mobile-nav');
      const nsNext = document.querySelector('.ns-next-btn');
      const fsBtn = document.querySelector('.tp-fullscreen-btn');
      const embed = document.getElementById('music-player-embed');
      const tpWelcome = document.getElementById('tp-welcome');
      const centerEl = document.querySelector('.center');

      if (topbar) topbar.style.display = 'none';
      if (playerBar) playerBar.style.display = 'none';
      if (fxBar) fxBar.style.display = 'none';
      if (vizBar) vizBar.style.display = 'none';
      if (mobileNav) mobileNav.style.display = 'none';
      if (nsNext) nsNext.style.display = 'none';
      if (fsBtn) fsBtn.style.display = 'none';
      if (embed) embed.style.display = 'none';
      if (tpWelcome) tpWelcome.style.display = 'none';
      if (centerEl) centerEl.style.paddingBottom = '0';
    } else if (mode === 'ia') {
      if (shell.sidebar && !isMobile) shell.sidebar.style.display = 'flex';
      if (shell.iaPanel) {
        shell.iaPanel.classList.add('active');
        shell.iaPanel.style.display = 'flex';
      }
      if (typeof checkOllamaStatus === 'function') checkOllamaStatus();
    } else if (mode === 'youtube') {
      if (shell.sidebar && !isMobile) shell.sidebar.style.display = 'flex';
      if (shell.ytPanel) {
        shell.ytPanel.classList.add('active');
        shell.ytPanel.style.display = 'flex';
      }
    } else if (mode === 'bares') {
      if (shell.baresPanel) {
        shell.baresPanel.classList.add('active');
        shell.baresPanel.style.display = 'flex';
      }
      if (typeof baresInit === 'function') baresInit();
    } else if (mode === 'estudio') {
      const mainEl = document.querySelector('.main');
      if (mainEl) mainEl.style.display = 'none';
      if (shell.estudioPanel) {
        shell.estudioPanel.classList.add('active');
        shell.estudioPanel.style.display = 'grid';
      }
    } else if (mode === 'vistas') {
      const mainEl = document.querySelector('.main');
      if (mainEl) mainEl.style.display = 'none';
      if (shell.vistasPanel) {
        shell.vistasPanel.classList.add('active');
        shell.vistasPanel.style.display = 'grid';
      }
      if (typeof vpRefresh === 'function') vpRefresh();
    } else if (mode === 'settings') {
      if (shell.settingsPanel) {
        shell.settingsPanel.classList.add('active');
        shell.settingsPanel.style.display = 'flex';
      }
      if (typeof loadStats === 'function') loadStats();
    }

    if (mode !== 'vistas' && mode !== 'estudio') {
      const mainEl = document.querySelector('.main');
      if (mainEl) mainEl.style.display = '';
    }
  }

  function mobileSetMode(mode, btn) {
    const barModeActive = typeof isBarMode !== 'undefined' && isBarMode;

    if (mode === 'bares' && !barModeActive) {
      toast('Modo Bares disponible solo desde POS o enlace de bar', 'info');
      return;
    }

    document.querySelectorAll('.mnav-btn').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const backBtn = document.getElementById('mobile-back-btn');
    if (backBtn) backBtn.style.display = mode === 'karaoke' ? 'none' : '';

    const sidebar = document.querySelector('.sidebar');
    const rightPanel = document.querySelector('.right-panel');
    const iaPanel = document.getElementById('ia-panel');
    const ytPanel = document.getElementById('yt-panel');
    const baresPanel = document.getElementById('bares-panel');
    const settingsPanel = document.getElementById('settings-panel');
    const estudioPanel = document.getElementById('estudio-panel');
    const vistasPanel = document.getElementById('vistas-panel');
    const mainEl = document.querySelector('.main');

    if (sidebar) {
      sidebar.style.cssText = '';
      sidebar.classList.add('panel-hidden');
    }
    if (rightPanel) {
      rightPanel.style.cssText = '';
      rightPanel.classList.add('panel-hidden');
    }
    [iaPanel, ytPanel, baresPanel, settingsPanel, estudioPanel, vistasPanel].forEach((panel) => {
      if (panel) {
        panel.classList.remove('active');
        panel.style.cssText = '';
      }
    });
    if (mainEl) mainEl.style.display = '';

    updateBodyModeClass(mode);

    if (mode === 'youtube' && ytPanel) {
      ytPanel.classList.add('active');
      ytPanel.style.display = 'flex';
      currentMode = 'youtube';
    } else if (mode === 'ia' && iaPanel) {
      iaPanel.classList.add('active');
      iaPanel.style.display = 'flex';
      currentMode = 'ia';
      if (typeof checkOllamaStatus === 'function') checkOllamaStatus();
    } else if (mode === 'bares' && baresPanel) {
      baresPanel.classList.add('active');
      baresPanel.style.display = 'flex';
      currentMode = 'bares';
      if (typeof baresInit === 'function') baresInit();
    } else if (mode === 'settings' && settingsPanel) {
      settingsPanel.classList.add('active');
      settingsPanel.style.display = 'flex';
      currentMode = 'settings';
      if (typeof loadStats === 'function') loadStats();
    } else if (mode === 'estudio' && estudioPanel) {
      if (mainEl) mainEl.style.display = 'none';
      estudioPanel.classList.add('active');
      estudioPanel.style.display = 'grid';
      currentMode = 'estudio';
    } else if (mode === 'vistas' && vistasPanel) {
      if (mainEl) mainEl.style.display = 'none';
      vistasPanel.classList.add('active');
      vistasPanel.style.display = 'grid';
      currentMode = 'vistas';
      if (typeof vpRefresh === 'function') vpRefresh();
    } else if (mode === 'cola' && sidebar) {
      sidebar.classList.remove('panel-hidden');
      sidebar.style.cssText = 'display:flex!important;position:fixed;inset:0;top:46px;bottom:100px;width:100%;z-index:90;background:var(--card);opacity:1;pointer-events:auto;';
      currentMode = 'cola';
    } else if (mode === 'remote') {
      setMode('remote');
      return;
    } else if (mode === 'karaoke') {
      currentMode = 'karaoke';
    }

    syncGlobals();
    localStorage.setItem('byflow_last_mode', mode);
  }

  ns.ModeSwitch = {
    getCurrentMode() {
      return currentMode;
    },
    getPreviousMode() {
      return _previousMode;
    },
    mobileSetMode,
    toggleMode,
    setMode
  };

  syncGlobals();
  utils.exposeGlobal('mobileSetMode', mobileSetMode);
  utils.exposeGlobal('toggleMode', toggleMode);
  utils.exposeGlobal('setMode', setMode);
})(window.VibeFlow = window.VibeFlow || {});

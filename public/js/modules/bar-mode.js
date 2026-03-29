(function initVibeFlowBarMode(ns) {
  const state = ns.State;
  const utils = ns.Utils;

  function refreshState() {
    state.isBarMode = !!(localStorage.getItem('pos_bar_id') || window.location.search.includes('bar='));
    window.isBarMode = state.isBarMode;
    return state.isBarMode;
  }

  function applyBarMode() {
    const active = refreshState();
    const baresBtn = document.getElementById('topbar-bares-btn');
    if (active) {
      document.body.classList.add('bar-context');
      if (baresBtn) baresBtn.style.display = '';
    } else {
      document.body.classList.remove('bar-context');
      if (baresBtn) baresBtn.style.display = 'none';
      if (typeof currentMode !== 'undefined' && currentMode === 'bares' && typeof setMode === 'function') {
        setMode('karaoke');
      }
    }
    return active;
  }

  ns.BarMode = {
    applyBarMode,
    refreshState,
    isActive() { return !!state.isBarMode; }
  };

  utils.exposeGlobal('applyBarMode', applyBarMode);
})(window.VibeFlow = window.VibeFlow || {});

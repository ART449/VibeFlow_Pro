(function initVibeFlowApp(ns) {
  async function init() {
    if (ns.PWA && typeof ns.PWA.init === 'function') ns.PWA.init();

    const setVH = () => document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', () => setTimeout(setVH, 150));

    if (ns.BarMode && typeof ns.BarMode.applyBarMode === 'function') ns.BarMode.applyBarMode();
    if (ns.UI && typeof ns.UI.enhanceAccessibility === 'function') ns.UI.enhanceAccessibility();
    if (ns.Ads && typeof ns.Ads.fetchFromServer === 'function') ns.Ads.fetchFromServer();

    updateClock();
    setInterval(updateClock, 1000);
    initVisualizer();
    initFXSliders();
    renderMesas();
    applyMesasCollapse();
    updatePlayBtn();
    loadQR();
    fetchCola();
    fetchSongs();
    ytInit();
    djInit();
    await checkLicenseStatus();
    loadSettingsState();
    await connectSocket();

    const savedUid = localStorage.getItem('byflow_user_uid');
    if (!savedUid) {
      document.querySelector('.sidebar').classList.add('panel-hidden');
      document.querySelector('.right-panel').classList.add('panel-hidden');
    }

    if (typeof talentCheckVoterMode === 'function') talentCheckVoterMode();
  }

  ns.App = { init };

  init().catch((error) => {
    console.error('[ByFlow] App init failed:', error);
    if (ns.Utils && typeof ns.Utils.showToast === 'function') {
      ns.Utils.showToast('Error iniciando ByFlow', 'error');
    }
  });
})(window.VibeFlow = window.VibeFlow || {});

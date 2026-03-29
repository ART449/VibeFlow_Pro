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
    if (ns.modules && ns.modules.twinBridge && typeof ns.modules.twinBridge.init === 'function') ns.modules.twinBridge.init();

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
    // Load API keys from server (YouTube, Jamendo)
    try {
      const kr = await fetch('/api/config/keys');
      const kd = await kr.json();
      if (kd.youtube && !localStorage.getItem('yt_api_key')) localStorage.setItem('yt_api_key', kd.youtube);
      if (kd.jamendo && !localStorage.getItem('jamendo_client_id')) localStorage.setItem('jamendo_client_id', kd.jamendo);
      if (kd.youtube) ytApiKey = kd.youtube;
      // Configure GA4 dynamically
      if (kd.ga && kd.ga !== 'GA_MEASUREMENT_ID' && typeof gtag === 'function') {
        gtag('config', kd.ga);
      }
    } catch (e) {}
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

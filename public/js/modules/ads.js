(function initVibeFlowAds(ns) {
  const state = ns.State.ads;
  const config = ns.Config;
  const utils = ns.Utils;

  function resetAds(list) {
    state.ads = utils.cloneAds(list && list.length ? list : config.defaultAds);
  }

  function fetchFromServer() {
    fetch(config.adsEndpoint).then((response) => {
      if (response.ok) return response.json();
      throw new Error('ads endpoint unavailable');
    }).then((data) => {
      if (Array.isArray(data) && data.length) resetAds(data);
    }).catch(() => {});
  }

  function getRandom() {
    const pool = state.ads;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function shouldShow() {
    if (!state.enabled) return false;
    if (typeof isPremium === 'function' && isPremium()) return false;
    return state.playCount > 0 && state.playCount % state.adInterval === 0;
  }

  function onSongChange() {
    state.playCount += 1;
    if (shouldShow()) showInterstitial();
  }

  function dismiss() {
    const overlay = document.getElementById('ad-interstitial');
    if (!overlay) return;
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 300);
  }

  function handleCta(adId) {
    if (adId === 'pro') {
      dismiss();
      if (typeof setMode === 'function') setMode('settings');
    }
  }

  function showInterstitial() {
    const ad = getRandom();
    if (!ad) return;

    const existing = document.getElementById('ad-interstitial');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ad-interstitial';
    overlay.id = 'ad-interstitial';
    overlay.innerHTML =
      '<div class="ad-interstitial-card" style="background:' + ad.bg + ';">' +
        '<div class="ad-interstitial-label">ByFlow Free &mdash; Anuncio</div>' +
        '<div class="ad-interstitial-title">' + utils.escapeHtml(ad.title) + '</div>' +
        '<div class="ad-interstitial-text">' + utils.escapeHtml(ad.text) + '</div>' +
        '<a href="' + utils.escapeHtml(ad.url) + '" target="_blank" rel="noopener" class="ad-interstitial-cta" onclick="adHandleCta(\'' + utils.escapeHtml(ad.id) + '\')">' + utils.escapeHtml(ad.cta) + '</a>' +
        '<div class="ad-interstitial-countdown" id="ad-countdown">Continua en 5s...</div>' +
        '<button class="ad-interstitial-close" id="ad-close-btn" onclick="adDismiss()">Cerrar ✕</button>' +
      '</div>';

    document.body.appendChild(overlay);
    state.impressions += 1;

    let remaining = 5;
    const countdownEl = document.getElementById('ad-countdown');
    const closeBtn = document.getElementById('ad-close-btn');
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        if (countdownEl) countdownEl.textContent = 'Continua en ' + remaining + 's...';
      } else {
        clearInterval(timer);
        if (countdownEl) countdownEl.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'inline-block';
      }
    }, 1000);
  }

  function renderSearchBanner() {
    if (typeof isPremium === 'function' && isPremium()) return '';
    const ad = getRandom();
    if (!ad) return '';
    return '<div class="ad-search-banner" style="background:' + ad.bg + ';" onclick="if(\'' + utils.escapeHtml(ad.url) + '\'.startsWith(\'#\')){adHandleCta(\'' + utils.escapeHtml(ad.id) + '\');}else{window.open(\'' + utils.escapeHtml(ad.url) + '\',\'_blank\');}">' +
      '<div class="ad-search-banner-info">' +
        '<div class="ad-search-banner-label">Anuncio</div>' +
        '<div class="ad-search-banner-title">' + utils.escapeHtml(ad.title) + '</div>' +
        '<div class="ad-search-banner-text">' + utils.escapeHtml(ad.text) + '</div>' +
      '</div>' +
      '<button class="ad-search-banner-cta">' + utils.escapeHtml(ad.cta) + '</button>' +
    '</div>';
  }

  ns.Ads = {
    fetchFromServer,
    getRandom,
    shouldShow,
    onSongChange,
    showInterstitial,
    dismiss,
    handleCta,
    renderSearchBanner
  };

  utils.exposeGlobal('adFetchFromServer', fetchFromServer);
  utils.exposeGlobal('adOnSongChange', onSongChange);
  utils.exposeGlobal('adDismiss', dismiss);
  utils.exposeGlobal('adHandleCta', handleCta);
  utils.exposeGlobal('adRenderSearchBanner', renderSearchBanner);
})(window.VibeFlow = window.VibeFlow || {});

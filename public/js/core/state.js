(function initVibeFlowState(ns) {
  ns.State = ns.State || {};

  if (!ns.State.pwa) ns.State.pwa = { installEvent: null };

  if (typeof ns.State.isBarMode === 'undefined') {
    ns.State.isBarMode = !!(localStorage.getItem('pos_bar_id') || window.location.search.includes('bar='));
  }

  if (!ns.State.ads) {
    ns.State.ads = {
      enabled: true,
      playCount: 0,
      adInterval: 3,
      impressions: 0,
      ads: (ns.Config.defaultAds || []).map((ad) => ({ ...ad }))
    };
  }

  window.isBarMode = ns.State.isBarMode;
})(window.VibeFlow = window.VibeFlow || {});

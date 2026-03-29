(function initVibeFlowUtils(ns) {
  ns.Utils = ns.Utils || {};

  ns.Utils.exposeGlobal = function exposeGlobal(name, value) {
    window[name] = value;
    return value;
  };

  ns.Utils.escapeHtml = function escapeHtml(value) {
    if (typeof window.escHtml === 'function') return window.escHtml(value);
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  };

  ns.Utils.showToast = function showToast(message, type) {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    console.log('[ByFlow]', message);
  };

  ns.Utils.cloneAds = function cloneAds(list) {
    return (Array.isArray(list) ? list : []).map((ad) => ({ ...ad }));
  };
})(window.VibeFlow = window.VibeFlow || {});

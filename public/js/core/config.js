(function initVibeFlowConfig(ns) {
  ns.Config = ns.Config || {};

  if (!ns.Config.serviceWorkerPath) ns.Config.serviceWorkerPath = '/sw.js';
  if (!ns.Config.adsEndpoint) ns.Config.adsEndpoint = '/api/ads';
  if (!ns.Config.pwaBannerDelayMs) ns.Config.pwaBannerDelayMs = 10000;
  if (!Array.isArray(ns.Config.defaultAds)) {
    ns.Config.defaultAds = [
      { id: 'pro', title: 'ByFlow PRO', text: 'Quita los anuncios y desbloquea todo. Desde $49/mes', cta: 'Activar PRO', url: '#pro', bg: 'linear-gradient(135deg, #ff006e, #7c4dff)' },
      { id: 'negocio', title: 'Anuncia tu negocio aqui', text: 'Llega a miles de usuarios en Aguascalientes. WhatsApp: 449-491-7648', cta: 'Contactar', url: 'https://wa.me/524494917648', bg: 'linear-gradient(135deg, #00b4d8, #0077b6)' },
      { id: 'espacio', title: 'Tu anuncio aqui', text: 'Espacio disponible para tu bar, restaurante o negocio local', cta: 'Mas info', url: 'https://wa.me/524494917648', bg: 'linear-gradient(135deg, #f97316, #ea580c)' }
    ];
  }
})(window.VibeFlow = window.VibeFlow || {});

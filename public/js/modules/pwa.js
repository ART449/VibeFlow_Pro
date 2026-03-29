(function initVibeFlowPwa(ns) {
  const state = ns.State;
  const config = ns.Config;
  const utils = ns.Utils;

  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:9500;background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(106,17,203,.4);border-radius:16px;padding:14px 20px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,.5);max-width:380px;width:calc(100% - 32px);animation:welcomeFade .4s ease;';
    banner.innerHTML = [
      '<div style="font-size:32px;">📲</div>',
      '<div style="flex:1;min-width:0;">',
      '<div style="font-size:13px;font-weight:700;color:#fff;">Instalar ByFlow</div>',
      '<div style="font-size:11px;color:#aaa;margin-top:2px;">Acceso directo como app nativa</div>',
      '</div>',
      '<button onclick="_pwaInstall()" style="background:linear-gradient(135deg,#ff006e,#8338ec);border:none;border-radius:10px;color:#fff;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">Instalar</button>',
      '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#666;font-size:18px;cursor:pointer;padding:4px;">✕</button>'
    ].join('');
    document.body.appendChild(banner);
  }

  async function install() {
    if (!state.pwa.installEvent) return;
    state.pwa.installEvent.prompt();
    const result = await state.pwa.installEvent.userChoice;
    if (result.outcome === 'accepted') {
      utils.showToast('ByFlow instalado como app!', 'success');
    }
    state.pwa.installEvent = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
  }

  function initPromptHandlers() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.pwa.installEvent = e;
      setTimeout(() => {
        if (state.pwa.installEvent && !window.matchMedia('(display-mode: standalone)').matches) {
          showInstallBanner();
        }
      }, config.pwaBannerDelayMs);
    });

    window.addEventListener('appinstalled', () => {
      state.pwa.installEvent = null;
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.remove();
      utils.showToast('ByFlow instalado!', 'success');
    });
  }

  function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(config.serviceWorkerPath).then((registration) => {
      console.log('[PWA] SW registered');
      registration.update();
      registration.addEventListener('updatefound', () => {
        const nextWorker = registration.installing;
        if (!nextWorker) return;
        nextWorker.addEventListener('statechange', () => {
          if (nextWorker.state === 'activated' && navigator.serviceWorker.controller) {
            console.log('[PWA] Nueva version detectada, recargando...');
            window.location.reload();
          }
        });
      });
    }).catch((error) => console.log('[PWA] SW failed:', error));

    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
  }

  function init() {
    initPromptHandlers();
    initServiceWorker();
  }

  ns.PWA = { init, install, showInstallBanner };
  utils.exposeGlobal('_pwaInstall', install);
  utils.exposeGlobal('_showPwaInstallBanner', showInstallBanner);
})(window.VibeFlow = window.VibeFlow || {});

(function initVibeFlowUi(ns) {
  const utils = ns.Utils;

  function wirePseudoButton(el, label) {
    if (!el || el.dataset.a11yReady === '1') return;
    el.dataset.a11yReady = '1';
    el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (label && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  }

  function enhanceAccessibility() {
    document.querySelectorAll('button:not([type])').forEach((btn) => { btn.type = 'button'; });
    document.querySelectorAll('button[title]:not([aria-label])').forEach((btn) => {
      btn.setAttribute('aria-label', btn.getAttribute('title'));
    });

    const searchInput = document.getElementById('usearch-input');
    if (searchInput && !searchInput.getAttribute('aria-label')) {
      searchInput.setAttribute('aria-label', 'Buscador universal');
    }

    const catalogSearch = document.getElementById('catalog-search');
    if (catalogSearch && !catalogSearch.getAttribute('aria-label')) {
      catalogSearch.setAttribute('aria-label', 'Buscar en catalogo');
    }

    const toast = document.getElementById('toast');
    if (toast) {
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
    }

    const nowSinging = document.getElementById('now-singing');
    if (nowSinging) {
      nowSinging.setAttribute('aria-live', 'polite');
      nowSinging.setAttribute('aria-atomic', 'true');
    }

    wirePseudoButton(document.getElementById('room-badge'), 'Copiar enlace de tu sala');
    wirePseudoButton(document.getElementById('bf-user-photo'), 'Abrir configuracion y perfil');
    wirePseudoButton(document.querySelector('.byflow-bar'), 'Abrir informacion legal');
    document.querySelectorAll('.welcome-footer span[onclick]').forEach((el) => {
      const label = (el.textContent || '').trim();
      wirePseudoButton(el, label || 'Accion rapida');
    });
  }

  ns.UI = { enhanceAccessibility, wirePseudoButton };
  utils.exposeGlobal('enhanceAccessibility', enhanceAccessibility);
})(window.VibeFlow = window.VibeFlow || {});

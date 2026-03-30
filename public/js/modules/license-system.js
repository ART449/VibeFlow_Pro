(function initVibeFlowLicenseSystem(ns) {
  'use strict';

  ns.modules = ns.modules || {};
  const licenseSystem = ns.modules.licenseSystem = {};
  const utils = ns.Utils || { exposeGlobal() {} };

  const OEM_LS_BAR = 'byflow_bar_name';
  const OEM_LS_NUM = 'byflow_bar_mesas';
  const LICENSE_TOKEN_KEY = 'byflow_license_token';

  let licenseState = window.licenseState || { activated: false, features: [] };
  let baresState = window.baresState || {
    mesas: [],
    orders: [],
    numMesas: 12
  };

  function syncLicenseState(next) {
    licenseState = next || { activated: false, features: [] };
    if (!Array.isArray(licenseState.features)) licenseState.features = [];
    if (typeof licenseState.activated !== 'boolean') {
      licenseState.activated = !!licenseState.activated;
    }
    window.licenseState = licenseState;
    ns.licenseState = licenseState;
    return licenseState;
  }

  function syncBaresState(next) {
    baresState = next || {
      mesas: [],
      orders: [],
      numMesas: 12
    };
    if (!Array.isArray(baresState.mesas)) baresState.mesas = [];
    if (!Array.isArray(baresState.orders)) baresState.orders = [];
    if (typeof baresState.numMesas !== 'number') baresState.numMesas = 12;
    window.baresState = baresState;
    ns.baresState = baresState;
    return baresState;
  }

  syncLicenseState(licenseState);
  syncBaresState(baresState);

  function getLicenseToken() {
    return localStorage.getItem(LICENSE_TOKEN_KEY) || '';
  }

  function setLicenseToken(token) {
    if (token) localStorage.setItem(LICENSE_TOKEN_KEY, token);
  }

  function clearLicenseToken() {
    localStorage.removeItem(LICENSE_TOKEN_KEY);
  }

  function isOwnerProfile() {
    try {
      const u = JSON.parse(localStorage.getItem('byflow_user') || '{}');
      const nameMatch = /art.?atr/i.test(u.name || '') || /arturo\s*torres/i.test(u.name || '');
      const pinMatch = u.pin === '102698';
      return nameMatch && pinMatch;
    } catch {
      return false;
    }
  }

  function isPremium(feature) {
    if (isOwnerProfile()) return true;
    if (!feature) return licenseState.activated && licenseState.features.length > 0;
    return licenseState.activated && licenseState.features.includes(feature);
  }

  function updatePremiumUI() {
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      const existing = btn.querySelector('.pro-badge');
      if (existing) existing.remove();
      let needsPro = false;
      // License gates disabled for live demo
      // if (btn.dataset.mode === 'bares' && !isPremium('bares')) needsPro = true;
      // if (btn.dataset.mode === 'youtube' && !isPremium('music_streaming')) needsPro = true;
      // if (btn.dataset.mode === 'ia' && !isPremium('ollama_ai')) needsPro = true;
      if (needsPro) {
        const badge = document.createElement('span');
        badge.className = 'pro-badge';
        badge.textContent = 'PRO';
        badge.style.cssText = 'font-size:10px;background:linear-gradient(135deg,#f59e0b,#ef4444);padding:1px 5px;border-radius:4px;color:#fff;font-weight:800;margin-left:4px;';
        btn.appendChild(badge);
      }
    });
  }

  async function checkLicenseStatus() {
    // El dueno ArT-AtR tiene PRO automatico
    if (isOwnerProfile()) {
      syncLicenseState({
        activated: true,
        features: ['bares', 'youtube', 'ia', 'ollama_ai', 'soundcloud', 'jamendo']
      });
      updatePremiumUI();
      return;
    }
    try {
      const token = getLicenseToken();
      const r = await fetch('/api/license/status', {
        headers: token ? { 'X-License-Token': token } : {}
      });
      const data = await r.json();
      syncLicenseState({
        activated: !!(data && data.activated),
        features: Array.isArray(data && data.features) ? data.features : [],
        owner: data && data.owner,
        keyFragment: data && data.keyFragment
      });
    } catch {
      syncLicenseState({ activated: false, features: [] });
    }
    updatePremiumUI();
  }

  function licenseFormatKey(inp) {
    let v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const parts = [];
    if (v.length > 0) parts.push(v.slice(0, 3));   // VFP
    if (v.length > 3) parts.push(v.slice(3, 8));    // 5 chars
    if (v.length > 8) parts.push(v.slice(8, 13));   // 5 chars
    if (v.length > 13) parts.push(v.slice(13, 18));  // 5 chars
    if (v.length > 18) parts.push(v.slice(18, 23));  // 5 chars
    inp.value = parts.join('-');
  }

  async function licenseActivate() {
    const inp = document.getElementById('oem-key-inp');
    if (!inp) return;
    const key = inp.value.trim().toUpperCase();
    if (!key || key.length < 20) {
      inp.classList.add('error');
      setTimeout(() => inp.classList.remove('error'), 500);
      showToast('Formato: VFP-XXXXX-XXXXX-XXXXX-XXXXX');
      return;
    }
    try {
      const r = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, token: getLicenseToken() })
      });
      const data = await r.json();
      if (!r.ok) {
        inp.classList.add('error');
        setTimeout(() => inp.classList.remove('error'), 500);
        showToast(data.error || 'Error de activacion');
        return;
      }
      // Save user token in localStorage - this makes it per-user
      if (data.token) setLicenseToken(data.token);
      syncLicenseState({
        activated: true,
        features: Array.isArray(data.features) ? data.features : [],
        owner: data.owner,
        keyFragment: data.keyFragment
      });
      updatePremiumUI();
      showToast('Licencia PRO activada \u2014 ' + (data.owner || 'Bienvenido'));
      baresShowContent(key);
    } catch {
      showToast('Error de conexion con el servidor');
    }
  }

  async function licenseDeactivate() {
    try {
      const token = getLicenseToken();
      await fetch('/api/license/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-License-Token': token },
        body: JSON.stringify({ token })
      });
    } catch {}
    clearLicenseToken();
    syncLicenseState({ activated: false, features: [] });
    updatePremiumUI();
    const gate = document.getElementById('oem-gate');
    if (gate) gate.style.display = 'flex';
    const content = document.getElementById('bares-content');
    if (content) content.style.display = 'none';
    const inp = document.getElementById('oem-key-inp');
    if (inp) inp.value = '';
    showToast('Licencia desactivada');
  }

  function baresInit() {
    // License gate disabled for live demo
    baresShowContent();
  }

  function baresShowContent(key) {
    const gate = document.getElementById('oem-gate');
    if (gate) gate.style.display = 'none';
    const content = document.getElementById('bares-content');
    if (content) content.style.display = 'flex';

    const tag = document.getElementById('bares-license-label');
    const fragment = (licenseState.keyFragment) || (key ? key.slice(-9) : 'PRO');
    if (tag) tag.textContent = 'PRO \u00B7 ' + fragment;

    const barName = localStorage.getItem(OEM_LS_BAR) || 'Mi Establecimiento';
    const numMesas = parseInt(localStorage.getItem(OEM_LS_NUM) || '12');
    const nameInp = document.getElementById('bares-bar-name');
    const nameConf = document.getElementById('bares-name-inp');
    const mesConf = document.getElementById('bares-mesas-inp');
    if (nameInp) nameInp.textContent = barName;
    if (nameConf) nameConf.value = barName;
    if (mesConf) mesConf.value = numMesas;

    baresState.numMesas = numMesas;
    loadPromosEditor();

    if (baresState.mesas.length !== numMesas) {
      baresState.mesas = Array.from({ length: numMesas }, (_, i) => ({
        num: i + 1,
        estado: 'libre'
      }));
    }

    baresRenderGrid();
    baresUpdateStats();
    baresRenderOrders();
    menuInit();
    talentLoadEvents();
  }

  function baresSetupBar() {
    const name = document.getElementById('bares-name-inp').value.trim() || 'Mi Establecimiento';
    const num = Math.min(40, Math.max(4, parseInt(document.getElementById('bares-mesas-inp').value || '12')));
    localStorage.setItem(OEM_LS_BAR, name);
    localStorage.setItem(OEM_LS_NUM, String(num));
    document.getElementById('bares-bar-name').textContent = name;
    baresState.numMesas = num;
    baresState.mesas = Array.from({ length: num }, (_, i) => ({ num: i + 1, estado: 'libre' }));
    baresRenderGrid();
    baresUpdateStats();
    showToast('\u2705 Bar configurado: ' + name + ' (' + num + ' mesas)');
  }

  function baresRenderGrid() {
    const grid = document.getElementById('bares-grid');
    if (!grid) return;
    grid.innerHTML = baresState.mesas.map((m) =>
      '<div class="bt-cell ' + m.estado + '" onclick="baresToggleMesa(' + m.num + ')">' +
        '<div class="bt-dot"></div>' +
        '<div class="bt-num">' + m.num + '</div>' +
        '<div class="bt-label">' + (m.estado === 'libre' ? 'Libre' : m.estado === 'vip' ? 'VIP' : 'Ocup.') + '</div>' +
      '</div>'
    ).join('');
  }

  function baresToggleMesa(num) {
    const m = baresState.mesas.find((x) => x.num === num);
    if (!m) return;
    const cycle = { libre: 'ocupada', ocupada: 'vip', vip: 'libre' };
    m.estado = cycle[m.estado] || 'libre';
    baresRenderGrid();
    baresUpdateStats();
  }

  function baresUpdateStats() {
    const ocupadas = baresState.mesas.filter((m) => m.estado === 'ocupada').length;
    const vip = baresState.mesas.filter((m) => m.estado === 'vip').length;
    const libres = baresState.mesas.filter((m) => m.estado === 'libre').length;
    const orders = baresState.orders.length;
    const s = (id) => document.getElementById(id);
    if (s('bs-ocupadas')) s('bs-ocupadas').textContent = ocupadas;
    if (s('bs-libres')) s('bs-libres').textContent = libres;
    if (s('bs-ordenes')) s('bs-ordenes').textContent = orders;
    if (s('bs-vip')) s('bs-vip').textContent = vip;
  }

  function baresAddOrder() {
    const mesaEl = document.getElementById('bares-order-mesa');
    const textEl = document.getElementById('bares-order-text');
    const mesa = parseInt(mesaEl.value);
    const text = textEl.value.trim();
    if (!mesa || !text) {
      showToast('\u26A0\uFE0F Completa mesa y orden');
      return;
    }
    baresState.orders.unshift({ id: Date.now(), mesa, text, time: new Date() });
    mesaEl.value = '';
    textEl.value = '';
    baresRenderOrders();
    baresUpdateStats();
    showToast('\u2705 Orden agregada - Mesa ' + mesa);
  }

  function baresDeleteOrder(id) {
    baresState.orders = baresState.orders.filter((o) => o.id !== id);
    baresRenderOrders();
    baresUpdateStats();
  }

  function baresRenderOrders() {
    const el = document.getElementById('bares-orders-list');
    if (!el) return;
    if (!baresState.orders.length) {
      el.innerHTML = '<div style="text-align:center;padding:18px;opacity:.5;font-size:12px;">Sin \u00f3rdenes activas</div>';
      return;
    }
    el.innerHTML = baresState.orders.map((o) => {
      const mins = Math.floor((Date.now() - o.time) / 60000);
      const t = mins < 1 ? 'Ahora' : mins + ' min atr\u00e1s';
      return '<div class="bar-order-item">' +
        '<div class="boi-mesa">' + o.mesa + '</div>' +
        '<div class="boi-info">' +
          '<div class="boi-text">' + escHtml(o.text) + '</div>' +
          '<div class="boi-time">' + t + '</div>' +
        '</div>' +
        '<button class="boi-del" onclick="baresDeleteOrder(' + o.id + ')" title="Completado">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');
  }

  setInterval(() => {
    if (baresState.orders.length) baresRenderOrders();
  }, 60000);

  licenseSystem.getLicenseToken = getLicenseToken;
  licenseSystem.setLicenseToken = setLicenseToken;
  licenseSystem.clearLicenseToken = clearLicenseToken;
  licenseSystem.checkLicenseStatus = checkLicenseStatus;
  licenseSystem.isOwnerProfile = isOwnerProfile;
  licenseSystem.isPremium = isPremium;
  licenseSystem.updatePremiumUI = updatePremiumUI;
  licenseSystem.licenseFormatKey = licenseFormatKey;
  licenseSystem.licenseActivate = licenseActivate;
  licenseSystem.licenseDeactivate = licenseDeactivate;
  licenseSystem.baresInit = baresInit;
  licenseSystem.baresShowContent = baresShowContent;
  licenseSystem.baresSetupBar = baresSetupBar;
  licenseSystem.baresRenderGrid = baresRenderGrid;
  licenseSystem.baresToggleMesa = baresToggleMesa;
  licenseSystem.baresUpdateStats = baresUpdateStats;
  licenseSystem.baresAddOrder = baresAddOrder;
  licenseSystem.baresDeleteOrder = baresDeleteOrder;
  licenseSystem.baresRenderOrders = baresRenderOrders;
  licenseSystem.getState = function() { return licenseState; };
  licenseSystem.getBaresState = function() { return baresState; };

  utils.exposeGlobal('getLicenseToken', getLicenseToken);
  utils.exposeGlobal('setLicenseToken', setLicenseToken);
  utils.exposeGlobal('clearLicenseToken', clearLicenseToken);
  utils.exposeGlobal('checkLicenseStatus', checkLicenseStatus);
  utils.exposeGlobal('isOwnerProfile', isOwnerProfile);
  utils.exposeGlobal('isPremium', isPremium);
  utils.exposeGlobal('updatePremiumUI', updatePremiumUI);
  utils.exposeGlobal('licenseFormatKey', licenseFormatKey);
  utils.exposeGlobal('licenseActivate', licenseActivate);
  utils.exposeGlobal('licenseDeactivate', licenseDeactivate);
  utils.exposeGlobal('baresInit', baresInit);
  utils.exposeGlobal('baresShowContent', baresShowContent);
  utils.exposeGlobal('baresSetupBar', baresSetupBar);
  utils.exposeGlobal('baresRenderGrid', baresRenderGrid);
  utils.exposeGlobal('baresToggleMesa', baresToggleMesa);
  utils.exposeGlobal('baresUpdateStats', baresUpdateStats);
  utils.exposeGlobal('baresAddOrder', baresAddOrder);
  utils.exposeGlobal('baresDeleteOrder', baresDeleteOrder);
  utils.exposeGlobal('baresRenderOrders', baresRenderOrders);
})(window.VibeFlow = window.VibeFlow || {});

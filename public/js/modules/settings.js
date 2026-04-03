(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const settings = VF.modules.settings = {};

  function tpStyle() {
    return VF.modules.teleprompterStyle || null;
  }

  function nearestFontSizeOption(value) {
    const target = Number(value) || 5;
    return [3, 5, 7, 9].reduce((closest, current) =>
      Math.abs(current - target) < Math.abs(closest - target) ? current : closest, 5
    ) + 'rem';
  }

  function applyTpStyleToUi(style) {
    const helper = tpStyle();
    if (!helper) return null;
    const normalized = helper.applyToElement(document.documentElement, style);
    localStorage.setItem('byflow_tp_fontsize', normalized.fontSizeRem.toFixed(1) + 'rem');
    settings.updateTpStyleControls(normalized);

    const bridge = VF.modules.twinBridge;
    if (bridge && typeof bridge.onStyleChanged === 'function') bridge.onStyleChanged();
    return normalized;
  }

  settings.updateTpStyle = function(partial, persist) {
    const helper = tpStyle();
    if (!helper) return null;
    const base = helper.load();
    const source = Object.assign({}, base, partial || {});
    if (partial && !Object.prototype.hasOwnProperty.call(partial, 'presetKey')) source.presetKey = '';
    const normalized = helper.normalize(source);
    if (persist === false) return applyTpStyleToUi(normalized);
    helper.save(normalized);
    return applyTpStyleToUi(normalized);
  };

  settings.ensureTpFontOptions = function() {
    const helper = tpStyle();
    const select = document.getElementById('set-tp-font-family');
    if (!helper || !select || select.options.length) return;
    select.innerHTML = helper.fontOptions().map((item) =>
      '<option value="' + item.id + '">' + item.label + '</option>'
    ).join('');
  };

  settings.updateTpStyleControls = function(input) {
    const helper = tpStyle();
    if (!helper) return;
    const style = helper.normalize(input);
    settings.ensureTpFontOptions();

    const fontSelect = document.getElementById('set-tp-font-family');
    const alignSelect = document.getElementById('set-tp-align');
    const sizeSelect = document.getElementById('set-font-size');

    if (fontSelect) fontSelect.value = style.fontPreset;
    if (alignSelect) alignSelect.value = style.textAlign;
    if (sizeSelect) sizeSelect.value = nearestFontSizeOption(style.fontSizeRem);

    const pairs = [
      ['set-tp-line-height', style.lineHeight.toFixed(2)],
      ['set-tp-letter-spacing', style.letterSpacingEm.toFixed(3)],
      ['set-tp-max-width', String(Math.round(style.maxWidthPx))],
      ['set-tp-glow', style.glowAlpha.toFixed(2)],
      ['set-tp-top-padding', String(Math.round(style.stageTopVh))],
      ['set-tp-bottom-padding', String(Math.round(style.stageBottomVh))],
      ['set-tp-active-scale', style.activeScale.toFixed(2)]
    ];

    pairs.forEach(function(pair) {
      const inputEl = document.getElementById(pair[0]);
      if (inputEl) inputEl.value = pair[1];
    });

    const valueEls = {
      'set-tp-line-height-val': style.lineHeight.toFixed(2),
      'set-tp-letter-spacing-val': style.letterSpacingEm.toFixed(3) + 'em',
      'set-tp-max-width-val': Math.round(style.maxWidthPx) + 'px',
      'set-tp-glow-val': style.glowAlpha.toFixed(2),
      'set-tp-top-padding-val': Math.round(style.stageTopVh) + 'vh',
      'set-tp-bottom-padding-val': Math.round(style.stageBottomVh) + 'vh',
      'set-tp-active-scale-val': style.activeScale.toFixed(2) + 'x'
    };

    Object.keys(valueEls).forEach(function(id) {
      const node = document.getElementById(id);
      if (node) node.textContent = valueEls[id];
    });

    document.querySelectorAll('[data-tp-preset]').forEach(function(btn) {
      btn.classList.toggle('on', btn.getAttribute('data-tp-preset') === style.presetKey);
    });
  };

  settings.saveUserProfile = function() {
    const name = document.getElementById('set-user-name').value.trim();
    const pin = document.getElementById('set-user-pin').value.trim();
    const email = document.getElementById('set-user-email').value.trim();
    const role = document.getElementById('set-user-role').value;
    localStorage.setItem('byflow_user', JSON.stringify({ name, pin, email, role }));
    if (isOwnerProfile()) {
      showToast('Bienvenido de vuelta, ArT-AtR');
      checkLicenseStatus();
    } else {
      showToast('Perfil guardado: ' + (name || 'Usuario'));
    }
    settings.updateLicenseUI();
  };

  settings.settingsActivateLicense = async function() {
    const inp = document.getElementById('set-lic-key');
    if (!inp) return;
    const oemInp = document.getElementById('oem-key-inp');
    if (oemInp) oemInp.value = inp.value;
    await licenseActivate();
    settings.updateLicenseUI();
  };

  settings.updateLicenseUI = function() {
    const statusEl = document.getElementById('set-lic-status');
    const formEl = document.getElementById('set-lic-form');
    const owner = isOwnerProfile();
    if (owner) {
      if (statusEl) {
        statusEl.textContent = 'PRO - ArT-AtR (Dueño)';
        statusEl.style.color = 'var(--g)';
      }
      if (formEl) formEl.style.display = 'none';
    } else if (licenseState.activated) {
      if (statusEl) {
        statusEl.textContent = 'PRO activa';
        statusEl.style.color = 'var(--g)';
      }
      if (formEl) formEl.style.display = 'none';
    } else {
      if (statusEl) {
        statusEl.textContent = 'Sin licencia activa';
        statusEl.style.color = 'var(--sub)';
      }
      if (formEl) formEl.style.display = 'flex';
    }
  };

  settings.loadUserProfile = function() {
    try {
      const u = JSON.parse(localStorage.getItem('byflow_user') || '{}');
      if (u.name) document.getElementById('set-user-name').value = u.name;
      if (u.pin) document.getElementById('set-user-pin').value = u.pin;
      if (u.email) document.getElementById('set-user-email').value = u.email;
      if (u.role) document.getElementById('set-user-role').value = u.role;
    } catch {}
  };

  settings.toggleDarkMode = function(btn) {
    btn.classList.toggle('on');
    const isDark = btn.classList.contains('on');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]').content = isDark ? '#07070d' : '#f5f5fa';
    localStorage.setItem('byflow_theme', isDark ? 'dark' : 'light');
    showToast(isDark ? 'Modo oscuro' : 'Modo claro');
  };

  settings.setTpFontSize = function(size) {
    const rem = parseFloat(String(size || '5').replace('rem', ''));
    settings.updateTpStyle({ fontSizeRem: rem });
  };

  settings.setTpFontFamily = function(presetId) {
    const helper = tpStyle();
    if (!helper) return;
    const option = helper.fontOptions().find((item) => item.id === presetId) || helper.fontOptions()[0];
    settings.updateTpStyle({
      fontPreset: option.id,
      fontFamily: option.value
    });
  };

  settings.setTpTextAlign = function(value) {
    settings.updateTpStyle({ textAlign: value });
  };

  settings.setTpLineHeight = function(value) {
    settings.updateTpStyle({ lineHeight: Number(value) || 1.6 });
  };

  settings.setTpLetterSpacing = function(value) {
    settings.updateTpStyle({ letterSpacingEm: Number(value) || 0 });
  };

  settings.setTpMaxWidth = function(value) {
    settings.updateTpStyle({ maxWidthPx: Number(value) || 1100 });
  };

  settings.setTpGlow = function(value) {
    settings.updateTpStyle({ glowAlpha: Number(value) || 0 });
  };

  settings.setTpTopPadding = function(value) {
    settings.updateTpStyle({ stageTopVh: Number(value) || 0 });
  };

  settings.setTpBottomPadding = function(value) {
    settings.updateTpStyle({ stageBottomVh: Number(value) || 20 });
  };

  settings.setTpActiveScale = function(value) {
    settings.updateTpStyle({ activeScale: Number(value) || 1 });
  };

  settings.applyTpStylePreset = function(name) {
    const helper = tpStyle();
    if (!helper) return;
    const preset = helper.preset(name);
    helper.save(preset);
    applyTpStyleToUi(preset);
  };

  settings.resetTpStyle = function() {
    const helper = tpStyle();
    if (!helper) return;
    const style = helper.reset();
    applyTpStyleToUi(style);
  };

  settings.saveTpStyleAsDefault = function() {
    const helper = tpStyle();
    if (!helper) return;
    helper.save(helper.load());
    showToast('Look del teleprompter guardado');
  };

  settings.toggleVisualizer = function(btn) {
    btn.classList.toggle('on');
    const canvas = document.getElementById('main-viz');
    if (canvas) canvas.style.display = btn.classList.contains('on') ? '' : 'none';
    localStorage.setItem('byflow_viz_on', btn.classList.contains('on') ? '1' : '0');
  };

  settings.toggleJingle = function(btn) {
    btn.classList.toggle('on');
    localStorage.setItem('byflow_jingle_on', btn.classList.contains('on') ? '1' : '0');
  };

  settings.toggleAutoPromo = function(btn) {
    btn.classList.toggle('on');
    localStorage.setItem('byflow_autopromo', btn.classList.contains('on') ? '1' : '0');
  };

  settings.toggleAutoQueue = function(btn) {
    btn.classList.toggle('on');
    window._autoQueueEnabled = btn.classList.contains('on');
    localStorage.setItem('byflow_autoqueue', window._autoQueueEnabled ? '1' : '0');
  };

  settings.loadSettingsState = function() {
    settings.loadUserProfile();
    settings.ensureTpFontOptions();
    const savedTheme = localStorage.getItem('byflow_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const darkBtn = document.getElementById('set-dark-toggle');
    if (darkBtn) {
      if (savedTheme === 'light') darkBtn.classList.remove('on');
      else darkBtn.classList.add('on');
    }
    document.querySelector('meta[name="theme-color"]').content = savedTheme === 'dark' ? '#07070d' : '#f5f5fa';

    const helper = tpStyle();
    const legacyFontSize = localStorage.getItem('byflow_tp_fontsize');
    let nextStyle = helper ? helper.load() : null;
    if (helper && legacyFontSize) {
      const parsedLegacy = parseFloat(String(legacyFontSize).replace('rem', ''));
      if (Number.isFinite(parsedLegacy) && Math.abs(nextStyle.fontSizeRem - parsedLegacy) > 0.01) {
        nextStyle = helper.normalize(Object.assign({}, nextStyle, { fontSizeRem: parsedLegacy }));
      }
    }
    if (nextStyle) applyTpStyleToUi(nextStyle);

    if (localStorage.getItem('byflow_viz_on') === '0') {
      const btn = document.getElementById('set-viz-toggle');
      if (btn) btn.classList.remove('on');
      const canvas = document.getElementById('main-viz');
      if (canvas) canvas.style.display = 'none';
    }

    const jvol = localStorage.getItem('byflow_jingle_vol');
    if (jvol) {
      const sl = document.getElementById('set-jingle-vol');
      if (sl) sl.value = jvol;
      const lbl = document.getElementById('jingle-vol-val');
      if (lbl) lbl.textContent = Math.round(jvol * 100) + '%';
    }

    const ytKey = localStorage.getItem('yt_api_key');
    const ytSt = document.getElementById('set-yt-status');
    if (ytSt) ytSt.textContent = ytKey ? 'Configurada' : (window.__ytServerConfigured ? 'Via servidor' : 'No configurada');
    if (ytSt && (ytKey || window.__ytServerConfigured)) ytSt.style.color = 'var(--g)';

    const jmKey = localStorage.getItem('byflow_jamendo_id');
    const jmSt = document.getElementById('set-jm-status');
    if (jmSt) jmSt.textContent = jmKey ? 'Configurada' : 'No configurada';
    if (jmSt && jmKey) jmSt.style.color = 'var(--g)';

    settings.updateLicenseUI();
  };

  settings.loadStats = async function() {
    const byId = function(id) { return document.getElementById(id); };
    const setText = function(id, value) {
      const node = byId(id);
      if (node) node.textContent = value;
    };
    const safe = function(value) {
      if (typeof escHtml === 'function') return escHtml(value || '');
      const div = document.createElement('div');
      div.textContent = value || '';
      return div.innerHTML;
    };
    const renderRanking = function(node, items, accentVar) {
      if (!node) return;
      if (Array.isArray(items) && items.length) {
        node.innerHTML = items.slice(0, 5).map(function(item, index) {
          return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);">' +
            '<span style="color:var(--text);">' + (index + 1) + '. ' + safe(item.name) + '</span>' +
            '<span style="color:' + accentVar + ';font-weight:700;">' + (item.count || 0) + 'x</span></div>';
        }).join('');
        return;
      }
      node.innerHTML = '<div style="opacity:.5;">Sin datos aun</div>';
    };
    const renderBaresExecutive = function(data) {
      const topSong = data && Array.isArray(data.topSongs) && data.topSongs.length ? data.topSongs[0] : null;
      const last7 = data && data.last7 ? Object.values(data.last7).map(function(value) { return Number(value) || 0; }) : [];
      const totalWeek = last7.reduce(function(sum, value) { return sum + value; }, 0);
      const status = data ? 'Actualizado desde /api/stats' : 'Sin conexion al resumen';

      setText('bares-kpi-total-songs', data && data.totalSongs ? data.totalSongs : 0);
      setText('bares-kpi-total-singers', data && data.totalSingers ? data.totalSingers : 0);
      setText('bares-kpi-top-song', topSong ? topSong.name : 'Sin datos');
      setText('bares-kpi-top-song-meta', topSong ? (topSong.count || 0) + ' solicitudes registradas' : 'Aun no hay historial suficiente.');
      setText('bares-kpi-last7', totalWeek);
      setText('bares-kpi-last7-meta', totalWeek ? 'Interacciones acumuladas en los ultimos 7 dias.' : 'Todavia no hay actividad registrada.');
      setText('bares-kpi-status', status);
    };

    try {
      const r = await fetch('/api/stats');
      const d = await r.json();
      setText('stat-total-songs', d.totalSongs || 0);
      setText('stat-total-singers', d.totalSingers || 0);

      renderRanking(byId('stat-top-songs'), d.topSongs, 'var(--p)');
      renderRanking(byId('stat-top-singers'), d.topSingers, 'var(--s)');

      const chartEl = byId('stat-chart');
      if (chartEl && d.last7) {
        const vals = Object.values(d.last7).map(function(value) { return Number(value) || 0; });
        const max = Math.max.apply(null, vals.concat([1]));
        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        chartEl.innerHTML = Object.entries(d.last7).map(function(entry) {
          const date = entry[0];
          const count = Number(entry[1]) || 0;
          const h = Math.max(4, (count / max) * 46);
          const day = days[new Date(date + 'T12:00:00').getDay()];
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">' +
            '<div style="font-size:10px;color:var(--p);font-weight:700;">' + (count || '') + '</div>' +
            '<div style="width:100%;height:' + h + 'px;background:linear-gradient(180deg,var(--p),var(--s));border-radius:3px;"></div>' +
            '<div style="font-size:10px;color:var(--sub);">' + day + '</div></div>';
        }).join('');
      }

      renderBaresExecutive(d);
    } catch {
      const errorHtml = '<div style="opacity:.5;">Error cargando</div>';
      const topSongsEl = byId('stat-top-songs');
      const topSingersEl = byId('stat-top-singers');
      if (topSongsEl) topSongsEl.innerHTML = errorHtml;
      if (topSingersEl) topSingersEl.innerHTML = errorHtml;
      renderBaresExecutive(null);
    }
  };
})(window.VibeFlow);

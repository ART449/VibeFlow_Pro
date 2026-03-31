(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const settings = VF.modules.settings = {};

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
    const tp = document.getElementById('tp-display');
    if (tp) tp.style.fontSize = size;
    localStorage.setItem('byflow_tp_fontsize', size);
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
    const savedTheme = localStorage.getItem('byflow_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const darkBtn = document.getElementById('set-dark-toggle');
    if (darkBtn) {
      if (savedTheme === 'light') darkBtn.classList.remove('on');
      else darkBtn.classList.add('on');
    }
    document.querySelector('meta[name="theme-color"]').content = savedTheme === 'dark' ? '#07070d' : '#f5f5fa';

    const fs = localStorage.getItem('byflow_tp_fontsize');
    if (fs) {
      const sel = document.getElementById('set-font-size');
      if (sel) sel.value = fs;
      settings.setTpFontSize(fs);
    }

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
    try {
      const r = await fetch('/api/stats');
      const d = await r.json();
      document.getElementById('stat-total-songs').textContent = d.totalSongs || 0;
      document.getElementById('stat-total-singers').textContent = d.totalSingers || 0;

      const topSongsEl = document.getElementById('stat-top-songs');
      if (d.topSongs && d.topSongs.length) {
        topSongsEl.innerHTML = d.topSongs.slice(0, 5).map((s, i) =>
          '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);">' +
          '<span style="color:var(--text);">' + (i + 1) + '. ' + escHtml(s.name) + '</span>' +
          '<span style="color:var(--p);font-weight:700;">' + s.count + 'x</span></div>'
        ).join('');
      } else {
        topSongsEl.innerHTML = '<div style="opacity:.5;">Sin datos aun</div>';
      }

      const topSingersEl = document.getElementById('stat-top-singers');
      if (d.topSingers && d.topSingers.length) {
        topSingersEl.innerHTML = d.topSingers.slice(0, 5).map((s, i) =>
          '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);">' +
          '<span style="color:var(--text);">' + (i + 1) + '. ' + escHtml(s.name) + '</span>' +
          '<span style="color:var(--s);font-weight:700;">' + s.count + 'x</span></div>'
        ).join('');
      } else {
        topSingersEl.innerHTML = '<div style="opacity:.5;">Sin datos aun</div>';
      }

      const chartEl = document.getElementById('stat-chart');
      if (d.last7) {
        const vals = Object.values(d.last7);
        const max = Math.max(...vals, 1);
        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        chartEl.innerHTML = Object.entries(d.last7).map(([date, count]) => {
          const h = Math.max(4, (count / max) * 46);
          const day = days[new Date(date + 'T12:00:00').getDay()];
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">' +
            '<div style="font-size:10px;color:var(--p);font-weight:700;">' + (count || '') + '</div>' +
            '<div style="width:100%;height:' + h + 'px;background:linear-gradient(180deg,var(--p),var(--s));border-radius:3px;"></div>' +
            '<div style="font-size:10px;color:var(--sub);">' + day + '</div></div>';
        }).join('');
      }
    } catch {
      document.getElementById('stat-top-songs').innerHTML = '<div style="opacity:.5;">Error cargando</div>';
      document.getElementById('stat-top-singers').innerHTML = '<div style="opacity:.5;">Error cargando</div>';
    }
  };
})(window.VibeFlow);

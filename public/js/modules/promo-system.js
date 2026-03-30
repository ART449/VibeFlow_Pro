(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const promo = VF.modules.promoSystem = {};

  function expose(name, value) {
    promo[name] = value;
    window[name] = value;
  }

  function safeEsc(value) {
    if (typeof escHtml === 'function') return escHtml(value);
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  const promoState = window.promoState || {
    active: false,
    timer: null,
    countdown: 10,
    promos: [],
    currentPromoIdx: 0,
    jingleAudio: null
  };
  window.promoState = promoState;

  function getBarPromos() {
    const saved = localStorage.getItem('bar_promos');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      '2x1 en cervezas de 9pm a 11pm',
      'Viernes de karaoke - canta gratis toda la noche',
      'Pregunta por nuestros combos y promociones',
      'Siguenos en redes sociales para ofertas exclusivas'
    ];
  }

  function saveBarPromos(promos) {
    localStorage.setItem('bar_promos', JSON.stringify(promos));
  }

  function getPromoTime() {
    const saved = localStorage.getItem('bar_promo_time');
    return saved ? parseInt(saved, 10) || 10 : 10;
  }

  function loadPromosEditor() {
    const ta = document.getElementById('bares-promos-text');
    const timeInp = document.getElementById('bares-promo-time');
    if (ta) ta.value = getBarPromos().join('\n');
    const savedTime = localStorage.getItem('bar_promo_time');
    if (timeInp && savedTime) timeInp.value = savedTime;
  }

  function saveBarPromosFromEditor() {
    const ta = document.getElementById('bares-promos-text');
    const timeInp = document.getElementById('bares-promo-time');
    if (!ta) return;
    const promos = ta.value.split('\n').map((line) => line.trim()).filter(Boolean);
    saveBarPromos(promos);
    if (timeInp) localStorage.setItem('bar_promo_time', timeInp.value);
    showToast('OK ' + promos.length + ' promos guardadas');
  }

  function testPromo() {
    const promos = getBarPromos();
    if (!promos.length) {
      showToast('Agrega al menos una promo');
      return;
    }
    showPromoBanner({ cantante: 'Demo', cancion: 'Cancion de prueba' });
  }

  function playJingle() {
    if (VF.modules.queue && typeof VF.modules.queue.playJingle === 'function') {
      VF.modules.queue.playJingle();
      return;
    }
    try {
      const vol = parseFloat(localStorage.getItem('byflow_jingle_vol') || '0.15');
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = vol;
      master.connect(ctx.destination);
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const spacing = 0.14;
      const lastNote = notes.length - 1;
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const at = ctx.currentTime + index * spacing;
        gain.gain.setValueAtTime(1.0, at);
        gain.gain.exponentialRampToValueAtTime(0.01, at + 0.45);
        osc.connect(gain);
        gain.connect(master);
        osc.start(at);
        osc.stop(at + 0.5);
        if (index === lastNote) osc.onended = () => ctx.close();
      });
    } catch {}
  }

  function updatePromoCountdown() {
    const el = document.getElementById('promo-countdown');
    if (el) el.textContent = promoState.countdown;
  }

  function skipPromo() {
    promoState.active = false;
    clearInterval(promoState.timer);
    const banner = document.getElementById('promo-banner');
    if (banner) banner.classList.remove('active');
    if (promoState.jingleAudio) {
      promoState.jingleAudio.pause();
      promoState.jingleAudio = null;
    }
    if (promoState.pendingNextId) {
      activarCantante(promoState.pendingNextId);
      promoState.pendingNextId = null;
    }
  }

  function showPromoBanner(nextSinger) {
    const banner = document.getElementById('promo-banner');
    const promos = getBarPromos();
    if (!banner || !promos.length) return;

    promoState.active = true;
    promoState.countdown = getPromoTime();
    promoState.currentPromoIdx = (promoState.currentPromoIdx + 1) % promos.length;

    const title = document.getElementById('promo-title');
    const text = document.getElementById('promo-text');
    if (title) title.textContent = 'Promocion del Establecimiento';
    if (text) text.textContent = promos[promoState.currentPromoIdx];

    const nextName = document.getElementById('promo-next-name');
    const nextInfo = document.getElementById('promo-next-info');
    if (nextSinger) {
      if (nextName) nextName.textContent = nextSinger.cantante + (nextSinger.cancion ? ' - ' + nextSinger.cancion : '');
      if (nextInfo) nextInfo.style.display = '';
    } else if (nextInfo) {
      nextInfo.style.display = 'none';
    }

    playJingle();
    banner.classList.add('active');
    updatePromoCountdown();

    promoState.timer = setInterval(() => {
      promoState.countdown -= 1;
      updatePromoCountdown();
      if (promoState.countdown <= 0) skipPromo();
    }, 1000);
  }

  function renderPendingMesas() {
    const waiting = (window.colaCache || []).filter((item) => item.estado === 'esperando' && item.mesa);
    const section = document.getElementById('pending-section');
    const list = document.getElementById('pending-list');
    const count = document.getElementById('pending-count');
    if (!section || !list) return;

    if (!waiting.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    if (count) count.textContent = waiting.length;

    const byMesa = {};
    waiting.forEach((item) => {
      if (!byMesa[item.mesa]) byMesa[item.mesa] = [];
      byMesa[item.mesa].push(item);
    });

    let html = '';
    Object.keys(byMesa).sort((a, b) => Number(a) - Number(b)).forEach((mesa) => {
      byMesa[mesa].forEach((item) => {
        html += '<div class="pending-item">' +
          '<span class="pi-mesa">M' + safeEsc(mesa) + '</span>' +
          '<span class="pi-song">' + safeEsc(item.cantante) + (item.cancion ? ' - ' + safeEsc(item.cancion) : '') + '</span>' +
        '</div>';
      });
    });
    list.innerHTML = html;
  }

  expose('promoState', promoState);
  expose('getBarPromos', getBarPromos);
  expose('saveBarPromos', saveBarPromos);
  expose('getPromoTime', getPromoTime);
  expose('loadPromosEditor', loadPromosEditor);
  expose('saveBarPromosFromEditor', saveBarPromosFromEditor);
  expose('testPromo', testPromo);
  expose('playJingle', playJingle);
  expose('updatePromoCountdown', updatePromoCountdown);
  expose('skipPromo', skipPromo);
  expose('showPromoBanner', showPromoBanner);
  expose('renderPendingMesas', renderPendingMesas);
})(window.VibeFlow = window.VibeFlow || {});

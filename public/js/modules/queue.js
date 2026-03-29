(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const queue = VF.modules.queue = {};

  queue.fetchCola = async function() {
    try {
      const r = await fetch('/api/cola');
      colaCache = await r.json();
      queue.renderCola(colaCache);
      queue.renderColaModal();
      if (currentMode === 'vistas') vpRefresh();
    } catch {}
  };

  queue.renderCola = function(cola) {
    if (cola) colaCache = cola;
    const el = document.getElementById('lista-cola');
    if (!el) return;
    if (!colaCache.length) {
      el.innerHTML = '<div class="empty-state"><span>&#127908;</span><p>Agrega el primer cantante para empezar</p></div>';
    } else {
      el.innerHTML = colaCache.map((c, i) => {
        const singing = c.estado === 'cantando';
        return '<div class="queue-item' + (singing ? ' singing' : '') + '">' +
          '<div class="qi-number">' + (i + 1) + '</div>' +
          '<div class="qi-info">' +
            '<div class="qi-name">' + escHtml(c.cantante) + '</div>' +
            '<div class="qi-song">' + escHtml(c.cancion || 'Sin cancion') + (c.mesa ? ' &middot; Mesa ' + c.mesa : '') + '</div>' +
          '</div>' +
          '<div class="qi-actions">' +
            '<button class="qi-btn play-btn" onclick="activarCantante(\'' + c.id + '\')" title="Cantar">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '</button>' +
            '<button class="qi-btn del-btn" onclick="eliminarCola(\'' + c.id + '\')" title="Quitar">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' +
            '</button>' +
          '</div></div>';
      }).join('');
    }

    queue.updateNowSinging(cola);
    if (typeof renderPendingMesas === 'function') renderPendingMesas();
    const items = document.querySelectorAll('#lista-cola .queue-item');
    const data = cola || colaCache;
    items.forEach((item, i) => {
      if (data[i] && typeof makeDraggable === 'function') makeDraggable(item, data[i].id);
    });
    if (document.getElementById('cola-modal')?.classList.contains('open')) queue.renderColaModal();
    if (typeof enhanceAccessibility === 'function') enhanceAccessibility();
  };

  queue.agregarCola = async function() {
    const cantante = document.getElementById('input-cantante').value.trim();
    const cancion = document.getElementById('input-cancion').value.trim();
    const mesa = document.getElementById('input-mesa').value;
    if (!cantante) return;
    if (!textoLimpio(cantante) || !textoLimpio(cancion)) {
      showToast('Contenido inapropiado detectado');
      return;
    }
    try {
      const r = await fetch('/api/cola', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cantante, cancion, mesa })
      });
      const data = await r.json();
      if (!r.ok) {
        showToast(data.error || 'Error');
        return;
      }
      document.getElementById('input-cantante').value = '';
      document.getElementById('input-cancion').value = '';
      showToast('Agregado: ' + cantante);
      queue.fetchCola();
    } catch {
      showToast('Error al agregar');
    }
  };

  queue.eliminarCola = async function(id) {
    try {
      await fetch('/api/cola/' + id, { method: 'DELETE' });
      queue.fetchCola();
    } catch {}
  };

  queue.openColaModal = function() {
    queue.renderColaModal();
    document.getElementById('cola-modal').classList.add('open');
    queue.fetchCola();
  };

  queue.closeColaModal = function() {
    document.getElementById('cola-modal').classList.remove('open');
  };

  queue.renderColaModal = function() {
    const el = document.getElementById('cola-modal-list');
    if (!el) return;
    if (!colaCache.length) {
      el.innerHTML = '<div style="text-align:center;padding:32px 0;color:var(--sub);">La cola esta vacia - escribe un nombre abajo para empezar</div>';
      return;
    }
    el.innerHTML = colaCache.map((c, i) => {
      const singing = c.estado === 'cantando';
      return '<div class="queue-item' + (singing ? ' singing' : '') + '">' +
        '<div class="qi-number">' + (i + 1) + '</div>' +
        '<div class="qi-info"><div class="qi-name">' + escHtml(c.cantante) + '</div>' +
        '<div class="qi-song">' + escHtml(c.cancion || 'Sin cancion') + (c.mesa ? ' &middot; Mesa ' + c.mesa : '') + '</div></div>' +
        '<div class="qi-actions">' +
        '<button class="qi-btn play-btn" onclick="activarCantante(\'' + c.id + '\');closeColaModal()" title="Cantar"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>' +
        '<button class="qi-btn del-btn" onclick="eliminarCola(\'' + c.id + '\')" title="Quitar"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
        '</div></div>';
    }).join('');
  };

  queue.mAgregarCola = async function() {
    const cantante = document.getElementById('m-input-cantante').value.trim();
    const cancion = document.getElementById('m-input-cancion').value.trim();
    if (!cantante) return;
    if (!textoLimpio(cantante) || !textoLimpio(cancion)) {
      showToast('Contenido inapropiado');
      return;
    }
    try {
      const r = await fetch('/api/cola', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cantante, cancion })
      });
      if (!r.ok) {
        showToast('Error al agregar');
        return;
      }
      document.getElementById('m-input-cantante').value = '';
      document.getElementById('m-input-cancion').value = '';
      showToast('Agregado: ' + cantante);
      await queue.fetchCola();
      queue.renderColaModal();
    } catch {
      showToast('Error al agregar');
    }
  };

  queue.activarCantante = async function(id) {
    try {
      await fetch('/api/cola/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cantando' })
      });
      await queue.fetchCola();
    } catch {
      return;
    }

    const item = colaCache.find((c) => c.id === id);
    if (!item || !item.cancion) return;

    let lyricsLoaded = false;
    if (ytApiKey && (typeof currentMode === 'undefined' || currentMode !== 'remote')) {
      try {
        const q = item.cancion + (item.cantante ? ' ' + item.cantante : '');
        const params = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '1', q, key: ytApiKey });
        const r = await fetch('/api/youtube/search?' + params);
        const d = await r.json();
        if (d.items && d.items.length) {
          const vid = d.items[0];
          lyricsLoaded = await ytPlayWithLyrics(vid.id.videoId, vid.snippet.title);
          showToast('Play: ' + vid.snippet.title.substring(0, 35));
        }
      } catch {}
    }

    if (!lyricsLoaded) {
      await fetchSongs();
      const match = allSongs.find((s) =>
        s.titulo.toLowerCase().includes(item.cancion.toLowerCase()) ||
        item.cancion.toLowerCase().includes(s.titulo.toLowerCase())
      );
      if (match && match.letra) {
        setLyrics(match.letra);
        if (socket) socket.emit('tp_lyrics', { lyrics: match.letra });
        showToast(item.cantante + ' - letra cargada');
      }
    }
  };

  queue.updateNowSinging = function(cola) {
    const current = (cola || colaCache).find((c) => c.estado === 'cantando');
    const banner = document.getElementById('now-singing');
    if (!banner) return;
    if (current) {
      banner.classList.add('active');
      document.getElementById('ns-name').textContent = current.cantante;
      document.getElementById('ns-song').textContent = current.cancion || 'Sin cancion';
    } else {
      banner.classList.remove('active');
    }
  };

  queue.siguienteCantante = async function() {
    if (typeof adOnSongChange === 'function') adOnSongChange();
    const promoEnabled = localStorage.getItem('byflow_autopromo') !== '0';
    if (promoEnabled) {
      const nextIdx = colaCache.findIndex((c) => c.estado === 'esperando');
      const nextSinger = nextIdx >= 0 ? colaCache[nextIdx] : null;
      const current = colaCache.find((c) => c.estado === 'cantando');

      if (current) {
        if (socket && socket.connected) {
          socket.emit('cola_next');
        } else {
          await fetch('/api/cola/' + current.id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'terminado' })
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        await queue.fetchCola();
      }

      if (nextSinger && typeof showPromoBanner === 'function' && typeof promoState !== 'undefined') {
        promoState.pendingNextId = nextSinger.id;
        showPromoBanner(nextSinger);
      }
      return;
    }

    if (socket && socket.connected) {
      socket.emit('cola_next');
      return;
    }
    const current = colaCache.find((c) => c.estado === 'cantando');
    if (current) {
      await fetch('/api/cola/' + current.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'terminado' })
      });
    }
    const next = colaCache.find((c) => c.estado === 'esperando');
    if (next) {
      await fetch('/api/cola/' + next.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cantando' })
      });
    }
    queue.fetchCola();
  };

  queue.playJingle = function() {
    try {
      const vol = parseFloat(localStorage.getItem('byflow_jingle_vol') || '0.15');
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = vol;
      master.connect(ctx.destination);
      const notes = [523.25, 659.25, 783.99, 1046.50];
      const spacing = 0.14;
      const lastNote = notes.length - 1;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * spacing;
        gain.gain.setValueAtTime(1.0, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t);
        osc.stop(t + 0.5);
        if (i === lastNote) osc.onended = () => ctx.close();
      });
    } catch {}
  };
})(window.VibeFlow);

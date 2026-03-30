(function initVibeFlowCatalogAdmin(ns) {
  'use strict';

  ns.modules = ns.modules || {};
  const catalogAdmin = ns.modules.catalogAdmin = {};
  const utils = ns.Utils || { exposeGlobal() {} };

  function toast(msg, type) {
    if (typeof showToast === 'function') return showToast(msg, type);
  }

  function setLyricsSafe(letra) {
    if (typeof setLyrics === 'function') setLyrics(letra);
  }

  function emitLyricsSafe(letra) {
    if (typeof socket !== 'undefined' && socket && typeof socket.emit === 'function') {
      socket.emit('tp_lyrics', { lyrics: letra });
    }
  }

  function defaultMesas() {
    return Array.from({ length: 12 }, (_, i) => ({ numero: i + 1, estado: 'libre' }));
  }

  catalogAdmin.renderMesas = function(mesas) {
    const el = document.getElementById('grid-mesas');
    const sel = document.getElementById('input-mesa');
    if (!el) return;
    if (!mesas) mesas = defaultMesas();
    el.innerHTML = mesas.map((m) =>
      '<div class="mesa-cell ' + m.estado + '" onclick="toggleMesa(' + m.numero + ')">' +
      '<div class="mesa-num">' + m.numero + '</div>' +
      '<div class="mesa-label">' + m.estado + '</div></div>'
    ).join('');
    if (sel) {
      sel.innerHTML = '<option value="">Mesa</option>' +
        mesas.map((m) => '<option value="' + m.numero + '">' + m.numero + '</option>').join('');
    }
  };

  catalogAdmin.toggleMesa = async function(num) {
    const cells = document.querySelectorAll('.mesa-cell');
    const cell = cells[num - 1];
    const isLibre = cell && cell.classList.contains('libre');
    try {
      await fetch('/api/mesas/' + num, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: isLibre ? 'ocupada' : 'libre' })
      });
    } catch {}
  };

  catalogAdmin.agregarCancion = async function() {
    const titulo = document.getElementById('new-song-title').value.trim();
    const letra = document.getElementById('new-song-letra').value.trim();
    const artEl = document.getElementById('new-song-artista');
    const artista = artEl ? artEl.value.trim() : '';
    if (!titulo) { toast('Escribe el titulo de la cancion'); return; }
    try {
      await fetch('/api/canciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, letra, artista })
      });
      document.getElementById('new-song-title').value = '';
      if (artEl) artEl.value = '';
      document.getElementById('new-song-letra').value = '';
      if (letra) {
        setLyricsSafe(letra);
        emitLyricsSafe(letra);
      }
      toast('Cancion guardada: ' + titulo);
    } catch {
      toast('Error al guardar cancion');
    }
  };

  catalogAdmin.buscarLetraYoutube = async function() {
    const titulo = document.getElementById('new-song-title').value.trim();
    const artista = document.getElementById('new-song-artista') ? document.getElementById('new-song-artista').value.trim() : '';
    if (!titulo) { toast('Escribe el titulo primero'); return; }
    const q = titulo + (artista ? ' ' + artista : '');
    const letraEl = document.getElementById('new-song-letra');
    toast('Buscando letra de "' + titulo + '"...');
    try {
      const r = await fetch('/api/lrclib/search?q=' + encodeURIComponent(q));
      const data = await r.json();
      if (data && data.length && data[0].plainLyrics) {
        letraEl.value = data[0].plainLyrics;
        toast('Letra encontrada: ' + (data[0].trackName || titulo), 'success');
        return;
      }
      if (window.__artLetrasReady && window.__artLetrasData) {
        const ql = q.toLowerCase();
        const local = window.__artLetrasData.find((l) => l.titulo.toLowerCase().includes(ql));
        if (local) {
          letraEl.value = local.letra;
          toast('Letra local: ' + local.titulo, 'success');
          return;
        }
      }
      toast('No se encontro letra para "' + titulo + '"', 'warning');
    } catch {
      toast('Error buscando letra \u2014 sin conexion', 'error');
    }
  };

  ns.CatalogAdmin = catalogAdmin;

  utils.exposeGlobal('renderMesas', catalogAdmin.renderMesas);
  utils.exposeGlobal('toggleMesa', catalogAdmin.toggleMesa);
  utils.exposeGlobal('agregarCancion', catalogAdmin.agregarCancion);
  utils.exposeGlobal('buscarLetraYoutube', catalogAdmin.buscarLetraYoutube);
})(window.VibeFlow = window.VibeFlow || {});

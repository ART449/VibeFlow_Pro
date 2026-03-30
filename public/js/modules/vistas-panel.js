(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const vistas = VF.modules.vistasPanel = {};

  function expose(name, value) {
    vistas[name] = value;
    window[name] = value;
  }

  function safeEsc(value) {
    if (typeof escHtml === 'function') return escHtml(value);
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  function vpRefresh() {
    const list = document.getElementById('vp-cola-list');
    const countEl = document.getElementById('vp-cola-count');
    const cola = window.colaCache || [];
    if (list) {
      if (!cola.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--sub);font-size:11px;">Cola vacia</div>';
      } else {
        list.innerHTML = cola.map((item, index) => {
          const singing = item.estado === 'cantando';
          return '<div class="vp-cola-item' + (singing ? ' singing' : '') + '" onclick="activarCantante(\'' + item.id + '\')">' +
            '<div class="vp-cola-num">' + (index + 1) + '</div>' +
            '<div class="vp-cola-info">' +
              '<div class="vp-cola-name">' + safeEsc(item.cantante || 'Sin nombre') + '</div>' +
              '<div class="vp-cola-song">' + safeEsc(item.cancion || 'Sin cancion') + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    }
    if (countEl) countEl.textContent = cola.length;

    const singing = cola.find((item) => item.estado === 'cantando');
    const vpNow = document.getElementById('vp-now');
    const vpNowName = document.getElementById('vp-now-name');
    const vpNowSong = document.getElementById('vp-now-song');
    const vpPlaying = document.getElementById('vp-playing');
    if (singing) {
      if (vpNow) vpNow.style.display = 'flex';
      if (vpNowName) vpNowName.textContent = singing.cantante || '-';
      if (vpNowSong) vpNowSong.textContent = singing.cancion || '-';
      if (vpPlaying) vpPlaying.textContent = singing.cantante;
    } else {
      if (vpNow) vpNow.style.display = 'none';
      if (vpPlaying) vpPlaying.textContent = 'Nada sonando';
    }

    const tpDisplay = document.getElementById('tp-display');
    const vpTp = document.getElementById('vp-tp');
    if (vpTp && tpDisplay) {
      const text = tpDisplay.textContent.trim();
      if (text && text !== 'Buscar letra en internet' && text !== 'Vive Cantando con ByFlow') {
        const lines = (window.tpState && window.tpState.lines) || [];
        if (lines.length) {
          const currentLine = window.tpState.currentLine >= 0 ? window.tpState.currentLine : 0;
          vpTp.innerHTML = lines.map((line, index) => {
            const cls = index < currentLine ? 'vp-line-done' : index === currentLine ? 'vp-line-active' : '';
            const style = index < currentLine ? 'opacity:.2;' : index === currentLine ? 'opacity:1;color:var(--p);font-weight:800;' : 'opacity:.4;';
            return '<div class="' + cls + '" style="margin-bottom:8px;' + style + '">' + safeEsc(line.text) + '</div>';
          }).join('');
          const activeEl = vpTp.querySelector('.vp-line-active');
          if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          vpTp.textContent = text;
        }
        vpTp.style.fontSize = '1.6rem';
      } else {
        vpTp.innerHTML = '<div class="vp-tp-empty">Selecciona una cancion para ver la letra aqui</div>';
        vpTp.style.fontSize = '';
      }
    }
  }

  async function vpSearch() {
    const inp = document.getElementById('vp-search-inp');
    const results = document.getElementById('vp-results');
    const q = inp ? inp.value.trim() : '';
    if (!q || !results) return;
    results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--sub);font-size:11px;">Buscando...</div>';
    try {
      const ytKey = localStorage.getItem('byflow_yt_api_key') || localStorage.getItem('yt_api_key') || '';
      const res = await fetch('/api/youtube/search?q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(ytKey));
      const data = await res.json();
      if (!data.error && data.items && data.items.length > 0) {
        results.innerHTML = data.items.map((item) => {
          const vid = item.id.videoId || item.id;
          const rawTitle = item.snippet.title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
          const safeTitle = safeEsc(rawTitle);
          const thumb = item.snippet.thumbnails && item.snippet.thumbnails.default ? item.snippet.thumbnails.default.url : '';
          return '<div class="vp-result-item" onclick="vpPlay(\'' + vid + '\',\'' + rawTitle.replace(/'/g, "\\'").replace(/"/g, '&quot;') + '\')">' +
            '<img class="vp-result-thumb" src="' + safeEsc(thumb) + '" alt="" loading="lazy">' +
            '<div class="vp-result-title" title="' + safeTitle + '">' + safeTitle + '</div>' +
            '<button class="vp-result-play">&#9654;</button>' +
          '</div>';
        }).join('');
        return;
      }
      const lrcRes = await fetch('/api/lrclib/search?q=' + encodeURIComponent(q));
      const lrcData = await lrcRes.json();
      if (lrcData && lrcData.length > 0) {
        window._vpLrcCache = lrcData;
        results.innerHTML = lrcData.slice(0, 8).map((item, index) => {
          const title = safeEsc(item.trackName || item.name || q);
          const artist = safeEsc(item.artistName || item.artist || '');
          return '<div class="vp-result-item" onclick="loadLyricsDirect(' + index + ')">' +
            '<div class="vp-result-title" title="' + title + (artist ? ' - ' + artist : '') + '">' + title + (artist ? ' <span style="font-size:9px;opacity:.6;">- ' + artist + '</span>' : '') + '</div>' +
            '<button class="vp-result-play" title="Cargar letra">&#9654;</button>' +
          '</div>';
        }).join('');
      } else {
        results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--sub);font-size:11px;">Sin resultados para "' + safeEsc(q) + '"</div>';
      }
    } catch {
      results.innerHTML = '<div style="padding:20px;text-align:center;color:var(--sub);font-size:11px;">Error de busqueda</div>';
    }
  }

  function loadLyricsDirect(index) {
    const item = (window._vpLrcCache || [])[index];
    if (!item) return;
    const lyrics = item.syncedLyrics || item.plainLyrics || '';
    const title = item.trackName || item.name || '';
    if (lyrics) {
      setLyrics(lyrics);
      showToast('Letra cargada: ' + title);
    } else {
      showToast('Sin letra disponible para esta cancion');
    }
  }

  function vpPlay(videoId, title) {
    if (typeof ytPlayWithLyrics === 'function') {
      ytPlayWithLyrics(videoId, title);
      setTimeout(vpRefresh, 500);
    } else if (typeof ytEmbed === 'function') {
      ytEmbed(videoId);
    }
  }

  expose('vpRefresh', vpRefresh);
  expose('vpSearch', vpSearch);
  expose('loadLyricsDirect', loadLyricsDirect);
  expose('vpPlay', vpPlay);
})(window.VibeFlow = window.VibeFlow || {});

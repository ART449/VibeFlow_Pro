(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const estudio = VF.modules.estudioBeats = {};

  function expose(name, value) {
    estudio[name] = value;
    window[name] = value;
  }

  let estBeatPlayer = null;
  let estBeatInfo = null;
  let estMediaRecorder = null;
  let estRecChunks = [];
  let estRecBlob = null;
  let estIsPlaying = false;
  let estIsRecording = false;
  let estVotedIds = new Set(JSON.parse(localStorage.getItem('byflow_voted') || '[]'));
  let creatorToken = localStorage.getItem('byflow_creator_token') || null;
  let creatorAlias = localStorage.getItem('byflow_creator_alias') || null;

  function syncCreatorGlobals() {
    window._creatorToken = creatorToken;
    window._creatorAlias = creatorAlias;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return mins + ' min';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h';
    const days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd';
    return new Date(dateStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  }

  function getLikedBeats() {
    try { return JSON.parse(localStorage.getItem('byflow_liked_beats') || '[]'); }
    catch { return []; }
  }

  function saveLikedBeats(beats) {
    localStorage.setItem('byflow_liked_beats', JSON.stringify(beats));
  }

  function estIsLiked(videoId) {
    return getLikedBeats().some((beat) => beat.videoId === videoId);
  }

  async function estSearchBeats() {
    const q = document.getElementById('est-search-input').value.trim();
    if (!q) return;
    const searchQ = q + (q.toLowerCase().includes('beat') ? '' : ' type beat instrumental');
    const container = document.getElementById('est-results');
    if (!container) return;
    container.innerHTML = '<div class="est-empty">Buscando beats...</div>';
    try {
      const apiKey = localStorage.getItem('byflow_yt_api_key') || localStorage.getItem('yt_api_key') || '';
      const headers = apiKey ? { 'X-YouTube-Key': apiKey } : {};
      const res = await fetch('/api/youtube/search?q=' + encodeURIComponent(searchQ), Object.keys(headers).length ? { headers } : {});
      const data = await res.json();
      if (!data.items || !data.items.length) {
        container.innerHTML = '<div class="est-empty">No se encontraron beats. Intenta otro genero.</div>';
        return;
      }
      container.innerHTML = '';
      data.items.forEach((item) => {
        const vid = item.id.videoId;
        const title = item.snippet.title;
        const channel = item.snippet.channelTitle;
        const thumb = item.snippet.thumbnails.default.url;
        const div = document.createElement('div');
        const isLiked = estIsLiked(vid);
        div.className = 'est-result-item';
        div.innerHTML = `
          <img class="est-result-thumb" src="${thumb}" alt="" loading="lazy">
          <div class="est-result-info">
            <div class="est-result-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
            <div class="est-result-channel">&#127908; ${escapeHtml(channel)}</div>
          </div>
          <button class="est-like-btn ${isLiked ? 'liked' : ''}" onclick="estToggleLike(event,'${vid}',\`${title.replace(/`/g, "'")}\`,'${channel}','${thumb}')" title="${isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}">&#10084;&#65039;</button>
          <button class="est-result-use" onclick="estSelectBeat('${vid}',\`${title.replace(/`/g, "'")}\`,'${channel}')">Usar Beat</button>
        `;
        container.appendChild(div);
      });
    } catch {
      container.innerHTML = '<div class="est-empty">Error buscando. Revisa tu configuracion de YouTube o del servidor.</div>';
    }
  }

  function estToggleLike(event, videoId, title, channel, thumb) {
    event.stopPropagation();
    const beats = getLikedBeats();
    const idx = beats.findIndex((beat) => beat.videoId === videoId);
    const btn = event.currentTarget;
    if (idx >= 0) {
      const updated = beats.filter((_, index) => index !== idx);
      saveLikedBeats(updated);
      btn.classList.remove('liked');
      btn.title = 'Agregar a favoritos';
      showToast('Beat removido de favoritos');
    } else {
      saveLikedBeats([{ videoId, title, channel, thumb, likedAt: Date.now() }, ...beats]);
      btn.classList.add('liked');
      btn.title = 'Quitar de favoritos';
      showToast('Beat guardado en favoritos');
    }
  }

  function estShowSearch() {
    const searchTab = document.getElementById('est-tab-search');
    const favsTab = document.getElementById('est-tab-favs');
    const results = document.getElementById('est-results');
    if (searchTab) searchTab.classList.add('active');
    if (favsTab) favsTab.classList.remove('active');
    if (results) results.innerHTML = '<div class="est-empty">Busca un beat para empezar a escribir tu letra</div>';
  }

  function estShowFavs() {
    const favsTab = document.getElementById('est-tab-favs');
    const searchTab = document.getElementById('est-tab-search');
    const container = document.getElementById('est-results');
    if (!container) return;
    if (favsTab) favsTab.classList.add('active');
    if (searchTab) searchTab.classList.remove('active');
    const beats = getLikedBeats();
    if (!beats.length) {
      container.innerHTML = '<div class="est-empty">No tienes beats favoritos aun. Dale &#10084;&#65039; a un beat para guardarlo.</div>';
      return;
    }
    container.innerHTML = '';
    beats.forEach((beat) => {
      const div = document.createElement('div');
      div.className = 'est-result-item';
      div.innerHTML = `
        <img class="est-result-thumb" src="${beat.thumb}" alt="" loading="lazy">
        <div class="est-result-info">
          <div class="est-result-title" title="${escapeHtml(beat.title)}">${escapeHtml(beat.title)}</div>
          <div class="est-result-channel">&#127908; ${escapeHtml(beat.channel)}</div>
        </div>
        <button class="est-like-btn liked" onclick="estToggleLikeFav(event,'${beat.videoId}')" title="Quitar de favoritos">&#10084;&#65039;</button>
        <button class="est-result-use" onclick="estSelectBeat('${beat.videoId}',\`${beat.title.replace(/`/g, "'")}\`,'${beat.channel}')">Usar Beat</button>
      `;
      container.appendChild(div);
    });
  }

  function estToggleLikeFav(event, videoId) {
    event.stopPropagation();
    saveLikedBeats(getLikedBeats().filter((beat) => beat.videoId !== videoId));
    showToast('Beat removido de favoritos');
    estShowFavs();
  }

  function estGenreSearch(btn, query) {
    document.querySelectorAll('.est-genre-btn').forEach((item) => item.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const input = document.getElementById('est-search-input');
    if (input) input.value = query;
    estSearchBeats();
  }

  function estSelectBeat(videoId, titulo, canal) {
    estBeatInfo = {
      videoId,
      titulo,
      canal,
      canalUrl: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(canal)
    };
    window._estBeatInfo = estBeatInfo;
    const embed = document.getElementById('est-beat-embed');
    if (embed) {
      embed.innerHTML = '<iframe src="https://www.youtube.com/embed/' + videoId + '?enablejsapi=1&rel=0&modestbranding=1" allow="autoplay" allowfullscreen></iframe>';
    }
    const disclaimer = document.getElementById('est-disclaimer');
    if (disclaimer) disclaimer.style.display = 'flex';
    const link = document.getElementById('est-disc-link');
    if (link) link.href = estBeatInfo.canalUrl;
    const nameSpan = document.getElementById('est-disc-name');
    if (nameSpan) nameSpan.textContent = canal;
    else if (link) link.textContent = canal;
    showToast('Beat seleccionado: ' + titulo, 'success');
  }

  function estTogglePlay() {
    const btn = document.getElementById('est-play-master');
    const iframe = document.querySelector('#est-beat-embed iframe');
    if (!iframe) {
      showToast('Selecciona un beat primero', 'warning');
      return;
    }
    estIsPlaying = !estIsPlaying;
    if (btn) btn.innerHTML = estIsPlaying ? '&#10074;&#10074;' : '&#9654;';
    iframe.contentWindow.postMessage('{"event":"command","func":"' + (estIsPlaying ? 'playVideo' : 'pauseVideo') + '","args":""}', '*');
  }

  async function estToggleRec() {
    const btn = document.getElementById('est-rec-btn');
    if (estIsRecording) {
      if (estMediaRecorder && estMediaRecorder.state === 'recording') estMediaRecorder.stop();
      estIsRecording = false;
      if (btn) {
        btn.classList.remove('recording');
        btn.title = 'Grabar voz';
      }
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      estRecChunks = [];
      estMediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      estMediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) estRecChunks.push(event.data);
      };
      estMediaRecorder.onstop = () => {
        estRecBlob = new Blob(estRecChunks, { type: 'audio/webm' });
        window._estRecBlob = estRecBlob;
        stream.getTracks().forEach((track) => track.stop());
        showToast('Grabacion guardada en sesion', 'success');
      };
      estMediaRecorder.start();
      estIsRecording = true;
      if (btn) {
        btn.classList.add('recording');
        btn.title = 'Detener grabacion';
      }
    } catch {
      showToast('No se pudo acceder al microfono', 'error');
    }
  }

  async function estSaveLetter() {
    const titulo = document.getElementById('est-titulo').value.trim();
    const letra = document.getElementById('est-letra-area').value.trim();
    if (!titulo || !letra) {
      showToast('Escribe un titulo y tu letra', 'warning');
      return;
    }
    const usuario = localStorage.getItem('byflow_user_alias') || localStorage.getItem('byflow_user_name') || 'Anonimo';
    const payload = {
      titulo,
      letra,
      usuario,
      beat: estBeatInfo || null,
      fecha: new Date().toISOString()
    };
    try {
      const res = await fetch('/api/letras-beat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        showToast('Letra guardada con exito', 'success');
        document.getElementById('est-titulo').value = '';
        document.getElementById('est-letra-area').value = '';
      } else {
        showToast('Error al guardar', 'error');
      }
    } catch {
      showToast('Error de conexion', 'error');
    }
  }

  function estSwitchTab(tab, btn) {
    document.querySelectorAll('.est-tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.est-tab-content').forEach((item) => {
      item.classList.remove('active');
      item.style.display = 'none';
    });
    if (btn) btn.classList.add('active');
    const panel = document.getElementById('est-tab-' + tab);
    if (panel) {
      panel.classList.add('active');
      panel.style.display = (tab === 'escribir' || tab === 'gflow') ? 'grid' : 'flex';
    }
    if (tab === 'ranking') estLoadRanking('all');
    if (tab === 'mis') estLoadMisLetras();
    if (tab === 'actividad') estLoadActividad();
    if (tab === 'perfil') estLoadPerfil();
    if (tab === 'gflow') {
      if (typeof checkOllamaStatus === 'function') checkOllamaStatus();
      if (typeof gflowEstUpdateStatus === 'function') setTimeout(gflowEstUpdateStatus, 500);
    }
  }

  async function estLoadRanking(period, btn) {
    if (btn) {
      document.querySelectorAll('.est-filter-btn').forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
    }
    const container = document.getElementById('est-ranking-list');
    if (!container) return;
    container.innerHTML = '<div class="est-ranking-empty">Cargando...</div>';
    try {
      const res = await fetch('/api/letras-beat/ranking?limit=50');
      const items = await res.json();
      const now = Date.now();
      const filtered = items.filter((item) => {
        if (period === 'all') return true;
        const itemDate = new Date(item.fecha).getTime();
        if (period === 'week') return (now - itemDate) < 7 * 24 * 60 * 60 * 1000;
        if (period === 'month') return (now - itemDate) < 30 * 24 * 60 * 60 * 1000;
        return true;
      });
      if (!filtered.length) {
        container.innerHTML = '<div class="est-ranking-empty">No hay letras publicadas todavia.<br><span style="font-size:11px;opacity:.6;">Escribe tu letra, guardala y publicala para aparecer aqui.</span></div>';
        return;
      }
      container.innerHTML = '';
      filtered.forEach((item, index) => {
        const posClass = index === 0 ? 'top1' : index === 1 ? 'top2' : index === 2 ? 'top3' : '';
        const voted = estVotedIds.has(item.id);
        const beatLine = item.beat ? '<div class="est-ranking-beat">&#127908; <a href="' + (item.beat.canalUrl || '#') + '" target="_blank">' + (item.beat.canal || 'Beat') + '</a> - ' + (item.beat.titulo || '') + '</div>' : '';
        const fecha = new Date(item.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        const div = document.createElement('div');
        div.className = 'est-ranking-item';
        div.innerHTML = `
          <div class="est-ranking-pos ${posClass}">${index + 1}</div>
          <div class="est-ranking-info">
            <div class="est-ranking-title">${escapeHtml(item.titulo)}</div>
            <div class="est-ranking-meta"><span class="est-ranking-author" onclick="event.stopPropagation();estViewCreator('${escapeHtml(item.usuario || 'Anonimo')}')" style="cursor:pointer;text-decoration:underline dotted;" title="Ver perfil de ${escapeHtml(item.usuario || 'Anonimo')}">&#9998; ${escapeHtml(item.usuario || 'Anonimo')}</span><span>${fecha}</span></div>
            ${beatLine}
          </div>
          <div class="est-ranking-votes">
            <button class="est-vote-btn${voted ? ' voted' : ''}" onclick="estVote('${item.id}',this)" title="${voted ? 'Ya votaste' : 'Votar'}">&#9650;</button>
            <span class="est-vote-count">${item.votos || 0}</span>
          </div>
        `;
        const info = div.querySelector('.est-ranking-info');
        if (info) {
          info.style.cursor = 'pointer';
          info.onclick = () => estPreviewLetter(item);
        }
        container.appendChild(div);
      });
    } catch {
      container.innerHTML = '<div class="est-ranking-empty">Error cargando ranking</div>';
    }
  }

  async function estVote(id, btn) {
    if (estVotedIds.has(id)) return;
    try {
      const res = await fetch('/api/letras-beat/' + id + '/voto', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        estVotedIds.add(id);
        localStorage.setItem('byflow_voted', JSON.stringify([...estVotedIds]));
        btn.classList.add('voted');
        btn.title = 'Ya votaste';
        const countEl = btn.parentElement.querySelector('.est-vote-count');
        if (countEl) countEl.textContent = data.votos;
        showToast('Voto registrado', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'No se pudo votar', 'warning');
      }
    } catch {
      showToast('Error de conexion', 'error');
    }
  }

  function estPreviewLetter(item) {
    estSwitchTab('escribir', document.querySelector('[data-est-tab="escribir"]'));
    document.getElementById('est-titulo').value = item.titulo || '';
    document.getElementById('est-letra-area').value = item.letra || '';
    if (item.beat && item.beat.videoId) estSelectBeat(item.beat.videoId, item.beat.titulo, item.beat.canal);
    showToast('Letra cargada: ' + item.titulo, 'info');
  }

  async function estLoadMisLetras() {
    const container = document.getElementById('est-mis-list');
    if (!container) return;
    container.innerHTML = '<div class="est-ranking-empty">Cargando...</div>';
    try {
      const res = await fetch('/api/letras-beat?limit=50');
      const data = await res.json();
      const items = data.items || [];
      if (!items.length) {
        container.innerHTML = '<div class="est-ranking-empty">No tienes letras guardadas.<br><span style="font-size:11px;opacity:.6;">Ve a Escribir, crea tu letra y guardala.</span></div>';
        return;
      }
      container.innerHTML = '';
      items.forEach((item) => {
        const fecha = new Date(item.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
        const preview = (item.letra || '').slice(0, 120).replace(/\n/g, ' ') + (item.letra && item.letra.length > 120 ? '...' : '');
        const pubText = item.publicado ? 'Publicada' : 'Publicar';
        const pubClass = item.publicado ? 'pub active' : 'pub';
        const beatTag = item.beat ? '<span style="color:#06b6d4;font-size:10px;">&#127908; ' + escapeHtml(item.beat.canal || 'Beat') + '</span>' : '';
        const div = document.createElement('div');
        div.className = 'est-mis-item';
        div.innerHTML = `
          <div class="est-mis-head">
            <div class="est-mis-title">${escapeHtml(item.titulo)}</div>
            <div class="est-mis-date">${fecha}</div>
          </div>
          <div class="est-mis-preview">${escapeHtml(preview)}</div>
          ${beatTag ? '<div style="margin-top:4px;">' + beatTag + '</div>' : ''}
          <div class="est-mis-actions">
            <button class="est-mis-btn" onclick="estPreviewLetter(${JSON.stringify(item).replace(/"/g, '&quot;')})">Editar</button>
            <button class="est-mis-btn ${pubClass}" onclick="estTogglePublish('${item.id}',this)">${pubText}</button>
            <span style="flex:1;"></span>
            <span style="font-size:10px;color:var(--sub);">&#9650; ${item.votos || 0} votos</span>
          </div>
        `;
        container.appendChild(div);
      });
    } catch {
      container.innerHTML = '<div class="est-ranking-empty">Error cargando letras</div>';
    }
  }

  async function estTogglePublish(id, btn) {
    try {
      const res = await fetch('/api/letras-beat/' + id + '/publicar', { method: 'PUT' });
      if (res.ok) {
        const data = await res.json();
        btn.textContent = data.publicado ? 'Publicada' : 'Publicar';
        btn.className = data.publicado ? 'est-mis-btn pub active' : 'est-mis-btn pub';
        showToast(data.publicado ? 'Letra publicada en el ranking' : 'Letra retirada del ranking', data.publicado ? 'success' : 'info');
      }
    } catch {
      showToast('Error al cambiar estado', 'error');
    }
  }

  async function estLoadActividad() {
    const container = document.getElementById('est-actividad-list');
    if (!container) return;
    container.innerHTML = '<div class="est-ranking-empty">Cargando...</div>';
    try {
      const res = await fetch('/api/actividad?limit=30');
      const items = await res.json();
      if (!items.length) {
        container.innerHTML = '<div class="est-ranking-empty">No hay actividad todavia.<br><span style="font-size:11px;opacity:.6;">Publica una letra para que aparezca aqui.</span></div>';
        return;
      }
      container.innerHTML = '';
      items.forEach((item) => {
        const isVote = item.tipo === 'letra_votada';
        const icon = isVote ? '&#9650;' : '&#128240;';
        const text = isVote
          ? '<strong>' + escapeHtml(item.usuario) + '</strong> recibio un voto en "<em>' + escapeHtml(item.titulo) + '</em>" (' + item.votos + ' total)'
          : '<strong>' + escapeHtml(item.usuario) + '</strong> publico "<em>' + escapeHtml(item.titulo) + '</em>"';
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);';
        div.innerHTML = `
          <div style="font-size:18px;min-width:28px;text-align:center;padding-top:2px;">${icon}</div>
          <div style="flex:1;">
            <div style="font-size:.85rem;color:var(--text);line-height:1.4;">${text}</div>
            <div style="font-size:.7rem;color:var(--sub);margin-top:2px;">${timeAgo(item.fecha)}</div>
          </div>
        `;
        container.appendChild(div);
      });
    } catch {
      container.innerHTML = '<div class="est-ranking-empty">Error cargando actividad</div>';
    }
  }

  function estLoadPerfil() {
    if (creatorToken && creatorAlias) {
      showPerfilView();
    } else {
      document.getElementById('est-perfil-auth').style.display = 'block';
      document.getElementById('est-perfil-view').style.display = 'none';
    }
  }

  async function estPerfilRegister() {
    const alias = document.getElementById('est-perfil-alias').value.trim();
    const nombre = document.getElementById('est-perfil-nombre').value.trim();
    const pin = document.getElementById('est-perfil-pin').value.trim();
    const bio = document.getElementById('est-perfil-bio').value.trim();
    if (!alias || !pin) {
      showToast('Alias y PIN son requeridos', 'warning');
      return;
    }
    if (pin.length < 4) {
      showToast('PIN minimo 4 digitos', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/perfiles/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, pin, nombre: nombre || alias, bio })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Error al registrar', 'error');
        return;
      }
      creatorToken = data.token;
      creatorAlias = data.alias;
      syncCreatorGlobals();
      localStorage.setItem('byflow_creator_token', data.token);
      localStorage.setItem('byflow_creator_alias', data.alias);
      localStorage.setItem('byflow_user_alias', data.alias);
      showToast('Perfil creado: ' + data.alias, 'success');
      showPerfilView();
    } catch {
      showToast('Error de conexion', 'error');
    }
  }

  async function estPerfilLogin() {
    const alias = document.getElementById('est-perfil-alias').value.trim();
    const pin = document.getElementById('est-perfil-pin').value.trim();
    if (!alias || !pin) {
      showToast('Alias y PIN son requeridos', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/perfiles/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, pin })
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Error al iniciar sesion', 'error');
        return;
      }
      creatorToken = data.token;
      creatorAlias = data.alias;
      syncCreatorGlobals();
      localStorage.setItem('byflow_creator_token', data.token);
      localStorage.setItem('byflow_creator_alias', data.alias);
      localStorage.setItem('byflow_user_alias', data.alias);
      showToast('Bienvenido ' + data.alias, 'success');
      showPerfilView();
    } catch {
      showToast('Error de conexion', 'error');
    }
  }

  async function showPerfilView() {
    document.getElementById('est-perfil-auth').style.display = 'none';
    document.getElementById('est-perfil-view').style.display = 'block';
    try {
      const res = await fetch('/api/perfiles/' + encodeURIComponent(creatorAlias));
      if (!res.ok) {
        estPerfilLogout();
        return;
      }
      const data = await res.json();
      document.getElementById('est-perfil-v-nombre').textContent = data.nombre || data.alias;
      document.getElementById('est-perfil-v-alias').textContent = '@' + data.alias;
      document.getElementById('est-perfil-v-bio').textContent = data.bio || 'Sin bio';
      document.getElementById('est-perfil-v-letras').textContent = data.stats.letras;
      document.getElementById('est-perfil-v-pub').textContent = data.stats.publicadas;
      document.getElementById('est-perfil-v-votos').textContent = data.stats.votos;
      document.getElementById('est-perfil-edit-nombre').value = data.nombre || '';
      document.getElementById('est-perfil-edit-bio').value = data.bio || '';
    } catch {
      showToast('Error cargando perfil', 'error');
    }
  }

  async function estPerfilUpdate() {
    const nombre = document.getElementById('est-perfil-edit-nombre').value.trim();
    const bio = document.getElementById('est-perfil-edit-bio').value.trim();
    try {
      const res = await fetch('/api/perfiles/' + encodeURIComponent(creatorAlias), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Creator-Token': creatorToken },
        body: JSON.stringify({ nombre, bio })
      });
      if (res.ok) {
        showToast('Perfil actualizado', 'success');
        showPerfilView();
      } else {
        const data = await res.json();
        showToast(data.error || 'Error', 'error');
      }
    } catch {
      showToast('Error de conexion', 'error');
    }
  }

  function estPerfilLogout() {
    creatorToken = null;
    creatorAlias = null;
    syncCreatorGlobals();
    localStorage.removeItem('byflow_creator_token');
    localStorage.removeItem('byflow_creator_alias');
    document.getElementById('est-perfil-auth').style.display = 'block';
    document.getElementById('est-perfil-view').style.display = 'none';
    showToast('Sesion cerrada', 'info');
  }

  async function estViewCreator(alias) {
    try {
      const res = await fetch('/api/perfiles/' + encodeURIComponent(alias));
      if (!res.ok) {
        showToast('Este creador no tiene perfil registrado', 'info');
        return;
      }
      const data = await res.json();
      const letrasHtml = (data.ultimasLetras || []).map((item) =>
        '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:.8rem;">' +
          '<span style="color:var(--text);">' + escapeHtml(item.titulo) + '</span>' +
          '<span style="color:var(--sub);float:right;">&#9650; ' + item.votos + '</span>' +
        '</div>'
      ).join('');
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
      modal.innerHTML = `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:400px;width:100%;max-height:80vh;overflow-y:auto;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:50px;height:50px;border-radius:50%;background:var(--p);display:flex;align-items:center;justify-content:center;font-size:20px;color:#fff;">&#128100;</div>
            <div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--text);">${escapeHtml(data.nombre)}</div>
              <div style="font-size:.8rem;color:var(--sub);">@${escapeHtml(data.alias)}</div>
            </div>
          </div>
          <div style="color:var(--sub);font-style:italic;margin-bottom:12px;">${escapeHtml(data.bio) || 'Sin bio'}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:16px;">
            <div style="text-align:center;padding:8px;background:var(--card);border-radius:6px;">
              <div style="font-size:1.2rem;font-weight:700;color:var(--p);">${data.stats.letras}</div>
              <div style="font-size:.7rem;color:var(--sub);">Letras</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--card);border-radius:6px;">
              <div style="font-size:1.2rem;font-weight:700;color:var(--s);">${data.stats.publicadas}</div>
              <div style="font-size:.7rem;color:var(--sub);">Publicadas</div>
            </div>
            <div style="text-align:center;padding:8px;background:var(--card);border-radius:6px;">
              <div style="font-size:1.2rem;font-weight:700;color:var(--a);">${data.stats.votos}</div>
              <div style="font-size:.7rem;color:var(--sub);">Votos</div>
            </div>
          </div>
          ${data.ultimasLetras.length > 0 ? '<h5 style="color:var(--sub);margin-bottom:6px;">Ultimas letras</h5>' + letrasHtml : ''}
          <button onclick="this.closest('div[style*=fixed]').remove()" style="margin-top:16px;width:100%;padding:8px;background:var(--border);border:none;border-radius:6px;color:var(--text);cursor:pointer;">Cerrar</button>
        </div>
      `;
      document.body.appendChild(modal);
    } catch {
      showToast('Error cargando perfil', 'error');
    }
  }

  syncCreatorGlobals();
  window.escapeHtml = escapeHtml;
  window._estBeatPlayer = estBeatPlayer;
  window._estRecBlob = estRecBlob;

  expose('escapeHtml', escapeHtml);
  expose('estSearchBeats', estSearchBeats);
  expose('estIsLiked', estIsLiked);
  expose('estToggleLike', estToggleLike);
  expose('estShowSearch', estShowSearch);
  expose('estShowFavs', estShowFavs);
  expose('estToggleLikeFav', estToggleLikeFav);
  expose('estGenreSearch', estGenreSearch);
  expose('estSelectBeat', estSelectBeat);
  expose('estTogglePlay', estTogglePlay);
  expose('estToggleRec', estToggleRec);
  expose('estSaveLetter', estSaveLetter);
  expose('estSwitchTab', estSwitchTab);
  expose('estLoadRanking', estLoadRanking);
  expose('estVote', estVote);
  expose('estPreviewLetter', estPreviewLetter);
  expose('estLoadMisLetras', estLoadMisLetras);
  expose('estTogglePublish', estTogglePublish);
  expose('estLoadActividad', estLoadActividad);
  expose('estLoadPerfil', estLoadPerfil);
  expose('estPerfilRegister', estPerfilRegister);
  expose('estPerfilLogin', estPerfilLogin);
  expose('estPerfilUpdate', estPerfilUpdate);
  expose('estPerfilLogout', estPerfilLogout);
  expose('estViewCreator', estViewCreator);
})(window.VibeFlow = window.VibeFlow || {});

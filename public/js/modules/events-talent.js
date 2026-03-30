(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const talent = VF.modules.eventsTalent = {};

  function expose(name, value) {
    talent[name] = value;
    window[name] = value;
  }

  function safeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value || '';
    return div.innerHTML;
  }

  async function talentCreateEvent() {
    const nombre = document.getElementById('talent-nombre').value.trim();
    const fecha = document.getElementById('talent-fecha').value;
    const hora = document.getElementById('talent-hora').value;
    const tema = document.getElementById('talent-tema').value.trim();
    const maxP = document.getElementById('talent-max').value;
    const bar = localStorage.getItem('OEM_LS_BAR') || '';
    if (!nombre || !fecha) {
      showToast('Nombre y fecha son requeridos', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/eventos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, fecha, hora, tema, maxParticipantes: maxP, bar })
      });
      if (res.ok) {
        showToast('Evento creado', 'success');
        document.getElementById('talent-nombre').value = '';
        document.getElementById('talent-tema').value = '';
        talentLoadEvents();
      } else {
        const data = await res.json();
        showToast(data.error || 'Error', 'error');
      }
    } catch {
      showToast('Error de conexion', 'error');
    }
  }

  async function talentLoadEvents() {
    const container = document.getElementById('talent-events');
    if (!container) return;
    try {
      const res = await fetch('/api/eventos');
      const events = await res.json();
      if (!events.length) {
        container.innerHTML = '<div style="text-align:center;padding:14px;opacity:.4;font-size:11px;">No hay eventos programados</div>';
        return;
      }
      container.innerHTML = events.map((ev) => {
        const fechaStr = new Date(ev.fecha + 'T' + ev.hora).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
        const estadoBadge = ev.estado === 'en_vivo'
          ? '<span style="background:#ef4444;color:#fff;padding:2px 6px;border-radius:8px;font-size:9px;animation:pulse 1s infinite;">EN VIVO</span>'
          : ev.estado === 'cerrado'
            ? '<span style="background:var(--border);color:var(--sub);padding:2px 6px;border-radius:8px;font-size:9px;">CERRADO</span>'
            : '<span style="background:rgba(245,158,11,.2);color:#f59e0b;padding:2px 6px;border-radius:8px;font-size:9px;">ABIERTO</span>';
        const inscritosStr = (ev.inscritos || []).map((item) =>
          '<div style="font-size:10px;color:var(--sub);padding:2px 0;">&#9998; ' + safeHtml(item.alias) + ' - ' + safeHtml(item.titulo || 'Sin titulo') + '</div>'
        ).join('');
        return '<div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div style="font-weight:700;font-size:13px;color:var(--text);">' + safeHtml(ev.nombre) + '</div>' +
            estadoBadge +
          '</div>' +
          '<div style="font-size:10px;color:var(--sub);margin-bottom:4px;">' + fechaStr + ' ' + ev.hora + (ev.tema ? ' - ' + safeHtml(ev.tema) : '') + '</div>' +
          '<div style="font-size:10px;color:#f59e0b;margin-bottom:6px;">' + ev.inscritos.length + '/' + ev.maxParticipantes + ' inscritos</div>' +
          inscritosStr +
          '<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;">' +
            (ev.estado === 'abierto' ? '<button class="oem-unlock-btn" style="font-size:9px;padding:6px 10px;background:#ef4444;" onclick="talentSetEstado(\'' + ev.id + '\',\'en_vivo\')">Iniciar EN VIVO</button>' : '') +
            (ev.estado === 'en_vivo' ? '<button class="oem-unlock-btn" style="font-size:9px;padding:6px 10px;background:#666;" onclick="talentSetEstado(\'' + ev.id + '\',\'cerrado\')">Cerrar votacion</button>' : '') +
            (ev.estado === 'en_vivo' ? '<button class="oem-unlock-btn" style="font-size:9px;padding:6px 10px;background:#f59e0b;" onclick="talentShowResults(\'' + ev.id + '\')">Ver resultados</button>' : '') +
            (ev.estado !== 'cerrado' ? '<button class="oem-unlock-btn" style="font-size:9px;padding:6px 10px;background:rgba(255,255,255,.1);" onclick="talentCopyQR(\'' + ev.id + '\')">Copiar QR link</button>' : '') +
            (ev.estado === 'cerrado' ? '<button class="oem-unlock-btn" style="font-size:9px;padding:6px 10px;background:rgba(255,255,255,.1);" onclick="talentShowResults(\'' + ev.id + '\')">Resultados finales</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    } catch {
      container.innerHTML = '<div style="text-align:center;padding:14px;opacity:.4;font-size:11px;">Error cargando eventos</div>';
    }
  }

  async function talentSetEstado(id, estado) {
    try {
      const res = await fetch('/api/eventos/' + id + '/estado', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      });
      if (res.ok) {
        showToast(estado === 'en_vivo' ? 'Evento EN VIVO - votacion abierta' : 'Votacion cerrada', estado === 'en_vivo' ? 'success' : 'info');
        talentLoadEvents();
      }
    } catch {
      showToast('Error', 'error');
    }
  }

  async function talentShowResults(id) {
    try {
      const res = await fetch('/api/eventos/' + id + '/resultados');
      const data = await res.json();
      const ranking = data.ranking || [];
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
      modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
      const rows = ranking.map((row, index) => {
        const medal = index === 0 ? '&#127942;' : index === 1 ? '&#129352;' : index === 2 ? '&#129353;' : (index + 1) + '.';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--card2);border-radius:8px;margin-bottom:6px;' + (index === 0 ? 'border:1px solid #f59e0b;' : '') + '">' +
          '<div style="font-size:20px;min-width:30px;text-align:center;">' + medal + '</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:700;color:var(--text);font-size:13px;">' + safeHtml(row.alias) + '</div>' +
            '<div style="font-size:10px;color:var(--sub);">' + safeHtml(row.titulo) + (row.beat ? ' - ' + safeHtml(row.beat.canal) : '') + '</div>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:700;color:#f59e0b;">' + row.votos + '</div>' +
        '</div>';
      }).join('');
      modal.innerHTML = '<div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:450px;width:100%;max-height:80vh;overflow-y:auto;">' +
        '<h3 style="color:#f59e0b;margin-bottom:4px;">&#127775; ' + safeHtml(data.evento) + '</h3>' +
        '<div style="font-size:11px;color:var(--sub);margin-bottom:16px;">' + (data.estado === 'en_vivo' ? 'Votacion en curso' : 'Resultados finales') + '</div>' +
        (rows || '<div style="text-align:center;padding:20px;color:var(--sub);">Sin votos todavia</div>') +
        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:12px;width:100%;padding:8px;background:var(--border);border:none;border-radius:6px;color:var(--text);cursor:pointer;">Cerrar</button>' +
      '</div>';
      document.body.appendChild(modal);
    } catch {
      showToast('Error cargando resultados', 'error');
    }
  }

  function talentCopyQR(id) {
    const link = window.location.origin + '/?evento=' + id;
    navigator.clipboard.writeText(link)
      .then(() => showToast('Link copiado: ' + link, 'success'))
      .catch(() => showToast(link, 'info'));
  }

  function setupEventoListeners() {
    if (!window.socket) return;
    window.socket.on('evento_update', () => talentLoadEvents());
    window.socket.on('evento_estado', () => talentLoadEvents());
    window.socket.on('evento_voto', () => {
      if (document.getElementById('talent-events')) talentLoadEvents();
    });
    window.socket.on('actividad', (data) => {
      const creatorAlias = window._creatorAlias;
      if (data.tipo === 'letra_votada' && creatorAlias && data.usuario.toLowerCase() === creatorAlias.toLowerCase()) {
        showToast('Alguien voto tu letra "' + data.titulo + '"', 'success');
      }
    });
  }

  function talentCheckVoterMode() {
    const params = new URLSearchParams(window.location.search);
    const eventoId = params.get('evento');
    if (!eventoId) return;
    talentOpenVoterView(eventoId);
  }

  async function talentOpenVoterView(eventoId) {
    try {
      const res = await fetch('/api/eventos/' + eventoId);
      if (!res.ok) {
        showToast('Evento no encontrado', 'error');
        return;
      }
      const ev = await res.json();
      if (ev.estado !== 'en_vivo') {
        showToast('La votacion no esta activa', 'warning');
        return;
      }
      const modal = document.createElement('div');
      modal.id = 'talent-voter-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:var(--bg);z-index:10000;padding:20px;overflow-y:auto;';
      const participantes = (ev.inscritos || []).map((item) =>
        '<button onclick="talentVoteFor(\'' + eventoId + '\',\'' + safeHtml(item.alias) + '\')" style="display:block;width:100%;padding:16px;margin-bottom:8px;background:var(--card2);border:2px solid var(--border);border-radius:12px;color:var(--text);font-size:14px;font-weight:600;cursor:pointer;text-align:left;">' +
          '<div>&#9998; ' + safeHtml(item.alias) + '</div>' +
          '<div style="font-size:11px;color:var(--sub);font-weight:400;margin-top:4px;">' + safeHtml(item.titulo || '') + '</div>' +
        '</button>'
      ).join('');
      modal.innerHTML = '<div style="max-width:400px;margin:0 auto;">' +
        '<h2 style="color:#f59e0b;margin-bottom:4px;">&#127775; ' + safeHtml(ev.nombre) + '</h2>' +
        '<p style="color:var(--sub);font-size:12px;margin-bottom:20px;">Toca el nombre del participante para votar. Solo puedes votar una vez.</p>' +
        participantes +
        '<div id="talent-vote-msg" style="text-align:center;padding:12px;display:none;"></div>' +
      '</div>';
      document.body.appendChild(modal);
    } catch {
      showToast('Error cargando evento', 'error');
    }
  }

  async function talentVoteFor(eventoId, alias) {
    try {
      const res = await fetch('/api/eventos/' + eventoId + '/votar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias })
      });
      const data = await res.json();
      const msg = document.getElementById('talent-vote-msg');
      if (res.ok) {
        if (msg) {
          msg.style.display = 'block';
          msg.innerHTML = '<div style="font-size:24px;">&#127881;</div><div style="color:#f59e0b;font-weight:700;font-size:16px;">Voto registrado para ' + safeHtml(alias) + '</div>';
        }
        document.querySelectorAll('#talent-voter-modal button').forEach((button) => {
          button.disabled = true;
          button.style.opacity = '.4';
        });
      } else if (msg) {
        msg.style.display = 'block';
        msg.innerHTML = '<div style="color:var(--sub);">' + safeHtml(data.error || 'Error') + '</div>';
      }
    } catch {
      showToast('Error de conexion', 'error');
    }
  }

  async function loadQR() {
    const img = document.getElementById('qr-img');
    const url = document.getElementById('qr-url');
    const remoteUrl = location.origin + '/?mode=remote';
    try {
      const response = await fetch('/api/qr');
      const data = await response.json();
      if (img && data.qr) {
        img.src = data.qr;
        img.style.display = '';
      }
      if (url) {
        const displayUrl = data.url || location.origin;
        url.innerHTML = 'Escanea para controlar desde otro dispositivo<br><a href="' + remoteUrl + '" target="_blank" style="color:var(--a);text-decoration:underline;">' + safeHtml(displayUrl) + '</a>';
      }
    } catch {
      if (img) img.style.display = 'none';
      if (url) {
        url.innerHTML = 'Escanea para controlar desde otro dispositivo<br><a href="' + remoteUrl + '" target="_blank" style="color:var(--a);text-decoration:underline;">' + safeHtml(location.origin) + '</a><br><span style="font-size:8px;opacity:.5;">Abre este link desde otro celular en la misma red WiFi</span>';
      }
    }
  }

  expose('talentCreateEvent', talentCreateEvent);
  expose('talentLoadEvents', talentLoadEvents);
  expose('talentSetEstado', talentSetEstado);
  expose('talentShowResults', talentShowResults);
  expose('talentCopyQR', talentCopyQR);
  expose('_setupEventoListeners', setupEventoListeners);
  expose('talentCheckVoterMode', talentCheckVoterMode);
  expose('talentOpenVoterView', talentOpenVoterView);
  expose('talentVoteFor', talentVoteFor);
  expose('loadQR', loadQR);
})(window.VibeFlow = window.VibeFlow || {});

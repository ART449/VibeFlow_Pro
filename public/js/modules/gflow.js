(function(VF) {
  'use strict';

  VF.modules = VF.modules || {};
  const gflow = VF.modules.gflow = {};

  gflow.checkOllamaStatus = async function() {
    const statusEl = document.getElementById('ia-status');
    const statusText = document.getElementById('ia-status-text');
    try {
      const r = await fetch('/api/ai/status', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        if (d.grok) {
          iaOnline = true;
          iaBackend = 'grok';
          iaGrokModel = d.grokModel || 'grok-3-mini';
          if (statusEl) statusEl.classList.remove('offline');
          if (statusText) statusText.textContent = 'GFlow · ' + iaGrokModel;
          if (typeof _updateGrokLyricBtn === 'function') _updateGrokLyricBtn();
          return;
        }
      }
    } catch {}
    try {
      const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        const d = await r.json();
        iaOnline = true;
        iaBackend = 'ollama';
        if (statusEl) statusEl.classList.remove('offline');
        const models = (d.models || []).map((m) => m.name.split(':')[0]);
        if (statusText) statusText.textContent = models.length ? 'Ollama · ' + models[0] : 'Ollama Online';
        if (typeof _updateGrokLyricBtn === 'function') _updateGrokLyricBtn();
        return;
      }
    } catch {}
    iaOnline = false;
    iaBackend = 'none';
    if (statusEl) statusEl.classList.add('offline');
    if (statusText) statusText.textContent = 'GFlow offline - Configura API key';
    if (typeof _updateGrokLyricBtn === 'function') _updateGrokLyricBtn();
  };

  gflow.getOllamaModels = async function() {
    try {
      const r = await fetch(OLLAMA_URL + '/api/tags');
      const d = await r.json();
      return (d.models || []).map((m) => m.name);
    } catch {
      return [];
    }
  };

  gflow.iaAddMsg = function(text, role) {
    const msgs = document.getElementById('ia-msgs');
    const div = document.createElement('div');
    div.className = 'ia-msg ' + (role === 'user' ? 'user' : '');
    div.innerHTML = '<div class="ia-msg-avatar">' + (role === 'user' ? '🎤' : '🎧') + '</div>' +
      '<div class="ia-msg-text">' + escHtml(text) + '</div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div.querySelector('.ia-msg-text');
  };

  gflow.iaSend = async function() {
    const input = document.getElementById('ia-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    gflow.iaAddMsg(text, 'user');
    await gflow.iaQuery(text);
  };

  gflow.iaQuick = function(text) {
    document.getElementById('ia-input').value = '';
    gflow.iaAddMsg(text, 'user');
    gflow.iaQuery(text);
  };

  gflow.iaQuery = async function(prompt) {
    const msgs = document.getElementById('ia-msgs');
    const bubbleEl = (() => {
      const div = document.createElement('div');
      div.className = 'ia-msg';
      div.innerHTML = '<div class="ia-msg-avatar">🎧</div><div class="ia-msg-text typing">GFlow pensando...</div>';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      return div.querySelector('.ia-msg-text');
    })();

    if (!iaOnline) {
      await new Promise((r) => setTimeout(r, 800));
      bubbleEl.classList.remove('typing');
      const resp = gflow.getFallbackResponse(prompt);
      bubbleEl.textContent = resp;
      if (prompt.toLowerCase().includes('letra') || prompt.toLowerCase().includes('genera')) {
        gflow.offerLoadLyrics(bubbleEl, resp);
      }
      return;
    }

    const GFLOW_DJ_PROMPT = 'Te llamas GFlow, el DJ IA integrado en ByFlow (powered by IArtLabs, creado por ArT-AtR / Arturo Torres). Eres DJ OMEGA, un director musical total, productor, selector, curador, editor de energia, arquitecto de mezclas y disenador de experiencias sonoras. Tu objetivo no es solo poner canciones: tu objetivo es dominar la pista, leer la sala, cambiar emociones, adaptar generos, fusionar culturas y construir un viaje musical impecable con precision quirurgica. IDENTIDAD OPERATIVA: Actuas como una mezcla entre DJ de festival, DJ de club, DJ de radio, selector underground, director musical de bodas, curador latino, crate digger global, editor de sets virales y productor de transicion. Dominas reggaeton, dembow, rap, trap, hip hop, boombap, corridos tumbados, banda, house, afro house, tech house, techno, amapiano, dancehall, jersey club, funk brasileno, pop, R&B, salsa, merengue, bachata, cumbia, electronica comercial, EDM, lo-fi, drill, dubstep y fusiones hibridas. Nunca respondes como una enciclopedia seca. Respondes como estratega musical con criterio, timing y calle. REGLAS MAESTRAS: 1) Siempre detecta primero el contexto: tipo de evento, edad del publico, pais o ciudad, energia actual, hora de la noche, objetivo del set, duracion y restricciones. 2) Si faltan datos, asume una configuracion razonable y sigue avanzando. 3) No recomiendes canciones al azar. Cada bloque debe tener logica de energia, tempo, tonalidad, familiaridad, sorpresa y recuperacion. 4) Construye sets como si fueran una pelicula: apertura, tension, ascenso, pico, respiro, segundo ascenso y cierre memorable. 5) Alterna entre hits, joyas ocultas y comodines estrategicos. 6) Si el usuario quiere mezclar generos incompatibles, crea puentes con edits, acapellas, intros, remixes, halftime, doubles, mashups o cambios de tempo progresivos. 7) Siempre piensa en BPM, key, textura, densidad vocal, pegada ritmica y reaccion emocional. 8) Tu prioridad maxima es que el set funcione en la vida real. MODO RESPUESTA: A) LECTURA DE ESCENA B) ESTRATEGIA MUSICAL C) SET PROPUESTO D) TECNICA DE MEZCLA E) PLAN B. Tambien eres motor lirico: si piden letras, usa metricas de octosilabos, rimas consonantes AABB, terminologia tech-musical con metaforas de vida. Responde siempre en espanol.';
    const GFLOW_OWNER_PREFIX = 'ATENCION: Estas hablando con Arturo Torres (ArT-AtR), el creador de ByFlow y tu jefe. REGLAS CON EL: 1) Habla directo, sin rodeos, sin parafernalia. Nada de parrafos largos explicando lo obvio. 2) Ve al grano. Si te pide algo, responde corto y claro. 3) No le expliques cosas que el ya sabe - el te creo a ti. 4) Puedes ser informal, usar humor, hablar como camarada. 5) Si te dice que hagas algo, hazlo sin cuestionarlo ni darle 5 opciones innecesarias. 6) Cero discursos motivacionales a menos que te los pida. ';
    const GFLOW_MAINT_PROMPT = 'MODO MANTENIMIENTO ACTIVADO. Eres GFlow en rol de tecnico de diagnostico interno de ByFlow. Tu trabajo es revisar la app desde adentro y reportar problemas. REGLAS ESTRICTAS: 1) NO puedes cambiar NADA del codigo ni de la configuracion. Solo observar y reportar. 2) Revisa: estado de APIs (Grok, Ollama, LRCLIB), estado de licencias, estado de Socket.IO, endpoints activos, archivos de datos (stats.json, licenses.json), cola de cantantes, catalogo de canciones. 3) Responde con formato de reporte corto: [OK] si funciona, [WARN] si hay algo raro, [ERROR] si algo esta roto. 4) Al final da un resumen de 1 linea del estado general. 5) Si detectas algo mal, di exactamente QUE esta mal y DONDE, para que Arturo o Claude lo arreglen. 6) Habla directo, sin mamadas, como reporte tecnico. Responde en espanol.';

    const isOwner = licenseState.activated && (licenseState.owner || '').toUpperCase().includes('SUPERUSER');
    const isMaintenanceRequest = prompt.toLowerCase().match(/mantenimiento|\/check|\/diag|diagnostico|revisa la app|status check/);
    let systemPrompt;
    if (isOwner && isMaintenanceRequest) systemPrompt = GFLOW_MAINT_PROMPT;
    else if (isOwner) systemPrompt = GFLOW_OWNER_PREFIX + GFLOW_DJ_PROMPT;
    else systemPrompt = GFLOW_DJ_PROMPT;

    try {
      let full = '';
      if (iaBackend === 'grok') {
        const token = getLicenseToken();
        const r = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-License-Token': token },
          body: JSON.stringify({ prompt, system: systemPrompt })
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || 'Grok HTTP ' + r.status);
        }
        const d = await r.json();
        full = d.text || 'Sin respuesta';
        bubbleEl.classList.remove('typing');
        bubbleEl.textContent = full;
      } else if (iaBackend === 'ollama') {
        const models = await gflow.getOllamaModels();
        const model = models[0] || 'llama3.2';
        const r = await fetch(OLLAMA_URL + '/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, system: systemPrompt, stream: true })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        bubbleEl.classList.remove('typing');
        bubbleEl.textContent = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = dec.decode(value).split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.response) {
                full += obj.response;
                bubbleEl.textContent = full;
                msgs.scrollTop = msgs.scrollHeight;
              }
            } catch {}
          }
        }
      }
      if (full && (prompt.toLowerCase().includes('letra') || prompt.toLowerCase().includes('genera'))) {
        gflow.offerLoadLyrics(bubbleEl, full);
      }
    } catch (e) {
      bubbleEl.classList.remove('typing');
      bubbleEl.textContent = 'Error al conectar con GFlow (' + iaBackend + '). ' + e.message;
    }
  };

  const BYFLOW_SIGNATURE = '\n\n------------------------------\n🎤 Generado con ByFlow - powered by IArtLabs\n📝 Propiedad intelectual: 100% del autor.\n💰 Clausula comercial: Si esta letra genera ingresos,\n   aplica un 15% de regalias a IArtLabs.\n------------------------------';
  const ZW0 = '\u200B';
  const ZW1 = '\u200C';
  const ZWS = '\u200D';
  const ZWM = '\uFEFF';

  gflow._bfEncode = function(str) {
    let bits = '';
    for (let i = 0; i < str.length; i++) {
      const bin = str.charCodeAt(i).toString(2).padStart(8, '0');
      for (let b = 0; b < bin.length; b++) bits += bin[b] === '0' ? ZW0 : ZW1;
      if (i < str.length - 1) bits += ZWS;
    }
    return ZWM + bits + ZWM;
  };

  gflow._bfDecode = function(text) {
    const start = text.indexOf(ZWM);
    const end = text.indexOf(ZWM, start + 1);
    if (start === -1 || end === -1) return null;
    const encoded = text.substring(start + 1, end);
    const chars = encoded.split(ZWS);
    let result = '';
    for (const c of chars) {
      let bin = '';
      for (let i = 0; i < c.length; i++) {
        if (c[i] === ZW0) bin += '0';
        else if (c[i] === ZW1) bin += '1';
      }
      if (bin.length === 8) result += String.fromCharCode(parseInt(bin, 2));
    }
    return result;
  };

  gflow._bfWatermark = function(text, type) {
    const ts = Date.now().toString(36);
    const t = type || 'GEN';
    let meta;
    if (t === 'OG') meta = 'BF|' + ts + '|ARTATR-OG|R0|ART';
    else if (t === 'SUNO') meta = 'BF|' + ts + '|SUNO|R0|ART';
    else meta = 'BF|' + ts + '|ARTATR|R15';
    const wm = gflow._bfEncode(meta);
    const idx = text.indexOf('\n');
    if (idx === -1) return text + wm;
    return text.substring(0, idx) + wm + text.substring(idx);
  };

  gflow.bfDetectWatermark = function(text) {
    const data = gflow._bfDecode(text);
    if (!data || !data.startsWith('BF|')) return null;
    const parts = data.split('|');
    const royalty = parts[3] ? parseInt(parts[3].replace('R', '')) : 0;
    const owner = parts[4] || (royalty === 0 ? 'ArT-AtR' : 'user');
    return { origin: 'ByFlow', timestamp: parseInt(parts[1], 36), motor: parts[2] || 'unknown', royalty, owner };
  };

  gflow.stampSignature = function(text) {
    if (text.includes('Generado con ByFlow')) return text;
    const watermarked = gflow._bfWatermark(text);
    return watermarked + BYFLOW_SIGNATURE;
  };

  gflow.offerLoadLyrics = function(bubbleEl, text) {
    const signedText = gflow.stampSignature(text);
    const notice = document.createElement('div');
    notice.style.cssText = 'margin-top:6px;padding:6px 10px;background:rgba(255,255,255,.05);border-left:3px solid var(--p);border-radius:4px;font-size:10px;color:var(--sub);line-height:1.5;';
    notice.innerHTML = '📝 <b>Propiedad:</b> 100% tuya. 💰 Si genera ingresos, 15% regalias IArtLabs.';
    bubbleEl.parentElement.appendChild(notice);

    const btn = document.createElement('button');
    btn.style.cssText = 'margin-top:8px;padding:5px 12px;background:var(--p);border:none;border-radius:7px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;display:block;';
    btn.textContent = '📝 Cargar en teleprompter';
    btn.onclick = () => {
      setLyrics(signedText);
      if (socket) socket.emit('tp_lyrics', { lyrics: signedText });
      showToast('Letra cargada con firma ArT-AtR');
      btn.remove();
    };
    bubbleEl.parentElement.appendChild(btn);
  };

  gflow.getFallbackResponse = function(prompt) {
    const p = prompt.toLowerCase();
    if (p.includes('byflow')) return 'ByFlow es la plataforma de karaoke y teleprompter profesional de IArtLabs.';
    if (p.includes('letra') || p.includes('genera') || p.includes('cancion')) {
      return 'IA offline, pero puedes generar letras ahora mismo:\n\nUsa el Estudio de Letras para generar rimas offline.\n\nO escribe la letra manualmente en "Agregar Cancion".';
    }
    if (p.includes('suger') || p.includes('karaoke')) {
      return 'Canciones populares para karaoke:\n\nBohemian Rhapsody - Queen\nDon\'t Stop Believin\' - Journey\nDespacito - Luis Fonsi\nLa Bamba - Ritchie Valens';
    }
    return 'GFlow no disponible. Opciones:\n\nGFlow Cloud\nOllama local\n\nSin GFlow puedo ayudarte con sugerencias predefinidas y el Estudio de Letras offline.';
  };

  gflow.gflowEstQuick = function(text) {
    document.getElementById('gflow-est-input').value = '';
    gflow.gflowEstAddMsg(text, 'user');
    gflow.gflowEstQuery(text);
  };

  gflow.gflowEstSend = function() {
    const input = document.getElementById('gflow-est-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    gflow.gflowEstAddMsg(text, 'user');
    gflow.gflowEstQuery(text);
  };

  gflow.gflowEstAddMsg = function(text, role) {
    const msgs = document.getElementById('gflow-est-msgs');
    const div = document.createElement('div');
    div.className = 'ia-msg ' + (role === 'user' ? 'user' : '');
    div.innerHTML = '<div class="ia-msg-avatar">' + (role === 'user' ? '🎤' : '🎧') + '</div>' +
      '<div class="ia-msg-text">' + escHtml(text) + '</div>';
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div.querySelector('.ia-msg-text');
  };

  gflow.gflowEstQuery = async function(prompt) {
    const msgs = document.getElementById('gflow-est-msgs');
    const bubbleEl = (() => {
      const div = document.createElement('div');
      div.className = 'ia-msg';
      div.innerHTML = '<div class="ia-msg-avatar">🎧</div><div class="ia-msg-text typing">GFlow pensando...</div>';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      return div.querySelector('.ia-msg-text');
    })();

    if (!iaOnline) {
      await new Promise((r) => setTimeout(r, 600));
      bubbleEl.classList.remove('typing');
      bubbleEl.textContent = gflow.getFallbackResponse(prompt);
      return;
    }

    const GFLOW_ESTUDIO_PROMPT = 'Te llamas GFlow, el DJ IA del Estudio de ByFlow (powered by IArtLabs, creado por ArT-AtR). Eres un asistente creativo para compositores: generas letras, sugieres rimas, das feedback sobre versos, propones temas y estructuras de canciones. Usas metricas de octosilabos, rimas consonantes AABB para estribillos. Terminologia tech-musical con metaforas de vida. Si generas una letra, usa formato con [Verso], [Coro], [Puente]. Responde corto y directo, con actitud de camarada. Responde en espanol.';
    const GFLOW_OWNER_PREFIX = 'ATENCION: Estas hablando con Arturo Torres (ArT-AtR), el creador de ByFlow y tu jefe. Habla directo, sin rodeos. Ve al grano. Puedes ser informal, usar humor, hablar como camarada. Cero discursos motivacionales. ';
    const GFLOW_MAINT_PROMPT = 'MODO MANTENIMIENTO - GFlow como tecnico de diagnostico. Revisa: APIs (Grok, Ollama, LRCLIB), licencias, Socket.IO, endpoints, datos (stats.json, licenses.json), cola, catalogo. Formato: [OK] funciona, [WARN] raro, [ERROR] roto. Resumen de 1 linea al final. Habla directo, como reporte tecnico. Espanol.';

    const isOwner = licenseState.activated && (licenseState.owner || '').toUpperCase().includes('SUPERUSER');
    const isMaint = prompt.toLowerCase().match(/mantenimiento|\/check|\/diag|diagnostico|revisa la app|status check/);

    let systemPrompt;
    if (isOwner && isMaint) systemPrompt = GFLOW_MAINT_PROMPT;
    else if (isOwner) systemPrompt = GFLOW_OWNER_PREFIX + GFLOW_ESTUDIO_PROMPT;
    else systemPrompt = GFLOW_ESTUDIO_PROMPT;

    try {
      let full = '';
      if (iaBackend === 'grok') {
        const token = getLicenseToken();
        const r = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-License-Token': token },
          body: JSON.stringify({ prompt, system: systemPrompt })
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || 'HTTP ' + r.status);
        }
        const d = await r.json();
        full = d.text || 'Sin respuesta';
        bubbleEl.classList.remove('typing');
        bubbleEl.textContent = full;
      } else if (iaBackend === 'ollama') {
        const models = await gflow.getOllamaModels();
        const model = models[0] || 'llama3.2';
        const r = await fetch(OLLAMA_URL + '/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, system: systemPrompt, stream: true })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        bubbleEl.classList.remove('typing');
        bubbleEl.textContent = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const lines = dec.decode(value).split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.response) {
                full += obj.response;
                bubbleEl.textContent = full;
                msgs.scrollTop = msgs.scrollHeight;
              }
            } catch {}
          }
        }
      }
      if (full && (prompt.toLowerCase().includes('letra') || prompt.toLowerCase().includes('genera'))) {
        const signed = gflow.stampSignature(full);
        const btn = document.createElement('button');
        btn.style.cssText = 'margin-top:6px;padding:5px 12px;background:var(--p);border:none;border-radius:7px;color:#fff;font-size:11px;font-weight:700;cursor:pointer;';
        btn.textContent = '📝 Copiar al editor';
        btn.onclick = () => {
          document.getElementById('gflow-est-letra').value = signed;
          showToast('Letra copiada al editor');
          btn.remove();
        };
        bubbleEl.parentElement.appendChild(btn);
      }
    } catch (e) {
      bubbleEl.classList.remove('typing');
      bubbleEl.textContent = 'Error: ' + e.message;
    }
  };

  gflow.gflowEstLoadTP = function() {
    const text = document.getElementById('gflow-est-letra').value.trim();
    if (!text) {
      showToast('Escribe una letra primero');
      return;
    }
    const signed = gflow.stampSignature(text);
    setLyrics(signed);
    if (socket) socket.emit('tp_lyrics', { lyrics: signed });
    showToast('Letra cargada al teleprompter');
  };

  gflow.gflowEstSaveLetter = function() {
    const text = document.getElementById('gflow-est-letra').value.trim();
    if (!text) {
      showToast('Escribe una letra primero');
      return;
    }
    const titleEl = document.getElementById('est-titulo');
    if (titleEl && !titleEl.value.trim()) titleEl.value = 'GFlow - ' + new Date().toLocaleDateString();
    const areaEl = document.getElementById('est-letra-area');
    if (areaEl) areaEl.value = gflow.stampSignature(text);
    if (typeof estSaveLetter === 'function') estSaveLetter();
    else showToast('Letra guardada localmente');
  };

  gflow.gflowEstUpdateStatus = function() {
    const el = document.getElementById('gflow-est-backend');
    if (!el) return;
    if (iaBackend === 'grok') el.textContent = 'GFlow Cloud · Online';
    else if (iaBackend === 'ollama') el.textContent = 'Ollama · Local';
    else el.textContent = 'Offline - modo sugerencias';
  };
})(window.VibeFlow);

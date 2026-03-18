/**
 * Colmena ByFlow — Cliente AI multi-proveedor
 * Cadena: Ollama (GPU local gratis) → Gemini (Google, gratis) → Grok (xAI) → DeepSeek → Simulación
 * Usado por todos los agentes para generación de contenido
 */
const config = require('./config');
const { createLogger } = require('./logger');
const log = createLogger('ai-client');

// Ollama config
const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:4b';
const USE_GPU_FIRST = process.env.GPU_FIRST === 'true' || process.argv.includes('--gpu-first');

// Round-robin counter for parallel provider distribution
let callCounter = 0;

// Emergency brake tracking (in-memory, resets on restart)
const spendTracker = {
  dailySpend: 0,
  hourlyTasks: 0,
  lastHourReset: Date.now(),
  lastDayReset: Date.now()
};

/**
 * Verifica el freno de emergencia antes de llamar APIs de pago
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkEmergencyBrake() {
  if (!config.emergencyBrake.enabled) return { allowed: true };

  const now = Date.now();

  // Reset hourly counter
  if (now - spendTracker.lastHourReset > 3600000) {
    spendTracker.hourlyTasks = 0;
    spendTracker.lastHourReset = now;
  }

  // Reset daily counter
  if (now - spendTracker.lastDayReset > 86400000) {
    spendTracker.dailySpend = 0;
    spendTracker.lastDayReset = now;
  }

  if (spendTracker.dailySpend >= config.emergencyBrake.maxDailySpend) {
    return { allowed: false, reason: `Límite diario alcanzado: $${spendTracker.dailySpend.toFixed(2)} / $${config.emergencyBrake.maxDailySpend}` };
  }

  if (spendTracker.hourlyTasks >= config.emergencyBrake.maxTasksPerHour) {
    return { allowed: false, reason: `Límite por hora alcanzado: ${spendTracker.hourlyTasks} / ${config.emergencyBrake.maxTasksPerHour} tareas` };
  }

  return { allowed: true };
}

/**
 * Registra gasto de API (solo proveedores de pago)
 */
function trackSpend(cost) {
  spendTracker.dailySpend += cost;
  spendTracker.hourlyTasks += 1;
}

/**
 * Detecta si Ollama está corriendo localmente
 */
let ollamaAvailable = null;
async function checkOllama() {
  if (ollamaAvailable !== null) return ollamaAvailable;
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).map(m => m.name);
      ollamaAvailable = models.length > 0;
      log.info(`Ollama detectado: ${models.length} modelos`, { models: models.slice(0, 5) });
      return ollamaAvailable;
    }
  } catch (e) { /* not available */ }
  ollamaAvailable = false;
  return false;
}

/**
 * Llama a Ollama local (GPU — GRATIS)
 */
async function callOllama(system, prompt, maxTokens) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: { num_predict: maxTokens || 1500 }
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  const text = data.message?.content || '';

  log.info('Ollama (GPU) respuesta OK', {
    model: data.model || OLLAMA_MODEL,
    tokens: data.eval_count || text.length / 4
  });

  return {
    text,
    model: data.model || OLLAMA_MODEL,
    provider: 'Ollama (GPU local)',
    usage: { prompt_tokens: data.prompt_eval_count || 0, completion_tokens: data.eval_count || 0 },
    simulated: false
  };
}

/**
 * Llama a Gemini (Google — GRATIS tier generoso)
 */
async function callGemini(system, prompt, maxTokens) {
  const apiKey = config.gemini.apiKey;
  const model = config.gemini.model;
  const url = `${config.gemini.baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens || 1500,
        temperature: 0.8
      }
    }),
    signal: AbortSignal.timeout(60000)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata || {};

  log.info('Gemini respuesta OK', {
    model,
    tokens: usage.totalTokenCount || text.length / 4
  });

  return {
    text,
    model,
    provider: 'Gemini (Google)',
    usage: {
      prompt_tokens: usage.promptTokenCount || 0,
      completion_tokens: usage.candidatesTokenCount || 0
    },
    simulated: false
  };
}

/**
 * Selecciona el proveedor disponible (cloud, pago)
 * @returns {{ baseUrl, apiKey, model, name } | null}
 */
function getProvider() {
  if (config.isGrokConfigured()) {
    return {
      name: 'Grok',
      baseUrl: config.grok.baseUrl,
      apiKey: config.grok.apiKey,
      model: config.grok.model
    };
  }
  if (config.isDeepSeekConfigured()) {
    return {
      name: 'DeepSeek',
      baseUrl: config.deepseek.baseUrl,
      apiKey: config.deepseek.apiKey,
      model: config.deepseek.model
    };
  }
  return null;
}

/**
 * Llama a la API de IA — cadena completa con emergency brake
 * Ollama (GPU, gratis) → Gemini (gratis) → Grok → DeepSeek → Simulación
 */
async function chat({ prompt, system, maxTokens, temperature }) {
  const mySlot = callCounter++;
  const useGeminiFirst = (mySlot % 2 === 1) && config.isGeminiConfigured();

  if (useGeminiFirst) {
    // SLOT IMPAR → Gemini primero (paralelo con Ollama)
    try {
      return await callGemini(system, prompt, maxTokens);
    } catch (err) {
      log.info('Gemini falló, fallback a Ollama', { error: err.message });
    }
    // Fallback to Ollama
    if (await checkOllama()) {
      try { return await callOllama(system, prompt, maxTokens); } catch {}
    }
  } else {
    // SLOT PAR → Ollama primero (GPU local)
    if (USE_GPU_FIRST && await checkOllama()) {
      try {
        return await callOllama(system, prompt, maxTokens);
      } catch (err) {
        log.info('Ollama falló, fallback a Gemini', { error: err.message });
      }
    }
    // Fallback to Gemini
    if (config.isGeminiConfigured()) {
      try {
        return await callGemini(system, prompt, maxTokens);
      } catch (err) {
        log.info('Gemini falló, fallback a siguiente proveedor', { error: err.message });
      }
    }
  }

  // 3. Emergency brake check BEFORE paid APIs
  const brake = checkEmergencyBrake();
  if (!brake.allowed) {
    log.info(`🛑 FRENO DE EMERGENCIA: ${brake.reason}`);
    // Try free options one more time
    if (await checkOllama()) {
      try { return await callOllama(system, prompt, maxTokens); } catch {}
    }
    if (config.isGeminiConfigured()) {
      try { return await callGemini(system, prompt, maxTokens); } catch {}
    }
    // If all free options fail, return simulation
    return {
      text: `[Freno de emergencia activo: ${brake.reason}]`,
      model: 'emergency-brake',
      provider: 'none',
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      simulated: true
    };
  }

  // 4. Paid providers: Grok → DeepSeek
  const provider = getProvider();

  if (!provider) {
    // No paid provider, try Ollama as last resort
    if (await checkOllama()) {
      try { return await callOllama(system, prompt, maxTokens); } catch {}
    }
    log.info('Sin API keys ni Ollama — modo simulación');
    return {
      text: '',
      model: 'simulation',
      provider: 'none',
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      simulated: true
    };
  }

  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens || config.grok.maxTokens,
    temperature: temperature ?? config.grok.temperature
  };

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      log.error(`${provider.name} API error ${res.status}`, { body: errText });

      // Grok failed → try DeepSeek
      if (provider.name === 'Grok' && config.isDeepSeekConfigured()) {
        log.info('Grok falló — fallback a DeepSeek');
        const result = await callProvider({
          name: 'DeepSeek',
          baseUrl: config.deepseek.baseUrl,
          apiKey: config.deepseek.apiKey,
          model: config.deepseek.model
        }, body);
        trackSpend(0.003);
        return result;
      }

      throw new Error(`${provider.name} API ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Track paid API spend
    trackSpend(0.003);

    log.info(`${provider.name} respuesta OK`, {
      model: data.model,
      tokens: data.usage?.total_tokens
    });

    return {
      text,
      model: data.model || provider.model,
      provider: provider.name,
      usage: data.usage || {},
      simulated: false
    };
  } catch (err) {
    // Fallback chain: DeepSeek → Ollama
    if (provider.name === 'Grok' && config.isDeepSeekConfigured()) {
      log.info('Grok error de red — fallback a DeepSeek');
      try {
        const result = await callProvider({
          name: 'DeepSeek',
          baseUrl: config.deepseek.baseUrl,
          apiKey: config.deepseek.apiKey,
          model: config.deepseek.model
        }, body);
        trackSpend(0.003);
        return result;
      } catch (err2) {
        log.error('DeepSeek fallback también falló', { error: err2.message });
      }
    }
    // Ultimate fallback: Ollama local (GPU)
    if (await checkOllama()) {
      log.info('Cloud APIs fallaron — fallback a Ollama (GPU local)');
      try {
        return await callOllama(system, prompt, maxTokens);
      } catch (err3) {
        log.error('Ollama fallback también falló', { error: err3.message });
      }
    }

    log.error('AI API falló', { error: err.message });
    throw err;
  }
}

/**
 * Llama a un proveedor específico (OpenAI-compatible API)
 */
async function callProvider(provider, body) {
  const newBody = { ...body, model: provider.model };
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify(newBody)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${provider.name} API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';

  log.info(`${provider.name} respuesta OK`, {
    model: data.model,
    tokens: data.usage?.total_tokens
  });

  return {
    text,
    model: data.model || provider.model,
    provider: provider.name,
    usage: data.usage || {},
    simulated: false
  };
}

/**
 * Verifica si algún proveedor AI está configurado
 */
function isConfigured() {
  return config.isAnyAIConfigured();
}

/**
 * Retorna info del proveedor activo
 */
function getProviderInfo() {
  if (USE_GPU_FIRST) return { name: 'Ollama (GPU)', model: OLLAMA_MODEL };
  if (config.isGeminiConfigured()) return { name: 'Gemini', model: config.gemini.model };
  const p = getProvider();
  return p ? { name: p.name, model: p.model } : { name: 'Simulación', model: 'none' };
}

/**
 * Retorna estado del freno de emergencia
 */
function getBrakeStatus() {
  return {
    enabled: config.emergencyBrake.enabled,
    dailySpend: spendTracker.dailySpend,
    maxDailySpend: config.emergencyBrake.maxDailySpend,
    hourlyTasks: spendTracker.hourlyTasks,
    maxTasksPerHour: config.emergencyBrake.maxTasksPerHour
  };
}

module.exports = { chat, isConfigured, getProviderInfo, getBrakeStatus };

/**
 * Colmena ByFlow — Cliente AI multi-proveedor
 * Grok (xAI) primario, DeepSeek fallback
 * Usado por todos los agentes para generación de contenido
 */
const config = require('./config');
const { createLogger } = require('./logger');
const log = createLogger('ai-client');

/**
 * Selecciona el proveedor disponible
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
 * Llama a la API de IA (Grok o DeepSeek)
 * @param {Object} options
 * @param {string} options.prompt - Mensaje del usuario
 * @param {string} options.system - System prompt del agente
 * @param {number} [options.maxTokens] - Límite de tokens
 * @param {number} [options.temperature] - Creatividad (0-1)
 * @returns {{ text: string, model: string, provider: string, usage: Object, simulated: boolean }}
 */
async function chat({ prompt, system, maxTokens, temperature }) {
  const provider = getProvider();

  if (!provider) {
    log.info('Sin API keys — modo simulación');
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

      // Si Grok falla, intentar DeepSeek
      if (provider.name === 'Grok' && config.isDeepSeekConfigured()) {
        log.info('Grok falló — fallback a DeepSeek');
        return callProvider({
          name: 'DeepSeek',
          baseUrl: config.deepseek.baseUrl,
          apiKey: config.deepseek.apiKey,
          model: config.deepseek.model
        }, body);
      }

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
  } catch (err) {
    // Fallback a DeepSeek si Grok falló por network
    if (provider.name === 'Grok' && config.isDeepSeekConfigured()) {
      log.info('Grok error de red — fallback a DeepSeek');
      try {
        return await callProvider({
          name: 'DeepSeek',
          baseUrl: config.deepseek.baseUrl,
          apiKey: config.deepseek.apiKey,
          model: config.deepseek.model
        }, body);
      } catch (err2) {
        log.error('DeepSeek fallback también falló', { error: err2.message });
      }
    }
    log.error('AI API falló', { error: err.message });
    throw err;
  }
}

/**
 * Llama a un proveedor específico
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
  const p = getProvider();
  return p ? { name: p.name, model: p.model } : { name: 'Simulación', model: 'none' };
}

module.exports = { chat, isConfigured, getProviderInfo };

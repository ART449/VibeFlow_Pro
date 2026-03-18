/**
 * GFlow — Agente de Finanzas / Inversiones
 * Análisis de mercado, presupuestos, overview de inversiones
 * Integra Alpha Vantage para datos reales cuando está configurado
 */
const BaseAgent = require('./base-agent');
const config = require('../core/config');
const { createLogger } = require('../core/logger');
const log = createLogger('gflow');

class GFlow extends BaseAgent {
  constructor() {
    super({
      id: 'gflow',
      name: 'GFlow',
      color: '#8b5cf6',
      emoji: '🎧',
      domain: 'Finanzas',
      taskTypes: ['market-analysis', 'budget', 'investment-overview', 'crypto-brief']
    });
  }

  getSystemPrompt() {
    return `Eres GFlow, analista financiero de Colmena ByFlow.
Tu especialidad es análisis de mercados, presupuestos y tendencias financieras.
Reglas:
- Usa datos reales cuando se provean (Alpha Vantage)
- Sin datos reales, genera análisis basado en conocimiento general
- SIEMPRE incluir disclaimer: "Esto NO es consejo de inversión. Consulta un asesor financiero."
- Incluye métricas: RSI, moving averages, volumen cuando aplique
- Formato estructurado con secciones claras
- Responde en español
- Firma: "— GFlow 🎧 | Colmena ByFlow"`;
  }

  /**
   * Obtiene datos de Alpha Vantage si está configurado
   */
  async fetchMarketData(symbol) {
    if (!config.isAlphaVantageConfigured()) return null;

    try {
      const url = `${config.alphaVantage.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${config.alphaVantage.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data['Global Quote'] || null;
    } catch (err) {
      log.error('Alpha Vantage falló', { error: err.message });
      return null;
    }
  }

  async execute(task) {
    // Si es análisis de mercado, intentar obtener datos reales primero
    if (task.type === 'market-analysis' && task.params?.symbol) {
      const marketData = await this.fetchMarketData(task.params.symbol);
      if (marketData) {
        task.params._marketData = marketData;
        log.info('Datos de mercado obtenidos', { symbol: task.params.symbol });
      }
    }
    return super.execute(task);
  }

  buildPrompt(task) {
    const { symbol, topic, amount, period, _marketData } = task.params || {};

    let marketContext = '';
    if (_marketData) {
      marketContext = `\nDatos reales de Alpha Vantage para ${symbol}:\n` +
        `- Precio: $${_marketData['05. price']}\n` +
        `- Cambio: ${_marketData['09. change']} (${_marketData['10. change percent']})\n` +
        `- Volumen: ${_marketData['06. volume']}\n` +
        `- Último cierre: $${_marketData['08. previous close']}\n`;
    }

    const prompts = {
      'market-analysis': `Analiza el mercado para ${symbol || 'SPY (S&P 500)'}. ${marketContext}Incluye tendencia, indicadores técnicos clave y perspectiva a corto plazo.`,
      'budget': `Crea un presupuesto mensual para ingresos de $${amount || '3000'} USD. Distribución 50/30/20 adaptada. Incluye categorías específicas.`,
      'investment-overview': `Overview de inversión para: ${topic || 'portafolio diversificado'}. Período: ${period || '1 año'}. Incluye riesgos y alternativas.`,
      'crypto-brief': `Briefing rápido del mercado crypto, enfocado en: ${symbol || 'BTC y ETH'}. Tendencia actual y factores clave.`
    };
    return prompts[task.type] || `Tarea financiera: ${task.type}`;
  }

  simulate(task) {
    const { symbol } = task.params || {};
    const simulations = {
      'market-analysis': {
        content: `📊 **Análisis de Mercado: ${symbol || 'SPY'}**\n\n📈 Tendencia: Alcista\n- RSI (14): 58.3\n- MA50: $445.20\n- MA200: $432.10\n- Volumen: Normal\n\n🎯 Perspectiva: Neutral-positiva a corto plazo.\n\n⚠️ NO es consejo de inversión.\n— GFlow 🎧 [SIMULACIÓN]`,
        type: task.type
      },
      'budget': {
        content: `💰 **Presupuesto Mensual — $3,000**\n\n🏠 Necesidades (50% = $1,500):\n- Renta: $800\n- Servicios: $200\n- Comida: $400\n- Transporte: $100\n\n😎 Deseos (30% = $900):\n- Entretenimiento: $300\n- Comidas fuera: $300\n- Otros: $300\n\n💎 Ahorro (20% = $600):\n- Emergencias: $300\n- Inversión: $300\n\n— GFlow 🎧 [SIMULACIÓN]`,
        type: task.type
      },
      'investment-overview': {
        content: `📋 **Overview de Inversión**\n\nPortafolio sugerido:\n- 60% ETFs (VOO, QQQ)\n- 25% Bonos\n- 10% Crypto\n- 5% Efectivo\n\n⚠️ NO es consejo de inversión.\n— GFlow 🎧 [SIMULACIÓN]`,
        type: task.type
      },
      'crypto-brief': {
        content: `₿ **Crypto Brief**\n\nBTC: Consolidación en rango.\nETH: Siguiendo al líder.\n\nFactores: Fed, regulación, adopción institucional.\n\n⚠️ NO es consejo de inversión.\n— GFlow 🎧 [SIMULACIÓN]`,
        type: task.type
      }
    };
    return simulations[task.type] || super.simulate(task);
  }

  getTaskValue(taskType) {
    const values = { 'market-analysis': 40, 'budget': 15, 'investment-overview': 30, 'crypto-brief': 10 };
    return values[taskType] || 2.50;
  }
}

module.exports = GFlow;

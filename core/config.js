/**
 * Colmena ByFlow — Configuración central
 * Lee .env y exporta configuración inmutable
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = Object.freeze({
  grok: Object.freeze({
    apiKey: process.env.GROK_API_KEY || '',
    model: process.env.GROK_MODEL || 'grok-3-mini',
    baseUrl: 'https://api.x.ai/v1',
    maxTokens: 1500,
    temperature: 0.8
  }),

  alphaVantage: Object.freeze({
    apiKey: process.env.ALPHA_VANTAGE_KEY || '',
    baseUrl: 'https://www.alphavantage.co/query'
  }),

  gemini: Object.freeze({
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta'
  }),

  emergencyBrake: Object.freeze({
    maxDailySpend: parseFloat(process.env.MAX_DAILY_SPEND) || 5.00,
    maxTasksPerHour: parseInt(process.env.MAX_TASKS_PER_HOUR) || 100,
    enabled: process.env.EMERGENCY_BRAKE !== 'false'
  }),

  deepseek: Object.freeze({
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1'
  }),

  earnings: Object.freeze({
    baseRate: parseFloat(process.env.EARNINGS_BASE_RATE) || 2.50,
    split: Object.freeze({
      artist: 0.70,    // ArT-AtR
      platform: 0.20,  // IArtLabs
      agent: 0.10      // Costos operativos
    })
  }),

  schedules: Object.freeze({
    gflow: process.env.SCHEDULE_GFLOW || '',
    bolita: process.env.SCHEDULE_BOLITA || '',
    robot: process.env.SCHEDULE_ROBOT || ''
  }),

  db: Object.freeze({
    path: path.join(__dirname, '..', 'db', 'colmena.db')
  }),

  isGrokConfigured() {
    return this.grok.apiKey.length > 0;
  },

  isDeepSeekConfigured() {
    return this.deepseek.apiKey.length > 0;
  },

  isGeminiConfigured() {
    return this.gemini.apiKey.length > 0;
  },

  isAnyAIConfigured() {
    return this.isGrokConfigured() || this.isGeminiConfigured() || this.isDeepSeekConfigured();
  },

  isAlphaVantageConfigured() {
    return this.alphaVantage.apiKey.length > 0;
  }
});

module.exports = config;

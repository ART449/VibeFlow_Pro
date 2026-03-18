/**
 * Colmena ByFlow — Sistema de Flotillas de Bots
 * Cada agente tiene mini-bots subordinados que pueden ejecutar sub-tareas en paralelo
 *
 * Concepto:
 * - El agente principal es el "líder" que recibe la tarea
 * - Los bots de la flotilla dividen la tarea en sub-tareas
 * - Cada bot procesa su parte y el líder consolida
 *
 * Ejemplo: Clip Flow recibe "Resumen de 3 capítulos"
 * → Bot 1: Resumen capítulo 1
 * → Bot 2: Resumen capítulo 2
 * → Bot 3: Resumen capítulo 3
 * → Clip Flow consolida los 3 resúmenes
 */
const grokClient = require('./grok-client');
const { createLogger } = require('./logger');
const log = createLogger('bot-fleet');

class Bot {
  /**
   * @param {string} parentId - ID del agente padre
   * @param {number} index - Índice en la flotilla
   * @param {string} color - Color heredado del padre
   */
  constructor(parentId, index, color) {
    this.id = `${parentId}-bot-${index}`;
    this.parentId = parentId;
    this.index = index;
    this.color = color;
    this.state = 'idle'; // idle | working | done | error
    this.lastResult = null;
  }

  /**
   * Ejecuta una sub-tarea
   */
  async execute(subPrompt, systemPrompt) {
    this.state = 'working';
    log.info(`${this.id} ejecutando sub-tarea`);

    try {
      if (!grokClient.isConfigured()) {
        this.state = 'done';
        this.lastResult = `[Bot ${this.index + 1} SIM] Sub-resultado para: ${subPrompt.slice(0, 50)}...`;
        return { content: this.lastResult, simulated: true };
      }

      const response = await grokClient.chat({
        prompt: subPrompt,
        system: systemPrompt + `\nEres el Bot #${this.index + 1} de la flotilla. Responde solo tu parte asignada, de forma concisa.`,
        maxTokens: 800,
        temperature: 0.7
      });

      this.state = 'done';
      this.lastResult = response.text;
      return { content: response.text, simulated: response.simulated };

    } catch (err) {
      this.state = 'error';
      log.error(`${this.id} error`, { error: err.message });
      return { content: `[Error Bot ${this.index + 1}]: ${err.message}`, simulated: true, error: true };
    }
  }

  getInfo() {
    return { id: this.id, index: this.index, state: this.state, parentId: this.parentId };
  }
}

class BotFleet {
  /**
   * @param {string} agentId - ID del agente dueño
   * @param {number} size - Cantidad de bots
   * @param {string} color - Color del agente
   */
  constructor(agentId, size, color) {
    this.agentId = agentId;
    this.bots = Array.from({ length: size }, (_, i) => new Bot(agentId, i, color));
    log.info(`Flotilla creada: ${agentId} con ${size} bots`);
  }

  /**
   * Divide una tarea en sub-tareas y ejecuta en paralelo
   * @param {string[]} subPrompts - Array de prompts, uno por bot
   * @param {string} systemPrompt - System prompt del agente padre
   * @returns {Object[]} Array de resultados
   */
  async executeParallel(subPrompts, systemPrompt) {
    const tasks = subPrompts.map((prompt, i) => {
      const bot = this.bots[i % this.bots.length];
      return bot.execute(prompt, systemPrompt);
    });

    const results = await Promise.allSettled(tasks);

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { content: `[Bot ${i + 1} falló]: ${r.reason}`, simulated: true, error: true };
    });
  }

  /**
   * Ejecuta una tarea en el próximo bot disponible
   */
  async executeNext(prompt, systemPrompt) {
    const idleBot = this.bots.find(b => b.state === 'idle' || b.state === 'done');
    if (!idleBot) {
      log.warn(`${this.agentId}: todos los bots ocupados`);
      return { content: 'Todos los bots ocupados', simulated: true, busy: true };
    }
    return idleBot.execute(prompt, systemPrompt);
  }

  /**
   * Estado de la flotilla
   */
  getStatus() {
    return {
      agentId: this.agentId,
      total: this.bots.length,
      idle: this.bots.filter(b => b.state === 'idle').length,
      working: this.bots.filter(b => b.state === 'working').length,
      done: this.bots.filter(b => b.state === 'done').length,
      error: this.bots.filter(b => b.state === 'error').length,
      bots: this.bots.map(b => b.getInfo())
    };
  }

  /**
   * Reset todos los bots a idle
   */
  reset() {
    this.bots.forEach(b => { b.state = 'idle'; b.lastResult = null; });
  }
}

module.exports = { Bot, BotFleet };

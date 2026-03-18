/**
 * Colmena ByFlow — Agente Base
 * Clase abstracta que todos los agentes extienden
 */
const grokClient = require('../core/grok-client');
const { BotFleet } = require('../core/bot-fleet');
const { createLogger } = require('../core/logger');

class BaseAgent {
  /**
   * @param {Object} opts
   * @param {string} opts.id - ID único (ej: 'clip-flow')
   * @param {string} opts.name - Nombre visible (ej: 'Clip Flow')
   * @param {string} opts.color - Color hex (ej: '#4488ff')
   * @param {string} opts.emoji - Emoji representativo
   * @param {string} opts.domain - Dominio (ej: 'Educación')
   * @param {string[]} opts.taskTypes - Tipos de tarea soportados
   * @param {number} [opts.botCount=3] - Cantidad de bots en la flotilla
   */
  constructor(opts) {
    this.id = opts.id;
    this.name = opts.name;
    this.color = opts.color;
    this.emoji = opts.emoji;
    this.domain = opts.domain;
    this.taskTypes = opts.taskTypes || [];
    this.state = 'idle'; // idle | working | error | disabled
    this.log = createLogger(opts.id);

    // Flotilla de bots subordinados
    this.fleet = new BotFleet(this.id, opts.botCount || 3, opts.color);
  }

  /**
   * System prompt específico del agente (override en subclases)
   * @returns {string}
   */
  getSystemPrompt() {
    throw new Error(`${this.id}: getSystemPrompt() no implementado`);
  }

  /**
   * Genera prompt del usuario a partir de la tarea (override en subclases)
   * @param {Object} task - { type, params }
   * @returns {string}
   */
  buildPrompt(task) {
    throw new Error(`${this.id}: buildPrompt() no implementado`);
  }

  /**
   * Respuesta simulada para modo sin API (override en subclases)
   * @param {Object} task
   * @returns {Object} resultado simulado
   */
  simulate(task) {
    return {
      content: `[Simulación] ${this.name} completó tarea: ${task.type}`,
      type: task.type,
      simulated: true
    };
  }

  /**
   * Ejecuta una tarea — real con Grok o simulada
   * @param {Object} task - { type, params }
   * @returns {Object} { content, type, metadata, simulated }
   */
  async execute(task) {
    if (!this.taskTypes.includes(task.type)) {
      throw new Error(`${this.id} no soporta tipo: ${task.type}`);
    }

    this.state = 'working';
    this.log.info(`Ejecutando tarea: ${task.type}`, task.params);

    try {
      if (!grokClient.isConfigured()) {
        const result = this.simulate(task);
        this.state = 'idle';
        return { ...result, simulated: true };
      }

      const prompt = this.buildPrompt(task);
      const response = await grokClient.chat({
        prompt,
        system: this.getSystemPrompt()
      });

      if (response.simulated) {
        const result = this.simulate(task);
        this.state = 'idle';
        return { ...result, simulated: true };
      }

      this.state = 'idle';
      return {
        content: response.text,
        type: task.type,
        model: response.model,
        usage: response.usage,
        simulated: false
      };
    } catch (err) {
      this.state = 'error';
      this.log.error('Error ejecutando tarea', { error: err.message });

      // Fallback a simulación en caso de error
      const fallback = this.simulate(task);
      this.state = 'idle';
      return { ...fallback, simulated: true, fallback: true, error: err.message };
    }
  }

  /**
   * Calcula el valor estimado de la tarea
   * @param {string} taskType
   * @returns {number} valor en USD
   */
  getTaskValue(taskType) {
    // Override en subclases para valores específicos
    return 2.50;
  }

  /**
   * Ejecuta tarea dividida entre los bots de la flotilla
   * @param {string[]} subPrompts - Un prompt por cada sub-tarea
   * @returns {Object} { content: string consolidado, botResults: Object[] }
   */
  async executeWithFleet(subPrompts) {
    this.state = 'working';
    this.log.info(`Ejecutando con flotilla: ${subPrompts.length} sub-tareas`);

    const botResults = await this.fleet.executeParallel(subPrompts, this.getSystemPrompt());

    // Consolidar resultados
    const combined = botResults
      .map((r, i) => `--- Bot ${i + 1} ---\n${r.content}`)
      .join('\n\n');

    this.fleet.reset();
    this.state = 'idle';

    return {
      content: combined,
      botResults,
      simulated: botResults.every(r => r.simulated)
    };
  }

  /**
   * Info del agente para el dashboard
   */
  getInfo() {
    return Object.freeze({
      id: this.id,
      name: this.name,
      color: this.color,
      emoji: this.emoji,
      domain: this.domain,
      state: this.state,
      taskTypes: [...this.taskTypes],
      fleet: this.fleet.getStatus()
    });
  }

  getState() {
    return this.state;
  }

  setState(s) {
    this.state = s;
  }
}

module.exports = BaseAgent;

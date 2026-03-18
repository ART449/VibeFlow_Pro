/**
 * Colmena ByFlow — Orquestador de Agentes
 * Coordina tareas, cola, scheduling y distribución de ingresos
 */
const schedule = require('node-schedule');
const db = require('./db');
const config = require('./config');
const { createLogger } = require('./logger');
const log = createLogger('orchestrator');

// Max parallel tasks — Ollama + Gemini = 2 slots simultáneos
const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL_TASKS) || 2;

class Orchestrator {
  constructor() {
    this.agents = new Map();
    this.activeCount = 0;  // Replaces boolean `processing`
    this.jobs = [];
    this.listeners = [];
    this.shutdownRequested = false;
  }

  /**
   * Registra un agente
   */
  registerAgent(agent) {
    this.agents.set(agent.id, agent);
    db.updateAgentStatus(agent.id, 'idle');
    log.info(`Agente registrado: ${agent.name} (${agent.id})`);
  }

  /**
   * Registra listener para eventos
   */
  onEvent(callback) {
    this.listeners.push(callback);
  }

  emit(event, data) {
    for (const cb of this.listeners) {
      try { cb(event, data); } catch (e) { log.error('Listener error', { error: e.message }); }
    }
  }

  /**
   * Envía tarea a la cola
   */
  async submitTask(agentId, type, params = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agente no encontrado: ${agentId}`);
    if (!agent.taskTypes.includes(type)) {
      throw new Error(`${agentId} no soporta tipo: ${type}`);
    }

    const taskId = db.createTask(agentId, type, params);
    log.info('Tarea creada', { taskId, agentId, type });
    this.emit('task-created', { taskId, agentId, type });

    // Procesar inmediatamente si no hay otra en curso
    if (!this.processing) {
      this.processNext();
    }

    return taskId;
  }

  /**
   * Procesa tareas en paralelo (Ollama + Gemini simultáneo)
   */
  async processNext() {
    if (this.activeCount >= MAX_PARALLEL || this.shutdownRequested) return;

    const pending = db.getPendingTasks();
    if (pending.length === 0) return;

    const task = pending[0];
    const agent = this.agents.get(task.agent_id);

    if (!agent) {
      db.updateTaskStatus(task.id, 'failed', null, 'Agente no encontrado');
      return this.processNext();
    }

    // Claim this slot
    this.activeCount++;

    // Mark as running
    db.updateTaskStatus(task.id, 'running');
    db.updateAgentStatus(agent.id, 'working');
    this.emit('agent-state', { agentId: agent.id, state: 'working' });

    // Launch task WITHOUT awaiting — runs in parallel
    this._executeTask(task, agent).finally(() => {
      this.activeCount--;
      // Fill the freed slot
      if (!this.shutdownRequested) {
        setImmediate(() => this.processNext());
      }
    });

    // Immediately try to fill remaining slots
    if (this.activeCount < MAX_PARALLEL && !this.shutdownRequested) {
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Ejecuta una tarea individual
   */
  async _executeTask(task, agent) {
    try {
      const result = await agent.execute({
        type: task.type,
        params: task.params || {}
      });

      db.updateTaskStatus(task.id, 'completed', result);
      if (result.simulated) db.markSimulated(task.id);

      const value = agent.getTaskValue(task.type);
      db.recordEarnings(task.id, agent.id, value);
      db.updateAgentStatus(agent.id, 'idle');

      log.info('Tarea completada', {
        taskId: task.id,
        agentId: agent.id,
        value: `$${value}`,
        simulated: result.simulated
      });

      this.emit('task-complete', {
        taskId: task.id,
        agentId: agent.id,
        result,
        value
      });

      this.emit('agent-state', { agentId: agent.id, state: 'idle' });

    } catch (err) {
      db.updateTaskStatus(task.id, 'failed', null, err.message);
      db.updateAgentStatus(agent.id, 'error');
      log.error('Tarea falló', { taskId: task.id, error: err.message });

      this.emit('task-failed', { taskId: task.id, agentId: agent.id, error: err.message });
      this.emit('agent-state', { agentId: agent.id, state: 'error' });

      setTimeout(() => {
        db.updateAgentStatus(agent.id, 'idle');
        this.emit('agent-state', { agentId: agent.id, state: 'idle' });
      }, 3000);
    }
  }

  /**
   * Configura tareas programadas
   */
  setupSchedules() {
    const scheduleMap = {
      'gflow': { cron: config.schedules.gflow, type: 'market-analysis', params: { symbol: 'SPY' } },
      'bolita-dj': { cron: config.schedules.bolita, type: 'wellness-tip', params: {} },
      'robot-dj': { cron: config.schedules.robot, type: 'content-calendar', params: { weeks: '1' } }
    };

    for (const [agentId, sched] of Object.entries(scheduleMap)) {
      if (sched.cron && this.agents.has(agentId)) {
        const job = schedule.scheduleJob(sched.cron, () => {
          log.info(`Tarea programada: ${agentId} → ${sched.type}`);
          this.submitTask(agentId, sched.type, sched.params);
        });
        if (job) {
          this.jobs.push(job);
          log.info(`Schedule activado: ${agentId} @ ${sched.cron}`);
        }
      }
    }
  }

  /**
   * Estado completo para el dashboard
   */
  getStatus() {
    const agentInfos = [];
    for (const [id, agent] of this.agents) {
      const dbState = db.getAgentState(id);
      agentInfos.push({
        ...agent.getInfo(),
        tasksCompleted: dbState?.tasks_completed || 0,
        totalEarnings: dbState?.total_earnings || 0,
        lastActive: dbState?.last_active || null
      });
    }

    return {
      agents: agentInfos,
      queue: db.getPendingTasks(),
      earnings: db.getEarningsSummary(),
      grokConfigured: config.isGrokConfigured()
    };
  }

  /**
   * Historial de tareas
   */
  getHistory(agentId, limit = 20) {
    return db.getRecentTasks(limit, agentId);
  }

  /**
   * Limpieza al cerrar
   */
  shutdown() {
    this.shutdownRequested = true;
    for (const job of this.jobs) job.cancel();
    this.jobs = [];
    // Wait for ALL active tasks to finish before closing DB
    const closeDb = () => {
      if (this.activeCount > 0) {
        setTimeout(closeDb, 500);
        return;
      }
      db.close();
      log.info('Orquestador cerrado');
    };
    closeDb();
  }
}

module.exports = Orchestrator;

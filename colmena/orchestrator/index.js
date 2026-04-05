'use strict';

const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const Docker = require('dockerode');
const { v4: uuid } = require('uuid');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────
const PORT = process.env.PORT || 4200;
const POSTGRES_URL = process.env.POSTGRES_URL || 'postgresql://colmena:colmena_secret@localhost:5433/colmena';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6380';

// ── Conexiones ────────────────────────────────────────
const pool = new Pool({ connectionString: POSTGRES_URL });
const redis = new Redis(REDIS_URL);
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();
app.use(express.json());

// ── Cargar agentes y perfiles ─────────────────────────
const agentsPath = path.join(__dirname, '..', 'agents', 'registry.json');
const profilesPath = path.join(__dirname, '..', 'runners', 'profiles.json');

let agents = {};
let profiles = {};

function loadConfig() {
  try {
    const agentsData = JSON.parse(fs.readFileSync(agentsPath, 'utf8'));
    agents = {};
    agentsData.agents.forEach(a => { agents[a.id] = a; });
    console.log(`[COLMENA] ${Object.keys(agents).length} agentes cargados`);
  } catch (e) {
    console.error('[COLMENA] Error cargando agents.json:', e.message);
  }
  try {
    const profilesData = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
    profiles = profilesData.profiles || {};
    console.log(`[COLMENA] ${Object.keys(profiles).length} perfiles de runner cargados`);
  } catch (e) {
    console.error('[COLMENA] Error cargando profiles.json:', e.message);
  }
}

loadConfig();

// ── API Routes ────────────────────────────────────────

// Health
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ok', agents: Object.keys(agents).length, profiles: Object.keys(profiles).length });
  } catch (e) {
    res.status(503).json({ status: 'degraded', error: e.message });
  }
});

// Listar agentes
app.get('/api/agents', (_req, res) => {
  const list = Object.values(agents).map(a => ({
    id: a.id,
    name: a.name,
    role: a.role,
    runner_profile: a.runner_profile,
    tools: a.tools
  }));
  res.json(list);
});

// Crear tarea
app.post('/api/tasks', async (req, res) => {
  const { agent_id, scope, input, priority } = req.body;
  if (!agent_id || !scope) {
    return res.status(400).json({ error: 'agent_id y scope requeridos' });
  }
  const agent = agents[agent_id];
  if (!agent) {
    return res.status(404).json({ error: `Agente '${agent_id}' no encontrado` });
  }

  const id = uuid();
  const runnerProfile = agent.runner_profile || 'code-runner';

  try {
    await pool.query(
      `INSERT INTO tasks (id, agent_id, scope, status, priority, input, runner_profile)
       VALUES ($1, $2, $3, 'queued', $4, $5, $6)`,
      [id, agent_id, scope, priority || 5, JSON.stringify(input || {}), runnerProfile]
    );

    // Encolar en Redis
    await redis.lpush('colmena:task_queue', JSON.stringify({ id, agent_id, scope, runner_profile: runnerProfile }));

    res.status(201).json({ id, agent_id, scope, status: 'queued', runner_profile: runnerProfile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Estado de tarea
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar tareas
app.get('/api/tasks', async (req, res) => {
  const status = req.query.status || null;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  try {
    const query = status
      ? 'SELECT * FROM tasks WHERE status = $1 ORDER BY created_at DESC LIMIT $2'
      : 'SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1';
    const params = status ? [status, limit] : [limit];
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Findings de una tarea
app.get('/api/tasks/:id/findings', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM findings WHERE task_id = $1 ORDER BY risk DESC, created_at',
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Guardar resultado de agente
app.post('/api/tasks/:id/result', async (req, res) => {
  const { output, findings, artifacts } = req.body;
  try {
    await pool.query(
      `UPDATE tasks SET status = 'done', output = $1, finished_at = NOW() WHERE id = $2`,
      [JSON.stringify(output || {}), req.params.id]
    );

    if (findings && findings.length) {
      for (const f of findings) {
        await pool.query(
          `INSERT INTO findings (task_id, agent_id, risk, title, description, evidence, remediation, file_path, line_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [req.params.id, f.agent || '', f.risk || 'low', f.title, f.description, f.evidence, f.remediation, f.file_path, f.line_number]
        );
      }
    }

    res.json({ status: 'done', findings_saved: (findings || []).length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cola de aprobacion
app.get('/api/approvals', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT aq.*, t.agent_id, t.scope FROM approval_queue aq
       JOIN tasks t ON t.id = aq.task_id
       WHERE aq.status = 'pending' ORDER BY aq.created_at`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aprobar/rechazar
app.post('/api/approvals/:id', async (req, res) => {
  const { action, approved_by } = req.body;
  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ error: 'action debe ser approved o rejected' });
  }
  try {
    await pool.query(
      `UPDATE approval_queue SET status = $1, resolved_at = NOW(), resolved_by = $2 WHERE id = $3`,
      [action, approved_by || 'admin', req.params.id]
    );
    res.json({ status: action });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scores de agentes
app.get('/api/scores', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM agent_scores ORDER BY score DESC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dashboard resumen
app.get('/api/dashboard', async (_req, res) => {
  try {
    const tasks = await pool.query(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
    );
    const criticals = await pool.query(
      `SELECT COUNT(*) as count FROM findings WHERE risk = 'critical'`
    );
    const pending = await pool.query(
      `SELECT COUNT(*) as count FROM approval_queue WHERE status = 'pending'`
    );
    const queueLen = await redis.llen('colmena:task_queue');

    res.json({
      tasks: Object.fromEntries(tasks.rows.map(r => [r.status, parseInt(r.count)])),
      critical_findings: parseInt(criticals.rows[0].count),
      pending_approvals: parseInt(pending.rows[0].count),
      queue_depth: queueLen
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Worker: procesar cola ─────────────────────────────
async function processQueue() {
  while (true) {
    try {
      const item = await redis.brpop('colmena:task_queue', 5);
      if (!item) continue;

      const task = JSON.parse(item[1]);
      console.log(`[WORKER] Procesando tarea ${task.id} → agente: ${task.agent_id}`);

      await pool.query(
        `UPDATE tasks SET status = 'running', started_at = NOW() WHERE id = $1`,
        [task.id]
      );

      // TODO: Aqui se levanta el runner efimero via Docker API
      // const profile = profiles[task.runner_profile];
      // const container = await docker.createContainer({ ... });
      // await container.start();
      // Esperar resultado...
      // await container.remove();

      console.log(`[WORKER] Tarea ${task.id} en proceso (runner: ${task.runner_profile})`);
    } catch (e) {
      console.error('[WORKER] Error:', e.message);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[COLMENA] Cerebro central escuchando en :${PORT}`);
  console.log(`[COLMENA] Agentes: ${Object.keys(agents).join(', ')}`);
  console.log(`[COLMENA] Runners: ${Object.keys(profiles).join(', ')}`);

  // Iniciar worker en background
  processQueue().catch(e => console.error('[WORKER] Fatal:', e.message));
});

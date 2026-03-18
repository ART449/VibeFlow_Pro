/**
 * Colmena ByFlow — Base de datos SQLite (via sql.js — WASM, sin native deps)
 * Persistencia de tareas, ingresos y estado de agentes
 */
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { createLogger } = require('./logger');
const log = createLogger('db');

let db = null;
let dbPath = '';

async function initDb() {
  if (db) return db;

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  dbPath = config.db.path;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  // Cargar DB existente o crear nueva
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  runMigrations();
  log.info('Base de datos inicializada', { path: dbPath });
  return db;
}

function getDb() {
  if (!db) throw new Error('DB no inicializada — llama initDb() primero');
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function runMigrations() {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      params TEXT,
      status TEXT DEFAULT 'pending',
      result TEXT,
      simulated INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      completed_at TEXT,
      error TEXT
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER,
      agent_id TEXT NOT NULL,
      gross_amount REAL NOT NULL,
      artist_share REAL NOT NULL,
      platform_share REAL NOT NULL,
      agent_share REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_state (
      agent_id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'idle',
      tasks_completed INTEGER DEFAULT 0,
      total_earnings REAL DEFAULT 0,
      last_active TEXT,
      config TEXT
    );
  `);

  // Indices (CREATE IF NOT EXISTS no existe en sql.js, use try/catch)
  try { db.run('CREATE INDEX idx_tasks_agent ON tasks(agent_id)'); } catch {}
  try { db.run('CREATE INDEX idx_tasks_status ON tasks(status)'); } catch {}
  try { db.run('CREATE INDEX idx_earnings_agent ON earnings(agent_id)'); } catch {}

  save();
  log.info('Migraciones ejecutadas');
}

// --- Helper para queries ---
function run(sql, params = []) {
  db.run(sql, params);
  save();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// --- Operaciones de Tareas ---

function createTask(agentId, type, params) {
  run('INSERT INTO tasks (agent_id, type, params) VALUES (?, ?, ?)',
    [agentId, type, JSON.stringify(params || {})]);
  const row = get('SELECT last_insert_rowid() as id');
  return row ? row.id : 0;
}

function updateTaskStatus(taskId, status, result, error) {
  const completedAt = (status === 'completed' || status === 'failed')
    ? new Date().toISOString()
    : null;
  run('UPDATE tasks SET status = ?, result = ?, error = ?, completed_at = ? WHERE id = ?',
    [status, result ? JSON.stringify(result) : null, error || null, completedAt, taskId]);
}

function markSimulated(taskId) {
  run('UPDATE tasks SET simulated = 1 WHERE id = ?', [taskId]);
}

function getTask(taskId) {
  const row = get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (row && row.params) row.params = JSON.parse(row.params);
  if (row && row.result) row.result = JSON.parse(row.result);
  return row;
}

function getPendingTasks() {
  return all("SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at ASC")
    .map(r => {
      if (r.params) r.params = JSON.parse(r.params);
      return r;
    });
}

function getRecentTasks(limit = 20, agentId) {
  const q = agentId
    ? 'SELECT * FROM tasks WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?';
  const params = agentId ? [agentId, limit] : [limit];
  return all(q, params).map(r => {
    if (r.params) r.params = JSON.parse(r.params);
    if (r.result) r.result = JSON.parse(r.result);
    return r;
  });
}

// --- Operaciones de Ingresos ---

function recordEarnings(taskId, agentId, grossAmount) {
  const { split } = config.earnings;
  run(`INSERT INTO earnings (task_id, agent_id, gross_amount, artist_share, platform_share, agent_share)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [taskId, agentId, grossAmount,
     grossAmount * split.artist,
     grossAmount * split.platform,
     grossAmount * split.agent]);

  // Upsert agent_state
  const existing = get('SELECT * FROM agent_state WHERE agent_id = ?', [agentId]);
  if (existing) {
    run(`UPDATE agent_state SET tasks_completed = tasks_completed + 1,
         total_earnings = total_earnings + ?, last_active = datetime('now','localtime')
         WHERE agent_id = ?`, [grossAmount, agentId]);
  } else {
    run(`INSERT INTO agent_state (agent_id, tasks_completed, total_earnings, last_active)
         VALUES (?, 1, ?, datetime('now','localtime'))`, [agentId, grossAmount]);
  }
}

function getEarningsSummary() {
  const totals = get(`SELECT
    COALESCE(SUM(gross_amount), 0) as total,
    COALESCE(SUM(artist_share), 0) as artist,
    COALESCE(SUM(platform_share), 0) as platform,
    COALESCE(SUM(agent_share), 0) as agent_cost
    FROM earnings`) || { total: 0, artist: 0, platform: 0, agent_cost: 0 };

  const byAgent = all(`SELECT agent_id, COALESCE(SUM(gross_amount), 0) as total, COUNT(*) as tasks
    FROM earnings GROUP BY agent_id`);

  const today = get(`SELECT COALESCE(SUM(gross_amount), 0) as total
    FROM earnings WHERE date(created_at) = date('now','localtime')`) || { total: 0 };

  return { totals, byAgent, today: today.total };
}

// --- Estado de Agentes ---

function getAgentState(agentId) {
  return get('SELECT * FROM agent_state WHERE agent_id = ?', [agentId]);
}

function updateAgentStatus(agentId, status) {
  const existing = get('SELECT * FROM agent_state WHERE agent_id = ?', [agentId]);
  if (existing) {
    run('UPDATE agent_state SET status = ? WHERE agent_id = ?', [status, agentId]);
  } else {
    run('INSERT INTO agent_state (agent_id, status) VALUES (?, ?)', [agentId, status]);
  }
}

function getAllAgentStates() {
  return all('SELECT * FROM agent_state');
}

function close() {
  if (db) {
    save();
    db.close();
    db = null;
    log.info('DB cerrada');
  }
}

module.exports = {
  initDb, getDb, createTask, updateTaskStatus, markSimulated, getTask,
  getPendingTasks, getRecentTasks, recordEarnings, getEarningsSummary,
  getAgentState, updateAgentStatus, getAllAgentStates, close
};

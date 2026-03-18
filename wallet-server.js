#!/usr/bin/env node
/**
 * Colmena ByFlow — Wallet Server
 * Sirve el dashboard + API para leer la DB
 * Uso: node wallet-server.js [--port 3333]
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initDb, getDb } = require('./core/db');

const PORT = parseInt(process.argv[process.argv.indexOf('--port') + 1]) || 3333;
const WALLET_PIN = process.env.WALLET_PIN || '102698';

// Session tokens (in-memory, valid 24h)
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function isValidSession(req) {
  // Check cookie
  const cookies = (req.headers.cookie || '').split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const token = cookies['colmena_session'];
  if (!token || !sessions.has(token)) return false;
  const created = sessions.get(token);
  if (Date.now() - created > SESSION_TTL) {
    sessions.delete(token);
    return false;
  }
  return true;
}

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Colmena ByFlow — Login</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#fff;font-family:'Segoe UI',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.login{background:#12121a;border:1px solid #2a2a3a;border-radius:20px;padding:48px;width:360px;text-align:center}
.login .emoji{font-size:56px;margin-bottom:16px}
.login h1{font-size:22px;margin-bottom:4px}
.login h1 em{color:#ff2d78;font-style:normal}
.login p{font-size:13px;color:#666;margin-bottom:24px}
.login input{width:100%;background:#1a1a25;border:1px solid #2a2a3a;border-radius:12px;padding:14px 16px;color:#fff;font-size:20px;text-align:center;letter-spacing:8px;outline:none;transition:border-color .3s}
.login input:focus{border-color:#ff2d78}
.login input::placeholder{letter-spacing:2px;font-size:14px;color:#444}
.login button{width:100%;margin-top:16px;background:linear-gradient(135deg,#ff2d78,#ff6b6b);color:#fff;border:none;padding:14px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;transition:transform .2s}
.login button:hover{transform:scale(1.02)}
.login button:active{transform:scale(.97)}
.error{color:#ff4444;font-size:12px;margin-top:12px;display:none}
</style></head><body>
<div class="login">
<div class="emoji">🐝</div>
<h1>Colmena <em>ByFlow</em></h1>
<p>Wallet — Ingresa tu PIN</p>
<form method="POST" action="/login">
<input type="password" name="pin" placeholder="PIN" maxlength="10" autofocus autocomplete="off">
<button type="submit">Entrar</button>
</form>
<div class="error" id="err">PIN incorrecto</div>
</div>
<script>
if(location.search.includes('fail')){document.getElementById('err').style.display='block';document.querySelector('input').style.borderColor='#ff4444';}
</script>
</body></html>`;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.db': 'application/octet-stream'
};

async function start() {
  await initDb();
  const dbInstance = getDb();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Login page (no auth needed)
    if (url.pathname === '/login' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(LOGIN_PAGE);
    }

    // Handle login POST
    if (url.pathname === '/login' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const pin = params.get('pin') || '';
        if (pin === WALLET_PIN) {
          const token = generateToken();
          sessions.set(token, Date.now());
          res.writeHead(302, {
            'Set-Cookie': `colmena_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
            'Location': '/'
          });
          res.end();
        } else {
          res.writeHead(302, { 'Location': '/login?fail=1' });
          res.end();
        }
      });
      return;
    }

    // Logout
    if (url.pathname === '/logout') {
      res.writeHead(302, {
        'Set-Cookie': 'colmena_session=; Path=/; Max-Age=0',
        'Location': '/login'
      });
      return res.end();
    }

    // Auth check — everything below requires valid session
    if (!isValidSession(req)) {
      res.writeHead(302, { 'Location': '/login' });
      return res.end();
    }

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');

    // API endpoints
    if (url.pathname === '/api/summary') {
      return sendJson(res, getSummary(dbInstance));
    }
    if (url.pathname === '/api/agents') {
      return sendJson(res, getAgents(dbInstance));
    }
    if (url.pathname === '/api/history') {
      const limit = parseInt(url.searchParams.get('limit')) || 50;
      return sendJson(res, getHistory(dbInstance, limit));
    }
    if (url.pathname === '/api/run-status') {
      return sendJson(res, { running: isRunnerActive(), gpu: getGPUStatus() });
    }
    if (url.pathname === '/api/resources') {
      return sendJson(res, getSystemResources());
    }
    if (url.pathname === '/api/brake-status') {
      try {
        const { getBrakeStatus } = require('./core/grok-client');
        return sendJson(res, getBrakeStatus());
      } catch { return sendJson(res, { enabled: false }); }
    }
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { message } = JSON.parse(body);
          const reply = await chatWithAI(message);
          sendJson(res, { reply });
        } catch (e) {
          sendJson(res, { reply: 'Error: ' + e.message });
        }
      });
      return;
    }

    // Serve DB file directly (for sql.js in browser)
    if (url.pathname === '/colmena.db') {
      const dbPath = path.join(__dirname, 'db', 'colmena.db');
      if (fs.existsSync(dbPath)) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        fs.createReadStream(dbPath).pipe(res);
        return;
      }
    }

    // Static files
    let filePath = url.pathname === '/' ? '/wallet.html' : url.pathname;
    filePath = path.join(__dirname, filePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`\n🐝 Colmena Wallet → http://localhost:${PORT}`);
    console.log(`   API: /api/summary, /api/agents, /api/history`);
    console.log(`   DB:  /colmena.db\n`);
  });
}

function sendJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getSummary(db) {
  const exec = (sql) => {
    const r = db.exec(sql);
    if (!r.length) return [];
    return r[0].values.map(row => {
      const obj = {};
      r[0].columns.forEach((c, i) => obj[c] = row[i]);
      return obj;
    });
  };

  const totals = exec(`SELECT
    COALESCE(SUM(gross_amount),0) as bruto,
    COALESCE(SUM(artist_share),0) as arturo,
    COALESCE(SUM(platform_share),0) as iartlabs,
    COALESCE(SUM(agent_share),0) as operativo,
    COUNT(*) as tareas
    FROM earnings`)[0] || {};

  const today = exec(`SELECT COALESCE(SUM(gross_amount),0) as total
    FROM earnings WHERE date(created_at) = date('now','localtime')`)[0] || { total: 0 };

  const realTasks = exec(`SELECT COUNT(*) as c FROM tasks WHERE simulated = 0 AND status='completed'`)[0] || { c: 0 };

  return { ...totals, today: today.total, realTasks: realTasks.c };
}

function getAgents(db) {
  const r = db.exec(`SELECT agent_id, COUNT(*) as tareas, SUM(gross_amount) as total
    FROM earnings GROUP BY agent_id ORDER BY total DESC`);
  if (!r.length) return [];
  return r[0].values.map(row => ({
    id: row[0], tareas: row[1], total: row[2]
  }));
}

function getHistory(db, limit) {
  const r = db.exec(`SELECT t.id, t.agent_id, t.type, t.status, t.simulated, t.created_at,
    e.gross_amount FROM tasks t LEFT JOIN earnings e ON e.task_id = t.id
    ORDER BY t.created_at DESC LIMIT ${limit}`);
  if (!r.length) return [];
  return r[0].values.map(row => ({
    id: row[0], agent: row[1], type: row[2], status: row[3],
    simulated: row[4], date: row[5], amount: row[6]
  }));
}

function isRunnerActive() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('tasklist /FI "WINDOWTITLE eq auto-runner*" 2>nul', { encoding: 'utf8' });
    return out.includes('node');
  } catch { return false; }
}

function getGPUStatus() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits', { encoding: 'utf8', timeout: 5000 });
    const [temp, util, memUsed, memTotal] = out.trim().split(', ');
    return { temp: `${temp}°C`, util: `${util}%`, memUsed: `${memUsed} MiB`, memTotal: `${memTotal} MiB`, available: true };
  } catch {
    return { available: false };
  }
}

function getSystemResources() {
  const os = require('os');
  const { execSync } = require('child_process');

  // CPU
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'Unknown';
  const cpuCores = cpus.length;
  let cpuUsage = 0;
  try {
    const out = execSync('wmic cpu get loadpercentage /value', { encoding: 'utf8', timeout: 5000 });
    const m = out.match(/LoadPercentage=(\d+)/);
    cpuUsage = m ? parseInt(m[1]) : 0;
  } catch {}

  // RAM
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // GPU
  const gpu = getGPUStatus();

  // Disk
  let diskInfo = {};
  try {
    const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /value', { encoding: 'utf8', timeout: 10000, stdio: ['pipe','pipe','pipe'] });
    const free = out.match(/FreeSpace=(\d+)/);
    const total = out.match(/Size=(\d+)/);
    if (free && total) {
      diskInfo = {
        total: (parseInt(total[1]) / 1073741824).toFixed(1) + ' GB',
        free: (parseInt(free[1]) / 1073741824).toFixed(1) + ' GB',
        usedPct: ((1 - parseInt(free[1]) / parseInt(total[1])) * 100).toFixed(0)
      };
    }
  } catch {}

  // Uptime
  const uptime = os.uptime();
  const hrs = Math.floor(uptime / 3600);
  const mins = Math.floor((uptime % 3600) / 60);

  return {
    cpu: { model: cpuModel, cores: cpuCores, usage: cpuUsage },
    ram: {
      total: (totalMem / 1073741824).toFixed(1) + ' GB',
      used: (usedMem / 1073741824).toFixed(1) + ' GB',
      free: (freeMem / 1073741824).toFixed(1) + ' GB',
      usedPct: ((usedMem / totalMem) * 100).toFixed(0)
    },
    gpu,
    disk: diskInfo,
    uptime: `${hrs}h ${mins}m`
  };
}

async function chatWithAI(message) {
  // Use Grok/Ollama via the same client as agents
  const config = require('./core/config');
  const OLLAMA_BASE = 'http://localhost:11434';
  const OLLAMA_MODEL = 'gemma3:4b';

  // Try Ollama first (free)
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: 'Eres GFlow, el asistente de Colmena ByFlow. Responde en español, corto y directo. Ayudas con finanzas, agentes y la plataforma.' },
          { role: 'user', content: message }
        ],
        stream: false,
        options: { num_predict: 500 }
      }),
      signal: AbortSignal.timeout(60000)
    });
    if (res.ok) {
      const data = await res.json();
      return data.message?.content || 'Sin respuesta';
    }
  } catch {}

  // Fallback to Grok
  if (config.isGrokConfigured()) {
    try {
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.grok.apiKey}`
        },
        body: JSON.stringify({
          model: config.grok.model,
          messages: [
            { role: 'system', content: 'Eres GFlow, el asistente de Colmena ByFlow. Responde en español, corto y directo.' },
            { role: 'user', content: message }
          ],
          max_tokens: 500
        }),
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || 'Sin respuesta';
      }
    } catch {}
  }

  return 'No hay proveedor AI disponible. Verifica Ollama o Grok.';
}

start().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

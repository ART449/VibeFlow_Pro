#!/usr/bin/env node
/**
 * ByFlow — Plan de 7 Dias para Don Pato
 * Tracker interactivo en terminal
 * Ejecutar: node plan-tracker.js
 */

const readline = require('readline');
const fs = require('fs');

const DATA_FILE = 'data/plan-progress.json';

const PLAN = [
  {
    day: 1,
    title: 'Schema + Backend + Seed Data',
    tasks: [
      { id: 't1a', desc: 'API /api/cola funcional (POST/GET/DELETE/PATCH)', auto: true },
      { id: 't1b', desc: 'Socket.IO emite cola_update en tiempo real', auto: true },
      { id: 't1c', desc: 'API /api/qr genera QR apuntando a /remote.html', auto: true },
      { id: 't1d', desc: 'API /api/mesas configurada', auto: true },
      { id: 't1e', desc: 'Filtro de contenido activo (35+ palabras)', auto: true },
    ]
  },
  {
    day: 2,
    title: 'WebSocket Hub + Tiempo Real',
    tasks: [
      { id: 't2a', desc: 'Socket.IO broadcast cola_update a todos los clientes' },
      { id: 't2b', desc: 'display.html recibe updates en tiempo real' },
      { id: 't2c', desc: 'remote.html recibe updates en tiempo real' },
      { id: 't2d', desc: 'Reconexion automatica en caso de corte WiFi' },
    ]
  },
  {
    day: 3,
    title: 'remote.html — Vista Patron (Celular)',
    tasks: [
      { id: 't3a', desc: 'Formulario: nombre + cancion + mesa', auto: true },
      { id: 't3b', desc: 'Cola visible en solo lectura', auto: true },
      { id: 't3c', desc: 'Mobile-first responsive', auto: true },
      { id: 't3d', desc: 'Guarda nombre en localStorage', auto: true },
      { id: 't3e', desc: 'Validacion client-side + server-side' },
      { id: 't3f', desc: 'Probar en Pixel real via WiFi local' },
    ]
  },
  {
    day: 4,
    title: 'display.html — Vista TV/Proyector',
    tasks: [
      { id: 't4a', desc: 'Banner "Cantando ahora" con nombre + cancion', auto: true },
      { id: 't4b', desc: 'Lista de proximos cantantes', auto: true },
      { id: 't4c', desc: 'Pantalla idle con logo ByFlow + QR', auto: true },
      { id: 't4d', desc: 'Branding ByFlow + IArtLabs', auto: true },
      { id: 't4e', desc: 'Probar en TV real (HDMI desde laptop)' },
    ]
  },
  {
    day: 5,
    title: 'Empaquetado (Docker + Deploy)',
    tasks: [
      { id: 't5a', desc: 'Dockerfile creado', auto: true },
      { id: 't5b', desc: 'docker-compose.yml creado', auto: true },
      { id: 't5c', desc: '.dockerignore creado', auto: true },
      { id: 't5d', desc: 'docker compose up --build funciona' },
      { id: 't5e', desc: 'Railway deploy sigue funcionando' },
    ]
  },
  {
    day: 6,
    title: 'Prueba en Don Pato (Noche Real)',
    tasks: [
      { id: 't6a', desc: 'Laptop conectada al WiFi del bar' },
      { id: 't6b', desc: 'TV muestra display.html via HDMI' },
      { id: 't6c', desc: 'QR impreso o en pantalla, clientes escanean' },
      { id: 't6d', desc: 'Al menos 5 personas piden cancion via remote.html' },
      { id: 't6e', desc: 'Cola se actualiza en TV en tiempo real' },
      { id: 't6f', desc: 'No crashes durante toda la noche' },
    ]
  },
  {
    day: 7,
    title: 'Bug List + Retrospectiva',
    tasks: [
      { id: 't7a', desc: 'Lista de bugs encontrados en Don Pato' },
      { id: 't7b', desc: 'Feedback de los clientes documentado' },
      { id: 't7c', desc: 'Priorizar fixes para siguiente iteracion' },
      { id: 't7d', desc: 'Actualizar ESTADO_PROYECTO.md' },
    ]
  },
];

// ── State ──
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return {}; }
}
function saveProgress(progress) {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(progress, null, 2));
}

// ── Auto-detect completed tasks ──
async function autoDetect(progress) {
  // Check if files exist and APIs are wired
  const checks = {
    t1a: () => fileContains('server.js', "app.post('/api/cola'"),
    t1b: () => fileContains('server.js', "io.emit('cola_update'"),
    t1c: () => fileContains('server.js', '/remote.html'),
    t1d: () => fileContains('server.js', "app.get('/api/mesas'"),
    t1e: () => fileContains('server.js', 'validarTextoPublico'),
    t3a: () => fileExists('public/remote.html') && fileContains('public/remote.html', 'inp-name'),
    t3b: () => fileContains('public/remote.html', 'queue-list'),
    t3c: () => fileContains('public/remote.html', 'viewport'),
    t3d: () => fileContains('public/remote.html', 'localStorage'),
    t4a: () => fileContains('public/display.html', 'now-singing'),
    t4b: () => fileContains('public/display.html', 'queue-list'),
    t4c: () => fileContains('public/display.html', 'idle-qr'),
    t4d: () => fileContains('public/display.html', 'IArtLabs'),
    t5a: () => fileExists('Dockerfile'),
    t5b: () => fileExists('docker-compose.yml'),
    t2a: () => fileContains('server.js', "io.emit('cola_update'"),
    t2b: () => fileContains('public/display.html', 'cola_update'),
    t2c: () => fileContains('public/remote.html', 'cola_update'),
    t2d: () => fileContains('public/remote.html', 'reconnect') && fileContains('public/display.html', 'reconnect'),
    t5c: () => fileExists('.dockerignore'),
  };
  for (const [id, check] of Object.entries(checks)) {
    try { if (check()) progress[id] = true; } catch {}
  }
  return progress;
}

function fileExists(f) { return fs.existsSync(f); }
function fileContains(f, s) { return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(s); }

// ── Render ──
const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m', white: '\x1b[37m',
  bgGreen: '\x1b[42m', bgRed: '\x1b[41m', bgYellow: '\x1b[43m',
};

function renderPlan(progress) {
  console.clear();

  const totalTasks = PLAN.reduce((s, d) => s + d.tasks.length, 0);
  const doneTasks = PLAN.reduce((s, d) => s + d.tasks.filter(t => progress[t.id]).length, 0);
  const pct = Math.round((doneTasks / totalTasks) * 100);

  // Header
  console.log('');
  console.log(`  ${C.bold}${C.magenta}╔══════════════════════════════════════════════╗${C.reset}`);
  console.log(`  ${C.bold}${C.magenta}║${C.reset}   ${C.bold}ByFlow — Plan 7 Dias para Don Pato${C.reset}       ${C.bold}${C.magenta}║${C.reset}`);
  console.log(`  ${C.bold}${C.magenta}║${C.reset}   ${C.dim}powered by IArtLabs${C.reset}                       ${C.bold}${C.magenta}║${C.reset}`);
  console.log(`  ${C.bold}${C.magenta}╚══════════════════════════════════════════════╝${C.reset}`);
  console.log('');

  // Progress bar
  const barLen = 30;
  const filled = Math.round((pct / 100) * barLen);
  const bar = `${C.green}${'█'.repeat(filled)}${C.dim}${'░'.repeat(barLen - filled)}${C.reset}`;
  console.log(`  ${bar}  ${C.bold}${pct}%${C.reset} (${doneTasks}/${totalTasks} tareas)`);
  console.log('');

  // Days
  for (const day of PLAN) {
    const dayDone = day.tasks.filter(t => progress[t.id]).length;
    const dayTotal = day.tasks.length;
    const dayPct = dayTotal > 0 ? Math.round((dayDone / dayTotal) * 100) : 0;

    let statusIcon, statusColor;
    if (dayPct === 100) { statusIcon = '✅'; statusColor = C.green; }
    else if (dayPct > 0) { statusIcon = '🔨'; statusColor = C.yellow; }
    else { statusIcon = '⬜'; statusColor = C.dim; }

    console.log(`  ${statusIcon} ${C.bold}${statusColor}Dia ${day.day}: ${day.title}${C.reset} ${C.dim}(${dayDone}/${dayTotal})${C.reset}`);

    for (const task of day.tasks) {
      const done = progress[task.id];
      const icon = done ? `${C.green}✔${C.reset}` : `${C.dim}○${C.reset}`;
      const text = done ? `${C.dim}${task.desc}${C.reset}` : task.desc;
      const autoTag = task.auto && done ? ` ${C.dim}[auto]${C.reset}` : '';
      console.log(`      ${icon} ${text}${autoTag}`);
    }
    console.log('');
  }
}

function showMenu() {
  console.log(`  ${C.cyan}Comandos:${C.reset}`);
  console.log(`    ${C.bold}[numero]${C.reset}  — Toggle tarea (ej: ${C.dim}t6a${C.reset})`);
  console.log(`    ${C.bold}r${C.reset}         — Refrescar (auto-detectar)`);
  console.log(`    ${C.bold}q${C.reset}         — Salir`);
  console.log('');
}

// ── Main ──
async function main() {
  let progress = loadProgress();
  progress = await autoDetect(progress);
  saveProgress(progress);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    renderPlan(progress);
    showMenu();
    rl.question(`  ${C.cyan}>${C.reset} `, async (input) => {
      input = input.trim().toLowerCase();

      if (input === 'q' || input === 'quit' || input === 'exit') {
        console.log(`\n  ${C.magenta}Nos vemos en Don Pato! 🎤${C.reset}\n`);
        rl.close();
        return;
      }

      if (input === 'r' || input === 'refresh') {
        progress = await autoDetect(progress);
        saveProgress(progress);
        prompt();
        return;
      }

      // Toggle task
      const allTasks = PLAN.flatMap(d => d.tasks);
      const task = allTasks.find(t => t.id === input);
      if (task) {
        progress[task.id] = !progress[task.id];
        saveProgress(progress);
      }

      prompt();
    });
  };

  prompt();
}

main();

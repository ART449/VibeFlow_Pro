'use strict';
const http = require('http');
const { exec } = require('child_process');

const PORT = process.env.SHELL_PORT || 9091;
const TOKEN = process.env.SHELL_TOKEN || '';
if (!TOKEN) { console.error('SHELL_TOKEN requerido. Uso: SHELL_TOKEN=tutoken node secure-shell.js'); process.exit(1); }

// Strip sensitive env vars from child processes
const SAFE_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    !/(TOKEN|SECRET|KEY|PASS|AUTH|OAUTH|CREDENTIAL)/i.test(k)
  )
);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', host: 'sandbox', auth: true }));
    return;
  }

  if (url.pathname === '/exec') {
    const token = url.searchParams.get('token');
    if (token !== TOKEN) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
      return;
    }
    const cmd = url.searchParams.get('cmd');
    if (!cmd) { res.writeHead(400); res.end('No command'); return; }

    // Block env/set commands that could leak secrets
    const blocked = /\b(env|set)\b/i;
    if (blocked.test(cmd.split(/[|&;]/)[0].trim())) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Blocked: env/set commands disabled for security');
      return;
    }

    exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024, env: SAFE_ENV }, (err, stdout, stderr) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end((stdout || '') + (stderr ? '\nSTDERR: ' + stderr : '') + (err && err.killed ? '\n[TIMEOUT]' : ''));
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Secure Shell en http://127.0.0.1:' + PORT + ' (solo localhost + Tailscale tunnel)');
});

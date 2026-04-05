/**
 * Remote Shell Server — se copia a la sandbox y da terminal web
 * Corre en puerto 9090, accesible desde victusart via http://10.0.0.2:9090
 */
'use strict';
const http = require('http');
const { exec } = require('child_process');
const path = require('path');

const PORT = 9090;
const AUTH_TOKEN = 'nq2026mx';

const HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Sandbox Shell</title>
<style>
*{margin:0;box-sizing:border-box}
body{background:#0a0806;color:#d4c4a0;font-family:monospace;padding:20px}
h1{color:#cfa759;font-size:16px;margin-bottom:10px}
#output{background:#110e0a;border:1px solid rgba(207,167,89,.2);border-radius:8px;padding:12px;
  height:70vh;overflow-y:auto;white-space:pre-wrap;font-size:13px;margin-bottom:10px}
#cmd{width:100%;background:#110e0a;border:1px solid rgba(207,167,89,.3);border-radius:6px;
  padding:10px;color:#d4c4a0;font-family:monospace;font-size:14px}
.prompt{color:#cfa759}
</style></head><body>
<h1>Necuapahtli Sandbox Shell — desktop-9q2kj5p</h1>
<div id="output"></div>
<input id="cmd" placeholder="Escribe un comando..." autofocus>
<script>
const out=document.getElementById('output'),cmd=document.getElementById('cmd');
function run(c){
  out.innerHTML+='<span class="prompt">$ </span>'+c+'\\n';
  fetch('/exec?cmd='+encodeURIComponent(c)+'&token=${AUTH_TOKEN}')
    .then(r=>r.text()).then(t=>{out.innerHTML+=t+'\\n';out.scrollTop=out.scrollHeight})
    .catch(e=>{out.innerHTML+='ERROR: '+e+'\\n'});
}
cmd.addEventListener('keydown',e=>{if(e.key==='Enter'&&cmd.value.trim()){run(cmd.value.trim());cmd.value=''}});
run('systeminfo | findstr /C:"Host Name" /C:"OS Name" /C:"Total Physical Memory" /C:"Available Physical Memory" /C:"Processor"');
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/exec') {
    const token = url.searchParams.get('token');
    const cmd = url.searchParams.get('cmd');
    if (token !== AUTH_TOKEN) { res.writeHead(403); res.end('Unauthorized'); return; }
    if (!cmd) { res.writeHead(400); res.end('No command'); return; }

    exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end((stdout || '') + (stderr ? '\\nSTDERR: ' + stderr : '') + (err && err.killed ? '\\n[TIMEOUT]' : ''));
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Sandbox Shell corriendo en http://0.0.0.0:' + PORT);
});

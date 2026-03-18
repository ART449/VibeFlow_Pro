/**
 * Colmena ByFlow — Lanzador autónomo de agentes
 * Ejecuta tareas reales en todos los agentes para generar contenido/ingresos
 * Uso: node run-agents.js
 */
require('dotenv').config();
const { initDb } = require('./core/db');
const Orchestrator = require('./core/orchestrator');
const { getProviderInfo } = require('./core/grok-client');

const ClipFlow = require('./agents/clip-flow');
const BolitaDJ = require('./agents/bolita-dj');
const GFlow = require('./agents/gflow');
const Michi = require('./agents/michi');
const RobotDJ = require('./agents/robot-dj');

// Tareas productivas que generan contenido vendible
const TASKS = [
  // Clip Flow — contenido educativo
  { agent: 'clip-flow', type: 'study-guide', params: { topic: 'Inteligencia Artificial para principiantes', level: 'principiante' }},
  { agent: 'clip-flow', type: 'summary', params: { topic: 'Marketing Digital en 2026 — tendencias clave', level: 'intermedio' }},
  { agent: 'clip-flow', type: 'flashcards', params: { topic: 'Programación en Python — conceptos fundamentales' }},

  // Bolita DJ — contenido de bienestar
  { agent: 'bolita-dj', type: 'routine', params: { goal: 'perder grasa', duration: '30 minutos', level: 'intermedio' }},
  { agent: 'bolita-dj', type: 'meditation', params: { focus: 'reducir ansiedad', duration: '15 minutos' }},
  { agent: 'bolita-dj', type: 'nutrition', params: { goal: 'plan semanal alto en proteína bajo presupuesto' }},

  // GFlow — análisis financiero
  { agent: 'gflow', type: 'market-analysis', params: { symbol: 'AAPL', topic: 'Apple Inc análisis técnico' }},
  { agent: 'gflow', type: 'budget', params: { amount: '5000', topic: 'presupuesto freelancer México' }},
  { agent: 'gflow', type: 'crypto-brief', params: { symbol: 'BTC', topic: 'Bitcoin perspectiva Q2 2026' }},

  // Michi — documentos legales
  { agent: 'michi', type: 'contract-template', params: { type: 'servicios de desarrollo de software', jurisdiction: 'México' }},
  { agent: 'michi', type: 'terms-generator', params: { scope: 'plataforma SaaS de karaoke inteligente (ByFlow)' }},
  { agent: 'michi', type: 'legal-faq', params: { scope: '¿Cómo registrar propiedad intelectual de software en México?' }},

  // Robot DJ — marketing
  { agent: 'robot-dj', type: 'social-post', params: { platform: 'Instagram', product: 'ByFlow — karaoke inteligente', brand: 'ByFlow by IArtLabs' }},
  { agent: 'robot-dj', type: 'ad-copy', params: { platform: 'Facebook Ads', product: 'ByFlow PRO — karaoke para bares', brand: 'ByFlow' }},
  { agent: 'robot-dj', type: 'content-calendar', params: { weeks: '4', brand: 'ByFlow by IArtLabs', platform: 'Instagram, TikTok, YouTube' }},
  { agent: 'robot-dj', type: 'email-campaign', params: { product: 'Lanzamiento ByFlow v4.0 para bares y cantantes' }},
];

async function main() {
  console.log('\n🐝 COLMENA BYFLOW — Lanzamiento autónomo de agentes\n');

  // Init DB
  await initDb();

  // Provider info
  const provider = getProviderInfo();
  console.log(`🤖 Proveedor AI: ${provider.name} (${provider.model})\n`);

  // Init orchestrator
  const orch = new Orchestrator();
  orch.registerAgent(new ClipFlow());
  orch.registerAgent(new BolitaDJ());
  orch.registerAgent(new GFlow());
  orch.registerAgent(new Michi());
  orch.registerAgent(new RobotDJ());

  // Listen for completions
  let completed = 0;
  let totalEarnings = 0;
  orch.onEvent((event, data) => {
    if (event === 'task-complete') {
      completed++;
      totalEarnings += data.value || 0;
      const sim = data.result?.simulated ? ' [SIM]' : ' [REAL]';
      console.log(`  ✅ ${data.agentId} → $${data.value}${sim} (${completed}/${TASKS.length})`);

      // Mostrar preview del resultado
      const preview = (data.result?.content || '').slice(0, 120).replace(/\n/g, ' ');
      if (preview) console.log(`     📄 ${preview}...`);
    }
    if (event === 'task-failed') {
      completed++;
      console.log(`  ❌ ${data.agentId} FALLÓ: ${data.error}`);
    }
  });

  // Submit all tasks
  console.log(`📋 Enviando ${TASKS.length} tareas a los 5 agentes...\n`);

  for (const task of TASKS) {
    try {
      await orch.submitTask(task.agent, task.type, task.params);
    } catch (err) {
      console.error(`  ⚠️ Error enviando ${task.agent}/${task.type}: ${err.message}`);
    }
    // Pequeña pausa para no saturar la API
    await new Promise(r => setTimeout(r, 1500));
  }

  // Esperar a que terminen todas
  const waitForAll = () => new Promise(resolve => {
    const check = setInterval(() => {
      if (completed >= TASKS.length) {
        clearInterval(check);
        resolve();
      }
    }, 1000);
  });

  await waitForAll();

  // Resumen final
  const status = orch.getStatus();
  console.log('\n' + '='.repeat(60));
  console.log('🐝 COLMENA BYFLOW — RESUMEN DE PRODUCCIÓN');
  console.log('='.repeat(60));
  console.log(`✅ Tareas completadas: ${completed}`);
  console.log(`💰 Ingresos generados: $${totalEarnings.toFixed(2)}`);
  console.log(`   🎤 ArT-AtR (70%): $${(totalEarnings * 0.7).toFixed(2)}`);
  console.log(`   🏢 IArtLabs (20%): $${(totalEarnings * 0.2).toFixed(2)}`);
  console.log(`   ⚙️ Operativo (10%): $${(totalEarnings * 0.1).toFixed(2)}`);
  console.log('\nPor agente:');
  for (const a of status.agents) {
    console.log(`  ${a.emoji} ${a.name}: ${a.tasksCompleted} tareas → $${a.totalEarnings.toFixed(2)}`);
  }
  console.log('='.repeat(60));

  orch.shutdown();
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

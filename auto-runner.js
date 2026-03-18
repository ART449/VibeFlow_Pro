#!/usr/bin/env node
/**
 * Colmena ByFlow — Auto-Runner Autónomo
 * Corre rondas de agentes en loop mientras sea rentable
 * Usa GPU (Ollama local) como fallback para reducir costos
 *
 * Uso: node auto-runner.js [--rounds N] [--interval M] [--gpu-first]
 *
 * --rounds N      Número de rondas (default: infinito)
 * --interval M    Minutos entre rondas (default: 5)
 * --gpu-first     Usar Ollama local primero, Grok solo si falla
 */
require('dotenv').config();
const { initDb, getDb } = require('./core/db');
const Orchestrator = require('./core/orchestrator');
const { getProviderInfo } = require('./core/grok-client');

const ClipFlow = require('./agents/clip-flow');
const BolitaDJ = require('./agents/bolita-dj');
const GFlow = require('./agents/gflow');
const Michi = require('./agents/michi');
const RobotDJ = require('./agents/robot-dj');

// Parse args
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MAX_ROUNDS = getArg('--rounds', '0');
const INTERVAL_MIN = parseFloat(getArg('--interval', '5'));
const GPU_FIRST = args.includes('--gpu-first');

// Cost tracking
const GROK_COST_PER_TASK = 0.003; // ~$0.003 per 1500 token completion on grok-3-mini
let totalApiCost = 0;
let totalRevenue = 0;
let roundNum = 0;

// Tasks rotate — HEAVY on high-value tasks 🐝💰
const TASK_POOLS = {
  'clip-flow': [
    { type: 'study-guide', params: { topic: 'Machine Learning — redes neuronales', level: 'intermedio' }},
    { type: 'study-guide', params: { topic: 'Ciberseguridad para PyMEs', level: 'principiante' }},
    { type: 'study-guide', params: { topic: 'Data Science con Python', level: 'intermedio' }},
    { type: 'study-guide', params: { topic: 'DevOps y CI/CD — pipeline completo', level: 'avanzado' }},
    { type: 'study-guide', params: { topic: 'Diseño UX/UI para apps móviles', level: 'intermedio' }},
    { type: 'study-guide', params: { topic: 'Cloud Computing — AWS vs Azure vs GCP', level: 'avanzado' }},
    { type: 'flashcards', params: { topic: 'JavaScript moderno — ES2024 features' }},
    { type: 'flashcards', params: { topic: 'React y Next.js — conceptos clave' }},
    { type: 'flashcards', params: { topic: 'TypeScript avanzado — generics y utility types' }},
    { type: 'summary', params: { topic: 'Blockchain y Web3 para negocios', level: 'avanzado' }},
    { type: 'summary', params: { topic: 'Comercio electrónico — tendencias 2026', level: 'intermedio' }},
    { type: 'summary', params: { topic: 'Productividad con IA — herramientas clave', level: 'principiante' }},
  ],
  'bolita-dj': [
    { type: 'meditation', params: { focus: 'dormir mejor', duration: '20 minutos' }},
    { type: 'meditation', params: { focus: 'enfoque y concentración', duration: '10 minutos' }},
    { type: 'meditation', params: { focus: 'reducir ansiedad', duration: '15 minutos' }},
    { type: 'meditation', params: { focus: 'meditación matutina energizante', duration: '10 minutos' }},
    { type: 'routine', params: { goal: 'ganar músculo', duration: '45 minutos', level: 'avanzado' }},
    { type: 'routine', params: { goal: 'flexibilidad y movilidad', duration: '20 minutos', level: 'principiante' }},
    { type: 'routine', params: { goal: 'HIIT quema grasa', duration: '30 minutos', level: 'intermedio' }},
    { type: 'routine', params: { goal: 'yoga para principiantes', duration: '25 minutos', level: 'principiante' }},
    { type: 'nutrition', params: { goal: 'dieta keto para principiantes' }},
    { type: 'nutrition', params: { goal: 'meal prep semanal vegano' }},
    { type: 'nutrition', params: { goal: 'plan alimenticio para ganar masa muscular' }},
    { type: 'nutrition', params: { goal: 'snacks saludables para oficina' }},
  ],
  'gflow': [
    { type: 'market-analysis', params: { symbol: 'NVDA', topic: 'NVIDIA análisis técnico' }},
    { type: 'market-analysis', params: { symbol: 'MSFT', topic: 'Microsoft análisis fundamental' }},
    { type: 'market-analysis', params: { symbol: 'AAPL', topic: 'Apple valoración y dividendos' }},
    { type: 'market-analysis', params: { symbol: 'TSLA', topic: 'Tesla perspectiva 2026' }},
    { type: 'market-analysis', params: { symbol: 'AMZN', topic: 'Amazon AWS y e-commerce' }},
    { type: 'market-analysis', params: { symbol: 'META', topic: 'Meta IA y metaverso' }},
    { type: 'budget', params: { amount: '3000', topic: 'presupuesto estudiante universitario' }},
    { type: 'budget', params: { amount: '8000', topic: 'presupuesto familia pequeña México' }},
    { type: 'budget', params: { amount: '15000', topic: 'presupuesto freelancer tech' }},
    { type: 'crypto-brief', params: { symbol: 'ETH', topic: 'Ethereum perspectiva 2026' }},
    { type: 'crypto-brief', params: { symbol: 'SOL', topic: 'Solana ecosistema DeFi' }},
    { type: 'crypto-brief', params: { symbol: 'BTC', topic: 'Bitcoin post-halving análisis' }},
  ],
  'michi': [
    { type: 'contract-template', params: { type: 'freelance diseño gráfico', jurisdiction: 'México' }},
    { type: 'contract-template', params: { type: 'arrendamiento de local comercial', jurisdiction: 'México' }},
    { type: 'contract-template', params: { type: 'desarrollo de software a medida', jurisdiction: 'México' }},
    { type: 'contract-template', params: { type: 'consultoría empresarial', jurisdiction: 'México' }},
    { type: 'contract-template', params: { type: 'licencia de uso de software SaaS', jurisdiction: 'Internacional' }},
    { type: 'contract-template', params: { type: 'NDA para startups tech', jurisdiction: 'México' }},
    { type: 'terms-generator', params: { scope: 'app de fitness con suscripción mensual' }},
    { type: 'terms-generator', params: { scope: 'marketplace de servicios creativos' }},
    { type: 'terms-generator', params: { scope: 'plataforma e-learning con cursos de pago' }},
    { type: 'terms-generator', params: { scope: 'app de delivery de alimentos' }},
    { type: 'legal-faq', params: { scope: '¿Cómo facturar como freelancer en México?' }},
    { type: 'legal-faq', params: { scope: '¿Qué es el aviso de privacidad y cómo redactarlo?' }},
  ],
  'robot-dj': [
    { type: 'content-calendar', params: { weeks: '2', brand: 'IArtLabs', platform: 'LinkedIn, Twitter' }},
    { type: 'content-calendar', params: { weeks: '4', brand: 'ByFlow', platform: 'TikTok, Instagram, YouTube' }},
    { type: 'content-calendar', params: { weeks: '2', brand: 'Colmena ByFlow', platform: 'Twitter, Reddit' }},
    { type: 'email-campaign', params: { product: 'ByFlow PRO — karaoke inteligente para eventos' }},
    { type: 'email-campaign', params: { product: 'Colmena ByFlow — gana dinero con agentes IA' }},
    { type: 'email-campaign', params: { product: 'IArtLabs Studio — crea música con IA' }},
    { type: 'ad-copy', params: { platform: 'Google Ads', product: 'Colmena ByFlow — ingresos con IA', brand: 'IArtLabs' }},
    { type: 'ad-copy', params: { platform: 'Instagram Ads', product: 'ByFlow Estudio — escribe tus rimas', brand: 'ByFlow' }},
    { type: 'ad-copy', params: { platform: 'Facebook Ads', product: 'ByFlow — karaoke inteligente', brand: 'ByFlow' }},
    { type: 'social-post', params: { platform: 'TikTok', product: 'ByFlow — canta como pro', brand: 'ByFlow' }},
    { type: 'social-post', params: { platform: 'YouTube Shorts', product: 'ByFlow — tu DJ personal', brand: 'ByFlow' }},
    { type: 'social-post', params: { platform: 'LinkedIn', product: 'IArtLabs — automatización con IA', brand: 'IArtLabs' }},
  ]
};

const TASKS_PER_AGENT = parseInt(getArg('--tasks', '5'));

function getTasksForRound(roundIdx) {
  const tasks = [];
  for (const [agentId, pool] of Object.entries(TASK_POOLS)) {
    // Rotate through pool based on round number
    const offset = (roundIdx * TASKS_PER_AGENT) % pool.length;
    for (let i = 0; i < TASKS_PER_AGENT; i++) {
      const idx = (offset + i) % pool.length;
      tasks.push({ agent: agentId, ...pool[idx] });
    }
  }
  return tasks;
}

async function runRound(roundIdx) {
  const tasks = getTasksForRound(roundIdx);

  await initDb();
  const orch = new Orchestrator();
  orch.registerAgent(new ClipFlow());
  orch.registerAgent(new BolitaDJ());
  orch.registerAgent(new GFlow());
  orch.registerAgent(new Michi());
  orch.registerAgent(new RobotDJ());

  let completed = 0;
  let roundEarnings = 0;
  let roundCost = 0;

  return new Promise((resolve) => {
    let resolved = false;
    orch.onEvent((event, data) => {
      if (resolved) return;
      if (event === 'task-complete') {
        completed++;
        const val = data.value || 0;
        roundEarnings += val;
        const sim = data.result?.simulated ? ' [SIM]' : ' [REAL]';
        const cost = data.result?.simulated ? 0 : GROK_COST_PER_TASK;
        roundCost += cost;
        console.log(`  ✅ ${data.agentId} → $${val}${sim} (${completed}/${tasks.length})`);
      }
      if (event === 'task-failed') {
        completed++;
        console.log(`  ❌ ${data.agentId} FALLÓ: ${data.error}`);
      }

      // Check if all done
      if (completed >= tasks.length && !resolved) {
        resolved = true;
        totalRevenue += roundEarnings;
        totalApiCost += roundCost;

        console.log(`\n  📊 Ronda ${roundIdx + 1}: $${roundEarnings.toFixed(2)} ganado, ~$${roundCost.toFixed(4)} costo API`);
        console.log(`  📈 Acumulado: $${totalRevenue.toFixed(2)} ganado, ~$${totalApiCost.toFixed(4)} costo`);
        console.log(`  💰 Profit: $${(totalRevenue - totalApiCost).toFixed(2)}`);

        // Delay shutdown to let pending DB writes finish
        setTimeout(() => {
          orch.shutdown();
          resolve({ earnings: roundEarnings, cost: roundCost });
        }, 2000);
      }
    });

    // Submit all
    (async () => {
      for (const task of tasks) {
        try {
          await orch.submitTask(task.agent, task.type, task.params);
        } catch (err) {
          console.error(`  ⚠️ Error: ${task.agent}/${task.type}: ${err.message}`);
          completed++;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
    })();
  });
}

async function main() {
  console.log('\n🐝 COLMENA BYFLOW — AUTO-RUNNER AUTÓNOMO');
  console.log('=========================================');
  console.log(`⏱️  Intervalo: ${INTERVAL_MIN} minutos`);
  console.log(`🎯 Rondas: ${MAX_ROUNDS === '0' ? 'infinito (hasta que no sea rentable)' : MAX_ROUNDS}`);
  console.log(`🖥️  GPU-first: ${GPU_FIRST ? 'SÍ (Ollama local)' : 'NO (Grok primero)'}`);

  const provider = getProviderInfo();
  console.log(`🤖 Proveedor: ${provider.name} (${provider.model})\n`);

  const maxRounds = parseInt(MAX_ROUNDS) || Infinity;

  for (let i = 0; i < maxRounds; i++) {
    roundNum = i + 1;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔄 RONDA ${roundNum} — ${new Date().toLocaleString('es-MX')}`);
    console.log('='.repeat(50));

    try {
      const result = await runRound(i);

      // Check profitability: if cost > 50% of earnings, warn
      if (result.cost > result.earnings * 0.5 && result.earnings > 0) {
        console.log(`\n⚠️ ALERTA: Costo API (${result.cost.toFixed(4)}) > 50% de ganancias`);
        console.log('  Considera usar --gpu-first para reducir costos');
      }

      // If earnings are 0 for 3 consecutive rounds, stop
      if (result.earnings === 0) {
        console.log('\n⛔ Sin ingresos esta ronda. Verifica configuración.');
      }

    } catch (err) {
      console.error(`\n❌ Error en ronda ${roundNum}:`, err.message);
    }

    if (i < maxRounds - 1) {
      console.log(`\n⏳ Siguiente ronda en ${INTERVAL_MIN} minutos...`);
      console.log(`   (Ctrl+C para detener)`);
      await new Promise(r => setTimeout(r, INTERVAL_MIN * 60 * 1000));
    }
  }

  console.log('\n🏁 AUTO-RUNNER FINALIZADO');
  console.log(`   Total ganado: $${totalRevenue.toFixed(2)}`);
  console.log(`   Total costo API: ~$${totalApiCost.toFixed(4)}`);
  console.log(`   Profit neto: $${(totalRevenue - totalApiCost).toFixed(2)}`);
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Deteniendo auto-runner...');
  console.log(`   Rondas completadas: ${roundNum}`);
  console.log(`   Total ganado: $${totalRevenue.toFixed(2)}`);
  console.log(`   Costo API: ~$${totalApiCost.toFixed(4)}`);
  console.log(`   Profit: $${(totalRevenue - totalApiCost).toFixed(2)}`);
  process.exit(0);
});

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});

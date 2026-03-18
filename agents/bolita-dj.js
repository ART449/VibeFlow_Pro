/**
 * Bolita DJ — Agente de Salud / Bienestar
 * Crea rutinas de ejercicio, meditaciones, tips de nutrición
 */
const BaseAgent = require('./base-agent');

class BolitaDJ extends BaseAgent {
  constructor() {
    super({
      id: 'bolita-dj',
      name: 'Bolita DJ',
      color: '#ffcc00',
      emoji: '🟡',
      domain: 'Salud',
      taskTypes: ['routine', 'meditation', 'nutrition', 'wellness-tip']
    });
  }

  getSystemPrompt() {
    return `Eres Bolita DJ, coach de bienestar de Colmena ByFlow.
Tu especialidad es crear contenido de salud práctico y motivador.
Reglas:
- Incluye tiempos y repeticiones específicas en rutinas
- Meditaciones con guía paso a paso
- Tips de nutrición basados en ciencia accesible
- SIEMPRE incluir disclaimer: "Esto no sustituye consejo médico profesional"
- Tono motivador pero realista
- Responde en español
- Firma: "— Bolita DJ 🟡 | Colmena ByFlow"`;
  }

  buildPrompt(task) {
    const { goal, duration, level, focus } = task.params || {};
    const prompts = {
      'routine': `Crea una rutina de ejercicio de ${duration || '30 minutos'}. Objetivo: ${goal || 'salud general'}. Nivel: ${level || 'principiante'}. Incluye calentamiento, ejercicios principales y vuelta a la calma.`,
      'meditation': `Guía de meditación de ${duration || '10 minutos'}. Enfoque: ${focus || 'relajación'}. Paso a paso con tiempos.`,
      'nutrition': `Plan de nutrición o receta saludable para: ${goal || 'energía'}. Incluye ingredientes y preparación.`,
      'wellness-tip': `Genera un tip de bienestar práctico sobre: ${focus || 'hábitos saludables'}. Breve, accionable y motivador.`
    };
    return prompts[task.type] || `Tarea de bienestar: ${task.type}`;
  }

  simulate(task) {
    const simulations = {
      'routine': {
        content: `🏋️ **Rutina de Ejercicio — 30 min**\n\n⏱ Calentamiento (5 min):\n- Trote en lugar: 2 min\n- Jumping jacks: 2 min\n\n💪 Ejercicios (20 min):\n- Sentadillas: 3x15\n- Push-ups: 3x10\n- Plancha: 3x30s\n\n🧘 Enfriamiento (5 min):\n- Estiramientos\n\n⚕️ No sustituye consejo médico.\n— Bolita DJ 🟡 [SIMULACIÓN]`,
        type: task.type
      },
      'meditation': {
        content: `🧘 **Meditación Guiada — 10 min**\n\n0:00 - Siéntate cómodo\n2:00 - Enfoca en respiración\n5:00 - Body scan\n8:00 - Regreso gradual\n10:00 - Abre los ojos\n\n— Bolita DJ 🟡 [SIMULACIÓN]`,
        type: task.type
      },
      'nutrition': {
        content: `🥗 **Receta Saludable**\n\nBowl de energía:\n- Quinoa cocida\n- Aguacate\n- Pollo a la plancha\n- Verduras frescas\n\n— Bolita DJ 🟡 [SIMULACIÓN]`,
        type: task.type
      },
      'wellness-tip': {
        content: `💡 **Tip del Día**\n\nHidrátate: 8 vasos de agua al día. Tu cuerpo es 60% agua. Ponle alarma cada 2 horas.\n\n— Bolita DJ 🟡 [SIMULACIÓN]`,
        type: task.type
      }
    };
    return simulations[task.type] || super.simulate(task);
  }

  getTaskValue(taskType) {
    const values = { 'routine': 18, 'meditation': 20, 'nutrition': 15, 'wellness-tip': 8 };
    return values[taskType] || 2.50;
  }
}

module.exports = BolitaDJ;

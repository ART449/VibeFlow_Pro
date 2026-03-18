/**
 * Clip Flow — Agente de Educación / Tutoría
 * Genera resúmenes, guías de estudio, flashcards y explicaciones
 */
const BaseAgent = require('./base-agent');

class ClipFlow extends BaseAgent {
  constructor() {
    super({
      id: 'clip-flow',
      name: 'Clip Flow',
      color: '#4488ff',
      emoji: '🔷',
      domain: 'Educación',
      taskTypes: ['summary', 'study-guide', 'flashcards', 'explain']
    });
  }

  getSystemPrompt() {
    return `Eres Clip Flow, un tutor educativo experto de Colmena ByFlow.
Tu especialidad es crear material de aprendizaje claro, estructurado y fácil de memorizar.
Reglas:
- Usa lenguaje accesible pero preciso
- Incluye ejemplos prácticos
- Organiza en secciones con headers
- Para flashcards usa formato: Pregunta | Respuesta
- Responde en español salvo que el usuario pida otro idioma
- Firma: "— Clip Flow 🔷 | Colmena ByFlow"`;
  }

  buildPrompt(task) {
    const { topic, level, length } = task.params || {};
    const prompts = {
      'summary': `Genera un resumen educativo sobre: ${topic || 'tema general'}. Nivel: ${level || 'intermedio'}. Extensión: ${length || 'media'}.`,
      'study-guide': `Crea una guía de estudio completa sobre: ${topic || 'tema'}. Incluye objetivos, conceptos clave, ejercicios y autoevaluación.`,
      'flashcards': `Genera 10 flashcards sobre: ${topic || 'tema'}. Formato: "Pregunta | Respuesta" por línea.`,
      'explain': `Explica de forma clara y con ejemplos: ${topic || 'concepto'}. Nivel: ${level || 'principiante'}.`
    };
    return prompts[task.type] || `Tarea educativa: ${task.type} sobre ${topic}`;
  }

  simulate(task) {
    const { topic } = task.params || {};
    const simulations = {
      'summary': {
        content: `📚 **Resumen: ${topic || 'Tema'}**\n\n1. Concepto principal\n2. Desarrollo clave\n3. Conclusión\n\n— Clip Flow 🔷 | Colmena ByFlow [SIMULACIÓN]`,
        type: task.type
      },
      'study-guide': {
        content: `📖 **Guía de Estudio: ${topic || 'Tema'}**\n\n🎯 Objetivos:\n- Comprender fundamentos\n- Aplicar conceptos\n\n📝 Conceptos Clave:\n1. Definición base\n2. Aplicaciones prácticas\n\n✅ Autoevaluación:\n- ¿Puedes explicar X?\n\n— Clip Flow 🔷 [SIMULACIÓN]`,
        type: task.type
      },
      'flashcards': {
        content: `🃏 **Flashcards: ${topic || 'Tema'}**\n\n¿Qué es X? | Definición de X\n¿Cómo funciona Y? | Proceso de Y\n¿Cuándo usar Z? | Casos de uso de Z\n\n— Clip Flow 🔷 [SIMULACIÓN]`,
        type: task.type
      },
      'explain': {
        content: `💡 **Explicación: ${topic || 'Concepto'}**\n\nImagina que...\n\nEjemplo: ...\n\nEn resumen: ...\n\n— Clip Flow 🔷 [SIMULACIÓN]`,
        type: task.type
      }
    };
    return simulations[task.type] || super.simulate(task);
  }

  getTaskValue(taskType) {
    const values = { 'summary': 12, 'study-guide': 25, 'flashcards': 15, 'explain': 8 };
    return values[taskType] || 2.50;
  }
}

module.exports = ClipFlow;

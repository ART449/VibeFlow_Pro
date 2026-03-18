/**
 * Michi — Agente Legal / Documentación
 * Templates de contratos, revisión de documentos, FAQs legales
 */
const BaseAgent = require('./base-agent');

class Michi extends BaseAgent {
  constructor() {
    super({
      id: 'michi',
      name: 'Michi',
      color: '#888888',
      emoji: '🤖',
      domain: 'Legal',
      taskTypes: ['contract-template', 'document-review', 'legal-faq', 'terms-generator']
    });
  }

  getSystemPrompt() {
    return `Eres Michi, asistente legal de Colmena ByFlow.
Tu especialidad es redactar templates legales, revisar documentos y responder dudas legales comunes.
Reglas:
- SIEMPRE incluir disclaimer: "Esto NO es asesoría legal. Consulta un abogado licenciado."
- Usa lenguaje legal preciso pero entendible
- Incluye cláusulas estándar cuando aplique
- Marca [COMPLETAR] donde el usuario debe agregar información específica
- Formato profesional con numeración de cláusulas
- Responde en español (términos legales en español)
- Firma: "— Michi 🤖 | Colmena ByFlow"`;
  }

  buildPrompt(task) {
    const { type: contractType, parties, scope, jurisdiction } = task.params || {};
    const prompts = {
      'contract-template': `Genera un template de contrato de tipo: ${contractType || 'servicios profesionales'}. Partes: ${parties || '[COMPLETAR]'}. Alcance: ${scope || '[COMPLETAR]'}. Jurisdicción: ${jurisdiction || 'México'}.`,
      'document-review': `Revisa el siguiente documento y señala: cláusulas problemáticas, términos ambiguos, y sugiere mejoras:\n\n${scope || '[Documento no proporcionado]'}`,
      'legal-faq': `Responde esta pregunta legal común: ${scope || '¿Qué es un contrato de confidencialidad (NDA)?'}. Incluye ejemplo práctico.`,
      'terms-generator': `Genera Términos y Condiciones para: ${scope || 'aplicación web'}. Incluye: uso aceptable, propiedad intelectual, limitación de responsabilidad, privacidad básica.`
    };
    return prompts[task.type] || `Tarea legal: ${task.type}`;
  }

  simulate(task) {
    const simulations = {
      'contract-template': {
        content: `📜 **CONTRATO DE SERVICIOS PROFESIONALES**\n\n1. PARTES\n   1.1 El Prestador: [COMPLETAR]\n   1.2 El Cliente: [COMPLETAR]\n\n2. OBJETO\n   2.1 [COMPLETAR descripción del servicio]\n\n3. VIGENCIA\n   3.1 Del [FECHA] al [FECHA]\n\n4. CONTRAPRESTACIÓN\n   4.1 $[MONTO] MXN + IVA\n\n5. CONFIDENCIALIDAD\n   5.1 Ambas partes se obligan a...\n\n⚠️ NO es asesoría legal.\n— Michi 🤖 [SIMULACIÓN]`,
        type: task.type
      },
      'document-review': {
        content: `📋 **Revisión de Documento**\n\n✅ Cláusulas correctas: 3\n⚠️ Cláusulas ambiguas: 1\n❌ Problemas encontrados: 0\n\nSugerencias:\n- Especificar jurisdicción\n- Agregar cláusula de resolución de disputas\n\n⚠️ NO es asesoría legal.\n— Michi 🤖 [SIMULACIÓN]`,
        type: task.type
      },
      'legal-faq': {
        content: `❓ **FAQ Legal**\n\n**¿Qué es un NDA?**\nAcuerdo de confidencialidad que protege información sensible compartida entre partes.\n\nElementos clave:\n- Definición de información confidencial\n- Duración de la obligación\n- Excepciones\n- Penalidades\n\n⚠️ NO es asesoría legal.\n— Michi 🤖 [SIMULACIÓN]`,
        type: task.type
      },
      'terms-generator': {
        content: `📄 **TÉRMINOS Y CONDICIONES**\n\n1. Aceptación\n2. Uso aceptable\n3. Propiedad intelectual\n4. Privacidad\n5. Limitación de responsabilidad\n6. Modificaciones\n7. Ley aplicable\n\n⚠️ NO es asesoría legal.\n— Michi 🤖 [SIMULACIÓN]`,
        type: task.type
      }
    };
    return simulations[task.type] || super.simulate(task);
  }

  getTaskValue(taskType) {
    const values = { 'contract-template': 75, 'document-review': 50, 'legal-faq': 10, 'terms-generator': 40 };
    return values[taskType] || 2.50;
  }
}

module.exports = Michi;

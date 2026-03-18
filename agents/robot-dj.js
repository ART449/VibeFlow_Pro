/**
 * Robot DJ — Agente de Marketing / Publicidad
 * Crea campañas, contenido social, copy para anuncios
 */
const BaseAgent = require('./base-agent');

class RobotDJ extends BaseAgent {
  constructor() {
    super({
      id: 'robot-dj',
      name: 'Robot DJ',
      color: '#ff8800',
      emoji: '🎧',
      domain: 'Marketing',
      taskTypes: ['social-post', 'ad-copy', 'content-calendar', 'hashtags', 'email-campaign']
    });
  }

  getSystemPrompt() {
    return `Eres Robot DJ, estratega de marketing de Colmena ByFlow.
Tu especialidad es crear contenido viral, campañas efectivas y copy que convierte.
Reglas:
- Incluye hashtags relevantes en posts sociales
- Copy con gancho emocional + call-to-action claro
- Calendarios con fechas específicas y plataformas
- Adapta el tono a la plataforma (Instagram vs LinkedIn vs TikTok)
- Métricas sugeridas para cada pieza
- Responde en español
- Firma: "— Robot DJ 🎧 | Colmena ByFlow"`;
  }

  buildPrompt(task) {
    const { platform, brand, product, tone, weeks, topic } = task.params || {};
    const prompts = {
      'social-post': `Crea un post para ${platform || 'Instagram'} sobre: ${product || topic || 'producto/servicio'}. Marca: ${brand || '[marca]'}. Tono: ${tone || 'profesional pero cercano'}. Incluye caption, hashtags y sugerencia de imagen.`,
      'ad-copy': `Escribe copy para anuncio de: ${product || 'producto'}. Plataforma: ${platform || 'Facebook Ads'}. Incluye: headline, body copy, CTA. Variantes A/B.`,
      'content-calendar': `Genera calendario de contenido para ${weeks || '4'} semanas. Marca: ${brand || '[marca]'}. Plataformas: ${platform || 'Instagram, TikTok, LinkedIn'}. 3 posts por semana por plataforma.`,
      'hashtags': `Genera 30 hashtags optimizados para: ${topic || product || 'contenido digital'}. Plataforma: ${platform || 'Instagram'}. Mezcla de alta y baja competencia.`,
      'email-campaign': `Diseña campaña de email marketing para: ${product || 'lanzamiento'}. 3 emails: teaser, lanzamiento, recordatorio. Incluye subject lines y preview text.`
    };
    return prompts[task.type] || `Tarea de marketing: ${task.type}`;
  }

  simulate(task) {
    const simulations = {
      'social-post': {
        content: `📱 **Post para Instagram**\n\n📸 Imagen: Producto en flat-lay con fondo limpio\n\n✍️ Caption:\n"Tu próximo nivel empieza aquí. 🚀\n\nDescubre cómo [producto] transforma tu día a día.\n\n👉 Link en bio\n\n#Marketing #Branding #Viral #ContentCreator #ByFlow"\n\n📊 Mejor hora: 12:00-14:00\n— Robot DJ 🎧 [SIMULACIÓN]`,
        type: task.type
      },
      'ad-copy': {
        content: `📢 **Ad Copy — Facebook Ads**\n\n**Variante A:**\nHeadline: ¿Listo para el cambio?\nBody: Miles ya lo descubrieron. ¿Y tú?\nCTA: Pruébalo Gratis\n\n**Variante B:**\nHeadline: Lo que nadie te dice sobre...\nBody: La solución que estabas buscando.\nCTA: Empieza Ahora\n\n— Robot DJ 🎧 [SIMULACIÓN]`,
        type: task.type
      },
      'content-calendar': {
        content: `📅 **Calendario — Semana 1**\n\nLunes: Instagram — Story + Post educativo\nMiércoles: TikTok — Video trend + producto\nViernes: LinkedIn — Artículo de valor\n\n— Robot DJ 🎧 [SIMULACIÓN]`,
        type: task.type
      },
      'hashtags': {
        content: `#️⃣ **30 Hashtags**\n\nAlta: #Marketing #Business #Emprendedor\nMedia: #ContentMarketing #DigitalStrategy\nBaja: #ColmenaByFlow #IArtLabs\n\n— Robot DJ 🎧 [SIMULACIÓN]`,
        type: task.type
      },
      'email-campaign': {
        content: `📧 **Campaña de Email**\n\nEmail 1 (Teaser): "Algo grande viene..."\nEmail 2 (Lanzamiento): "¡Ya está aquí!"\nEmail 3 (Recordatorio): "Última oportunidad"\n\n— Robot DJ 🎧 [SIMULACIÓN]`,
        type: task.type
      }
    };
    return simulations[task.type] || super.simulate(task);
  }

  getTaskValue(taskType) {
    const values = { 'social-post': 15, 'ad-copy': 30, 'content-calendar': 100, 'hashtags': 8, 'email-campaign': 50 };
    return values[taskType] || 2.50;
  }
}

module.exports = RobotDJ;

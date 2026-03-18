/**
 * Colmena ByFlow — Configuración de los 5 agentes + flotillas
 */

const AGENT_CONFIGS = [
  {
    id: 'clip-flow',
    name: 'Clip Flow',
    color: 0x4488ff,
    accentColor: 0x2266cc,
    emoji: '🔷',
    accessory: 'glasses',
    position: { x: -3, z: 0 },
    botCount: 3  // Flotilla: 3 bots
  },
  {
    id: 'bolita-dj',
    name: 'Bolita DJ',
    color: 0xffcc00,
    accentColor: 0xdd9900,
    emoji: '🟡',
    accessory: 'cap',
    position: { x: -1.5, z: 0 },
    botCount: 3
  },
  {
    id: 'gflow',
    name: 'GFlow',
    color: 0x8b5cf6,
    accentColor: 0x6d28d9,
    emoji: '🎧',
    accessory: 'headphones',
    position: { x: 0, z: 0 },
    botCount: 4  // GFlow tiene más bots (finanzas = más tareas)
  },
  {
    id: 'michi',
    name: 'Michi',
    color: 0x888888,
    accentColor: 0x555555,
    emoji: '🤖',
    accessory: 'hat',
    position: { x: 1.5, z: 0 },
    botCount: 3
  },
  {
    id: 'robot-dj',
    name: 'Robot DJ',
    color: 0xff8800,
    accentColor: 0xcc6600,
    emoji: '🎧',
    accessory: 'antenna',
    position: { x: 3, z: 0 },
    botCount: 3
  }
];

if (typeof module !== 'undefined') module.exports = { AGENT_CONFIGS };
if (typeof window !== 'undefined') window.AgentAvatars = { AGENT_CONFIGS };

/**
 * Colmena ByFlow — Logger estructurado
 */
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.info;

function formatMsg(level, source, message, data) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] [${source}] ${message}`;
  return data ? `${base} ${JSON.stringify(data)}` : base;
}

function createLogger(source) {
  return Object.freeze({
    debug(msg, data) {
      if (CURRENT_LEVEL <= LOG_LEVELS.debug) console.log(formatMsg('debug', source, msg, data));
    },
    info(msg, data) {
      if (CURRENT_LEVEL <= LOG_LEVELS.info) console.log(formatMsg('info', source, msg, data));
    },
    warn(msg, data) {
      if (CURRENT_LEVEL <= LOG_LEVELS.warn) console.warn(formatMsg('warn', source, msg, data));
    },
    error(msg, data) {
      if (CURRENT_LEVEL <= LOG_LEVELS.error) console.error(formatMsg('error', source, msg, data));
    }
  });
}

module.exports = { createLogger };

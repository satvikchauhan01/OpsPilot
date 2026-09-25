const pino = require('pino');

module.exports = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: process.env.SERVICE, version: process.env.APP_VERSION },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // "level":"error" is easier to filter on in Loki than pino's numeric levels
    level: (label) => ({ level: label }),
  },
});

const config = require('./config');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = levels[config.logLevel] || levels.info;

function formatMessage(level, ...args) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${args.join(' ')}`;
}

const logger = {
  error: (...args) => {
    if (currentLevel >= levels.error) {
      console.error(formatMessage('error', ...args));
    }
  },
  warn: (...args) => {
    if (currentLevel >= levels.warn) {
      console.warn(formatMessage('warn', ...args));
    }
  },
  info: (...args) => {
    if (currentLevel >= levels.info) {
      console.log(formatMessage('info', ...args));
    }
  },
  debug: (...args) => {
    if (currentLevel >= levels.debug) {
      console.log(formatMessage('debug', ...args));
    }
  }
};

module.exports = logger;

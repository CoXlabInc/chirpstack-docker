const config = require('./config');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Kept in memory for the web UI's live log view and status page
const MAX_LINES = 2000;
const MAX_ERRORS = 20;
const lines = [];
const errors = [];
const listeners = new Set();

// Read on every call so a log level changed from the web UI applies right away
function currentLevel() {
  return levels[config.logLevel] ?? levels.info;
}

function formatMessage(level, ...args) {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level.toUpperCase()}] ${args.join(' ')}`;
}

function emit(level, write, args) {
  if (currentLevel() < levels[level]) {
    return;
  }
  const line = formatMessage(level, ...args);
  write(line);

  lines.push(line);
  if (lines.length > MAX_LINES) {
    lines.shift();
  }
  if (level === 'error') {
    errors.push(line);
    if (errors.length > MAX_ERRORS) {
      errors.shift();
    }
  }
  for (const listener of listeners) {
    listener(line);
  }
}

const logger = {
  error: (...args) => emit('error', console.error, args),
  warn: (...args) => emit('warn', console.warn, args),
  info: (...args) => emit('info', console.log, args),
  debug: (...args) => emit('debug', console.log, args),

  recentLines: (count) => lines.slice(-count),
  recentErrors: () => errors.slice(),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

module.exports = logger;

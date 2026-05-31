/**
 * logger.js — Lightweight structured console logger.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS = {
  debug: '\x1b[90m',   // gray
  info:  '\x1b[36m',   // cyan
  warn:  '\x1b[33m',   // yellow
  error: '\x1b[31m',   // red
  reset: '\x1b[0m',
};

const LOG_LEVEL = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function log(level, step, message, meta = null) {
  if (LEVELS[level] < LOG_LEVEL) return;
  const ts  = new Date().toISOString();
  const col = COLORS[level];
  const rst = COLORS.reset;
  const tag = `[${level.toUpperCase()}]`.padEnd(7);
  const src = step ? `[${step}]` : '';
  const suffix = meta ? `  ${JSON.stringify(meta)}` : '';
  console.log(`${col}${ts} ${tag}${rst} ${src} ${message}${suffix}`);
}

export const logger = {
  debug: (step, msg, meta) => log('debug', step, msg, meta),
  info:  (step, msg, meta) => log('info',  step, msg, meta),
  warn:  (step, msg, meta) => log('warn',  step, msg, meta),
  error: (step, msg, meta) => log('error', step, msg, meta),
};

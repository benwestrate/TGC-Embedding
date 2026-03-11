/**
 * logger.ts — minimal structured logger with ISO timestamps.
 *
 * Writes to stdout (info/debug) and stderr (warn/error) so that
 * the monitor process can suppress pipeline noise by redirecting stderr.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Honour LOG_LEVEL env var; default to 'info'
const currentLevel: LogLevel =
  (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const metaStr = meta !== undefined ? ' ' + JSON.stringify(meta) : '';
  return `[${ts}] [${level.toUpperCase().padEnd(5)}] ${message}${metaStr}`;
}

const logger = {
  debug(message: string, meta?: unknown): void {
    if (shouldLog('debug')) process.stdout.write(format('debug', message, meta) + '\n');
  },

  info(message: string, meta?: unknown): void {
    if (shouldLog('info')) process.stdout.write(format('info', message, meta) + '\n');
  },

  warn(message: string, meta?: unknown): void {
    if (shouldLog('warn')) process.stderr.write(format('warn', message, meta) + '\n');
  },

  error(message: string, meta?: unknown): void {
    if (shouldLog('error')) process.stderr.write(format('error', message, meta) + '\n');
  },
};

export default logger;

/**
 * Structured logger for server-side operations
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, data?: unknown) {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level}]`;

  if (data !== undefined) {
    if (data instanceof Error) {
      console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
        `${prefix} ${message}`,
        { error: data.message, stack: data.stack }
      );
    } else {
      console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
        `${prefix} ${message}`,
        data
      );
    }
  } else {
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
      `${prefix} ${message}`
    );
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (process.env.NODE_ENV === 'development') {
      log('DEBUG', message, data);
    }
  },
  info: (message: string, data?: unknown) => log('INFO', message, data),
  warn: (message: string, data?: unknown) => log('WARN', message, data),
  error: (message: string, data?: unknown) => log('ERROR', message, data),
};

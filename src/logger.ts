type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  installationId?: number;
  repo?: string;
  pr?: number;
  jobId?: number;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): number {
  const level = (process.env.LOG_LEVEL as LogLevel) || "info";
  return LOG_LEVELS[level] ?? 1;
}

function formatLog(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (getMinLevel() <= LOG_LEVELS.debug) {
      console.debug(formatLog("debug", message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (getMinLevel() <= LOG_LEVELS.info) {
      console.log(formatLog("info", message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    if (getMinLevel() <= LOG_LEVELS.warn) {
      console.warn(formatLog("warn", message, context));
    }
  },

  error(message: string, context?: LogContext): void {
    if (getMinLevel() <= LOG_LEVELS.error) {
      console.error(formatLog("error", message, context));
    }
  },

  withContext(defaultContext: LogContext) {
    return {
      debug: (message: string, context?: LogContext) =>
        logger.debug(message, { ...defaultContext, ...context }),
      info: (message: string, context?: LogContext) =>
        logger.info(message, { ...defaultContext, ...context }),
      warn: (message: string, context?: LogContext) =>
        logger.warn(message, { ...defaultContext, ...context }),
      error: (message: string, context?: LogContext) =>
        logger.error(message, { ...defaultContext, ...context }),
    };
  },
};

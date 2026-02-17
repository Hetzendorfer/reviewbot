export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts || !shouldRetry(err)) {
        throw err;
      }

      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const retryablePatterns = [
    "rate limit",
    "timeout",
    "econnreset",
    "econnrefused",
    "socket hang up",
    "503",
    "502",
    "429",
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

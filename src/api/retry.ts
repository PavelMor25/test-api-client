import { ApiHttpError } from "./errors.js";

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 300,
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = (): void => {
      clearTimeout(timeoutId);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiHttpError) {
    return error.status >= 500;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }

  return error instanceof Error && error.name === "NetworkError";
}

function getRetryDelay(baseDelay: number, attempt: number): number {
  return baseDelay * 2 ** (attempt - 1);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  signal?: AbortSignal,
): Promise<T> {
  const { maxAttempts, baseDelay } = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(getRetryDelay(baseDelay, attempt), signal);
    }
  }

  throw lastError;
}

import type { ZodError } from "zod";

export class ApiHttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly details?: unknown;

  constructor(status: number, url: string, details?: unknown) {
    super(`HTTP ${status} error for ${url}`);
    this.name = "ApiHttpError";
    this.status = status;
    this.url = url;
    this.details = details;
  }
}

export class ApiValidationError extends Error {
  readonly url: string;
  readonly zodError: ZodError;

  constructor(url: string, zodError: ZodError) {
    super(`Response validation failed for ${url}`);
    this.name = "ApiValidationError";
    this.url = url;
    this.zodError = zodError;
  }
}

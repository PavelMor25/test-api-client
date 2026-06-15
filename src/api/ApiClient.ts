import type { ZodType, z } from "zod";
import { InMemoryCache } from "./cache.js";
import { ApiHttpError, ApiValidationError } from "./errors.js";
import { serializeQueryParams, validateAndSerializeQuery } from "./query.js";
import { withRetry, type RetryOptions } from "./retry.js";

export interface ApiClientOptions {
  baseURL: string;
  headers?: HeadersInit;
  retry?: Partial<RetryOptions>;
}

export interface GetRequestOptions<
  TResponse extends ZodType,
  TQuery extends ZodType | undefined = undefined,
> {
  path: string;
  responseSchema: TResponse;
  query?: TQuery extends ZodType ? z.infer<TQuery> : Record<string, unknown>;
  querySchema?: TQuery;
  headers?: HeadersInit;
  signal?: AbortSignal;
  cache?: {
    ttl: number;
  };
}

function mergeHeaders(...sources: (HeadersInit | undefined)[]): Headers {
  const merged = new Headers();

  for (const source of sources) {
    if (!source) {
      continue;
    }

    const headers = source instanceof Headers ? source : new Headers(source);
    headers.forEach((value, key) => {
      merged.set(key, value);
    });
  }

  return merged;
}

function joinUrl(baseURL: string, path: string, queryString: string): string {
  const normalizedBase = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}${queryString}`;
}

function buildCacheKey(method: string, url: string): string {
  return `${method} ${url}`;
}

export class ApiClient {
  private readonly baseURL: string;
  private readonly defaultHeaders: HeadersInit | undefined;
  private readonly retryOptions: Partial<RetryOptions>;
  private readonly cache = new InMemoryCache();

  constructor(options: ApiClientOptions) {
    this.baseURL = options.baseURL;
    this.defaultHeaders = options.headers;
    this.retryOptions = options.retry ?? {};
  }

  async get<TResponse extends ZodType, TQuery extends ZodType | undefined = undefined>(
    options: GetRequestOptions<TResponse, TQuery>,
  ): Promise<z.infer<TResponse>> {
    const queryString = this.buildQueryString(options.query, options.querySchema);
    const url = joinUrl(this.baseURL, options.path, queryString);
    const cacheKey = buildCacheKey("GET", url);

    if (options.cache) {
      const cached = this.cache.get<z.infer<TResponse>>(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    const headers = mergeHeaders(this.defaultHeaders, options.headers);
    const fetchInit: RequestInit = {
      method: "GET",
      headers,
    };

    if (options.signal) {
      fetchInit.signal = options.signal;
    }

    const response = await withRetry(
      () => this.fetchResponse(url, fetchInit),
      this.retryOptions,
      options.signal,
    );

    const data = await this.parseJson(response);
    const parsed = options.responseSchema.safeParse(data);

    if (!parsed.success) {
      throw new ApiValidationError(url, parsed.error);
    }

    if (options.cache) {
      this.cache.set(cacheKey, parsed.data, options.cache.ttl);
    }

    return parsed.data;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private buildQueryString(
    query: Record<string, unknown> | undefined,
    querySchema: ZodType | undefined,
  ): string {
    if (!query) {
      return "";
    }

    if (querySchema) {
      return validateAndSerializeQuery(query, querySchema);
    }

    return serializeQueryParams(query);
  }

  private async fetchResponse(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }

      throw error;
    }

    if (response.status >= 400) {
      const details = await this.tryParseJson(response);
      throw new ApiHttpError(response.status, url, details);
    }

    return response;
  }

  private async parseJson(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiHttpError(response.status, response.url, text);
    }
  }

  private async tryParseJson(response: Response): Promise<unknown> {
    const text = await response.text();

    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
}

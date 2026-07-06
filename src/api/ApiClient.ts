import type { ZodType, z } from "zod";
import { InMemoryCache } from "./cache.js";
import { ApiHttpError, ApiValidationError } from "./errors.js";
import { InflightRequests } from "./inflight.js";
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

function serializeHeaders(headers: Headers): string {
  const entries: string[] = [];

  headers.forEach((value, key) => {
    entries.push(`${key.toLowerCase()}:${value}`);
  });

  entries.sort();
  return entries.join("|");
}

function buildRequestKey(method: string, url: string, headers: Headers): string {
  const headerKey = serializeHeaders(headers);
  return headerKey ? `${method} ${url} ${headerKey}` : `${method} ${url}`;
}

export class ApiClient {
  private readonly baseURL: string;
  private readonly defaultHeaders: HeadersInit | undefined;
  private readonly retryOptions: Partial<RetryOptions>;
  private readonly cache = new InMemoryCache();
  private readonly inflight = new InflightRequests();

  constructor(options: ApiClientOptions) {
    this.baseURL = options.baseURL;
    this.defaultHeaders = options.headers;
    this.retryOptions = options.retry ?? {};
  }

  async get<TResponse extends ZodType, TQuery extends ZodType | undefined = undefined>(
    options: GetRequestOptions<TResponse, TQuery>,
  ): Promise<z.infer<TResponse>> {
    const baseUrl = joinUrl(this.baseURL, options.path, "");
    const queryString = this.buildQueryString(
      baseUrl,
      options.query,
      options.querySchema,
    );
    const url = joinUrl(this.baseURL, options.path, queryString);
    const headers = mergeHeaders(this.defaultHeaders, options.headers);
    const requestKey = buildRequestKey("GET", url, headers);

    const cached = this.getFromCache<z.infer<TResponse>>(requestKey, options.cache);
    if (cached !== undefined) {
      return cached;
    }

    return this.inflight.dedupe(requestKey, () =>
      this.executeGet(url, requestKey, headers, options),
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async executeGet<
    TResponse extends ZodType,
    TQuery extends ZodType | undefined = undefined,
  >(
    url: string,
    requestKey: string,
    headers: Headers,
    options: GetRequestOptions<TResponse, TQuery>,
  ): Promise<z.infer<TResponse>> {
    const cached = this.getFromCache<z.infer<TResponse>>(requestKey, options.cache);
    if (cached !== undefined) {
      return cached;
    }

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
      this.cache.set(requestKey, parsed.data, options.cache.ttl);
    }

    return parsed.data;
  }

  private getFromCache<T>(
    requestKey: string,
    cacheOptions: GetRequestOptions<ZodType>["cache"],
  ): T | undefined {
    if (!cacheOptions) {
      return undefined;
    }

    return this.cache.get<T>(requestKey);
  }

  private buildQueryString(
    url: string,
    query: Record<string, unknown> | undefined,
    querySchema: ZodType | undefined,
  ): string {
    if (!query) {
      return "";
    }

    if (querySchema) {
      return validateAndSerializeQuery(query, querySchema, url);
    }

    return serializeQueryParams(query);
  }

  private async fetchResponse(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const response = await fetch(url, init);

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

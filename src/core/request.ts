import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  type ErrorBody,
  KlangError,
} from './errors.js';
import { APIPromise, type APIResponseProps } from './api-promise.js';
import {
  CursorPage,
  PagePromise,
  type FetchPage,
  type PageRequest,
} from './pagination.js';

export type HTTPMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface RequestOptions {
  method?: HTTPMethod;
  path?: string;
  query?: Record<string, unknown> | null;
  body?: unknown;
  headers?: Record<string, string | null | undefined>;
  signal?: AbortSignal | null;
  timeout?: number;
  maxRetries?: number;
  idempotencyKey?: string;
}

export interface ClientConfig {
  apiKey: string | undefined;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  defaultHeaders: Record<string, string>;
  fetch: typeof globalThis.fetch;
  userAgent: string;
}

const RETRYABLE_STATUSES = new Set([408, 409, 429]);

export class RequestClient {
  readonly #config: ClientConfig;

  constructor(config: ClientConfig) {
    this.#config = config;
  }

  get<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request<T>({ ...opts, method: 'get', path });
  }
  post<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request<T>({ ...opts, method: 'post', path });
  }
  patch<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request<T>({ ...opts, method: 'patch', path });
  }
  put<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request<T>({ ...opts, method: 'put', path });
  }
  delete<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request<T>({ ...opts, method: 'delete', path });
  }

  getCursorPage<T>(path: string, query: object = {}): PagePromise<CursorPage<T>, T> {
    const initialRequest: PageRequest = { path, query };
    const fetchPage: FetchPage<T> = (req) =>
      this.#performRequest({
        method: 'get',
        path: req.path,
        query: req.query as Record<string, unknown>,
      });
    return new PagePromise(fetchPage, initialRequest, fetchPage(initialRequest), CursorPage<T>);
  }

  #request<T>(opts: RequestOptions): APIPromise<T> {
    return new APIPromise<T>(this.#performRequest(opts), (props) => props.body as T);
  }

  async #performRequest(opts: RequestOptions): Promise<APIResponseProps> {
    const maxRetries = opts.maxRetries ?? this.#config.maxRetries;
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= maxRetries) {
      try {
        return await this.#fetchOnce(opts, attempt);
      } catch (err) {
        lastError = err;
        if (!this.#shouldRetry(err, attempt, maxRetries)) throw err;
        const delay = this.#retryDelayMs(err, attempt);
        await sleep(delay);
        attempt++;
      }
    }
    throw lastError ?? new KlangError('Retry loop exhausted with no error');
  }

  async #fetchOnce(opts: RequestOptions, attempt: number): Promise<APIResponseProps> {
    const url = buildURL(this.#config.baseURL, opts.path ?? '/', opts.query);
    const headers = this.#buildHeaders(opts, attempt);
    const init: RequestInit = {
      method: (opts.method ?? 'get').toUpperCase(),
      headers,
      signal: this.#buildSignal(opts),
    };
    if (opts.body !== undefined && opts.method !== 'get') {
      init.body = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      response = await this.#config.fetch(url, init);
    } catch (err) {
      if (isAbortError(err) && opts.signal?.aborted) {
        throw new APIUserAbortError();
      }
      if (isAbortError(err)) {
        throw new APIConnectionTimeoutError();
      }
      throw new APIConnectionError({ message: errorMessage(err), cause: asError(err) });
    }

    const body = await parseBody(response);

    if (!response.ok) {
      throw APIError.generate(response.status, body as ErrorBody | undefined, response.statusText, response.headers);
    }
    return { response, body };
  }

  #shouldRetry(err: unknown, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) return false;
    if (err instanceof APIUserAbortError) return false;
    if (err instanceof APIConnectionError) return true;
    if (err instanceof APIError) {
      const status = err.status;
      if (typeof status !== 'number') return false;
      if (RETRYABLE_STATUSES.has(status)) return true;
      if (status >= 500) return true;
    }
    return false;
  }

  #retryDelayMs(err: unknown, attempt: number): number {
    if (err instanceof APIError && err.headers) {
      const retryAfter = retryAfterMs(err.headers);
      if (retryAfter != null) return retryAfter;
    }
    const base = 500 * Math.pow(2, attempt);
    const capped = Math.min(base, 8_000);
    const jitter = capped * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(capped + jitter));
  }

  #buildHeaders(opts: RequestOptions, attempt: number): Headers {
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    headers.set('User-Agent', this.#config.userAgent);
    for (const [k, v] of Object.entries(this.#config.defaultHeaders)) headers.set(k, v);
    if (this.#config.apiKey) headers.set('Authorization', `Bearer ${this.#config.apiKey}`);
    if (opts.body !== undefined && opts.method !== 'get') {
      headers.set('Content-Type', 'application/json');
    }
    if (attempt > 0 || opts.idempotencyKey) {
      headers.set('Idempotency-Key', opts.idempotencyKey ?? `klang-node-retry-${uuidv4()}`);
    }
    for (const [k, v] of Object.entries(opts.headers ?? {})) {
      if (v == null) headers.delete(k);
      else headers.set(k, v);
    }
    return headers;
  }

  #buildSignal(opts: RequestOptions): AbortSignal {
    const timer = AbortSignal.timeout(opts.timeout ?? this.#config.timeout);
    if (!opts.signal) return timer;
    return AbortSignal.any([opts.signal, timer]);
  }
}

export function buildURL(baseURL: string, path: string, query: Record<string, unknown> | null | undefined): string {
  const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const qs = stringifyQuery(query);
  return `${base}${suffix}${qs ? `?${qs}` : ''}`;
}

function stringifyQuery(query: Record<string, unknown> | null | undefined): string {
  if (!query) return '';
  const parts: Array<string> = [];
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v == null) continue;
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join('&');
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function retryAfterMs(headers: Headers): number | null {
  const ms = headers.get('retry-after-ms');
  if (ms) {
    const parsed = Number(ms);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const after = headers.get('retry-after');
  if (after) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(after);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  return null;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function asError(err: unknown): Error | undefined {
  if (err instanceof Error) return err;
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uuidv4(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

function encodeURIPath(str: string): string {
  return str.replace(/[^A-Za-z0-9\-._~!$&'()*+,;=:@]+/g, encodeURIComponent);
}

export function encodePath(statics: TemplateStringsArray, ...params: ReadonlyArray<unknown>): string {
  if (statics.length === 1) return statics[0]!;
  let out = '';
  for (let i = 0; i < statics.length; i++) {
    out += statics[i];
    if (i < params.length) {
      const value = params[i];
      if (value == null) {
        throw new KlangError(`Path parameter at position ${i} is ${value === null ? 'null' : 'undefined'}.`);
      }
      const encoded = encodeURIPath(String(value));
      out += encoded;
    }
  }
  if (/(?:^|\/)(?:\.|%2e){1,2}(?=\/|$)/i.test(out.split(/[?#]/, 1)[0]!)) {
    throw new KlangError(`Path contains unsafe . or .. segment: ${out}`);
  }
  return out;
}

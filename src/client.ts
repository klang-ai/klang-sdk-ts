import { APIPromise } from './core/api-promise.js';
import { KlangError } from './core/errors.js';
import { CursorPage, PagePromise } from './core/pagination.js';
import { RequestClient, type RequestOptions } from './core/request.js';
import { Bots } from './resources/bots.js';
import { Conversations } from './resources/conversations.js';
import { Folders } from './resources/folders.js';
import { Identity } from './resources/identity.js';
import { VERSION } from './version.js';

export interface ClientOptions {
  /** API key starting with `sk_…`. Defaults to `process.env.KLANG_API_KEY`. */
  apiKey?: string;
  /** Defaults to `https://app.klang.ai/api/v1` or `process.env.KLANG_BASE_URL`. */
  baseURL?: string;
  /** Per-request timeout in milliseconds. Default 60_000. */
  timeout?: number;
  /** Max retries per request. Default 2. */
  maxRetries?: number;
  /** Extra headers added to every request. */
  defaultHeaders?: Record<string, string>;
  /** Override the fetch implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://app.klang.ai/api/v1';

export class Klang {
  readonly #request: RequestClient;

  readonly conversations: Conversations;
  readonly folders: Folders;
  readonly identity: Identity;
  readonly bots: Bots;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv('KLANG_API_KEY');
    const baseURL = options.baseURL ?? readEnv('KLANG_BASE_URL') ?? DEFAULT_BASE_URL;
    if (!apiKey) {
      throw new KlangError(
        'Missing API key. Pass `apiKey` to `new Klang({ apiKey })` or set the `KLANG_API_KEY` env var.',
      );
    }
    if (typeof globalThis.fetch !== 'function' && !options.fetch) {
      throw new KlangError(
        'No fetch implementation found. Run on Node 18+ or pass a `fetch` option.',
      );
    }
    this.#request = new RequestClient({
      apiKey,
      baseURL,
      timeout: options.timeout ?? 60_000,
      maxRetries: options.maxRetries ?? 2,
      defaultHeaders: options.defaultHeaders ?? {},
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      userAgent: `klang-typescript/${VERSION}`,
    });

    this.conversations = new Conversations(this);
    this.folders = new Folders(this);
    this.identity = new Identity(this);
    this.bots = new Bots(this);
  }

  get<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request.get<T>(path, opts);
  }
  post<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request.post<T>(path, opts);
  }
  patch<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request.patch<T>(path, opts);
  }
  put<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request.put<T>(path, opts);
  }
  delete<T>(path: string, opts: Omit<RequestOptions, 'method' | 'path'> = {}): APIPromise<T> {
    return this.#request.delete<T>(path, opts);
  }

  getAPIList<T>(path: string, opts: { query?: object } = {}): PagePromise<CursorPage<T>, T> {
    return this.#request.getCursorPage<T>(path, opts.query ?? {});
  }
}

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env?.[key];
}

export default Klang;

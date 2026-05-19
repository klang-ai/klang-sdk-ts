import { APIPromise, type APIResponseProps } from './api-promise.js';
import { KlangError } from './errors.js';

export interface PageParams {
  cursor?: string;
  limit?: number;
}

export interface PageResponse<T> {
  data: Array<T>;
  next_cursor: string | null;
  has_more?: boolean;
}

export interface PageRequest {
  path: string;
  query: object;
}

export type FetchPage<T> = (req: PageRequest) => Promise<APIResponseProps>;

export abstract class AbstractPage<T> implements AsyncIterable<T> {
  protected readonly response: Response;
  protected readonly body: unknown;
  protected readonly request: PageRequest;
  readonly #fetchPage: FetchPage<T>;
  readonly #PageCtor: new (
    fetchPage: FetchPage<T>,
    request: PageRequest,
    props: APIResponseProps,
  ) => this;

  constructor(
    fetchPage: FetchPage<T>,
    request: PageRequest,
    props: APIResponseProps,
    PageCtor: new (
      fetchPage: FetchPage<T>,
      request: PageRequest,
      props: APIResponseProps,
    ) => AbstractPage<T>,
  ) {
    this.response = props.response;
    this.body = props.body;
    this.request = request;
    this.#fetchPage = fetchPage;
    this.#PageCtor = PageCtor as new (
      fetchPage: FetchPage<T>,
      request: PageRequest,
      props: APIResponseProps,
    ) => this;
  }

  abstract getPaginatedItems(): Array<T>;
  abstract nextPageRequest(): PageRequest | null;

  hasNextPage(): boolean {
    if (this.getPaginatedItems().length === 0) return false;
    return this.nextPageRequest() != null;
  }

  async getNextPage(): Promise<this> {
    const next = this.nextPageRequest();
    if (!next) {
      throw new KlangError('No next page expected; check .hasNextPage() before calling .getNextPage().');
    }
    const props = await this.#fetchPage(next);
    return new this.#PageCtor(this.#fetchPage, next, props);
  }

  async *iterPages(): AsyncGenerator<this> {
    let page: this = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for await (const page of this.iterPages()) {
      for (const item of page.getPaginatedItems()) yield item;
    }
  }
}

export class CursorPage<T> extends AbstractPage<T> {
  readonly data: Array<T>;
  readonly next_cursor: string | null;
  readonly has_more: boolean;

  constructor(fetchPage: FetchPage<T>, request: PageRequest, props: APIResponseProps) {
    super(fetchPage, request, props, CursorPage);
    const body = (props.body ?? {}) as Partial<PageResponse<T>>;
    this.data = body.data ?? [];
    this.next_cursor = body.next_cursor ?? null;
    this.has_more = body.has_more ?? this.next_cursor != null;
  }

  override getPaginatedItems(): Array<T> {
    return this.data;
  }

  override nextPageRequest(): PageRequest | null {
    if (!this.next_cursor) return null;
    return {
      path: this.request.path,
      query: { ...this.request.query, cursor: this.next_cursor },
    };
  }
}

export class PagePromise<Page extends AbstractPage<Item>, Item>
  extends APIPromise<Page>
  implements AsyncIterable<Item>
{
  constructor(
    fetchPage: FetchPage<Item>,
    request: PageRequest,
    initial: Promise<APIResponseProps>,
    PageCtor: new (fetchPage: FetchPage<Item>, request: PageRequest, props: APIResponseProps) => Page,
  ) {
    super(initial, (props) => new PageCtor(fetchPage, request, props));
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Item> {
    const page = await this;
    for await (const item of page) yield item;
  }
}

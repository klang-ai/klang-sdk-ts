export interface APIResponseProps {
  response: Response;
  body: unknown;
}

export class APIPromise<T> extends Promise<T> {
  #responsePromise: Promise<APIResponseProps>;
  #parse: (props: APIResponseProps) => T | Promise<T>;
  #parsedPromise: Promise<T> | undefined;

  constructor(
    responsePromise: Promise<APIResponseProps>,
    parse: (props: APIResponseProps) => T | Promise<T> = (p) => p.body as T,
  ) {
    super((resolve) => resolve(null as unknown as T));
    this.#responsePromise = responsePromise;
    this.#parse = parse;
  }

  _thenUnwrap<U>(transform: (data: T, props: APIResponseProps) => U): APIPromise<U> {
    return new APIPromise(this.#responsePromise, async (props) => transform(await this.#parse(props), props));
  }

  asResponse(): Promise<Response> {
    return this.#responsePromise.then((p) => p.response);
  }

  async withResponse(): Promise<{ data: T; response: Response }> {
    const [data, response] = await Promise.all([this.#parsePromise(), this.asResponse()]);
    return { data, response };
  }

  #parsePromise(): Promise<T> {
    if (!this.#parsedPromise) {
      this.#parsedPromise = this.#responsePromise.then((p) => this.#parse(p));
    }
    return this.#parsedPromise;
  }

  override then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    return this.#parsePromise().then(onfulfilled, onrejected);
  }

  override catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<T | TResult> {
    return this.#parsePromise().catch(onrejected);
  }

  override finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.#parsePromise().finally(onfinally);
  }

  // Promise.resolve / Promise.race chains expect this to be a real Promise constructor.
  static override get [Symbol.species](): PromiseConstructor {
    return Promise as unknown as PromiseConstructor;
  }
}

export interface ErrorBody {
  error?: {
    type?: string | null;
    message?: string;
    tier?: string;
    upgrade_url?: string;
  };
}

export class KlangError extends Error {}

export class APIError<
  TStatus extends number | undefined = number | undefined,
  THeaders extends Headers | undefined = Headers | undefined,
> extends KlangError {
  readonly status: TStatus;
  readonly headers: THeaders;
  readonly body: ErrorBody | undefined;

  constructor(status: TStatus, body: ErrorBody | undefined, message: string | undefined, headers: THeaders) {
    super(APIError.makeMessage(status, body, message));
    this.status = status;
    this.headers = headers;
    this.body = body;
  }

  private static makeMessage(status: number | undefined, body: ErrorBody | undefined, fallback: string | undefined): string {
    const msg = body?.error?.message ?? fallback;
    if (status && msg) return `${status} ${msg}`;
    if (status) return `${status} status code (no body)`;
    if (msg) return msg;
    return '(no status code or body)';
  }

  static generate(
    status: number | undefined,
    body: ErrorBody | undefined,
    message: string | undefined,
    headers: Headers | undefined,
  ): APIError {
    if (!status || !headers) {
      return new APIConnectionError({ message });
    }
    if (status === 400) return new BadRequestError(status, body, message, headers);
    if (status === 401) return new AuthenticationError(status, body, message, headers);
    if (status === 403) return new PermissionDeniedError(status, body, message, headers);
    if (status === 404) return new NotFoundError(status, body, message, headers);
    if (status === 409) return new ConflictError(status, body, message, headers);
    if (status === 422) return new UnprocessableEntityError(status, body, message, headers);
    if (status === 429) return new RateLimitError(status, body, message, headers);
    if (status >= 500) return new InternalServerError(status, body, message, headers);
    return new APIError(status, body, message, headers);
  }
}

export class APIConnectionError extends APIError<undefined, undefined> {
  constructor({ message, cause }: { message?: string; cause?: Error } = {}) {
    super(undefined, undefined, message ?? 'Connection error.', undefined);
    if (cause) (this as { cause?: Error }).cause = cause;
  }
}

export class APIConnectionTimeoutError extends APIConnectionError {
  constructor({ message }: { message?: string } = {}) {
    super({ message: message ?? 'Request timed out.' });
  }
}

export class APIUserAbortError extends APIError<undefined, undefined> {
  constructor({ message }: { message?: string } = {}) {
    super(undefined, undefined, message ?? 'Request was aborted.', undefined);
  }
}

export class BadRequestError extends APIError<400, Headers> {}
export class AuthenticationError extends APIError<401, Headers> {}
export class PermissionDeniedError extends APIError<403, Headers> {}
export class NotFoundError extends APIError<404, Headers> {}
export class ConflictError extends APIError<409, Headers> {}
export class UnprocessableEntityError extends APIError<422, Headers> {}
export class RateLimitError extends APIError<429, Headers> {}
export class InternalServerError extends APIError<number, Headers> {}

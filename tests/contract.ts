/**
 * Type-checked only — never executed. Exercises every public call site in the SDK so a
 * spec change that breaks a signature surfaces as a typecheck failure in CI.
 *
 * Run via `npm run contract` (tsc --noEmit).
 */
import Klang, {
  type Bot,
  type ConversationDetail,
  type ConversationListItem,
  type Folder,
  type IdentityResponse,
  type Source,
  type SourceLite,
  CursorPage,
  PagePromise,
  APIPromise,
  KlangError,
  APIError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
} from '../src/index.js';

declare function expectType<T>(_: T): void;

const klang = new Klang({
  apiKey: 'sk_test',
  baseURL: 'http://localhost:8060/api/v1',
  timeout: 30_000,
  maxRetries: 1,
  defaultHeaders: { 'X-Klang-Test': '1' },
});

// identity
{
  const p: APIPromise<IdentityResponse> = klang.identity.retrieve();
  void p.then((me) => expectType<string | undefined>(me.user?.email));
  void p.then((me) => expectType<string | undefined>(me.workspace?.name));
}

// conversations.retrieve
{
  const p: APIPromise<ConversationDetail> = klang.conversations.retrieve('abc');
  void p.then((c) => {
    expectType<string | undefined>(c.id);
    expectType<string | null | undefined>(c.summary);
    expectType<Array<Source> | undefined>(c.sources);
    expectType<'pending' | 'ready' | 'error' | null | undefined>(c.status);
    expectType<'not_admitted' | 'verification_required' | 'captcha_required' | null | undefined>(
      c.termination_reason,
    );
  });
}

// conversations.list (one page)
{
  const p: PagePromise<CursorPage<ConversationListItem>, ConversationListItem> = klang.conversations.list();
  void p.then((page) => {
    expectType<Array<ConversationListItem>>(page.data);
    expectType<string | null>(page.next_cursor);
    expectType<boolean>(page.has_more);
    const first = page.data[0];
    expectType<Array<SourceLite> | undefined>(first?.sources);
  });
}

// conversations.list (with every documented param)
{
  klang.conversations.list({
    cursor: 'abc',
    limit: 50,
    folder_id: 'f1',
    recursive: true,
    status: 'all',
    created_after: '2026-01-01T00:00:00Z',
  });
  klang.conversations.list({ status: 'ready' });
  klang.conversations.list({ status: 'pending' });
  klang.conversations.list({ status: 'error' });
}

// conversations.list (auto-paginate)
async function iterateConversations(): Promise<void> {
  for await (const c of klang.conversations.list({ limit: 10 })) {
    expectType<string | undefined>(c.id);
  }
}
void iterateConversations;

// folders.list
{
  const p: PagePromise<CursorPage<Folder>, Folder> = klang.folders.list();
  void p.then((page) => {
    expectType<Array<Folder>>(page.data);
    expectType<string | null | undefined>(page.data[0]?.parent_id);
  });
  klang.folders.list({ cursor: 'x', limit: 100, folder_id: 'f', recursive: false });
}

// folders.list (auto-paginate)
async function iterateFolders(): Promise<void> {
  for await (const f of klang.folders.list()) {
    expectType<string | undefined>(f.name);
  }
}
void iterateFolders;

// bots.create — required + optional fields
{
  const p: APIPromise<Bot> = klang.bots.create({
    meeting_url: 'https://meet.google.com/abc-defg-hij',
    name: 'Test',
  });
  void p.then((b) => {
    expectType<string | undefined>(b.id);
    expectType<'pending' | undefined>(b.status);
  });
  klang.bots.create({
    meeting_url: 'https://teams.microsoft.com/l/meetup-join/...',
    name: 'Test 2',
    language: 'eng',
    folder_id: '12',
  });
}

// Helpers on APIPromise
async function withResponse(): Promise<void> {
  const wr = await klang.identity.retrieve().withResponse();
  expectType<IdentityResponse>(wr.data);
  expectType<Response>(wr.response);

  const r = await klang.identity.retrieve().asResponse();
  expectType<Response>(r);
}
void withResponse;

// Error class hierarchy — every typed error extends APIError extends KlangError
{
  const errs: Array<APIError> = [
    new BadRequestError(400, undefined, 'x', new Headers()),
    new AuthenticationError(401, undefined, 'x', new Headers()),
    new PermissionDeniedError(403, undefined, 'x', new Headers()),
    new NotFoundError(404, undefined, 'x', new Headers()),
    new ConflictError(409, undefined, 'x', new Headers()),
    new UnprocessableEntityError(422, undefined, 'x', new Headers()),
    new RateLimitError(429, undefined, 'x', new Headers()),
    new InternalServerError(500, undefined, 'x', new Headers()),
  ];
  for (const e of errs) {
    expectType<KlangError>(e);
    expectType<APIError>(e);
  }

  expectType<APIConnectionError>(new APIConnectionError());
  expectType<APIConnectionError>(new APIConnectionTimeoutError());
  expectType<APIUserAbortError>(new APIUserAbortError());
}

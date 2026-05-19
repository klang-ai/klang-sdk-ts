# Klang TypeScript SDK

Official TypeScript client for the [Klang API](https://docs.klang.ai).

## Documentation

Full API reference and guides: **[docs.klang.ai](https://docs.klang.ai)**.

## Install

```bash
npm install @klang-ai/sdk-ts
```

## Quick start

```ts
import Klang, { NotFoundError } from '@klang-ai/sdk-ts';

const klang = new Klang({ apiKey: process.env.KLANG_API_KEY });

const me = await klang.identity.retrieve();
console.log(`Connected as ${me.user?.email} in ${me.workspace?.name}`);

for await (const conversation of klang.conversations.list({ limit: 25 })) {
  console.log(conversation.id, conversation.title);
}

try {
  const detail = await klang.conversations.retrieve('kw3pq2nyax7lr9d');
  console.log(detail.summary);
} catch (err) {
  if (err instanceof NotFoundError) {
    console.error('Conversation does not exist or is not visible to this key.');
  } else {
    throw err;
  }
}
```

## Configuration

```ts
new Klang({
  apiKey: 'sk_...',     // or set KLANG_API_KEY
  timeout: 60_000,
  maxRetries: 2,
});
```

`apiKey` is sent as `Authorization: Bearer <key>`.

## Errors

All HTTP errors throw a typed subclass of `APIError` (which extends `KlangError`):

| Status | Class                       |
|--------|-----------------------------|
| 400    | `BadRequestError`           |
| 401    | `AuthenticationError`       |
| 403    | `PermissionDeniedError`     |
| 404    | `NotFoundError`             |
| 409    | `ConflictError`             |
| 422    | `UnprocessableEntityError`  |
| 429    | `RateLimitError`            |
| ≥500   | `InternalServerError`       |

Network failures throw `APIConnectionError` or `APIConnectionTimeoutError`. Aborted requests throw `APIUserAbortError`.

## Pagination

List endpoints return a `PagePromise` that you can `await` (gets one page) or iterate (auto-paginates):

```ts
// One page
const page = await klang.conversations.list({ limit: 25 });
console.log(page.data, page.next_cursor, page.has_more);

// Auto-paginate
for await (const c of klang.conversations.list()) {
  console.log(c.id);
}

// Manual cursor
let cursor: string | undefined;
do {
  const p = await klang.conversations.list({ cursor, limit: 50 });
  // ...
  cursor = p.next_cursor ?? undefined;
} while (cursor);
```

## Retries

Default `maxRetries: 2` with exponential backoff (0.5s × 2^n, capped at 8s, with jitter). Retried on `408`, `409`, `429`, `5xx`, and connection errors. `Retry-After` headers are honored.

## License

MIT. See LICENSE.

# Klang TypeScript SDK — AI maintenance playbook

This file is the contract between you (Claude) and this codebase. When the Klang OpenAPI spec changes, you update the SDK by re-reading the spec and editing the files described below. Follow these conventions exactly — they are what make the SDK feel cohesive across sessions.

The SDK is hand-written code that ships to npm as a normal package. There is no codegen step, no template engine, no proprietary DSL. Just TypeScript that you edit.

## Repo layout

```
src/
  index.ts                 # public barrel — only this file's exports are public
  client.ts                # Klang class, env-var fallback, .conversations/.folders/.identity/.bots
  version.ts               # exports VERSION
  core/                    # protocol-level infrastructure — rarely changes
    api-promise.ts         # APIPromise<T> with .asResponse / .withResponse
    errors.ts              # KlangError → APIError → typed subclasses + status-code map
    pagination.ts          # AbstractPage, CursorPage, PagePromise
    request.ts             # fetch wrapper: auth, retry, timeout, abort, parse
  resources/               # one file per OpenAPI tag — this is what changes per spec edit
    conversations.ts
    folders.ts
    identity.ts
    bots.ts
    index.ts               # barrel for resources
tests/
  contract.ts              # typecheck-only — exhaustive call-site coverage
  smoke.ts                 # live test against a real backend
```

## The public surface contract

`src/index.ts` is the only file whose exports are public. Everything else is internal. Users do:

```ts
import Klang, { NotFoundError, type ConversationDetail } from '@klang-ai/sdk-ts';
```

The default export is `Klang`. Named exports cover: the `Klang` class itself, every error class, every resource type, `APIPromise`, `CursorPage`, `PagePromise`, `VERSION`.

**Do not re-export anything from `src/core/request.ts` or `src/core/api-promise.ts` internals beyond the classes themselves.** Internal helper functions stay internal.

## Resource pattern

Every OpenAPI tag becomes one file under `src/resources/`. Convention per file:

```ts
// src/resources/<name>.ts
import { APIPromise } from '../core/api-promise.js';
import { CursorPage, PagePromise, type PageParams } from '../core/pagination.js';
import { encodePath } from '../core/request.js';
import type { Klang } from '../client.js';

export class <Name> {
  constructor(private readonly _client: Klang) {}

  // GET /<thing>/{id}  → APIPromise<T>
  retrieve(id: string): APIPromise<<Type>> {
    return this._client.get<<Type>>(encodePath`/<thing>/${id}`);
  }

  // GET /<thing>  → PagePromise<CursorPage<T>, T>
  list(
    query: <Name>ListParams | undefined = {},
  ): PagePromise<CursorPage<<Item>>, <Item>> {
    return this._client.getAPIList<<Item>>('/<thing>', { query });
  }

  // POST /<thing>  → APIPromise<T>
  create(body: <Name>CreateParams): APIPromise<<Result>> {
    return this._client.post<<Result>>('/<thing>', { body });
  }
}

// Types colocated. One interface per OpenAPI schema. Names match the spec.
export interface <Type> { /* fields from spec */ }
export interface <Name>ListParams extends PageParams { /* extra query params */ }
export interface <Name>CreateParams { /* body shape */ }
```

**Rules:**
- One class per resource, named in PascalCase (`Conversations`, `Folders`, `Identity`, `Bots`).
- Methods are camelCase verbs from the spec: `list`, `retrieve`, `create`, `update`, `delete`.
- Single-fetch methods return `APIPromise<T>`.
- List methods return `PagePromise<CursorPage<T>, T>` and accept a `<Name>ListParams` extending `PageParams`.
- Mutation methods (POST/PATCH/PUT) take a `body` argument typed as `<Name><Verb>Params`.
- All types for the resource live in the same file. Don't split types into a separate file.
- Use `encodePath\`/foo/${id}\`` for any path that interpolates a value — never string concatenation.

## Type conventions

- One interface per OpenAPI schema. Name matches the spec (`ConversationDetail`, `Source`, `Folder`, `Identity`).
- `allOf` composition becomes TypeScript `extends`: `ConversationDetail extends ConversationBase`.
- Nullable fields (`nullable: true` in spec) become `field?: T | null` — both optional (might be absent) and nullable (might be `null`). This matches what the backend actually sends.
- Required fields (per spec `required:` array) stay non-optional.
- Enums become string literal unions: `status?: 'pending' | 'ready' | 'error' | null`.
- Use `Array<T>` consistently (not `T[]`) for readability with nested generics.
- Inline nested objects only when they aren't reused. Otherwise extract a named interface.

## Error mapping (status → class)

Defined in `src/core/errors.ts`. Mapping table — when the spec adds a new documented status code, add a new class here and re-export from `src/index.ts`:

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

Never throw bare `APIError`. If a new status code appears, add a typed class.

The error body shape from the spec is `{ error: { type, message, tier?, upgrade_url? } }`. The thrown error exposes the parsed body as `err.body` and the status/headers as `err.status` / `err.headers`. The error `message` is derived from `body.error.message`.

## Pagination contract

Lists always look like this in the response:

```json
{ "data": [...], "next_cursor": "string|null", "has_more": true }
```

Lists always accept these query params:

```
{ cursor?: string, limit?: number, ...other filters }
```

`CursorPage<T>` reads exactly `data` and `next_cursor` from the body. **Do not rename these fields.** They are protocol.

If the backend ever ships a non-cursor list (offset, page-number, etc.), add a new page class in `pagination.ts` alongside `CursorPage` — don't change `CursorPage`.

## Auth

Bearer only. Constructor accepts `apiKey`. Falls back to `process.env.KLANG_API_KEY`. Sent as `Authorization: Bearer ${apiKey}`. No other schemes exist.

If the spec ever introduces a second scheme, extend the constructor with an explicit `bearerToken` (or whatever the scheme calls itself) — do not overload `apiKey`.

## Path interpolation

Use the `encodePath` tag from `src/core/request.ts`:

```ts
this._client.get(encodePath`/conversations/${id}`);
```

This percent-encodes path segments and refuses `.` / `..` to prevent path traversal. Never use string concatenation or template literals for paths with user-supplied values.

## Retries and timeouts

Defaults are in `src/core/request.ts`:

- `maxRetries: 2`
- Backoff: `0.5s × 2^n`, capped at `8s`, with ±25% jitter
- Retried statuses: `408`, `409`, `429`, `5xx`
- Retried errors: connection failures, timeouts
- `Retry-After` header is honored (seconds or HTTP-date)
- `Idempotency-Key` header is auto-added (UUIDv4) on retried requests

**Do not change these defaults without a documented reason.**

## How to add a new endpoint (5 steps)

When the spec adds a new operation under an existing tag:

1. Add any new types to the resource file (matching spec schema names verbatim).
2. Add the method on the resource class, following the resource pattern above.
3. Export any new types from `src/index.ts`.
4. Add one usage line to `tests/contract.ts` (every public method must be in contract).
5. Add a section to `tests/smoke.ts` if the method is read-only; or guard it behind `--include-writes` if it has side effects.

## How to update an existing endpoint

When a spec operation changes:

1. Re-read the operation in `openapi.yaml`. Note: changed params, changed response shape, new error codes.
2. Update the type definitions in the resource file. Keep field order matching the spec for readable diffs.
3. Update the method signature if params changed.
4. Update `tests/contract.ts` if the public signature changed.
5. Update the relevant section in `tests/smoke.ts` if the response shape changed (assertions may now fail).

## How to add a new resource (new tag)

When the spec adds a new tag:

1. Create `src/resources/<name>.ts` following the resource pattern.
2. Add `export * from './<name>.js'` to `src/resources/index.ts`.
3. Add the property on the `Klang` client in `src/client.ts`: `readonly <name> = new <Name>(this);`.
4. Export the new types from `src/index.ts`.
5. Add a section to `tests/contract.ts` covering every method on the new resource.
6. Add a section to `tests/smoke.ts` (read-only by default, `--include-writes` for mutations).

## Things you must NOT do

- **Do not** change retry/backoff defaults.
- **Do not** rename `data`, `next_cursor`, or `has_more` in `CursorPage` — they are protocol.
- **Do not** introduce runtime dependencies. The SDK runs on `globalThis.fetch` and Node ≥18. If you need crypto, use `globalThis.crypto`.
- **Do not** add a build step beyond `tsup`.
- **Do not** split types into separate `*.types.ts` files — keep them with their resource.
- **Do not** add wrappers/helpers in `src/core/` that aren't called by `src/client.ts` or a resource.
- **Do not** generate a separate barrel of all internal types from `core/`. The only public types are the ones explicitly re-exported in `src/index.ts`.
- **Do not** add "generated file" or "do not edit" markers. This SDK is hand-edited.
- **Do not** call out in code comments that something was changed for a spec update — that's PR-description territory.

## Verifying changes

After any change run, in order:

```bash
npm run typecheck     # src must typecheck strict
npm run contract      # every public call site must typecheck
npm run build         # tsup must emit cjs + esm + d.ts cleanly
```

Then, against a running backend:

```bash
KLANG_API_KEY=sk_... KLANG_BASE_URL=http://localhost:8060/api/v1 npm run smoke
KLANG_API_KEY=sk_... KLANG_BASE_URL=http://localhost:8060/api/v1 npm run smoke -- --include-writes
```

A spec change is not "done" until contract + smoke both pass.

/**
 * Live smoke test. Requires KLANG_API_KEY. Defaults to http://localhost:8060/api/v1.
 *
 *   KLANG_API_KEY=sk_... npm run smoke
 *   KLANG_API_KEY=sk_... npm run smoke -- --include-writes
 *
 * Read-only by default. `--include-writes` adds POST /bots with a fake meeting URL —
 * the bot will fail to join, no real meeting is polluted, but a pending conversation
 * record is created in the workspace pointed to by the API key.
 */
import Klang, {
  AuthenticationError,
  NotFoundError,
  type ConversationListItem,
} from '../src/index.js';

const apiKey = process.env.KLANG_API_KEY;
const baseURL = process.env.KLANG_BASE_URL ?? 'http://localhost:8060/api/v1';
const includeWrites = process.argv.includes('--include-writes');

if (!apiKey) {
  console.error('KLANG_API_KEY required');
  process.exit(1);
}

const klang = new Klang({ apiKey, baseURL, timeout: 180_000 });

let failures = 0;

function section(label: string): void {
  console.log(`\n=== ${label} ===`);
}

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string, err?: unknown): void {
  failures++;
  console.log(`  ✗ ${msg}${err ? ` — ${err instanceof Error ? err.message : String(err)}` : ''}`);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function safe(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    fail(label, err);
  }
}

async function main(): Promise<void> {
  console.log(`klang smoke → ${baseURL} (writes: ${includeWrites ? 'on' : 'off'})`);

  let firstConversationId: string | undefined;

  await safe('identity.retrieve', async () => {
    section('identity.retrieve');
    const me = await klang.identity.retrieve();
    assert(typeof me.user?.email === 'string', 'user.email is string');
    ok(`user: ${me.user?.email}`);
    ok(`workspace: ${JSON.stringify(me.workspace?.name)}`);
  });

  await safe('conversations.list (default)', async () => {
    section('conversations.list (limit 3, default status=ready)');
    const page = await klang.conversations.list({ limit: 3 });
    assert(Array.isArray(page.data), 'data is array');
    assert(typeof page.has_more === 'boolean', 'has_more is boolean');
    ok(`data: ${page.data.length}, has_more: ${page.has_more}, next_cursor: ${page.next_cursor ?? 'null'}`);
    for (const c of page.data) {
      ok(`- ${c.id} ${JSON.stringify(c.title)} status=${c.status}`);
    }
    firstConversationId = page.data[0]?.id;
  });

  await safe('conversations.list (status=all)', async () => {
    section('conversations.list (status=all)');
    const page = await klang.conversations.list({ limit: 3, status: 'all' });
    const statuses = page.data.map((c: ConversationListItem) => c.status);
    ok(`statuses: ${JSON.stringify(statuses)}`);
  });

  await safe('conversations.list (created_after future)', async () => {
    section('conversations.list (created_after future)');
    const page = await klang.conversations.list({ limit: 3, created_after: '2099-01-01T00:00:00Z' });
    assert(page.data.length === 0, 'expect zero rows');
    ok('zero rows as expected');
  });

  await safe('conversations.list (auto-paginate cap 8)', async () => {
    section('conversations.list (auto-paginate, cap 8)');
    let count = 0;
    for await (const _c of klang.conversations.list({ limit: 5 })) {
      count++;
      if (count >= 8) break;
    }
    ok(`iterated ${count} items`);
  });

  if (firstConversationId) {
    await safe('conversations.retrieve', async () => {
      section(`conversations.retrieve(${firstConversationId})`);
      const detail = await klang.conversations.retrieve(firstConversationId!);
      ok(`id: ${detail.id}`);
      ok(`status: ${detail.status}`);
      ok(`sources: ${detail.sources?.length ?? 0}`);
      ok(`digest: ${detail.digest ?? '(none)'}`);
      if (detail.summary) ok(`summary preview: ${detail.summary.slice(0, 80)}…`);
    });
  }

  await safe('folders.list', async () => {
    section('folders.list');
    const page = await klang.folders.list();
    assert(Array.isArray(page.data), 'data is array');
    ok(`data: ${page.data.length}, has_more: ${page.has_more}`);
  });

  await safe('error: NotFound', async () => {
    section('error: NotFound on conversations.retrieve(nonexistent)');
    try {
      await klang.conversations.retrieve('does-not-exist-' + Date.now());
      fail('expected NotFoundError, got success');
    } catch (err) {
      assert(err instanceof NotFoundError, 'instanceof NotFoundError');
      ok(`NotFoundError thrown (status=${err.status})`);
    }
  });

  await safe('error: Authentication', async () => {
    section('error: AuthenticationError with bogus key');
    const bad = new Klang({ apiKey: 'sk_invalid_smoke_test', baseURL });
    try {
      await bad.identity.retrieve();
      fail('expected AuthenticationError, got success');
    } catch (err) {
      assert(err instanceof AuthenticationError, 'instanceof AuthenticationError');
      ok(`AuthenticationError thrown (status=${err.status})`);
    }
  });

  if (includeWrites) {
    await safe('bots.create', async () => {
      section('bots.create (--include-writes)');
      const bot = await klang.bots.create({
        meeting_url: 'https://meet.google.com/aaa-bbbb-ccc',
        name: `Klang smoke bot ${new Date().toISOString()}`,
      });
      assert(typeof bot.id === 'string', 'bot.id is string');
      assert(bot.status === 'pending', 'bot.status === pending');
      ok(`created bot, conversation id: ${bot.id}`);
    });
  }

  console.log();
  if (failures > 0) {
    console.error(`SMOKE FAILED: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

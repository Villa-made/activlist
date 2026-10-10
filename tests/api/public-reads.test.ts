// T16.b — public feed and leaderboard HTTP routes, backed by DEV's T16.a RPCs.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handler } from '../../supabase/functions/api/index.ts';
import { hasDbEnv, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

interface FeedItem { id: string; imageUrl: string; likeCount: number; likedByMe: boolean; municipality: { code: string; name: string }; publishedAt: string }
interface LeaderboardItem { userId: string; rank: number; points: number }
interface Page<T> { items: T[]; nextCursor: string | null }

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

async function request(path: string, token?: string): Promise<Response> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return await handler(new Request(`${BASE}/api/v1${path}`, { method: 'GET', headers }));
}

async function tokenFor(fixtures: TestFixtures, user: { id: string; email: string }): Promise<string> {
  const client = await fixtures.signInAs(user);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('fixture sign-in did not return an access token');
  return session.access_token;
}

async function seed(
  f: TestFixtures,
  authorId: string,
  actionType: 'RECYCLING' | 'LITTER_COLLECTION',
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const approvedAt = new Date().toISOString();
  const { data, error } = await f.db.from('contributions').insert(f.contributionRow(authorId, {
    action_type: actionType,
    points_snapshot: actionType === 'RECYCLING' ? 10 : 20,
    status: 'APPROVED',
    submitted_at: approvedAt,
    approved_at: approvedAt,
    public_photo_path: `public/${authorId}/${crypto.randomUUID()}.jpg`,
    ...overrides,
  })).select('id').single();
  if (error || !data) throw new Error(`seed failed: ${error?.message}`);
  return data;
}

function containsForbiddenKey(value: unknown): boolean {
  const forbidden = new Set(['email', 'evidence_path', 'public_photo_path', 'validation_version', 'idempotency_key']);
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, nested]) => forbidden.has(key) || containsForbiddenKey(nested));
  }
  return false;
}

Deno.test({
  name: 'GET /feed and /leaderboard expose only derived public DTOs and optional likes',
  ignore,
  fn: () => withFixtures(async (f) => {
    const alpha = await f.createUser(`T16bAlpha${crypto.randomUUID().slice(0, 8)}`);
    const beta = await f.createUser(`T16bBeta${crypto.randomUUID().slice(0, 8)}`);
    const viewer = await f.createUser(`T16bViewer${crypto.randomUUID().slice(0, 8)}`);

    const alphaFeed = await seed(f, alpha.id, 'RECYCLING');
    await seed(f, alpha.id, 'LITTER_COLLECTION');
    await seed(f, beta.id, 'RECYCLING');
    await seed(f, beta.id, 'LITTER_COLLECTION');
    const hidden = await seed(f, alpha.id, 'RECYCLING', { hidden_at: new Date().toISOString() });
    const pending = await seed(f, alpha.id, 'RECYCLING', {
      status: 'PENDING', approved_at: null, public_photo_path: null,
    });
    assertEquals((await f.db.from('likes').insert([
      { user_id: viewer.id, contribution_id: alphaFeed.id },
      { user_id: beta.id, contribution_id: alphaFeed.id },
    ])).error, null);

    const anonymous = await request('/feed?limit=50');
    assertEquals(anonymous.status, 200);
    const anonymousBody = await anonymous.json() as Page<FeedItem>;
    const alphaIndex = anonymousBody.items.findIndex((item) => item.id === alphaFeed.id);
    assert(alphaIndex >= 0, 'seeded visible feed item must be returned');
    const alphaItem = anonymousBody.items[alphaIndex];
    assertEquals(alphaItem.imageUrl, `/v1/media/${alphaFeed.id}`);
    assertEquals(alphaItem.municipality, { code: '08019', name: 'Barcelona' });
    assert(!Number.isNaN(new Date(alphaItem.publishedAt).getTime()), 'publishedAt must be ISO date');
    assertEquals(alphaItem.likedByMe, false);
    assert(alphaItem.likeCount >= 2);
    assert(!anonymousBody.items.some((item) => item.id === hidden.id || item.id === pending.id));
    assert(!containsForbiddenKey(anonymousBody));

    const token = await tokenFor(f, viewer);
    const authenticated = await request('/feed?limit=50', token);
    assertEquals(authenticated.status, 200);
    const viewerItem = (await authenticated.json() as Page<FeedItem>).items.find((item) => item.id === alphaFeed.id);
    assertEquals(viewerItem?.likedByMe, true);
    const garbage = await request('/feed?limit=50', 'not-a-token');
    assertEquals(garbage.status, 200);
    const garbageItem = (await garbage.json() as Page<FeedItem>).items.find((item) => item.id === alphaFeed.id);
    assertEquals(garbageItem?.likedByMe, false);

    const board = await request('/leaderboard?limit=50');
    assertEquals(board.status, 200);
    const boardItems = (await board.json() as Page<LeaderboardItem>).items;
    const alphaBoard = boardItems.find((item) => item.userId === alpha.id);
    const betaBoard = boardItems.find((item) => item.userId === beta.id);
    assertEquals(alphaBoard?.points, 30, 'hidden contribution must not add points');
    assertEquals(betaBoard?.points, 30);
    assertEquals(alphaBoard?.rank, betaBoard?.rank);
    assertEquals(typeof alphaBoard?.points, 'number');
    assertEquals(typeof alphaBoard?.rank, 'number');
  }),
});

Deno.test({
  name: 'public-read pagination validates inputs and does not repeat a cursor page',
  ignore,
  fn: () => withFixtures(async (f) => {
    const alpha = await f.createUser(`T16bPage${crypto.randomUUID().slice(0, 8)}`);
    await seed(f, alpha.id, 'RECYCLING');
    await seed(f, alpha.id, 'LITTER_COLLECTION');

    const first = await request('/feed?limit=1');
    assertEquals(first.status, 200);
    const firstPage = await first.json() as Page<FeedItem>;
    assert(firstPage.nextCursor !== null, 'multiple visible items require a next cursor');
    const second = await request(`/feed?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`);
    assertEquals(second.status, 200);
    const secondPage = await second.json() as Page<FeedItem>;
    assert(secondPage.items.length === 1);
    assert(secondPage.items[0].id !== firstPage.items[0].id);

    for (const query of ['?limit=0', '?limit=51', '?limit=abc']) {
      const response = await request(`/feed${query}`);
      assertEquals(response.status, 400);
      assertEquals((await response.json()).error.details, { field: 'limit' });
    }
    const cursor = await request('/leaderboard?cursor=not-base64url');
    assertEquals(cursor.status, 400);
    assertEquals((await cursor.json()).error.details, { field: 'cursor' });
  }),
});

// T16.a — service-only public-read RPCs. Fixtures are isolated from shared DEV data by user/id.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { anonClient, hasDbEnv, TestFixtures } from './support.ts';

const ignore = !hasDbEnv();

interface LeaderboardRow { rank: number; user_id: string; alias: string; points: number }
interface FeedRow { id: string; liked_by_me: boolean }

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

async function leaderboard(db: SupabaseClient, limit = 50, offset = 0) {
  return await db.rpc('get_leaderboard', { p_limit: limit, p_offset: offset });
}

async function feed(db: SupabaseClient, limit = 50, offset = 0, viewer: string | null = null) {
  return await db.rpc('get_feed', { p_limit: limit, p_offset: offset, p_viewer: viewer });
}

async function seed(
  f: TestFixtures,
  authorId: string,
  actionType: 'RECYCLING' | 'LITTER_COLLECTION',
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const points = actionType === 'RECYCLING' ? 10 : 20;
  const approvedAt = new Date().toISOString();
  const { data, error } = await f.db.from('contributions').insert(
    f.contributionRow(authorId, {
      action_type: actionType,
      points_snapshot: points,
      status: 'APPROVED',
      submitted_at: approvedAt,
      approved_at: approvedAt,
      public_photo_path: `public/${authorId}/${crypto.randomUUID()}.jpg`,
      ...overrides,
    }),
  ).select('id').single();
  if (error || !data) throw new Error(`seed failed: ${error?.message}`);
  return data;
}

Deno.test({
  name: 'leaderboard and feed derive visibility, points, likes, ranking and stable pagination',
  ignore,
  fn: () => withFixtures(async (f) => {
    const alpha = await f.createUser('T16Alpha');
    const beta = await f.createUser('T16Beta');
    const gamma = await f.createUser('T16Gamma');
    const viewer = await f.createUser('T16Viewer');
    const excluded = await f.createUser('T16Excluded');

    const alpha10 = await seed(f, alpha.id, 'RECYCLING');
    await seed(f, alpha.id, 'LITTER_COLLECTION');
    const beta10 = await seed(f, beta.id, 'RECYCLING');
    await seed(f, beta.id, 'LITTER_COLLECTION');
    const gamma10 = await seed(f, gamma.id, 'RECYCLING');
    const old = await seed(f, excluded.id, 'RECYCLING', {
      submitted_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
      approved_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const hidden = await seed(f, excluded.id, 'RECYCLING', { hidden_at: new Date().toISOString() });
    const pending = await seed(f, excluded.id, 'RECYCLING', {
      status: 'PENDING', approved_at: null, public_photo_path: null,
    });
    const rejected = await seed(f, excluded.id, 'RECYCLING', {
      status: 'REJECTED', approved_at: null, public_photo_path: null,
    });

    const likeRows = [
      { user_id: viewer.id, contribution_id: beta10.id },
      { user_id: gamma.id, contribution_id: beta10.id },
      { user_id: viewer.id, contribution_id: alpha10.id },
    ];
    const likes = await f.db.from('likes').insert(likeRows);
    assertEquals(likes.error, null);

    const board = await leaderboard(f.db);
    assertEquals(board.error, null);
    const seededBoard = ((board.data ?? []) as LeaderboardRow[])
      .filter((row) => [alpha.id, beta.id, gamma.id, excluded.id].includes(row.user_id));
    const byUser = new Map(seededBoard.map((row) => [row.user_id, row]));
    assertEquals(byUser.get(alpha.id)?.points, 30);
    assertEquals(byUser.get(beta.id)?.points, 30);
    assertEquals(byUser.get(alpha.id)?.rank, byUser.get(beta.id)?.rank);
    assertEquals(byUser.get(gamma.id)?.points, 10);
    assert((byUser.get(gamma.id)?.rank ?? 0) > (byUser.get(alpha.id)?.rank ?? 0));
    assertEquals(byUser.get(excluded.id)?.points, 10, 'only the 31-day old visible approval counts');

    const withoutViewer = await feed(f.db);
    assertEquals(withoutViewer.error, null);
    const expectedFeedIds = new Set([alpha10.id, beta10.id, gamma10.id]);
    const seededFeed = ((withoutViewer.data ?? []) as FeedRow[]).filter((row) => expectedFeedIds.has(row.id));
    assertEquals(seededFeed.map((row) => row.id)[0], beta10.id, 'two likes sort before one like');
    assertEquals(seededFeed.map((row) => row.id).sort(), [...expectedFeedIds].sort());
    assert(seededFeed.every((row) => row.liked_by_me === false));
    assert(((withoutViewer.data ?? []) as Record<string, unknown>[]).every((row) =>
      !('email' in row) && !('evidence_path' in row) && !('public_photo_path' in row),
    ));
    assert(!((withoutViewer.data ?? []) as FeedRow[])
      .some((row) => [old.id, hidden.id, pending.id, rejected.id].includes(row.id)));

    const forViewer = await feed(f.db, 50, 0, viewer.id);
    assertEquals(forViewer.error, null);
    const viewerRows = new Map(((forViewer.data ?? []) as FeedRow[]).map((row) => [row.id, row]));
    assertEquals(viewerRows.get(beta10.id)?.liked_by_me, true);
    assertEquals(viewerRows.get(alpha10.id)?.liked_by_me, true);
    assertEquals(viewerRows.get(gamma10.id)?.liked_by_me, false);

    const all = (withoutViewer.data ?? []) as FeedRow[];
    const ownIndexes = all.map((row, index) => expectedFeedIds.has(row.id) ? index : -1).filter((index) => index >= 0);
    const paged = await feed(f.db, 1, ownIndexes[1]);
    assertEquals(paged.error, null);
    assertEquals(paged.data?.[0]?.id, all[ownIndexes[1]].id);
    assert(!new Set([all[ownIndexes[0]].id]).has(paged.data?.[0]?.id), 'offset page must not duplicate the prior row');
  }),
});

Deno.test({
  name: 'public-read RPCs reject invalid pagination and anon/authenticated execution',
  ignore,
  fn: () => withFixtures(async (f) => {
    const user = await f.createUser('T16Denied');
    for (const result of [await leaderboard(f.db, 0), await feed(f.db, 51), await feed(f.db, 1, -1)]) {
      assertEquals(result.error?.code, 'P0001');
      assertEquals(result.error?.message, 'INVALID_REQUEST');
    }

    for (const client of [anonClient(), await f.signInAs(user)]) {
      for (const result of [await leaderboard(client), await feed(client)]) {
        assert(result.error !== null, 'non-service client must be rejected');
        assert(result.error.code === '42501' || /permission denied/i.test(result.error.message), result.error.message);
      }
    }
  }),
});

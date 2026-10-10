// T20 — PUT/DELETE /contributions/{id}/like. Real DEV database; APPROVED rows seeded with service role.
import { assertEquals } from 'jsr:@std/assert@1';
import { createHandler } from '../../supabase/functions/api/index.ts';
import { createSupabaseTokenVerifier } from '../../supabase/functions/api/domain/auth.ts';
import { createServiceClient } from '../../supabase/functions/api/domain/db.ts';
import { communityRoutes } from '../../supabase/functions/api/routes/community.ts';
import { hasDbEnv, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

type Handler = (req: Request) => Promise<Response>;

const handler = (): Handler =>
  createHandler(communityRoutes({ verifier: createSupabaseTokenVerifier(), db: createServiceClient }));

function like(h: Handler, method: 'PUT' | 'DELETE', id: string, token?: string): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return h(new Request(`${BASE}/api/v1/contributions/${id}/like`, { method, headers }));
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
): Promise<string> {
  const now = new Date().toISOString();
  const { data, error } = await f.db.from('contributions').insert(
    f.contributionRow(authorId, {
      action_type: actionType,
      points_snapshot: actionType === 'RECYCLING' ? 10 : 20,
      status: 'APPROVED',
      submitted_at: now,
      approved_at: now,
      public_photo_path: `public/${authorId}/${crypto.randomUUID()}.jpg`,
      ...overrides,
    }),
  ).select('id').single();
  if (error || !data) throw new Error(`seed failed: ${error?.message}`);
  return data.id;
}

async function expectError(res: Response, status: number, code: string): Promise<void> {
  assertEquals(res.status, status);
  assertEquals((await res.json()).error.code, code);
}

Deno.test({
  name: 'likes: 200 final state, idempotent PUT/DELETE; 403 own; 404 pending/hidden/unknown/non-uuid; 401; 403 no profile',
  ignore,
  async fn() {
    const f = new TestFixtures();
    try {
      await f.ensureMunicipality();
      const author = await f.createUser();
      const fan = await f.createUser();
      const noProfile = await f.createAuthUser();
      const authorToken = await tokenFor(f, author);
      const fanToken = await tokenFor(f, fan);
      const noProfileToken = await tokenFor(f, noProfile);
      const h = handler();

      const approved = await seed(f, author.id, 'RECYCLING');
      const pending = await seed(f, author.id, 'LITTER_COLLECTION', {
        status: 'PENDING',
        approved_at: null,
        public_photo_path: null,
      });
      const hiddenApproved = await seed(f, fan.id, 'RECYCLING', { hidden_at: new Date().toISOString() });

      const put = await like(h, 'PUT', approved, fanToken);
      assertEquals(put.status, 200);
      assertEquals(await put.json(), { liked: true, likeCount: 1 });
      const putAgain = await like(h, 'PUT', approved, fanToken);
      assertEquals(putAgain.status, 200);
      assertEquals(await putAgain.json(), { liked: true, likeCount: 1 });
      const rows = await f.db.from('likes').select('user_id').eq('contribution_id', approved);
      assertEquals(rows.data?.length, 1);

      const del = await like(h, 'DELETE', approved, fanToken);
      assertEquals(del.status, 200);
      assertEquals(await del.json(), { liked: false, likeCount: 0 });
      const delAgain = await like(h, 'DELETE', approved, fanToken);
      assertEquals(delAgain.status, 200);
      assertEquals(await delAgain.json(), { liked: false, likeCount: 0 });
      assertEquals(await (await like(h, 'PUT', approved, fanToken)).json(), { liked: true, likeCount: 1 });

      for (const method of ['PUT', 'DELETE'] as const) {
        await expectError(await like(h, method, approved, authorToken), 403, 'CANNOT_LIKE_OWN');
        await expectError(await like(h, method, pending, fanToken), 404, 'NOT_FOUND');
        await expectError(await like(h, method, hiddenApproved, authorToken), 404, 'NOT_FOUND');
        await expectError(await like(h, method, crypto.randomUUID(), fanToken), 404, 'NOT_FOUND');
        await expectError(await like(h, method, 'not-a-uuid', fanToken), 404, 'NOT_FOUND');
        await expectError(await like(h, method, approved), 401, 'AUTH_REQUIRED');
        await expectError(await like(h, method, approved, noProfileToken), 403, 'PROFILE_REQUIRED');
      }
      // Rejected requests left the single like in place and created none elsewhere.
      const all = await f.db.from('likes').select('contribution_id').eq('user_id', fan.id);
      assertEquals(all.data?.map((r) => r.contribution_id), [approved]);
    } finally {
      await f.cleanup();
    }
  },
});

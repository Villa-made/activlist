// T19 — POST /contributions/{id}/hide. Real DEV database; APPROVED rows seeded with service role.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createHandler } from '../../supabase/functions/api/index.ts';
import { createSupabaseTokenVerifier } from '../../supabase/functions/api/domain/auth.ts';
import { createServiceClient } from '../../supabase/functions/api/domain/db.ts';
import type { EvidenceInspector } from '../../supabase/functions/api/domain/ports.ts';
import { contributionRoutes } from '../../supabase/functions/api/routes/contributions.ts';
import { hasDbEnv, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

const inspector: EvidenceInspector = {
  inspect: () => ({ ok: true, mime: 'image/jpeg', captureExifAt: null }),
};

const handler = (): (req: Request) => Promise<Response> =>
  createHandler(contributionRoutes({
    verifier: createSupabaseTokenVerifier(),
    db: createServiceClient,
    inspector,
  }));

function hidePost(h: (req: Request) => Promise<Response>, id: string, token?: string): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return h(new Request(`${BASE}/api/v1/contributions/${id}/hide`, { method: 'POST', headers, body: '{}' }));
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

Deno.test({
  name: 'POST /contributions/{id}/hide: 200 hidden DTO, idempotent, 409 when not APPROVED, 404 foreign, 401 anonymous',
  ignore,
  async fn() {
    const f = new TestFixtures();
    try {
      await f.ensureMunicipality();
      const author = await f.createUser();
      const other = await f.createUser();
      const token = await tokenFor(f, author);
      const otherToken = await tokenFor(f, other);
      const h = handler();
      const approved = await seed(f, author.id, 'LITTER_COLLECTION');
      const pending = await seed(f, author.id, 'RECYCLING', {
        status: 'PENDING',
        approved_at: null,
        public_photo_path: null,
      });

      // Foreign user and anonymous cannot hide it; nothing changes.
      const foreign = await hidePost(h, approved, otherToken);
      assertEquals(foreign.status, 404);
      assertEquals((await foreign.json()).error.code, 'NOT_FOUND');
      const anonymous = await hidePost(h, approved);
      assertEquals(anonymous.status, 401);
      await anonymous.body?.cancel();
      const untouched = await f.db.from('contributions').select('hidden_at').eq('id', approved).single();
      assertEquals(untouched.data?.hidden_at, null);

      const res = await hidePost(h, approved, token);
      assertEquals(res.status, 200);
      const dto = await res.json();
      assertEquals(dto.id, approved);
      assertEquals(dto.status, 'APPROVED');
      assertEquals(dto.isHidden, true);
      assertEquals(dto.effectivePoints, 0);
      assertEquals(dto.canRetry, false);
      assertEquals(dto.canCancel, false);
      assert(!('evidence_path' in dto) && !('public_photo_path' in dto));
      const hiddenAt = (await f.db.from('contributions').select('hidden_at').eq('id', approved).single()).data
        ?.hidden_at;
      assert(hiddenAt);

      const again = await hidePost(h, approved, token);
      assertEquals(again.status, 200);
      assertEquals((await again.json()).isHidden, true);
      const hiddenAtAgain = (await f.db.from('contributions').select('hidden_at').eq('id', approved).single()).data
        ?.hidden_at;
      assertEquals(hiddenAtAgain, hiddenAt);

      const notApproved = await hidePost(h, pending, token);
      assertEquals(notApproved.status, 409);
      assertEquals((await notApproved.json()).error.code, 'INVALID_STATE');
    } finally {
      await f.cleanup();
    }
  },
});

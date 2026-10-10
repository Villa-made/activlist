// T16.c — public proxy for authorized, sanitized copies only.
import { assertEquals } from 'jsr:@std/assert@1';
import { handler } from '../../supabase/functions/api/index.ts';
import { PUBLISHED_BUCKET } from '../../supabase/functions/api/domain/ports.ts';
import { hasDbEnv, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

async function seed(
  f: TestFixtures,
  authorId: string,
  status: 'APPROVED' | 'PENDING' | 'REJECTED',
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; path: string }> {
  const id = crypto.randomUUID();
  const path = `${id}/1`;
  const approvedAt = new Date().toISOString();
  const { error } = await f.db.from('contributions').insert(f.contributionRow(authorId, {
    id,
    status,
    submitted_at: approvedAt,
    approved_at: status === 'APPROVED' ? approvedAt : null,
    public_photo_path: status === 'APPROVED' ? path : null,
    ...overrides,
  }));
  if (error) throw new Error(`seed failed: ${error.message}`);
  return { id, path };
}

async function uploadPublished(f: TestFixtures, path: string): Promise<void> {
  const { error } = await f.db.storage.from(PUBLISHED_BUCKET).upload(path, JPEG, { contentType: 'image/jpeg' });
  if (error) throw new Error(`published upload failed: ${error.message}`);
  f.trackObject(PUBLISHED_BUCKET, path);
}

async function media(id: string, origin?: string): Promise<Response> {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  return await handler(new Request(`${BASE}/api/v1/media/${id}`, { headers }));
}

async function bodyOf(response: Response): Promise<unknown> {
  return await response.json();
}

Deno.test({
  name: 'GET /media/:id serves exactly a visible sanitized copy with no-store headers',
  ignore,
  fn: () => withFixtures(async (f) => {
    const user = await f.createUser(`T16cVisible${crypto.randomUUID().slice(0, 8)}`);
    const visible = await seed(f, user.id, 'APPROVED');
    await uploadPublished(f, visible.path);

    const origin = 'https://app.example.test';
    const previousOrigins = Deno.env.get('ALLOWED_ORIGINS');
    Deno.env.set('ALLOWED_ORIGINS', origin);
    try {
      const response = await media(visible.id, origin);
      assertEquals(response.status, 200);
      assertEquals(response.headers.get('content-type'), 'image/jpeg');
      assertEquals(response.headers.get('cache-control'), 'no-store');
      assertEquals(response.headers.get('x-content-type-options'), 'nosniff');
      assertEquals(response.headers.get('access-control-allow-origin'), origin);
      assertEquals(new Uint8Array(await response.arrayBuffer()), JPEG);
    } finally {
      if (previousOrigins === undefined) Deno.env.delete('ALLOWED_ORIGINS');
      else Deno.env.set('ALLOWED_ORIGINS', previousOrigins);
    }
  }),
});

Deno.test({
  name: 'GET /media/:id hides every unavailable state behind the same 404 response',
  ignore,
  fn: () => withFixtures(async (f) => {
    const user = await f.createUser(`T16cDenied${crypto.randomUUID().slice(0, 8)}`);
    const hidden = await seed(f, user.id, 'APPROVED');
    await uploadPublished(f, hidden.path);
    assertEquals((await f.db.rpc('hide_contribution', { p_id: hidden.id, p_author: user.id })).error, null);

    const pending = await seed(f, user.id, 'PENDING');
    const rejected = await seed(f, user.id, 'REJECTED');
    const noObject = await seed(f, user.id, 'APPROVED');
    const evidenceOnly = await seed(f, user.id, 'PENDING', { action_type: 'LITTER_COLLECTION', points_snapshot: 20 });
    const evidencePath = `staging/${user.id}/${crypto.randomUUID()}`;
    assertEquals((await f.db.from('contributions').update({ evidence_path: evidencePath }).eq('id', evidenceOnly.id)).error, null);
    const evidenceUpload = await f.db.storage.from('evidence-private').upload(evidencePath, JPEG, { contentType: 'image/jpeg' });
    assertEquals(evidenceUpload.error, null);
    f.trackObject('evidence-private', evidencePath);

    const unavailable = [hidden.id, pending.id, rejected.id, noObject.id, evidenceOnly.id, crypto.randomUUID(), 'not-a-uuid'];
    const bodies: unknown[] = [];
    for (const id of unavailable) {
      const response = await media(id);
      assertEquals(response.status, 404);
      bodies.push(await bodyOf(response));
    }
    for (const body of bodies.slice(1)) assertEquals(body, bodies[0]);
  }),
});

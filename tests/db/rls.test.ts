// T01.c — default-deny grants, own-profile policy, private buckets, no exposed RPC.
// Data is prepared with the service-role client; every denial is proven with real anon / signed-in clients
// (never with SQL run as postgres, which ignores RLS).
import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1';
import { anonClient, hasDbEnv, randomSuffix, TestFixtures } from './support.ts';

const ignore = !hasDbEnv();
const TABLES = ['profiles', 'municipalities', 'contributions', 'likes', 'reports'];
const BUCKETS = ['evidence-private', 'published-private'];
const MAX_BYTES = 5 * 1024 * 1024;

// Smallest JPEG-looking payload: SOI + JFIF APP0 + EOI.
const TINY_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0xff, 0xd9,
]);

async function withFixtures(fn: (f: TestFixtures) => Promise<void>): Promise<void> {
  const fixtures = new TestFixtures();
  try {
    await fixtures.ensureMunicipality();
    await fn(fixtures);
  } finally {
    await fixtures.cleanup();
  }
}

/** A denial is either an error (no grant / policy) or zero affected rows. */
function assertDenied(result: { data: unknown[] | null; error: unknown }, what: string): void {
  const rows = result.data?.length ?? 0;
  assert(result.error !== null || rows === 0, `${what} must be denied (got ${rows} rows)`);
}

function jwtPayload(token: string): { exp?: number; iat?: number } {
  const part = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
  return JSON.parse(atob(part));
}

Deno.test({
  name: 'a) anon cannot read any table nor insert into contributions/likes/reports',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const seeded = await f.db.from('contributions').insert(f.contributionRow(user.id)).select('id').single();
      assertEquals(seeded.error, null);

      const anon = anonClient();
      for (const table of TABLES) {
        assertDenied(await anon.from(table).select('*').limit(5), `anon select ${table}`);
      }

      const contribution = await anon.from('contributions').insert(f.contributionRow(user.id));
      assertExists(contribution.error, 'anon insert contributions must fail');
      const like = await anon.from('likes').insert({ user_id: user.id, contribution_id: seeded.data!.id });
      assertExists(like.error, 'anon insert likes must fail');
      const report = await anon.from('reports').insert({ contribution_id: seeded.data!.id, reason: 'spam' });
      assertExists(report.error, 'anon insert reports must fail');
    }),
});

Deno.test({
  name: 'b) user A reads only their own profile and cannot write contributions or profiles',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const a = await f.createUser();
      const b = await f.createUser();
      const seeded = await f.db.from('contributions').insert(f.contributionRow(b.id)).select('id').single();
      assertEquals(seeded.error, null);
      const clientA = await f.signInAs(a);

      const own = await clientA.from('profiles').select('user_id, alias').eq('user_id', a.id);
      assertEquals(own.error, null);
      assertEquals(own.data?.length, 1);
      assertEquals(own.data![0].alias, a.alias);

      const other = await clientA.from('profiles').select('user_id').eq('user_id', b.id);
      assertEquals(other.data?.length ?? 0, 0, "A must not read B's profile");
      const all = await clientA.from('profiles').select('user_id');
      assertEquals(all.data?.length, 1, 'only the own profile is visible');

      // No write grant on profiles: the alias stays as it was.
      const renamed = await clientA.from('profiles').update({ alias: `Hack${randomSuffix()}` }).eq('user_id', a.id)
        .select();
      assertDenied(renamed, 'A update own alias');
      const check = await f.db.from('profiles').select('alias').eq('user_id', a.id).single();
      assertEquals(check.data?.alias, a.alias);

      // Nothing readable or writable on the other tables.
      for (const table of ['contributions', 'likes', 'reports', 'municipalities']) {
        assertDenied(await clientA.from(table).select('*').limit(5), `A select ${table}`);
      }
      const insert = await clientA.from('contributions').insert(f.contributionRow(a.id));
      assertExists(insert.error, 'A insert contributions must fail');
      const update = await clientA.from('contributions').update({ status: 'APPROVED' }).eq('id', seeded.data!.id)
        .select();
      assertDenied(update, 'A update contributions');
      const stored = await f.db.from('contributions').select('status').eq('id', seeded.data!.id).single();
      assertEquals(stored.data?.status, 'PENDING');
    }),
});

Deno.test({
  name: 'service_role keeps read/write access to the five tables (backend sanity check)',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const user = await f.createUser();
      const inserted = await f.db.from('contributions').insert(f.contributionRow(user.id)).select('id').single();
      assertEquals(inserted.error, null);
      for (const table of TABLES) {
        const { error } = await f.db.from(table).select('*').limit(1);
        assertEquals(error, null, `service_role must read ${table}`);
      }
      const updated = await f.db.from('contributions').update({ status: 'CANCELLED' }).eq('id', inserted.data!.id);
      assertEquals(updated.error, null);
    }),
});

Deno.test({
  name: 'c) buckets are private with 5 MB / image-only limits; objects are not downloadable by anon or other users',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const { data: buckets, error } = await f.db.storage.listBuckets();
      assertEquals(error, null);
      for (const id of BUCKETS) {
        const bucket = buckets?.find((b) => b.id === id);
        assertExists(bucket, `bucket ${id} must exist`);
        assertEquals(bucket.public, false, `${id} must be private`);
        assertEquals(bucket.file_size_limit, MAX_BYTES);
        assertEquals([...(bucket.allowed_mime_types ?? [])].sort(), ['image/jpeg', 'image/png', 'image/webp']);
      }

      const a = await f.createUser();
      const path = `staging/${a.id}/${crypto.randomUUID()}`;
      f.trackObject('evidence-private', path);
      const upload = await f.db.storage.from('evidence-private').upload(path, TINY_JPEG, { contentType: 'image/jpeg' });
      assertEquals(upload.error, null);

      const service = await f.db.storage.from('evidence-private').download(path);
      assertEquals(service.error, null, 'service_role can read the object');

      const anon = await anonClient().storage.from('evidence-private').download(path);
      assertExists(anon.error, 'anon download must fail');
      const clientA = await f.signInAs(a);
      const owner = await clientA.storage.from('evidence-private').download(path);
      assertExists(owner.error, 'not even the owner downloads directly: access is via the API');

      // The "public" URL must not serve a private bucket either.
      const publicUrl = anonClient().storage.from('evidence-private').getPublicUrl(path).data.publicUrl;
      const res = await fetch(publicUrl);
      await res.body?.cancel();
      assert(!res.ok, `public URL must not serve the object (status ${res.status})`);

      const list = await clientA.storage.from('evidence-private').list(`staging/${a.id}`);
      assertEquals(list.data?.length ?? 0, 0, 'owner cannot list objects directly');
    }),
});

Deno.test({
  name: 'd) signed upload URL: image within limit uploads; >5 MB and text/plain are rejected; token lifetime documented',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const a = await f.createUser();
      const bucket = 'evidence-private';
      const anon = anonClient();

      const okPath = `staging/${a.id}/${crypto.randomUUID()}`;
      f.trackObject(bucket, okPath);
      const signed = await f.db.storage.from(bucket).createSignedUploadUrl(okPath);
      assertEquals(signed.error, null);
      assertExists(signed.data?.token);

      // Real token lifetime (T07 needs it for CreateUploadResponse.expiresAt).
      const { exp, iat } = jwtPayload(signed.data!.token);
      assertExists(exp, 'upload token is a JWT with exp');
      const lifetimeSeconds = iat ? exp - iat : exp - Math.floor(Date.now() / 1000);
      console.log(`signed upload token lifetime: ${lifetimeSeconds}s (iat ${iat ?? 'absent'})`);
      assertEquals(Math.round(lifetimeSeconds / 60), 120, 'documented lifetime is 2 hours');

      const ok = await anon.storage.from(bucket).uploadToSignedUrl(okPath, signed.data!.token, TINY_JPEG, {
        contentType: 'image/jpeg',
      });
      assertEquals(ok.error, null, 'small JPEG through signed URL must be accepted');
      const stored = await f.db.storage.from(bucket).download(okPath);
      assertEquals(stored.error, null);

      const bigPath = `staging/${a.id}/${crypto.randomUUID()}`;
      f.trackObject(bucket, bigPath);
      const bigSigned = await f.db.storage.from(bucket).createSignedUploadUrl(bigPath);
      const big = await anon.storage.from(bucket).uploadToSignedUrl(
        bigPath,
        bigSigned.data!.token,
        new Uint8Array(MAX_BYTES + 1),
        { contentType: 'image/jpeg' },
      );
      assertExists(big.error, '5 MB + 1 byte must be rejected');

      const textPath = `staging/${a.id}/${crypto.randomUUID()}`;
      f.trackObject(bucket, textPath);
      const textSigned = await f.db.storage.from(bucket).createSignedUploadUrl(textPath);
      const text = await anon.storage.from(bucket).uploadToSignedUrl(
        textPath,
        textSigned.data!.token,
        new Blob(['not an image'], { type: 'text/plain' }),
        { contentType: 'text/plain' },
      );
      assertExists(text.error, 'text/plain must be rejected');

      // Rejected uploads left nothing behind.
      for (const path of [bigPath, textPath]) {
        const check = await f.db.storage.from(bucket).download(path);
        assertExists(check.error, `${path} must not exist`);
      }
    }),
});

Deno.test({
  name: 'e) rls_auto_enable() cannot be called through the API by anon or a signed-in user',
  ignore,
  fn: () =>
    withFixtures(async (f) => {
      const a = await f.createUser();
      const viaAnon = await anonClient().rpc('rls_auto_enable');
      // 42501 = insufficient_privilege: denied by the missing EXECUTE grant, not by the function body.
      assertEquals(viaAnon.error?.code, '42501', `anon rpc must lack EXECUTE (${viaAnon.error?.message})`);
      const viaUser = await (await f.signInAs(a)).rpc('rls_auto_enable');
      assertEquals(viaUser.error?.code, '42501', `authenticated rpc must lack EXECUTE (${viaUser.error?.message})`);
    }),
});

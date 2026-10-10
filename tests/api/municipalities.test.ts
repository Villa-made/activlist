// T10.c1 — GET /municipalities?q= (public, catalogue search in memory).
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { handler } from '../../supabase/functions/api/index.ts';
import { hasDbEnv } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();

interface Item {
  code: string;
  name: string;
  provinceName: string;
}

async function get(query: string, headers: HeadersInit = {}): Promise<Response> {
  return await handler(new Request(`${BASE}/api/v1/municipalities${query}`, { method: 'GET', headers }));
}

async function items(query: string): Promise<Item[]> {
  const res = await get(query);
  assertEquals(res.status, 200);
  return (await res.json()).items;
}

async function assertInvalid(query: string, field: string): Promise<void> {
  const res = await get(query);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.code, 'INVALID_REQUEST');
  assertEquals(body.error.details.field, field);
}

Deno.test({
  name: 'q=barc finds 08019 Barcelona, case-insensitively',
  ignore,
  fn: async () => {
    for (const q of ['barc', 'BARC']) {
      const found = await items(`?q=${q}`);
      const barcelona = found.find((m) => m.code === '08019');
      assert(barcelona, `08019 missing for q=${q}`);
      assertEquals(barcelona, { code: '08019', name: 'Barcelona', provinceName: 'Barcelona' });
    }
  },
});

Deno.test({
  name: 'q=valles matches names with diacritics (Vallès)',
  ignore,
  fn: async () => {
    const found = await items('?q=valles');
    assert(found.length > 0);
    assert(found.some((m) => m.name.includes('Vallès')));
  },
});

Deno.test({
  name: 'digits-only q also matches the code prefix',
  ignore,
  fn: async () => {
    const found = await items('?q=080');
    assert(found.length > 0);
    assert(found.every((m) => m.code.startsWith('080')));
  },
});

Deno.test({
  name: 'results are alphabetical and respect limit (default 20, max 50)',
  ignore,
  fn: async () => {
    const three = await items('?q=sa&limit=3');
    assert(three.length > 0 && three.length <= 3);
    const defaults = await items('?q=sa');
    assert(defaults.length <= 20);
    const fifty = await items('?q=sa&limit=50');
    assert(fifty.length <= 50);
    const names = fifty.map((m) => m.name);
    const sorted = [...names].sort((a, b) =>
      a.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().localeCompare(
        b.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
      )
    );
    assertEquals(names, sorted);
  },
});

Deno.test({
  name: 'invalid q or limit is 400 INVALID_REQUEST with details.field',
  ignore,
  fn: async () => {
    await assertInvalid('?q=b', 'q');
    await assertInvalid('?q=%20%20', 'q');
    await assertInvalid('', 'q');
    await assertInvalid('?q=barc&limit=51', 'limit');
    await assertInvalid('?q=barc&limit=0', 'limit');
    await assertInvalid('?q=barc&limit=abc', 'limit');
  },
});

Deno.test({
  name: 'is public and returns exactly items + nextCursor null with minimal item fields',
  ignore,
  fn: async () => {
    const res = await get('?q=barc');
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Object.keys(body).sort(), ['items', 'nextCursor']);
    assertEquals(body.nextCursor, null);
    assert(body.items.length > 0);
    for (const item of body.items) {
      assertEquals(Object.keys(item).sort(), ['code', 'name', 'provinceName']);
    }
  },
});

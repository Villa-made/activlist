// T01.d — official INE municipality catalog loaded in DEV (scope: province 08 Barcelona only).
// Counts come from the real source file; nothing here is a sample.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { anonClient, hasDbEnv, serviceClient } from './support.ts';

const ignore = !hasDbEnv();

// Municipalities of province 08 in diccionario26.xlsx (INE, "Relación de municipios y códigos ... a 1 de enero de
// 2026", https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx). Same number the script prints with
// `ine-to-sql.ts <xlsx> <out.sql> --province=08` ("selected (province 08): 311"). The full file has 8132 rows.
const INE_2026_BARCELONA_ROWS = 311;

Deno.test({
  name: 'DEV holds exactly the Barcelona (08) rows of the INE source file and nothing else',
  ignore,
  fn: async () => {
    const db = serviceClient();
    const all = await db.from('municipalities').select('code', { count: 'exact', head: true });
    assertEquals(all.error, null);
    assertEquals(all.count, INE_2026_BARCELONA_ROWS);

    const barcelona = await db.from('municipalities').select('code', { count: 'exact', head: true }).like('code', '08%');
    assertEquals(barcelona.error, null);
    assertEquals(barcelona.count, INE_2026_BARCELONA_ROWS);
  },
});

Deno.test({
  name: 'known codes: 08019 Barcelona/Barcelona; 28079 (Madrid, out of scope) and 99999 do not exist',
  ignore,
  fn: async () => {
    const rows = await serviceClient().from('municipalities').select('code, name, province_name').in('code', [
      '08019',
      '28079',
      '99999',
    ]);
    assertEquals(rows.error, null);
    const byCode = new Map((rows.data ?? []).map((r) => [r.code, r]));
    assertEquals(byCode.get('08019'), { code: '08019', name: 'Barcelona', province_name: 'Barcelona' });
    assertEquals(byCode.has('28079'), false);
    assertEquals(byCode.has('99999'), false);
  },
});

Deno.test({
  name: 'INE names are kept as published (article after the comma, apostrophes)',
  ignore,
  fn: async () => {
    const rows = await serviceClient().from('municipalities').select('code, name').in('code', ['08101', '08005']);
    assertEquals(rows.error, null);
    const names = Object.fromEntries((rows.data ?? []).map((r) => [r.code, r.name]));
    assertEquals(names['08101'], "Hospitalet de Llobregat, L'");
    assertEquals(names['08005'], "Ametlla del Vallès, L'");
  },
});

Deno.test({
  name: 'anon cannot read municipalities directly (served through /municipalities, T10.c)',
  ignore,
  fn: async () => {
    const { data, error } = await anonClient().from('municipalities').select('code').limit(5);
    assert(error !== null || (data ?? []).length === 0, 'anon must not read municipalities');
  },
});

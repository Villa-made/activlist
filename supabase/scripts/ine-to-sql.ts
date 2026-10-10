// T01.d — INE municipality catalog -> SQL migration(s).
//
// Usage:
//   deno run --allow-read --allow-write --allow-import=cdn.sheetjs.com \
//     supabase/scripts/ine-to-sql.ts <entrada.xlsx> <salida.sql> [--parts=N] [--downloaded=YYYY-MM-DD] [--province=CC]
//
// Source file: "Relación de municipios y códigos por comunidades autónomas y provincias a 1 de enero de 2026"
//   https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx
//   page: https://ine.es/dyngs/INEbase/es/operacion.htm?c=Estadistica_C&cid=1254736177031&menu=ultiDatos&idp=1254734710990
// Columns read: CPRO (2 digits), CMUN (3 digits), DC (check digit, ignored), NOMBRE (kept exactly as INE gives it).
// code = CPRO || CMUN (5 digits, no DC). Nothing is invented, reordered or corrected by hand.
//
// XLSX reader: SheetJS Community Edition 0.20.3 from its official distribution (cdn.sheetjs.com);
// the npm "xlsx" package is stale (0.18.5). https://docs.sheetjs.com/docs/getting-started/installation/deno/
//
// --parts=N (1..4) splits the output into N files; part k>1 is written next to <salida.sql> with the numeric
// version prefix of its file name increased by k-1 (20261010000300_x.sql -> 20261010000301_x.sql ...).
// --downloaded defaults to the modification date of the input file.
// --province=CC keeps only the municipalities of that INE province code (2 digits, e.g. 08 = Barcelona).
// The script prints rows read and rows written and exits with an error if they differ.

// @deno-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const SOURCE_URL = 'https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx';
const PROVINCES_URL = 'https://www.ine.es/daco/daco42/codmun/cod_provincia.htm';

// Official INE province table (code -> literal), as published at PROVINCES_URL (52 rows).
const PROVINCES: Record<string, string> = {
  '01': 'Araba/Álava',
  '02': 'Albacete',
  '03': 'Alicante/Alacant',
  '04': 'Almería',
  '05': 'Ávila',
  '06': 'Badajoz',
  '07': 'Balears, Illes',
  '08': 'Barcelona',
  '09': 'Burgos',
  '10': 'Cáceres',
  '11': 'Cádiz',
  '12': 'Castellón/Castelló',
  '13': 'Ciudad Real',
  '14': 'Córdoba',
  '15': 'Coruña, A',
  '16': 'Cuenca',
  '17': 'Girona',
  '18': 'Granada',
  '19': 'Guadalajara',
  '20': 'Gipuzkoa',
  '21': 'Huelva',
  '22': 'Huesca',
  '23': 'Jaén',
  '24': 'León',
  '25': 'Lleida',
  '26': 'Rioja, La',
  '27': 'Lugo',
  '28': 'Madrid',
  '29': 'Málaga',
  '30': 'Murcia',
  '31': 'Navarra',
  '32': 'Ourense',
  '33': 'Asturias',
  '34': 'Palencia',
  '35': 'Palmas, Las',
  '36': 'Pontevedra',
  '37': 'Salamanca',
  '38': 'Santa Cruz de Tenerife',
  '39': 'Cantabria',
  '40': 'Segovia',
  '41': 'Sevilla',
  '42': 'Soria',
  '43': 'Tarragona',
  '44': 'Teruel',
  '45': 'Toledo',
  '46': 'Valencia/València',
  '47': 'Valladolid',
  '48': 'Bizkaia',
  '49': 'Zamora',
  '50': 'Zaragoza',
  '51': 'Ceuta',
  '52': 'Melilla',
};

interface Municipality {
  code: string;
  name: string;
  provinceName: string;
}

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  Deno.exit(1);
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Reads the first sheet; returns the municipality rows and how many data rows it contained. */
function readMunicipalities(path: string): Municipality[] {
  const workbook = XLSX.read(Deno.readFileSync(path), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });

  const headerIndex = rows.findIndex((r) => r.map((c) => String(c).trim()).join('|').includes('CPRO|CMUN|DC|NOMBRE'));
  if (headerIndex < 0) fail('header row CPRO|CMUN|DC|NOMBRE not found');
  const header = rows[headerIndex].map((c) => String(c).trim());
  const iPro = header.indexOf('CPRO');
  const iMun = header.indexOf('CMUN');
  const iName = header.indexOf('NOMBRE');

  const out: Municipality[] = [];
  const seen = new Set<string>();
  for (const [offset, row] of rows.slice(headerIndex + 1).entries()) {
    const line = headerIndex + 2 + offset;
    const cpro = String(row[iPro] ?? '').trim();
    const cmun = String(row[iMun] ?? '').trim();
    const name = String(row[iName] ?? '');
    if (!/^[0-9]{2}$/.test(cpro)) fail(`row ${line}: CPRO "${cpro}" is not 2 digits`);
    if (!/^[0-9]{3}$/.test(cmun)) fail(`row ${line}: CMUN "${cmun}" is not 3 digits`);
    if (name.trim() === '') fail(`row ${line}: empty NOMBRE`);
    const provinceName = PROVINCES[cpro];
    if (!provinceName) fail(`row ${line}: unknown province code ${cpro}`);
    const code = cpro + cmun;
    if (seen.has(code)) fail(`row ${line}: duplicate code ${code}`);
    seen.add(code);
    out.push({ code, name, provinceName });
  }
  return out;
}

async function sha256Hex(path: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Deno.readFileSync(path));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function partPath(base: string, index: number): string {
  if (index === 0) return base;
  const slash = Math.max(base.lastIndexOf('/'), base.lastIndexOf('\\')) + 1;
  const match = /^(\d+)(_.*)$/.exec(base.slice(slash));
  if (!match) fail('with --parts>1 the output file name must start with a numeric version, e.g. 20261010000300_x.sql');
  const bumped = (BigInt(match[1]) + BigInt(index)).toString().padStart(match[1].length, '0');
  return base.slice(0, slash) + bumped + match[2];
}

async function main(): Promise<void> {
  const positional = Deno.args.filter((a) => !a.startsWith('--'));
  const flag = (name: string) => Deno.args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  if (positional.length !== 2) fail('usage: ine-to-sql.ts <entrada.xlsx> <salida.sql> [--parts=N] [--downloaded=YYYY-MM-DD]');
  const [input, output] = positional;
  const parts = Number(flag('parts') ?? '1');
  if (!Number.isInteger(parts) || parts < 1 || parts > 4) fail('--parts must be an integer between 1 and 4');
  const downloaded = flag('downloaded') ?? Deno.statSync(input).mtime!.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(downloaded)) fail('--downloaded must be YYYY-MM-DD');

  const province = flag("province");
  if (province !== undefined && !/^[0-9]{2}$/.test(province)) fail("--province must be 2 digits");
  const all = readMunicipalities(input);
  const municipalities = province ? all.filter((m) => m.code.startsWith(province)) : all;
  if (municipalities.length === 0) fail("no rows selected");
  console.log(`source rows: ${all.length}; selected${province ? ` (province ${province})` : ""}: ${municipalities.length}`);
  const rowsRead = municipalities.length;
  const hash = await sha256Hex(input);

  const perPart = Math.ceil(rowsRead / parts);
  let rowsWritten = 0;
  for (let p = 0; p < parts; p++) {
    const chunk = municipalities.slice(p * perPart, (p + 1) * perPart);
    if (chunk.length === 0) continue;
    const lines = chunk.map((m) => `  (${sqlString(m.code)}, ${sqlString(m.name)}, ${sqlString(m.provinceName)})`);
    const sql = [
      '-- T01.d — Official INE municipality catalog (generated by supabase/scripts/ine-to-sql.ts; do not edit by hand).',
      `-- Source: ${SOURCE_URL}`,
      '-- Title: Relación de municipios y códigos por comunidades autónomas y provincias a 1 de enero de 2026',
      `-- Provinces: ${PROVINCES_URL}`,
      `-- Downloaded: ${downloaded}; source sha256: ${hash}`,
      province
        ? `-- ${all.length} en el fuente; ${chunk.length} en este fichero (CPRO=${province})`
        : `-- Rows in source: ${all.length}; rows in this file: ${chunk.length} (part ${p + 1} of ${parts})`,
      ...(province === '08'
        ? ['-- Este fichero 000300 equivale a las versiones remotas municipalities_ine_1, municipalities_ine_2, municipalities_ine_3 y municipalities_barcelona_only.']
        : []),
      '-- code = CPRO(2) || CMUN(3), without the DC check digit. name = NOMBRE exactly as published.',
      '',
      'insert into public.municipalities (code, name, province_name) values',
      lines.join(',\n'),
      'on conflict (code) do update set name = excluded.name, province_name = excluded.province_name;',
      '',
    ].join('\n');
    Deno.writeTextFileSync(partPath(output, p), sql);
    rowsWritten += lines.length;
    console.log(`wrote ${partPath(output, p)} (${chunk.length} rows, ${new TextEncoder().encode(sql).length} bytes)`);
  }

  console.log(`rows read: ${rowsRead}`);
  console.log(`rows written: ${rowsWritten}`);
  if (rowsRead !== rowsWritten) fail(`rows read (${rowsRead}) != rows written (${rowsWritten})`);
}

await main();

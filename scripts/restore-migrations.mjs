/**
 * Rebuilds supabase/migrations/ from a Supabase SQL Editor export.
 *
 * The migration files were untracked and a `git clean` removed 73 of them. The
 * database still records every applied migration, including its SQL, in
 * supabase_migrations.schema_migrations — so the export of that table is a
 * complete source for putting the files back.
 *
 * Usage:  node scripts/restore-migrations.mjs <export.csv|export.json>
 *
 * Accepts either format. Existing files are left alone rather than overwritten,
 * so the five that survived in git keep their exact tracked contents.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/restore-migrations.mjs <export.csv|export.json>');
  process.exit(1);
}

/** RFC4180 — fields can contain commas, quotes and newlines, and SQL has all three. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const raw = readFileSync(src, 'utf8');
const rows = raw.trimStart().startsWith('[') ? JSON.parse(raw) : parseCsv(raw);

const dir = join(process.cwd(), 'supabase', 'migrations');
mkdirSync(dir, { recursive: true });

let written = 0, skipped = 0, empty = 0;
for (const r of rows) {
  const version = String(r.version ?? '').trim();
  const name = String(r.name ?? '').trim();
  const sql = r.sql ?? '';
  if (!version) continue;
  if (!sql.trim()) { empty++; console.warn(`  ! ${version} has no recorded SQL`); continue; }

  const file = join(dir, name ? `${version}_${name}.sql` : `${version}.sql`);
  if (existsSync(file)) { skipped++; continue; }

  // Statements were joined with ';\n' by the export query; restore the final
  // terminator so each file is valid standalone SQL.
  const body = sql.replace(/\r\n/g, '\n').trimEnd();
  writeFileSync(file, body.endsWith(';') ? body + '\n' : body + ';\n', 'utf8');
  written++;
}

console.log(`\n${written} written, ${skipped} already present, ${empty} with no SQL`);
console.log(`total rows in export: ${rows.length}`);

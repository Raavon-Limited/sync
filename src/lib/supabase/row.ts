/**
 * `Row` - the shape of a PostgREST result row inside a query module.
 *
 * WHY THIS EXISTS AS ONE FILE
 * ---------------------------
 * PostgREST returns exactly the columns named in the `.select()` string, plus
 * whatever shape the embedded resource syntax produces for joins. None of that
 * matches the generated table types in `types/database.types.ts`, which
 * describe whole tables. So query modules cast rows to a loose record before
 * mapping them into a real, exported interface.
 *
 * That idiom had been copy-pasted as a local `type Row = Record<string, any>`
 * into fourteen separate files, which meant fourteen `no-explicit-any` lint
 * errors and fourteen places to change if the approach ever improves. It is one
 * escape hatch, declared and justified once, and imported everywhere.
 *
 * RULES FOR USING IT
 * ------------------
 * - Only in a query/data module, only for the raw PostgREST result.
 * - Never in a public signature. Every exported function maps `Row` into a
 *   declared interface before returning; nothing typed `Row` reaches a
 *   component.
 * - It is not a licence to skip validation. A column that can be null still
 *   needs a null check, and a numeric column can arrive as a string.
 *
 * If you find yourself reaching for this outside a query module, you want a
 * real interface instead.
 */

/* eslint-disable-next-line @typescript-eslint/no-explicit-any --
   The single, deliberate `any` in the data layer. See the note above: the
   alternative, `Record<string, unknown>`, makes every `row.foo.bar` access a
   type error and would push casts back into the fourteen call sites this
   file exists to remove. */
export type Row = Record<string, any>;

/**
 * Scheduled hygiene for the verification bucket.
 *
 * Two sweeps, one schedule:
 *   ORPHANS  files with no `verification_documents` row, older than 24h. They
 *            come from a failure between the storage upload and the row insert,
 *            which cannot be one transaction.
 *   EXPIRED  approved documents past their retention window — 3 days for
 *            transient proof, 30 for the live photo and government ID. The row
 *            survives; only the object is deleted.
 *
 * Vercel Cron example (vercel.json):
 *   { "crons": [{ "path": "/api/cron/verification-retention", "schedule": "0 4 * * *" }] }
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically.
 *
 * `?dry=1` reports what WOULD go without deleting anything. Worth using the
 * first time it runs against real data — this route deletes people's identity
 * documents, and the only way to check that rule is right is to read the list
 * before it acts on it.
 */
import { reconcileOrphans, purgeExpiredFiles } from '@/modules/verification/retention';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dry = new URL(req.url).searchParams.get('dry') === '1';

  try {
    // Orphans first: a file the retention sweep is about to delete should not
    // also be reported as an orphan on the same run.
    const orphans = await reconcileOrphans(dry);
    const expired = await purgeExpiredFiles(dry);

    const errors = [...orphans.errors, ...expired.errors];

    return Response.json({
      dryRun: dry,
      orphans: { found: orphans.orphans.length, deleted: orphans.deleted },
      expired: { found: expired.expired.length, deleted: expired.deleted },
      // Paths only in a dry run: a live run has already deleted them and the
      // list would be a log of identity documents for no reason.
      ...(dry
        ? {
            orphanPaths: orphans.orphans.map((o) => o.path),
            expiredPaths: expired.expired.map((e) => `${e.docType} · ${e.path}`),
          }
        : {}),
      errors,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Sweep failed' },
      { status: 500 },
    );
  }
}

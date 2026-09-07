/**
 * Signed links to people's live photos, for the queue cards.
 *
 * WHY THE FACE IS ON THE CARD AT ALL
 *   A verification queue exists to be scanned, and a name plus a badge is not
 *   how a reviewer recognises a submission they half-remember. The live photo is
 *   the one image every folder has, and it is the same image the review screen
 *   holds against the government ID   so the card carries it and the queue
 *   becomes scannable by sight. The landlord list proved this out first; this
 *   module is that logic lifted out so the vendor and rider queues get it
 *   without a third copy drifting from the first two.
 *
 * ONE ROUND TRIP FOR EVERYBODY
 *   Not one request per account. The list is the screen a reviewer scans, and a
 *   cascade of images arriving one at a time is precisely what makes a queue
 *   feel slow.
 *
 * THE LINKS EXPIRE
 *   Five minutes, same as everywhere else these documents are touched. A
 *   private-bucket object holding somebody's face must not be reachable by a URL
 *   that outlives the page it was rendered on.
 */
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Row } from '@/lib/supabase/row';

/** Signed selfie URL per owner id. Owners with no usable photo are absent. */
export async function selfieUrlsFor(ownerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // An empty `.in()` is not a no-op in PostgREST   it matches everything   so
  // the guard is load-bearing, not a micro-optimisation.
  if (ownerIds.length === 0) return out;

  const admin = createAdminClient();

  const { data: selfies } = await admin
    .from('verification_documents')
    .select('owner_id, storage_path, uploaded_at')
    .eq('doc_type', 'selfie')
    .in('owner_id', ownerIds)
    // Oldest first, so the last write into the map below is the NEWEST photo.
    // Anyone who re-submitted after a bounce has more than one.
    .order('uploaded_at', { ascending: true });

  const pathByOwner = new Map<string, string>();
  for (const d of (selfies ?? []) as Row[]) pathByOwner.set(d.owner_id, d.storage_path);
  if (pathByOwner.size === 0) return out;

  const { data: signed } = await admin.storage
    .from('verification-docs')
    .createSignedUrls([...pathByOwner.values()], 60 * 5);

  const urlByPath = new Map<string, string>();
  for (const s of signed ?? []) {
    // `path` is null on entries that failed. Those owners get the placeholder
    // rather than the whole list blanking.
    if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  for (const [owner, path] of pathByOwner) {
    const url = urlByPath.get(path);
    if (url) out.set(owner, url);
  }
  return out;
}

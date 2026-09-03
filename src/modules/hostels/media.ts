/**
 * Listing media - the photos and the walkthrough video on a hostel.
 *
 * WHY THIS IS NOT `uploadVendorImage`
 *   That one targets `public-media`, which accepts image mime types at 5MB
 *   because avatars and logos are fetched on nearly every page by everybody. A
 *   walkthrough video is neither of those things, so it goes to
 *   `listing-media`: same public-read, same own-folder write rule, 40MB and
 *   video types allowed. See 20260908120000_listing_video.
 *
 * THE LIMITS HERE MIRROR THE BUCKET'S, DELIBERATELY
 *   Checking in the browser is a courtesy   the bucket is the enforcement. But
 *   an 80MB file that uploads for a minute and is then refused by storage is a
 *   minute of somebody's data and a message they cannot act on, so it is caught
 *   before it leaves.
 */
'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

export const LISTING_BUCKET = 'listing-media';

export const LISTING_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const LISTING_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const LISTING_ACCEPTED_TYPES = [...LISTING_IMAGE_TYPES, ...LISTING_VIDEO_TYPES];

/** 5MB for a photo, 40MB for a video   the bucket's own ceiling. */
export const MAX_LISTING_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_LISTING_VIDEO_BYTES = 40 * 1024 * 1024;

export type MediaKind = 'image' | 'video';

export interface ListingMedia {
  url: string;
  kind: MediaKind;
}

export function kindOf(type: string): MediaKind | null {
  if (LISTING_IMAGE_TYPES.includes(type)) return 'image';
  if (LISTING_VIDEO_TYPES.includes(type)) return 'video';
  return null;
}

/** The message to show when a file is refused, or null when it is fine. */
export function rejectReason(file: File): string | null {
  const kind = kindOf(file.type);
  if (!kind) return `${file.name} must be a JPEG, PNG, WebP, AVIF, MP4, WebM or MOV`;

  const cap = kind === 'video' ? MAX_LISTING_VIDEO_BYTES : MAX_LISTING_IMAGE_BYTES;
  if (file.size > cap) {
    return `${file.name} is over ${kind === 'video' ? '40MB' : '5MB'}`;
  }
  return null;
}

/**
 * Upload one file and return its public URL and kind.
 *
 * The path starts with the uploader's uuid because `listing_media_insert_own`
 * authorizes on the first segment   a landlord can only write under their own
 * folder, so one cannot overwrite another's video.
 */
export async function uploadListingMedia(
  db: SupabaseClient,
  input: { userId: string; file: File },
): Promise<ListingMedia> {
  const reason = rejectReason(input.file);
  if (reason) throw new Error(reason);

  const kind = kindOf(input.file.type) as MediaKind;
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
  const token = crypto.randomUUID().slice(0, 8);
  const path = `${input.userId}/hostels/${token}-${safeName}`;

  const { error } = await db.storage.from(LISTING_BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    // A random prefix makes collisions vanishingly unlikely; an unexpected one
    // should fail rather than silently replace somebody's photo.
    upsert: false,
  });
  if (error) throw error;

  const { data } = db.storage.from(LISTING_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, kind };
}

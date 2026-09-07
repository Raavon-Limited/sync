/**
 * Shrinking a photo before it leaves the phone.
 *
 * THE PROBLEM THIS SOLVES IS MALETE, NOT STORAGE COST.
 *   An agent files from the gate of the property, on mobile data, often on one
 *   or two bars. A modern phone camera hands back a 3-8MB JPEG, and four of
 *   those is 20MB+ over a link that manages a few hundred KB/s on a good day.
 *   That is minutes of standing still, and it is why filing "takes long".
 *
 *   A reviewer looks at these on a screen. They do not need 4032px of a wall.
 *   Downscaling the long edge to 1600px and re-encoding at 0.72 turns a typical
 *   phone photo into 200-500KB   usually a 10-20x reduction, which is the
 *   difference between a minute per photo and a couple of seconds. Nothing a
 *   reviewer decides on survives at 4032px and dies at 1600px.
 *
 * IT NEVER MAKES A FILE BIGGER, AND IT NEVER BLOCKS A FILING.
 *   Re-encoding can lose: a tiny already-optimised image can come out larger,
 *   and canvas/decode can fail outright on an exotic format or a memory-starved
 *   browser. Both paths return the ORIGINAL file rather than throwing. Failing
 *   to compress is a slow upload; failing to upload is an agent who cannot file.
 *
 * WHY NOT VIDEO
 *   Re-encoding video in a browser means WebCodecs or ffmpeg.wasm   a several-MB
 *   dependency that is itself a download on the connection we are trying to
 *   protect, and minutes of CPU on a mid-range Android. The lever for video is
 *   a shorter clip, which is a instruction to the agent, not a transform.
 */
'use client';

/** The long edge a reviewer actually needs. */
const MAX_EDGE = 1600;
/** Re-encode quality. Visually clean for rooms and walls at this scale. */
const QUALITY = 0.72;
/** Below this, the win cannot pay for the risk of a re-encode. */
const SKIP_UNDER_BYTES = 400 * 1024;

/** Formats we can safely put through a canvas. HEIC decodes on Safari only. */
const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];

export function isCompressible(file: File): boolean {
  return COMPRESSIBLE.includes(file.type) && file.size > SKIP_UNDER_BYTES;
}

/**
 * A smaller version of `file`, or `file` itself when shrinking it would not
 * help or did not work. Never throws.
 */
export async function compressImage(file: File): Promise<File> {
  if (!isCompressible(file)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough in both dimensions: a re-encode would only trade
    // quality for a saving we cannot predict.
    if (scale === 1 && file.size < 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    // A PNG screenshot of flat colour can re-encode LARGER as a JPEG. Keeping
    // whichever is smaller means this can only ever help.
    if (!blob || blob.size >= file.size) return file;

    const renamed = file.name.replace(/\.(png|webp|jpeg|jpg)$/i, '') + '.jpg';
    return new File([blob], renamed, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    // Decode failure, out of memory, a format the browser lied about   the
    // original still uploads, just slowly.
    return file;
  }
}

/** How much smaller, for the status line. `null` when nothing was saved. */
export function savedLabel(before: number, after: number): string | null {
  if (after >= before) return null;
  const pct = Math.round((1 - after / before) * 100);
  if (pct < 10) return null;
  return `${pct}% smaller`;
}

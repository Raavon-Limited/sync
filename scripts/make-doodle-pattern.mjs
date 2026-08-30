/**
 * Turns a black-ink-on-white doodle JPEG into a PNG with a real alpha channel:
 * the paper becomes transparent, the lines stay.
 *
 *   node scripts/make-doodle-pattern.mjs            # rebuild every doodle
 *   node scripts/make-doodle-pattern.mjs housedoodle # just one
 *
 * WHY A SCRIPT AND NOT A ONE-OFF IN PHOTOSHOP
 * The sources are JPEGs, so their "white" is not white - it is a cloud of
 * values in the 230-250 range with compression noise around every line. A hard
 * chroma-key would leave grey confetti between the shapes and hard-edged,
 * aliased strokes. The ramp below fades alpha across that range instead, which
 * keeps the pen strokes smooth. Committing the script means the next person can
 * re-run it against a better source, or retune a threshold, without guessing
 * what was done - and adding a doodle is one entry in the table below.
 *
 * OUTPUT IS PURE BLACK PIXELS, VARYING ONLY IN ALPHA. That matters: the app
 * paints these through `mask-image` with a background colour, so the RGB is
 * discarded and only the shape is used. Black RGB just means each file is also
 * usable directly as a normal image on a light surface.
 */
import sharp from 'sharp';

/**
 * Per-doodle settings. `lo`/`hi` are luminance bounds - at or below `lo` is a
 * pen stroke (fully opaque), at or above `hi` is paper (fully transparent).
 * `width` is the output width: these are backgrounds at low opacity, so native
 * resolution is wasted bytes on every page load and the lines stay crisp well
 * below it.
 */
const DOODLES = [
  {
    name: 'housedoodle',
    lo: 90,
    hi: 205,
    width: 900,
    // Sparse line art with a wide paper margin. Trimming pulls repeats close
    // together; without it the tile carries blank edges and the pattern reads
    // as widely spaced blobs rather than a townscape.
    trim: 12,
  },
  {
    name: 'fooddoodle',
    // Denser and much darker overall - the frame is packed edge to edge with
    // no margin worth trimming. A tighter `hi` keeps the small enclosed
    // highlights (eyes, sprinkles, the gaps inside a pretzel) from silting up
    // into grey blocks, which is what makes this one read as texture rather
    // than a smudge at low opacity.
    lo: 80,
    hi: 185,
    width: 900,
    trim: null,
  },
];

const only = process.argv[2];
const jobs = only ? DOODLES.filter((d) => d.name === only) : DOODLES;

if (jobs.length === 0) {
  console.error(
    `No doodle named "${only}". Known: ${DOODLES.map((d) => d.name).join(', ')}`,
  );
  process.exit(1);
}

for (const { name, lo, hi, width, trim } of jobs) {
  const src = `public/${name}.jpg`;
  const out = `public/${name}.png`;

  let pipeline = sharp(src);
  if (trim !== null) pipeline = pipeline.trim({ threshold: trim });

  const prepared = await pipeline
    .resize({ width, withoutEnlargement: true })
    .toBuffer();

  const { data, info } = await sharp(prepared)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = info.width * info.height;
  const rgba = Buffer.alloc(px * 4);

  for (let i = 0; i < px; i++) {
    const luma = data[i];
    let alpha;
    if (luma <= lo) alpha = 255;
    else if (luma >= hi) alpha = 0;
    else alpha = Math.round((255 * (hi - luma)) / (hi - lo));

    const o = i * 4;
    rgba[o] = 0;
    rgba[o + 1] = 0;
    rgba[o + 2] = 0;
    rgba[o + 3] = alpha;
  }

  const written = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(out);

  console.log(
    `${out}: ${written.width}x${written.height}, ${(written.size / 1024).toFixed(0)} KB`,
  );
}

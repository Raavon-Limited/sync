/**
 * Turns public/housedoodle.jpg into public/housedoodle.png with a real alpha
 * channel: the cream paper becomes transparent, the ink lines stay.
 *
 *   node scripts/make-doodle-pattern.mjs
 *
 * WHY A SCRIPT AND NOT A ONE-OFF IN PHOTOSHOP
 * The source is a JPEG, so its "white" is not white - it is a cloud of values
 * in the 230-250 range with compression noise around every line. A hard
 * chroma-key would leave grey confetti between the houses and hard-edged,
 * aliased strokes. The ramp below fades alpha across that range instead, which
 * keeps the pen strokes smooth. Committing the script means the next person
 * can re-run it against a better source, or retune LO/HI, without guessing
 * what was done.
 *
 * OUTPUT IS PURE BLACK PIXELS, VARYING ONLY IN ALPHA. That matters: the app
 * paints this through `mask-image` with a background colour, so the RGB is
 * thrown away and only the shape is used. Black RGB just means the file is
 * also usable directly as a normal image on a light surface.
 */
import sharp from 'sharp';

const SRC = 'public/housedoodle.jpg';
const OUT = 'public/housedoodle.png';

/** Luminance at or below this is a pen stroke: fully opaque. */
const LO = 90;
/** Luminance at or above this is paper: fully transparent. */
const HI = 205;
/** Output width. The art is a background at low opacity - full res is wasted
 *  bytes on every page load, and the lines stay crisp well below native. */
const WIDTH = 900;

const trimmed = await sharp(SRC)
  // Drop the uniform paper margin so repeats sit close together. Without this
  // the tile carries ~40px of blank edge on each side and the pattern reads as
  // widely spaced blobs rather than a townscape.
  .trim({ threshold: 12 })
  .resize({ width: WIDTH, withoutEnlargement: true })
  .toBuffer();

const { data, info } = await sharp(trimmed)
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const px = info.width * info.height;
const rgba = Buffer.alloc(px * 4);

for (let i = 0; i < px; i++) {
  const luma = data[i];
  let alpha;
  if (luma <= LO) alpha = 255;
  else if (luma >= HI) alpha = 0;
  else alpha = Math.round((255 * (HI - luma)) / (HI - LO));

  const o = i * 4;
  rgba[o] = 0;
  rgba[o + 1] = 0;
  rgba[o + 2] = 0;
  rgba[o + 3] = alpha;
}

const info2 = await sharp(rgba, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png({ compressionLevel: 9, palette: false })
  .toFile(OUT);

console.log(
  `${OUT}: ${info2.width}x${info2.height}, ${(info2.size / 1024).toFixed(0)} KB`,
);

/**
 * QR codes, rendered as rounded modules.
 *
 * WHY A LIBRARY ENCODES AND WE ONLY DRAW
 *   The encoding is Reed–Solomon error correction over a spec'd bit layout.
 *   Hand-rolling it produces something that looks exactly like a QR code and
 *   does not scan, which is the worst possible failure here — the whole point
 *   of this code is that a stranger holding a phone can check a claim. So
 *   `qrcode` produces the module matrix and everything below is presentation.
 *
 * WHY ROUNDED MODULES STILL SCAN
 *   A decoder samples the CENTRE of each module and thresholds it. Rounding
 *   corners removes ink from the edges, where nothing is sampled. What must be
 *   preserved is the quiet zone, the three finder squares' proportions
 *   (7:5:3 rings) and the module grid pitch — all of which this keeps.
 *
 *   The one real risk is contrast, so `light` defaults to a true white rather
 *   than a tinted card colour: a dark-on-dark QR is a QR nobody can read.
 *
 * ERROR CORRECTION IS 'M' (~15%). 'L' is smaller but a printed or photographed
 * card picks up damage, and a credential that stops verifying when the corner
 * creases is not a credential.
 */
import QRCode from 'qrcode';

export interface QrOptions {
  /** Drawn size, in SVG user units. */
  size?: number;
  /** Module colour. */
  dark?: string;
  /** Background. Keep it light — decoders threshold on contrast. */
  light?: string;
  /**
   * Quiet zone, in modules. The spec says 4 and decoders genuinely rely on it;
   * this is not padding to taste.
   */
  margin?: number;
  /** 0–0.5 of a module. 0.5 makes every module a full circle. */
  radius?: number;
}

export interface QrRender {
  /** A complete, standalone `<svg>` string. */
  svg: string;
  /** Just the shapes, for embedding in a larger document. */
  inner: string;
  size: number;
}

/**
 * Encode `text` and return it as rounded-module SVG.
 *
 * Runs anywhere — it is pure string building over the matrix, so a server
 * component can call it and ship the markup with the page rather than making
 * the browser encode on mount.
 */
export function renderQr(text: string, opts: QrOptions = {}): QrRender {
  const { size = 240, dark = '#4a2c20', light = '#ffffff', margin = 4, radius = 0.35 } = opts;

  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const data = qr.modules.data;

  // Everything is laid out in MODULE units and scaled once at the end, so the
  // grid pitch stays exact instead of accumulating rounding per module.
  const total = count + margin * 2;
  const scale = size / total;
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < count && y < count ? !!data[y * count + x] : false;

  // The three finder patterns are drawn as rounded frames rather than as ~200
  // separate modules: a decoder looks for their 1:1:3:1:1 run ratio, and
  // rounding each cell of a solid 7×7 block individually breaks the run into
  // dotted edges on a low-quality scan.
  const finders: [number, number][] = [
    [0, 0],
    [count - 7, 0],
    [0, count - 7],
  ];
  const inFinder = (x: number, y: number) =>
    finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

  const parts: string[] = [];

  for (const [fx, fy] of finders) {
    const x = (fx + margin) * scale;
    const y = (fy + margin) * scale;
    const s = 7 * scale;
    const w = scale; // ring thickness: one module, per the spec
    // Outer ring, drawn as a stroked rounded square so the white gap between
    // it and the centre dot is exactly one module wide.
    parts.push(
      `<rect x="${(x + w / 2).toFixed(2)}" y="${(y + w / 2).toFixed(2)}" width="${(s - w).toFixed(2)}" height="${(s - w).toFixed(2)}" rx="${(w * 1.6).toFixed(2)}" fill="none" stroke="${dark}" stroke-width="${w.toFixed(2)}"/>`,
    );
    // Centre block, 3×3 modules.
    parts.push(
      `<rect x="${(x + 2 * scale).toFixed(2)}" y="${(y + 2 * scale).toFixed(2)}" width="${(3 * scale).toFixed(2)}" height="${(3 * scale).toFixed(2)}" rx="${(scale * 0.9).toFixed(2)}" fill="${dark}"/>`,
    );
  }

  // Everything else, module by module. Runs of horizontally adjacent modules
  // are merged into one rounded capsule — that is what gives the style its
  // stitched look, and it also cuts the path count by roughly half.
  for (let y = 0; y < count; y++) {
    let runStart = -1;
    for (let x = 0; x <= count; x++) {
      const on = x < count && at(x, y) && !inFinder(x, y);
      if (on && runStart === -1) runStart = x;
      if (!on && runStart !== -1) {
        const len = x - runStart;
        const px = (runStart + margin) * scale;
        const py = (y + margin) * scale;
        const w = len * scale;
        const h = scale;
        parts.push(
          `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(scale * radius).toFixed(2)}" fill="${dark}"/>`,
        );
        runStart = -1;
      }
    }
  }

  const inner = `<rect width="${size}" height="${size}" rx="${(size * 0.04).toFixed(2)}" fill="${light}"/>${parts.join('')}`;

  return {
    inner,
    size,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">${inner}</svg>`,
  };
}

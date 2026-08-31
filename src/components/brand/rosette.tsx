/**
 * The guilloche rosette — the woven ring that marks a Sync credential.
 *
 * WHY IT IS DRAWN, NOT AN IMAGE FILE
 *   This ends up on a downloadable ID card, and the card is rasterised through
 *   an SVG → canvas → PNG path. An <img> in that SVG means either a network
 *   fetch mid-rasterise or a base64 blob inflating every card; a raster asset
 *   also goes soft the moment somebody prints the card or opens it on a
 *   retina screen. Maths has neither problem: one set of path data, sharp at
 *   any size, and it serialises with the rest of the document.
 *
 *   It is also the point of a guilloche. The pattern on a banknote is hard to
 *   reproduce by eye precisely because it is a curve family, not a drawing —
 *   getting the parameters wrong is visible. A screenshot of this card
 *   re-rendered by hand will not line up.
 *
 * THE TWO FAMILIES
 *   The outer band is a CHORD WEAVE: n points spaced evenly on a circle, each
 *   joined to the point `skip` places ahead. The envelope of those chords is
 *   what reads as a braid.
 *
 *   The inner field is a ROSE: the same n points, but each chord is drawn as a
 *   quadratic curve pulled toward the centre, so the family sweeps into the
 *   hole in the middle instead of stopping at a flat edge.
 *
 * DECORATIVE ONLY — aria-hidden, no pointer events. Nothing here carries
 * information; the card is fully readable with the rosette removed.
 */
import { memo } from 'react';

export interface RosetteProps {
  /** Viewport size. The art is drawn in a 0 0 size size box. */
  size?: number;
  /** Any CSS colour, or `currentColor`. */
  stroke?: string;
  strokeWidth?: number;
  /** How many points around the circle. More = denser weave. */
  points?: number;
  /** How far ahead each chord reaches. Coprime with `points` looks best. */
  skip?: number;
  className?: string;
  opacity?: number;
}

/**
 * Points evenly spaced on a circle, starting at 12 o'clock.
 *
 * `-Math.PI / 2` rather than 0: SVG's y axis points down and angle 0 is 3
 * o'clock, so without the quarter-turn the pattern's seam lands on the right
 * edge — which is exactly where the eye goes first.
 */
function ring(cx: number, cy: number, r: number, n: number) {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export const Rosette = memo(function Rosette({
  size = 512,
  stroke = 'currentColor',
  strokeWidth = 0.6,
  points = 144,
  skip = 55,
  className,
  opacity = 1,
}: RosetteProps) {
  const c = size / 2;
  const rOuter = size * 0.47;
  const rBand = size * 0.415;
  const rInner = size * 0.13;

  // The braid: two concentric chord weaves sharing a skip, which is what makes
  // the band read as woven rather than as two unrelated rings.
  const outer = ring(c, c, rOuter, points);
  const band = ring(c, c, rBand, points);

  const weave: string[] = [];
  for (let i = 0; i < points; i++) {
    const [x1, y1] = outer[i];
    const [x2, y2] = band[(i + skip) % points];
    weave.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
    const [x3, y3] = band[i];
    const [x4, y4] = outer[(i + skip) % points];
    weave.push(`M${x3.toFixed(2)} ${y3.toFixed(2)}L${x4.toFixed(2)} ${y4.toFixed(2)}`);
  }

  // The rose: each chord bows toward the centre. The control point sits on the
  // line from the midpoint to the middle, pulled `bow` of the way in — that is
  // the single number that decides whether this reads as a flower or a mesh.
  const bow = 0.55;
  const petals: string[] = [];
  const innerSkip = Math.round(points / 3.2);
  for (let i = 0; i < points; i++) {
    const [x1, y1] = band[i];
    const [x2, y2] = band[(i + innerSkip) % points];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const qx = mx + (c - mx) * bow;
    const qy = my + (c - my) * bow;
    petals.push(
      `M${x1.toFixed(2)} ${y1.toFixed(2)}Q${qx.toFixed(2)} ${qy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: 'none' }}
    >
      <g
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={opacity}
      >
        <circle cx={c} cy={c} r={rOuter} />
        <circle cx={c} cy={c} r={rBand} />
        <circle cx={c} cy={c} r={rInner} />
        <path d={weave.join('')} />
        <path d={petals.join('')} />
      </g>
    </svg>
  );
});

/**
 * The same art as a bare path string, for the places that build an SVG
 * document by hand — the card rasteriser cannot mount a React tree into a
 * string, so it asks for the geometry instead. Keeping one implementation of
 * the maths is the whole reason this is exported rather than copied.
 */
export function rosettePaths(size: number, points = 144, skip = 55) {
  const c = size / 2;
  const rOuter = size * 0.47;
  const rBand = size * 0.415;
  const rInner = size * 0.13;
  const outer = ring(c, c, rOuter, points);
  const band = ring(c, c, rBand, points);

  const weave: string[] = [];
  for (let i = 0; i < points; i++) {
    const [x1, y1] = outer[i];
    const [x2, y2] = band[(i + skip) % points];
    weave.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
    const [x3, y3] = band[i];
    const [x4, y4] = outer[(i + skip) % points];
    weave.push(`M${x3.toFixed(2)} ${y3.toFixed(2)}L${x4.toFixed(2)} ${y4.toFixed(2)}`);
  }

  const bow = 0.55;
  const innerSkip = Math.round(points / 3.2);
  const petals: string[] = [];
  for (let i = 0; i < points; i++) {
    const [x1, y1] = band[i];
    const [x2, y2] = band[(i + innerSkip) % points];
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const qx = mx + (c - mx) * bow;
    const qy = my + (c - my) * bow;
    petals.push(
      `M${x1.toFixed(2)} ${y1.toFixed(2)}Q${qx.toFixed(2)} ${qy.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    );
  }

  return { weave: weave.join(''), petals: petals.join(''), rOuter, rBand, rInner, c };
}

/**
 * DoodleBackdrop - a hand-drawn doodle sheet, as a background pattern.
 *
 * PAINTED THROUGH A MASK, NOT DRAWN AS AN IMAGE. The element is a plain block
 * of `currentColor` that a CSS mask punches the drawing out of, so the ink
 * colour comes from whatever `text-*` class you put on it. That is what lets
 * ONE asset serve both directions:
 *
 *   on a light surface  ->  text-ink,   dark lines on cream
 *   on a black surface  ->  text-cream, light lines on ink - the outline look
 *
 * A plain <img> could not do the second one: the artwork is black ink, and
 * black on Ink is invisible. The alternative (a second, inverted copy of each
 * file) means two assets to keep in step and a `filter: invert()` that also
 * inverts the alpha edges into grey fringing.
 *
 * The assets are generated from the source JPEGs by
 * scripts/make-doodle-pattern.mjs - the paper is a real alpha channel there, so
 * nothing here has to blend-mode a background away.
 *
 * Decorative only: aria-hidden, pointer-events-none, and behind its siblings.
 * The parent needs a stacking context (`relative isolate`) or the -z-10 will
 * escape it and slide behind the page.
 */
import { cn } from '@/lib/utils';

/**
 * Which sheet to draw.
 *
 * DENSITY DIFFERS AND IT MATTERS FOR OPACITY. `house` is sparse line art with
 * plenty of paper showing through; `food` is packed edge to edge with no gaps.
 * At the same `text-*` alpha the food sheet reads roughly twice as heavy, so
 * it wants a lower one - see the call sites.
 */
const ART = {
  house: 'url(/housedoodle.png)',
  food: 'url(/fooddoodle.png)',
} as const;

export interface DoodleBackdropProps {
  /** Defaults to the townscape. */
  art?: keyof typeof ART;
  /**
   * Tile width. The sheets are ~900px wide, so anything under ~500px reads as
   * a texture and anything over ~700px reads as an illustration. Height
   * follows the aspect ratio.
   */
  tile?: number;
  /**
   * Colour and strength come from the caller, e.g.
   * `text-cream/9` on Ink, `text-ink/5` on Cream. Opacity belongs in the
   * colour rather than an `opacity` class so the element does not create its
   * own compositing layer over whatever sits behind it.
   */
  className?: string;
}

export function DoodleBackdrop({ art = 'house', tile = 560, className }: DoodleBackdropProps) {
  const src = ART[art];

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 -z-10 bg-current', className)}
      style={{
        maskImage: src,
        WebkitMaskImage: src,
        maskRepeat: 'repeat',
        WebkitMaskRepeat: 'repeat',
        maskSize: `${tile}px auto`,
        WebkitMaskSize: `${tile}px auto`,
        // The tiles are posters, not seamless patterns - their edges do not
        // meet. Because the paper is transparent, the joins land in blank space
        // between shapes and read as spacing rather than seams.
        maskPosition: 'center top',
        WebkitMaskPosition: 'center top',
      }}
    />
  );
}

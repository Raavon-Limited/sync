/**
 * DoodleBackdrop - the hand-drawn townscape, as a background pattern.
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
 * black on Ink is invisible. The alternative (a second, inverted copy of the
 * file) means two assets to keep in step and a `filter: invert()` that also
 * inverts the alpha edges into grey fringing.
 *
 * The asset is public/housedoodle.png, generated from the source JPEG by
 * scripts/make-doodle-pattern.mjs - the paper is a real alpha channel there,
 * so nothing here has to blend-mode the background away.
 *
 * Decorative only: aria-hidden, pointer-events-none, and behind its siblings.
 * The parent needs a stacking context (`relative isolate`) or the -z-10 will
 * escape it and slide behind the page.
 */
import { cn } from '@/lib/utils';

const SRC = 'url(/housedoodle.png)';

export interface DoodleBackdropProps {
  /**
   * Tile width. The art is ~900x1245, so anything under ~500px reads as a
   * texture and anything over ~700px reads as an illustration. Height follows
   * the aspect ratio.
   */
  tile?: number;
  /**
   * Colour and strength come from the caller, e.g.
   * `text-cream/[0.07]` on Ink, `text-ink/[0.05]` on Cream. Opacity belongs in
   * the colour rather than an `opacity` class so the element does not create
   * its own compositing layer over whatever sits behind it.
   */
  className?: string;
}

export function DoodleBackdrop({ tile = 560, className }: DoodleBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 -z-10 bg-current', className)}
      style={{
        maskImage: SRC,
        WebkitMaskImage: SRC,
        maskRepeat: 'repeat',
        WebkitMaskRepeat: 'repeat',
        maskSize: `${tile}px auto`,
        WebkitMaskSize: `${tile}px auto`,
        // The tile is a poster, not a seamless pattern - its edges do not meet.
        // Because the paper is transparent, the joins land in blank space
        // between buildings and read as streets rather than seams.
        maskPosition: 'center top',
        WebkitMaskPosition: 'center top',
      }}
    />
  );
}

/** Sync design tokens. Single source of truth for colour and motion. */

export const color = {
  // Green system, Nov 2026. Key names kept from the original kit so every
  // import keeps working: `cream` is stone, `ink` is forest, `lime` is the
  // sunflower accent. `sage` is the mark's light half.
  cream: "#DAD7CD",   // stone - surfaces, roughly 60% of any screen
  paper: "#F2F1EA",   // cards on stone, and the mark's counter on forest
  ink: "#344E41",     // forest - type and marks, roughly 30%
  lime: "#FFC93C",    // sunflower - accent only, roughly 10%
  sage: "#A3B18A",    // the mark's accent half
} as const;

export const radius = {
  tile: 26,           // app icon and loader tile, on a 100 unit grid
  card: 16,
  control: 12,
} as const;

export const motion = {
  spinner: "1.2s",    // one full turn of the mark
  boot: "1.5s",       // one lap of the trace
  easing: "linear",   // both loaders are linear. Nothing else in the system spins.
} as const;

export const mark = {
  seamGap: 3.2,        // widest point of the wave seam. It tapers to zero at the rim.
  seamBulge: 13.5,   // sideways reach of each lobe on a 100 unit grid.
  minSizePx: 16,      // below this, use the wordmark alone
} as const;

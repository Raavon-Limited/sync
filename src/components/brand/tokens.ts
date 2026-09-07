/** Sync design tokens. Single source of truth for colour and motion. */

export const color = {
  cream: "#F4F1E8",   // surfaces, roughly 60% of any screen
  ink: "#0E0E12",     // type and marks, roughly 30%
  lime: "#C5FF4A",    // accent only, roughly 10%
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

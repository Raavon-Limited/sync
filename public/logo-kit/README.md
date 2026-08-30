# Sync logo kit

Everything here is drawn to the locked Sync brand system.

Cream #F4F1E8 / Ink #0E0E12 / Electric Lime #C5FF4A, at roughly 60 / 30 / 10.
The wordmark is Bricolage Grotesque ExtraBold, converted to outlines, so no font
file is needed to render it.

## Files

svg/
  sync-mark-0X-*-ink.svg        the mark on light surfaces
  sync-mark-0X-*-reversed.svg   the mark on Ink surfaces
  sync-mark-01-monogram-tile.svg  the app icon tile
  sync-lockup-0X-*-light.svg    mark plus wordmark, for Cream and white
  sync-lockup-0X-*-dark.svg     mark plus wordmark, for Ink
  sync-wordmark-*.svg           wordmark on its own
  sync-loader-0X-*.svg          the animated loader, self contained CSS

png/
  1024 app icon and 512 marks on transparent

SyncLoader.tsx sits one level up. Drop it into components/ and import it.

## Rules

Clear space is half the mark height on every side.
Never recolour the mark outside Ink, Cream and Electric Lime.
Never put Electric Lime type on Cream at body sizes, contrast fails.
Minimum sizes: monogram 16px, grid 24px, roofline 24px.

import fs from 'fs';
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error('NOT FOUND in ' + p + ':\n' + a); process.exit(1); }
    s = s.replace(a, b);
  }
  fs.writeFileSync(p, s.replace(/\n/g, '\r\n'));
  console.log('ok ' + p);
};

/* ── Banner: the two ends stack rather than crush each other ──────────── */
edit('src/components/verification/verification-banner.tsx', [
  [` * Geometry is kept: 8px radius, 12px/9px padding, 20px icon, 6px icon gap.
 */`,
` * Geometry is kept: 8px radius, 12px/9px padding, 20px icon, 6px icon gap.
 *
 * ON A PHONE IT STACKS. The design is one row with the link pushed to the far
 * end, which needs roughly 500px to hold a sentence and a link without either
 * wrapping into the other. Below that the two ends stack and the link sits
 * under the message, still left-aligned with it. The icon stays on the first
 * line of the text rather than centring against a two-line paragraph.
 */`],

  [`        'flex items-center justify-between gap-3 rounded-lg border px-[9px] py-3',`,
   `        'flex flex-col items-start gap-2 rounded-lg border px-[9px] py-3',
        'sm:flex-row sm:items-center sm:justify-between sm:gap-3',`],

  [`      <div className="flex items-center gap-1.5">
        <AlertCircle
          className={cn('size-5 shrink-0', awaitingReview ? 'text-content-muted' : 'text-coral')}
          aria-hidden="true"
        />`,
`      <div className="flex items-start gap-1.5 sm:items-center">
        <AlertCircle
          className={cn(
            // mt on mobile keeps it aligned to the first line once the
            // sentence wraps; centred again once it is a single row.
            'mt-px size-5 shrink-0 sm:mt-0',
            awaitingReview ? 'text-content-muted' : 'text-coral',
          )}
          aria-hidden="true"
        />`],

  [`          className="text-coral shrink-0 text-sm font-semibold tracking-[0.1px] underline underline-offset-2"`,
   `          className="text-coral shrink-0 pl-[26px] text-sm font-semibold tracking-[0.1px] underline underline-offset-2 sm:pl-0"`],
]);

/* ── Modal: never touch the screen edge, never overflow a short viewport ── */
edit('src/components/verification/verification-submitted-modal.tsx', [
  [` * TRANSLATED, NOT COPIED.`,
` * RESPONSIVE. The design is a fixed 
 * card; on a phone that has to inset from the screen edge rather than run to
 * it, and survive a short landscape viewport. Hence the width calc, the
 * scroll cap, and one step down on the tick and the gaps below 640px   all at
 * explicit sizes, never \`auto\`.
 *
 * TRANSLATED, NOT COPIED.`],

  [`            'bg-panel text-content shadow-pop fixed top-1/2 left-1/2 z-50 flex w-full max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-8 rounded-2xl p-5',`,
`            'bg-panel text-content shadow-pop fixed top-1/2 left-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl',
            // Inset from the edges on a phone, capped at the designed width.
            'w-[calc(100vw-2rem)] max-w-sm',
            // A short landscape viewport scrolls the card instead of clipping
            // the button off the bottom of the screen.
            'max-h-[90dvh] overflow-y-auto',
            'gap-6 p-5 sm:gap-8',`],

  [`          <div className="flex w-full flex-col items-center gap-5">
            <CheckCircle2
              className="text-accent-fg size-[57px] shrink-0"`,
`          <div className="flex w-full flex-col items-center gap-4 sm:gap-5">
            <CheckCircle2
              className="text-accent-fg size-12 shrink-0 sm:size-[57px]"`],

  [`              <DialogPrimitive.Title className="font-display text-content text-xl leading-[30px] font-semibold tracking-[-0.2px]">`,
   `              <DialogPrimitive.Title className="font-display text-content text-lg leading-[26px] font-semibold tracking-[-0.2px] sm:text-xl sm:leading-[30px]">`],

  [`            <Button onClick={onContinue} className="flex w-full items-center justify-center gap-2">
            Continue
            <ArrowRight className="size-6 shrink-0" aria-hidden="true" />`,
`            <Button onClick={onContinue} className="flex w-full items-center justify-center gap-2">
            Continue
            <ArrowRight className="size-5 shrink-0 sm:size-6" aria-hidden="true" />`],
]);

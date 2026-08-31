/**
 * FullScreenOverlay - a fixed layer that is genuinely full-screen.
 *
 * WHY THIS EXISTS RATHER THAN `<div className="fixed inset-0">`
 *   `position: fixed` is only relative to the viewport when no ancestor
 *   establishes a containing block. `transform`, `filter`, `perspective`,
 *   `contain` and - the one that caught us - `backdrop-filter` all do.
 *
 *   The auth card uses `backdrop-blur` for its glass, and the login form
 *   renders inside it. Its "Signing you in…" overlay was `fixed inset-0`, so it
 *   stopped covering the screen and started covering THE CARD: the loader
 *   appeared low and to the right, boxed inside the form pane, instead of
 *   centred on the page.
 *
 *   A portal to document.body sidesteps the whole class of problem - there is
 *   no ancestor left to be contained by - and it cannot regress the next time
 *   someone adds a blur or a transform somewhere up the tree.
 *
 * Renders nothing on the server and until mounted, because document does not
 * exist there.
 */
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export function FullScreenOverlay({
  children,
  className,
  /** Above dialogs and the install gate, which sit at z-50 and z-100. */
  z = 'z-[200]',
}: {
  children: React.ReactNode;
  className?: string;
  z?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className={cn('fixed inset-0', z, className)}>{children}</div>,
    document.body,
  );
}

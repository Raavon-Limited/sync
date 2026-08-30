/**
 * ROUTE: /ai
 * ACCESS: authenticated student
 * PURPOSE: Sync's assistant - ask for a room, a meal or a fixer in plain
 *          language and have it search across every module at once.
 * STATUS: Coming soon. The centre button of the mobile tab bar points here, so
 *         the route has to exist and explain itself rather than 404.
 */
import type { Metadata } from 'next';
import { Sparkles } from 'lucide-react';

import { ComingSoon } from '@/components/shared/coming-soon';

export const metadata: Metadata = { title: 'Ask Sync' };

export default function Page() {
  return (
    <ComingSoon
      title="Ask Sync"
      tagline="Describe what you need in your own words - a room under ₦200k, jollof before 8pm, a plumber today - and Sync finds it across every module."
      icon={Sparkles}
      note="Being built now. In the meantime, search and the location filter cover most of it."
    />
  );
}

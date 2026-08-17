/**
 * VendorVocabularyProvider - makes the signed-in vendor's wording available to
 * page-level client components (headings, buttons, empty states, toasts).
 *
 * The sidebar and header get their labels from `resolveDashboardNav`, but pages
 * render their own copy, and a nav row saying "Menu" above a page titled
 * "Listings" reads as a bug. This carries the same resolved terms down so every
 * surface agrees.
 *
 * The category is resolved on the server (DashboardShell) and passed in as a
 * prop, so the first paint already has the right words - no flash of the
 * default wording, and no client fetch.
 */
'use client';

import { createContext, useContext, useMemo } from 'react';
import {
  DEFAULT_TERMS,
  resolveVendorTerms,
  type VendorCategory,
  type VendorTerms,
} from '@/config/vendor-vocabulary';

const VendorVocabularyContext = createContext<VendorTerms>(DEFAULT_TERMS);

export function VendorVocabularyProvider({
  category,
  children,
}: {
  category?: VendorCategory | null;
  children: React.ReactNode;
}) {
  const terms = useMemo(() => resolveVendorTerms(category), [category]);
  return (
    <VendorVocabularyContext.Provider value={terms}>{children}</VendorVocabularyContext.Provider>
  );
}

/**
 * The current vendor's terms. Safe anywhere - outside a provider (or for a role
 * with no category) it returns the neutral defaults rather than throwing, so
 * shared components can use it without caring which dashboard they're in.
 */
export function useVendorTerms(): VendorTerms {
  return useContext(VendorVocabularyContext);
}

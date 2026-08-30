/**
 * Central query-key registry.
 *
 * WHY KEYS LIVE IN ONE FILE
 * Cache invalidation is only as good as key agreement. If `useOrders` keys on
 * `['orders', vendorId]` and a mutation invalidates `['order-list', vendorId]`,
 * nothing breaks loudly — the list just silently shows stale data, which is the
 * worst failure mode there is. One registry means a mutation cannot invalidate a
 * key that does not exist, because it is reaching for the same function the
 * query used.
 *
 * THE HIERARCHY IS LOAD-BEARING
 * Keys are arrays ordered general → specific, so TanStack's prefix matching does
 * the work:
 *
 *   qk.orders.all          → ['orders']
 *   qk.orders.lists()      → ['orders', 'list']
 *   qk.orders.list(f)      → ['orders', 'list', f]
 *   qk.orders.detail(id)   → ['orders', 'detail', id]
 *
 * `invalidateQueries({ queryKey: qk.orders.all })` therefore clears every order
 * query at once, while `qk.orders.detail(id)` clears exactly one. Choose the
 * narrowest key that is still correct.
 *
 * `as const` throughout keeps the tuples literal so TypeScript can discriminate
 * them rather than widening everything to `string[]`.
 */

/** The scalar values a filter may hold. Keys must stay JSON-serialisable, since
 *  TanStack hashes them structurally to identify a cache entry. */
export type FilterValue = string | number | boolean | null | undefined;

/**
 * Filters are part of the key: different filters are different cache entries.
 *
 * Typed as `object` rather than `Record<string, FilterValue>` on purpose.
 * TypeScript only gives *type aliases* an implicit index signature — an
 * `interface` never gets one. So `Record<string, FilterValue>` rejects
 * `PageParams` and every `{ status?: string } & PageParams` intersection at the
 * call site, even though those are exactly the filter objects this is for.
 * `FilterValue` above documents what belongs inside one.
 */
export type ListFilters = object;

export const qk = {
  // ── Identity ─────────────────────────────────────────────────────────────
  profile: {
    all: ['profile'] as const,
    me: () => [...qk.profile.all, 'me'] as const,
    detail: (id: string) => [...qk.profile.all, 'detail', id] as const,
  },
  vendorProfile: {
    all: ['vendor-profile'] as const,
    detail: (idOrSlug: string) => [...qk.vendorProfile.all, 'detail', idOrSlug] as const,
    list: (f?: ListFilters) => [...qk.vendorProfile.all, 'list', f ?? {}] as const,
    mine: () => [...qk.vendorProfile.all, 'mine'] as const,
  },
  storefronts: {
    all: ['storefronts'] as const,
    /** Branches owned by the signed-in vendor. */
    mine: () => [...qk.storefronts.all, 'mine'] as const,
    detail: (idOrSlug: string) => [...qk.storefronts.all, 'detail', idOrSlug] as const,
    byVendor: (vendorId: string) => [...qk.storefronts.all, 'vendor', vendorId] as const,
    nearby: (f?: ListFilters) => [...qk.storefronts.all, 'nearby', f ?? {}] as const,
  },
  riderProfile: {
    all: ['rider-profile'] as const,
    mine: () => [...qk.riderProfile.all, 'mine'] as const,
  },
  verificationDocs: {
    all: ['verification-documents'] as const,
    mine: () => [...qk.verificationDocs.all, 'mine'] as const,
  },

  // ── Catalogue ────────────────────────────────────────────────────────────
  listingCategories: {
    all: ['listing-categories'] as const,
    forVendor: (vendorCategory: string, vendorId?: string) =>
      [...qk.listingCategories.all, vendorCategory, vendorId ?? 'platform'] as const,
  },
  listings: {
    all: ['listings'] as const,
    lists: () => [...qk.listings.all, 'list'] as const,
    list: (f?: ListFilters) => [...qk.listings.lists(), f ?? {}] as const,
    detail: (id: string) => [...qk.listings.all, 'detail', id] as const,
    mine: (f?: ListFilters) => [...qk.listings.all, 'mine', f ?? {}] as const,
  },
  services: {
    all: ['services'] as const,
    list: (f?: ListFilters) => [...qk.services.all, 'list', f ?? {}] as const,
    detail: (id: string) => [...qk.services.all, 'detail', id] as const,
    categories: (vertical: string) => [...qk.services.all, 'categories', vertical] as const,
  },
  hostels: {
    all: ['hostels'] as const,
    list: (f?: ListFilters) => [...qk.hostels.all, 'list', f ?? {}] as const,
    detail: (slug: string) => [...qk.hostels.all, 'detail', slug] as const,
    near: (lat: number, lng: number, radius: number) =>
      [...qk.hostels.all, 'near', lat, lng, radius] as const,
  },
  events: {
    all: ['events'] as const,
    list: (f?: ListFilters) => [...qk.events.all, 'list', f ?? {}] as const,
    detail: (slug: string) => [...qk.events.all, 'detail', slug] as const,
  },
  /** The caller's own tickets. Separate from `events` so buying one does not
   *  invalidate every event listing. */
  tickets: {
    all: ['tickets'] as const,
    mine: (f?: ListFilters) => [...qk.tickets.all, 'mine', f ?? {}] as const,
  },
  hotspots: {
    all: ['hotspots'] as const,
    list: (f?: ListFilters) => [...qk.hotspots.all, 'list', f ?? {}] as const,
    detail: (slug: string) => [...qk.hotspots.all, 'detail', slug] as const,
  },
  areas: { all: ['areas'] as const },
  campuses: { all: ['campuses'] as const },

  // ── Commerce ─────────────────────────────────────────────────────────────
  cart: {
    all: ['cart'] as const,
    byVendor: (vendorId: string) => [...qk.cart.all, 'vendor', vendorId] as const,
  },
  orders: {
    all: ['orders'] as const,
    lists: () => [...qk.orders.all, 'list'] as const,
    list: (f?: ListFilters) => [...qk.orders.lists(), f ?? {}] as const,
    detail: (id: string) => [...qk.orders.all, 'detail', id] as const,
    events: (id: string) => [...qk.orders.all, 'events', id] as const,
    vendorInbox: (f?: ListFilters) => [...qk.orders.all, 'vendor', f ?? {}] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (f?: ListFilters) => [...qk.bookings.all, 'list', f ?? {}] as const,
    detail: (id: string) => [...qk.bookings.all, 'detail', id] as const,
  },
  serviceRequests: {
    all: ['service-requests'] as const,
    list: (f?: ListFilters) => [...qk.serviceRequests.all, 'list', f ?? {}] as const,
    detail: (id: string) => [...qk.serviceRequests.all, 'detail', id] as const,
  },
  favorites: {
    all: ['favorites'] as const,
    list: (entityType?: string) => [...qk.favorites.all, 'list', entityType ?? 'all'] as const,
  },
  deliveries: {
    all: ['deliveries'] as const,
    detail: (id: string) => [...qk.deliveries.all, 'detail', id] as const,
    byOrder: (orderId: string) => [...qk.deliveries.all, 'order', orderId] as const,
    myOffers: () => [...qk.deliveries.all, 'offers', 'mine'] as const,
    tracking: (orderId: string) => [...qk.deliveries.all, 'tracking', orderId] as const,
  },

  // ── Money ────────────────────────────────────────────────────────────────
  wallet: {
    all: ['wallet'] as const,
    me: () => [...qk.wallet.all, 'me'] as const,
    transactions: (f?: ListFilters) => [...qk.wallet.all, 'transactions', f ?? {}] as const,
  },
  earnings: {
    all: ['earnings'] as const,
    summary: () => [...qk.earnings.all, 'summary'] as const,
  },
  payouts: {
    all: ['payouts'] as const,
    list: (f?: ListFilters) => [...qk.payouts.all, 'list', f ?? {}] as const,
  },
  bankAccounts: { all: ['bank-accounts'] as const },
  plans: { all: ['plans'] as const },
  subscription: { all: ['subscription'] as const, mine: () => ['subscription', 'mine'] as const },

  // ── Messaging ────────────────────────────────────────────────────────────
  conversations: {
    all: ['conversations'] as const,
    list: (f?: ListFilters) => [...qk.conversations.all, 'list', f ?? {}] as const,
    detail: (id: string) => [...qk.conversations.all, 'detail', id] as const,
  },
  messages: {
    all: ['messages'] as const,
    byConversation: (conversationId: string) =>
      [...qk.messages.all, 'conversation', conversationId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (f?: ListFilters) => [...qk.notifications.all, 'list', f ?? {}] as const,
  },
  unreadCounts: { all: ['unread-counts'] as const },

  // ── Trust & content ──────────────────────────────────────────────────────
  reviews: {
    all: ['reviews'] as const,
    forSubject: (type: string, id: string) => [...qk.reviews.all, type, id] as const,
  },
  disputes: {
    all: ['disputes'] as const,
    list: (f?: ListFilters) => [...qk.disputes.all, 'list', f ?? {}] as const,
    detail: (id: string) => [...qk.disputes.all, 'detail', id] as const,
  },
  promotions: {
    all: ['promotions'] as const,
    list: (f?: ListFilters) => [...qk.promotions.all, 'list', f ?? {}] as const,
    mine: () => [...qk.promotions.all, 'mine'] as const,
  },
  articles: {
    all: ['articles'] as const,
    list: (f?: ListFilters) => [...qk.articles.all, 'list', f ?? {}] as const,
    detail: (slug: string) => [...qk.articles.all, 'detail', slug] as const,
  },
  banners: { all: ['banners'] as const, byPlacement: (p: string) => ['banners', p] as const },
  featureFlags: { all: ['feature-flags'] as const },
} as const;

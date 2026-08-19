/**
 * Domain types for the 'food' module.
 *
 * These are the shapes COMPONENTS see: camelCase, Naira-agnostic (kobo kept as
 * kobo — format at render with `formatKobo`), and free of database concerns
 * like `archived_at`. `queries.ts` maps rows to these; nothing outside that file
 * should know a column name.
 */

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'cancelled';

export type DeliveryStatus =
  | 'pending'
  | 'offered'
  | 'assigned'
  | 'picked_up'
  | 'delivering'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface FoodVendor {
  id: string;
  slug: string;
  businessName: string;
  tagline?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  area?: string | null;
  ratingAvg: number;
  ratingCount: number;
  isAcceptingOrders: boolean;
  isVerified: boolean;
}

export interface FoodListing {
  id: string;
  vendorId: string;
  name: string;
  description?: string | null;
  category: string;
  priceKobo: number;
  stock: number;
  sold: number;
  status: 'Active' | 'Out of Stock' | 'Archived';
  imageUrl?: string | null;
}

export interface CartLine {
  id: string;
  listingId: string;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  /** Price captured when added. Checkout re-reads the live price. */
  unitPriceKobo: number;
  lineTotalKobo: number;
  note?: string | null;
}

export interface Cart {
  id: string;
  vendorId: string;
  vendorName?: string | null;
  lines: CartLine[];
  subtotalKobo: number;
  itemCount: number;
}

export interface OrderLine {
  id: string;
  listingId: string | null;
  name: string;
  qty: number;
  priceKobo: number;
  imageUrl?: string | null;
}

export interface FoodOrder {
  id: string;
  studentId: string;
  vendorId: string;
  vendorName?: string | null;
  /** Snapshot taken at checkout. Vendors cannot read `profiles`, so this is the
   *  only way the fulfilment screens know who ordered. */
  customerName?: string | null;
  customerPhone?: string | null;
  status: OrderStatus;
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  deliveryAddress?: string | null;
  etaMinutes?: number | null;
  paidAt?: string | null;
  placedAt: string;
  deliveredAt?: string | null;
  lines: OrderLine[];
}

export interface OrderEvent {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  note?: string | null;
  createdAt: string;
}

export interface DeliveryTracking {
  deliveryId: string;
  orderId: string;
  riderId: string | null;
  status: DeliveryStatus;
  /** GeoJSON point, or null when no rider has accepted yet. */
  riderPosition: { lat: number; lng: number } | null;
  lastSeenAt: string | null;
}

/** Result of the `checkout_cart` RPC. */
export interface CheckoutResult {
  orderId: string;
  totalKobo: number;
  /** True when a live price differed from what the cart captured. Tell the user. */
  repriced: boolean;
}

/**
 * Domain types shared by the three service verticals.
 *
 * WHY ONE MODULE FOR THREE ROUTES
 * /beauty, /laundry and /workmanship are three surfaces over the same two
 * tables (`services`, `service_requests`). The only thing that differs is the
 * `vertical` discriminator and which pricing model is typical. Three copies of
 * this file would be three places to fix every bug.
 *
 * The per-vertical modules (`src/modules/beauty` etc.) are thin re-exports that
 * bind `vertical` so a component never has to pass it.
 */

export type Vertical = 'beauty' | 'laundry' | 'workmanship';

/**
 * - `fixed`      beauty: ₦3,500 for a haircut.
 * - `per_unit`   laundry: ₦300 per kg; the student supplies quantity.
 * - `quote`      workmanship: no price until the tradesman responds.
 *
 * The database enforces the pairing (`services_price_matches_model`): a `quote`
 * may not carry a price, a `per_unit` must carry a unit label.
 */
export type PricingModel = 'fixed' | 'per_unit' | 'quote';

export type ServiceRequestStatus =
  | 'requested'
  | 'quoted'
  | 'accepted'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'declined';

export interface ServiceCategory {
  id: string;
  vertical: Vertical;
  slug: string;
  name: string;
  icon: string | null;
  sortOrder: number;
}

export interface Service {
  id: string;
  vendorId: string;
  vendorName?: string | null;
  vendorSlug?: string | null;
  vendorRating?: number;
  categoryId: string | null;
  categoryName?: string | null;
  vertical: Vertical;
  name: string;
  description: string | null;
  imageUrl: string | null;
  pricingModel: PricingModel;
  /** Null exactly when `pricingModel === 'quote'`. */
  priceKobo: number | null;
  unitLabel: string | null;
  durationMins: number | null;
  isActive: boolean;
}

export interface ServiceRequestEvent {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

export interface ServiceRequest {
  id: string;
  /** Human reference, e.g. "SRQ-000123". Server-assigned. */
  code: string;
  studentId: string;
  vendorId: string;
  vendorName?: string | null;
  serviceId: string | null;
  serviceName?: string | null;
  vertical: Vertical;
  status: ServiceRequestStatus;
  quantity: number | null;
  unitLabel: string | null;
  /** What the vendor proposed. */
  quotedKobo: number | null;
  /** What both sides settled on. Frozen once the request leaves 'quoted'. */
  agreedKobo: number | null;
  scheduledFor: string | null;
  address: string | null;
  area: string | null;
  notes: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  createdAt: string;
  events?: ServiceRequestEvent[];
}

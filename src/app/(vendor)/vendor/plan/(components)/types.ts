// ─── Plan ─────────────────────────────────────────────────────────────────────

/**
 * `plans.code`   data, not a compile-time enum.
 *
 * This was 'starter' | 'growth' | 'professional' | 'enterprise'. The database
 * seeds 'free', 'growth', 'pro': two of the four never existed, and adding a
 * plan meant editing TypeScript. Widened so the plan list is whatever the
 * table says.
 */
export type PlanId = string;

export interface PlanFeature {
  label: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  price: number | null; // null = custom
  /**
   * The money ONLY   "₦2,500", or "Free". The billing period is `pricePeriod`
   * and is rendered separately: baking it in here produced "₦2,500/monthly"
   * in a display-weight font with no space to wrap at, which overflowed the
   * card AND collided with the "/mo" suffix the card adds itself.
   */
  priceLabel: string;
  /** "/mo", "/yr", or empty for a free or custom plan. */
  pricePeriod: string;
  commission: number | null; // null = custom
  features: PlanFeature[];
  cta: 'downgrade' | 'current' | 'upgrade' | 'contact';
  highlighted?: boolean; // dark card (enterprise)
}

export interface CurrentPlan {
  planId: PlanId;
  name: string;
  price: number;
  renewsAt: string; // ISO date string
  commission: number;
  features: string[];
}

// ─── Payment Method ───────────────────────────────────────────────────────────

export interface PaymentMethod {
  last4: string;
  brand: string; // 'Mastercard' | 'Visa' | 'Verve' etc.
  expiresAt: string; // 'MM/YYYY'
  billingEmail: string;
}

// Card form values (used in UpdateCardModal)
export interface CardFormValues {
  cardNumber: string;
  cardHolder: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  billingEmail: string;
}

// ─── Billing History ─────────────────────────────────────────────────────────

export type InvoiceStatus = 'Paid' | 'Failed' | 'Pending';

export interface Invoice {
  id: string;
  date: string; // ISO date string
  plan: string;
  amount: number;
  status: InvoiceStatus;
  pdfUrl?: string;
}

// ─── Plan Change ──────────────────────────────────────────────────────────────

export type PlanChangeDirection = 'upgrade' | 'downgrade';

export interface PlanChangePayload {
  from: Plan;
  to: Plan;
  direction: PlanChangeDirection;
}

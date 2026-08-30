/**
 * Domain types for the 'vendor' module.
 * Cross-module shared types belong in @/types.
 */

import { Attachment } from '@/app/(vendor)/vendor/inbox/(components)/attachments/attachment';

export type ListingStatus = 'Active' | 'Out of Stock' | 'Archived';

export interface Listing {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  sold: number;

  status: ListingStatus;

  archivedAt?: string | null;

  imageUrl?: string;
}

export interface ChatContact {
  id: string;
  name: string;
  avatarUrl?: string;
  lastMessage: string;
  timeAgo: string;
  unreadCount?: number;
  /** Set when the thread has unseen activity but no exact count is known. */
  hasUnread?: boolean;
  isOnline?: boolean;
}

export interface ChatMessage {
  id: string;
  content: string;
  isVendor: boolean;
  timestamp: string;
  attachments?: Attachment[];
}

export interface ChatOrder {
  orderId: string;
  items: string;
  total: string;
  status: 'Processing' | 'Completed' | 'Cancelled' | 'Pending';
}

export interface ChatCustomer {
  id: string;
  name: string;
  avatarUrl?: string;
  location: string;
  memberSince: string;
  totalOrders: number;
  totalSpent: string;
  recentOrders: ChatOrder[];
}

export type DocStatus = 'approved' | 'under_review' | 'needs_action' | 'not_uploaded';

export interface DocumentItem {
  id: string;
  title: string;
  description: string;
  status: DocStatus;
  uploadedAt?: string;
  actionMessage?: string;
}

export interface TimelineEvent {
  label: string;
  date?: string;
  done: boolean;
  active?: boolean;
}

export type RevenueDataPoint = {
  label: string; // e.g. "Jan", "Feb W1"
  revenue: number;
};

export type Transaction = {
  id: string;
  description: string;
  type: 'order' | 'withdrawal' | 'refund';
  customer?: string;
  date: string;
  amount: number; // positive = credit, negative = debit
  status: 'Settled' | 'Completed' | 'Processed' | 'Pending';
};

export type TopProduct = {
  name: string;
  revenue: number;
};

export const FOOD_BADGES = [
  'Best Seller',
  'Top Rated',
  'Fan Favourite',
  'Most Ordered',
  'Trending',
] as const;

export type FoodBadge = (typeof FOOD_BADGES)[number] | null;

export type BestSellingFood = {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
  totalOrders: number;
  totalRevenue: number;
  rating: number;
  badge: FoodBadge;
  imageUrl: string;
};
export type EarningsData = {
  availableBalance: number;
  pendingBalance: number;
  lifetimeEarnings: number;
  totalWithdrawn: number;
  lifetimeGrowthPct: number;
  totalPayouts: number;
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  nextPayoutDate: string;
  monthlyRevenue: RevenueDataPoint[];
  weeklyRevenue: RevenueDataPoint[];
  topProducts: TopProduct[];
  bestSellingFood: BestSellingFood[];
  transactions: Transaction[];
};

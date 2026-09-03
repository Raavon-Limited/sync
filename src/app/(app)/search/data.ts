import { ROOM_TYPE_NAMES } from '@/lib/constants/room-types';
// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A `room_types.name`.
 *
 * NOT a closed union any more. It was "Self-contain | Single | Shared |
 * Bedsitter | Mini-flat", of which only ONE value existed in the database, so
 * four of the five filters returned nothing   silently, because "no matches"
 * and "impossible filter" look identical in a results list. It was then
 * narrowed to the four the CHECK constraint allowed.
 *
 * 20260907180000_room_types made the set a TABLE so it can grow without a
 * deploy, which a union in application code cannot express. The guard against
 * the original bug is now structural: the filter list and the landlord's picker
 * read the same source, so an offered value always exists.
 */
export type RoomType = string;

/**
 * `hostels.amenities` is a free-text array, not an enum, so this list is a
 * convenience for the sidebar rather than a constraint. Matching is done
 * case-insensitively on substring (see the results filter) so a hostel that
 * lists "Water" still matches "Borehole water".
 */
export type Amenity = string;

export type VerifiedBy = "Sync team visit" | "Student reviewed";

export type BadgeType = "Top rated" | "Verified" | "Female only" | "Best value" | "New";

export interface Listing {
  /** hostels.id   a uuid, not a counter. */
  id: string;
  /** Route target for the card. */
  slug: string;
  name: string;
  distance: string;
  area: string;
  price: number;          // in thousands ₦
  rating: number;
  reviewCount: number;
  badge?: BadgeType;
  amenities: Amenity[];
  image: string;
  roomType: RoomType;
  verified: boolean;
  roomsAvailable: number; // rooms currently vacant
  roomsTotal: number;     // total rooms in the hostel
}

export interface SearchFilters {
  priceMin: number;
  priceMax: number;
  roomTypes: RoomType[];
  amenities: Amenity[];
  verifiedBy: VerifiedBy[];
}

export type SortOption = "Best match" | "Price: Low to High" | "Price: High to Low" | "Highest rated";
export type ViewMode = "Grid" | "List";

// ─── Constants ────────────────────────────────────────────────────────────────

export const ROOM_TYPES: RoomType[] = ROOM_TYPE_NAMES;

export const AMENITIES: Amenity[] = [
  "Wi-Fi", "24h light", "Borehole water", "CCTV", "Inverter", "Tiled", "Kitchen",
];

export const VERIFIED_BY: VerifiedBy[] = ["Sync team visit", "Student reviewed"];

export const SORT_OPTIONS: SortOption[] = [
  "Best match", "Price: Low to High", "Price: High to Low", "Highest rated",
];

export const DEFAULT_FILTERS: SearchFilters = {
  priceMin: 100,
  priceMax: 250,
  // No room type pre-selected: starting a search with a filter applied means a
  // student sees a subset without having asked for one.
  roomTypes: [],
  amenities: ["Wi-Fi", "24h light", "Borehole water"],
  verifiedBy: ["Sync team visit"],
};

export const EMPTY_FILTERS: SearchFilters = {
  priceMin:   50,
  priceMax:   450,
  roomTypes:  [],
  amenities:  [],
  verifiedBy: [],
};

// ─── Seed data ────────────────────────────────────────────────────────────────

/**
 * Hostels come from the database now   see the page's `useHostels()` call and
 * `toListing()`. The hardcoded array that lived here described properties that
 * do not exist, which meant every search returned results nobody could book.
 */


/**
 * ROOM TYPES - what a building is, as a shared constant.
 *
 * The authoritative list is the `room_types` table (see
 * 20260907180000_room_types); this is the last-resort copy, and it lives here
 * rather than beside the query for the same reason `FALLBACK_AREAS` does:
 * `modules/room-types/queries.ts` is `server-only`, and the browse filter and
 * the search sidebar are client components that need the labels.
 *
 * Keep in sync with the seed in that migration.
 *
 * THE RETIRED VALUES ARE NOT HERE, DELIBERATELY
 *   'Sharing', 'Female only' and 'Male only' were room types until that
 *   migration and are seeded `is_active = false`. Existing hostels carrying one
 *   remain valid; nothing offers them any more. 'Female only' and 'Male only'
 *   moved to house rules, which is what they always described - a restriction
 *   on the tenant, not a description of the building.
 *
 *   So a filter built from this list will not match those older listings. That
 *   is correct and visible rather than silent: they show under no layout until
 *   their landlord picks one, which the empty select on their edit form asks
 *   them to do.
 */

export interface RoomTypeOption {
  name: string;
  slug: string;
}

export const FALLBACK_ROOM_TYPES: RoomTypeOption[] = [
  { name: 'Self-contain', slug: 'self-contain' },
  { name: 'Single room', slug: 'single-room' },
  { name: '1 room 1 parlour', slug: '1-room-1-parlour' },
  { name: '2 bedroom flat', slug: '2-bedroom-flat' },
  { name: '3 bedroom flat', slug: '3-bedroom-flat' },
  { name: 'Shared apartment', slug: 'shared-apartment' },
  { name: 'Studio', slug: 'studio' },
];

/** Names only, for the call sites that just need the labels. */
export const ROOM_TYPE_NAMES = FALLBACK_ROOM_TYPES.map((r) => r.name);

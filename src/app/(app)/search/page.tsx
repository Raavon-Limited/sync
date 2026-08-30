"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import SearchStrip, { type SearchQuery } from "./components/SearchStrip";
import FilterSidebar from "./components/FilterSidebar";
import ResultsHeader from "./components/ResultsHeader";
import ListingCard from "./components/ListingCard";
import { DEFAULT_FILTERS, EMPTY_FILTERS,
  type SearchFilters, type SortOption, type ViewMode, type RoomType, type Amenity, type Listing,
} from "./data";
import { useHostels } from "@/modules/hostels/hooks";
import type { Hostel } from "@/modules/hostels/types";

/**
 * Domain hostel -> search result card.
 *
 * Price is in THOUSANDS of naira here, because the filter sliders are, and the
 * database stores kobo. Two conversions in one hop is exactly where an
 * off-by-1000 hides, so it is done once and commented rather than inline.
 */
function toListing(h: Hostel): Listing {
  return {
    id: h.id,
    slug: h.slug,
    name: h.name,
    distance: h.distanceMinutes ? `${h.distanceMinutes} min` : "—",
    area: h.area,
    price: Math.round(h.pricePerSessionKobo / 100 / 1000),
    // No rating column on `hostels` and no reviews aggregate yet.
    rating: 0,
    reviewCount: 0,
    amenities: h.amenities ?? [],
    image: h.images[0]?.url ?? "",
    roomType: h.roomType as RoomType,
    verified: h.isVerified,
    roomsAvailable: h.roomsAvailable ?? 0,
    roomsTotal: h.roomsTotal ?? h.rooms.length,
  };
}
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

const DEFAULT_QUERY: SearchQuery = {
  area: "UNILORIN PS",
  budget: "₦100k–₦250k",
  roomType: "Self-contain",
};

const EMPTY_QUERY: SearchQuery = {
  area: "",
  budget: "",
  roomType: "",
};

/**
 * `useSearchParams` opts the tree into client-side bailout, so Next requires a
 * Suspense boundary above it. Without one the build errors on this route.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const params = useSearchParams();

  // Seed from the URL so a search submitted anywhere in the app actually lands
  // here. Previously this page ignored searchParams entirely and always opened
  // on DEFAULT_QUERY - which is why searching "jollof" in the header dropped you
  // on a hostel list for "UNILORIN PS", a campus this product doesn't even serve.
  const q = params.get("q") ?? "";
  const urlQuery = useMemo<SearchQuery>(
    () => ({
      area: params.get("area") ?? "",
      budget: params.get("budget") ?? "",
      roomType: params.get("roomType") ?? "",
    }),
    [params],
  );

  // A URL that carries any criterion wins. With none, fall back to the demo
  // defaults rather than showing an empty screen on a bare /search visit.
  const hasUrlCriteria = Boolean(q || urlQuery.area || urlQuery.budget || urlQuery.roomType);
  const initial = hasUrlCriteria ? urlQuery : DEFAULT_QUERY;

  const [query, setQuery] = useState<SearchQuery>(initial);
  const [submitted, setSubmitted] = useState<SearchQuery>(initial);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortOption>("Best match");
  const [view, setView] = useState<ViewMode>("List");
  const [mobileOpen, setMobile] = useState(false);

  // ── Commit search bar values → results ────────────────────────────────────
  function handleSearch() {
    setSubmitted(query);
  }

  // ── Remove a single chip ──────────────────────────────────────────────────
  function handleRemoveFilter(chip: string) {
    // Amenity chip: "+ Wi-Fi" etc.
    if (chip.startsWith("+ ")) {
      const amenity = chip.slice(2) as Amenity;
      setFilters(prev => ({ ...prev, amenities: prev.amenities.filter(a => a !== amenity) }));
      return;
    }
    // Room type chip (from sidebar roomTypes)
    if (filters.roomTypes.includes(chip as RoomType)) {
      setFilters(prev => ({ ...prev, roomTypes: prev.roomTypes.filter(r => r !== chip) }));
      return;
    }
    // Search bar chips — clear both submitted and typed query
    if (chip === submitted.area) {
      setSubmitted(prev => ({ ...prev, area: "" }));
      setQuery(prev => ({ ...prev, area: "" }));
    }
    if (chip === submitted.budget) {
      setSubmitted(prev => ({ ...prev, budget: "" }));
      setQuery(prev => ({ ...prev, budget: "" }));
    }
    if (chip === submitted.roomType) {
      setSubmitted(prev => ({ ...prev, roomType: "" }));
      setQuery(prev => ({ ...prev, roomType: "" }));
    }
  }

  // ── Clear everything — inputs + sidebar filters ───────────────────────────
  function handleClearAll() {
    setQuery(EMPTY_QUERY);
    setSubmitted(EMPTY_QUERY);
    setFilters(EMPTY_FILTERS);
  }

  // ── Build active chips from ALL active state ──────────────────────────────
  const activeChips = useMemo(() => {
    const chips: string[] = [];
    if (submitted.area) chips.push(submitted.area);
    if (submitted.budget) chips.push(submitted.budget);
    if (submitted.roomType) chips.push(submitted.roomType);
    filters.roomTypes.forEach(r => {
      if (!chips.includes(r)) chips.push(r);
    });
    filters.amenities.forEach(a => chips.push(`+ ${a}`));
    return chips;
  }, [submitted, filters.roomTypes, filters.amenities]);

  // ── Filter + sort listings ────────────────────────────────────────────────
  const { data: hostels = [], isLoading } = useHostels({ pageSize: 100 });
  const allListings = useMemo(() => hostels.map(toListing), [hostels]);

  const results = useMemo(() => {
    let list = allListings.filter(l => {
      if (l.price < filters.priceMin || l.price > filters.priceMax) return false;
      if (filters.roomTypes.length && !filters.roomTypes.includes(l.roomType)) return false;
      // Case-insensitive substring: `hostels.amenities` is free text, so a
      // hostel listing "Water" should still match a filter for "Borehole water".
      if (
        filters.amenities.length &&
        !filters.amenities.every(a =>
          l.amenities.some(
            have =>
              have.toLowerCase().includes(a.toLowerCase()) ||
              a.toLowerCase().includes(have.toLowerCase()),
          ),
        )
      )
        return false;
      if (filters.verifiedBy.includes("Sync team visit") && !l.verified) return false;
      if (submitted.area && !l.area.toLowerCase().includes(submitted.area.toLowerCase())) return false;
      if (submitted.roomType && !l.roomType.toLowerCase().includes(submitted.roomType.toLowerCase())) return false;
      // Free-text `?q=` from the global SearchBar. There was no text filter at
      // all before, so every q= submitted from a header search was dropped on
      // arrival and the user got an unfiltered list with no explanation.
      if (q) {
        const needle = q.toLowerCase();
        const haystack = `${l.name} ${l.area} ${l.roomType}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });

    if (sort === "Price: Low to High") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "Price: High to Low") list = [...list].sort((a, b) => b.price - a.price);
    if (sort === "Highest rated") list = [...list].sort((a, b) => b.rating - a.rating);

    return list;
    // `q` (the free-text filter) and `allListings` (the live hostels query) are
    // both read above, so both belong here - one side of the merge had each.
  }, [filters, sort, submitted, q, allListings]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface transition-colors duration-300">
      <SearchStrip
        query={query}
        onQueryChange={setQuery}
        onSearch={handleSearch}
        activeFilters={activeChips}
        onRemoveFilter={handleRemoveFilter}
        onClearAll={handleClearAll}
        onMobileFilterOpen={() => setMobile(true)} />

      <div className="w-full mx-auto px-4 sm:px-6 pb-5 mt-4">
        <div className="flex gap-6 items-start">
          <FilterSidebar
            filters={filters}
            onChange={setFilters}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobile(false)} />

          <div className="flex-1 min-w-0 flex flex-col gap-3">
            {/* Mobile filter toggle drawer action trigger */}
            <div className="flex lg:hidden items-center pt-2">
              <button
                type="button"
                onClick={() => setMobile(true)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest border border-line/15 bg-panel rounded-md px-3 h-9 transition-colors hover:bg-surface-deep/60" >
                <SlidersHorizontal size={13} className="text-lime" />
                Filters
              </button>
            </div>

            <ResultsHeader
              count={results.length}
              area={submitted.area || "All areas"}
              campus="UNILORIN PS"
              radius="2km"
              sort={sort}
              view={view}
              onSortChange={setSort}
              onViewChange={setView} />

            {/* Render results dynamically mapped layouts context */}
            {isLoading ? (
              <div className="flex flex-col gap-3.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-ink/5 h-36 animate-pulse rounded-2xl" />
                ))}
              </div>
            ) : results.length === 0 ? (
              /* Reached only after loading — otherwise "no results, reset your
                 filters" would appear while the first fetch is still in flight. */
              <EmptyState onReset={handleClearAll} />
            ) : view === "List" ? (
              <div className="flex flex-col gap-3.5">
                {results.map(l => <ListingCard key={l.id} listing={l} view="List" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {results.map(l => <ListingCard key={l.id} listing={l} view="Grid" />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State Frame UI Component ──────────────────────────────────────────

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-line/20 rounded-xl bg-panel/30">
      <div className="w-14 h-14 rounded-md bg-surface-deep border border-line/15 flex items-center justify-center mb-4 shadow-sm text-xl">
        🏠
      </div>
      <h3 className="text-sm font-semibold text-content mb-1">No hostels match your filters</h3>
      <p className="text-xs text-content-muted/80 mb-5 max-w-xs leading-relaxed">
        Try adjusting your price range, room type, or amenities to see more options.
      </p>
      <Button
        type="button"
        size="sm"
        onClick={onReset}
        className="bg-lime text-ink font-semibold hover:opacity-90 transition-opacity h-9 px-5 shadow-sm" >
        Reset filters
      </Button>
    </div>
  );
}
'use client';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { useHostels } from '@/modules/hostels/hooks';

/**
 * The card's own shape. The domain hostel carries rooms, images and
 * availability; this strip needs four fields, so it takes the four.
 */
export interface Hostel {
  id: string;
  slug?: string;
  name: string;
  /** Naira, not kobo — this component formats for display. */
  price: number;
  distanceMinutes: number;
  landmark: string;
  imageUrl?: string;
}

interface HostelCardListProps {
  hostels: Hostel[];
  onSelect?: (id: string) => void;
}

function HostelCard({ hostel, onSelect }: { hostel: Hostel; onSelect?: (id: string) => void }) {
  return (
    <Card
      onClick={() => onSelect?.(hostel.id)}
      className="group border-line w-full cursor-pointer border bg-transparent transition-shadow duration-300 hover:shadow-lg"
    >
      {/* Image / Placeholder */}
      <div className="border-line/25 m-3 overflow-hidden rounded-xl border border-dashed">
        {hostel.imageUrl ? (
          <Image
            src={hostel.imageUrl}
            alt={hostel.name}
            width={400}
            height={160}
            className="h-36 w-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        ) : (
          <div className="relative h-36 w-full bg-surface-deep transition-transform duration-300 group-hover:scale-110">
            <svg
              className="absolute inset-0 h-full w-full"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
            >
              <line x1="0" y1="0" x2="100%" y2="100%" stroke="var(--color-content-muted)" strokeWidth="1.5" />
              <line x1="100%" y1="0" x2="0" y2="100%" stroke="var(--color-content-muted)" strokeWidth="1.5" />
            </svg>
          </div>
        )}
      </div>

      {/* Info */}
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{hostel.name}</CardTitle>
          <p className="text-content shrink-0 font-mono text-sm">
            ₦{(hostel.price / 1000).toFixed(0)}k
          </p>
        </div>
        <CardDescription className="mt-0.5 text-xs">
          {hostel.distanceMinutes} min · {hostel.landmark}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

/**
 * Fetches its own hostels when none are passed. The dashboard used to hand it
 * `hostels.slice(0, 3)` from a mock module; now the default is real.
 */
export function HostelCardListLive({ limit = 3 }: { limit?: number }) {
  const { data = [], isLoading } = useHostels({ pageSize: limit });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: limit }).map((_, i) => (
          <div key={i} className="bg-ink/5 h-48 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-center text-sm">
        No hostels listed yet.
      </p>
    );
  }

  const cards: Hostel[] = data.slice(0, limit).map((h) => ({
    id: h.id,
    slug: h.slug,
    name: h.name,
    price: h.pricePerSessionKobo / 100,
    // Not a column on `hostels`; 0 renders as "—" rather than a guess.
    distanceMinutes: h.distanceMinutes ?? 0,
    landmark: h.landmark ?? h.area,
    imageUrl: h.images[0]?.url,
  }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((h) => (
        <Link key={h.id} href={`/hostels/${h.slug ?? h.id}`}>
          <HostelCard hostel={h} />
        </Link>
      ))}
    </div>
  );
}

export function HostelCardList({ hostels, onSelect }: HostelCardListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {hostels.map((hostel) => (
        <HostelCard key={hostel.id} hostel={hostel} onSelect={onSelect} />
      ))}
    </div>
  );
}

'use client';

import Link from 'next/link';
import {
  Store,
  Users,
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import type { StatCard } from './data';
import { cn } from '@/lib/utils';

// Uniformly configured icon rendering architecture mapped to semantic tokens
const ICONS: Record<string, React.ReactNode> = {
  vendors: <Store size={16} className="text-ink" />,
  users: <Users size={16} className="text-ink" />,
  verifications: <ClipboardCheck size={16} className="text-ink" />,
  disputes: <AlertTriangle size={16} className="text-ink" />,
};

interface StatCardsProps {
  stats: StatCard[];
}

function StatCardItem({ stat }: { stat: StatCard }) {
  const isNegative = stat.change < 0;

  return (
    // THE CARD IS A LINK. A count with nowhere to go is how the front door came
    // to disagree with the queue it was counting without anybody noticing: five
    // was unopenable, so it was never compared with anything.
    <Link
      href={stat.href}
      className="bg-panel hover:border-line/30 border-line/15 group flex flex-col gap-3.5 rounded-xl border p-4 shadow-xs transition-colors select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-content-muted mb-1 text-[11px] font-semibold tracking-widest uppercase">
            {stat.label}
          </p>
          <p className="font-display text-content text-2xl font-bold">
            {stat.value.toLocaleString()}
          </p>
        </div>

        {/* Dynamic theme adaptive icon backdrop shell box layout config */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs',
            stat.iconBg === 'bg-blue-500' ? 'bg-blue-400' : 'bg-lime',
          )}
        >
          {ICONS[stat.icon]}
        </div>
      </div>

      {/* Core financial direction operational stream logic marker mapping status */}
      <div
        className={cn(
          'flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase',
          isNegative ? 'text-coral' : 'text-green-500',
        )}
      >
        {isNegative ? (
          <TrendingDown size={12} className="shrink-0" />
        ) : (
          <TrendingUp size={12} className="shrink-0" />
        )}
        <span className="font-mono text-xs font-semibold tracking-normal normal-case">
          {isNegative ? '' : '+'}
          {stat.change}%{' '}
          <span className="text-content-muted/60 font-sans text-[11px] font-normal">
            vs last month
          </span>
        </span>
      </div>
    </Link>
  );
}

export function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatCardItem key={stat.key} stat={stat} />
      ))}
    </div>
  );
}

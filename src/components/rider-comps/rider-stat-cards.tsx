// components/rider-comps/rider-stat-cards.tsx
"use client";

import { Bike, Star, Wallet, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RiderStat {
  key: string;
  label: string;
  value: string | number;
  icon: "delivered" | "rating" | "earnings" | "online-time";
  change?: number;
  subtitle?: string; // optional e.g. "Excellent"
}

const ICONS = {
  delivered: <Bike size={16} className="text-purple-600 dark:text-purple-400" />,
  rating: <Star size={16} className="text-blue-600 dark:text-blue-400" fill="currentColor" />,
  earnings: <Wallet size={16} className="text-lime-deep dark:text-lime" />,
  "online-time": <Clock size={16} className="text-orange-500" />,
};

const ICON_BG = {
  delivered: "bg-purple-500/10",
  rating: "bg-blue-500/10",
  earnings: "bg-lime/15",
  "online-time": "bg-orange-500/10",
};

function RiderStatItem({ stat }: { stat: RiderStat }) {
  const isNegative = (stat.change ?? 0) < 0;

  return (
    <div className="bg-panel rounded-xl border border-line/15 p-4 flex items-center gap-3 shadow-xs">
      <div className={cn("w-11 h-11 rounded-full flex items-center justify-center shrink-0", ICON_BG[stat.icon])}>
        {ICONS[stat.icon]}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-content-muted truncate">{stat.label}</p>
        <p className="font-display text-xl font-bold text-content">{stat.value}</p>
        {stat.change !== undefined ? (
          <p className={cn("text-[11px] font-medium", isNegative ? "text-coral" : "text-green-600 dark:text-green-400")}>
            {isNegative ? "" : "+"}{stat.change}% <span className="text-content-muted">vs yesterday</span>
          </p>
        ) : stat.subtitle ? (
          <p className="text-[11px] font-medium text-green-600 dark:text-green-400">{stat.subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

export function RiderStatCards({ stats }: { stats: RiderStat[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {stats.map((stat) => (
        <RiderStatItem key={stat.key} stat={stat} />
      ))}
    </div>
  );
}
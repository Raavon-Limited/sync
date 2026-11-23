"use client";

import type { ArticleStatus } from "../admin-editorialTypes";
import cn from "../admin-editorialConstants";

interface ArticleStatusBadgeProps {
  status: ArticleStatus;
}

const STATUS_STYLES: Record<ArticleStatus, string> = {
  Published: "bg-lime/20 text-accent-fg",
  Draft: "bg-gray-100 text-gray-600",
  Scheduled: "bg-blue-100 text-blue-600",
  Archived: "bg-amber-100 text-amber-700",
};

export function ArticleStatusBadge({ status }: ArticleStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-eyebrow font-semibold px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap",
        STATUS_STYLES[status]
      )} >
      {status}
    </span>
  );
}


// inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-blue-100 text-blue-600
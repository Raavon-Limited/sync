"use client";

import { Search, Filter } from "lucide-react";

const starFilters = ["All", "5 ★", "4 ★", "3 ★", "2 ★", "1 ★"];

interface Props {
    activeStars: string;
    onStarsChange: (val: string) => void;
    query: string;
    onQueryChange: (val: string) => void;
}

export default function ReviewFilters({ activeStars, onStarsChange, query, onQueryChange }: Props) {
    return (
        <div className="bg-panel rounded-xl border border-line/15 p-3 shadow-xs flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
                {starFilters.map((filter) => (
                    <button
                        key={filter}
                        type="button"
                        onClick={() => onStarsChange(filter)}
                        className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${activeStars === filter
                            ? "bg-lime/15 text-lime-deep dark:text-lime"
                            : "text-content-muted hover:bg-content-muted/5"
                            }`}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Search by student name or order ID..."
                    className="w-full pl-9 pr-4 py-2 text-sm bg-surface border border-line/15 rounded-xl outline-none focus:border-lime/50 transition-colors text-content placeholder:text-content-muted"
                />
            </div>
            <button
                type="button"
                onClick={() => {
                    onStarsChange('All')
                    onQueryChange('')
                }}
                disabled={!query && activeStars === 'All'}
                className="flex items-center gap-2 px-3.5 py-2 text-sm text-content-muted border border-line/15 rounded-xl hover:bg-content-muted/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
                <Filter className="w-4 h-4" />
                Clear filters
            </button>
        </div>
    );
}
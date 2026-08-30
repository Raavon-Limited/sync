'use client';

/**
 * Category picker for the listing modals.
 *
 * Replaces the hardcoded food list. Options come from the taxonomy for THIS
 * vendor's business type, so a clothing vendor sees Tops/Bottoms/Footwear and a
 * food vendor sees Rice/Soups/Grills, without either screen knowing which.
 *
 * Custom categories are created inline. Making the vendor leave the modal,
 * find a settings screen and come back is how a half-filled form gets
 * abandoned - and "my category isn't here" is the most common reason someone
 * files a product under the wrong one.
 */

import { useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useCreateListingCategory, useListingCategories } from '@/modules/vendor/hooks';

interface CategoryFieldProps {
  /** Category NAME, matching `listings.category`. */
  value: string;
  onChange: (name: string, categoryId: string | null) => void;
  error?: string;
}

export function CategoryField({ value, onChange, error }: CategoryFieldProps) {
  const { data: categories = [], isLoading } = useListingCategories();
  const create = useCreateListingCategory();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  function submitNew() {
    const name = draft.trim();

    if (!name) return;

    setCreateError(null);

    create.mutate(name, {
      onSuccess: (category) => {
        // Select it immediately - the vendor added it because they want it.
        onChange(category.name, category.id);
        setDraft('');
        setAdding(false);
      },
      onError: (e) =>
        setCreateError(
          e instanceof Error && e.message.includes('duplicate')
            ? 'You already have a category with that name.'
            : e instanceof Error
              ? e.message
              : 'Could not add the category',
        ),
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-muted text-xs font-medium">Category</label>

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-lime-deep inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            <Plus className="size-3" /> New category
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="bg-ink/5 h-9 animate-pulse rounded-lg" />
      ) : categories.length === 0 ? (
        <p className="text-muted text-xs">
          No categories yet for your business type. Add one to get started.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.name, c.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors',
                value === c.name
                  ? 'border-lime-500 bg-lime-500/10 text-lime-deep font-medium'
                  : 'border-line/40 text-muted hover:border-lime-500/50',
              )}
            >
              {value === c.name && <Check className="size-3" />}
              {c.name}
              {/* Marks the vendor's own additions so the shared set is legible. */}
              {c.isCustom && <span className="text-[10px] opacity-60">·yours</span>}
            </button>
          ))}
        </div>
      )}

      {adding && (
        <div className="mt-1 flex items-center gap-2">
          <Input
            autoFocus
            placeholder="e.g. Ankara"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitNew();
              }
              if (e.key === 'Escape') setAdding(false);
            }}
            className="input-clean h-8 text-xs"
          />
          <button
            type="button"
            onClick={submitNew}
            disabled={create.isPending || !draft.trim()}
            className="bg-lime-deep inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-40"
            aria-label="Add category"
          >
            {create.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setCreateError(null);
            }}
            className="text-muted hover:text-ink inline-flex size-8 shrink-0 items-center justify-center"
            aria-label="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {(error || createError) && <p className="text-xs text-red-600">{error ?? createError}</p>}
    </div>
  );
}

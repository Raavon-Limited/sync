/**
 * CampusInput - type your university, we complete it.
 *
 * A dropdown does not work at this size: there are a hundred-odd institutions
 * and a student knows exactly which one is theirs, so typing three letters and
 * picking beats scrolling a list every time. Matching covers the CODE as well
 * as the name, because people type "KWASU" as readily as "Kwara State
 * University".
 *
 * A TYPED UNIVERSITY WE DO NOT HAVE IS ACCEPTED, not rejected. The seeded list
 * is broad but explicitly not the complete NUC register, and a gap in our data
 * must never be the reason someone cannot sign up. Unmatched text is kept as
 * `campusOther`, which doubles as the demand signal for where to expand.
 *
 * THE "NOT HERE YET" NOTICE IS PART OF THIS FIELD, not a separate step. The
 * moment a student names a campus we do not serve is the moment to say so -
 * telling them after they have finished signing up would be a bait and switch.
 * They can still create the account; we are honest about what it gets them
 * today, and we point them at where Sync is actually running.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { searchCampuses, servicedCampuses, type Campus } from '@/modules/campuses';

export interface CampusInputProps {
  id?: string;
  /** All selectable campuses, from useCampuses(). */
  campuses: Campus[];
  loading?: boolean;
  /** The text in the box - either a chosen campus's name or free text. */
  value: string;
  onChange: (value: string) => void;
  /** Fires with the campus id when one is picked, or null when it is free text. */
  onSelect: (campus: Campus | null) => void;
  /** The currently chosen campus, so the notice knows what to say. */
  selected: Campus | null;
  placeholder?: string;
}

export function CampusInput({
  id,
  campuses,
  loading,
  value,
  onChange,
  onSelect,
  selected,
  placeholder,
}: CampusInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(
    () => searchCampuses(campuses, value),
    [campuses, value],
  );

  useEffect(() => setActive(0), [value]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  const visible = open && matches.length > 0;

  function choose(c: Campus) {
    onChange(c.name);
    onSelect(c);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  // Free text: they typed something and it is not the campus they picked.
  const isFreeText = value.trim().length > 0 && !selected;

  return (
    <div className="flex flex-col gap-2">
      <div ref={boxRef} className="relative">
        <Input
          id={id}
          value={value}
          placeholder={loading ? 'Loading universities…' : placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            // Typing after a selection means they are changing their mind; the
            // old choice must not silently survive the new text.
            onSelect(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={visible}
          aria-autocomplete="list"
          aria-controls={id ? `${id}-list` : undefined}
        />

        {visible && (
          <ul
            id={id ? `${id}-list` : undefined}
            role="listbox"
            className="border-line/15 bg-panel shadow-pop absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border py-1"
          >
            {matches.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(c);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    i === active ? 'bg-ink/10' : 'hover:bg-ink/5',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-content block truncate text-sm">{c.name}</span>
                    <span className="text-content-muted block truncate text-xs">
                      {c.code}
                      {c.state ? ` · ${c.state}` : ''}
                    </span>
                  </span>
                  {/* Where we already run, said before they choose rather than
                      after. */}
                  {c.isServiced && (
                    <span className="bg-lime text-ink inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      Sync is here
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Chose a campus we serve: confirm it, briefly. */}
      {selected?.isServiced && (
        <p className="text-lime flex items-center gap-1.5 text-xs">
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
          Sync is live at {selected.code}.
        </p>
      )}

      {/* Chose one we do not serve, or typed one we have never heard of. Same
          message either way - what matters to them is that we are not there. */}
      {(selected?.isServiced === false || isFreeText) && (
        <NotHereYet campuses={campuses} typed={isFreeText ? value.trim() : selected?.name} />
      )}
    </div>
  );
}

/**
 * The honest version of "we do not serve you".
 *
 * Three things, in this order, because that is the order the questions occur:
 * where we ARE, that they can still sign up, and a way to look at the place we
 * do serve. Refusing the signup would be the easy option and the wrong one -
 * a signup from an unserved campus is the clearest possible evidence of where
 * to expand, and it costs them nothing to be on that list.
 */
function NotHereYet({ campuses, typed }: { campuses: Campus[]; typed?: string }) {
  const live = servicedCampuses(campuses);
  const where = live.length > 0 ? live.map((c) => c.code).join(', ') : null;

  return (
    <div className="border-line/15 bg-panel/60 flex flex-col gap-2 rounded-xl border p-3">
      <p className="text-content flex items-start gap-2 text-xs font-medium">
        <MapPin className="text-accent-fg mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Sync isn&rsquo;t at {typed ? <strong>{typed}</strong> : 'your school'} yet.
        </span>
      </p>
      <p className="text-content-muted text-xs leading-relaxed">
        {where ? (
          <>
            We&rsquo;re live at <strong className="text-content">{where}</strong> for now.
            Create your account anyway   we&rsquo;ll let you know the moment we reach your
            campus, and signups like yours are how we choose where to open next.
          </>
        ) : (
          <>
            Create your account anyway   we&rsquo;ll let you know the moment we reach your
            campus.
          </>
        )}
      </p>
      {live.length > 0 && (
        <Link
          href="/around"
          className="text-accent-fg inline-flex items-center gap-1 text-xs font-medium hover:gap-2"
        >
          See what&rsquo;s happening at {live[0].code}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

/**
 * EmailInput - a text input that completes the domain as you type.
 *
 * Type `aisha@g` and it offers `aisha@gmail.com`. Typing an email on a phone is
 * the slowest part of any signup form and the domain is the half that is always
 * one of a dozen strings, so completing it removes most of the typing and most
 * of the typos - a mistyped domain is an account whose verification email never
 * arrives and which the person cannot recover.
 *
 * PURELY LOCAL. No API, no network, no key - a fixed list of the domains
 * Nigerian students and vendors actually use. That matters: unlike the address
 * autocomplete this can never be unavailable, and it costs nothing per keystroke.
 *
 * Suggestions appear only AFTER an `@`, and only while the domain is still a
 * prefix of something in the list, so it gets out of the way the moment someone
 * is typing a domain we do not know.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Ordered by how likely they are here, not alphabetically - the first
 * suggestion is the one most people want, and gmail dominates.
 *
 * `.edu.ng` addresses are deliberately absent: institutional domains vary per
 * school (unilorin.edu.ng, kwasu.edu.ng…) and guessing one would put a wrong
 * address in front of the very users most likely to accept it unread.
 */
const DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'zoho.com',
];

/** How many to show at once. More than this is a list to read, not a shortcut. */
const MAX = 5;

export interface EmailInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function EmailInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  autoFocus,
}: EmailInputProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo(() => {
    const at = value.indexOf('@');
    // No @ yet, or more than one: nothing sensible to complete.
    if (at < 1 || value.indexOf('@', at + 1) !== -1) return [];

    const local = value.slice(0, at);
    const typed = value.slice(at + 1).toLowerCase();

    // An exact match is already correct - suggesting it is noise.
    const matches = DOMAINS.filter((d) => d.startsWith(typed) && d !== typed);
    return matches.slice(0, MAX).map((d) => `${local}@${d}`);
  }, [value]);

  // Reset the highlight whenever the list changes, so Enter never picks a
  // suggestion the user cannot currently see.
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

  const visible = open && suggestions.length > 0;

  function choose(next: string) {
    onChange(next);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!visible) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // Tab completes as well as Enter - it is what people reach for, and
      // completing then moving on is the behaviour they expect.
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        name={name}
        type="email"
        inputMode="email"
        // Our list and the browser's saved addresses would overlap and fight
        // for the same dropdown space.
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-domains` : undefined}
      />

      {visible && (
        <ul
          id={id ? `${id}-domains` : undefined}
          role="listbox"
          className="border-line/15 bg-panel shadow-pop absolute z-50 mt-1 w-full overflow-hidden rounded-xl border py-1"
        >
          {suggestions.map((s, i) => (
            <li key={s} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: blur would close the list first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'text-content w-full px-3 py-2 text-left text-sm transition-colors',
                  i === active ? 'bg-ink/10' : 'hover:bg-ink/5',
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

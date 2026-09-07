/**
 * useDebounced - the value, once it has stopped changing for `delay` ms.
 *
 * For search boxes whose value becomes a network request. Debouncing the VALUE
 * rather than the callback keeps the input itself fully controlled and
 * instant   the field never lags behind the keyboard, only the query does.
 *
 *   const [term, setTerm] = useState('');
 *   const debounced = useDebounced(term, 250);
 *   useQuery({ queryKey: ['x', debounced], ... });
 *
 * The setState here is in a timer callback, not in the effect body, so it does
 * not cascade renders the way a synchronous one would.
 */
'use client';

import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    // Every new keystroke cancels the pending update, which is what makes this
    // "once it stops changing" rather than "every `delay` ms".
    return () => clearTimeout(id);
  }, [value, delay]);

  return settled;
}

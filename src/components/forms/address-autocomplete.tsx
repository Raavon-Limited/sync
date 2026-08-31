/**
 * AddressAutocomplete - a text input that suggests real addresses as you type,
 * backed by Google Places.
 *
 * DEGRADES TO A PLAIN INPUT, ALWAYS. If there is no Maps key, or the Places
 * library fails to load, or the request errors, this is an ordinary text field
 * and the vendor types their address as before. An address is required to
 * finish onboarding, so a third-party outage must never be able to block it -
 * the autocomplete is an accelerator, not a gate.
 *
 * WHY THE NEW DATA API AND NOT THE WIDGET
 *   `google.maps.places.Autocomplete` (the classic widget) is deprecated as of
 *   March 2025, and `PlaceAutocompleteElement` is a web component whose
 *   internals cannot be styled to match this design system. Fetching
 *   suggestions ourselves and rendering our own list keeps the field looking
 *   like every other input in the app, and stays on the supported path.
 *
 * SESSION TOKENS ARE A BILLING CONCERN, not a detail. Google bills
 * per-keystroke autocomplete requests unless they are grouped into a session
 * that ends with a place selection. One token is created per editing session
 * and discarded on select, which is what turns N requests into one billable
 * unit.
 *
 * REQUIRES "Places API (New)" enabled on the Google Cloud project, separately
 * from Maps JavaScript. If it is not, this silently stays a plain input.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Input } from '@/components/ui/input';
import { GoogleMapsProvider, googleMapsConfigured } from '@/components/shared/google-maps-provider';
import { cn } from '@/lib/utils';

export interface AddressAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired when a SUGGESTION is chosen, with coordinates when Google gives them. */
  onResolved?: (place: { address: string; lat?: number; lng?: number }) => void;
  placeholder?: string;
  /** ISO country codes to bias results to. Defaults to Nigeria. */
  regions?: string[];
  name?: string;
  onBlur?: () => void;
}

/** How long to wait after a keystroke before asking Google. */
const DEBOUNCE_MS = 250;
/** Below this, suggestions are noise and every request is wasted. */
const MIN_CHARS = 3;

export function AddressAutocomplete(props: AddressAutocompleteProps) {
  // No key configured: skip the provider entirely rather than mounting a
  // loader that can never resolve.
  if (!googleMapsConfigured) return <PlainInput {...props} />;

  return (
    <GoogleMapsProvider fallback={<PlainInput {...props} />}>
      <Suggesting {...props} />
    </GoogleMapsProvider>
  );
}

function PlainInput({ id, value, onChange, placeholder, name, onBlur }: AddressAutocompleteProps) {
  return (
    <Input
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoComplete="street-address"
    />
  );
}

interface Suggestion {
  /** The full text Google shows for this prediction. */
  text: string;
  /** Kept so we can fetch coordinates only for the one that gets picked. */
  prediction: google.maps.places.PlacePrediction;
}

function Suggesting(props: AddressAutocompleteProps) {
  const { id, value, onChange, onResolved, placeholder, regions, name, onBlur } = props;
  const places = useMapsLibrary('places');

  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // One token per editing session; replaced after each successful selection.
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Guards against an out-of-order response overwriting a newer one.
  const seq = useRef(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const included = useMemo(() => regions ?? ['ng'], [regions]);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  // Click-away. Without it the list survives a click on the next field.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // Fetch suggestions, debounced.
  useEffect(() => {
    if (!places || value.trim().length < MIN_CHARS) {
      setItems([]);
      return;
    }

    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        token.current ??= new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          includedRegionCodes: included,
          sessionToken: token.current,
        });
        // A slower earlier request must not clobber a newer answer.
        if (mine !== seq.current) return;

        const next = suggestions
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => Boolean(p))
          .map((p) => ({ text: p.text.toString(), prediction: p }));

        setItems(next);
        setOpen(next.length > 0);

        // Zero results is a legitimate answer, not a fault - `includedRegionCodes`
        // is a hard restriction in the new API, so a street that exists only
        // outside those regions correctly returns nothing. Say so in dev, or the
        // silence is indistinguishable from a broken key.
        if (process.env.NODE_ENV === 'development' && next.length === 0) {
          console.info(
            `[AddressAutocomplete] Places returned 0 suggestions for "${value}" ` +
              `restricted to [${included.join(', ')}]. The call succeeded - there is ` +
              `simply no match in those regions.`,
          );
        }
      } catch (err) {
        // Places not enabled on the project, quota, offline: the field simply
        // stops suggesting. Typing still works, which is what matters.
        //
        // But it must not fail INVISIBLY in development. Swallowing this whole
        // is why a disabled "Places API (New)" looks exactly like an address
        // with no matches - one is a console setting to fix, the other is
        // correct behaviour, and the field rendered the same for both.
        if (process.env.NODE_ENV === 'development') {
          console.error(
            '[AddressAutocomplete] Places request failed - the field is now a plain ' +
              'text input. Usual cause: "Places API (New)" is not enabled on the ' +
              'Google Cloud project (it is a separate enable from Maps JavaScript), ' +
              'or the key’s HTTP-referrer restriction does not list this origin.',
            err,
          );
        }
        if (mine === seq.current) {
          setItems([]);
          setOpen(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [places, value, included]);

  async function choose(s: Suggestion) {
    onChange(s.text);
    close();

    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location'] });
      onResolved?.({
        // formattedAddress is the tidied postal form; the prediction text is
        // what the user saw, so fall back to it rather than blanking the field.
        address: place.formattedAddress ?? s.text,
        lat: place.location?.lat(),
        lng: place.location?.lng(),
      });
      if (place.formattedAddress) onChange(place.formattedAddress);
    } catch {
      // Selection still stands - we just do not have coordinates for it.
      onResolved?.({ address: s.text });
    } finally {
      // The session ended with a selection; the next edit starts a new one.
      token.current = null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && active >= 0) {
      // Only swallow Enter when a suggestion is highlighted, so Enter still
      // submits the form normally when the list is merely open.
      e.preventDefault();
      void choose(items[active]);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onFocus={() => items.length > 0 && setOpen(true)}
        placeholder={placeholder}
        // Google's own suggestions and the browser's would overlap and fight.
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-suggestions` : undefined}
      />

      {open && (
        <ul
          id={id ? `${id}-suggestions` : undefined}
          role="listbox"
          className="border-line/15 bg-panel shadow-pop absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border py-1"
        >
          {items.map((s, i) => (
            <li key={s.text + i} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: the input's blur would otherwise close
                // the list before the click ever lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'text-content w-full px-3 py-2 text-left text-sm transition-colors',
                  i === active ? 'bg-ink/10' : 'hover:bg-ink/5',
                )}
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

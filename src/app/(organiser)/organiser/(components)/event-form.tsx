/**
 * The form behind both "list an event" and "edit an event".
 *
 * ONE COMPONENT FOR BOTH, because they are the same eight fields and a
 * different verb. Two forms would drift the moment one gained a field, and the
 * one that drifts is always the edit form — the one nobody demos.
 *
 * THE DATE FIELD IS `datetime-local`, WHICH HAS NO TIME ZONE
 *   The browser hands back "2026-09-04T19:30" meaning the viewer's own clock,
 *   which is what somebody typing the start of their own party means. The
 *   action turns it into an instant with `new Date(...)`, resolved in the
 *   server's zone — correct for a single-country product and worth knowing
 *   before this goes anywhere with two.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, ImageField } from '@/components/forms';
import { createEvent, updateEvent, type EventInput } from '@/modules/events/organiser-actions';

/** An ISO instant back into the "YYYY-MM-DDTHH:mm" the input wants, locally. */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

export function EventForm({
  eventId,
  initial,
  onDone,
}: {
  /** Absent when listing something new. */
  eventId?: string;
  initial?: Partial<EventInput> & { startsAtIso?: string };
  /**
   * Called after a successful save, before the navigation. Only the sheet
   * passes it   it needs to close itself. The page host gets the redirect on
   * its own, which is why this is optional.
   */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<EventInput>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    venue: initial?.venue ?? '',
    category: initial?.category ?? '',
    startsAt: toLocalInput(initial?.startsAtIso),
    coverUrl: initial?.coverUrl ?? '',
  });

  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = eventId ? await updateEvent(eventId, form) : await createEvent(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone?.();
      router.push('/organiser/events');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <FormField label="Event name" htmlFor="name">
        <Input
          id="name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Rep Night 2026"
          autoFocus
        />
      </FormField>

      <FormField label="When it starts" htmlFor="startsAt">
        <Input
          id="startsAt"
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => set('startsAt', e.target.value)}
        />
      </FormField>

      <FormField label="Venue" htmlFor="venue">
        <Input
          id="venue"
          value={form.venue ?? ''}
          onChange={(e) => set('venue', e.target.value)}
          placeholder="Student Union Hall"
        />
      </FormField>

      <FormField label="Category" htmlFor="category">
        <Input
          id="category"
          value={form.category ?? ''}
          onChange={(e) => set('category', e.target.value)}
          placeholder="Party, concert, conference…"
        />
      </FormField>

      {/* THE FLYER IS UPLOADED, NOT PASTED.
          It was a URL field, which pointed at wherever the organiser happened
          to host the image and broke the day they deleted it. This puts the
          file in the same public-media bucket every other image on the platform
          lives in, under the uploader's own folder — which is what the storage
          policy authorises on. */}
      <ImageField
        label="Event flyer"
        hint="The image students see on /events and on the ticket page. Landscape reads best."
        folder="events"
        value={form.coverUrl ?? ''}
        onChange={(url) => set('coverUrl', url)}
      />

      <FormField label="What is it" htmlFor="description">
        <Textarea
          id="description"
          rows={5}
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Who is playing, what is included, anything somebody needs to know before buying."
        />
      </FormField>

      {error && <p className="text-coral text-sm">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
          {eventId ? 'Save changes' : 'List this event'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          // In a sheet this closes the panel; on the page it goes back to the
          // list. One handler, because 'cancel' means the same thing in both.
          onClick={() => (onDone ? onDone() : router.push('/organiser/events'))}
        >
          Cancel
        </Button>
      </div>

      <p className="text-content-muted text-xs">
        Listing it puts it on <code>/events</code> straight away. Ticket tiers are added after, on
        the event&rsquo;s own page — an event with no tiers is simply a free one.
      </p>
    </form>
  );
}

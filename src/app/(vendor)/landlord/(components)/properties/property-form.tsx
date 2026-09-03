'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, ImagePlus, Save, Tag, UploadCloud, X } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  SheetBody,
  SheetFooter,
  WizardSteps,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@/components/ui';
import { AddressAutocomplete } from '@/components/forms/address-autocomplete';
import { PinDrop } from '@/components/forms/pin-drop';
import { nearestArea, type Area } from '@/lib/constants/areas';
import type { RoomTypeOption } from '@/modules/room-types/queries';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/session-provider';
import {
  uploadListingMedia,
  rejectReason,
  LISTING_ACCEPTED_TYPES,
  type ListingMedia,
} from '@/modules/hostels/media';
import { saveHostel } from '@/modules/hostels/actions';
import { rentQuote, naira } from '@/modules/hostels/pricing';
import type { FeeMode } from '@/modules/hostels/types';
import type { Property } from '../landlord-types';
import { cn } from '@/lib/utils';

const amenityOptions = ['Wi-Fi', '24/7 Power', 'Water', 'Security', 'Kitchen', 'Parking'];
/**
 * The sheet's four steps, in the order the fields already sit in the markup.
 * Named for what the landlord is doing, not for the card component they live
 * in   the label is read in "Step 2 of 4 · Photos", which is a sentence.
 */
const STEPS = ['Details', 'Photos', 'Amenities', 'Pricing'] as const;

/**
 * Rules landlords reach for most, offered as one tap.
 *
 * 'Female only' and 'Male only' LEAD THIS LIST because they used to be room
 * types   which meant a listing could say who could live there or what the
 * building was, never both. They are restrictions on the tenant, so they are
 * rules. See 20260907180000_room_types.
 *
 * A suggestion, never a taxonomy: `house_rules` is free text, and a landlord's
 * own wording is more use to a student than ours.
 */
const ruleSuggestions = [
  'Female only',
  'Male only',
  'Gate closes at 10pm',
  'No overnight guests',
  'No loud music after 10pm',
  'No smoking indoors',
  'No pets',
];

/**
 * The scrolling middle, but only in a sheet. On a page the document scrolls and
 * a second scroll container inside it is a scrollbar in a scrollbar.
 *
 * DECLARED AT MODULE SCOPE, AND THAT IS THE WHOLE POINT.
 *
 * It used to live inside PropertyForm, closing over `stepped` and `bodyRef`,
 * which reads as tidier and is a bug: a component declared inside another gets
 * a NEW function identity on every render. React compares element types by
 * identity, so every keystroke made this a different component, unmounting the
 * entire field subtree and mounting a fresh one.
 *
 * On a page that is invisible waste. In a sheet it is a broken form: the input
 * being typed into is destroyed mid-keystroke, focus falls off it, and Radix's
 * focus trap catches the loose focus and parks it on the panel   which is why
 * typing one character threw you out to the whole modal.
 */
function StepBody({
  stepped,
  bodyRef,
  children,
}: {
  stepped: boolean;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return stepped ? <SheetBody ref={bodyRef}>{children}</SheetBody> : <>{children}</>;
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="bg-lime/10 text-lime-deep grid size-11 shrink-0 place-items-center rounded-full">
        <Icon className="size-5" />
      </span>
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        <p className="text-content-muted mt-0.5 text-sm">{description}</p>
      </div>
    </div>
  );
}

/**
 * Who pays Sync's 2.5%, with the arithmetic done in front of the landlord.
 *
 * BOTH ROWS ARE ALWAYS ON SCREEN, not just the selected one. The decision is
 * "which of these two outcomes do I want", and hiding the one you did not pick
 * turns it into "what does this toggle do" - which is the question that gets
 * answered by leaving it alone.
 *
 * The numbers come from `rentQuote`, which mirrors `public.quote_rent`. The
 * student's listing page reads the same function, so the two screens cannot
 * quote different totals for the same room.
 */
function FeeModeField({
  mode,
  onChange,
  priceNaira,
}: {
  mode: FeeMode;
  onChange: (mode: FeeMode) => void;
  priceNaira: number;
}) {
  const kobo = Math.max(0, Math.round(priceNaira * 100));
  const absorbed = rentQuote(kobo, 'absorb');
  const passedOn = rentQuote(kobo, 'pass_on');
  // Before a price is typed there is nothing to itemise, and "₦0 - ₦0 = ₦0"
  // reads as a broken calculator rather than an empty one.
  const priced = kobo > 0;

  const options: { value: FeeMode; label: string; blurb: string; student: number; you: number }[] = [
    {
      value: 'absorb',
      label: 'I pay it',
      blurb: 'Students pay exactly what you list. Sync’s share comes out of your payout.',
      student: absorbed.totalKobo,
      you: absorbed.landlordNetKobo,
    },
    {
      value: 'pass_on',
      label: 'The student pays it',
      blurb: 'Added to the student’s total at checkout. You keep the full rent.',
      student: passedOn.totalKobo,
      you: passedOn.landlordNetKobo,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Sync’s fee (2.5% of rent)</span>
      <p className="text-content-muted text-xs">
        Taken once, when your rent is released a week after move-in. Nothing is charged while a
        room is only on hold.
      </p>

      <div className="mt-1 flex flex-col gap-2">
        {options.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'flex flex-col gap-2 rounded-2xl border p-3 text-left transition-colors',
                selected
                  ? 'border-lime-deep/40 bg-lime/5 ring-lime-deep/20 ring-2'
                  : 'border-line/10 hover:border-line/25',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded-full border',
                    selected ? 'border-lime-deep' : 'border-line/30',
                  )}
                >
                  {selected && <span className="bg-lime-deep size-2 rounded-full" />}
                </span>
                <span className="text-sm font-medium">{option.label}</span>
              </span>
              <span className="text-content-muted text-xs">{option.blurb}</span>

              {priced && (
                <span className="border-line/10 text-content-muted mt-1 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 font-mono text-xs">
                  <span>
                    Student pays{' '}
                    <span className="text-content font-semibold">{naira(option.student)}</span>
                  </span>
                  <span>
                    You receive{' '}
                    <span className="text-content font-semibold">{naira(option.you)}</span>
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {priced && (
        <p className="text-content-muted text-xs">
          Sync’s share either way: {naira(absorbed.feeKobo)}.
        </p>
      )}
    </div>
  );
}

export function PropertyForm({
  property,
  /**
   * Rendered inside a sheet rather than on a page of its own.
   *
   * The form is the same either way   the only difference is the chrome around
   * it. A sheet already carries its own title and its own way out, so the page
   * heading, the "Back to properties" link and the Cancel-as-a-link all become
   * a second set of the same controls pointing somewhere the sheet is not.
   */
  embedded = false,
  /**
   * Called after a successful save INSTEAD of navigating. The page version
   * pushes back to the list; the sheet closes itself and refreshes underneath,
   * which is the whole reason it is a sheet.
   */
  onDone,
  /**
   * The service areas, from the database. Passed in rather than imported: this
   * is a client component, and `FALLBACK_AREAS` (which it used to render) is a
   * last-resort copy for when Supabase is unreachable   not the list. Offering
   * five hardcoded names meant an area an admin added was unusable here, and
   * `hostels.area` has an FK onto `areas.name`, so a name that is not a row
   * cannot be saved at all.
   */
  areas,
  /**
   * What a building can be, from `room_types`. Passed in for the same reason
   * `areas` is: this is a client component, and the column has an FK onto
   * `room_types.name`, so a value that is not a row cannot be saved.
   */
  roomTypes,
}: {
  property?: Property;
  embedded?: boolean;
  onDone?: () => void;
  areas: Area[];
  roomTypes: RoomTypeOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(property);
  const [amenities, setAmenities] = useState<string[]>(property?.amenities ?? []);
  const [description, setDescription] = useState(property?.description ?? '');
  const [rules, setRules] = useState<string[]>(property?.houseRules ?? []);
  const [ruleDraft, setRuleDraft] = useState('');
  const [amenityDraft, setAmenityDraft] = useState('');
  const { userId } = useSession();
  /** How many files are still going up, so Save can wait for them. */
  const [uploading, setUploading] = useState(0);
  const [address, setAddress] = useState(property?.address ?? '');
  const [area, setArea] = useState(property?.area ?? '');
  /**
   * The price, mirrored into state purely so the fee breakdown under it can
   * update as it is typed. The <input> is still what gets read on submit   this
   * is a readout, not a second source of truth.
   */
  const [price, setPrice] = useState<number>(property?.price ?? 0);
  /**
   * Who bears Sync's 2.5%. 'absorb' by default: it leaves the advertised price
   * alone, so a landlord who never touches this control cannot accidentally
   * make their listing cost a student more than it says.
   */
  const [feeMode, setFeeMode] = useState<FeeMode>(property?.feeMode ?? 'absorb');
  /** Opened on demand: most landlords pick a suggestion and never need it. */
  const [showPin, setShowPin] = useState(false);
  /** The pin, or null when the address was typed rather than picked. */
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    property?.lat != null && property?.lng != null
      ? { lat: property.lat, lng: property.lng }
      : null,
  );
  const [saving, setSaving] = useState(false);
  /**
   * Photos AND the walkthrough video, in display order.
   *
   * `media` is preferred over `imageUrls` when present: the latter is the
   * photo-only view the cards render, and rebuilding state from it would drop
   * a landlord's video every time they opened the edit sheet.
   */
  const [media, setMedia] = useState<ListingMedia[]>(
    property?.media?.length
      ? property.media
      : property?.imageUrls?.length
        ? property.imageUrls.map((url) => ({ url, kind: 'image' as const }))
        : property?.imageUrl
          ? [{ url: property.imageUrl, kind: 'image' as const }]
          : [],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  /*
   * STEPPED IN A SHEET, ONE PAGE ON A PAGE.
   *
   * The page version has room for four cards in two columns and nothing is
   * gained by hiding three of them. A sheet is one narrow column, so the same
   * four become a scroll long enough that the Save button leaves the screen
   * and a form whose primary action is out of reach is a form people abandon
   * half-filled. Same fields, same order, four at a time.
   */
  const stepped = embedded;
  const [step, setStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);

  /**
   * Whether the fields in one step pass their own validation.
   *
   * The browser cannot do this for us at submit time: a `required` input inside
   * a display:none step is not focusable, so reporting on it silently blocks
   * the submit with a console warning and no message the user can see. That is
   * why the form carries `noValidate` when stepped   validation moves here,
   * one step at a time, where the field being complained about is on screen.
   */
  function stepIsValid(index: number): boolean {
    const el = stepRefs.current[index];
    if (!el) return true;
    const fields = el.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    );
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  function goTo(next: number) {
    setStep(next);
    // Back to the top of the panel: step four opening at the scroll position of
    // step three shows its middle, which reads as a page that failed to change.
    bodyRef.current?.scrollTo({ top: 0 });
  }

  function nextStep() {
    if (!stepIsValid(step)) return;
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  /** The six presets, plus anything this landlord added, in a stable order. */
  const shownAmenities = [
    ...amenityOptions,
    ...amenities.filter((a) => !amenityOptions.includes(a)),
  ];

  function addAmenity() {
    const next = amenityDraft.trim();
    if (!next) return;
    // Case-insensitive: ticking "Wi-Fi" and typing "wi-fi" is one amenity, and
    // a listing showing both reads as carelessness. The server dedupes too.
    if (!amenities.some((a) => a.toLowerCase() === next.toLowerCase())) {
      setAmenities((current) => [...current, next]);
    }
    setAmenityDraft('');
  }

  function addRule() {
    // The bullet a landlord types is stripped here as well as on the server:
    // the marker belongs to the list, and showing "- - Gate closes" back to
    // them while they are still typing is its own small bug.
    const next = ruleDraft.replace(/^\s*[-*\u2022]+\s*/, '').trim();
    if (!next) return;
    setRules((current) => [...current, next]);
    setRuleDraft('');
  }

  function removeRule(index: number) {
    setRules((current) => current.filter((_, i) => i !== index));
  }

  function toggleAmenity(amenity: string) {
    setAmenities((current) =>
      current.includes(amenity)
        ? current.filter((item) => item !== amenity)
        : [...current, amenity],
    );
  }

  /**
   * UPLOADED ON SELECTION, NOT ON SAVE.
   *
   * This used to read each file with a FileReader and push the data: URL into
   * state, which made a convincing preview of a photo that was then THROWN
   * AWAY   `saveHostel` had no column to send it to and did not try. A landlord
   * saw three photos on their listing and a student saw none.
   *
   * Uploading here means `imageUrls` holds real objects in our bucket, which is
   * also what makes EDITING work: an existing listing's photos are already
   * URLs, so the same array serves both.
   *
   * The cost is an orphaned object if somebody abandons the form after adding a
   * photo. That is storage, not correctness, and is the right trade against a
   * save that silently loses work.
   */
  async function selectImages(files: FileList | File[]) {
    const nextFiles = Array.from(files);
    if (!nextFiles.length) return;

    if (!userId) {
      toast.error('Sign in again before adding photos.');
      return;
    }

    // The SAME limits the bucket enforces. The old check here allowed 10MB
    // against a 5MB bucket ceiling and an uploader that rejects over 5MB, so a
    // 7MB photo passed the form and failed later with nothing pointing at it.
    // One rule for both kinds, from the module that also knows the bucket's
    // ceilings   5MB for a photo, 40MB for a video.
    const acceptedFiles = nextFiles.filter((file) => {
      const reason = rejectReason(file);
      if (reason) toast.error(reason);
      return !reason;
    });
    if (!acceptedFiles.length) return;

    const db = createClient();
    setUploading((n) => n + acceptedFiles.length);

    // Sequential, so the order they land in is the order they were chosen
    // which is what makes "the first one is the primary" predictable.
    for (const file of acceptedFiles) {
      try {
        const uploaded = await uploadListingMedia(db, { userId, file });
        setMedia((current) => [...current, uploaded]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `${file.name} did not upload`);
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
  }

  /**
   * Promote a photo to primary by moving it to the front.
   *
   * A VIDEO CANNOT BE PRIMARY. Position 0 is what every card and listing tile
   * renders, and a video there is a black rectangle with no poster frame.
   */
  function makePrimary(index: number) {
    setMedia((current) => {
      if (index <= 0 || index >= current.length) return current;
      if (current[index].kind !== 'image') return current;
      const next = [...current];
      const [picked] = next.splice(index, 1);
      return [picked, ...next];
    });
  }

  function removeMedia(index: number) {
    setMedia((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    // Every step, not just the last one. With noValidate on, nothing else
    // checks the three the user has already walked past   and landing them on
    // the first one that fails is more use than a message about a field they
    // cannot see.
    if (stepped) {
      for (let i = 0; i < STEPS.length; i++) {
        if (!stepIsValid(i)) {
          goTo(i);
          event.preventDefault();
          return;
        }
      }
    }
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const roomsTotal = Number(formData.get('roomsTotal'));

    if (uploading > 0) {
      toast.error('Wait for the photos to finish uploading');
      return;
    }
    // A photo specifically: position 0 is the tile every card renders, and a
    // listing that is only a video has nothing to show in a grid.
    if (!media.some((m) => m.kind === 'image')) {
      toast.error('Add at least one photo before submitting');
      return;
    }
    if (media[0]?.kind !== 'image') {
      toast.error('Your first item is a video   make a photo primary first');
      return;
    }
    if (!Number.isInteger(roomsTotal) || roomsTotal < 1) {
      toast.error('Enter at least one room');
      return;
    }

    setSaving(true);

    // The row goes to the database, not to this browser. Fields the hostels
    // table has no column for   house rules, a room count, the photo set   are
    // deliberately not sent rather than being stored somewhere that only this
    // device can read. They need columns before they can be saved.
    const res = await saveHostel({
      id: property?.id,
      name: String(formData.get('name')).trim(),
      address: address.trim(),
      // Without these two the listing is unfindable: `area` drives the filter
      // chips and the pin drives the "near me" RPC, which skips any hostel
      // whose geo is null.
      area: area || undefined,
      lat: coords?.lat,
      lng: coords?.lng,
      price: Number(formData.get('price')),
      feeMode,
      roomType: String(formData.get('roomType')),
      amenities,
      houseRules: rules,
      // In order. The first is the primary image   see `replaceImages`.
      imageUrls: media,
      // Was validated here and then dropped, so every listing had zero rooms
      // and could not be booked.
      roomsTotal,
      description: description.trim(),
    });

    setSaving(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }

    toast.success(isEdit ? 'Listing updated' : 'Listing saved and sent for approval');
    // refresh() either way: the list behind the sheet is a server component and
    // would otherwise keep showing the properties it was rendered with.
    router.refresh();
    if (onDone) onDone();
    else router.push('/landlord/properties');
  }

  return (
    <form
      onSubmit={handleSubmit}
      // ENTER MUST NOT SAVE.
      //
      // A single-input form submits on Enter and that is usually right. This
      // one is four steps deep with an autocomplete in it   AddressAutocomplete
      // deliberately lets Enter through when no suggestion is highlighted, so
      // typing an address and pressing Enter fired Save from step one. It read
      // as the button clicking itself.
      //
      // Textareas keep Enter, because a newline in a description is a newline.
      // Buttons keep it, because Enter on a focused button IS a click.
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        const target = event.target as HTMLElement;
        if (target.tagName === 'TEXTAREA') return;
        if (target instanceof HTMLButtonElement) return;
        event.preventDefault();
      }}
      // noValidate ONLY when stepped: a required field inside a hidden step is
      // not focusable, and the browser answers that by refusing to submit with
      // no visible message at all. stepIsValid does the reporting instead, on
      // the step the field is actually on.
      noValidate={stepped}
      className={cn(stepped ? 'flex min-h-0 flex-1 flex-col gap-0' : 'flex flex-col gap-7 pb-8')}
    >
      {stepped && <WizardSteps steps={STEPS} current={step} className="shrink-0 pb-6" />}
      {!embedded && (
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-section text-content font-display">
              {isEdit ? 'Edit Property' : 'Add New Property'}
            </h1>
            <p className="text-content-muted mt-2 text-sm">
              {isEdit
                ? 'Update your listing details and keep your property information up to date.'
                : 'Add your listing details so students can find the right place to stay.'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            className="text-content-muted -ml-3 w-fit"
          >
            <Link href="/landlord/properties">
              <ArrowLeft className="size-4" />
              Back to properties
            </Link>
          </Button>
        </div>
      )}

      <StepBody stepped={stepped} bodyRef={bodyRef}>
        <div
          className={cn(
            'grid items-start gap-6',
            // One column in a sheet: the right-hand rail is a page device and at
            // sheet width it would stack anyway, but with the wrong gaps.
            !embedded && 'lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]',
          )}
        >
          <div className="flex flex-col gap-6">
            <div
              ref={(el) => {
                stepRefs.current[0] = el;
              }}
              hidden={stepped && step !== 0}
              className="flex flex-col gap-6"
            >
              <Card className="border-line/10 rounded-3xl border shadow-sm">
                <CardContent className="flex flex-col gap-6 p-6">
                  <SectionTitle
                    icon={FileText}
                    title="Basic details"
                    description="The essentials students will see first."
                  />
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="name" className="text-sm font-medium">
                        Listing name
                      </label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="e.g. Tanke Crescent"
                        defaultValue={property?.name}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="description" className="text-sm font-medium">
                        Description
                      </label>
                      <div className="relative">
                        <Textarea
                          id="description"
                          name="description"
                          rows={5}
                          maxLength={500}
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          placeholder="Describe the space and what's nearby."
                          className="resize-none pb-8"
                        />
                        <span className="text-content-muted pointer-events-none absolute right-3 bottom-3 text-xs">
                          {description.length} / 500
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="address" className="text-sm font-medium">
                        Address
                      </label>
                      {/* Google Places when it is available, an ordinary text
                          field when it is not   the component degrades on its
                          own, so a Maps outage cannot block a listing. */}
                      <AddressAutocomplete
                        id="address"
                        name="address"
                        placeholder="Start typing the address"
                        value={address}
                        onChange={(next) => {
                          setAddress(next);
                          // TYPING AFTER PICKING INVALIDATES THE PIN. Keeping the
                          // old coordinates would leave the listing ranked at an
                          // address it no longer claims, which is worse than
                          // having no pin at all.
                          setCoords(null);
                        }}
                        onResolved={(place) => {
                          setAddress(place.address);
                          if (place.lat !== undefined && place.lng !== undefined) {
                            setCoords({ lat: place.lat, lng: place.lng });
                            // The nearest service area, offered rather than
                            // imposed: the landlord can still correct it.
                            const near = nearestArea({ lat: place.lat, lng: place.lng }, areas);
                            if (near) setArea(near);
                          }
                        }}
                      />

                      <label htmlFor="area" className="mt-2 text-sm font-medium">
                        Area
                      </label>
                      <Select value={area} onValueChange={setArea}>
                        <SelectTrigger id="area">
                          <SelectValue placeholder="Which area is it in?" />
                        </SelectTrigger>
                        <SelectContent>
                          {areas.map((a) => (
                            <SelectItem key={a.slug} value={a.name}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-content-muted text-xs">
                        {coords
                          ? 'Located   this listing will show up for students searching near it.'
                          : 'Not on the map yet, so it will not appear under “Near me”. Pick a suggestion as you type, or place it yourself below.'}
                      </p>

                      {/* The fallback the autocomplete cannot be: Places does
                          not know most Malete addresses, and a landlord who
                          types one by hand would otherwise have no way to give
                          us coordinates at all. */}
                      <button
                        type="button"
                        onClick={() => setShowPin((v) => !v)}
                        className="text-lime-deep self-start text-xs underline underline-offset-2"
                      >
                        {showPin
                          ? 'Hide the map'
                          : coords
                            ? 'Adjust the pin on the map'
                            : 'Place it on the map instead'}
                      </button>

                      {showPin && (
                        <PinDrop
                          value={coords}
                          onChange={(next) => {
                            setCoords(next);
                            // A hand-placed pin still answers "which area is
                            // this", and the landlord can override it after.
                            if (next) {
                              const near = nearestArea(next, areas);
                              if (near) setArea(near);
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div
              ref={(el) => {
                stepRefs.current[1] = el;
              }}
              hidden={stepped && step !== 1}
              className="flex flex-col gap-6"
            >
              <Card className="border-line/10 rounded-3xl border shadow-sm">
                <CardContent className="flex flex-col gap-6 p-6">
                  <SectionTitle
                    icon={ImagePlus}
                    title="Photos"
                    description="Add photos to showcase your property."
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={LISTING_ACCEPTED_TYPES.join(',')}
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      if (event.target.files) selectImages(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <div className="grid gap-5 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        selectImages(event.dataTransfer.files);
                      }}
                      className="border-line/20 text-content-muted hover:border-lime-deep hover:bg-lime/5 flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-5 text-center transition-colors"
                    >
                      <UploadCloud className="size-8" />
                      <span className="text-sm font-medium">Click to upload or drag and drop</span>
                      <span className="text-xs">Photos to 5MB · video to 40MB</span>
                    </button>
                    <div className="min-w-0">
                      <p className="mb-2 text-sm font-medium">
                        Listing media ({media.length})
                        {uploading > 0 ? ` · uploading ${uploading}…` : ''}
                      </p>
                      <p className="text-content-muted text-xs">
                        The first photo is the one students see on the listing card. Videos can be
                        added too they play on the listing, but cannot be the card image.
                      </p>
                      {media.length ? (
                        <div className="grid grid-cols-2 gap-2">
                          {media.map((item, index) => (
                            <div
                              key={`${item.url}-${index}`}
                              className="relative aspect-[4/3] overflow-hidden rounded-xl first:col-span-2 first:aspect-video"
                            >
                              {item.kind === 'video' ? (
                                // Muted and controlled: a grid of autoplaying
                                // walkthroughs would be four videos shouting at
                                // a landlord editing a form.
                                <video
                                  src={item.url}
                                  controls
                                  muted
                                  playsInline
                                  className="size-full bg-black object-cover"
                                />
                              ) : (
                                <Image
                                  src={item.url}
                                  alt={`Listing preview ${index + 1}`}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                />
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="bg-panel absolute top-2 right-2"
                                aria-label={`Remove item ${index + 1}`}
                                onClick={() => removeMedia(index)}
                              >
                                <X className="size-4" />
                              </Button>
                              {/* Position 0 is what the card and every listing
                                  tile shows, so it is worth naming rather than
                                  leaving to be inferred from the layout. */}
                              {index === 0 ? (
                                <span className="bg-lime-deep absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
                                  Primary
                                </span>
                              ) : item.kind === 'image' ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="bg-panel absolute bottom-2 left-2 text-xs"
                                  onClick={() => makePrimary(index)}
                                >
                                  Make primary
                                </Button>
                              ) : (
                                <span className="bg-ink/70 absolute bottom-2 left-2 rounded px-2 py-0.5 text-[10px] tracking-wide text-white uppercase">
                                  Video
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-surface-deep text-content-muted flex min-h-40 items-center justify-center rounded-2xl text-sm">
                          Your photo previews will appear here.
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div
              ref={(el) => {
                stepRefs.current[2] = el;
              }}
              hidden={stepped && step !== 2}
              className="flex flex-col gap-6"
            >
              <Card className="border-line/10 rounded-3xl border shadow-sm">
                <CardContent className="flex flex-col gap-6 p-6">
                  <SectionTitle
                    icon={Tag}
                    title="Amenities & rules"
                    description="Select everything this property offers."
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {shownAmenities.map((amenity) => {
                      const checked = amenities.includes(amenity);
                      return (
                        <label
                          key={amenity}
                          className={cn(
                            'border-line/15 flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm transition-colors',
                            checked ? 'border-lime-deep bg-lime/10' : 'hover:bg-surface-deep',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleAmenity(amenity)}
                          />
                          {amenity}
                        </label>
                      );
                    })}
                  </div>
                  {/* The six above are the common ones, not the whole world.
                      `hostels.amenities` is an unconstrained text[], so a
                      borehole or a reading room has always been storable   there
                      was simply no way to say it. */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="amenity-draft" className="text-sm font-medium">
                      Anything else it offers
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="amenity-draft"
                        value={amenityDraft}
                        onChange={(event) => setAmenityDraft(event.target.value)}
                        onKeyDown={(event) => {
                          // Enter adds the amenity; it must not submit the form
                          // from step three.
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addAmenity();
                          }
                        }}
                        placeholder="Borehole, reading room, generator…"
                        maxLength={40}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addAmenity}
                        disabled={!amenityDraft.trim()}
                      >
                        Add
                      </Button>
                    </div>
                    <p className="text-content-muted text-xs">
                      Added amenities appear above, ticked. Untick to remove one.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="rule-draft" className="text-sm font-medium">
                      House rules
                    </label>

                    {/* A LIST, BECAUSE IT IS READ AS ONE. A student scanning
                        rules to decide whether they can live here reads bullets;
                        one textarea meant every renderer re-parsed the newlines
                        and dashes slightly differently. */}
                    {rules.length > 0 && (
                      <ul className="border-line/15 divide-line/10 divide-y rounded-xl border">
                        {rules.map((rule, index) => (
                          <li
                            key={`${index}-${rule}`}
                            className="flex items-start gap-2 px-3 py-2 text-sm"
                          >
                            <span className="text-lime-deep mt-0.5 shrink-0" aria-hidden="true">
                              &bull;
                            </span>
                            <span className="min-w-0 flex-1 break-words">{rule}</span>
                            <button
                              type="button"
                              onClick={() => removeRule(index)}
                              className="text-content-muted hover:text-coral shrink-0"
                              aria-label={`Remove rule: ${rule}`}
                            >
                              <X className="size-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Retired room types land here. A landlord who used to
                        pick "Female only" as a room type finds it offered as
                        what it actually is. */}
                    <div className="flex flex-wrap gap-1.5">
                      {ruleSuggestions
                        .filter((s) => !rules.some((r) => r.toLowerCase() === s.toLowerCase()))
                        .map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setRules((current) => [...current, suggestion])}
                            className="border-line/15 text-content-muted hover:border-lime-deep hover:text-content rounded-full border px-2.5 py-1 text-xs transition-colors"
                          >
                            + {suggestion}
                          </button>
                        ))}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        id="rule-draft"
                        value={ruleDraft}
                        onChange={(event) => setRuleDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addRule();
                          }
                        }}
                        placeholder="e.g. Gate closes at 10pm"
                        maxLength={200}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addRule}
                        disabled={!ruleDraft.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-5">
            <div
              ref={(el) => {
                stepRefs.current[3] = el;
              }}
              hidden={stepped && step !== 3}
              className="flex flex-col gap-6"
            >
              <Card className="border-line/10 rounded-3xl border shadow-sm">
                <CardContent className="flex flex-col gap-6 p-6">
                  <SectionTitle
                    icon={Tag}
                    title="Pricing & type"
                    description="Set how your property is listed."
                  />
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="price" className="text-sm font-medium">
                        Rent per session (₦)
                      </label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        min="1"
                        placeholder="150000"
                        defaultValue={property?.price}
                        onChange={(e) => setPrice(Number(e.target.value) || 0)}
                        required
                      />
                    </div>

                    {/*
                      SYNC'S CUT, SAID OUT LOUD.
                      This form used to collect a price and stop, so a landlord
                      found out what Sync takes when their payout arrived   and
                      the student's listing page invented an "overhead fee" and
                      a "mandatory inspection fee" to fill the silence. The
                      charge is 2.5% of the rent either way; the only question
                      is which side of the deal it comes out of, and that is the
                      landlord's to answer.
                    */}
                    <FeeModeField mode={feeMode} onChange={setFeeMode} priceNaira={price} />

                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Billing term</label>
                      <Select name="term" defaultValue={property?.term ?? 'per session'}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per session">Per session</SelectItem>
                          <SelectItem value="per year">Per year</SelectItem>
                          <SelectItem value="per semester">Per semester</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-sm font-medium">Room type</label>
                      <Select name="roomType" defaultValue={property?.roomType} required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select room type" />
                        </SelectTrigger>
                        <SelectContent>
                          {roomTypes.map((roomType) => (
                            <SelectItem key={roomType.slug} value={roomType.name}>
                              {roomType.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="roomsTotal" className="text-sm font-medium">
                        Total rooms
                      </label>
                      <Input
                        id="roomsTotal"
                        name="roomsTotal"
                        type="number"
                        min="1"
                        defaultValue={property?.roomsTotal}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* On a page the actions belong under the summary card they follow.
              In a sheet they are pinned to the bottom instead   see the footer
              after this grid. */}
            {!stepped && (
              <div className="flex flex-col gap-3">
                <Button type="submit" size="lg" disabled={saving} className="w-full">
                  <Save className="size-4" />
                  {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save property'}
                </Button>
                <Button type="button" variant="outline" size="lg" className="w-full" asChild>
                  <Link href="/landlord/properties">Cancel</Link>
                </Button>
              </div>
            )}
          </aside>
        </div>
      </StepBody>

      {/* Default size, and the primary one flex-1   the same footer the
          onboarding wizard has. size="lg" here made two buttons that were
          taller than the product's own and still narrower, which is the
          combination that reads as "small". */}
      {stepped && (
        <SheetFooter>
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => goTo(step - 1)}>
              Back
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            // A button, never a submit: Enter on a text field would otherwise
            // save a half-filled listing from step one.
            <Button type="button" onClick={nextStep} className="sm:flex-1">
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={saving} className="gap-2 sm:flex-1">
              <Save className="size-4" />
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save property'}
            </Button>
          )}
        </SheetFooter>
      )}
    </form>
  );
}

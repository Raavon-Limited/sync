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
import { saveHostel } from '@/modules/hostels/actions';
import type { Property } from '../landlord-types';
import { cn } from '@/lib/utils';

const amenityOptions = ['Wi-Fi', '24/7 Power', 'Water', 'Security', 'Kitchen', 'Parking'];
/**
 * The sheet's four steps, in the order the fields already sit in the markup.
 * Named for what the landlord is doing, not for the card component they live
 * in   the label is read in "Step 2 of 4 · Photos", which is a sentence.
 */
const STEPS = ['Details', 'Photos', 'Amenities', 'Pricing'] as const;

const roomTypeOptions = ['Self-contained', 'Single room', 'Shared room', 'Studio'];

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
}: {
  property?: Property;
  embedded?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(property);
  const [amenities, setAmenities] = useState<string[]>(property?.amenities ?? []);
  const [description, setDescription] = useState(property?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>(
    property?.imageUrls?.length
      ? property.imageUrls
      : property?.imageUrl
        ? [property.imageUrl]
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

  function toggleAmenity(amenity: string) {
    setAmenities((current) =>
      current.includes(amenity)
        ? current.filter((item) => item !== amenity)
        : [...current, amenity],
    );
  }

  function selectImages(files: FileList | File[]) {
    const nextFiles = Array.from(files);
    if (!nextFiles.length) return;
    const acceptedFiles = nextFiles.filter((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not a supported image`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 10 MB`);
        return false;
      }
      return true;
    });

    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setImageUrls((current) => [...current, String(reader.result)]);
      reader.readAsDataURL(file);
    });
  }

  function removeImage(index: number) {
    setImageUrls((current) => current.filter((_, currentIndex) => currentIndex !== index));
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

    if (!imageUrls.length) {
      toast.error('Add a property photo before submitting');
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
      address: String(formData.get('address')).trim(),
      price: Number(formData.get('price')),
      roomType: String(formData.get('roomType')),
      amenities,
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
                      <Input
                        id="address"
                        name="address"
                        placeholder="Street, area, city"
                        defaultValue={property?.address}
                        required
                      />
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
                    accept="image/png,image/jpeg"
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
                      <span className="text-xs">
                        Add one or more JPG or PNG files, up to 10MB each
                      </span>
                    </button>
                    <div className="min-w-0">
                      <p className="mb-2 text-sm font-medium">
                        Listing photos ({imageUrls.length})
                      </p>
                      {imageUrls.length ? (
                        <div className="grid grid-cols-2 gap-2">
                          {imageUrls.map((imageUrl, index) => (
                            <div
                              key={`${imageUrl}-${index}`}
                              className="relative aspect-[4/3] overflow-hidden rounded-xl first:col-span-2 first:aspect-video"
                            >
                              <Image
                                src={imageUrl}
                                alt={`Listing preview ${index + 1}`}
                                fill
                                unoptimized
                                className="object-cover"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="bg-panel absolute top-2 right-2"
                                aria-label={`Remove photo ${index + 1}`}
                                onClick={() => removeImage(index)}
                              >
                                <X className="size-4" />
                              </Button>
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
                    {amenityOptions.map((amenity) => {
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
                  <div className="flex flex-col gap-2">
                    <label htmlFor="rules" className="text-sm font-medium">
                      House rules
                    </label>
                    <Textarea
                      id="rules"
                      name="rules"
                      rows={3}
                      defaultValue={property?.houseRules}
                      placeholder="e.g. No loud music after 10pm."
                    />
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
                        Price (₦)
                      </label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        min="1"
                        placeholder="150000"
                        defaultValue={property?.price}
                        required
                      />
                    </div>
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
                          {roomTypeOptions.map((roomType) => (
                            <SelectItem key={roomType} value={roomType}>
                              {roomType}
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

/**
 * Rider signup: who you ride as, what you ride, and your papers.
 *
 * TWO KINDS OF APPLICANT, ONE FORM
 *   An independent rider and a fleet operator answer the same questions plus
 *   three. Splitting them into two wizards would mean two copies of the document
 *   step — the part with the camera, the two-sided-ID rules and the RLS-shaped
 *   upload path — for the sake of three text boxes.
 *
 * WHAT "COMPANY" ACTUALLY MEANS HERE
 *   The person filling this in is registering a fleet AND themselves as its
 *   first rider. That is not an assumption: set_rider_company is called with
 *   their own id in submitRiderOnboarding, because a fleet owner whose own
 *   deliveries did not count towards their own company would be a strange thing
 *   to build. They add their other riders afterwards, from /rider/fleet.
 *
 * THE DOCUMENTS ASKED FOR DIFFER BY MODE
 *   `requirementsFor('rider')` is a live photo, an ID and proof of address.
 *   `requirementsFor('company')` adds the CAC certificate. Asking an
 *   independent okada rider for a CAC certificate is how signup gets abandoned
 *   halfway, which is exactly what modules/verification/requirements exists to
 *   prevent.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Loader2, User } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField } from '@/components/forms';
import { cn } from '@/lib/utils';
import {
  VerificationDocuments,
  documentsProblem,
  emptyDocumentState,
  type DocumentState,
} from '@/components/verification/document-upload';
import {
  uploadQueuedDocuments,
  type UploadProgress,
} from '@/components/verification/upload-documents';
import { submitRiderOnboarding } from '@/modules/rider/actions';

const VEHICLES = [
  { value: 'motorcycle', label: 'Motorcycle (okada)' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'car', label: 'Car' },
  { value: 'foot', label: 'On foot' },
];

type Mode = 'personal' | 'company';

export function RiderSignup() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('personal');
  const [vehicleType, setVehicleType] = useState('motorcycle');
  const [plateNumber, setPlateNumber] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');

  // The requirement set changes with the mode, so the held files are keyed off
  // the mode's role. Switching mode keeps what was already picked for the keys
  // both modes share — nobody should have to re-take a live photo because they
  // changed their mind about registering a company.
  const role = mode === 'company' ? ('company' as const) : ('rider' as const);
  const [docState, setDocState] = useState<DocumentState>(() => emptyDocumentState('company'));

  const [docError, setDocError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setDocError(null);

    if (mode === 'company' && !companyName.trim()) {
      setError('Your company needs a name.');
      return;
    }
    // A vehicle with no plate is fine on a bicycle and on foot; it is not fine
    // on something with a plate, because that is what a reviewer checks the
    // licence against.
    if ((vehicleType === 'motorcycle' || vehicleType === 'car') && !plateNumber.trim()) {
      setError('We need your plate number.');
      return;
    }

    const problem = documentsProblem(role, docState);
    if (problem) {
      setDocError(problem);
      return;
    }

    setBusy(true);
    const upload = await uploadQueuedDocuments(role, docState, setProgress);
    if (!upload.ok) {
      setProgress(null);
      setBusy(false);
      setError(upload.error);
      return;
    }

    const res = await submitRiderOnboarding(
      {
        mode,
        vehicleType,
        plateNumber: plateNumber.trim() || null,
        companyName: companyName.trim() || null,
        companyAddress: companyAddress.trim() || null,
        companyPhone: companyPhone.trim() || null,
      },
      upload.uploaded,
    );

    setProgress(null);
    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push('/rider');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-content font-medium">How do you ride?</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard
            active={mode === 'personal'}
            onClick={() => setMode('personal')}
            icon={<User className="size-5" aria-hidden="true" />}
            title="On my own"
            body="You ride for yourself and keep your own delivery fees."
          />
          <ModeCard
            active={mode === 'company'}
            onClick={() => setMode('company')}
            icon={<Building2 className="size-5" aria-hidden="true" />}
            title="I run a logistics company"
            body="Register a fleet, then add your riders. They take jobs off the same board."
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-content font-medium">What do you ride?</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Vehicle" htmlFor="rider-vehicle">
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger id="rider-vehicle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLES.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Plate number" htmlFor="rider-plate">
            <Input
              id="rider-plate"
              value={plateNumber}
              onChange={(e) => setPlateNumber(e.target.value)}
              placeholder={
                vehicleType === 'bicycle' || vehicleType === 'foot' ? 'Not needed' : 'ABC-123-XY'
              }
              disabled={vehicleType === 'bicycle' || vehicleType === 'foot'}
            />
          </FormField>
        </div>
      </section>

      {mode === 'company' && (
        <section className="flex flex-col gap-3">
          <h3 className="text-content font-medium">Your company</h3>
          <FormField label="Registered name" htmlFor="fleet-name">
            <Input
              id="fleet-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="As it appears on your CAC certificate"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Office address" htmlFor="fleet-address">
              <Input
                id="fleet-address"
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                placeholder="Where you operate from"
              />
            </FormField>
            <FormField label="Office phone" htmlFor="fleet-phone">
              <Input
                id="fleet-phone"
                value={companyPhone}
                onChange={(e) => setCompanyPhone(e.target.value)}
                placeholder="For students and vendors to reach you"
              />
            </FormField>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-content font-medium">Your documents</h3>
        <VerificationDocuments
          role={role}
          value={docState}
          onChange={setDocState}
          error={docError ?? undefined}
        />
      </section>

      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {progress && (
        <p className="text-content-muted text-sm">
          Uploading {progress.done} of {progress.total} — {progress.label}
        </p>
      )}

      <Button disabled={busy} onClick={submit}>
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        {busy ? 'Submitting…' : 'Submit for review'}
      </Button>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left transition-colors',
        active ? 'border-lime-deep/40 bg-lime/10' : 'border-line/10 bg-panel hover:border-line/25',
      )}
    >
      <span className={active ? 'text-lime-deep' : 'text-content-muted'}>{icon}</span>
      <span className="text-content font-medium">{title}</span>
      <span className="text-content-muted text-xs">{body}</span>
    </button>
  );
}

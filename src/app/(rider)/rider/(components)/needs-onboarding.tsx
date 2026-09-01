/**
 * What a brand-new rider sees before they have told us anything.
 *
 * AN EMPTY STATE, NOT A REDIRECT
 *   Bouncing straight to the signup form was the wrong shape twice over: it
 *   made the dashboard unreachable until the form was finished, so somebody who
 *   wanted a look before committing had nowhere to look — and it meant a rider
 *   who closed the form halfway hit the same wall every time they came back,
 *   with no sense of what they were being asked into. The dashboard is theirs
 *   from the moment the account exists. It just has nothing in it yet, and says
 *   what would fill it.
 */
import Link from 'next/link';
import { Bike, Camera, IdCard } from 'lucide-react';
import { Button } from '@/components/ui';

const STEPS = [
  { icon: Bike, label: 'What you ride', hint: 'Vehicle and plate number' },
  { icon: Camera, label: 'A live photo', hint: 'Taken on your camera, not uploaded' },
  { icon: IdCard, label: 'Your ID and address', hint: 'NIN, licence or passport' },
];

export function NeedsOnboarding() {
  return (
    <div className="border-line/10 bg-panel flex flex-col gap-5 rounded-xl border p-6">
      <div>
        <p className="text-content text-lg font-medium">Set up your rider account</p>
        <p className="text-content-muted mt-1 text-sm">
          You are signed in, but you cannot take delivery jobs until a reviewer has checked who you
          are. It takes a few minutes and usually gets a decision within a day.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {STEPS.map((s) => (
          <li key={s.label} className="flex items-start gap-3">
            <span className="border-line/10 bg-ink/20 text-content-muted flex size-9 shrink-0 items-center justify-center rounded-lg border">
              <s.icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="text-content block text-sm font-medium">{s.label}</span>
              <span className="text-content-muted block text-xs">{s.hint}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* Named for what it does rather than "continue": it is a real amount of
          work and pretending otherwise is how people abandon it halfway. */}
      <Button asChild className="w-fit">
        <Link href="/rider/join">Set up my account</Link>
      </Button>

      <p className="text-content-muted text-xs">
        Run a logistics company? You can register the fleet in the same form and add your riders
        afterwards.
      </p>
    </div>
  );
}

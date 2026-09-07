/**
 * "How this works", behind a button.
 *
 * WHY IT IS NOT ON THE PAGE ANY MORE
 *   Both agent screens opened with three or four sentences of explanation. They
 *   are accurate and worth reading - once. On a phone they were most of the
 *   first screen, every day, in front of the one thing the agent actually came
 *   for, which is the address of the place they are going. Reference text that
 *   never changes should not out-rank live work for space.
 *
 * IT IS A DIALOG, NOT A COLLAPSE
 *   An accordion on this page would push the list down when opened, which is
 *   the same problem in a smaller form. A dialog costs the layout nothing.
 */
'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui';

const COPY = {
  visits: {
    title: 'How a verification visit works',
    lead: 'Staff send you to check a listing is real. The owner has already been told your name.',
    points: [
      'The brief on each card is the half a listing cannot tell you: which gate, who to ask for, what to photograph.',
      'Take the photos, add one of yourself at the property, and file what you found.',
      'A reviewer decides — you never decide your own visit. That separation is the whole point of the job.',
    ],
  },
  requests: {
    title: 'How viewing requests work',
    lead: 'A student paid for somebody to show them a room. Nobody assigns these — you take them.',
    points: [
      'First agent to tap gets it, and the student is told your name straight away.',
      'The fee is yours in full. Sync takes no commission on a viewing.',
      'Filing your report is what releases your money — until you file, it sits in escrow.',
      'Miss the time and it goes back on the board for someone else, and you cannot take that one again.',
    ],
  },
} as const;

export function AgentIntro({ kind }: { kind: keyof typeof COPY }) {
  const [open, setOpen] = useState(false);
  const copy = COPY[kind];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="border-line/15 text-content-muted hover:text-content hover:bg-surface-deep inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors"
        >
          <HelpCircle className="size-3.5" />
          How this works
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.lead}</DialogDescription>
        </DialogHeader>

        <ul className="text-content-muted flex flex-col gap-2 text-sm">
          {copy.points.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden="true" className="text-lime-deep mt-0.5">
                •
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

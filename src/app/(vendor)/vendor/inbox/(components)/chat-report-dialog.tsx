'use client';

import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@/components/ui';

interface ChatReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactName: string;
  onSubmit: (reason: string, details: string) => void;
}

const REPORT_REASONS = [
  'Spam or scam',
  'Harassment or abuse',
  'Fraudulent payment',
  'Inappropriate content',
  'Something else',
];

/**
 * "Report Customer" - collects a reason before reporting. Kept as a dialog
 * rather than a one-tap menu action so a misclick can't file a report.
 */
export function ChatReportDialog({
  open,
  onOpenChange,
  contactName,
  onSubmit,
}: ChatReportDialogProps) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [lastOpen, setLastOpen] = useState(open);

  /*
   * Reset the form each time the dialog opens so a previous draft doesn't
   * carry over into a report about a different conversation. Done during
   * render rather than in an effect to avoid a cascading render pass; both
   * sides of the comparison are the same boolean, so it converges in one go.
   */
  if (open !== lastOpen) {
    setLastOpen(open);

    if (open) {
      setReason(REPORT_REASONS[0]);
      setDetails('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Report {contactName}</DialogTitle>
        </DialogHeader>

        <RadioGroup value={reason} onValueChange={setReason} className="mt-2 flex flex-col gap-2.5">
          {REPORT_REASONS.map((item) => (
            <label
              key={item}
              className="hover:bg-ink/3 -mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors"
            >
              {/*
                The shared RadioGroupItem paints its dot with the lime brand
                accent, which reads oddly here and is low contrast on white.
                Match the violet the rest of the inbox uses.

                Radix renders its Indicator as a <span> wrapping our dot <span>,
                so the selector must be `span span` - plain `span` also hits the
                flex Indicator, which fills the whole circle and turns the
                control into a solid disc. `!` because twMerge can't dedupe a
                class that applies to a descendant rather than this element.
              */}
              <RadioGroupItem
                value={item}
                className="border-ink/30 data-[state=checked]:border-violet-600 [&_span_span]:bg-violet-600!"
              />
              {item}
            </label>
          ))}
        </RadioGroup>

        {/*
          globals.css gives every textarea a lime focus ring via --shadow-focus.
          Drop it here only - the base `focus:border-line` still darkens the
          border on focus, so the field stays keyboard-visible without the green.
        */}
        <Textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="Add any details (optional)"
          rows={3}
          className="mt-4 resize-none text-sm focus-visible:shadow-none!"
        />

        <DialogFooter className="mt-5 gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="text-coral border-coral/30 hover:bg-coral/10"
            onClick={() => onSubmit(reason, details.trim())}
          >
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

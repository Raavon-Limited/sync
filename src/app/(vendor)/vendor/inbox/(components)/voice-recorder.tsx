'use client';

import { useRef, useState } from 'react';
import { ChevronUp, Lock, Mic, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import { formatDuration, useVoiceRecorder, type VoiceRecording } from '@/hooks/use-voice-recorder';

/** Drag up past this (px) and the recording keeps going hands-free. */
const LOCK_DISTANCE = 56;
/** Drag left past this (px) and the take is thrown away. */
const CANCEL_DISTANCE = 90;
/** Shorter than this and it was a mis-tap, not a message. */
const MIN_DURATION_MS = 700;

interface VoiceRecorderProps {
  /** Called with the finished audio - the composer sends it straight away. */
  onRecorded: (recording: VoiceRecording) => void;
  disabled?: boolean;
}

/**
 * Press-and-hold voice notes, WhatsApp style.
 *
 * Hold the mic to record, slide up to lock it hands-free, slide left to bin it,
 * release to send. While recording it covers the composer row with a timer, a
 * live waveform and the relevant hint, so it needs a `relative` parent.
 *
 * Once locked the mic turns into a send button rather than the overlay growing
 * a second one - one control, one focus target, nothing overlapping.
 *
 * Keyboard users can't press-and-hold, so Enter/Space starts a locked recording
 * and a second press sends it.
 */
export function VoiceRecorder({ onRecorded, disabled }: VoiceRecorderProps) {
  const [locked, setLocked] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [willCancel, setWillCancel] = useState(false);

  const originRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef(false);
  /**
   * A pointer release fires `click` right after `pointerup`. The release has
   * already decided what to do, so that click must not start a new recording.
   */
  const suppressClickRef = useRef(false);

  const recorder = useVoiceRecorder({
    maxSeconds: 300,
    onMaxDurationReached: (recording) => {
      resetGesture();
      toast('Maximum length reached - voice note sent.');
      onRecorded(recording);
    },
  });

  function resetGesture() {
    originRef.current = null;
    lockedRef.current = false;
    setLocked(false);
    setWillCancel(false);
    setOffset({ x: 0, y: 0 });
  }

  async function beginRecording(): Promise<boolean> {
    try {
      // start() resolves false when it declines to start (already recording);
      // returning true regardless would leave the UI showing a phantom take.
      return await recorder.start();
    } catch (cause) {
      resetGesture();
      toast(cause instanceof Error ? cause.message : 'Could not start recording.');
      return false;
    }
  }

  /** Stops and sends, unless the take was too short to be intentional. */
  async function finishAndSend() {
    if (recorder.seconds * 1000 < MIN_DURATION_MS) {
      recorder.cancel();
      resetGesture();
      toast('Hold to record. Release to send.');
      return;
    }

    const recording = await recorder.stop();
    resetGesture();

    if (recording) onRecorded(recording);
  }

  function discard() {
    recorder.cancel();
    resetGesture();
    toast('Voice note discarded.');
  }

  async function startLocked() {
    if (await beginRecording()) {
      lockedRef.current = true;
      setLocked(true);
    }
  }

  /* ---------------------------- gesture ---------------------------- */

  async function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    suppressClickRef.current = false;

    // Already recording (locked) - let the click handler send instead.
    if (disabled || recorder.status !== 'idle') return;

    originRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);

    await beginRecording();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = originRef.current;
    if (!origin || !recorder.isRecording || lockedRef.current) return;

    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;

    if (dx < -CANCEL_DISTANCE) {
      discard();
      return;
    }

    if (dy < -LOCK_DISTANCE) {
      lockedRef.current = true;
      setLocked(true);
      setOffset({ x: 0, y: 0 });
      setWillCancel(false);
      return;
    }

    // Clamped so the mic can't be dragged beyond its own track.
    setOffset({
      x: Math.min(0, Math.max(dx, -CANCEL_DISTANCE)),
      y: Math.min(0, Math.max(dy, -LOCK_DISTANCE)),
    });
    setWillCancel(dx < -CANCEL_DISTANCE * 0.6);
  }

  function handlePointerUp() {
    // Locked: this release isn't the send action, so let the click through.
    if (lockedRef.current) return;

    suppressClickRef.current = true;
    if (!recorder.isRecording) return;

    void finishAndSend();
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (disabled) return;

    // Locked recording: the mic is now the send button.
    if (lockedRef.current) {
      void finishAndSend();
      return;
    }

    if (recorder.status !== 'idle') return;

    // No pointer gesture preceded this, so it came from the keyboard.
    void startLocked();
  }

  /* ----------------------------- render ---------------------------- */

  const active = recorder.isRecording || recorder.status === 'requesting';

  return (
    <>
      {active && (
        <div className="bg-panel absolute inset-0 z-10 flex items-center gap-3 rounded-xl px-3">
          <button
            type="button"
            onClick={discard}
            aria-label="Discard voice note"
            className="text-content-muted shrink-0 transition-colors hover:text-red-500"
          >
            <Trash2 className="size-4" />
          </button>

          <span className="flex shrink-0 items-center gap-2">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
            <span className="text-content text-sm font-medium tabular-nums">
              {formatDuration(recorder.seconds)}
            </span>
          </span>

          {/* Level meter - decorative; the timer carries the actual state. */}
          <span
            className="flex h-8 min-w-0 flex-1 items-center gap-[2px] overflow-hidden"
            aria-hidden="true"
          >
            {recorder.levels.map((level, index) => (
              <span
                key={index}
                className="bg-accent-fg/70 w-[3px] shrink-0 rounded-full"
                style={{ height: `${Math.max(10, level * 100)}%` }}
              />
            ))}
          </span>

          {!locked && (
            <span
              className={cn(
                'shrink-0 text-xs whitespace-nowrap transition-colors',
                willCancel ? 'font-medium text-red-500' : 'text-content-muted',
              )}
            >
              {willCancel ? 'Release to cancel' : '‹ Slide to cancel'}
            </span>
          )}
        </div>
      )}

      {/* Lock hint rides above the mic while holding. */}
      {active && !locked && (
        <span
          className="border-line/10 bg-panel text-content-muted absolute right-3 bottom-14 z-20 flex flex-col items-center gap-1 rounded-full border px-2 py-2 shadow-sm"
          aria-hidden="true"
          style={{ transform: `translateY(${offset.y}px)` }}
        >
          <Lock className="size-3.5" />
          <ChevronUp className="size-3.5 animate-bounce" />
        </span>
      )}

      <button
        type="button"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        style={{
          // Keeps the drag from scrolling the page or selecting text.
          touchAction: 'none',
          transform: active && !locked ? `translateX(${offset.x}px)` : undefined,
        }}
        aria-label={
          locked
            ? 'Send voice note'
            : active
              ? 'Recording - release to send'
              : 'Record a voice note'
        }
        className={cn(
          'focus-visible:ring-accent-fg relative z-20 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors select-none focus-visible:ring-2 focus-visible:outline-none',
          locked && 'bg-accent-fg text-surface',
          active && !locked && 'bg-red-500 text-white',
          !active && 'text-violet-500',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {locked ? <Send className="size-4" /> : <Mic className="size-4" />}
      </button>
    </>
  );
}

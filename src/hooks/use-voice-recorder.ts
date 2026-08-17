'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceRecording {
  file: File;
  /** Object URL for playback. Ownership passes to the caller. */
  url: string;
  /** Seconds, measured from elapsed time - webm blobs often lack duration metadata. */
  duration: number;
}

export type RecorderStatus = 'idle' | 'requesting' | 'recording';

/**
 * Containers in preference order. Chrome/Firefox take webm/opus; Safari only
 * offers mp4/aac. An empty string means "let the browser choose" rather than
 * handing MediaRecorder a type it will reject.
 */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  return 'bin';
}

/** How many amplitude samples the waveform keeps. */
const WAVE_BARS = 42;
/** ~20fps is plenty for a waveform and keeps React re-renders sane. */
const WAVE_INTERVAL_MS = 50;

interface Options {
  /** Hard cap; recording auto-stops here. Defaults to 5 minutes. */
  maxSeconds?: number;
  /** Fired when the cap is reached, with the finished recording. */
  onMaxDurationReached?: (recording: VoiceRecording) => void;
}

/** The browser's own permission state, when the Permissions API knows it. */
async function micPermissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const status = await navigator.permissions?.query({
      name: 'microphone' as PermissionName,
    });
    return status?.state ?? 'unknown';
  } catch {
    // Firefox/Safari don't expose the microphone descriptor.
    return 'unknown';
  }
}

/**
 * Turns a getUserMedia rejection into something actionable.
 *
 * `NotAllowedError` is the confusing one: the browser reports it both when the
 * *site* permission is denied and when the site is allowed but the microphone
 * is blocked further up - Windows privacy settings, an enterprise policy, or an
 * extension. Cross-referencing the Permissions API separates those, because
 * "allow it in your browser" is useless advice when the browser already allows it.
 */
async function describeMediaError(cause: unknown): Promise<Error> {
  const name = cause instanceof DOMException ? cause.name : '';
  // Surfaced in the toast on purpose: Chrome's own text is the giveaway here -
  // "Permission denied by system" means the OS, not the site permission.
  const detail = name
    ? ` (${name}${cause instanceof Error && cause.message ? `: ${cause.message}` : ''})`
    : '';

  if (name === 'NotAllowedError') {
    const state = await micPermissionState();

    if (state === 'granted') {
      return new Error(
        `This site is allowed to use the mic, so something outside the browser is blocking it - check Windows Settings > Privacy & security > Microphone, and that no other app has the mic.${detail}`,
      );
    }

    if (state === 'prompt') {
      return new Error(
        `The microphone request was dismissed. Try again and choose Allow.${detail}`,
      );
    }

    if (state === 'denied') {
      /*
       * Two very different causes look identical here. The Permissions API
       * folds the page's Permissions-Policy into its answer, so a response
       * header of `microphone=()` reports "denied" even when the user has
       * allowed the site - which is exactly how this shipped broken once.
       */
      return new Error(
        `Microphone blocked. Check the site permission in the address bar, and that the page's Permissions-Policy header allows microphone=(self).${detail}`,
      );
    }

    return new Error(`Microphone access was refused.${detail}`);
  }

  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new Error('No microphone found. Plug one in or pick one in your sound settings.');
  }

  if (name === 'NotReadableError') {
    return new Error(`Your microphone is in use by another app. Close it and try again.${detail}`);
  }

  if (name === 'AbortError' || name === 'SecurityError') {
    return new Error(`The browser blocked microphone access.${detail}`);
  }

  return new Error(
    cause instanceof Error
      ? `Could not start recording: ${cause.message}`
      : 'Could not start recording.',
  );
}

/**
 * Microphone recording for the chat composer.
 *
 * Owns the MediaRecorder, the elapsed timer, and a live amplitude readout for
 * the waveform. `stop()` resolves with the finished audio; `cancel()` throws it
 * away. Either way the mic track is released, so the browser's recording
 * indicator doesn't linger.
 */
export function useVoiceRecorder({ maxSeconds = 300, onMaxDurationReached }: Options = {}) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSampleRef = useRef(0);

  /** Set before stopping when the take should be discarded rather than kept. */
  const discardRef = useRef(false);
  /** Resolver for the promise handed back by stop(). */
  const settleRef = useRef<((recording: VoiceRecording | null) => void) | null>(null);
  /** Latest callback without making it a dependency of start(). */
  const onMaxRef = useRef(onMaxDurationReached);
  useEffect(() => {
    onMaxRef.current = onMaxDurationReached;
  }, [onMaxDurationReached]);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    // Releasing every track is what actually turns the mic indicator off.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;

    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  /** Samples the analyser into a rolling window of normalised levels. */
  const startMetering = useCallback((stream: MediaStream) => {
    const Ctx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const context = new Ctx();
    audioCtxRef.current = context;

    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastSampleRef.current < WAVE_INTERVAL_MS) return;
      lastSampleRef.current = now;

      analyser.getByteTimeDomainData(buffer);

      // RMS around the 128 midpoint, scaled so normal speech lands mid-range.
      let sum = 0;
      for (const value of buffer) {
        const delta = (value - 128) / 128;
        sum += delta * delta;
      }
      const level = Math.min(1, Math.sqrt(sum / buffer.length) * 3.2);

      setLevels((prev) => [...prev, level].slice(-WAVE_BARS));
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const finish = useCallback((): VoiceRecording | null => {
    const type = recorderRef.current?.mimeType || pickMimeType() || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type });

    if (blob.size === 0) return null;

    const duration = (Date.now() - startedAtRef.current) / 1000;
    const file = new File([blob], `voice-note-${Date.now()}.${extensionFor(type)}`, { type });

    return { file, url: URL.createObjectURL(file), duration };
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (status !== 'idle') return false;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Recording needs a secure connection (https) and a supported browser.');
    }

    setStatus('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (cause) {
      setStatus('idle');
      throw await describeMediaError(cause);
    }

    streamRef.current = stream;
    chunksRef.current = [];
    discardRef.current = false;

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      // Build the file before teardown clears the chunks it reads from.
      const recording = discardRef.current ? null : finish();

      teardown();
      setStatus('idle');
      setSeconds(0);
      setLevels([]);

      settleRef.current?.(recording);
      settleRef.current = null;
    };

    // Timeslice so chunks land steadily rather than only at stop.
    recorder.start(250);
    startedAtRef.current = Date.now();
    setStatus('recording');
    setSeconds(0);
    setLevels([]);

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setSeconds(elapsed);

      if (elapsed >= maxSeconds && recorderRef.current?.state === 'recording') {
        // Hit the cap: keep what we have and hand it back through the callback.
        settleRef.current = (recording) => {
          if (recording) onMaxRef.current?.(recording);
        };
        recorderRef.current.stop();
      }
    }, 200);

    startMetering(stream);
    return true;
  }, [status, finish, teardown, startMetering, maxSeconds]);

  const stop = useCallback((): Promise<VoiceRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);

    discardRef.current = false;
    return new Promise((resolve) => {
      settleRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    discardRef.current = true;

    if (!recorder || recorder.state === 'inactive') {
      teardown();
      setStatus('idle');
      setSeconds(0);
      setLevels([]);
      return;
    }

    recorder.stop();
  }, [teardown]);

  // Leaving the chat mid-recording must not keep the mic open.
  useEffect(() => {
    return () => {
      discardRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      teardown();
    };
  }, [teardown]);

  return { status, seconds, levels, start, stop, cancel, isRecording: status === 'recording' };
}

/** m:ss for the recording timer. */
export function formatDuration(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

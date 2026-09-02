/**
 * A real camera, for the live photo.
 *
 * WHY THE `capture` ATTRIBUTE WAS NOT ENOUGH
 *   `<input type="file" capture="user">` asks a PHONE to open its camera. Every
 *   desktop browser ignores it outright and opens the file picker, so the one
 *   document that exists to prove a person is present was being satisfied by
 *   whatever image they had lying around. `requirementsFor` has said
 *   `captureOnly: true` for the live photo since it was written; this is the
 *   first thing that actually honours it.
 *
 * IT STILL RAISES THE BAR RATHER THAN CLOSING THE DOOR
 *   A browser cannot prove an image came from a live camera   a determined
 *   person can post a saved file straight at the endpoint, or point the lens at
 *   a printed photo. What this stops is the ordinary case: quietly picking
 *   somebody else's picture out of a gallery. Real liveness (depth, motion,
 *   challenge-response) is what Smile ID and Dojah sell, and until one is wired
 *   in this plus a human comparing the face to the ID is the check.
 *
 * THE STREAM IS STOPPED ON EVERY EXIT PATH
 *   Cancel, capture, unmount, and the error path. A MediaStream left running
 *   holds the camera open with the indicator light on, on somebody's laptop,
 *   after they have moved on   which is both alarming and a bug people report
 *   as spyware.
 *
 * NO CAMERA IS A FALLBACK, NOT A DEAD END
 *   A desktop with no webcam, a denied permission, a locked-down browser: all
 *   real, and none of them should end an application. The caller is told, and
 *   offers the file picker instead.
 */
/* eslint-disable @next/next/no-img-element -- the preview is a blob: URL for a
   photo taken a moment ago. There is nothing for next/image to optimise and it
   cannot fetch a blob anyway. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui';

export function CameraCapture({
  onCapture,
  onClose,
  onUnavailable,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Called when there is no usable camera, so the caller can offer the picker. */
  onUnavailable?: (reason: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Held in a ref so `start` needs no dependency on it. Callers pass an inline
  // function, which as a dependency would re-request the camera on every render
  // of the parent   a permission prompt that reappears while you are looking at
  // it.
  const onUnavailableRef = useRef(onUnavailable);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);

  // Kept current in an effect rather than assigned during render, which is a
  // write during a phase that is meant to be pure.
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /**
   * Open the camera and attach it to the <video>. Called on mount and again
   * after "Take another"   the alternative, reloading the page to get a fresh
   * stream, would throw away every other answer on the form.
   *
   * `cancelled` lets the caller abandon a request that is still sitting on the
   * permission prompt when the component goes away.
   */
  const start = useCallback(async (cancelled: () => boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const reason = 'This browser cannot open a camera.';
      if (!cancelled()) {
        setError(reason);
        onUnavailableRef.current?.(reason);
      }
      return;
    }

    try {
      // `user` is the selfie camera on a phone and the only one on a laptop.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });

      // Unmounted while the permission prompt was open. Stopping the tracks
      // here is the difference between a camera that switches off and one
      // that stays on with nothing rendering it.
      if (cancelled()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          // Autoplay refusal is not fatal   the stream is attached and the
          // frame still renders once the element is visible.
        });
      }
      setReady(true);
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      const reason = denied
        ? 'Camera permission was refused. Allow it in your browser, or upload a photo instead.'
        : 'No camera was found on this device.';
      if (!cancelled()) {
        setError(reason);
        onUnavailableRef.current?.(reason);
      }
    }
  }, []);

  useEffect(() => {
    let dead = false;
    // Opening the camera is inherently an effect, and it necessarily reports
    // back into state - ready, or the reason there is none. The directive has
    // to sit on the line immediately above the statement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start(() => dead);
    return () => {
      dead = true;
      stop();
    };
  }, [start, stop]);

  function take() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `live-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setShot({ url: URL.createObjectURL(blob), file });
        // The preview is a still, so the camera has no more work to do. Holding
        // it open while somebody decides whether to keep the shot is the thing
        // that leaves the light on.
        stop();
      },
      'image/jpeg',
      0.9,
    );
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setReady(false);
    // The stream was stopped when the shot was taken, so this opens a fresh
    // one. Never `location.reload()`   the camera sits inside a half-filled
    // application form.
    void start(() => false);
  }

  function keep() {
    if (!shot) return;
    onCapture(shot.file);
    URL.revokeObjectURL(shot.url);
    onClose();
  }

  return (
    <div className="border-line/15 bg-surface-deep/40 flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <p className="text-content flex items-center gap-2 text-sm font-medium">
          <Camera className="size-4" aria-hidden="true" />
          {shot ? 'Keep this photo?' : 'Look at the camera'}
        </p>
        <button
          type="button"
          onClick={() => {
            stop();
            onClose();
          }}
          className="text-content-muted hover:text-content cursor-pointer"
          aria-label="Close camera"
        >
          <X className="size-4" />
        </button>
      </div>

      {error ? (
        <p className="text-coral text-sm">{error}</p>
      ) : (
        <div className="bg-ink/40 relative aspect-4/3 w-full overflow-hidden rounded-lg">
          {shot ? (
            <img src={shot.url} alt="The photo you just took" className="size-full object-cover" />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              // Mirrored, because an unmirrored preview of your own face reads
              // as wrong to everyone who has ever used a front camera.
              className="size-full -scale-x-100 object-cover"
            />
          )}
          {!ready && !shot && (
            <span className="text-content-muted absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            </span>
          )}
        </div>
      )}

      {!error && (
        <div className="flex flex-wrap gap-2">
          {shot ? (
            <>
              <Button onClick={keep}>Use this photo</Button>
              <Button variant="outline" onClick={retake}>
                <RefreshCw aria-hidden="true" />
                Take another
              </Button>
            </>
          ) : (
            <Button disabled={!ready} onClick={take}>
              <Camera aria-hidden="true" />
              Take photo
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

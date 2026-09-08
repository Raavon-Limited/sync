/**
 * Paystack inline (client). Loads the v2 inline script on demand and resumes a
 * transaction the server already initialized (we pass an access code, not an
 * amount, so the charge can't be tampered with). We use the raw script rather
 * than `react-paystack` because that package doesn't support React 19.
 */
'use client';

interface PaystackPopInstance {
  resumeTransaction: (
    accessCode: string,
    callbacks?: {
      onSuccess?: (txn: unknown) => void;
      onCancel?: () => void;
      onError?: (err: unknown) => void;
    },
  ) => void;
}

declare global {
  interface Window {
    PaystackPop?: { new (): PaystackPopInstance };
  }
}

const SRC = 'https://js.paystack.co/v2/inline.js';
let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.PaystackPop) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loader = null;
      reject(new Error('Failed to load Paystack'));
    };
    document.body.appendChild(s);
  });
  return loader;
}

/**
 * Open the Paystack popup for a server-initialized transaction.
 *
 * WHATEVER WAS PAID FOR IS CREDITED BY THE VERIFIED WEBHOOK, not by these
 * callbacks. onSuccess only means the popup closed happily on this device; the
 * wallet credit and the inspection's move to 'scheduled' both happen server
 * side on `charge.success`. Treat the callback as a cue to refetch, never as
 * proof the money arrived.
 *
 * Named for the transaction, not the wallet: the same three lines resume an
 * inspection fee. `openWalletTopup` stays as the name its callers already use.
 */
export async function openPaystackCheckout(
  accessCode: string,
  callbacks: { onSuccess?: () => void; onCancel?: () => void } = {},
): Promise<void> {
  await loadScript();
  const Ctor = window.PaystackPop;
  if (!Ctor) throw new Error('Paystack unavailable');
  const popup = new Ctor();
  popup.resumeTransaction(accessCode, {
    onSuccess: () => callbacks.onSuccess?.(),
    onCancel: () => callbacks.onCancel?.(),
  });
}

/** The wallet top-up's name for the above. Same call, existing callers. */
export const openWalletTopup = openPaystackCheckout;

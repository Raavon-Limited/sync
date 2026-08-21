'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Scanner } from '@yudiel/react-qr-scanner'
import { X, Loader2 } from 'lucide-react'

interface ScannedPayload {
  orderId: string
  token: string
}

interface Props {
  orderId: string
  label: string
  onScan: (orderId: string, token: string) => Promise<{ success?: boolean; error?: string }>
}

export function QrScannerButton({ orderId, label, onScan }: Props) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDecode(text: string) {
    if (isPending) return

    let payload: ScannedPayload
    try {
      payload = JSON.parse(text)
    } catch {
      setError('Unrecognized QR code')
      return
    }

    if (payload.orderId !== orderId) {
      setError('This QR code belongs to a different order')
      return
    }

    startTransition(async () => {
      const result = await onScan(orderId, payload.token)
      if (result.success) {
        setOpen(false)
        router.refresh()
      } else {
        setError(result.error ?? 'Scan failed — try again')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null) }}
        className="w-full rounded-2xl bg-lime px-5 py-4 text-base font-black text-ink border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer"
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-4">
            <p className="text-sm font-semibold text-white">{label}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close scanner">
              <X className="text-white" size={24} />
            </button>
          </div>

          <div className="relative flex-1">
            <Scanner
              onScan={(results) => {
                if (results[0]?.rawValue) handleDecode(results[0].rawValue)
              }}
              onError={() => setError('Camera access failed — check permissions')}
              constraints={{ facingMode: 'environment' }}
            />
          </div>

          <div className="px-4 py-6 text-center">
            {isPending && (
              <p className="flex items-center justify-center gap-2 text-sm text-white">
                <Loader2 size={16} className="animate-spin" /> Verifying…
              </p>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  )
}
'use client';

/**
 * Payout account form, in the order a banking app asks.
 *
 * NUMBER FIRST, THEN BANK
 *   The old form asked for a bank from a list of ~100, then a number. Reversed,
 *   because the number is the thing that narrows the list: a 10-digit account
 *   that matches a Nigerian mobile prefix is a phone-derived account, and those
 *   belong to a handful of fintechs. See `lib/banks/suggest.ts`.
 *
 * THE NAME IS NOT TYPED, IT IS RESOLVED
 *   `Account Holder Name` used to be a free-text box. A payout goes to whoever
 *   owns the account, not whoever the form says owns it, so a vendor typing
 *   their own name beside someone else's number would only be discovered by the
 *   first withdrawal. The name now comes back from Paystack for the (number,
 *   bank) pair, and a pair that does not resolve cannot be saved.
 *
 * THE SUGGESTION NEVER AUTO-SELECTS
 *   It is a hint from the number's shape, not proof. Picking a bank for the
 *   vendor and being wrong is worse than showing four chips and letting them
 *   tap one   and the resolve call is what confirms the choice either way.
 */

import { useEffect, useState } from 'react';

import { Button, Input } from '@/components/ui';
import { Modal } from '@/components/shared/custom-modal';
import { useBanks } from '@/modules/payments/hooks';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronDown, Loader2, Search, TriangleAlert } from 'lucide-react';
import { normaliseAccountNumber, suggestBanks, type BankOption } from '@/lib/banks/suggest';

interface ChangeAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (updated: {
    bankName: string;
    bankCode: string;
    accountNumber: string;
    holderName: string;
  }) => void;
  current: { bankName: string; accountNumber: string; holderName: string };
}

export function ChangeAccountDialog({ open, onClose, onSave, current }: ChangeAccountDialogProps) {
  const { data: bankOptions = [], isLoading: banksLoading } = useBanks();

  const [bank, setBank] = useState<BankOption | null>(null);
  const [acct, setAcct] = useState(current.accountNumber);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAcct(current.accountNumber);
      setBank(bankOptions.find((b) => b.name === current.bankName) ?? null);
      setName('');
      setQuery('');
      setResolveError(null);
    }
  }

  const suggestion = suggestBanks(acct, bankOptions);
  const complete = acct.length === 10 && !!bank;

  /**
   * Resolve whenever both halves are present. Debounced because a vendor
   * correcting a typo would otherwise fire a lookup per keystroke, and
   * Paystack rate-limits this endpoint.
   */
  useEffect(() => {
    if (!complete) {
      setName('');
      setResolveError(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    setResolveError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/banks/resolve?account_number=${acct}&bank_code=${bank!.code}`,
        );
        const payload = (await res.json()) as { accountName?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !payload.accountName) {
          setName('');
          setResolveError(payload.error ?? 'Could not find that account.');
        } else {
          setName(payload.accountName);
        }
      } catch {
        if (!cancelled) setResolveError('Could not reach the bank right now.');
      } finally {
        if (!cancelled) setResolving(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [acct, bank, complete]);

  const filtered = query
    ? bankOptions.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
    : bankOptions;

  function handleSave() {
    // Saving requires a resolved name, not a typed one   an unverified payout
    // destination is the one thing this form must not be able to produce.
    if (!bank || acct.length !== 10 || !name) return;
    onSave({ bankName: bank.name, bankCode: bank.code, accountNumber: acct, holderName: name });
    onClose();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title="Change Payout Account"
      description="Update your bank details for future withdrawals."
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name || resolving}>
            Save Changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── Account number ─────────────────────────────────────────── */}
        <div>
          <label className="text-content-muted mb-1.5 block font-mono text-[10px] tracking-widest uppercase">
            Account Number
          </label>
          <Input
            value={acct}
            onChange={(e) => setAcct(normaliseAccountNumber(e.target.value))}
            placeholder="0123456789"
            maxLength={10}
            inputMode="numeric"
            autoFocus
          />
          {acct.length > 0 && acct.length < 10 && (
            <p className="text-content-muted mt-1 text-xs">{10 - acct.length} more digit(s)</p>
          )}
        </div>

        {/* ── Suggestions, from the number's shape ───────────────────── */}
        {suggestion.banks.length > 0 && (
          <div className="border-line/10 bg-surface-deep/40 rounded-lg border p-3">
            <p className="text-content-muted text-xs">{suggestion.reason}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestion.banks.map((b) => (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => setBank(b)}
                  className={
                    bank?.code === b.code
                      ? 'bg-lime text-ink rounded-full px-2.5 py-1 text-xs font-medium'
                      : 'border-line/15 text-content hover:bg-surface-deep rounded-full border px-2.5 py-1 text-xs transition-colors'
                  }
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Bank ───────────────────────────────────────────────────── */}
        <div>
          <label className="text-content-muted mb-1.5 block font-mono text-[10px] tracking-widest uppercase">
            Bank
          </label>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button className="border-ink/10 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className={bank ? '' : 'text-content-muted'}>
                  {bank?.name ?? 'Select a bank'}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
            >
              {/* A hundred banks is a scroll, not a list. */}
              <div className="border-line/10 sticky top-0 flex items-center gap-2 border-b px-2 pb-2">
                <Search className="text-content-muted size-3.5 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="Search banks"
                  className="text-content w-full bg-transparent text-sm outline-none"
                />
              </div>

              {banksLoading && (
                <p className="text-content-muted px-3 py-2 text-sm">Loading banks…</p>
              )}
              {!banksLoading && bankOptions.length === 0 && (
                // The honest version of the old message: this is a
                // configuration state, not a network blip.
                <p className="text-content-muted px-3 py-2 text-sm">
                  Bank list unavailable   payments are not configured yet.
                </p>
              )}
              {filtered.map((b) => (
                <DropdownMenuItem
                  key={b.code}
                  onSelect={() => {
                    setBank(b);
                    setDropdownOpen(false);
                    setQuery('');
                  }}
                >
                  {bank?.code === b.code ? (
                    <Check className="size-4 shrink-0" />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  {b.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── The confirmation ───────────────────────────────────────── */}
        <div>
          <label className="text-content-muted mb-1.5 block font-mono text-[10px] tracking-widest uppercase">
            Account Holder
          </label>
          <div className="border-line/10 bg-surface-deep/40 flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            {resolving ? (
              <>
                <Loader2 className="text-content-muted size-4 animate-spin" />
                <span className="text-content-muted">Checking…</span>
              </>
            ) : resolveError ? (
              <>
                <TriangleAlert className="text-coral size-4 shrink-0" />
                <span className="text-coral">{resolveError}</span>
              </>
            ) : name ? (
              <>
                <Check className="size-4 shrink-0 text-emerald-600" />
                <span className="text-content font-medium">{name}</span>
              </>
            ) : (
              <span className="text-content-muted">
                Enter an account number and pick a bank.
              </span>
            )}
          </div>
          <p className="text-content-muted mt-1 text-xs">
            {/* Says why the field cannot be typed into, so it reads as a check
                rather than a broken input. */}
            Confirmed with your bank. Payouts go to this name.
          </p>
        </div>
      </div>
    </Modal>
  );
}

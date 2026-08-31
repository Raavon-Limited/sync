/**
 * Which sections of a store one person may work.
 *
 * WHY A LIST OF CHECKBOXES AND NOT A ROLE DROPDOWN
 *   Named roles ("cashier", "kitchen") are a guess at how somebody else runs
 *   their shop, and the guess is wrong often enough that every product with
 *   them grows a "custom" option anyway. The sections are the sidebar the
 *   person will actually see, so the owner is picking from the thing they
 *   already understand.
 *
 * EMPTY IS NOT A STATE. A manager with no sections is an account that can sign
 * in and do nothing, which reads as broken rather than as revoked — and the
 * RPC refuses it too. Revoking is the way to take everything away.
 */
'use client';

import { Checkbox } from '@/components/ui';
import { STAFF_SCOPES, ALL_STAFF_SCOPES, type StaffScope } from '@/modules/storefronts/types';

export function ScopePicker({
  value,
  onChange,
  idPrefix,
}: {
  value: StaffScope[];
  onChange: (next: StaffScope[]) => void;
  /** Keeps the label/checkbox pairing unique when two pickers share a page. */
  idPrefix: string;
}) {
  const all = ALL_STAFF_SCOPES.every((s) => value.includes(s));

  const toggle = (scope: StaffScope) =>
    onChange(value.includes(scope) ? value.filter((s) => s !== scope) : [...value, scope]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-content-muted text-xs">What they can do here</span>
        <button
          type="button"
          onClick={() => onChange(all ? ['orders'] : [...ALL_STAFF_SCOPES])}
          className="text-lime-deep text-xs underline underline-offset-2"
        >
          {all ? 'Clear' : 'All sections'}
        </button>
      </div>

      {STAFF_SCOPES.map((scope) => {
        const id = `${idPrefix}-${scope.value}`;
        return (
          <label
            key={scope.value}
            htmlFor={id}
            className="border-line/10 hover:border-line/25 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
          >
            <Checkbox
              id={id}
              checked={value.includes(scope.value)}
              onCheckedChange={() => toggle(scope.value)}
              className="mt-0.5"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-content flex flex-wrap items-center gap-2 text-sm font-medium">
                {scope.label}
                {/* Said out loud rather than hidden. Handing someone a grant
                    that opens nothing is worse than not offering it, because
                    the owner believes the job is done. */}
                {!scope.enforced && (
                  <span className="text-content-muted text-xs font-normal">not active yet</span>
                )}
                {/* The one grant that leaves the store it was given at. An
                    owner should see that before they tick it. */}
                {scope.businessWide && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-normal text-amber-600">
                    all your stores
                  </span>
                )}
              </span>
              <span className="text-content-muted text-xs">{scope.description}</span>
            </span>
          </label>
        );
      })}

      {value.length === 0 && (
        <p className="text-coral text-xs">
          Pick at least one. To take everything away, revoke them instead.
        </p>
      )}
    </div>
  );
}

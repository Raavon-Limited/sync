/**
 * Platform settings and feature flags.
 *
 * THESE VALUES MOVE MONEY
 *   `commission_pct` is read when an escrow hold is created and frozen onto the
 *   row, so changing it here affects every FUTURE order and none of the past
 *   ones. That is stated on the screen, because "did my change apply
 *   retroactively" is the first thing anyone asks after editing it.
 *
 * TYPES ARE EXPLICIT
 *   `app_settings.value` is jsonb, where 10 and "10" are both valid and look
 *   identical in a text input. `private.setting_int` silently falls back to its
 *   default on a string, so a wrong type here would quietly reset the
 *   commission rate rather than error. Each key declares its kind.
 */
'use client';

import { useState, useTransition } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Badge, Button, Input } from '@/components/ui';
import { updateSetting, updateFeatureFlag } from '@/modules/admin/actions';

export interface AdminSetting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface AdminFlag {
  key: string;
  enabled: boolean;
  rolloutPct: number;
  updatedAt: string;
}

/** What each key means and how it must be stored. Unlisted keys are read-only. */
const SETTING_META: Record<
  string,
  { label: string; help: string; kind: 'number' | 'string'; suffix?: string }
> = {
  commission_pct: {
    label: 'Commission',
    help: 'Taken from each order when escrow is released. Frozen onto a hold at creation, so this changes future orders only.',
    kind: 'number',
    suffix: '%',
  },
  escrow_hold_hours: {
    label: 'Escrow hold',
    help: 'How long before an unconfirmed order releases to the vendor automatically.',
    kind: 'number',
    suffix: 'hours',
  },
  min_payout_kobo: {
    label: 'Minimum payout',
    help: 'Smallest amount a vendor can withdraw, in kobo.',
    kind: 'number',
    suffix: 'kobo',
  },
  support_email: {
    label: 'Support email',
    help: 'Shown to users who need help.',
    kind: 'string',
  },
};

export function PlatformSettings({
  settings,
  flags,
}: {
  settings: AdminSetting[];
  flags: AdminFlag[];
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );
  const [rollout, setRollout] = useState<Record<string, string>>(
    Object.fromEntries(flags.map((f) => [f.key, String(f.rolloutPct)])),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function run(label: string, fn: () => Promise<unknown>) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        await fn();
        setSaved(label);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save');
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p className="text-coral border-coral/30 bg-coral/5 rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}
      {saved && <p className="text-sm text-accent-fg">Saved {saved}.</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-content-muted flex items-center gap-2 font-mono text-sm tracking-wide">
          PLATFORM SETTINGS
          {pending && <Loader2 className="size-3 animate-spin" />}
        </h2>

        {settings.map((s) => {
          const meta = SETTING_META[s.key];
          const dirty = (draft[s.key] ?? '') !== s.value;
          return (
            <div key={s.key} className="border-line/10 bg-panel flex flex-col gap-2 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-content text-sm font-medium">{meta?.label ?? s.key}</p>
                  <p className="text-content-muted font-mono text-xs">{s.key}</p>
                </div>
                <p className="text-content-muted text-xs">
                  updated {new Date(s.updatedAt).toLocaleDateString('en-NG')}
                </p>
              </div>

              {meta?.help && <p className="text-content-muted text-xs">{meta.help}</p>}

              {meta ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={draft[s.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
                    className="max-w-40"
                    inputMode={meta.kind === 'number' ? 'decimal' : 'text'}
                  />
                  {meta.suffix && (
                    <span className="text-content-muted text-xs">{meta.suffix}</span>
                  )}
                  <Button
                    variant="outline"
                    disabled={pending || !dirty}
                    onClick={() =>
                      run(meta.label, () =>
                        updateSetting({ key: s.key, value: draft[s.key], kind: meta.kind }),
                      )
                    }
                  >
                    Save
                  </Button>
                </div>
              ) : (
                /* An unknown key has no declared type, and guessing between a
                   number and a string is how setting_int silently resets. */
                <p className="text-content-muted flex items-center gap-1 text-xs">
                  <AlertTriangle className="size-3" />
                  Value <code className="font-mono">{s.value}</code>   not editable here; this key
                  has no declared type.
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-content-muted font-mono text-sm tracking-wide">FEATURE FLAGS</h2>

        {flags.length === 0 ? (
          <p className="text-content-muted border-line/10 rounded-xl border border-dashed p-6 text-sm">
            No feature flags defined.
          </p>
        ) : (
          flags.map((f) => (
            <div key={f.key} className="border-line/10 bg-panel flex flex-wrap items-center gap-3 rounded-xl border p-4">
              <div className="min-w-0 flex-1">
                <p className="text-content flex items-center gap-2 text-sm font-medium">
                  <code className="font-mono">{f.key}</code>
                  <Badge
                    className={
                      f.enabled ? 'bg-lime/15 text-accent-fg' : 'bg-ink/5 text-content-muted'
                    }
                  >
                    {f.enabled ? 'on' : 'off'}
                  </Badge>
                </p>
                <p className="text-content-muted text-xs">
                  {/* A flag that is on at 0% is off in practice, and that is
                      confusing enough to spell out. */}
                  {f.enabled && f.rolloutPct === 0
                    ? 'On, but rolled out to nobody'
                    : `${f.rolloutPct}% rollout`}
                </p>
              </div>

              <Input
                value={rollout[f.key] ?? ''}
                onChange={(e) => setRollout((r) => ({ ...r, [f.key]: e.target.value }))}
                className="max-w-24"
                inputMode="numeric"
              />
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(`${f.key} rollout`, () =>
                    updateFeatureFlag({ key: f.key, rolloutPct: Number(rollout[f.key]) }),
                  )
                }
              >
                Set %
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run(f.key, () => updateFeatureFlag({ key: f.key, enabled: !f.enabled }))
                }
              >
                Turn {f.enabled ? 'off' : 'on'}
              </Button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

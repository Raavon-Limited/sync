/**
 * ROUTE: /admin/settings
 * ACCESS: admin / super_admin only.
 * PURPOSE: PLATFORM settings and feature flags.
 *
 * This route previously rendered the same personal danger zone as /me/settings
 *   an admin deleting their own account, on a page named "admin settings".
 * The admin's personal account controls stay where every other user's are; this
 * page is for the values that govern the platform, including the commission
 * rate that now moves real money.
 */
import type { Metadata } from 'next';
import { requireStaffArea } from '@/modules/admin/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  PlatformSettings,
  type AdminSetting,
  type AdminFlag,
} from './(components)/platform-settings';

export const metadata: Metadata = { title: 'Settings   Admin' };

import type { Row } from '@/lib/supabase/row';

/** jsonb comes back parsed; render it as the scalar it is, not as JSON. */
function scalar(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

export default async function Page() {
  await requireStaffArea('settings');

  const admin = createAdminClient();
  const [{ data: settings }, { data: flags }] = await Promise.all([
    admin.from('app_settings').select('key, value, updated_at').order('key'),
    admin.from('feature_flags').select('key, enabled, rollout_pct, updated_at').order('key'),
  ]);

  const settingRows: AdminSetting[] = ((settings ?? []) as Row[]).map((s) => ({
    key: s.key,
    value: scalar(s.value),
    updatedAt: s.updated_at,
  }));

  const flagRows: AdminFlag[] = ((flags ?? []) as Row[]).map((f) => ({
    key: f.key,
    enabled: !!f.enabled,
    rolloutPct: f.rollout_pct ?? 0,
    updatedAt: f.updated_at,
  }));

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-content-muted font-mono text-sm tracking-wide">ADMIN / SETTINGS</h1>
        <h2 className="font-display text-content mt-2 text-3xl font-medium">
          Platform <span className="text-lime-deep">controls.</span>
        </h2>
      </div>
      <PlatformSettings settings={settingRows} flags={flagRows} />
    </section>
  );
}

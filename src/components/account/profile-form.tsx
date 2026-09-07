/**
 * ProfileForm - the account's own details: picture, name, phone.
 *
 * IT LIVES HERE, NOT UNDER A ROUTE
 *   It began in `app/user/profile/(components)`, private to one page. Settings
 *   is where people go to change their details - it is the page with the ID
 *   card on it, and the card is drawn from exactly these fields - so the form
 *   is now shared and the /user/profile route renders the same component.
 *   Two copies would have meant two places to fix the day a field is added.
 *
 * THE PICTURE IS UPLOADED ON PICK, AND SAVED WITH THE FORM
 *   ImageField puts the file in Storage the moment it is chosen (see its own
 *   note: a rejected file should surface while you are still filling the form,
 *   not after Save). What it hands back is a URL, and that URL is form state
 *   like any other - so nothing about the profile changes until Save is
 *   pressed, and abandoning the page leaves an orphaned object rather than a
 *   half-applied identity.
 *
 * WHAT IT DOES NOT TOUCH
 *   Role and verification status are server-trusted. They are shown, because
 *   this is where somebody looks for them, and the route handler drops them
 *   from any PATCH that names them.
 *
 * Split in two: the outer component owns the query (loading/error), the inner
 * <Fields> mounts only once data exists - so its form state initialises
 * straight from props, with no setState-in-effect.
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ImageField } from '@/components/forms/image-field';
import { useGetProfileQuery, useUpdateProfileMutation } from '@/store/api/profile-api';
import type { Profile } from '@/modules/auth/queries';

export function ProfileForm({ verificationStatus }: { verificationStatus?: string } = {}) {
  const { data: profile, isLoading, isError, refetch } = useGetProfileQuery();

  if (isLoading) {
    return (
      <div className="flex max-w-md flex-col gap-4">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-32" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="border-line/10 flex flex-col items-start gap-3 rounded-2xl border border-dashed p-5">
        <p className="text-content-muted text-sm">
          Couldn&rsquo;t load your profile. You may be signed out.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  // key={profile.id} remounts (and re-seeds) if the signed-in user changes.
  return <Fields key={profile.id} profile={profile} verificationStatus={verificationStatus} />;
}

function Fields({
  profile,
  verificationStatus,
}: {
  profile: Profile;
  verificationStatus?: string;
}) {
  const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();
  // SET ONCE, so there is nothing to move it once it exists. An account whose
  // signup metadata carried no name may still fill one in; see 20260905180000.
  const nameLocked = (profile.full_name ?? '').trim() !== '';
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateProfile({
        // Omitted entirely once set: the route refuses it and the database
        // reverts it, so sending it would risk a rejection that takes the
        // phone number and the picture down with it.
        ...(nameLocked ? {} : { full_name: fullName.trim() }),
        phone: phone.trim(),
        // '' is meaningful: it is how the field says "remove it", and the route
        // handler turns it into NULL. Dropping empties here would make Remove
        // silently do nothing.
        avatar_url: avatarUrl,
      }).unwrap();
      toast('Profile saved.');
    } catch (err) {
      const message =
        typeof err === 'object' && err && 'data' in err
          ? ((err.data as { error?: string })?.error ?? 'Could not save profile.')
          : 'Could not save profile.';
      toast(message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-5">
      <ImageField
        value={avatarUrl}
        onChange={setAvatarUrl}
        label="Profile picture"
        folder="avatars"
        shape="circle"
        hint="A clear photo of your face. JPEG, PNG, WebP or AVIF, up to 5MB. It shows on your Sync ID and beside your name."
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="full_name" className="text-content text-sm font-medium">
          Full name
        </label>
        <Input
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          // LOCKED ONCE SET. This is the string a reviewer held against a
          // government ID; a name the holder can edit afterwards verifies
          // nothing. readOnly rather than disabled so it still reads normally
          // to a screen reader and can still be selected and copied.
          readOnly={nameLocked}
          aria-readonly={nameLocked || undefined}
          className={nameLocked ? 'text-content-muted cursor-not-allowed' : undefined}
        />
        <p className="text-content-muted text-xs">
          {nameLocked
            ? 'Checked against your ID, so it is not editable here. Contact support if it is wrong.'
            : 'Use the name on your ID   a reviewer checks the two against each other. You can only set this once.'}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-content text-sm font-medium">
          Phone
        </label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="080…"
          autoComplete="tel"
        />
      </div>

      {/* Server-trusted, read-only - shown for context, never editable here. */}
      <div className="border-line/10 flex flex-wrap gap-x-6 gap-y-1 border-t pt-4">
        <div>
          <p className="eyebrow text-content-muted">Role</p>
          <p className="text-content text-sm capitalize">{profile.role.replace('_', ' ')}</p>
        </div>
        <div>
          <p className="eyebrow text-content-muted">Verification</p>
          {/* NOT profiles.verification_status on its own.

              That column is the MIRROR of vendor_profiles: for somebody who is
              a student AND lets a room it reports the BUSINESS decision, which
              is how a student an admin had verified read "Unverified" on their
              own profile. The page above resolves the authority for whichever
              role this account actually is and passes it down; the mirror is
              the fallback for accounts that have no separate authority. */}
          <p className="text-content text-sm capitalize">
            {verificationStatus ?? profile.verification_status}
          </p>
        </div>
      </div>

      <Button type="submit" disabled={isSaving} className="self-start">
        {isSaving ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}

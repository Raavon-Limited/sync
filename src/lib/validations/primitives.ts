/**
 * Reusable zod primitives composed by every domain schema. Defined once so
 * the same rules (length, format, error message) apply everywhere.
 */
import { z } from 'zod';

/** Email: trimmed, lowercased, capped to a sane DB-friendly length. */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Email is required')
  .max(254, 'Email is too long')
  .email('Enter a valid email');

/**
 * Password: 8+ chars, must mix letters and numbers. Strength rules are
 * pragmatic for Nigerian student users - too strict and we lose signups.
 */
/**
 * The password rules, as DATA rather than a chain of `.regex()` calls.
 *
 * The signup form shows a live checklist that ticks each rule as you type. If
 * the checklist were its own list of regexes it would drift from the schema the
 * first time either changed, and the form would tick a rule the server then
 * rejects. One array drives both: `password` below is built from it, and the
 * checklist maps over the same export.
 *
 * Special characters INCLUDE the full stop - people reach for it first, and a
 * rule that silently excludes it reads as broken.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'One capital letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'number', label: 'One number', test: (v: string) => /\d/.test(v) },
  {
    id: 'special',
    label: 'One special character (. ! @ # …)',
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
] as const;

export type PasswordRule = (typeof PASSWORD_RULES)[number];

/**
 * superRefine rather than a chain of `.refine()` calls: reducing over refines
 * needs a `z.ZodType<string>` accumulator, and that cast erases the inferred
 * input type - `SignupInput['password']` became `unknown` and every consumer
 * broke. This reports every unmet rule at once, which also matches the
 * checklist: failing three rules should not surface one message.
 */
export const password = z
  .string()
  .max(128, 'Password is too long')
  .superRefine((value, ctx) => {
    for (const rule of PASSWORD_RULES) {
      if (!rule.test(value)) {
        ctx.addIssue({ code: 'custom', message: rule.label });
      }
    }
  });

/** Nigerian phone - accepts +2348012345678 / 08012345678 / 8012345678. */
export const nigerianPhone = z
  .string()
  .trim()
  .regex(/^(?:\+?234|0)?[789][01]\d{8}$/, 'Enter a valid Nigerian mobile number');

/** Display name - 2..80 chars, no control characters. */
export const displayName = z
  .string()
  .trim()
  .min(2, 'Name is too short')
  .max(80, 'Name is too long')
  .regex(/^[^\x00-\x1F\x7F]+$/, 'Name contains invalid characters');

/** NIN - 11 digits exactly. */
export const nin = z
  .string()
  .trim()
  .regex(/^\d{11}$/, 'NIN must be 11 digits');

/** BVN - 11 digits exactly. */
export const bvn = z
  .string()
  .trim()
  .regex(/^\d{11}$/, 'BVN must be 11 digits');

/** OTP - 6 digits (set Supabase's Email OTP Length to 6 to match). */
export const otp = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

/** Naira amount in whole Naira (no kobo at API boundaries). */
export const nairaAmount = z
  .number()
  .int('Amount must be a whole number')
  .nonnegative('Amount cannot be negative')
  .max(50_000_000, 'Amount is too large');

/** URL-safe slug - lowercase letters, digits, and hyphens. */
export const slug = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens');

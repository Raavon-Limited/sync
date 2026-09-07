/**
 * What a student does to their own verification.
 *
 * TWO STEPS, IN ORDER, AND THE DATABASE ENFORCES BOTH
 *   `save_student_identity` records the matriculation number and department;
 *   `submit_student_verification` refuses if either is blank, and refuses again
 *   if no school ID has been uploaded. A student ID card without a matric
 *   number to check it against is a photo, and a matric number with no card is
 *   a claim.
 *
 * IT WRITES student_profiles, NOT profiles. See modules/students for why -
 * short version: profiles.verification_status is the vendor mirror, and one
 * person can be both.
 */
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { userMessage } from '@/lib/errors';

export type StudentResult = { ok: true } | { ok: false; error: string };

const identitySchema = z.object({
  matricNumber: z
    .string()
    .trim()
    .min(3, 'Your matriculation number is needed')
    .max(40, 'That does not look like a matriculation number'),
  department: z.string().trim().min(2, 'Your department is needed').max(120),
  level: z.string().trim().max(20).optional(),
});

export type StudentIdentityInput = z.infer<typeof identitySchema>;

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const supabase = await createClient();
  const call = supabase.rpc.bind(supabase) as unknown as (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ error: { message: string; code?: string } | null }>;
  return call(name, args);
}

export async function saveStudentIdentity(input: StudentIdentityInput): Promise<StudentResult> {
  const parsed = identitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check those details' };
  }

  const { error } = await rpc('save_student_identity', {
    p_matric: parsed.data.matricNumber,
    p_department: parsed.data.department,
    p_level: parsed.data.level ?? null,
  });

  if (error) return { ok: false, error: userMessage(error, 'We could not save those details.') };

  revalidatePath('/user/verify');
  return { ok: true };
}

export async function submitStudentVerification(): Promise<StudentResult> {
  const { error } = await rpc('submit_student_verification');
  if (error) {
    return {
      ok: false,
      error: userMessage(error, 'We could not submit your documents. Try again in a moment.'),
    };
  }

  revalidatePath('/user/verify');
  revalidatePath('/user');
  return { ok: true };
}

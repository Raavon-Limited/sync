/**
 * DocPage - shell for long-form public documents: policies, explainers, terms.
 *
 * One shell so every one of them has the same measure, heading rhythm and
 * "last updated" line. Policies that look different from each other read as
 * having been written at different times by different people, which is exactly
 * the impression a legal page should not give.
 *
 * `updated` is required on purpose: a policy with no date is not much of a
 * policy, and a reader has no way to tell whether it predates the thing they
 * are worried about.
 */
import type { ReactNode } from 'react';

import { Reveal } from '@/app/(marketing)/reveal';

export function DocPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  /** ISO date, e.g. '2026-08-30'. Rendered long-form. */
  updated: string;
  children: ReactNode;
}) {
  const updatedLabel = new Date(updated).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <article className="mx-auto w-full max-w-3xl px-6 pt-16 pb-24">
      <Reveal>
        <p className="eyebrow text-accent-fg">{eyebrow}</p>
        <h1 className="font-display text-foreground mt-3 text-[40px] leading-[1.02] font-bold tracking-[-0.035em] md:text-[52px]">
          {title}
        </h1>
        {intro && <p className="text-content-muted text-lead mt-5">{intro}</p>}
        <p className="text-content-muted mt-6 font-mono text-[11px] tracking-wider uppercase">
          Last updated · {updatedLabel}
        </p>
      </Reveal>

      <div className="border-line/10 mt-10 flex flex-col gap-10 border-t pt-10">{children}</div>
    </article>
  );
}

/** One numbered-ish section. Kept flat - nested legal headings help nobody. */
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-card text-foreground">{title}</h2>
        <div className="text-content-muted flex flex-col gap-3 text-sm leading-relaxed">
          {children}
        </div>
      </section>
    </Reveal>
  );
}

/** Bulleted list with the house spacing. */
export function DocList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

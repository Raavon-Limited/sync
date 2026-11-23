'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SITE } from '@/config/site';
import type { Plan, PlanId } from './types';

interface Props {
  plan: Plan;
  currentPlanId: PlanId;
  onSelect: (plan: Plan) => void;
}

export function PlanCard({ plan, currentPlanId, onSelect }: Props) {
  const isCurrent = plan.id === currentPlanId;
  const isEnterprise = plan.highlighted;

  const handleClick = () => {
    if (plan.cta === 'contact') {
      // From config, not hardcoded: this was `sales@sync.ng`, a second address
      // on a domain we no longer own, so every enterprise enquiry bounced.
      window.location.href = `mailto:${SITE.support.email}`;
      return;
    }
    if (!isCurrent) {
      onSelect(plan);
    }
  };

  return (
    <div
      className={cn(
        'relative flex h-full flex-col rounded-xl border p-5 transition-shadow sm:p-6',
        isEnterprise
          ? 'text-cream border-ink bg-ink'
          : 'border-line/10 bg-panel text-content shadow-card',
        isCurrent && !isEnterprise && 'ring-lime ring-2',
      )}
    >
      {/* Current badge */}
      {isCurrent && (
        <div className="absolute -top-3 left-4">
          <Badge variant="accent" className="bg-lime/15 text-accent-fg">
            Current
          </Badge>
        </div>
      )}

      {/* Header */}
      <div className="mb-4">
        <h3
          className={cn(
            'font-display text-lg font-bold',
            isEnterprise ? 'text-cream' : 'text-content',
          )}
        >
          {plan.name}
        </h3>
        <p className={cn('mt-0.5 text-sm', isEnterprise ? 'text-cream/50' : 'text-content-muted')}>
          {plan.tagline}
        </p>
      </div>

      {/* Price */}
      {/* `items-baseline` so the small period sits on the amount's baseline
          rather than its box, and `min-w-0` + `wrap-break-word` so a long
          figure wraps inside the card instead of running out of it. */}
      <div className="mb-5 flex min-w-0 flex-wrap items-baseline gap-x-1">
        <span
          className={cn(
            'font-display min-w-0 text-2xl font-black wrap-break-word sm:text-3xl',
            isEnterprise ? 'text-cream' : 'text-content',
          )}
        >
          {plan.priceLabel}
        </span>
        {/* The period comes from the plan's own `interval`, so a yearly plan
            says /yr instead of claiming to be monthly. */}
        {plan.pricePeriod && (
          <span className={cn('text-sm', isEnterprise ? 'text-cream/50' : 'text-content-muted')}>
            {plan.pricePeriod}
          </span>
        )}
      </div>

      {/* Features */}
      <ul className="mb-6 flex flex-1 flex-col gap-2">
        {plan.features.map((f) => (
          <li key={f.label} className="flex items-center gap-2 text-sm">
            <Check
              className={cn('h-3.5 w-3.5 shrink-0', isEnterprise ? 'text-lime' : 'text-accent-fg')}
            />
            <span className={isEnterprise ? 'text-cream/80' : 'text-content'}>{f.label}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-auto">
        {isCurrent ? (
          <Button
            variant="outline"
            className="border-lime/40 bg-lime/15 text-accent-fg hover:bg-lime/15 w-full"
            disabled
          >
            Current Plan
          </Button>
        ) : plan.cta === 'contact' ? (
          <Button
            variant="outline"
            className="border-cream/20 text-cream hover:bg-cream/10 w-full"
            onClick={handleClick}
          >
            Contact Sales
          </Button>
        ) : plan.cta === 'upgrade' ? (
          <Button className="w-full" onClick={handleClick}>
            {/* "Upgrade" on the free plan is not a thing you can do to it.
                Somebody on no plan at all is choosing, not upgrading. */}
            {plan.price === 0 ? 'Start free' : 'Upgrade'}
          </Button>
        ) : (
          <Button variant="outline" className="w-full" onClick={handleClick}>
            Downgrade
          </Button>
        )}
      </div>
    </div>
  );
}

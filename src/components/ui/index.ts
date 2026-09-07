/**
 * Barrel re-exports for `@/components/ui` primitives.
 * Import as `import { Button, Card, Dialog } from '@/components/ui'`.
 */
export * from './button';
export * from './input';
export * from './textarea';
export * from './badge';
export * from './chip';
export * from './card';
export * from './avatar';
export * from './skeleton';
export * from './spinner';
export * from './checkbox';
export * from './radio-group';
export * from './switch';
export * from './select';
export * from './dialog';
export * from './sheet';
export * from './tabs';
export * from './tooltip';
export * from './toast';
export * from './accordion';
export * from './pagination';
export * from './stepper';
// The table primitives. They existed as their own file since the data-table
// work but were never re-exported here, so every consumer imported them by
// path while importing everything else from the barrel   which is how the
// landlord tables arrived asking `@/components/ui` for a `Table` it did not
// offer.
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table';
export * from './sheet-layout';
export * from './wizard-steps';

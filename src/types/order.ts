export type Order = {
  id: string;
  customer: string;
  /**
   * Conversation/customer this order belongs to, matching `ChatContact.id`.
   * Lets the orders table deep-link straight into the right inbox thread
   * instead of guessing from the display name. Optional so older/imported
   * rows still typecheck - the inbox falls back to matching on `customer`.
   */
  customerId?: string;
  product: string;
  date: string;
  amount: number;
  payment: 'Paid' | 'Pending' | 'Failed';
  status: 'Pending' | 'Processing' | 'Delivered' | 'Cancelled';
};

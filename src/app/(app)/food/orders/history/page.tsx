/**
 * ROUTE: /food/orders/history
 * ACCESS: authenticated student
 * PURPOSE: Delivered and cancelled orders. Live ones live at /food/orders.
 */
import type { Metadata } from 'next';
import { OrderHistory } from './(components)/order-history';

export const metadata: Metadata = { title: 'Order history' };

export default function Page() {
  return <OrderHistory />;
}

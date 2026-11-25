import type { Order, OrderData } from './order';

export type OrderSummary = Pick<OrderData, 'customerId' | 'status' | 'total' | 'createdAt'> & { id: string };

export interface OrderRepository {
  insert(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  list(customerId?: string): Promise<OrderSummary[]>;
  updateStatus(order: Order, changedAt: Date): Promise<void>;
  revenue(): Promise<{ orders: number; revenue: number }>;
}

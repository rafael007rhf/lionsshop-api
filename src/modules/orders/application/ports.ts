import type { ProductRepository } from '../../catalog/domain/product-repository';
import type { ApplyCoupon } from '../../coupons/application/coupons';
import type { CustomerRepository } from '../../customers/domain/customer-repository';
import type { OrderRepository } from '../domain/order-repository';

export interface OrderTransaction {
  orders: Pick<OrderRepository, 'findById' | 'insert' | 'updateStatus'>;
  catalog: Pick<ProductRepository, 'findById' | 'adjustStock'>;
  customers: Pick<CustomerRepository, 'findById'>;
  applyCoupon: Pick<ApplyCoupon, 'execute'>;
}

export interface OrderUnitOfWork {
  run<T>(operation: (transaction: OrderTransaction) => Promise<T>): Promise<T>;
}

export interface Mailer {
  send(to: string, subject: string, body: string): void;
}

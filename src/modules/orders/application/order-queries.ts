import { BusinessError } from '../../../shared/business-error';
import type { CustomerRepository } from '../../customers/domain/customer-repository';
import type { OrderRepository } from '../domain/order-repository';

export class GetOrder {
  constructor(private readonly orders: Pick<OrderRepository, 'findById'>) {}

  async execute(id: string) {
    const order = await this.orders.findById(id);
    if (!order) throw new BusinessError('not-found', 'Pedido não encontrado');
    return order;
  }
}

export class ListOrders {
  constructor(private readonly orders: Pick<OrderRepository, 'list'>) {}

  execute() {
    return this.orders.list();
  }
}

export class ListCustomerOrders {
  constructor(
    private readonly orders: Pick<OrderRepository, 'list'>,
    private readonly customers: Pick<CustomerRepository, 'findById'>,
  ) {}

  async execute(id: string) {
    const customer = await this.customers.findById(id);
    if (!customer) throw new BusinessError('not-found', 'Cliente não encontrado');
    return this.orders.list(customer.id);
  }
}

export class GetRevenue {
  constructor(private readonly orders: Pick<OrderRepository, 'revenue'>) {}

  async execute() {
    const { orders, revenue } = await this.orders.revenue();
    return { orders, revenue: Math.round(revenue * 100) / 100 };
  }
}

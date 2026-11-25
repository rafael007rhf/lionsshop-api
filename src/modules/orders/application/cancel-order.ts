import { BusinessError } from '../../../shared/business-error';
import type { Mailer, OrderUnitOfWork } from './ports';

export class CancelOrder {
  constructor(
    private readonly transactions: OrderUnitOfWork,
    private readonly mailer: Mailer,
    private readonly now: () => Date,
  ) {}

  async execute(id: string) {
    const { canceled, customer } = await this.transactions.run(async ({ orders, catalog, customers }) => {
      const order = await orders.findById(id);
      if (!order) throw new BusinessError('not-found', 'Pedido não encontrado');

      const canceled = order.cancel();
      await orders.updateStatus(canceled, this.now());
      for (const item of canceled.data.items) {
        const product = await catalog.adjustStock(item.productId, item.quantity);
        if (!product) throw new BusinessError('not-found', `Produto ${item.productId} não encontrado`);
      }
      return { canceled, customer: await customers.findById(canceled.data.customerId) };
    });

    if (customer) {
      this.mailer.send(customer.data.email, 'Pedido cancelado!', `Olá ${customer.data.name}, seu pedido foi cancelado.`);
    }
    return canceled;
  }
}

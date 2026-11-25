import { BusinessError } from '../../../shared/business-error';
import type { Mailer, OrderUnitOfWork } from './ports';

export class ShipOrder {
  constructor(
    private readonly transactions: OrderUnitOfWork,
    private readonly mailer: Mailer,
    private readonly now: () => Date,
  ) {}

  async execute(id: string) {
    const { shipped, customer } = await this.transactions.run(async ({ orders, customers }) => {
      const order = await orders.findById(id);
      if (!order) throw new BusinessError('not-found', 'Pedido não encontrado');

      const shipped = order.ship();
      await orders.updateStatus(shipped, this.now());
      return { shipped, customer: await customers.findById(shipped.data.customerId) };
    });

    if (customer) {
      this.mailer.send(customer.data.email, 'Pedido enviado!', `Olá ${customer.data.name}, seu pedido saiu para entrega.`);
    }
    return shipped;
  }
}

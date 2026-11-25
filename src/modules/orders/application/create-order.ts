import { BusinessError } from '../../../shared/business-error';
import { Order, validateQuantity, type OrderItem } from '../domain/order';
import type { Mailer, OrderUnitOfWork } from './ports';

interface CreateOrderInput {
  customerId?: string;
  items?: { productId: string; quantity: unknown }[];
  coupon?: unknown;
}

export class CreateOrder {
  constructor(
    private readonly transactions: OrderUnitOfWork,
    private readonly mailer: Mailer,
    private readonly newId: () => string,
    private readonly now: () => Date,
  ) {}

  async execute({ customerId, items, coupon }: CreateOrderInput) {
    if (!customerId) throw new BusinessError('invalid', 'customerId é obrigatório', 'erro');
    if (!Array.isArray(items) || items.length === 0) throw new BusinessError('invalid', 'Pedido vazio');

    const { order, customer } = await this.transactions.run(async (transaction) => {
      const customer = await transaction.customers.findById(customerId);
      if (!customer) throw new BusinessError('not-found', 'Cliente não encontrado');

      const orderItems: OrderItem[] = [];
      for (const item of items) {
        const quantity = item?.quantity;
        validateQuantity(quantity);
        const product = await transaction.catalog.findById(item.productId);
        if (!product) throw new BusinessError('not-found', `Produto ${item.productId} não encontrado`);

        product.ensureAvailable(quantity);
        if (!await transaction.catalog.adjustStock(product.id, -quantity)) {
          throw new BusinessError('invalid', `Estoque insuficiente para ${product.data.name}`);
        }
        orderItems.push({ productId: product.id, name: product.data.name, price: product.data.price, quantity });
      }

      const createdAt = this.now();
      const appliedCoupon = coupon == null || coupon === ''
        ? null
        : await transaction.applyCoupon.execute(coupon, customer.id, createdAt);
      const order = Order.place(this.newId(), customer.id, orderItems, createdAt, customer.data.vip, appliedCoupon);
      await transaction.orders.insert(order);
      return { order, customer };
    });

    this.mailer.send(customer.data.email, 'Pedido recebido!',
      `Olá ${customer.data.name}, recebemos seu pedido de R$ ${order.data.total}.`);
    return order;
  }
}

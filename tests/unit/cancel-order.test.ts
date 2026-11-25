import { CancelOrder } from '../../src/modules/orders/application/cancel-order';
import type { OrderTransaction, OrderUnitOfWork } from '../../src/modules/orders/application/ports';
import { Product } from '../../src/modules/catalog/domain/product';
import { Customer } from '../../src/modules/customers/domain/customer';
import { Order, OrderStatus } from '../../src/modules/orders/domain/order';

const now = new Date('2026-01-01T12:00:00Z');
const item = { productId: 'caneca', name: 'Caneca', quantity: 2, price: 20 };
const pending = Order.place('pedido', 'ana', [item], now, false, null);

function arrange(order: Order | null) {
  const updateStatus = jest.fn(async () => {});
  const adjustStock = jest.fn(async () => new Product('caneca', { name: 'Caneca', price: 20, stock: 2 }));
  const customer = new Customer('ana', { name: 'Ana', email: 'ana@example.com', vip: false });
  let committed = false;
  const send = jest.fn(() => { expect(committed).toBe(true); });
  const transaction: OrderTransaction = {
    orders: { findById: async () => order, insert: jest.fn(), updateStatus },
    catalog: { findById: jest.fn(), adjustStock },
    customers: { findById: async () => customer },
    applyCoupon: { execute: jest.fn() },
  };
  const transactions: OrderUnitOfWork = {
    async run(operation) {
      const result = await operation(transaction);
      committed = true;
      return result;
    },
  };
  return { cancel: new CancelOrder(transactions, { send }, () => now), updateStatus, adjustStock, send };
}

test('cancela o pedido, devolve os itens e avisa o cliente após concluir a transação', async () => {
  const { cancel, updateStatus, adjustStock, send } = arrange(pending);
  const canceled = await cancel.execute(pending.id);

  expect(canceled.data.status).toBe(OrderStatus.Canceled);
  expect(updateStatus).toHaveBeenCalledWith(canceled, now);
  expect(adjustStock).toHaveBeenCalledWith(item.productId, item.quantity);
  expect(send).toHaveBeenCalledWith('ana@example.com', 'Pedido cancelado!', expect.stringContaining('Ana'));
});

test.each([pending.ship(), pending.cancel()])('recusa pedido com status $data.status', async (order) => {
  const { cancel, updateStatus, adjustStock, send } = arrange(order);
  await expect(cancel.execute(order.id)).rejects.toThrow('Só pedidos pendentes podem ser cancelados');
  expect(updateStatus).not.toHaveBeenCalled();
  expect(adjustStock).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test('informa quando o pedido não existe', async () => {
  const { cancel, send } = arrange(null);
  await expect(cancel.execute('inexistente')).rejects.toMatchObject({ kind: 'not-found' });
  expect(send).not.toHaveBeenCalled();
});

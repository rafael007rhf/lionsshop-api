import { Customer } from '../../src/modules/customers/domain/customer';
import { ListCustomerOrders } from '../../src/modules/orders/application/order-queries';
import { OrderStatus } from '../../src/modules/orders/domain/order';

const ana = new Customer('ana', { name: 'Ana', email: 'ana@example.com', vip: false });

test('consulta pelo id do cliente e retorna status e total dos pedidos', async () => {
  const summaries = [{
    id: 'pedido', customerId: ana.id, status: OrderStatus.Shipped, total: 60, createdAt: new Date(),
  }];
  const list = jest.fn(async () => summaries);
  const useCase = new ListCustomerOrders({ list }, { findById: async () => ana });

  await expect(useCase.execute(ana.id)).resolves.toEqual(summaries);
  expect(list).toHaveBeenCalledWith(ana.id);
});

test('retorna lista vazia para cliente sem pedidos', async () => {
  const useCase = new ListCustomerOrders({ list: async () => [] }, { findById: async () => ana });
  await expect(useCase.execute(ana.id)).resolves.toEqual([]);
});

test('informa quando o cliente não existe', async () => {
  const list = jest.fn();
  const useCase = new ListCustomerOrders({ list }, { findById: async () => null });

  await expect(useCase.execute('inexistente')).rejects.toMatchObject({ kind: 'not-found' });
  expect(list).not.toHaveBeenCalled();
});

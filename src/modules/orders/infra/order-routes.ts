import { Router } from 'express';
import type { CancelOrder } from '../application/cancel-order';
import type { CreateOrder } from '../application/create-order';
import type { GetOrder, GetRevenue, ListCustomerOrders, ListOrders } from '../application/order-queries';
import type { ShipOrder } from '../application/ship-order';

export function orderRoutes(useCases: {
  create: CreateOrder;
  get: GetOrder;
  list: ListOrders;
  ship: ShipOrder;
  cancel: CancelOrder;
}) {
  const router = Router();

  router.post('/', async (req, res) => {
    const order = await useCases.create.execute(req.body ?? {});
    res.status(201).json({ id: order.id, total: order.data.total, status: 1 });
  });

  router.get('/', async (_req, res) => {
    res.json(await useCases.list.execute());
  });

  router.get('/:id', async (req, res) => {
    const order = await useCases.get.execute(req.params.id);
    res.json({ id: order.id, ...order.data, subtotal: order.subtotal });
  });

  router.patch('/:id/ship', async (req, res) => {
    const order = await useCases.ship.execute(req.params.id);
    res.json({ id: order.id, status: order.data.status });
  });

  router.patch('/:id/cancel', async (req, res) => {
    const order = await useCases.cancel.execute(req.params.id);
    res.json({ id: order.id, status: order.data.status });
  });

  return router;
}

export function customerOrderRoutes(list: ListCustomerOrders) {
  const router = Router();

  router.get('/:id/orders', async (req, res) => {
    res.json(await list.execute(req.params.id));
  });

  return router;
}

export function reportRoutes(revenue: GetRevenue) {
  const router = Router();

  router.get('/revenue', async (_req, res) => {
    res.json(await revenue.execute());
  });

  return router;
}

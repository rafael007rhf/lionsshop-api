import { Router } from 'express';
import type { GetCustomer, RegisterCustomer, UpdateCustomer } from '../application/customers';

export function customerRoutes(register: RegisterCustomer, get: GetCustomer, update: UpdateCustomer) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { name, email, vip } = req.body ?? {};
    const customer = await register.execute(name, email, vip);
    res.status(201).json({ id: customer.id, ...customer.data });
  });

  router.get('/:id', async (req, res) => {
    const customer = await get.execute(req.params.id);
    res.json({ id: customer.id, ...customer.data });
  });

  router.put('/:id', async (req, res) => {
    const { name, email } = req.body ?? {};
    await update.execute(req.params.id, name, email);
    res.json({ ok: true });
  });

  return router;
}

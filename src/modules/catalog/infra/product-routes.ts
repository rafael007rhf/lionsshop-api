import { Router } from 'express';
import type { AdjustStock, ListProducts, RegisterProduct } from '../application/catalog';

export function productRoutes(register: RegisterProduct, list: ListProducts, adjustStock: AdjustStock) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { name, price, stock } = req.body ?? {};
    const product = await register.execute(name, price, stock);
    res.status(201).json({ id: product.id, ...product.data });
  });

  router.get('/', async (req, res) => {
    const products = await list.execute(req.query.q ? String(req.query.q) : undefined);
    res.json(products.map(({ id, data }) => ({ id, ...data })));
  });

  router.patch('/:id/stock', async (req, res) => {
    const product = await adjustStock.execute(req.params.id, req.body?.quantity);
    res.json({ id: product.id, stock: product.data.stock });
  });

  return router;
}

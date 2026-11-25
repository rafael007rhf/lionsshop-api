import { Router } from 'express';
import type { RegisterCoupon } from '../application/coupons';

export function couponRoutes(register: RegisterCoupon) {
  const router = Router();

  router.post('/', async (req, res) => {
    const { code, discountPercent, expiresAt } = req.body ?? {};
    res.status(201).json(await register.execute(code, discountPercent, expiresAt));
  });

  return router;
}

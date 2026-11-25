import type { Coupon } from './coupon';

export interface CouponRepository {
  insert(coupon: Coupon): Promise<boolean>;
  findByCode(code: string): Promise<Coupon | null>;
  recordUse(code: string, customerId: string): Promise<boolean>;
}

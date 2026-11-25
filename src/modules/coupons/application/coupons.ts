import { BusinessError } from '../../../shared/business-error';
import { Coupon } from '../domain/coupon';
import type { CouponRepository } from '../domain/coupon-repository';

export class RegisterCoupon {
  constructor(private readonly coupons: Pick<CouponRepository, 'insert'>) {}

  async execute(code: unknown, discountPercent: unknown, expiresAt: unknown) {
    const coupon = Coupon.register(code, discountPercent, expiresAt);
    if (!await this.coupons.insert(coupon)) {
      throw new BusinessError('conflict', 'Já existe um cupom com este código');
    }
    return coupon;
  }
}

export interface CouponHistory {
  hasUsedCoupon(customerId: string, code: string): Promise<boolean>;
}

export class ApplyCoupon {
  constructor(
    private readonly coupons: Pick<CouponRepository, 'findByCode' | 'recordUse'>,
    private readonly history: CouponHistory,
  ) {}

  // O uso participa da mesma transação que a criação do pedido.
  async execute(rawCode: unknown, customerId: string, now: Date) {
    const code = Coupon.normalizeCode(rawCode);
    const coupon = await this.coupons.findByCode(code);
    if (!coupon) throw new BusinessError('invalid', 'Cupom inválido');

    coupon.ensureValidAt(now);
    if (await this.history.hasUsedCoupon(customerId, code) || !await this.coupons.recordUse(code, customerId)) {
      throw new BusinessError('conflict', 'Cupom já utilizado por este cliente');
    }
    return coupon;
  }
}

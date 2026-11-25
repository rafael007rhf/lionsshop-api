import type { ClientSession, Db } from 'mongodb';
import { isDuplicateKey, mongoId } from '../../../shared/infra/mongo';
import { Coupon } from '../domain/coupon';
import type { CouponRepository } from '../domain/coupon-repository';

export class MongoCoupons implements CouponRepository {
  private readonly coupons;
  private readonly uses;

  constructor(db: Db, private readonly session?: ClientSession) {
    this.coupons = db.collection<{ _id: string; discountPercent: number; expiresAt: Date }>('coupons');
    this.uses = db.collection('couponUses');
  }

  ensureIndexes() {
    return this.uses.createIndex({ code: 1, customerId: 1 }, { unique: true });
  }

  async insert({ code, discountPercent, expiresAt }: Coupon) {
    try {
      await this.coupons.insertOne({ _id: code, discountPercent, expiresAt }, { session: this.session });
      return true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return false;
    }
  }

  async findByCode(code: string) {
    const document = await this.coupons.findOne({ _id: code }, { session: this.session });
    return document && new Coupon(code, document.discountPercent, document.expiresAt);
  }

  async recordUse(code: string, customerId: string) {
    try {
      await this.uses.insertOne({ code, customerId: mongoId(customerId) }, { session: this.session });
      return true;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return false;
    }
  }
}

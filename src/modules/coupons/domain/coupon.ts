import { BusinessError } from '../../../shared/business-error';

export class Coupon {
  constructor(
    readonly code: string,
    readonly discountPercent: number,
    readonly expiresAt: Date,
  ) {}

  static register(code: unknown, discountPercent: unknown, expiresAt: unknown): Coupon {
    const normalizedCode = this.normalizeCode(code);
    if (typeof discountPercent !== 'number' || !Number.isFinite(discountPercent)
      || discountPercent <= 0 || discountPercent > 100) {
      throw new BusinessError('invalid', 'Percentual de desconto deve ser maior que zero e no máximo 100');
    }
    return new Coupon(normalizedCode, discountPercent, parseExpiration(expiresAt));
  }

  static normalizeCode(code: unknown) {
    const normalized = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!/^[A-Z0-9_-]{1,64}$/.test(normalized)) {
      throw new BusinessError('invalid', 'Cupom inválido');
    }
    return normalized;
  }

  ensureValidAt(now: Date) {
    if (now >= this.expiresAt) {
      throw new BusinessError('invalid', 'Cupom expirado');
    }
  }
}

function parseExpiration(value: unknown) {
  const isoDate = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/;
  if (typeof value !== 'string' || !isoDate.test(value)) {
    throw new BusinessError('invalid', 'Validade do cupom inválida');
  }
  const day = value.slice(0, 10);
  const midnight = new Date(day + 'T00:00:00Z');
  const expiresAt = new Date(value);
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(midnight.getTime())
    || midnight.toISOString().slice(0, 10) !== day) {
    throw new BusinessError('invalid', 'Validade do cupom inválida');
  }
  // Uma data sem horário inclui o dia inteiro em UTC.
  if (value.length === 10) expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
  return expiresAt;
}

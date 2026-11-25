import { ApplyCoupon, RegisterCoupon } from '../../src/modules/coupons/application/coupons';
import { Coupon } from '../../src/modules/coupons/domain/coupon';
import { Order } from '../../src/modules/orders/domain/order';

const now = new Date('2026-01-01T12:00:00Z');
const expiresAt = new Date('2026-02-01T12:00:00Z');
const coupon = new Coupon('TURMA20', 20, expiresAt);

function arrangeApply(found: Coupon | null, alreadyUsed = false, recorded = true) {
  const coupons = { findByCode: jest.fn(async () => found), recordUse: jest.fn(async () => recorded) };
  const history = { hasUsedCoupon: jest.fn(async () => alreadyUsed) };
  return { apply: new ApplyCoupon(coupons, history), coupons, history };
}

test('normaliza o código no cadastro e aceita datas de validade sem horário', async () => {
  const insert = jest.fn(async () => true);
  const register = new RegisterCoupon({ insert });

  const saved = await register.execute(' turma20 ', 20, '2026-01-31');

  expect(saved).toEqual(new Coupon('TURMA20', 20, new Date('2026-02-01T00:00:00Z')));
  expect(insert).toHaveBeenCalledWith(saved);
});

test('rejeita cadastro com código repetido', async () => {
  const register = new RegisterCoupon({ insert: async () => false });
  await expect(register.execute('TURMA20', 20, expiresAt.toISOString())).rejects.toMatchObject({ kind: 'conflict' });
});

test('aplica o cupom válido ao pedido antes do desconto VIP', async () => {
  const { apply, coupons } = arrangeApply(coupon);
  const applied = await apply.execute('turma20', 'ana', now);
  const order = Order.place('pedido', 'ana', [{ productId: 'caneca', name: 'Caneca', price: 100, quantity: 1 }],
    now, true, applied);

  expect(coupons.findByCode).toHaveBeenCalledWith('TURMA20');
  expect(coupons.recordUse).toHaveBeenCalledWith('TURMA20', 'ana');
  expect(order.data.total).toBe(76);
});

test('recusa cupom inexistente', async () => {
  const { apply, coupons } = arrangeApply(null);
  await expect(apply.execute('TURMA20', 'ana', now)).rejects.toThrow('Cupom inválido');
  expect(coupons.recordUse).not.toHaveBeenCalled();
});

test('recusa resgate no instante em que a validade termina', async () => {
  const { apply, coupons } = arrangeApply(coupon);
  await expect(apply.execute('TURMA20', 'ana', expiresAt)).rejects.toThrow('Cupom expirado');
  expect(coupons.recordUse).not.toHaveBeenCalled();
});

test('considera pedidos históricos mesmo sem um registro de resgate', async () => {
  const { apply, coupons } = arrangeApply(coupon, true);
  await expect(apply.execute('TURMA20', 'ana', now)).rejects.toMatchObject({ kind: 'conflict' });
  expect(coupons.recordUse).not.toHaveBeenCalled();
});

test('rejeita quando outra compra registra o resgate primeiro', async () => {
  const { apply } = arrangeApply(coupon, false, false);
  await expect(apply.execute('TURMA20', 'ana', now)).rejects.toThrow('Cupom já utilizado por este cliente');
});

import { BusinessError } from '../../../shared/business-error';

export const OrderStatus = {
  Pending: 'PENDENTE',
  Shipped: 'ENVIADO',
  Canceled: 'CANCELADO',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export interface OrderItem {
  readonly productId: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
}

export interface OrderData {
  customerId: string;
  items: readonly OrderItem[];
  coupon: string | null;
  total: number;
  status: OrderStatus;
  createdAt: Date;
}

export class Order {
  constructor(readonly id: string, readonly data: Readonly<OrderData>) {}

  static place(
    id: string, customerId: string, items: readonly OrderItem[], createdAt: Date,
    vip: boolean, coupon: { code: string; discountPercent: number } | null,
  ) {
    if (items.length === 0) throw new BusinessError('invalid', 'Pedido vazio');

    const afterCoupon = subtotalOf(items) * (1 - (coupon?.discountPercent ?? 0) / 100);
    const total = Math.round((vip ? afterCoupon - afterCoupon * 0.05 : afterCoupon) * 100) / 100;
    return new Order(id, {
      customerId, items, coupon: coupon?.code ?? null, total, status: OrderStatus.Pending, createdAt,
    });
  }

  get subtotal() {
    return subtotalOf(this.data.items);
  }

  cancel() {
    if (this.data.status !== OrderStatus.Pending) {
      throw new BusinessError('invalid', 'Só pedidos pendentes podem ser cancelados');
    }
    return new Order(this.id, { ...this.data, status: OrderStatus.Canceled });
  }

  ship() {
    if (this.data.status !== OrderStatus.Pending) {
      throw new BusinessError('invalid', 'Só pedidos pendentes podem ser enviados');
    }
    return new Order(this.id, { ...this.data, status: OrderStatus.Shipped });
  }
}

export function validateQuantity(quantity: unknown): asserts quantity is number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new BusinessError('invalid', 'Quantidade inválida');
  }
}

function subtotalOf(items: readonly OrderItem[]) {
  return items.reduce((subtotal, item) => subtotal + item.price * item.quantity, 0);
}

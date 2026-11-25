import { BusinessError } from '../../../shared/business-error';

export interface ProductData {
  name: string;
  price: number;
  stock: number;
}

export class Product {
  constructor(readonly id: string, readonly data: Readonly<ProductData>) {}

  static forRegistration(name: unknown, price: unknown, stock: unknown = 0): ProductData {
    if (typeof name !== 'string' || !name.trim()) {
      throw new BusinessError('invalid', 'nome é obrigatório', 'erro');
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      throw new BusinessError('invalid', 'Preço inválido');
    }
    if (typeof stock !== 'number' || !Number.isFinite(stock)) {
      throw new BusinessError('invalid', 'Estoque inválido');
    }
    if (stock < 0) {
      throw new BusinessError('invalid', 'Estoque não pode ficar negativo');
    }
    return { name, price, stock };
  }

  ensureAvailable(quantity: number) {
    if (this.data.stock < quantity) {
      throw new BusinessError('invalid', `Estoque insuficiente para ${this.data.name}`);
    }
  }
}

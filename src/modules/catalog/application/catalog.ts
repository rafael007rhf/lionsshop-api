import { BusinessError } from '../../../shared/business-error';
import { Product } from '../domain/product';
import type { ProductRepository } from '../domain/product-repository';

export class RegisterProduct {
  constructor(private readonly products: ProductRepository) {}

  execute(name: unknown, price: unknown, stock: unknown) {
    return this.products.insert(Product.forRegistration(name, price, stock ?? 0));
  }
}

export class ListProducts {
  constructor(private readonly products: ProductRepository) {}

  execute(search?: string) {
    return this.products.list(search);
  }
}

export class AdjustStock {
  constructor(private readonly products: ProductRepository) {}

  async execute(id: string, quantity: unknown) {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
      throw new BusinessError('invalid', 'quantity deve ser um número');
    }
    const product = await this.products.adjustStock(id, quantity);
    if (product) return product;

    if (!await this.products.findById(id)) {
      throw new BusinessError('not-found', 'Produto não encontrado');
    }
    throw new BusinessError('invalid', 'Estoque não pode ficar negativo');
  }
}

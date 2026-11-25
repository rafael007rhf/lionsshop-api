import type { Product, ProductData } from './product';

export interface ProductRepository {
  insert(data: ProductData): Promise<Product>;
  findById(id: string): Promise<Product | null>;
  list(search?: string): Promise<Product[]>;
  adjustStock(id: string, quantity: number): Promise<Product | null>;
}

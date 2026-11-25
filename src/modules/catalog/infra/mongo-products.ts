import type { ClientSession, Db, WithId } from 'mongodb';
import { mongoId } from '../../../shared/infra/mongo';
import { Product, type ProductData } from '../domain/product';
import type { ProductRepository } from '../domain/product-repository';

type ProductDocument = ProductData & { createdAt: Date };

export class MongoProducts implements ProductRepository {
  private readonly products;

  constructor(db: Db, private readonly session?: ClientSession) {
    this.products = db.collection<ProductDocument>('products');
  }

  async insert(data: ProductData) {
    const { insertedId } = await this.products.insertOne({ ...data, createdAt: new Date() }, { session: this.session });
    return new Product(insertedId.toHexString(), data);
  }

  async findById(id: string) {
    const document = await this.products.findOne({ _id: mongoId(id) }, { session: this.session });
    return document && toProduct(document);
  }

  async list(search?: string) {
    const filter = search
      ? { name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      : {};
    return (await this.products.find(filter, { session: this.session }).toArray()).map(toProduct);
  }

  async adjustStock(id: string, quantity: number) {
    const document = await this.products.findOneAndUpdate(
      { _id: mongoId(id), stock: { $gte: -quantity } },
      { $inc: { stock: quantity } },
      { returnDocument: 'after', session: this.session },
    );
    return document && toProduct(document);
  }
}

function toProduct({ _id, name, price, stock }: WithId<ProductDocument>) {
  return new Product(_id.toHexString(), { name, price, stock });
}

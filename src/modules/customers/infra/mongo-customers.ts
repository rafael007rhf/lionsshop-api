import type { ClientSession, Db } from 'mongodb';
import { BusinessError } from '../../../shared/business-error';
import { isDuplicateKey, mongoId } from '../../../shared/infra/mongo';
import { Customer, type CustomerData } from '../domain/customer';
import type { ContactChanges, CustomerRepository } from '../domain/customer-repository';

export class MongoCustomers implements CustomerRepository {
  private readonly customers;

  constructor(db: Db, private readonly session?: ClientSession) {
    this.customers = db.collection<CustomerData & { createdAt: Date }>('customers');
  }

  ensureIndexes() {
    return this.customers.createIndex(
      { email: 1 },
      { name: 'unique_customer_email', unique: true, collation: { locale: 'en', strength: 2 } },
    );
  }

  async insert(data: CustomerData) {
    try {
      const { insertedId } = await this.customers.insertOne({ ...data, createdAt: new Date() }, { session: this.session });
      return new Customer(insertedId.toHexString(), data);
    } catch (error) {
      throw customerWriteError(error);
    }
  }

  async findById(id: string) {
    const document = await this.customers.findOne({ _id: mongoId(id) }, { session: this.session });
    if (!document) return null;
    const { _id, name, email, vip } = document;
    return new Customer(_id.toHexString(), { name, email, vip });
  }

  async updateContact(id: string, changes: ContactChanges) {
    try {
      const result = await this.customers.updateOne(
        { _id: mongoId(id) },
        { $set: changes },
        { session: this.session },
      );
      return result.matchedCount > 0;
    } catch (error) {
      throw customerWriteError(error);
    }
  }
}

function customerWriteError(error: unknown) {
  return isDuplicateKey(error) ? new BusinessError('conflict', 'Já existe um cliente com este e-mail') : error;
}

import type { ClientSession, MongoClient } from 'mongodb';
import type { OrderTransaction, OrderUnitOfWork } from '../application/ports';

export class MongoOrderUnitOfWork implements OrderUnitOfWork {
  constructor(
    private readonly client: MongoClient,
    private readonly createTransaction: (session: ClientSession) => OrderTransaction,
  ) {}

  run<T>(operation: (transaction: OrderTransaction) => Promise<T>): Promise<T> {
    return this.client.withSession((session) =>
      session.withTransaction(() => operation(this.createTransaction(session))),
    );
  }
}

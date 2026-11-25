import type { ClientSession, Db, ObjectId, WithId } from 'mongodb';
import { mongoId } from '../../../shared/infra/mongo';
import { Order, OrderStatus, type OrderData, type OrderItem } from '../domain/order';
import type { OrderRepository, OrderSummary } from '../domain/order-repository';

const statusFromMongo = { 1: OrderStatus.Pending, 2: OrderStatus.Shipped, 3: OrderStatus.Canceled } as const;
const statusToMongo = { [OrderStatus.Pending]: 1, [OrderStatus.Shipped]: 2, [OrderStatus.Canceled]: 3 } as const;

type OrderDocument = Pick<OrderData, 'coupon' | 'total' | 'createdAt'> & {
  customerId: ObjectId;
  items: (Omit<OrderItem, 'productId'> & { productId: ObjectId })[];
  status: 1 | 2 | 3;
  shippedAt?: Date;
  canceledAt?: Date;
};

type SummaryDocument = WithId<Pick<OrderDocument, 'customerId' | 'total' | 'status' | 'createdAt'>>;

export class MongoOrders implements OrderRepository {
  private readonly orders;

  constructor(db: Db, private readonly session?: ClientSession) {
    this.orders = db.collection<OrderDocument>('orders');
  }

  ensureIndexes() {
    return this.orders.createIndexes([
      { key: { createdAt: -1, _id: -1 } },
      { key: { customerId: 1, createdAt: -1, _id: -1 } },
      { key: { customerId: 1, coupon: 1 } },
    ]);
  }

  async insert({ id, data }: Order) {
    await this.orders.insertOne({
      ...data,
      _id: mongoId(id),
      customerId: mongoId(data.customerId),
      status: statusToMongo[data.status],
      items: data.items.map((item) => ({ ...item, productId: mongoId(item.productId) })),
    }, { session: this.session });
  }

  async findById(id: string) {
    const document = await this.orders.findOne({ _id: mongoId(id) }, { session: this.session });
    if (!document) return null;

    const { id: orderId, ...data } = toSummary(document);
    return new Order(orderId, {
      ...data,
      items: document.items.map((item) => ({ ...item, productId: item.productId.toHexString() })),
      coupon: document.coupon,
    });
  }

  async list(customerId?: string) {
    const filter = customerId ? { customerId: mongoId(customerId) } : {};
    const documents = await this.orders.find<SummaryDocument>(filter, {
      session: this.session,
      projection: { customerId: 1, total: 1, status: 1, createdAt: 1 },
      sort: { createdAt: -1, _id: -1 },
    }).toArray();
    return documents.map(toSummary);
  }

  async updateStatus(order: Order, changedAt: Date) {
    const status = statusToMongo[order.data.status];
    const timestamp = order.data.status === OrderStatus.Canceled ? { canceledAt: changedAt } : { shippedAt: changedAt };
    await this.orders.updateOne(
      { _id: mongoId(order.id) },
      { $set: { status, ...timestamp } },
      { session: this.session },
    );
  }

  async hasUsedCoupon(customerId: string, code: string) {
    const priorOrder = await this.orders.findOne(
      { customerId: mongoId(customerId), coupon: code },
      { projection: { _id: 1 }, session: this.session },
    );
    return priorOrder !== null;
  }

  async revenue() {
    const summary = await this.orders.aggregate<{ orders: number; revenue: number }>([
      { $match: { status: { $in: [statusToMongo[OrderStatus.Pending], statusToMongo[OrderStatus.Shipped]] } } },
      { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
    ]).next();

    return { orders: summary?.orders ?? 0, revenue: summary?.revenue ?? 0 };
  }
}

function toSummary({ _id, customerId, total, status, createdAt }: SummaryDocument): OrderSummary {
  return { id: _id.toHexString(), customerId: customerId.toHexString(), total, status: statusFromMongo[status], createdAt };
}

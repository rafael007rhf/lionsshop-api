import dotenv from 'dotenv';
import express from 'express';
import { ObjectId, type MongoClient } from 'mongodb';
import { AdjustStock, ListProducts, RegisterProduct } from './modules/catalog/application/catalog';
import { MongoProducts } from './modules/catalog/infra/mongo-products';
import { productRoutes } from './modules/catalog/infra/product-routes';
import { ApplyCoupon, RegisterCoupon } from './modules/coupons/application/coupons';
import { couponRoutes } from './modules/coupons/infra/coupon-routes';
import { MongoCoupons } from './modules/coupons/infra/mongo-coupons';
import { GetCustomer, RegisterCustomer, UpdateCustomer } from './modules/customers/application/customers';
import { customerRoutes } from './modules/customers/infra/customer-routes';
import { MongoCustomers } from './modules/customers/infra/mongo-customers';
import { CancelOrder } from './modules/orders/application/cancel-order';
import { CreateOrder } from './modules/orders/application/create-order';
import { GetOrder, GetRevenue, ListCustomerOrders, ListOrders } from './modules/orders/application/order-queries';
import type { Mailer } from './modules/orders/application/ports';
import { ShipOrder } from './modules/orders/application/ship-order';
import { MongoOrderUnitOfWork } from './modules/orders/infra/mongo-order-unit-of-work';
import { MongoOrders } from './modules/orders/infra/mongo-orders';
import { customerOrderRoutes, orderRoutes, reportRoutes } from './modules/orders/infra/order-routes';
import { handleHttpError } from './shared/infra/http';
import { openMongo } from './shared/infra/mongo';

const consoleMailer: Mailer = {
  send(to, subject, body) {
    console.log(`[EMAIL] para: ${to} | assunto: ${subject}\n        ${body}`);
  },
};

export async function createApp(client: MongoClient, dbName: string, mailer: Mailer = consoleMailer) {
  const db = client.db(dbName);
  const products = new MongoProducts(db);
  const customers = new MongoCustomers(db);
  const orders = new MongoOrders(db);
  const coupons = new MongoCoupons(db);

  await Promise.all([customers.ensureIndexes(), orders.ensureIndexes(), coupons.ensureIndexes()]);

  const transactions = new MongoOrderUnitOfWork(client, (session) => {
    const orders = new MongoOrders(db, session);
    return {
      orders,
      catalog: new MongoProducts(db, session),
      customers: new MongoCustomers(db, session),
      applyCoupon: new ApplyCoupon(new MongoCoupons(db, session), orders),
    };
  });

  const now = () => new Date();
  const app = express();
  app.use(express.json());
  app.use('/products', productRoutes(new RegisterProduct(products), new ListProducts(products), new AdjustStock(products)));
  app.use('/customers', customerRoutes(new RegisterCustomer(customers), new GetCustomer(customers), new UpdateCustomer(customers)));
  app.use('/customers', customerOrderRoutes(new ListCustomerOrders(orders, customers)));
  app.use('/coupons', couponRoutes(new RegisterCoupon(coupons)));
  app.use('/orders', orderRoutes({
    create: new CreateOrder(transactions, mailer, () => new ObjectId().toHexString(), now),
    get: new GetOrder(orders),
    list: new ListOrders(orders),
    ship: new ShipOrder(transactions, mailer, now),
    cancel: new CancelOrder(transactions, mailer, now),
  }));
  app.use('/reports', reportRoutes(new GetRevenue(orders)));
  app.use(handleHttpError);
  return app;
}

async function start() {
  dotenv.config({ quiet: true });
  const port = Number(process.env.PORT) || 3000;
  const client = await openMongo();

  try {
    const app = await createApp(client, process.env.DB_NAME || 'lionsshop');
    const server = app.listen(port, () => console.log(`LionsShop API rodando em http://localhost:${port}`));

    const stop = () => server.close(() => { void client.close(); });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    await client.close();
    throw error;
  }
}

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

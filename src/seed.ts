// Popula o banco de desenvolvimento com produtos, clientes e cupons de exemplo.
import dotenv from 'dotenv';
import { Coupon } from './modules/coupons/domain/coupon';
import { MongoCoupons } from './modules/coupons/infra/mongo-coupons';
import { openMongo } from './shared/infra/mongo';

dotenv.config({ quiet: true });

async function seed() {
  const client = await openMongo();
  try {
    const db = client.db(process.env.DB_NAME || 'lionsshop');
    const collections = ['products', 'customers', 'orders', 'coupons', 'couponUses'];
    await Promise.all(collections.map((name) => db.collection(name).deleteMany({})));

    const createdAt = new Date();
    const products = await db.collection('products').insertMany([
      { name: 'Camiseta Lions', price: 79.9, stock: 50, createdAt },
      { name: 'Caneca Dev', price: 39.9, stock: 30, createdAt },
      { name: 'Moletom Code Hero', price: 189.9, stock: 10, createdAt },
      { name: 'Adesivos (kit)', price: 14.9, stock: 200, createdAt },
    ]);

    const customers = await db.collection('customers').insertMany([
      { name: 'Ana Souza', email: 'ana@example.com', vip: false, createdAt },
      { name: 'Bruno Lima', email: 'bruno@example.com', vip: true, createdAt },
    ]);

    const expiresAt = new Date(createdAt);
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
    const coupons = new MongoCoupons(db);
    await coupons.insert(new Coupon('LIONS10', 10, expiresAt));
    await coupons.insert(new Coupon('BLACKFRIDAY', 30, expiresAt));

    console.log('Produtos criados:');
    console.table(Object.values(products.insertedIds).map((id) => id.toString()));
    console.log('Clientes criados (Ana = comum, Bruno = VIP):');
    console.table(Object.values(customers.insertedIds).map((id) => id.toString()));
    console.log(`Cupons criados (LIONS10 e BLACKFRIDAY), válidos até ${expiresAt.toISOString()}`);
  } finally {
    await client.close();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

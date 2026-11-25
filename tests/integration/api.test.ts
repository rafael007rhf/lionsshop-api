/** @jest-environment ./tests/integration/mongo-environment.cjs */

import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../../src/app';
import { LOCAL_MONGO_URL } from '../../src/shared/infra/mongo';

jest.mock('mongodb', () => (globalThis as unknown as { mongoDriver: typeof import('mongodb') }).mongoDriver);

const dbName = 'lionsshop_test_' + new ObjectId().toHexString();
const client = new MongoClient(process.env.MONGO_TEST_URL || LOCAL_MONGO_URL, { serverSelectionTimeoutMS: 3000 });
const db = client.db(dbName);
let api: ReturnType<typeof request>;

beforeAll(async () => {
  await client.connect();
  api = request(await createApp(client, dbName));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(async () => {
  const collections = ['products', 'customers', 'orders', 'coupons', 'couponUses'];
  await Promise.all(collections.map((name) => db.collection(name).deleteMany({})));
  jest.clearAllMocks();
});

afterAll(async () => {
  try {
    await db.dropDatabase();
  } finally {
    await client.close();
    jest.restoreAllMocks();
  }
});

async function addProduct(stock = 8, name = 'Caneca Dev') {
  const { body } = await api.post('/products').send({ name, price: 100, stock }).expect(201);
  return body.id as string;
}

async function addCustomer(vip = false, email = 'Ana@example.com') {
  const { body } = await api.post('/customers').send({ name: 'Ana', email, vip }).expect(201);
  return body.id as string;
}

async function addCoupon(code = 'TURMA20', discountPercent = 20, expiresAt = '2099-12-31T23:59:59.000Z') {
  await api.post('/coupons').send({ code, discountPercent, expiresAt }).expect(201, {
    code: code.trim().toUpperCase(), discountPercent, expiresAt,
  });
}

test('cadastra, busca e ajusta o estoque de produtos', async () => {
  const id = await addProduct();
  await api.get('/products?q=caneca').expect(200, [{ id, name: 'Caneca Dev', price: 100, stock: 8 }]);
  await api.get('/products?q=moletom').expect(200, []);
  await api.patch('/products/' + id + '/stock').send({ quantity: -3 }).expect(200, { id, stock: 5 });
  await api.patch('/products/' + id + '/stock').send({ quantity: -6 })
    .expect(400, { error: 'Estoque não pode ficar negativo' });
  await api.get('/products').expect(200, [{ id, name: 'Caneca Dev', price: 100, stock: 5 }]);
  await api.post('/products').send({ name: 'Inválido', price: 0 }).expect(400, { error: 'Preço inválido' });
});

test('cadastra, consulta e atualiza clientes e rejeita e-mail duplicado', async () => {
  const id = await addCustomer(true);
  await api.get('/customers/' + id).expect(200, { id, name: 'Ana', email: 'ana@example.com', vip: true });
  await api.post('/customers').send({ name: 'Outra Ana', email: 'ANA@example.com' })
    .expect(409, { error: 'Já existe um cliente com este e-mail' });
  await api.put('/customers/' + id).send({ name: 'Ana Lima', email: 'ana.lima@example.com' }).expect(200, { ok: true });
  await api.get('/customers/' + id).expect(200, { id, name: 'Ana Lima', email: 'ana.lima@example.com', vip: true });
  await api.get('/customers/' + new ObjectId()).expect(404, { error: 'Cliente não encontrado' });
});

test.each([['LIONS10', 10, 171], ['BLACKFRIDAY', 30, 133]])(
  'cria um pedido pendente com desconto %s seguido pelo VIP',
  async (coupon, discountPercent, total) => {
    await addCoupon(coupon, discountPercent);
    const customerId = await addCustomer(true);
    const productId = await addProduct();
    const { body: order } = await api.post('/orders').send({ customerId, items: [{ productId, quantity: 2 }], coupon })
      .expect(201);
    expect(order).toEqual({ id: expect.any(String), total, status: 1 });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Pedido recebido!'));
    const { body: products } = await api.get('/products').expect(200);
    expect(products[0].stock).toBe(6);
    const { body: detail } = await api.get('/orders/' + order.id).expect(200);
    expect(detail).toMatchObject({
      id: order.id, customerId, items: [{ productId, name: 'Caneca Dev', price: 100, quantity: 2 }],
      coupon, subtotal: 200, total, status: 'PENDENTE',
    });
    await api.get('/orders').expect(200, [{
      id: order.id, customerId, total, status: 'PENDENTE', createdAt: detail.createdAt,
    }]);
  },
);

test('recusa pedidos inválidos e preserva estoque e pedidos', async () => {
  const customerId = await addCustomer();
  const productId = await addProduct(1);
  await api.post('/orders').send({ customerId, items: [] }).expect(400, { error: 'Pedido vazio' });
  await api.post('/orders').send({ customerId, items: [{ productId, quantity: 0 }] })
    .expect(400, { error: 'Quantidade inválida' });
  await api.post('/orders').send({ customerId, items: [{ productId, quantity: 2 }] })
    .expect(400, { error: 'Estoque insuficiente para Caneca Dev' });
  await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }], coupon: 'INEXISTENTE' })
    .expect(400, { error: 'Cupom inválido' });
  await api.get('/orders').expect(200, []);
  await api.get('/products').expect(200, [{ id: productId, name: 'Caneca Dev', price: 100, stock: 1 }]);
});

test('envia um pedido pendente uma única vez e inclui o pedido no faturamento', async () => {
  const customerId = await addCustomer();
  const productId = await addProduct();
  const { body: { id } } = await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }] }).expect(201);
  await api.patch('/orders/' + id + '/ship').expect(200, { id, status: 'ENVIADO' });
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Pedido enviado!'));
  await api.patch('/orders/' + id + '/ship').expect(400, { error: 'Só pedidos pendentes podem ser enviados' });
  await api.get('/reports/revenue').expect(200, { orders: 1, revenue: 100 });
});

test('o faturamento usa o total gravado, incluindo cupom e VIP', async () => {
  await addCoupon('LIONS10', 10);
  const customerId = await addCustomer(true);
  const productId = await addProduct();
  await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }], coupon: 'LIONS10' }).expect(201);
  await api.get('/reports/revenue').expect(200, { orders: 1, revenue: 85.5 });
});

test('cancela um pedido pendente, devolve estoque, envia aviso e exclui do faturamento', async () => {
  const customerId = await addCustomer();
  const productId = await addProduct(2);
  const { body: { id } } = await api.post('/orders').send({ customerId, items: [{ productId, quantity: 2 }] }).expect(201);

  await api.patch('/orders/' + id + '/cancel').expect(200, { id, status: 'CANCELADO' });
  await api.get('/reports/revenue').expect(200, { orders: 0, revenue: 0 });
  await api.patch('/orders/' + id + '/cancel').expect(400, { error: 'Só pedidos pendentes podem ser cancelados' });
  await api.get('/products').expect(200, [{ id: productId, name: 'Caneca Dev', price: 100, stock: 2 }]);
  expect((console.log as jest.Mock).mock.calls.filter(([message]) => message.includes('Pedido cancelado!'))).toHaveLength(1);
});

test('recusa o cancelamento de pedido enviado', async () => {
  const customerId = await addCustomer();
  const productId = await addProduct(1);
  const { body: { id } } = await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }] }).expect(201);
  await api.patch('/orders/' + id + '/ship').expect(200);
  await api.patch('/orders/' + id + '/cancel').expect(400, { error: 'Só pedidos pendentes podem ser cancelados' });
  await api.get('/products').expect(200, [{ id: productId, name: 'Caneca Dev', price: 100, stock: 0 }]);
});

test('impede cancelamentos concorrentes de devolver o mesmo item duas vezes', async () => {
  const customerId = await addCustomer();
  const productId = await addProduct(1);
  const { body: { id } } = await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }] }).expect(201);

  const responses = await Promise.all([
    api.patch('/orders/' + id + '/cancel'),
    api.patch('/orders/' + id + '/cancel'),
  ]);

  expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
  await api.get('/products').expect(200, [{ id: productId, name: 'Caneca Dev', price: 100, stock: 1 }]);
});

test('cadastra cupons com validade e impede código duplicado e resgate expirado', async () => {
  const customerId = await addCustomer();
  const productId = await addProduct(1);
  await addCoupon('  expirado  ', 25, '2000-01-01T00:00:00.000Z');
  await api.post('/coupons').send({ code: 'expirado', discountPercent: 30, expiresAt: '2099-01-01' })
    .expect(409, { error: 'Já existe um cupom com este código' });
  await api.post('/coupons').send({ code: 'INVALIDO', discountPercent: 101, expiresAt: '2099-01-01' }).expect(400);
  await api.post('/coupons').send({ code: 'INVALIDO', discountPercent: 10, expiresAt: '2099-02-30' }).expect(400);
  await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }], coupon: 'EXPIRADO' })
    .expect(400, { error: 'Cupom expirado' });
  await api.get('/products').expect(200, [{ id: productId, name: 'Caneca Dev', price: 100, stock: 1 }]);
});

test('permite o cupom uma vez por cliente, inclusive após o cancelamento', async () => {
  await addCoupon();
  const customerId = await addCustomer(true);
  const otherCustomerId = await addCustomer(false, 'bruno@example.com');
  const productId = await addProduct();
  const items = [{ productId, quantity: 1 }];
  const { body: first } = await api.post('/orders').send({ customerId, items, coupon: 'turma20' }).expect(201);
  expect(first.total).toBe(76);
  await api.patch('/orders/' + first.id + '/cancel').expect(200);
  await api.post('/orders').send({ customerId, items, coupon: 'TURMA20' })
    .expect(409, { error: 'Cupom já utilizado por este cliente' });
  const { body: second } = await api.post('/orders').send({ customerId: otherCustomerId, items, coupon: 'TURMA20' })
    .expect(201);
  expect(second.total).toBe(80);
  await api.get('/reports/revenue').expect(200, { orders: 1, revenue: 80 });
});

test('bloqueia resgates simultâneos do mesmo cupom em pedidos de produtos diferentes', async () => {
  await addCoupon();
  const customerId = await addCustomer();
  const firstProductId = await addProduct(1);
  const secondProductId = await addProduct(1, 'Moletom Dev');
  const responses = await Promise.all([firstProductId, secondProductId].map((productId) =>
    api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }], coupon: 'TURMA20' }),
  ));

  expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  const { body: products } = await api.get('/products').expect(200);
  expect(products.map(({ stock }: { stock: number }) => stock).sort()).toEqual([0, 1]);
  expect(await db.collection('couponUses').countDocuments()).toBe(1);
  await api.get('/reports/revenue').expect(200, { orders: 1, revenue: 80 });
});

test('reverte a baixa de estoque quando itens repetidos excedem o estoque disponível', async () => {
  await addCoupon();
  const customerId = await addCustomer();
  const productId = await addProduct(3);
  const item = { productId, quantity: 2 };
  await api.post('/orders').send({ customerId, items: [item, item], coupon: 'TURMA20' })
    .expect(400, { error: 'Estoque insuficiente para Caneca Dev' });
  await api.get('/products').expect(200, [{ id: productId, name: 'Caneca Dev', price: 100, stock: 3 }]);
  await api.get('/orders').expect(200, []);
  await api.post('/orders').send({ customerId, items: [item], coupon: 'TURMA20' }).expect(201);
});

test('lista só os pedidos do cliente em ordem decrescente, com status e total', async () => {
  const customerId = await addCustomer();
  const otherCustomerId = await addCustomer(false, 'bruno@example.com');
  const productId = await addProduct();
  await api.get('/customers/' + customerId + '/orders').expect(200, []);
  const { body: older } = await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }] }).expect(201);
  const { body: newer } = await api.post('/orders').send({ customerId, items: [{ productId, quantity: 2 }] }).expect(201);
  await api.post('/orders').send({ customerId: otherCustomerId, items: [{ productId, quantity: 3 }] }).expect(201);
  await api.patch('/orders/' + older.id + '/cancel').expect(200);
  const { body: orders } = await api.get('/customers/' + customerId + '/orders').expect(200);
  expect(orders).toEqual([
    { id: newer.id, customerId, total: 200, status: 'PENDENTE', createdAt: expect.any(String) },
    { id: older.id, customerId, total: 100, status: 'CANCELADO', createdAt: expect.any(String) },
  ]);
  await api.get('/customers/' + new ObjectId() + '/orders').expect(404, { error: 'Cliente não encontrado' });
});

test('mantém a leitura de pedidos antigos e reconhece cupons usados antes da refatoração', async () => {
  await addCoupon('BLACKFRIDAY', 30);
  const customerId = await addCustomer(true);
  const productId = await addProduct();
  const { insertedId } = await db.collection('orders').insertOne({
    customerId: new ObjectId(customerId),
    items: [{ productId: new ObjectId(productId), name: 'Caneca Dev', price: 100, quantity: 1 }],
    coupon: 'BLACKFRIDAY',
    total: 66.5,
    status: 2,
    createdAt: new Date('2025-05-01T12:00:00Z'),
  });

  const { body: order } = await api.get('/orders/' + insertedId.toHexString()).expect(200);
  expect(order).toMatchObject({ customerId, status: 'ENVIADO', subtotal: 100, total: 66.5 });
  await api.get('/reports/revenue').expect(200, { orders: 1, revenue: 66.5 });
  await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }], coupon: 'BLACKFRIDAY' })
    .expect(409, { error: 'Cupom já utilizado por este cliente' });
});

test('mantém o e-mail único também na atualização', async () => {
  const customerId = await addCustomer();
  const otherCustomerId = await addCustomer(false, 'bruno@example.com');
  await api.put('/customers/' + otherCustomerId).send({ email: 'ANA@EXAMPLE.COM' })
    .expect(409, { error: 'Já existe um cliente com este e-mail' });
  await api.put('/customers/' + customerId).send({ email: 'ANA.LIMA@EXAMPLE.COM' }).expect(200);
  await api.get('/customers/' + customerId).expect(200, {
    id: customerId, name: 'Ana', email: 'ana.lima@example.com', vip: false,
  });
});

test('reverte o cancelamento quando não consegue devolver todos os itens', async () => {
  const customerId = await addCustomer();
  const firstProductId = await addProduct(3);
  const secondProductId = await addProduct(1, 'Produto removido');
  const items = [
    { productId: firstProductId, quantity: 2 },
    { productId: secondProductId, quantity: 1 },
  ];
  const { body: { id } } = await api.post('/orders').send({ customerId, items }).expect(201);
  await db.collection('products').deleteOne({ _id: new ObjectId(secondProductId) });

  await api.patch('/orders/' + id + '/cancel').expect(404, { error: `Produto ${secondProductId} não encontrado` });
  const { body: order } = await api.get('/orders/' + id).expect(200);
  expect(order.status).toBe('PENDENTE');
  await api.get('/products').expect(200, [{ id: firstProductId, name: 'Caneca Dev', price: 100, stock: 1 }]);
});

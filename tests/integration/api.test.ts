/** @jest-environment ./tests/integration/mongo-environment.cjs */

import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { app, getDb } from '../../src/app';

jest.mock('mongodb', () => (globalThis as unknown as { mongoDriver: typeof import('mongodb') }).mongoDriver);

const api = request(app);
const connect = MongoClient.connect.bind(MongoClient);
const connection = jest.spyOn(MongoClient, 'connect').mockImplementation((url) =>
  connect(url, { serverSelectionTimeoutMS: 2000 }),
);

beforeAll(async () => {
  process.env.DB_NAME = 'lionsshop_test_' + new ObjectId().toHexString();
  await getDb();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(async () => {
  const db = await getDb();
  await Promise.all(['products', 'customers', 'orders'].map((name) => db.collection(name).deleteMany({})));
});

afterAll(async () => {
  if (connection.mock.results.length) {
    const client = await connection.mock.results[0].value;
    await client.db(process.env.DB_NAME).dropDatabase();
    await client.close();
  }
  jest.restoreAllMocks();
});

async function addProduct(stock = 8) {
  const { body } = await api.post('/products').send({ name: 'Caneca Dev', price: 100, stock }).expect(201);
  return body.id as string;
}

async function addCustomer(vip = false) {
  const { body } = await api.post('/customers').send({ name: 'Ana', email: 'Ana@example.com', vip }).expect(201);
  return body.id as string;
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

test.each([['LIONS10', 171], ['BLACKFRIDAY', 133]])(
  'cria um pedido pendente com desconto %s seguido pelo VIP',
  async (coupon, total) => {
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

test('o faturamento legado reaplica LIONS10 e ignora o desconto VIP', async () => {
  const customerId = await addCustomer(true);
  const productId = await addProduct();
  await api.post('/orders').send({ customerId, items: [{ productId, quantity: 1 }], coupon: 'LIONS10' }).expect(201);
  await api.get('/reports/revenue').expect(200, { orders: 1, revenue: 90 });
});

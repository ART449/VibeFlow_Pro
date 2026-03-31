const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

describe('POS real flow regressions', () => {
  let tempDir;
  let server;
  let baseUrl;
  let dbModule;

  async function requestJson(urlPath, options) {
    const response = await fetch(baseUrl + urlPath, options);
    const json = await response.json();
    return { status: response.status, body: json };
  }

  async function login(pin) {
    const { body } = await requestJson('/pos/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    expect(body.ok).toBe(true);
    return body;
  }

  async function getFreeTable(token) {
    const { body } = await requestJson('/pos/tables', {
      headers: { Authorization: 'Bearer ' + token }
    });
    expect(body.ok).toBe(true);
    const table = (body.tables || []).find((item) => item.status === 'libre');
    expect(table).toBeTruthy();
    return table;
  }

  async function getFirstProduct(token) {
    const { body } = await requestJson('/pos/products', {
      headers: { Authorization: 'Bearer ' + token }
    });
    expect(body.ok).toBe(true);
    const product = (body.products || [])[0];
    expect(product).toBeTruthy();
    return product;
  }

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'byflow-pos-test-'));
    process.env.DATA_PATH = tempDir;
    jest.resetModules();

    const express = require('express');
    dbModule = require('../pos/database');
    const { registerRoutes } = require('../pos/routes');

    await dbModule.ensureDbReady();

    const app = express();
    registerRoutes(app);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = 'http://127.0.0.1:' + server.address().port;
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.DATA_PATH;
  });

  test('creates orders using the authenticated employee when waiter_id is omitted', async () => {
    const session = await login('3333');
    const table = await getFreeTable(session.token);

    const create = await requestJson('/pos/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ table_id: table.id })
    });

    expect(create.body.ok).toBe(true);
    expect(create.body.order_id).toBeGreaterThan(0);

    const order = await requestJson('/pos/orders/' + create.body.order_id, {
      headers: { Authorization: 'Bearer ' + session.token }
    });

    expect(order.body.ok).toBe(true);
    expect(order.body.order.waiter_id).toBe(session.employee.id);
    expect(order.body.order.table_id).toBe(table.id);
  });

  test('cancelled items recalculate totals and allow empty orders to be voided', async () => {
    const mesero = await login('3333');
    const capitan = await login('2222');
    const table = await getFreeTable(mesero.token);
    const product = await getFirstProduct(mesero.token);

    const create = await requestJson('/pos/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mesero.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ table_id: table.id })
    });
    const orderId = create.body.order_id;

    const addItem = await requestJson('/pos/orders/' + orderId + '/items', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mesero.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product_id: product.id, quantity: 1 })
    });

    expect(addItem.body.ok).toBe(true);
    expect(addItem.body.item_id).toBeGreaterThan(0);

    const cancelItem = await requestJson('/pos/order-items/' + addItem.body.item_id + '/status', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + capitan.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'cancelado', cancel_reason: 'Test cleanup' })
    });

    expect(cancelItem.body.ok).toBe(true);
    expect(cancelItem.body.order.subtotal).toBe(0);
    expect(cancelItem.body.order.total).toBe(0);

    const orderAfterCancel = await requestJson('/pos/orders/' + orderId, {
      headers: { Authorization: 'Bearer ' + capitan.token }
    });

    expect(orderAfterCancel.body.ok).toBe(true);
    expect(orderAfterCancel.body.items).toHaveLength(0);
    expect(orderAfterCancel.body.order.subtotal).toBe(0);

    const deleteOrder = await requestJson('/pos/orders/' + orderId, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + capitan.token }
    });

    expect(deleteOrder.body.ok).toBe(true);

    const tablesAfterDelete = await requestJson('/pos/tables', {
      headers: { Authorization: 'Bearer ' + capitan.token }
    });
    const freedTable = (tablesAfterDelete.body.tables || []).find((item) => item.id === table.id);
    expect(freedTable.status).toBe('libre');
    expect(freedTable.current_order_id).toBeNull();
  });

  test('payments keep amount and tip separated while calculating change from the full due total', async () => {
    const mesero = await login('3333');
    const cajero = await login('9999');
    const table = await getFreeTable(mesero.token);
    const product = await getFirstProduct(mesero.token);

    const create = await requestJson('/pos/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mesero.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ table_id: table.id })
    });
    const orderId = create.body.order_id;

    const addItem = await requestJson('/pos/orders/' + orderId + '/items', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mesero.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product_id: product.id, quantity: 1 })
    });
    expect(addItem.body.ok).toBe(true);

    const orderSnapshot = await requestJson('/pos/orders/' + orderId, {
      headers: { Authorization: 'Bearer ' + cajero.token }
    });

    const currentOrder = orderSnapshot.body.order;
    const payment = await requestJson('/pos/payments', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cajero.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: orderId,
        method: 'efectivo',
        subtotal: currentOrder.subtotal,
        discount: 0,
        tax: currentOrder.tax,
        amount: currentOrder.total,
        tip: 20,
        cash_received: currentOrder.total + 30
      })
    });

    expect(payment.body.ok).toBe(true);
    expect(payment.body.change).toBe(10);

    const db = dbModule.getDb();
    const storedPayment = db.prepare(
      'SELECT amount, tip, change_given FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1'
    ).get(orderId);
    const storedOrder = db.prepare(
      'SELECT status, total, tip, discount FROM orders WHERE id = ?'
    ).get(orderId);

    expect(storedPayment.amount).toBeCloseTo(currentOrder.total, 5);
    expect(storedPayment.tip).toBeCloseTo(20, 5);
    expect(storedPayment.change_given).toBeCloseTo(10, 5);
    expect(storedOrder.status).toBe('pagada');
    expect(storedOrder.total).toBeCloseTo(currentOrder.total, 5);
    expect(storedOrder.tip).toBeCloseTo(20, 5);
  });

  test('login responses include role-aware sidebar and permissions', async () => {
    const mesero = await login('3333');
    const cajero = await login('9999');

    expect(mesero.sidebar.map((item) => item.id)).toEqual(expect.arrayContaining(['mis-mesas', 'comandas', 'karaoke']));
    expect(mesero.sidebar.map((item) => item.id)).not.toContain('empleados');
    expect(mesero.permissions).toEqual(expect.arrayContaining(['tables_own', 'orders_own']));

    expect(cajero.sidebar.map((item) => item.id)).toEqual(expect.arrayContaining(['mesas', 'comandas', 'cobrar', 'corte', 'cfdi']));
    expect(cajero.permissions).toEqual(expect.arrayContaining(['payments', 'corte_own', 'cfdi']));
  });

  test('public products endpoint strips sensitive fields for anonymous menu usage', async () => {
    const { status, body } = await requestJson('/pos/products');

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products[0]).not.toHaveProperty('cost');
    expect(body.products[0]).not.toHaveProperty('stock');
  });

  test('mesero cannot access employee management or cancel full orders directly', async () => {
    const mesero = await login('3333');

    const employees = await requestJson('/pos/employees', {
      headers: { Authorization: 'Bearer ' + mesero.token }
    });
    expect(employees.status).toBe(403);

    const deleteOrder = await requestJson('/pos/orders/99999', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + mesero.token }
    });
    expect(deleteOrder.status).toBe(403);
  });

  test('non-config roles only receive safe settings keys', async () => {
    const db = dbModule.getDb();
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES ('youtube_api_key', 'SECRET_KEY', 'default')").run();
    db.prepare("INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES ('tax_rate', '0.16', 'default')").run();

    const cajero = await login('9999');
    const settings = await requestJson('/pos/settings', {
      headers: { Authorization: 'Bearer ' + cajero.token }
    });

    expect(settings.status).toBe(200);
    expect(settings.body.ok).toBe(true);
    expect(settings.body.settings.tax_rate).toBe('0.16');
    expect(settings.body.settings.youtube_api_key).toBeUndefined();
  });
});

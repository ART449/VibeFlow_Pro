/**
 * ByFlow POS — API Routes (HARDENED + MULTI-TENANT)
 * Auth middleware, input validation, SQL injection prevention, transactions
 * All queries scoped by bar_id for complete tenant isolation
 */

const express = require('express');
const { getDb } = require('./database');
const auth = require('./auth');
const { getApiUsage } = require('./api-limiter');

// ═══ INPUT VALIDATION HELPERS ═══
const VALID_TABLE_STATUS = ['libre', 'ocupada', 'cantando', 'reservada', 'cuenta', 'tab'];
const VALID_ORDER_STATUS = ['abierta', 'cerrada', 'cancelada', 'pagada'];
const VALID_ITEM_STATUS = ['pendiente', 'enviado', 'preparando', 'listo', 'entregado', 'cancelado'];
const VALID_PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'mixto'];
const VALID_COVER_TYPES = ['general', 'vip', 'cortesia', 'lista'];

// Allowed settings keys (whitelist)
const ALLOWED_SETTINGS = [
  'bar_name', 'tax_rate', 'tip_suggested', 'cover_general', 'cover_vip',
  'cover_includes', 'max_capacity', 'cfdi_rfc', 'cfdi_razon_social',
  'whatsapp', 'email_contacto', 'instagram', 'facebook',
  'youtube_api_key', 'jamendo_client_id',
  'api_daily_limit', 'api_calls_today', 'api_limit_action'
];

function sanitize(str, maxLen) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim().slice(0, maxLen || 500);
}

function isPositiveInt(val) {
  return Number.isInteger(val) && val > 0;
}

function isPositiveNum(val) {
  return typeof val === 'number' && val > 0 && isFinite(val);
}

/**
 * Get the bar_id from the request. Priority: session token > X-Bar-ID header > 'default'
 */
function getBarId(req) {
  return req.barId || 'default';
}

function registerRoutes(app) {
  const posJson = express.json({ limit: '1mb' });

  // ═══ AUTH MIDDLEWARE — applied to all /pos/ routes ═══
  app.use('/pos', auth.authMiddleware);

  // ═══ AUTH ROUTES (no middleware needed, handled inside authMiddleware) ═══
  app.post('/pos/auth/login', posJson, (req, res) => {
    const { pin, bar_id } = req.body || {};
    if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return res.json({ ok: false, error: 'PIN debe tener 4-6 digitos numericos' });
    }
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    // bar_id comes from the login request body (set by pos.html after owner auth)
    const effectiveBarId = (typeof bar_id === 'string' && bar_id) ? bar_id : (req.headers['x-bar-id'] || 'default');
    const result = auth.authenticate(pin, ip, effectiveBarId);

    if (!result) {
      return res.json({ ok: false, error: 'PIN incorrecto' });
    }
    if (result.error) {
      return res.status(429).json({ ok: false, error: result.error });
    }

    res.json({
      ok: true,
      employee: {
        id: result.id,
        name: result.name,
        role: result.role,
        area: result.area,
        avatar: result.avatar,
        bar_id: result.bar_id
      },
      token: result.token,
      bar_id: result.bar_id,
      defaultView: auth.getDefaultView(result.role),
      sidebar: auth.getSidebarForRole(result.role)
    });
  });

  // ═══ FIRST-TIME OWNER SETUP (unauthenticated — only works for empty bars) ═══
  app.post('/pos/auth/setup-owner', posJson, (req, res) => {
    const db = getDb();
    const { name, pin, bar_id, email } = req.body || {};

    if (!name || !pin || !bar_id) {
      return res.json({ ok: false, error: 'name, pin y bar_id requeridos' });
    }
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return res.json({ ok: false, error: 'PIN debe ser 4-6 digitos' });
    }

    // SECURITY: Only allow if no employees exist for this bar_id
    const existing = db.prepare('SELECT COUNT(*) as c FROM employees WHERE bar_id = ?').get(bar_id);
    if (existing && existing.c > 0) {
      return res.json({ ok: false, error: 'Este bar ya tiene empleados configurados' });
    }

    const hashedPin = auth.hashPin(pin);
    const result = db.prepare(
      'INSERT INTO employees (name, pin, role, role_level, area, avatar, bar_id) VALUES (?,?,?,?,?,?,?)'
    ).run(sanitize(name, 100), hashedPin, 'dueno', 0, 'todos', '', bar_id);

    // Seed default settings for this bar
    const seedSettings = [
      ['bar_name', 'Mi Bar'], ['tax_rate', '0.16'], ['tip_suggested', '0.15'],
      ['cover_general', '150'], ['cover_vip', '250'], ['max_capacity', '120'],
      ['api_daily_limit', '500'], ['api_calls_today', '0'], ['api_limit_action', 'block']
    ];
    const stmtSetting = db.prepare('INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES (?,?,?)');
    db.transaction(() => {
      for (const [k, v] of seedSettings) stmtSetting.run(k, v, bar_id);
    })();

    // Seed default tables
    const stmtTable = db.prepare('INSERT INTO tables (number, area, capacity, bar_id) VALUES (?,?,?,?)');
    const defaultTables = [
      ['1', 'salon', 4], ['2', 'salon', 6], ['3', 'salon', 4], ['4', 'salon', 8],
      ['B1', 'barra', 2], ['B2', 'barra', 2],
      ['T1', 'terraza', 4], ['T2', 'terraza', 6],
      ['V1', 'vip', 8]
    ];
    db.transaction(() => {
      for (const [num, area, cap] of defaultTables) stmtTable.run(num, area, cap, bar_id);
    })();

    // Seed default categories
    const stmtCat = db.prepare('INSERT INTO categories (name, icon, sort_order, bar_id) VALUES (?,?,?,?)');
    const defaultCats = [
      ['Cervezas', '', 1], ['Cocktails', '', 2], ['Shots', '', 3],
      ['Botanas', '', 4], ['Comida', '', 5], ['Refrescos', '', 6], ['Cafe', '', 7]
    ];
    db.transaction(() => {
      for (const [n, i, s] of defaultCats) stmtCat.run(n, i, s, bar_id);
    })();

    console.log(`[POS] New bar setup: ${bar_id} (owner: ${name}, email: ${email || 'N/A'})`);
    res.json({ ok: true, employee_id: result.lastInsertRowid, bar_id });
  });

  app.post('/pos/auth/authorize', posJson, (req, res) => {
    const { action, supervisorPin, requesterId } = req.body || {};
    if (!action || !supervisorPin) {
      return res.json({ ok: false, error: 'Accion y PIN requeridos' });
    }
    const result = auth.authorizeAction(
      sanitize(action, 50),
      supervisorPin,
      parseInt(requesterId) || 0,
      getBarId(req)
    );
    res.json(result);
  });

  // ═══ TABLES ═══
  app.get('/pos/tables', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const tables = db.prepare(`
      SELECT t.*, e.name as waiter_name,
        (SELECT COUNT(*) FROM karaoke_queue kq WHERE kq.table_id = t.id AND kq.status IN ('espera','cantando') AND kq.bar_id = ?) as karaoke_count
      FROM tables t
      LEFT JOIN employees e ON t.waiter_id = e.id
      WHERE t.bar_id = ?
      ORDER BY t.area, t.number
    `).all(barId, barId);
    res.json({ ok: true, tables });
  });

  app.put('/pos/tables/:id/status', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const tableId = parseInt(req.params.id);
    if (!isPositiveInt(tableId)) return res.json({ ok: false, error: 'ID invalido' });

    const { status, waiter_id, guests } = req.body || {};

    // Validate status against whitelist
    if (status && !VALID_TABLE_STATUS.includes(status)) {
      return res.json({ ok: false, error: 'Status invalido: ' + status });
    }

    // Build parameterized update safely (no string concat for column values)
    const setClauses = [];
    const params = [];

    if (status) { setClauses.push('status = ?'); params.push(status); }
    if (waiter_id !== undefined) {
      const wid = parseInt(waiter_id);
      if (wid > 0 || waiter_id === null) { setClauses.push('waiter_id = ?'); params.push(waiter_id === null ? null : wid); }
    }
    if (guests !== undefined) {
      const g = parseInt(guests);
      if (g >= 0) { setClauses.push('guests = ?'); params.push(g); }
    }
    if (status === 'ocupada' || status === 'tab') {
      setClauses.push("opened_at = datetime('now')");
    }
    if (status === 'libre') {
      setClauses.push('opened_at = NULL');
      setClauses.push('waiter_id = NULL');
      setClauses.push('guests = 0');
      setClauses.push('current_order_id = NULL');
    }

    if (setClauses.length === 0) return res.json({ ok: false, error: 'Nada que actualizar' });

    params.push(tableId, barId);
    db.prepare(`UPDATE tables SET ${setClauses.join(', ')} WHERE id = ? AND bar_id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ═══ CATEGORIES ═══
  app.get('/pos/categories', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const categories = db.prepare('SELECT * FROM categories WHERE active = 1 AND bar_id = ? ORDER BY sort_order').all(barId);
    res.json({ ok: true, categories });
  });

  // ═══ PRODUCTS ═══
  app.get('/pos/products', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { category_id } = req.query;
    let query = 'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.active = 1 AND p.bar_id = ?';
    const params = [barId];
    if (category_id) {
      const cid = parseInt(category_id);
      if (isPositiveInt(cid)) { query += ' AND p.category_id = ?'; params.push(cid); }
    }
    query += ' ORDER BY c.sort_order, p.name';
    const products = db.prepare(query).all(...params);
    res.json({ ok: true, products });
  });

  // CREATE product
  app.post('/pos/products', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { name, category_id, price, cost, icon, stock, happy_hour, hh_discount } = req.body || {};
    if (!name || !price) return res.json({ ok: false, error: 'Nombre y precio requeridos' });

    const result = db.prepare(
      'INSERT INTO products (name, category_id, price, cost, icon, stock, happy_hour, hh_discount, bar_id) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run(
      sanitize(name, 100),
      parseInt(category_id) || 1,
      parseFloat(price) || 0,
      parseFloat(cost) || 0,
      sanitize(icon, 10),
      parseInt(stock) ?? -1,
      happy_hour ? 1 : 0,
      parseFloat(hh_discount) || 0.5,
      barId
    );
    res.json({ ok: true, product_id: result.lastInsertRowid });
  });

  app.put('/pos/products/:id', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const productId = parseInt(req.params.id);
    if (!isPositiveInt(productId)) return res.json({ ok: false, error: 'ID invalido' });

    const { name, price, cost, stock, active } = req.body || {};

    // Safe parameterized update with validated fields only
    const setClauses = [];
    const params = [];
    if (name !== undefined) { setClauses.push('name = ?'); params.push(sanitize(name, 100)); }
    if (price !== undefined) { const p = parseFloat(price); if (p >= 0) { setClauses.push('price = ?'); params.push(p); } }
    if (cost !== undefined) { const c = parseFloat(cost); if (c >= 0) { setClauses.push('cost = ?'); params.push(c); } }
    if (stock !== undefined) { setClauses.push('stock = ?'); params.push(parseInt(stock)); }
    if (active !== undefined) { setClauses.push('active = ?'); params.push(active ? 1 : 0); }

    if (setClauses.length === 0) return res.json({ ok: false, error: 'Nada que actualizar' });
    params.push(productId, barId);
    db.prepare(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ? AND bar_id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ═══ ORDERS ═══
  app.post('/pos/orders', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { table_id, waiter_id, guests } = req.body || {};
    const tid = parseInt(table_id);
    const wid = parseInt(waiter_id);
    if (!isPositiveInt(tid) || !isPositiveInt(wid)) {
      return res.json({ ok: false, error: 'table_id y waiter_id requeridos' });
    }

    // TRANSACTION: atomic order creation + table update
    const createOrder = db.transaction(() => {
      // Check table is libre first (scoped by bar_id)
      const table = db.prepare('SELECT status FROM tables WHERE id = ? AND bar_id = ?').get(tid, barId);
      if (table && table.status !== 'libre' && table.status !== 'tab') {
        return { ok: false, error: 'Mesa no esta libre (status: ' + table.status + ')' };
      }
      const result = db.prepare(
        'INSERT INTO orders (table_id, waiter_id, guests, bar_id) VALUES (?, ?, ?, ?)'
      ).run(tid, wid, parseInt(guests) || 1, barId);

      db.prepare(
        "UPDATE tables SET status = 'ocupada', current_order_id = ?, waiter_id = ?, guests = ?, opened_at = datetime('now') WHERE id = ? AND bar_id = ?"
      ).run(result.lastInsertRowid, wid, parseInt(guests) || 1, tid, barId);

      return { ok: true, order_id: result.lastInsertRowid };
    });

    res.json(createOrder());
  });

  app.get('/pos/orders/:id', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const orderId = parseInt(req.params.id);
    if (!isPositiveInt(orderId)) return res.json({ ok: false, error: 'ID invalido' });

    const order = db.prepare(`
      SELECT o.*, t.number as table_number, e.name as waiter_name
      FROM orders o JOIN tables t ON o.table_id = t.id JOIN employees e ON o.waiter_id = e.id
      WHERE o.id = ? AND o.bar_id = ?
    `).get(orderId, barId);
    if (!order) return res.json({ ok: false, error: 'Orden no encontrada' });

    const items = db.prepare(`
      SELECT oi.*, p.name as product_name, p.icon as product_icon
      FROM order_items oi JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ? ORDER BY oi.created_at
    `).all(orderId);
    res.json({ ok: true, order, items });
  });

  app.get('/pos/orders/table/:tableId', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const tableId = parseInt(req.params.tableId);
    if (!isPositiveInt(tableId)) return res.json({ ok: true, order: null, items: [] });

    const order = db.prepare(`
      SELECT o.*, t.number as table_number, e.name as waiter_name
      FROM orders o JOIN tables t ON o.table_id = t.id JOIN employees e ON o.waiter_id = e.id
      WHERE o.table_id = ? AND o.status = 'abierta' AND o.bar_id = ? ORDER BY o.created_at DESC LIMIT 1
    `).get(tableId, barId);
    if (!order) return res.json({ ok: true, order: null, items: [] });

    const items = db.prepare(`
      SELECT oi.*, p.name as product_name, p.icon as product_icon
      FROM order_items oi JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ? AND oi.status != 'cancelado' ORDER BY oi.created_at
    `).all(order.id);
    res.json({ ok: true, order, items });
  });

  // ═══ ORDER ITEMS ═══
  app.post('/pos/orders/:orderId/items', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const orderId = parseInt(req.params.orderId);
    const { product_id, quantity, notes } = req.body || {};
    const pid = parseInt(product_id);
    const qty = parseInt(quantity) || 1;

    if (!isPositiveInt(orderId) || !isPositiveInt(pid)) {
      return res.json({ ok: false, error: 'order_id y product_id requeridos' });
    }
    if (qty < 1 || qty > 100) return res.json({ ok: false, error: 'Cantidad invalida' });

    // Verify order belongs to this bar
    const order = db.prepare('SELECT id FROM orders WHERE id = ? AND bar_id = ?').get(orderId, barId);
    if (!order) return res.json({ ok: false, error: 'Orden no encontrada' });

    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1 AND bar_id = ?').get(pid, barId);
    if (!product) return res.json({ ok: false, error: 'Producto no encontrado o inactivo' });

    // TRANSACTION: add item + update stock + recalc order
    const addItem = db.transaction(() => {
      const total = product.price * qty;
      const result = db.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price, total, notes) VALUES (?,?,?,?,?,?)'
      ).run(orderId, pid, qty, product.price, total, sanitize(notes, 200));

      // Decrease stock atomically
      if (product.stock > 0) {
        db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? AND bar_id = ?').run(qty, pid, barId);
      }

      // Recalc order
      recalcOrder(db, orderId, barId);

      return { ok: true, item_id: result.lastInsertRowid, total };
    });

    res.json(addItem());
  });

  app.put('/pos/order-items/:id/status', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const itemId = parseInt(req.params.id);
    const { status } = req.body || {};

    if (!isPositiveInt(itemId)) return res.json({ ok: false, error: 'ID invalido' });
    if (!status || !VALID_ITEM_STATUS.includes(status)) {
      return res.json({ ok: false, error: 'Status invalido' });
    }

    // Verify item belongs to an order in this bar
    const item = db.prepare(`
      SELECT oi.id FROM order_items oi JOIN orders o ON oi.order_id = o.id
      WHERE oi.id = ? AND o.bar_id = ?
    `).get(itemId, barId);
    if (!item) return res.json({ ok: false, error: 'Item no encontrado' });

    const setClauses = ['status = ?'];
    const params = [status];
    if (status === 'enviado') setClauses.push("sent_at = datetime('now')");
    if (status === 'listo') setClauses.push("ready_at = datetime('now')");
    params.push(itemId);

    db.prepare(`UPDATE order_items SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ═══ PAYMENTS ═══
  app.post('/pos/payments', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { order_id, method, amount, cash_received, tip, cashier_id } = req.body || {};
    const oid = parseInt(order_id);
    const cid = parseInt(cashier_id);

    if (!isPositiveInt(oid) || !isPositiveInt(cid)) {
      return res.json({ ok: false, error: 'order_id y cashier_id requeridos' });
    }
    if (!method || !VALID_PAYMENT_METHODS.includes(method)) {
      return res.json({ ok: false, error: 'Metodo de pago invalido' });
    }
    const amt = parseFloat(amount);
    if (!isPositiveNum(amt)) return res.json({ ok: false, error: 'Monto invalido' });

    const cashRcv = parseFloat(cash_received) || 0;
    const tipAmt = parseFloat(tip) || 0;
    const change = Math.max(0, cashRcv - amt);

    // TRANSACTION: payment + close order + free table (atomic)
    const processPayment = db.transaction(() => {
      const order = db.prepare('SELECT table_id, status FROM orders WHERE id = ? AND bar_id = ?').get(oid, barId);
      if (!order) return { ok: false, error: 'Orden no encontrada' };
      if (order.status === 'pagada') return { ok: false, error: 'Orden ya fue pagada' };

      const result = db.prepare(
        'INSERT INTO payments (order_id, method, amount, cash_received, change_given, tip, cashier_id, bar_id) VALUES (?,?,?,?,?,?,?,?)'
      ).run(oid, method, amt, cashRcv, change, tipAmt, cid, barId);

      db.prepare("UPDATE orders SET status = 'pagada', closed_at = datetime('now'), tip = ? WHERE id = ? AND bar_id = ?").run(tipAmt, oid, barId);

      db.prepare(
        "UPDATE tables SET status = 'libre', current_order_id = NULL, waiter_id = NULL, guests = 0, opened_at = NULL WHERE id = ? AND bar_id = ?"
      ).run(order.table_id, barId);

      return { ok: true, payment_id: result.lastInsertRowid, change };
    });

    res.json(processPayment());
  });

  // ═══ KITCHEN / BAR MONITOR ═══
  app.get('/pos/kitchen', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const items = db.prepare(`
      SELECT oi.*, o.table_id, t.number as table_number, t.guests,
        p.name as product_name, p.icon as product_icon, c.name as category_name,
        e.name as waiter_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id JOIN tables t ON o.table_id = t.id
      JOIN products p ON oi.product_id = p.id JOIN categories c ON p.category_id = c.id
      JOIN employees e ON o.waiter_id = e.id
      WHERE oi.status IN ('enviado', 'preparando') AND o.status = 'abierta' AND o.bar_id = ?
      ORDER BY oi.sent_at ASC
    `).all(barId);
    res.json({ ok: true, items });
  });

  // ═══ COVERS ═══
  app.post('/pos/covers', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { type, guests, amount, security_id, notes } = req.body || {};

    if (type && !VALID_COVER_TYPES.includes(type)) {
      return res.json({ ok: false, error: 'Tipo de cover invalido' });
    }
    const g = parseInt(guests) || 1;
    if (g < 1 || g > 50) return res.json({ ok: false, error: 'Numero de personas invalido' });

    const result = db.prepare(
      'INSERT INTO covers (type, guests, amount, security_id, notes, bar_id) VALUES (?,?,?,?,?,?)'
    ).run(type || 'general', g, parseFloat(amount) || 0, parseInt(security_id) || null, sanitize(notes, 200), barId);
    res.json({ ok: true, cover_id: result.lastInsertRowid });
  });

  app.get('/pos/covers/today', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const covers = db.prepare(`
      SELECT c.*, e.name as security_name FROM covers c
      LEFT JOIN employees e ON c.security_id = e.id
      WHERE date(c.created_at) = date('now') AND c.bar_id = ? ORDER BY c.created_at DESC
    `).all(barId);
    const totals = db.prepare(`
      SELECT SUM(guests) as total_guests, SUM(amount) as total_amount, COUNT(*) as total_entries
      FROM covers WHERE date(created_at) = date('now') AND bar_id = ?
    `).get(barId);
    res.json({ ok: true, covers, totals });
  });

  // ═══ KARAOKE QUEUE ═══
  app.get('/pos/karaoke/queue', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { table_id } = req.query;
    let query = `SELECT kq.*, t.number as table_number FROM karaoke_queue kq
      LEFT JOIN tables t ON kq.table_id = t.id WHERE kq.status IN ('espera', 'cantando') AND kq.bar_id = ?`;
    const params = [barId];
    if (table_id) { const tid = parseInt(table_id); if (tid > 0) { query += ' AND kq.table_id = ?'; params.push(tid); } }
    query += ' ORDER BY kq.position ASC';
    res.json({ ok: true, queue: db.prepare(query).all(...params) });
  });

  app.post('/pos/karaoke/queue', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { table_id, song_title, singer_name } = req.body || {};
    if (!song_title) return res.json({ ok: false, error: 'Titulo de cancion requerido' });

    const maxPos = db.prepare("SELECT MAX(position) as m FROM karaoke_queue WHERE status = 'espera' AND bar_id = ?").get(barId).m || 0;
    const result = db.prepare(
      'INSERT INTO karaoke_queue (table_id, song_title, singer_name, position, bar_id) VALUES (?,?,?,?,?)'
    ).run(parseInt(table_id) || null, sanitize(song_title, 200), sanitize(singer_name, 100), maxPos + 1, barId);
    res.json({ ok: true, id: result.lastInsertRowid, position: maxPos + 1 });
  });

  // ═══ EMPLOYEES ═══
  app.get('/pos/employees', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const employees = db.prepare(
      'SELECT id, name, role, role_level, active, area, avatar, last_login FROM employees WHERE bar_id = ? ORDER BY role_level, name'
    ).all(barId);
    res.json({ ok: true, employees });
  });

  // CREATE employee
  app.post('/pos/employees', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { name, pin, role, area, avatar } = req.body || {};
    if (!name || !pin || !role) return res.json({ ok: false, error: 'Nombre, PIN y rol requeridos' });
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return res.json({ ok: false, error: 'PIN debe ser 4-6 digitos numericos' });
    }
    if (!auth.VALID_ROLES.includes(role)) {
      return res.json({ ok: false, error: 'Rol invalido: ' + role });
    }

    const roleLevel = auth.ROLE_LEVELS[role];
    const hashedPin = auth.hashPin(pin);

    // Validate PIN unique within this bar — two bars can share PINs
    const allEmps = db.prepare('SELECT id, name, pin FROM employees WHERE active = 1 AND bar_id = ?').all(barId);
    for (const emp of allEmps) {
      if (auth.verifyPin(pin, emp.pin)) {
        return res.json({ ok: false, error: 'Ese PIN ya esta en uso por otro empleado. Elige uno diferente.' });
      }
    }

    const result = db.prepare(
      'INSERT INTO employees (name, pin, role, role_level, area, avatar, bar_id) VALUES (?,?,?,?,?,?,?)'
    ).run(sanitize(name, 100), hashedPin, role, roleLevel, sanitize(area, 50) || 'salon', sanitize(avatar, 10) || '', barId);

    res.json({ ok: true, employee_id: result.lastInsertRowid });
  });

  // CREATE table
  app.post('/pos/tables', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const { number, area, capacity } = req.body || {};
    if (!number) return res.json({ ok: false, error: 'Numero de mesa requerido' });

    const validAreas = ['salon', 'terraza', 'barra', 'vip'];
    const a = validAreas.includes(area) ? area : 'salon';

    const result = db.prepare(
      'INSERT INTO tables (number, area, capacity, bar_id) VALUES (?,?,?,?)'
    ).run(sanitize(number, 10), a, parseInt(capacity) || 4, barId);
    res.json({ ok: true, table_id: result.lastInsertRowid });
  });

  // ═══ INVENTORY ═══
  app.get('/pos/inventory', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const products = db.prepare(`
      SELECT p.*, c.name as category_name,
        CASE WHEN p.stock = -1 THEN 'unlimited'
          WHEN p.stock <= p.min_stock * 0.3 THEN 'critical'
          WHEN p.stock <= p.min_stock THEN 'low'
          WHEN p.stock <= p.min_stock * 2 THEN 'medium'
          ELSE 'ok' END as stock_status,
        CASE WHEN p.cost > 0 THEN ROUND((1 - p.cost / p.price) * 100, 1) ELSE 0 END as margin
      FROM products p JOIN categories c ON p.category_id = c.id WHERE p.active = 1 AND p.bar_id = ?
      ORDER BY CASE WHEN p.stock > 0 AND p.stock <= p.min_stock THEN 0 ELSE 1 END, c.sort_order, p.name
    `).all(barId);
    res.json({ ok: true, products });
  });

  // ═══ REPORTS ═══
  app.get('/pos/reports/today', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const sales = db.prepare(`
      SELECT COUNT(*) as total_orders, COALESCE(SUM(total),0) as total_sales,
        COALESCE(AVG(total),0) as avg_ticket, COALESCE(SUM(tip),0) as total_tips,
        COALESCE(SUM(discount),0) as total_discounts
      FROM orders WHERE date(created_at) = date('now') AND status = 'pagada' AND bar_id = ?
    `).get(barId);

    const byHour = db.prepare(`
      SELECT strftime('%H', created_at) as hour, SUM(total) as sales, COUNT(*) as orders
      FROM orders WHERE date(created_at) = date('now') AND status = 'pagada' AND bar_id = ?
      GROUP BY hour ORDER BY hour
    `).all(barId);

    const topProducts = db.prepare(`
      SELECT p.name, p.icon, SUM(oi.quantity) as qty, SUM(oi.total) as revenue
      FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) = date('now') AND o.status = 'pagada' AND o.bar_id = ?
      GROUP BY p.id ORDER BY revenue DESC LIMIT 10
    `).all(barId);

    const topKaraoke = db.prepare(`
      SELECT song_title, COUNT(*) as times_sung FROM karaoke_queue
      WHERE date(created_at) = date('now') AND status = 'completada' AND bar_id = ?
      GROUP BY song_title ORDER BY times_sung DESC LIMIT 10
    `).all(barId);

    const byEmployee = db.prepare(`
      SELECT e.name, e.role, e.avatar, COUNT(o.id) as orders_count,
        COALESCE(SUM(o.total),0) as total_sales, COALESCE(SUM(o.tip),0) as total_tips
      FROM orders o JOIN employees e ON o.waiter_id = e.id
      WHERE date(o.created_at) = date('now') AND o.status = 'pagada' AND o.bar_id = ?
      GROUP BY e.id ORDER BY total_sales DESC
    `).all(barId);

    res.json({ ok: true, sales, byHour, topProducts, topKaraoke, byEmployee });
  });

  // ═══ SETTINGS (whitelist enforced, scoped by bar_id) ═══
  app.get('/pos/settings', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const rows = db.prepare('SELECT * FROM bar_settings WHERE bar_id = ?').all(barId);
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({ ok: true, settings });
  });

  app.put('/pos/settings', posJson, (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    // bar_settings has composite PK (key, bar_id) — INSERT OR REPLACE works correctly
    const stmt = db.prepare('INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES (?, ?, ?)');

    // WHITELIST: only allowed keys can be written
    const entries = Object.entries(req.body || {}).filter(([k]) => ALLOWED_SETTINGS.includes(k));
    if (entries.length === 0) return res.json({ ok: false, error: 'Ninguna clave valida' });

    const update = db.transaction((items) => {
      for (const [k, v] of items) stmt.run(k, sanitize(String(v), 500), barId);
    });
    update(entries);
    res.json({ ok: true, updated: entries.length });
  });

  // ═══ HAPPY HOUR STATUS ═══
  app.get('/pos/happy-hour/active', (req, res) => {
    const db = getDb();
    const barId = getBarId(req);
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const dayOfWeek = String(now.getDay());

    const active = db.prepare(`
      SELECT * FROM happy_hours WHERE active = 1 AND bar_id = ?
      AND (day_of_week = '*' OR day_of_week = ?)
      AND start_time <= ? AND end_time > ?
    `).all(barId, dayOfWeek, currentTime, currentTime);

    res.json({ ok: true, active, is_happy_hour: active.length > 0 });
  });

  // ═══ API USAGE / SPENDING BRAKE ═══
  app.get('/pos/api-usage', (req, res) => {
    const usage = getApiUsage();
    res.json({ ok: true, usage });
  });

  console.log('[POS] API routes registered (HARDENED + MULTI-TENANT): /pos/*');
}

// Helper: recalculate order totals (scoped by bar_id for settings lookup)
function recalcOrder(db, orderId, barId) {
  const subtotal = db.prepare(
    "SELECT COALESCE(SUM(total),0) as s FROM order_items WHERE order_id = ? AND status != 'cancelado'"
  ).get(orderId).s;

  const effectiveBarId = barId || 'default';
  const taxRow = db.prepare("SELECT value FROM bar_settings WHERE key = 'tax_rate' AND bar_id = ?").get(effectiveBarId);
  const taxRate = parseFloat(taxRow?.value || '0.16');
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + tax;

  db.prepare('UPDATE orders SET subtotal = ?, tax = ?, total = ? WHERE id = ?').run(subtotal, tax, total, orderId);
}

module.exports = { registerRoutes };

/**
 * ByFlow POS — API Routes
 * All REST endpoints for the POS system
 */

const express = require('express');
const { getDb } = require('./database');
const auth = require('./auth');

function registerRoutes(app) {

  // POS routes need their own JSON parser to ensure body is parsed
  const posJson = express.json({ limit: '1mb' });

  // ═══ AUTH ═══
  app.post('/pos/auth/login', posJson, (req, res) => {
    const { pin } = req.body;
    if (!pin || pin.length < 4) {
      return res.json({ ok: false, error: 'PIN debe tener al menos 4 digitos' });
    }
    const employee = auth.authenticate(pin);
    if (!employee) {
      return res.json({ ok: false, error: 'PIN invalido o cuenta desactivada' });
    }
    res.json({
      ok: true,
      employee,
      defaultView: auth.getDefaultView(employee.role),
      sidebar: auth.getSidebarForRole(employee.role)
    });
  });

  app.post('/pos/auth/authorize', posJson, (req, res) => {
    const { action, supervisorPin, requesterId } = req.body;
    const result = auth.authorizeAction(action, supervisorPin, requesterId);
    res.json(result);
  });

  // ═══ TABLES ═══
  app.get('/pos/tables', (req, res) => {
    const db = getDb();
    const tables = db.prepare(`
      SELECT t.*, e.name as waiter_name,
        (SELECT COUNT(*) FROM karaoke_queue kq WHERE kq.table_id = t.id AND kq.status IN ('espera','cantando')) as karaoke_count
      FROM tables t
      LEFT JOIN employees e ON t.waiter_id = e.id
      ORDER BY t.area, t.number
    `).all();
    res.json({ ok: true, tables });
  });

  app.put('/pos/tables/:id/status', posJson, (req, res) => {
    const db = getDb();
    const { status, waiter_id, guests } = req.body;
    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (waiter_id !== undefined) { updates.push('waiter_id = ?'); params.push(waiter_id); }
    if (guests !== undefined) { updates.push('guests = ?'); params.push(guests); }
    if (status === 'ocupada' || status === 'tab') {
      updates.push("opened_at = datetime('now')");
    } else if (status === 'libre') {
      updates.push('opened_at = NULL, waiter_id = NULL, guests = 0, current_order_id = NULL');
    }
    params.push(req.params.id);
    db.prepare(`UPDATE tables SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ═══ CATEGORIES ═══
  app.get('/pos/categories', (req, res) => {
    const db = getDb();
    const categories = db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order').all();
    res.json({ ok: true, categories });
  });

  // ═══ PRODUCTS ═══
  app.get('/pos/products', (req, res) => {
    const db = getDb();
    const { category_id } = req.query;
    let query = 'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE p.active = 1';
    const params = [];
    if (category_id) {
      query += ' AND p.category_id = ?';
      params.push(category_id);
    }
    query += ' ORDER BY c.sort_order, p.name';
    const products = db.prepare(query).all(...params);
    res.json({ ok: true, products });
  });

  app.put('/pos/products/:id', posJson, (req, res) => {
    const db = getDb();
    const { name, price, cost, stock, active } = req.body;
    const updates = [];
    const params = [];
    if (name) { updates.push('name = ?'); params.push(name); }
    if (price !== undefined) { updates.push('price = ?'); params.push(price); }
    if (cost !== undefined) { updates.push('cost = ?'); params.push(cost); }
    if (stock !== undefined) { updates.push('stock = ?'); params.push(stock); }
    if (active !== undefined) { updates.push('active = ?'); params.push(active); }
    if (updates.length === 0) return res.json({ ok: false, error: 'Nada que actualizar' });
    params.push(req.params.id);
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ═══ ORDERS ═══
  app.post('/pos/orders', posJson, (req, res) => {
    const db = getDb();
    const { table_id, waiter_id, guests } = req.body;
    const result = db.prepare(
      'INSERT INTO orders (table_id, waiter_id, guests) VALUES (?, ?, ?)'
    ).run(table_id, waiter_id, guests || 1);
    // Update table
    db.prepare(
      "UPDATE tables SET status = 'ocupada', current_order_id = ?, waiter_id = ?, guests = ?, opened_at = datetime('now') WHERE id = ?"
    ).run(result.lastInsertRowid, waiter_id, guests || 1, table_id);
    res.json({ ok: true, order_id: result.lastInsertRowid });
  });

  app.get('/pos/orders/:id', (req, res) => {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, t.number as table_number, e.name as waiter_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN employees e ON o.waiter_id = e.id
      WHERE o.id = ?
    `).get(req.params.id);
    if (!order) return res.json({ ok: false, error: 'Orden no encontrada' });
    const items = db.prepare(`
      SELECT oi.*, p.name as product_name, p.icon as product_icon
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
      ORDER BY oi.created_at
    `).all(req.params.id);
    res.json({ ok: true, order, items });
  });

  app.get('/pos/orders/table/:tableId', (req, res) => {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, t.number as table_number, e.name as waiter_name
      FROM orders o
      JOIN tables t ON o.table_id = t.id
      JOIN employees e ON o.waiter_id = e.id
      WHERE o.table_id = ? AND o.status = 'abierta'
      ORDER BY o.created_at DESC LIMIT 1
    `).get(req.params.tableId);
    if (!order) return res.json({ ok: true, order: null, items: [] });
    const items = db.prepare(`
      SELECT oi.*, p.name as product_name, p.icon as product_icon
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ? AND oi.status != 'cancelado'
      ORDER BY oi.created_at
    `).all(order.id);
    res.json({ ok: true, order, items });
  });

  // ═══ ORDER ITEMS ═══
  app.post('/pos/orders/:orderId/items', posJson, (req, res) => {
    const db = getDb();
    const { product_id, quantity, notes } = req.body;
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) return res.json({ ok: false, error: 'Producto no encontrado' });

    const unitPrice = product.price;
    const total = unitPrice * (quantity || 1);

    const result = db.prepare(
      'INSERT INTO order_items (order_id, product_id, quantity, unit_price, total, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.params.orderId, product_id, quantity || 1, unitPrice, total, notes || '');

    // Update order subtotal
    recalcOrder(db, req.params.orderId);

    // Decrease stock if tracked
    if (product.stock > 0) {
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock > 0').run(quantity || 1, product_id);
    }

    res.json({ ok: true, item_id: result.lastInsertRowid, total });
  });

  app.put('/pos/order-items/:id/status', posJson, (req, res) => {
    const db = getDb();
    const { status } = req.body;
    const updates = ['status = ?'];
    const params = [status];
    if (status === 'enviado') { updates.push("sent_at = datetime('now')"); }
    if (status === 'listo') { updates.push("ready_at = datetime('now')"); }
    params.push(req.params.id);
    db.prepare(`UPDATE order_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  });

  // ═══ PAYMENTS ═══
  app.post('/pos/payments', posJson, (req, res) => {
    const db = getDb();
    const { order_id, method, amount, cash_received, tip, cashier_id } = req.body;
    const change = cash_received ? cash_received - amount : 0;
    const result = db.prepare(
      'INSERT INTO payments (order_id, method, amount, cash_received, change_given, tip, cashier_id) VALUES (?,?,?,?,?,?,?)'
    ).run(order_id, method, amount, cash_received || 0, Math.max(0, change), tip || 0, cashier_id);

    // Close order
    db.prepare("UPDATE orders SET status = 'pagada', closed_at = datetime('now'), tip = ? WHERE id = ?").run(tip || 0, order_id);

    // Free table
    const order = db.prepare('SELECT table_id FROM orders WHERE id = ?').get(order_id);
    if (order) {
      db.prepare("UPDATE tables SET status = 'libre', current_order_id = NULL, waiter_id = NULL, guests = 0, opened_at = NULL WHERE id = ?").run(order.table_id);
    }

    res.json({ ok: true, payment_id: result.lastInsertRowid, change: Math.max(0, change) });
  });

  // ═══ KITCHEN / BAR MONITOR ═══
  app.get('/pos/kitchen', (req, res) => {
    const db = getDb();
    const { area } = req.query; // 'cocina' or 'barra'
    const items = db.prepare(`
      SELECT oi.*, o.table_id, t.number as table_number, t.guests,
        p.name as product_name, p.icon as product_icon, c.name as category_name,
        e.name as waiter_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN tables t ON o.table_id = t.id
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      JOIN employees e ON o.waiter_id = e.id
      WHERE oi.status IN ('enviado', 'preparando')
      AND o.status = 'abierta'
      ORDER BY oi.sent_at ASC
    `).all();
    res.json({ ok: true, items });
  });

  // ═══ COVERS ═══
  app.post('/pos/covers', posJson, (req, res) => {
    const db = getDb();
    const { type, guests, amount, security_id, notes } = req.body;
    const result = db.prepare(
      'INSERT INTO covers (type, guests, amount, security_id, notes) VALUES (?,?,?,?,?)'
    ).run(type || 'general', guests || 1, amount || 0, security_id, notes || '');
    res.json({ ok: true, cover_id: result.lastInsertRowid });
  });

  app.get('/pos/covers/today', (req, res) => {
    const db = getDb();
    const covers = db.prepare(`
      SELECT c.*, e.name as security_name
      FROM covers c
      LEFT JOIN employees e ON c.security_id = e.id
      WHERE date(c.created_at) = date('now')
      ORDER BY c.created_at DESC
    `).all();
    const totals = db.prepare(`
      SELECT
        SUM(guests) as total_guests,
        SUM(amount) as total_amount,
        COUNT(*) as total_entries
      FROM covers WHERE date(created_at) = date('now')
    `).get();
    res.json({ ok: true, covers, totals });
  });

  // ═══ KARAOKE QUEUE ═══
  app.get('/pos/karaoke/queue', (req, res) => {
    const db = getDb();
    const { table_id } = req.query;
    let query = `
      SELECT kq.*, t.number as table_number
      FROM karaoke_queue kq
      LEFT JOIN tables t ON kq.table_id = t.id
      WHERE kq.status IN ('espera', 'cantando')
    `;
    const params = [];
    if (table_id) { query += ' AND kq.table_id = ?'; params.push(table_id); }
    query += ' ORDER BY kq.position ASC';
    const queue = db.prepare(query).all(...params);
    res.json({ ok: true, queue });
  });

  app.post('/pos/karaoke/queue', posJson, (req, res) => {
    const db = getDb();
    const { table_id, song_title, singer_name } = req.body;
    const maxPos = db.prepare("SELECT MAX(position) as m FROM karaoke_queue WHERE status = 'espera'").get().m || 0;
    const result = db.prepare(
      'INSERT INTO karaoke_queue (table_id, song_title, singer_name, position) VALUES (?,?,?,?)'
    ).run(table_id, song_title, singer_name || '', maxPos + 1);
    res.json({ ok: true, id: result.lastInsertRowid, position: maxPos + 1 });
  });

  // ═══ EMPLOYEES ═══
  app.get('/pos/employees', (req, res) => {
    const db = getDb();
    const employees = db.prepare(
      'SELECT id, name, role, role_level, active, area, avatar, last_login FROM employees ORDER BY role_level, name'
    ).all();
    res.json({ ok: true, employees });
  });

  // ═══ INVENTORY ═══
  app.get('/pos/inventory', (req, res) => {
    const db = getDb();
    const products = db.prepare(`
      SELECT p.*, c.name as category_name,
        CASE
          WHEN p.stock = -1 THEN 'unlimited'
          WHEN p.stock <= p.min_stock * 0.3 THEN 'critical'
          WHEN p.stock <= p.min_stock THEN 'low'
          WHEN p.stock <= p.min_stock * 2 THEN 'medium'
          ELSE 'ok'
        END as stock_status,
        CASE WHEN p.cost > 0 THEN ROUND((1 - p.cost / p.price) * 100, 1) ELSE 0 END as margin
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.active = 1
      ORDER BY
        CASE WHEN p.stock > 0 AND p.stock <= p.min_stock THEN 0 ELSE 1 END,
        c.sort_order, p.name
    `).all();
    res.json({ ok: true, products });
  });

  // ═══ REPORTS ═══
  app.get('/pos/reports/today', (req, res) => {
    const db = getDb();
    const sales = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(total) as total_sales,
        AVG(total) as avg_ticket,
        SUM(tip) as total_tips,
        SUM(discount) as total_discounts
      FROM orders
      WHERE date(created_at) = date('now') AND status = 'pagada'
    `).get();

    const byHour = db.prepare(`
      SELECT strftime('%H', created_at) as hour, SUM(total) as sales, COUNT(*) as orders
      FROM orders
      WHERE date(created_at) = date('now') AND status = 'pagada'
      GROUP BY hour ORDER BY hour
    `).all();

    const topProducts = db.prepare(`
      SELECT p.name, p.icon, SUM(oi.quantity) as qty, SUM(oi.total) as revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) = date('now') AND o.status = 'pagada'
      GROUP BY p.id ORDER BY revenue DESC LIMIT 10
    `).all();

    const topKaraoke = db.prepare(`
      SELECT song_title, COUNT(*) as times_sung
      FROM karaoke_queue
      WHERE date(created_at) = date('now') AND status = 'completada'
      GROUP BY song_title ORDER BY times_sung DESC LIMIT 10
    `).all();

    const byEmployee = db.prepare(`
      SELECT e.name, e.role, e.avatar,
        COUNT(o.id) as orders_count,
        SUM(o.total) as total_sales,
        SUM(o.tip) as total_tips
      FROM orders o
      JOIN employees e ON o.waiter_id = e.id
      WHERE date(o.created_at) = date('now') AND o.status = 'pagada'
      GROUP BY e.id ORDER BY total_sales DESC
    `).all();

    res.json({ ok: true, sales, byHour, topProducts, topKaraoke, byEmployee });
  });

  // ═══ SETTINGS ═══
  app.get('/pos/settings', (req, res) => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM bar_settings').all();
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    res.json({ ok: true, settings });
  });

  app.put('/pos/settings', posJson, (req, res) => {
    const db = getDb();
    const stmt = db.prepare('INSERT OR REPLACE INTO bar_settings (key, value) VALUES (?, ?)');
    const update = db.transaction((entries) => {
      for (const [k, v] of entries) stmt.run(k, String(v));
    });
    update(Object.entries(req.body));
    res.json({ ok: true });
  });

  // ═══ HAPPY HOUR STATUS ═══
  app.get('/pos/happy-hour/active', (req, res) => {
    const db = getDb();
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    const dayOfWeek = String(now.getDay()); // 0=Sun

    const active = db.prepare(`
      SELECT * FROM happy_hours
      WHERE active = 1
      AND (day_of_week = '*' OR day_of_week = ?)
      AND start_time <= ? AND end_time > ?
    `).all(dayOfWeek, currentTime, currentTime);

    res.json({ ok: true, active, is_happy_hour: active.length > 0 });
  });

  console.log('[POS] API routes registered: /pos/*');
}

// Helper: recalculate order totals
function recalcOrder(db, orderId) {
  const subtotal = db.prepare(
    "SELECT SUM(total) as s FROM order_items WHERE order_id = ? AND status != 'cancelado'"
  ).get(orderId).s || 0;

  const settings = {};
  db.prepare('SELECT * FROM bar_settings').all().forEach(r => { settings[r.key] = r.value; });
  const taxRate = parseFloat(settings.tax_rate || '0.16');

  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + tax;

  db.prepare('UPDATE orders SET subtotal = ?, tax = ?, total = ? WHERE id = ?').run(subtotal, tax, total, orderId);
}

module.exports = { registerRoutes };

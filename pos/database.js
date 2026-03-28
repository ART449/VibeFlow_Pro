/**
 * ByFlow POS Eatertainment — Database Module
 * Schema + migrations + seed data
 * Uses better-sqlite3 for sync operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'pos-v2.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -20000');
    db.pragma('temp_store = MEMORY');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db) {
  db.exec(`
    -- ═══ EMPLOYEES (Personal) ═══
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('dueno','gerente','capitan','cajero','mesero','bartender','cocinero','dj','seguridad')),
      role_level INTEGER NOT NULL DEFAULT 4,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT,
      avatar TEXT DEFAULT '',
      area TEXT DEFAULT 'salon'
    );

    -- ═══ SHIFTS (Turnos) ═══
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      cash_start REAL DEFAULT 0,
      cash_end REAL,
      tips REAL DEFAULT 0,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- ═══ TABLES (Mesas) ═══
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      area TEXT NOT NULL DEFAULT 'salon',
      capacity INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'libre' CHECK(status IN ('libre','ocupada','cantando','reservada','cuenta','tab')),
      current_order_id INTEGER,
      waiter_id INTEGER,
      guests INTEGER DEFAULT 0,
      opened_at TEXT,
      FOREIGN KEY (waiter_id) REFERENCES employees(id)
    );

    -- ═══ CATEGORIES (Categorias de producto) ═══
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    -- ═══ PRODUCTS (Productos/Menu) ═══
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      price REAL NOT NULL,
      cost REAL DEFAULT 0,
      icon TEXT DEFAULT '',
      stock INTEGER DEFAULT -1,
      min_stock INTEGER DEFAULT 5,
      unit TEXT DEFAULT 'pza',
      happy_hour INTEGER DEFAULT 0,
      hh_discount REAL DEFAULT 0.5,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- ═══ ORDERS (Cuentas/Ordenes) ═══
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      waiter_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'abierta' CHECK(status IN ('abierta','cerrada','cancelada','pagada')),
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      discount_reason TEXT DEFAULT '',
      discount_auth_id INTEGER,
      tax REAL DEFAULT 0,
      tip REAL DEFAULT 0,
      total REAL DEFAULT 0,
      guests INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT,
      notes TEXT DEFAULT '',
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (waiter_id) REFERENCES employees(id)
    );

    -- ═══ ORDER ITEMS (Items de la orden) ═══
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pendiente' CHECK(status IN ('pendiente','enviado','preparando','listo','entregado','cancelado')),
      notes TEXT DEFAULT '',
      sent_at TEXT,
      ready_at TEXT,
      cancelled_by INTEGER,
      cancel_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- ═══ PAYMENTS (Pagos) ═══
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('efectivo','tarjeta','transferencia','mixto')),
      amount REAL NOT NULL,
      cash_received REAL DEFAULT 0,
      change_given REAL DEFAULT 0,
      tip REAL DEFAULT 0,
      cashier_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      cfdi_uuid TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (cashier_id) REFERENCES employees(id)
    );

    -- ═══ COVERS (Entradas) ═══
    CREATE TABLE IF NOT EXISTS covers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'general' CHECK(type IN ('general','vip','cortesia','lista')),
      guests INTEGER NOT NULL DEFAULT 1,
      amount REAL NOT NULL DEFAULT 0,
      security_id INTEGER,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (security_id) REFERENCES employees(id)
    );

    -- ═══ KARAOKE QUEUE (Cola de Karaoke) ═══
    CREATE TABLE IF NOT EXISTS karaoke_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER,
      song_title TEXT NOT NULL,
      singer_name TEXT DEFAULT '',
      status TEXT DEFAULT 'espera' CHECK(status IN ('espera','cantando','completada','saltada')),
      position INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );

    -- ═══ HAPPY HOUR CONFIG ═══
    CREATE TABLE IF NOT EXISTS happy_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      day_of_week TEXT DEFAULT '*',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      discount_pct REAL NOT NULL DEFAULT 50,
      active INTEGER DEFAULT 1
    );

    -- ═══ RESERVATIONS ═══
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      guests INTEGER NOT NULL DEFAULT 2,
      table_id INTEGER,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT DEFAULT 'confirmada' CHECK(status IN ('confirmada','cancelada','completada','no_show')),
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );

    -- ═══ AUDIT LOG ═══
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER,
      action TEXT NOT NULL,
      details TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    -- ═══ BAR SETTINGS ═══
    CREATE TABLE IF NOT EXISTS bar_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- ═══ INDEXES ═══
    CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_employees_pin ON employees(pin);
    CREATE INDEX IF NOT EXISTS idx_karaoke_status ON karaoke_queue(status);
    CREATE INDEX IF NOT EXISTS idx_covers_date ON covers(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_employee ON audit_log(employee_id);
  `);

  // Seed data if empty
  const empCount = db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
  if (empCount === 0) seedData(db);
}

function hashPin(pin) {
  return bcrypt.hashSync(pin, 8); // 8 rounds for seed, auth.js uses 10 for new PINs
}

function seedData(db) {
  // ═══ EMPLOYEES ═══
  const insertEmp = db.prepare('INSERT INTO employees (name, pin, role, role_level, area, avatar) VALUES (?,?,?,?,?,?)');
  const employees = [
    ['Arturo Torres', hashPin('000000'), 'dueno', 0, 'todos', '👑'],
    ['Ana Garcia', hashPin('1111'), 'gerente', 1, 'todos', '👩‍💼'],
    ['Luis Mendez', hashPin('2222'), 'capitan', 2, 'salon', '🎖️'],
    ['Juan Perez', hashPin('3333'), 'mesero', 4, 'salon', '🧑‍🍳'],
    ['Maria Lopez', hashPin('4444'), 'bartender', 5, 'barra', '🍸'],
    ['Roberto Diaz', hashPin('5555'), 'cocinero', 6, 'cocina', '👨‍🍳'],
    ['Carlos Ruiz', hashPin('6666'), 'mesero', 4, 'terraza', '🧑‍🍳'],
    ['DJ Memo', hashPin('7777'), 'dj', 7, 'karaoke', '🎤'],
    ['Oscar Torres', hashPin('8888'), 'seguridad', 8, 'entrada', '🛡️'],
    ['Sandra Rios', hashPin('9999'), 'cajero', 3, 'caja', '💳'],
  ];
  const insertMany = db.transaction(() => {
    for (const e of employees) insertEmp.run(...e);
  });
  insertMany();

  // ═══ CATEGORIES ═══
  const insertCat = db.prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?,?,?)');
  const categories = [
    ['Cervezas', '🍺', 1], ['Cocktails', '🍸', 2], ['Shots', '🥃', 3],
    ['Botanas', '🍟', 4], ['Comida', '🍕', 5], ['Refrescos', '🧃', 6], ['Cafe', '☕', 7]
  ];
  db.transaction(() => { for (const c of categories) insertCat.run(...c); })();

  // ═══ PRODUCTS ═══
  const insertProd = db.prepare('INSERT INTO products (name, category_id, price, cost, icon, stock, happy_hour, hh_discount) VALUES (?,?,?,?,?,?,?,?)');
  const products = [
    // Cervezas (cat 1)
    ['Corona', 1, 45, 12, '🍺', 192, 1, 0.5],
    ['Modelo Especial', 1, 50, 15, '🍺', 120, 1, 0.5],
    ['Victoria', 1, 40, 10, '🍺', 96, 1, 0.5],
    ['Heineken', 1, 65, 22, '🍺', 72, 0, 0],
    ['Michelada', 1, 85, 20, '🍺', -1, 1, 0.5],
    ['Pacifico', 1, 45, 12, '🍺', 48, 1, 0.5],
    ['Negra Modelo', 1, 55, 16, '🍺', 48, 0, 0],
    ['Cubeta x5', 1, 200, 55, '🧊', -1, 0, 0],
    // Cocktails (cat 2)
    ['Margarita', 2, 120, 28, '🍸', -1, 0, 0],
    ['Paloma', 2, 90, 20, '🍸', -1, 0, 0],
    ['Mojito', 2, 110, 25, '🍸', -1, 0, 0],
    ['Pina Colada', 2, 130, 30, '🍸', -1, 0, 0],
    ['Cuba Libre', 2, 95, 18, '🍸', -1, 0, 0],
    ['Sangria', 2, 80, 15, '🍷', -1, 0, 0],
    // Shots (cat 3)
    ['Tequila Don Julio', 3, 80, 30, '🥃', 45, 0, 0],
    ['Vodka', 3, 70, 18, '🥃', 105, 0, 0],
    ['Whisky', 3, 100, 35, '🥃', 60, 0, 0],
    ['Mezcal', 3, 90, 25, '🥃', 30, 0, 0],
    ['Jagermeister', 3, 85, 28, '🥃', 40, 0, 0],
    ['Ronda x4', 3, 280, 100, '🥃', -1, 0, 0],
    // Botanas (cat 4)
    ['Nachos', 4, 90, 22, '🍟', -1, 0, 0],
    ['Alitas BBQ', 4, 165, 55, '🍗', -1, 0, 0],
    ['Papas Fritas', 4, 70, 15, '🍟', -1, 0, 0],
    ['Guacamole', 4, 85, 20, '🥑', -1, 0, 0],
    ['Tabla de Quesos', 4, 180, 60, '🧀', -1, 0, 0],
    ['Tostadas de Atun', 4, 120, 35, '🍣', -1, 0, 0],
    // Comida (cat 5)
    ['Hamburguesa', 5, 145, 40, '🍔', -1, 0, 0],
    ['Pizza Personal', 5, 120, 30, '🍕', -1, 0, 0],
    ['Tacos x3', 5, 95, 25, '🌮', -1, 0, 0],
    ['Quesadilla', 5, 80, 18, '🧀', -1, 0, 0],
    ['Hot Dog', 5, 65, 15, '🌭', -1, 0, 0],
    ['Ensalada', 5, 90, 25, '🥗', -1, 0, 0],
    // Refrescos (cat 6)
    ['Coca-Cola', 6, 35, 8, '🧃', -1, 0, 0],
    ['Agua Mineral', 6, 30, 5, '💧', -1, 0, 0],
    ['Jugo de Naranja', 6, 40, 12, '🍊', -1, 0, 0],
    ['Red Bull', 6, 65, 30, '⚡', -1, 0, 0],
    ['Limonada', 6, 35, 8, '🍋', -1, 0, 0],
    // Cafe (cat 7)
    ['Americano', 7, 40, 8, '☕', -1, 0, 0],
    ['Cappuccino', 7, 55, 12, '☕', -1, 0, 0],
    ['Latte', 7, 55, 12, '☕', -1, 0, 0],
  ];
  db.transaction(() => { for (const p of products) insertProd.run(...p); })();

  // ═══ TABLES ═══
  const insertTable = db.prepare('INSERT INTO tables (number, area, capacity) VALUES (?,?,?)');
  const tables = [
    ['1', 'salon', 4], ['2', 'salon', 6], ['3', 'salon', 4], ['4', 'salon', 8],
    ['5', 'salon', 3], ['6', 'salon', 6], ['7', 'salon', 2], ['8', 'salon', 5],
    ['B1', 'barra', 2], ['B2', 'barra', 2], ['B3', 'barra', 2], ['B4', 'barra', 2],
    ['T1', 'terraza', 4], ['T2', 'terraza', 6], ['T3', 'terraza', 4],
    ['V1', 'vip', 8], ['V2', 'vip', 10],
  ];
  db.transaction(() => { for (const t of tables) insertTable.run(...t); })();

  // ═══ HAPPY HOURS ═══
  const insertHH = db.prepare('INSERT INTO happy_hours (name, day_of_week, start_time, end_time, discount_pct) VALUES (?,?,?,?,?)');
  db.transaction(() => {
    insertHH.run('Happy Hour Cervezas', '*', '17:00', '19:00', 50);
    insertHH.run('Ladies Night', '4', '20:00', '23:00', 100); // Jueves
    insertHH.run('2x1 Viernes', '5', '18:00', '20:00', 50);
  })();

  // ═══ BAR SETTINGS ═══
  const insertSetting = db.prepare('INSERT OR REPLACE INTO bar_settings (key, value) VALUES (?,?)');
  db.transaction(() => {
    insertSetting.run('bar_name', 'La Cantina del Code');
    insertSetting.run('tax_rate', '0.16');
    insertSetting.run('tip_suggested', '0.15');
    insertSetting.run('cover_general', '150');
    insertSetting.run('cover_vip', '250');
    insertSetting.run('cover_includes', '2 bebidas nacionales');
    insertSetting.run('max_capacity', '120');
    insertSetting.run('cfdi_rfc', '');
    insertSetting.run('cfdi_razon_social', '');
    insertSetting.run('whatsapp', '');
    insertSetting.run('email_contacto', 'contacto@iartlabs.com');
    insertSetting.run('instagram', '');
    insertSetting.run('facebook', '');
  })();

  console.log('[POS] Seed data created: 10 employees, 7 categories, 40 products, 17 tables, 3 happy hours');
}

module.exports = { getDb, hashPin };

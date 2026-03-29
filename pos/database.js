/**
 * ByFlow POS Eatertainment — Database Module
 * Schema + migrations + seed data
 * Uses sql.js (pure JS SQLite — no native compilation needed)
 *
 * Provides a sync-compatible wrapper around sql.js so that
 * routes.js, auth.js, security.js, and sockets.js work unchanged.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'pos-v2.db');

let db = null;       // sql.js Database instance
let wrapper = null;  // Sync-compatible wrapper returned by getDb()
let sqlJsReady = false;
let initPromise = null;

// ═══ AUTO-SAVE: persist to disk after write operations ═══
function saveToDisk() {
  if (!db) return;
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[POS-DB] Failed to save database to disk:', err.message);
  }
}

// Debounced save — coalesce rapid writes into a single disk flush
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToDisk, 250);
}

// ═══ WRAPPER: provides better-sqlite3-compatible API on top of sql.js ═══
function createWrapper(rawDb) {
  /**
   * .prepare(sql) returns an object with .run(), .get(), .all()
   * matching better-sqlite3 behavior.
   */
  function prepare(sql) {
    return {
      run(...params) {
        rawDb.run(sql, params);
        scheduleSave();
        // Return an object with lastInsertRowid and changes
        const lastId = rawDb.exec('SELECT last_insert_rowid() AS id');
        const changesResult = rawDb.exec('SELECT changes() AS c');
        return {
          lastInsertRowid: lastId.length > 0 ? lastId[0].values[0][0] : 0,
          changes: changesResult.length > 0 ? changesResult[0].values[0][0] : 0
        };
      },
      get(...params) {
        let stmt;
        try {
          stmt = rawDb.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          if (stmt.step()) {
            return stmt.getAsObject();
          }
          return undefined;
        } finally {
          if (stmt) stmt.free();
        }
      },
      all(...params) {
        let stmt;
        try {
          stmt = rawDb.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          return results;
        } finally {
          if (stmt) stmt.free();
        }
      }
    };
  }

  /**
   * .exec(sql) — run raw SQL (multi-statement). Used for migrations.
   * Also used by security.js for VACUUM INTO.
   */
  function exec(sql) {
    rawDb.run(sql);
    scheduleSave();
  }

  /**
   * .transaction(fn) — wraps fn in BEGIN/COMMIT with ROLLBACK on error.
   * Returns a function that executes the transaction when called.
   */
  function transaction(fn) {
    return function (...args) {
      rawDb.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        rawDb.run('COMMIT');
        scheduleSave();
        return result;
      } catch (err) {
        rawDb.run('ROLLBACK');
        throw err;
      }
    };
  }

  /**
   * .pragma(str) — no-op for sql.js (WAL mode, busy_timeout etc. not applicable)
   */
  function pragma(_str) {
    // sql.js runs in-memory, pragmas like WAL mode are not needed
  }

  /**
   * .export() — return raw Uint8Array of the database (used by security.js backup)
   */
  function exportDb() {
    return rawDb.export();
  }

  return { prepare, exec, transaction, pragma, export: exportDb };
}

// ═══ INITIALIZATION (sync-looking but bootstrapped once) ═══

/**
 * Initialize sql.js and load (or create) the database.
 * Called once; subsequent calls are no-ops.
 */
async function initDatabase() {
  if (sqlJsReady) return;

  const SQL = await initSqlJs();

  // Load existing DB file if present
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[POS-DB] Loaded existing database from disk');
  } else {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new SQL.Database();
    console.log('[POS-DB] Created new database');
  }

  // Enable foreign keys (the only pragma that matters for sql.js)
  db.run('PRAGMA foreign_keys = ON');

  wrapper = createWrapper(db);

  // Run migrations
  runMigrations(wrapper);

  // Force immediate save after init
  saveToDisk();

  sqlJsReady = true;
}

/**
 * getDb() — synchronous entry point used by all POS modules.
 *
 * IMPORTANT: The database MUST be initialized before this is called.
 * Call `await ensureDbReady()` once at startup (in pos/index.js init).
 * After that, getDb() is safe to call synchronously from any route handler.
 */
function getDb() {
  if (!wrapper) {
    throw new Error(
      '[POS-DB] Database not initialized. Call await ensureDbReady() at startup before using getDb().'
    );
  }
  return wrapper;
}

/**
 * ensureDbReady() — async init guard. Call once at app startup.
 * Subsequent calls are no-ops (idempotent).
 */
async function ensureDbReady() {
  if (sqlJsReady) return;
  if (!initPromise) {
    initPromise = initDatabase();
  }
  await initPromise;
}

// ═══ MIGRATIONS ═══

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
      status TEXT DEFAULT 'pendiente' CHECK(status IN ('pendiente','confirmada','llego','cancelada','completada','no_show')),
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

  // ═══ MULTI-TENANT MIGRATION: Add bar_id to all tenant-scoped tables ═══
  // Uses ALTER TABLE ... ADD COLUMN which is safe (SQLite ignores if column exists via try/catch)
  const tenantTables = [
    'employees', 'tables', 'categories', 'products', 'orders', 'payments',
    'covers', 'karaoke_queue', 'happy_hours', 'reservations', 'shifts',
    'audit_log', 'bar_settings'
  ];
  for (const table of tenantTables) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN bar_id TEXT NOT NULL DEFAULT 'default'`);
      console.log(`[POS-DB] Migration: added bar_id to ${table}`);
    } catch (_) {
      // Column already exists — expected for subsequent runs
    }
  }

  // bar_id indexes for query performance
  for (const table of tenantTables) {
    if (table === 'bar_settings') continue; // bar_settings handled separately below
    try {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_bar_id ON ${table}(bar_id)`);
    } catch (_) { /* index may already exist */ }
  }

  // bar_settings migration: change from single-key PK to composite (key, bar_id)
  // Check if migration is needed by looking at table schema
  try {
    const hasNewTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bar_settings_v2'").get();
    if (!hasNewTable) {
      // Create new table with composite primary key
      db.exec(`
        CREATE TABLE IF NOT EXISTS bar_settings_v2 (
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          bar_id TEXT NOT NULL DEFAULT 'default',
          PRIMARY KEY (key, bar_id)
        );
        INSERT OR IGNORE INTO bar_settings_v2 (key, value, bar_id)
          SELECT key, value, bar_id FROM bar_settings;
        DROP TABLE bar_settings;
        ALTER TABLE bar_settings_v2 RENAME TO bar_settings;
      `);
      console.log('[POS-DB] Migration: bar_settings upgraded to composite PK (key, bar_id)');
    }
  } catch (_) {
    // If bar_settings_v2 migration already ran or table structure is already correct
  }

  // ═══ INVENTORY ADJUSTMENTS TABLE ═══
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('purchase','waste','adjustment','sale')),
        quantity REAL NOT NULL,
        notes TEXT DEFAULT '',
        employee_id INTEGER,
        bar_id TEXT NOT NULL DEFAULT 'default',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (employee_id) REFERENCES employees(id)
      );
      CREATE INDEX IF NOT EXISTS idx_inv_adj_bar ON inventory_adjustments(bar_id);
      CREATE INDEX IF NOT EXISTS idx_inv_adj_product ON inventory_adjustments(product_id);
    `);
  } catch (_) { /* table/indexes already exist */ }

  // Make tables.number unique per bar (not globally) — drop old unique constraint safely
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_number_bar ON tables(number, bar_id)`);
  } catch (_) { /* already exists */ }

  // ═══ COVER DEPARTURE TIME MIGRATION ═══
  try {
    db.exec(`ALTER TABLE covers ADD COLUMN departure_time TEXT DEFAULT NULL`);
    console.log('[POS-DB] Migration: added departure_time to covers');
  } catch (_) { /* column already exists */ }

  // ═══ HAPPY HOURS CATEGORIES MIGRATION ═══
  try {
    db.exec(`ALTER TABLE happy_hours ADD COLUMN categories TEXT DEFAULT '*'`);
    console.log('[POS-DB] Migration: added categories to happy_hours');
  } catch (_) { /* column already exists */ }

  // ═══ RESERVATIONS STATUS MIGRATION (add pendiente/llego) ═══
  // SQLite cannot ALTER CHECK constraints, but new rows will use the updated CREATE TABLE.
  // Existing rows with old statuses remain valid.

  // Seed data if empty
  const empCount = db.prepare('SELECT COUNT(*) as c FROM employees').get().c;
  if (empCount === 0) seedData(db);
}

function hashPin(pin) {
  return bcrypt.hashSync(pin, 8); // 8 rounds for seed, auth.js uses 10 for new PINs
}

function seedData(db) {
  // ═══ EMPLOYEES ═══
  const insertEmp = db.prepare('INSERT INTO employees (name, pin, role, role_level, area, avatar, bar_id) VALUES (?,?,?,?,?,?,?)');
  const employees = [
    ['Arturo Torres', hashPin('000000'), 'dueno', 0, 'todos', '', 'default'],
    ['Ana Garcia', hashPin('1111'), 'gerente', 1, 'todos', '', 'default'],
    ['Luis Mendez', hashPin('2222'), 'capitan', 2, 'salon', '', 'default'],
    ['Juan Perez', hashPin('3333'), 'mesero', 4, 'salon', '', 'default'],
    ['Maria Lopez', hashPin('4444'), 'bartender', 5, 'barra', '', 'default'],
    ['Roberto Diaz', hashPin('5555'), 'cocinero', 6, 'cocina', '', 'default'],
    ['Carlos Ruiz', hashPin('6666'), 'mesero', 4, 'terraza', '', 'default'],
    ['DJ Memo', hashPin('7777'), 'dj', 7, 'karaoke', '', 'default'],
    ['Oscar Torres', hashPin('8888'), 'seguridad', 8, 'entrada', '', 'default'],
    ['Sandra Rios', hashPin('9999'), 'cajero', 3, 'caja', '', 'default'],
  ];
  const insertMany = db.transaction(() => {
    for (const e of employees) insertEmp.run(...e);
  });
  insertMany();

  // ═══ CATEGORIES ═══
  const insertCat = db.prepare('INSERT INTO categories (name, icon, sort_order) VALUES (?,?,?)');
  const categories = [
    ['Cervezas', '', 1], ['Cocktails', '', 2], ['Shots', '', 3],
    ['Botanas', '', 4], ['Comida', '', 5], ['Refrescos', '', 6], ['Cafe', '', 7]
  ];
  db.transaction(() => { for (const c of categories) insertCat.run(...c); })();

  // ═══ PRODUCTS ═══
  const insertProd = db.prepare('INSERT INTO products (name, category_id, price, cost, icon, stock, happy_hour, hh_discount) VALUES (?,?,?,?,?,?,?,?)');
  const products = [
    // Cervezas (cat 1)
    ['Corona', 1, 45, 12, '', 192, 1, 0.5],
    ['Modelo Especial', 1, 50, 15, '', 120, 1, 0.5],
    ['Victoria', 1, 40, 10, '', 96, 1, 0.5],
    ['Heineken', 1, 65, 22, '', 72, 0, 0],
    ['Michelada', 1, 85, 20, '', -1, 1, 0.5],
    ['Pacifico', 1, 45, 12, '', 48, 1, 0.5],
    ['Negra Modelo', 1, 55, 16, '', 48, 0, 0],
    ['Cubeta x5', 1, 200, 55, '', -1, 0, 0],
    // Cocktails (cat 2)
    ['Margarita', 2, 120, 28, '', -1, 0, 0],
    ['Paloma', 2, 90, 20, '', -1, 0, 0],
    ['Mojito', 2, 110, 25, '', -1, 0, 0],
    ['Pina Colada', 2, 130, 30, '', -1, 0, 0],
    ['Cuba Libre', 2, 95, 18, '', -1, 0, 0],
    ['Sangria', 2, 80, 15, '', -1, 0, 0],
    // Shots (cat 3)
    ['Tequila Don Julio', 3, 80, 30, '', 45, 0, 0],
    ['Vodka', 3, 70, 18, '', 105, 0, 0],
    ['Whisky', 3, 100, 35, '', 60, 0, 0],
    ['Mezcal', 3, 90, 25, '', 30, 0, 0],
    ['Jagermeister', 3, 85, 28, '', 40, 0, 0],
    ['Ronda x4', 3, 280, 100, '', -1, 0, 0],
    // Botanas (cat 4)
    ['Nachos', 4, 90, 22, '', -1, 0, 0],
    ['Alitas BBQ', 4, 165, 55, '', -1, 0, 0],
    ['Papas Fritas', 4, 70, 15, '', -1, 0, 0],
    ['Guacamole', 4, 85, 20, '', -1, 0, 0],
    ['Tabla de Quesos', 4, 180, 60, '', -1, 0, 0],
    ['Tostadas de Atun', 4, 120, 35, '', -1, 0, 0],
    // Comida (cat 5)
    ['Hamburguesa', 5, 145, 40, '', -1, 0, 0],
    ['Pizza Personal', 5, 120, 30, '', -1, 0, 0],
    ['Tacos x3', 5, 95, 25, '', -1, 0, 0],
    ['Quesadilla', 5, 80, 18, '', -1, 0, 0],
    ['Hot Dog', 5, 65, 15, '', -1, 0, 0],
    ['Ensalada', 5, 90, 25, '', -1, 0, 0],
    // Refrescos (cat 6)
    ['Coca-Cola', 6, 35, 8, '', -1, 0, 0],
    ['Agua Mineral', 6, 30, 5, '', -1, 0, 0],
    ['Jugo de Naranja', 6, 40, 12, '', -1, 0, 0],
    ['Red Bull', 6, 65, 30, '', -1, 0, 0],
    ['Limonada', 6, 35, 8, '', -1, 0, 0],
    // Cafe (cat 7)
    ['Americano', 7, 40, 8, '', -1, 0, 0],
    ['Cappuccino', 7, 55, 12, '', -1, 0, 0],
    ['Latte', 7, 55, 12, '', -1, 0, 0],
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
  const insertSetting = db.prepare('INSERT OR REPLACE INTO bar_settings (key, value, bar_id) VALUES (?,?,?)');
  db.transaction(() => {
    insertSetting.run('bar_name', 'La Cantina del Code', 'default');
    insertSetting.run('tax_rate', '0.16', 'default');
    insertSetting.run('tip_suggested', '0.15', 'default');
    insertSetting.run('cover_general', '150', 'default');
    insertSetting.run('cover_vip', '250', 'default');
    insertSetting.run('cover_includes', '2 bebidas nacionales', 'default');
    insertSetting.run('max_capacity', '120', 'default');
    insertSetting.run('cfdi_rfc', '', 'default');
    insertSetting.run('cfdi_razon_social', '', 'default');
    insertSetting.run('whatsapp', '', 'default');
    insertSetting.run('email_contacto', 'contacto@iartlabs.com', 'default');
    insertSetting.run('instagram', '', 'default');
    insertSetting.run('facebook', '', 'default');
    // API Keys (configurar desde admin o env vars — NUNCA hardcodear)
    insertSetting.run('youtube_api_key', '', 'default');
    insertSetting.run('jamendo_client_id', '', 'default');
    // Freno de gasto API
    insertSetting.run('api_daily_limit', '500', 'default');
    insertSetting.run('api_calls_today', '0', 'default');
    insertSetting.run('api_limit_action', 'block', 'default');
  })();

  console.log('[POS] Seed data created: 10 employees, 7 categories, 40 products, 17 tables, 3 happy hours');
}

// DB_PATH exported as single source of truth — import here, not hard-coded elsewhere
module.exports = { getDb, ensureDbReady, DB_PATH };

(function(window) {
  'use strict';

  var params = new URLSearchParams(window.location.search || '');
  var isDemo = params.get('demo') === 'true' || params.get('mode') === 'demo' || params.get('showroom') === '1';
  if (!isDemo || window.__BYFLOW_POS_DEMO__) return;

  var DEMO_SIDEBAR = [
    { id: 'mesas' },
    { id: 'comandas' },
    { id: 'reservaciones' },
    { id: 'cover' },
    { id: 'cocina' },
    { id: 'barra' },
    { id: 'inventario' },
    { id: 'reportes' },
    { id: 'corte' },
    { id: 'cfdi' },
    { id: 'empleados' },
    { id: 'ia-asistente' },
    { id: 'ia-builders' },
    { id: 'ia-contador' },
    { id: 'ia-inventario' },
    { id: 'ia-espia' }
  ];
  var DEMO_SESSION_KEYS = ['pos_demo_mode', 'pos_token', 'pos_bar_id', 'pos_employee', 'pos_permissions', 'pos_sidebar', 'pos_default_view'];
  var previousSession = {};
  DEMO_SESSION_KEYS.forEach(function(key) {
    previousSession[key] = sessionStorage.getItem(key);
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function minutesAgoIso(minutes) {
    return new Date(Date.now() - (minutes * 60000)).toISOString();
  }

  function fakeResponse(payload, status) {
    var code = status || 200;
    return Promise.resolve({
      ok: code >= 200 && code < 300,
      status: code,
      json: function() { return Promise.resolve(clone(payload)); },
      text: function() { return Promise.resolve(JSON.stringify(payload)); }
    });
  }

  function parseBody(init) {
    if (!init || !init.body) return {};
    if (typeof init.body === 'string') {
      try { return JSON.parse(init.body); } catch (_) { return {}; }
    }
    return init.body || {};
  }

  function categoryName(categoryId) {
    return {
      1: 'Cervezas',
      2: 'Cocktails',
      3: 'Shots',
      4: 'Botanas',
      5: 'Cocina',
      6: 'Refrescos'
    }[categoryId] || 'General';
  }

  function normalizeInventory(product) {
    var item = product;
    var stock = Number(item.stock);
    var minStock = Number(item.min_stock || 0);
    var price = Number(item.price || 0);
    var cost = Number(item.cost || 0);
    item.margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
    if (stock === -1) item.stock_status = 'unlimited';
    else if (stock <= Math.max(2, Math.floor(minStock * 0.5))) item.stock_status = 'critical';
    else if (stock <= minStock) item.stock_status = 'low';
    else if (stock <= Math.max(minStock + 2, Math.floor(minStock * 1.5))) item.stock_status = 'medium';
    else item.stock_status = 'high';
    item.category_name = item.category_name || categoryName(item.category_id);
    return item;
  }

  function demoProducts() {
    return [
      { id: 101, category_id: 1, name: 'Victoria 355', icon: '🍺', price: 69, happy_hour_price: 55, stock: 92, min_stock: 18, cost: 23, unit: 'bot' },
      { id: 102, category_id: 1, name: 'Michelada ByFlow', icon: '🍺', price: 95, happy_hour_price: 79, stock: 44, min_stock: 12, cost: 31, unit: 'vaso' },
      { id: 103, category_id: 1, name: 'IPA local', icon: '🍻', price: 88, happy_hour_price: 72, stock: 28, min_stock: 10, cost: 34, unit: 'bot' },
      { id: 201, category_id: 2, name: 'Margarita mango', icon: '🍹', price: 135, happy_hour_price: 109, stock: 35, min_stock: 10, cost: 49, unit: 'vaso' },
      { id: 202, category_id: 2, name: 'Carajillo', icon: '☕', price: 149, happy_hour_price: 129, stock: 22, min_stock: 8, cost: 58, unit: 'vaso' },
      { id: 203, category_id: 2, name: 'Gin tonic', icon: '🍸', price: 145, happy_hour_price: 119, stock: 31, min_stock: 8, cost: 52, unit: 'vaso' },
      { id: 301, category_id: 3, name: 'Shot de tequila', icon: '🥃', price: 59, happy_hour_price: 45, stock: 64, min_stock: 12, cost: 19, unit: 'shot' },
      { id: 302, category_id: 3, name: 'Shot de mezcal', icon: '🥃', price: 72, happy_hour_price: 59, stock: 33, min_stock: 10, cost: 24, unit: 'shot' },
      { id: 401, category_id: 4, name: 'Nachos supremos', icon: '🧀', price: 149, happy_hour_price: null, stock: 16, min_stock: 6, cost: 58, unit: 'orden' },
      { id: 402, category_id: 4, name: 'Alitas BBQ', icon: '🍗', price: 179, happy_hour_price: null, stock: 14, min_stock: 6, cost: 72, unit: 'orden' },
      { id: 403, category_id: 4, name: 'Papas gajo', icon: '🍟', price: 109, happy_hour_price: null, stock: 18, min_stock: 7, cost: 39, unit: 'orden' },
      { id: 501, category_id: 5, name: 'Hamburguesa smash', icon: '🍔', price: 189, happy_hour_price: null, stock: 12, min_stock: 5, cost: 78, unit: 'plato' },
      { id: 502, category_id: 5, name: 'Boneless spicy', icon: '🍗', price: 185, happy_hour_price: null, stock: 11, min_stock: 5, cost: 76, unit: 'plato' },
      { id: 601, category_id: 6, name: 'Agua mineral', icon: '🥤', price: 42, happy_hour_price: null, stock: 54, min_stock: 12, cost: 10, unit: 'bot' },
      { id: 602, category_id: 6, name: 'Refresco', icon: '🥤', price: 45, happy_hour_price: null, stock: 70, min_stock: 18, cost: 12, unit: 'bot' },
      { id: 603, category_id: 6, name: 'Red Bull', icon: '⚡', price: 75, happy_hour_price: null, stock: 21, min_stock: 8, cost: 28, unit: 'lata' }
    ].map(normalizeInventory);
  }

  function buildState() {
    var currentShiftId = 7001;
    return {
      nextOrderId: 9100,
      nextItemId: 3000,
      nextReservationId: 8100,
      nextCoverId: 8200,
      nextShiftId: 7300,
      nextPaymentId: 7400,
      nextKaraokeId: 7500,
      nextProductId: 9000,
      settings: {
        bar_name: 'ByFlow Demo Lab',
        tax_rate: 0.16,
        cover_general: 120,
        cover_vip: 220,
        cfdi_rfc: 'BDM260101AAA'
      },
      products: demoProducts(),
      tables: [
        { id: 1, number: 1, area: 'Terraza', guests: 4, base_status: 'libre', status: 'ocupada', total: 634, waiter_name: 'Valeria', current_order_id: 9001 },
        { id: 2, number: 2, area: 'Salon', guests: 6, base_status: 'libre', status: 'cantando', total: 1184, waiter_name: 'Carlos', current_order_id: 9002 },
        { id: 3, number: 3, area: 'VIP', guests: 8, base_status: 'reservada', status: 'reservada', total: 0, waiter_name: '' },
        { id: 4, number: 4, area: 'Salon', guests: 2, base_status: 'libre', status: 'cuenta', total: 298, waiter_name: 'Mariana', current_order_id: 9003 },
        { id: 5, number: 5, area: 'Terraza', guests: 4, base_status: 'libre', status: 'libre', total: 0, waiter_name: '' },
        { id: 6, number: 6, area: 'Terraza', guests: 5, base_status: 'libre', status: 'libre', total: 0, waiter_name: '' },
        { id: 7, number: 7, area: 'Salon', guests: 3, base_status: 'libre', status: 'ocupada', total: 412, waiter_name: 'Valeria', current_order_id: 9004 },
        { id: 8, number: 8, area: 'VIP', guests: 10, base_status: 'libre', status: 'cantando', total: 1648, waiter_name: 'Carlos', current_order_id: 9005 },
        { id: 9, number: 9, area: 'Barra', guests: 1, base_status: 'libre', status: 'ocupada', total: 190, waiter_name: 'Memo', current_order_id: 9006 },
        { id: 10, number: 10, area: 'Barra', guests: 1, base_status: 'libre', status: 'libre', total: 0, waiter_name: '' },
        { id: 11, number: 11, area: 'Salon', guests: 4, base_status: 'libre', status: 'libre', total: 0, waiter_name: '' },
        { id: 12, number: 12, area: 'VIP', guests: 12, base_status: 'reservada', status: 'reservada', total: 0, waiter_name: '' }
      ],
      orders: [
        { id: 9001, table_id: 1, table_number: 1, table_name: 'Mesa 1', waiter_name: 'Valeria', waiter: 'Valeria', guests: 4, status: 'abierta', created_at: minutesAgoIso(22), items: [ { id: 3001, product_id: 101, quantity: 2, total: 138, status: 'listo', product_name: 'Victoria 355', name: 'Victoria 355', category: 'cervezas' }, { id: 3002, product_id: 401, quantity: 1, total: 149, status: 'preparando', product_name: 'Nachos supremos', name: 'Nachos supremos', category: 'botanas' }, { id: 3003, product_id: 202, quantity: 1, total: 149, status: 'pendiente', product_name: 'Carajillo', name: 'Carajillo', category: 'cocktails' } ] },
        { id: 9002, table_id: 2, table_number: 2, table_name: 'Mesa 2', waiter_name: 'Carlos', waiter: 'Carlos', guests: 6, status: 'abierta', created_at: minutesAgoIso(38), items: [ { id: 3004, product_id: 103, quantity: 3, total: 264, status: 'listo', product_name: 'IPA local', name: 'IPA local', category: 'cervezas' }, { id: 3005, product_id: 402, quantity: 2, total: 358, status: 'preparando', product_name: 'Alitas BBQ', name: 'Alitas BBQ', category: 'botanas' }, { id: 3006, product_id: 301, quantity: 4, total: 236, status: 'pendiente', product_name: 'Shot de tequila', name: 'Shot de tequila', category: 'shots' } ] },
        { id: 9003, table_id: 4, table_number: 4, table_name: 'Mesa 4', waiter_name: 'Mariana', waiter: 'Mariana', guests: 2, status: 'cuenta', created_at: minutesAgoIso(14), items: [ { id: 3007, product_id: 601, quantity: 2, total: 84, status: 'listo', product_name: 'Agua mineral', name: 'Agua mineral', category: 'refrescos' }, { id: 3008, product_id: 501, quantity: 1, total: 189, status: 'listo', product_name: 'Hamburguesa smash', name: 'Hamburguesa smash', category: 'cocina' } ] },
        { id: 9004, table_id: 7, table_number: 7, table_name: 'Mesa 7', waiter_name: 'Valeria', waiter: 'Valeria', guests: 3, status: 'abierta', created_at: minutesAgoIso(9), items: [ { id: 3009, product_id: 201, quantity: 1, total: 135, status: 'pendiente', product_name: 'Margarita mango', name: 'Margarita mango', category: 'cocktails' }, { id: 3010, product_id: 403, quantity: 1, total: 109, status: 'pendiente', product_name: 'Papas gajo', name: 'Papas gajo', category: 'botanas' } ] },
        { id: 9005, table_id: 8, table_number: 8, table_name: 'Mesa 8', waiter_name: 'Carlos', waiter: 'Carlos', guests: 10, status: 'abierta', created_at: minutesAgoIso(51), items: [ { id: 3011, product_id: 202, quantity: 2, total: 298, status: 'listo', product_name: 'Carajillo', name: 'Carajillo', category: 'cocktails' }, { id: 3012, product_id: 502, quantity: 2, total: 370, status: 'preparando', product_name: 'Boneless spicy', name: 'Boneless spicy', category: 'cocina' }, { id: 3013, product_id: 102, quantity: 4, total: 380, status: 'pendiente', product_name: 'Michelada ByFlow', name: 'Michelada ByFlow', category: 'cervezas' } ] },
        { id: 9006, table_id: 9, table_number: 9, table_name: 'Barra B1', waiter_name: 'Memo', waiter: 'Memo', guests: 1, status: 'abierta', created_at: minutesAgoIso(6), items: [ { id: 3014, product_id: 302, quantity: 1, total: 72, status: 'pendiente', product_name: 'Shot de mezcal', name: 'Shot de mezcal', category: 'shots' }, { id: 3015, product_id: 603, quantity: 1, total: 75, status: 'pendiente', product_name: 'Red Bull', name: 'Red Bull', category: 'refrescos' } ] }
      ],
      completedOrders: [
        { id: 8801, table_number: 5, created_at: minutesAgoIso(240), waiter_name: 'Valeria', items: [ { name: 'Victoria 355', quantity: 4, total: 276 }, { name: 'Nachos supremos', quantity: 1, total: 149 } ], subtotal: 425, total: 493, tip: 70 },
        { id: 8802, table_number: 3, created_at: minutesAgoIso(180), waiter_name: 'Carlos', items: [ { name: 'Carajillo', quantity: 3, total: 447 }, { name: 'Alitas BBQ', quantity: 2, total: 358 } ], subtotal: 805, total: 934, tip: 120 },
        { id: 8803, table_number: 11, created_at: minutesAgoIso(120), waiter_name: 'Mariana', items: [ { name: 'Gin tonic', quantity: 2, total: 290 }, { name: 'Papas gajo', quantity: 1, total: 109 } ], subtotal: 399, total: 463, tip: 65 }
      ],
      covers: [
        { id: 8201, type: 'general', guests: 4, amount: 480, notes: 'Cumpleanos', created_at: minutesAgoIso(210), departure_time: null },
        { id: 8202, type: 'vip', guests: 2, amount: 440, notes: 'Mesa reservada', created_at: minutesAgoIso(130), departure_time: null },
        { id: 8203, type: 'general', guests: 3, amount: 360, notes: '', created_at: minutesAgoIso(85), departure_time: minutesAgoIso(25) }
      ],
      reservations: [
        { id: 8101, name: 'Ana Torres', phone: '4491112233', date: new Date().toISOString().slice(0, 10), time: '20:30', guests: 8, table_id: 12, notes: 'Despedida', status: 'confirmada' },
        { id: 8102, name: 'Luis Vega', phone: '4499987766', date: new Date().toISOString().slice(0, 10), time: '22:00', guests: 4, table_id: 3, notes: 'Piden karaoke', status: 'pendiente' }
      ],
      karaoke: [
        { id: 7501, table_id: 2, table_number: 2, song_title: 'Ella y Yo', singer_name: 'Mesa 2', position: 1, status: 'en cola' },
        { id: 7502, table_id: 8, table_number: 8, song_title: 'Rata de Dos Patas', singer_name: 'VIP Azul', position: 2, status: 'en cola' },
        { id: 7503, table_id: 2, table_number: 2, song_title: 'Me Vas a Extranar', singer_name: 'Sofi', position: 3, status: 'preparando' }
      ],
      shiftHistory: [
        { id: 6998, employee_name: 'Mariana', started_at: minutesAgoIso(980), ended_at: minutesAgoIso(520), cash_start: 1200, cash_end: 3580, total_sales: 5280, order_count: 17 },
        { id: 6999, employee_name: 'Valeria', started_at: minutesAgoIso(480), ended_at: minutesAgoIso(120), cash_start: 1500, cash_end: 4120, total_sales: 6340, order_count: 21 }
      ],
      currentShift: { id: currentShiftId, employee_id: 101, employee_name: 'Valeria', started_at: minutesAgoIso(150), cash_start: 1500, cash_end: null },
      payments: [
        { id: 7401, order_id: 8801, method: 'tarjeta', amount: 493, tip: 70, cash_received: 0, created_at: minutesAgoIso(235) },
        { id: 7402, order_id: 8802, method: 'efectivo', amount: 934, tip: 120, cash_received: 1100, change: 166, created_at: minutesAgoIso(170) },
        { id: 7403, order_id: 8803, method: 'transferencia', amount: 463, tip: 65, cash_received: 0, created_at: minutesAgoIso(110) }
      ]
    };
  }

  var state = buildState();

  function seedSession() {
    sessionStorage.setItem('pos_demo_mode', '1');
    sessionStorage.setItem('pos_token', 'demo-pos-token');
    sessionStorage.setItem('pos_bar_id', 'demo_byflow_bar');
    sessionStorage.setItem('pos_employee', JSON.stringify({ id: 101, name: 'Valeria Demo', role: 'dueno' }));
    sessionStorage.setItem('pos_permissions', JSON.stringify(['*']));
    sessionStorage.setItem('pos_sidebar', JSON.stringify(DEMO_SIDEBAR));
    sessionStorage.setItem('pos_default_view', params.get('view') || 'mesas');
  }

  function restoreSession() {
    DEMO_SESSION_KEYS.forEach(function(key) {
      if (previousSession[key] === null || typeof previousSession[key] === 'undefined') sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, previousSession[key]);
    });
  }

  function findProduct(id) {
    return state.products.find(function(product) { return Number(product.id) === Number(id); }) || null;
  }

  function findTable(id) {
    return state.tables.find(function(table) {
      return Number(table.id) === Number(id) || Number(table.number) === Number(id);
    }) || null;
  }

  function findOrder(id) {
    return state.orders.find(function(order) { return Number(order.id) === Number(id); }) || null;
  }

  function findItem(itemId) {
    for (var i = 0; i < state.orders.length; i++) {
      var order = state.orders[i];
      for (var j = 0; j < order.items.length; j++) {
        if (Number(order.items[j].id) === Number(itemId)) return { order: order, item: order.items[j] };
      }
    }
    return null;
  }

  function recalcOrder(order) {
    var subtotal = order.items.reduce(function(sum, item) {
      return sum + Number(item.total || 0);
    }, 0);
    order.subtotal = subtotal;
    order.total = subtotal;
    order.table_name = order.table_name || ('Mesa ' + order.table_number);
    order.waiter = order.waiter || order.waiter_name;

    var table = findTable(order.table_id);
    if (!table) return;
    table.current_order_id = order.id;
    table.total = subtotal;
    table.waiter_name = order.waiter_name || table.waiter_name;
    if (state.karaoke.some(function(song) { return Number(song.table_id) === Number(table.id); })) table.status = 'cantando';
    else if ((order.status || '').toLowerCase() === 'cuenta') table.status = 'cuenta';
    else table.status = 'ocupada';
  }

  function syncTables() {
    state.tables.forEach(function(table) {
      table.current_order_id = null;
      table.total = 0;
      table.status = table.base_status === 'reservada' ? 'reservada' : 'libre';
    });

    state.orders.forEach(function(order) {
      recalcOrder(order);
    });
  }

  function inventoryList() {
    return state.products.map(normalizeInventory);
  }

  function buildCoversTodayResponse() {
    var covers = clone(state.covers).sort(function(a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
    var totals = covers.reduce(function(acc, cover) {
      acc.total_amount += Number(cover.amount || 0);
      acc.total_entries += Number(cover.guests || 0);
      if (!cover.departure_time) acc.present_count += Number(cover.guests || 0);
      return acc;
    }, { total_amount: 0, total_entries: 0, present_count: 0 });
    return {
      ok: true,
      count: totals.present_count,
      covers: covers,
      totals: { total_amount: totals.total_amount, total_entries: totals.total_entries }
    };
  }

  function buildShiftCurrentResponse() {
    var shift = state.currentShift;
    if (!shift) return { ok: true, shift: null, sales: {}, byMethod: [] };
    var shiftStart = new Date(shift.started_at).getTime();
    var payments = state.payments.filter(function(payment) {
      return new Date(payment.created_at).getTime() >= shiftStart;
    });
    var byMethodMap = {};
    payments.forEach(function(payment) {
      byMethodMap[payment.method] = (byMethodMap[payment.method] || 0) + Number(payment.amount || 0);
    });
    var byMethod = Object.keys(byMethodMap).map(function(method) {
      return { method: method, total: byMethodMap[method] };
    });
    return {
      ok: true,
      shift: clone(shift),
      sales: {
        total_sales: payments.reduce(function(sum, payment) { return sum + Number(payment.amount || 0); }, 0),
        total_tips: payments.reduce(function(sum, payment) { return sum + Number(payment.tip || 0); }, 0),
        total_orders: payments.length
      },
      byMethod: byMethod
    };
  }

  function buildShiftHistoryResponse() {
    var history = clone(state.shiftHistory);
    if (state.currentShift) {
      var current = buildShiftCurrentResponse();
      history.unshift({
        id: state.currentShift.id,
        employee_name: state.currentShift.employee_name,
        started_at: state.currentShift.started_at,
        ended_at: null,
        cash_start: state.currentShift.cash_start,
        cash_end: null,
        total_sales: current.sales.total_sales || 0,
        order_count: current.sales.total_orders || 0
      });
    }
    return { ok: true, shifts: history };
  }

  function buildReportsResponse() {
    var completed = clone(state.completedOrders);
    var sales = completed.reduce(function(acc, order) {
      acc.total_sales += Number(order.total || 0);
      acc.total_tips += Number(order.tip || 0);
      acc.total_orders += 1;
      return acc;
    }, { total_sales: 0, total_tips: 0, total_orders: 0 });
    sales.avg_ticket = sales.total_orders ? Math.round(sales.total_sales / sales.total_orders) : 0;

    var byHour = [
      { hour: 18, sales: 820 },
      { hour: 19, sales: 1540 },
      { hour: 20, sales: 2380 },
      { hour: 21, sales: 3120 },
      { hour: 22, sales: 2740 },
      { hour: 23, sales: 1960 }
    ];

    var productMap = {};
    completed.forEach(function(order) {
      (order.items || []).forEach(function(item) {
        var key = item.name;
        if (!productMap[key]) productMap[key] = { name: item.name, icon: '🍻', qty: 0, revenue: 0 };
        productMap[key].qty += Number(item.quantity || 1);
        productMap[key].revenue += Number(item.total || 0);
      });
    });

    var employeeMap = {};
    completed.forEach(function(order) {
      var name = order.waiter_name || 'Equipo';
      if (!employeeMap[name]) employeeMap[name] = { name: name, orders_count: 0, total_sales: 0 };
      employeeMap[name].orders_count += 1;
      employeeMap[name].total_sales += Number(order.total || 0);
    });

    return {
      ok: true,
      sales: sales,
      byHour: byHour,
      topProducts: Object.keys(productMap).map(function(key) { return productMap[key]; }).sort(function(a, b) { return b.revenue - a.revenue; }),
      byEmployee: Object.keys(employeeMap).map(function(key) { return employeeMap[key]; }).sort(function(a, b) { return b.total_sales - a.total_sales; })
    };
  }

  function buildOrdersResponse() {
    return {
      ok: true,
      orders: clone(state.orders).sort(function(a, b) {
        return new Date(a.created_at) - new Date(b.created_at);
      })
    };
  }

  function findOrderAndTable(orderId) {
    var order = findOrder(orderId);
    if (!order) return null;
    return { order: order, table: findTable(order.table_id) };
  }

  function createOrder(body) {
    var table = findTable(body.table_id);
    if (!table) return { ok: false, error: 'Mesa no encontrada' };
    if (table.current_order_id) return { ok: false, error: 'La mesa ya tiene una orden abierta' };

    var order = {
      id: state.nextOrderId++,
      table_id: table.id,
      table_number: table.number,
      table_name: 'Mesa ' + table.number,
      waiter_name: 'Valeria Demo',
      waiter: 'Valeria Demo',
      guests: table.guests || 2,
      status: 'abierta',
      created_at: nowIso(),
      items: []
    };
    state.orders.push(order);
    syncTables();
    return { ok: true, order_id: order.id, order: clone(order) };
  }

  function addOrderItem(orderId, body) {
    var order = findOrder(orderId);
    if (!order) return { ok: false, error: 'Orden no encontrada' };
    var product = findProduct(body.product_id);
    if (!product) return { ok: false, error: 'Producto no encontrado' };
    var quantity = Math.max(1, parseInt(body.quantity, 10) || 1);
    var unitPrice = Number(product.price || 0);
    order.items.push({
      id: state.nextItemId++,
      product_id: product.id,
      quantity: quantity,
      total: unitPrice * quantity,
      status: 'pendiente',
      product_name: product.name,
      name: product.name,
      category: String(product.category_name || '').toLowerCase()
    });
    recalcOrder(order);
    return { ok: true, order_id: order.id };
  }

  function updateOrderItemStatus(itemId, body) {
    var found = findItem(itemId);
    if (!found) return { ok: false, error: 'Item no encontrado' };
    var nextStatus = String(body.status || '').toLowerCase();
    if (nextStatus === 'cancelado') {
      found.order.items = found.order.items.filter(function(item) {
        return Number(item.id) !== Number(itemId);
      });
    } else {
      found.item.status = nextStatus || found.item.status;
    }
    if (found.order.items.length === 0) {
      state.orders = state.orders.filter(function(order) {
        return Number(order.id) !== Number(found.order.id);
      });
    }
    syncTables();
    return { ok: true };
  }

  function deleteOrder(orderId) {
    state.orders = state.orders.filter(function(order) {
      return Number(order.id) !== Number(orderId);
    });
    syncTables();
    return { ok: true };
  }

  function listReservations(date) {
    return {
      ok: true,
      reservations: clone(state.reservations).filter(function(reservation) {
        return !date || reservation.date === date;
      }).sort(function(a, b) {
        return String(a.time).localeCompare(String(b.time));
      })
    };
  }

  function saveReservation(body) {
    var reservation = {
      id: state.nextReservationId++,
      name: body.name || 'Reservacion demo',
      phone: body.phone || '',
      date: body.date || new Date().toISOString().slice(0, 10),
      time: body.time || '21:00',
      guests: parseInt(body.guests, 10) || 2,
      table_id: body.table_id ? Number(body.table_id) : null,
      notes: body.notes || '',
      status: 'pendiente'
    };
    state.reservations.push(reservation);
    return { ok: true, reservation: clone(reservation), date: reservation.date };
  }

  function updateReservation(id, body) {
    var reservation = state.reservations.find(function(item) { return Number(item.id) === Number(id); });
    if (!reservation) return { ok: false, error: 'Reservacion no encontrada' };
    reservation.status = body.status || reservation.status;
    return { ok: true, reservation: clone(reservation) };
  }

  function saveCover(body) {
    var cover = {
      id: state.nextCoverId++,
      type: body.type || 'general',
      guests: parseInt(body.guests, 10) || 1,
      amount: Number(body.amount || 0),
      notes: body.notes || '',
      created_at: nowIso(),
      departure_time: null
    };
    state.covers.push(cover);
    return { ok: true, cover: clone(cover) };
  }

  function registerDeparture(id) {
    var cover = state.covers.find(function(item) { return Number(item.id) === Number(id); });
    if (!cover) return { ok: false, error: 'Entrada no encontrada' };
    cover.departure_time = nowIso();
    return { ok: true, cover: clone(cover) };
  }

  function activeHappyHour() {
    return {
      ok: true,
      is_happy_hour: true,
      active: [
        {
          name: 'Happy Hour Karaoke',
          discount_pct: 25,
          end_time: '23:30'
        }
      ]
    };
  }

  function saveInventory(body, id) {
    if (id) {
      var current = findProduct(id);
      if (!current) return { ok: false, error: 'Producto no encontrado' };
      current.name = body.name || current.name;
      current.stock = Number(body.current_stock);
      current.min_stock = Number(body.min_stock);
      current.cost = Number(body.cost_per_unit);
      current.price = Number(body.price);
      current.unit = body.unit || current.unit;
      normalizeInventory(current);
      return { ok: true, product: clone(current) };
    }

    var product = normalizeInventory({
      id: state.nextProductId++,
      category_id: 4,
      category_name: 'Botanas',
      name: body.name || 'Nuevo producto demo',
      icon: '🧾',
      stock: Number(body.current_stock || 0),
      min_stock: Number(body.min_stock || 5),
      cost: Number(body.cost_per_unit || 0),
      price: Number(body.price || 0),
      unit: body.unit || 'pza'
    });
    state.products.push(product);
    return { ok: true, product: clone(product) };
  }

  function adjustInventory(id, body) {
    var product = findProduct(id);
    if (!product) return { ok: false, error: 'Producto no encontrado' };
    if (Number(product.stock) === -1) return { ok: true, new_stock: -1 };
    var qty = Number(body.quantity || 0);
    if (body.type === 'waste' || body.type === 'sale') product.stock = Math.max(0, Number(product.stock) - qty);
    else product.stock = Number(product.stock) + qty;
    normalizeInventory(product);
    return { ok: true, new_stock: product.stock };
  }

  function openShift(body) {
    if (state.currentShift) return { ok: false, error: 'Ya hay un turno abierto' };
    state.currentShift = {
      id: state.nextShiftId++,
      employee_id: 101,
      employee_name: 'Valeria Demo',
      started_at: nowIso(),
      cash_start: Number(body.opening_cash || 0),
      cash_end: null
    };
    return { ok: true, shift: clone(state.currentShift) };
  }

  function closeShift(id, body) {
    if (!state.currentShift || Number(state.currentShift.id) !== Number(id)) return { ok: false, error: 'Turno no encontrado' };
    var closingCash = Number(body.closing_cash || 0);
    var expected = buildShiftCurrentResponse();
    var efectivo = (expected.byMethod.find(function(method) { return method.method === 'efectivo'; }) || {}).total || 0;
    var variance = closingCash - (Number(state.currentShift.cash_start || 0) + Number(efectivo || 0));
    var closed = clone(state.currentShift);
    closed.ended_at = nowIso();
    closed.cash_end = closingCash;
    closed.total_sales = expected.sales.total_sales || 0;
    closed.order_count = expected.sales.total_orders || 0;
    state.shiftHistory.unshift(closed);
    state.currentShift = null;
    return { ok: true, variance: Math.round(variance) };
  }

  function processPayment(body) {
    var lookup = findOrderAndTable(body.order_id);
    if (!lookup) return { ok: false, error: 'Orden no encontrada' };
    var tip = Number(body.tip || 0);
    var amount = Number(body.amount || 0) + tip;
    var payment = {
      id: state.nextPaymentId++,
      order_id: Number(body.order_id),
      method: body.method || 'efectivo',
      amount: Number(body.amount || 0),
      tip: tip,
      cash_received: Number(body.cash_received || 0),
      change: 0,
      created_at: nowIso()
    };
    if (payment.method === 'efectivo' && payment.cash_received > 0) payment.change = Math.max(0, payment.cash_received - amount);
    state.payments.push(payment);
    state.completedOrders.unshift({
      id: lookup.order.id,
      table_number: lookup.order.table_number,
      created_at: lookup.order.created_at,
      waiter_name: lookup.order.waiter_name,
      items: clone(lookup.order.items),
      subtotal: Number(body.subtotal || lookup.order.subtotal || 0),
      total: amount,
      tip: tip
    });
    deleteOrder(lookup.order.id);
    return { ok: true, payment: clone(payment), change: payment.change };
  }

  function karaokeQueue(tableId) {
    var queue = clone(state.karaoke).filter(function(item) {
      return !tableId || Number(item.table_id) === Number(tableId);
    }).sort(function(a, b) {
      return Number(a.position || 0) - Number(b.position || 0);
    });
    return { ok: true, queue: queue };
  }

  function addKaraoke(body) {
    var table = findTable(body.table_id);
    if (!table) return { ok: false, error: 'Mesa no encontrada' };
    var queue = state.karaoke.filter(function(item) { return Number(item.table_id) === Number(table.id); });
    var nextPosition = queue.length ? Math.max.apply(null, queue.map(function(item) { return Number(item.position || 0); })) + 1 : 1;
    var song = {
      id: state.nextKaraokeId++,
      table_id: table.id,
      table_number: table.number,
      song_title: body.song_title || 'Cancion demo',
      singer_name: body.singer_name || ('Mesa ' + table.number),
      position: nextPosition,
      status: 'en cola'
    };
    state.karaoke.push(song);
    syncTables();
    return { ok: true, song: clone(song) };
  }

  function buildAiResponse(prompt) {
    var text = String(prompt || '').toLowerCase();
    if (text.indexOf('inventario') !== -1) return 'Demo IA: tu stock mas fragil esta en mixers premium y boneless. Sugerencia: recompra en 24 horas y activa combo karaoke + botanita para subir margen.';
    if (text.indexOf('compet') !== -1 || text.indexOf('mercado') !== -1) return 'Demo IA: frente a un POS legacy, ByFlow gana en karaoke integrado, operacion multi-dispositivo y velocidad de adopcion. El mensaje comercial recomendado es "menos friccion operativa, mas venta por mesa".';
    if (text.indexOf('cfdi') !== -1 || text.indexOf('iva') !== -1) return 'Demo IA: venta ejemplo de $5,000 MXN con IVA 16% = subtotal $4,310.34, IVA $689.66, total $5,000.00. El modulo CFDI queda listo para preparar la factura de la ultima venta.';
    if (text.indexOf('landing') !== -1 || text.indexOf('flyer') !== -1 || text.indexOf('post') !== -1) return '<section><h1>ByFlow Night Mode</h1><p>Demo builder: landing promocional para noche de karaoke con CTA a WhatsApp y oferta happy hour.</p></section>';
    return 'Demo IA: ByFlow centraliza mesas, barra, karaoke, covers, inventario y corte en una sola operacion. Esta respuesta es simulada para showroom comercial.';
  }

  function handleDemoRequest(method, parsed, init) {
    var path = parsed.pathname;
    var body = parseBody(init);
    var match;

    if (path === '/pos/settings' && method === 'GET') return fakeResponse({ ok: true, settings: state.settings });
    if (path === '/pos/tables' && method === 'GET') {
      syncTables();
      return fakeResponse(clone(state.tables));
    }
    if (path === '/pos/products' && method === 'GET') {
      var categoryId = parsed.searchParams.get('category_id');
      var items = state.products.filter(function(product) {
        return !categoryId || String(product.category_id) === String(categoryId);
      });
      return fakeResponse({ ok: true, products: items });
    }
    if (path === '/pos/orders' && method === 'GET') return fakeResponse(buildOrdersResponse());
    if (path === '/pos/orders' && method === 'POST') return fakeResponse(createOrder(body));

    match = path.match(/^\/pos\/orders\/(\d+)$/);
    if (match && method === 'GET') {
      var order = findOrder(match[1]);
      if (!order) return fakeResponse({ ok: false, error: 'Orden no encontrada' }, 404);
      return fakeResponse({ ok: true, order: clone(order), items: clone(order.items) });
    }
    if (match && method === 'DELETE') return fakeResponse(deleteOrder(match[1]));

    match = path.match(/^\/pos\/orders\/(\d+)\/items$/);
    if (match && method === 'POST') return fakeResponse(addOrderItem(match[1], body));

    match = path.match(/^\/pos\/order-items\/(\d+)\/status$/);
    if (match && method === 'PUT') return fakeResponse(updateOrderItemStatus(match[1], body));

    if (path === '/pos/reservations' && method === 'GET') return fakeResponse(listReservations(parsed.searchParams.get('date')));
    if (path === '/pos/reservations' && method === 'POST') return fakeResponse(saveReservation(body));

    match = path.match(/^\/pos\/reservations\/(\d+)$/);
    if (match && method === 'PUT') return fakeResponse(updateReservation(match[1], body));

    if (path === '/pos/covers/today' && method === 'GET') return fakeResponse(buildCoversTodayResponse());
    if (path === '/pos/covers' && method === 'POST') return fakeResponse(saveCover(body));

    match = path.match(/^\/pos\/covers\/(\d+)\/departure$/);
    if (match && method === 'PUT') return fakeResponse(registerDeparture(match[1]));

    if (path === '/pos/happy-hour/active' && method === 'GET') return fakeResponse(activeHappyHour());
    if (path === '/pos/inventory' && method === 'GET') return fakeResponse({ ok: true, products: inventoryList() });
    if (path === '/pos/inventory' && method === 'POST') return fakeResponse(saveInventory(body));

    match = path.match(/^\/pos\/inventory\/(\d+)$/);
    if (match && method === 'PUT') return fakeResponse(saveInventory(body, match[1]));

    match = path.match(/^\/pos\/inventory\/(\d+)\/adjust$/);
    if (match && method === 'POST') return fakeResponse(adjustInventory(match[1], body));

    if (path === '/pos/reports/today' && method === 'GET') return fakeResponse(buildReportsResponse());
    if (path === '/pos/reports/range' && method === 'GET') return fakeResponse(buildReportsResponse());
    if (path === '/pos/shifts/current' && method === 'GET') return fakeResponse(buildShiftCurrentResponse());
    if (path === '/pos/shifts' && method === 'GET') return fakeResponse(buildShiftHistoryResponse());
    if (path === '/pos/shifts' && method === 'POST') return fakeResponse(openShift(body));

    match = path.match(/^\/pos\/shifts\/(\d+)\/close$/);
    if (match && method === 'PUT') return fakeResponse(closeShift(match[1], body));

    if (path === '/pos/payments' && method === 'POST') return fakeResponse(processPayment(body));
    if (path === '/pos/karaoke/queue' && method === 'GET') return fakeResponse(karaokeQueue(parsed.searchParams.get('table_id')));
    if (path === '/pos/karaoke/queue' && method === 'POST') return fakeResponse(addKaraoke(body));
    if (path === '/api/ai/chat' && method === 'POST') return fakeResponse({ text: buildAiResponse(body.prompt) });

    return fakeResponse({ ok: true, demo: true });
  }

  seedSession();
  syncTables();
  window.addEventListener('pagehide', restoreSession);

  var originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  window.fetch = function(input, init) {
    var rawUrl = typeof input === 'string' ? input : ((input && input.url) || '');
    var method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
    try {
      var parsed = new URL(rawUrl, window.location.origin);
      if (parsed.pathname.indexOf('/pos/') === 0 || parsed.pathname === '/api/ai/chat') {
        return handleDemoRequest(method, parsed, init);
      }
    } catch (_) {}
    if (originalFetch) return originalFetch(input, init);
    return fakeResponse({ ok: false, error: 'Fetch no disponible' }, 500);
  };

  window.__BYFLOW_POS_DEMO__ = {
    active: true,
    state: state
  };
})(window);

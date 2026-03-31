
// â•â•â• XSS PROTECTION â•â•â•
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// â•â•â• NAVIGATION â•â•â•
function showView(id, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('v-' + id);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav').forEach(n => n.classList.remove('active'));
  const navEl = el || (typeof event !== 'undefined' && event && event.currentTarget);
  if (navEl) navEl.classList.add('active');
  // Trigger data loading for dynamic views
  if (id === 'comandas') loadComandas();
  if (id === 'cocina') loadCocina();
  if (id === 'inventario') loadInventory();
  if (id === 'reportes') loadReports();
  if (id === 'corte') loadCorte();
}

// â•â•â• TABLE SELECTION â•â•â•
function selT(n, el) {
  document.getElementById('pos-mesa').textContent = (typeof n === 'string' ? n : 'Mesa ' + n);
  document.querySelectorAll('.tc').forEach(c => { c.style.outline = 'none'; c.style.outlineOffset = ''; });
  const tcEl = el || (typeof event !== 'undefined' && event && event.currentTarget);
  if (tcEl) {
    tcEl.style.outline = '2px solid var(--orange)';
    tcEl.style.outlineOffset = '2px';
  }
  toast('Mesa ' + n + ' seleccionada', 'info');
  // On mobile (<= 600px) open POS overlay automatically
  if (window.innerWidth <= 600) openPosOverlay();
}

// â•â•â• ORDER MANAGEMENT â•â•â•
let orderTotal = 0;
let orderCount = 0;
let isHappyHour = false;

function getCurrentEmployeeId() {
  var empData = null;
  try { empData = JSON.parse(sessionStorage.getItem('pos_employee')); } catch (_) {}
  return empData && empData.id ? parseInt(empData.id, 10) : null;
}

function getCurrentHappyHourRate() {
  if (!isHappyHour || !window._hhActive || !window._hhActive.length) return 0;
  var pct = parseFloat(window._hhActive[0].discount_pct);
  if (!isFinite(pct) || pct <= 0) return 0;
  return pct > 1 ? (pct / 100) : pct;
}

function getOrderFinancials(subtotal) {
  var cobrarState = window._cobrarState || {};
  var taxRate = cobrarState.taxRate || 0.16;
  var hhRate = getCurrentHappyHourRate();
  var discount = hhRate > 0 ? Math.round(subtotal * hhRate) : 0;
  var afterDiscount = subtotal - discount;
  var tax = Math.round(afterDiscount * taxRate);
  return {
    discount: discount,
    tax: tax,
    total: afterDiscount + tax
  };
}

function getOrderListTargets() {
  return ['order-list', 'order-list-overlay']
    .map(function(id) { return document.getElementById(id); })
    .filter(Boolean);
}

function resetRenderedOrder() {
  getOrderListTargets().forEach(function(list) { list.innerHTML = ''; });
  orderTotal = 0;
  orderCount = 0;
  updateTotals();
}

function setPosMeta(metaHtml) {
  var metaEl = document.querySelector('.ph-g');
  if (metaEl) metaEl.innerHTML = metaHtml;
}

function renderOrderLines(items) {
  var html = items.map(function(item) {
    var qty = parseInt(item.quantity != null ? item.quantity : item.qty, 10) || 1;
    var name = item.product_name || item.name || '?';
    var total = Number(item.total || 0);
    var status = String(item.status || 'pendiente').toLowerCase();
    var actionHtml = status === 'pendiente'
      ? '<span class="ol-x" onclick="removeItem(this)">&#x2715;</span>'
      : '<span class="ol-p" style="font-size:10px;text-transform:uppercase;">' + escapeHtml(status) + '</span>';
    return '<div class="ol" data-item-id="' + (item.id || '') + '" data-item-status="' + escapeHtml(status) + '">' +
      '<span class="ol-q">' + qty + '</span>' +
      '<span class="ol-n">' + escapeHtml(name) + '</span>' +
      '<span class="ol-p">$' + total.toLocaleString() + '</span>' +
      actionHtml +
      '</div>';
  }).join('');

  getOrderListTargets().forEach(function(list) {
    list.innerHTML = html;
    list.scrollTop = list.scrollHeight;
  });
}

function syncCurrentOrder(options) {
  options = options || {};
  var orderId = options.orderId || _cobrarState.orderId;
  if (!orderId) {
    _cobrarState.items = [];
    _cobrarState.subtotal = 0;
    _cobrarState.discount = 0;
    _cobrarState.tax = 0;
    _cobrarState.total = 0;
    resetRenderedOrder();
    return Promise.resolve(null);
  }

  return fetch('/pos/orders/' + orderId, { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      if (data && data.ok === false) return Promise.reject(data.error || 'Orden no encontrada');
      var order = data.order || {};
      var items = data.items || order.items || [];
      var subtotal = Number(order.subtotal != null ? order.subtotal : items.reduce(function(sum, item) {
        return sum + (Number(item.total) || 0);
      }, 0));
      var financials = getOrderFinancials(subtotal);

      _cobrarState.orderId = order.id || orderId;
      if (order.table_id) _cobrarState.tableId = order.table_id;
      if (order.table_number) _cobrarState.tableName = 'Mesa ' + order.table_number;
      _cobrarState.items = items.map(function(item) {
        return {
          id: item.id,
          qty: parseInt(item.quantity, 10) || 1,
          name: item.product_name || item.name || '',
          total: Number(item.total || 0),
          status: item.status || 'pendiente'
        };
      });
      _cobrarState.subtotal = subtotal;
      _cobrarState.discount = financials.discount;
      _cobrarState.tax = financials.tax;
      _cobrarState.total = financials.total;

      orderTotal = subtotal;
      orderCount = items.reduce(function(sum, item) {
        return sum + (parseInt(item.quantity, 10) || 1);
      }, 0);

      renderOrderLines(items);
      updateTotals();

      var guests = parseInt(order.guests || order.table_guests, 10) || 0;
      var waiterName = order.waiter_name || 'Sin asignar';
      setPosMeta((guests ? guests + ' pers &bull; ' : '') + 'Mesero: ' + escapeHtml(waiterName));
      return { order: order, items: items };
    })
    .catch(function(err) {
      if (!options.silent) toast('Error cargando orden: ' + err, 'error');
      throw err;
    });
}

function addI(name, price, el, productId) {
  if (!_cobrarState.orderId) {
    toast('Selecciona una mesa primero', 'warn');
    return;
  }
  // Flash feedback immediately for responsiveness
  var piEl = el || (typeof event !== 'undefined' && event && event.currentTarget);
  if (piEl) {
    piEl.style.background = 'rgba(255,138,0,.15)';
    piEl.style.transform = 'scale(.94)';
    setTimeout(function() {
      piEl.style.background = '';
      piEl.style.transform = '';
    }, 200);
  }

  // Save item to DB
  fetch('/pos/orders/' + _cobrarState.orderId + '/items', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ product_id: productId, quantity: 1 })
  })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      if (data && data.ok === false) return Promise.reject(data.error || 'No se pudo agregar el item');
      return syncCurrentOrder({ orderId: _cobrarState.orderId, silent: true }).then(function() {
        toast(name + ' agregado - $' + price, 'success');
      });
    })
    .catch(function(err) {
      toast('Error agregando ' + name + ': ' + err, 'error');
    });
}

function removeItem(el) {
  var line = el && el.closest ? el.closest('.ol') : null;
  if (!line) return;

  var itemId = parseInt(line.getAttribute('data-item-id'), 10);
  var itemStatus = String(line.getAttribute('data-item-status') || 'pendiente').toLowerCase();
  if (!itemId) {
    toast('No se pudo identificar el item a cancelar', 'warn');
    return;
  }
  if (itemStatus !== 'pendiente') {
    toast('Solo puedes cancelar items pendientes antes de enviarlos', 'warn');
    return;
  }

  line.style.pointerEvents = 'none';
  line.style.opacity = '0.5';

  fetch('/pos/order-items/' + itemId + '/status', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({
      status: 'cancelado',
      cancelled_by: getCurrentEmployeeId(),
      cancel_reason: 'Cancelado desde la comanda'
    })
  })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      if (data && data.ok === false) return Promise.reject(data.error || 'No se pudo cancelar el item');
      return syncCurrentOrder({ orderId: _cobrarState.orderId, silent: true }).then(function() {
        toast('Item cancelado', 'warn');
      });
    })
    .catch(function(err) {
      line.style.pointerEvents = '';
      line.style.opacity = '';
      toast('Error cancelando item: ' + err, 'error');
    });
}

function clearOrder() {
  if (!_cobrarState.orderId) {
    resetRenderedOrder();
    toast('Orden limpiada', 'warn');
    return;
  }

  fetch('/pos/orders/' + _cobrarState.orderId, { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      if (data && data.ok === false) return Promise.reject(data.error || 'Orden no encontrada');
      var items = data.items || (data.order && data.order.items) || [];
      if (items.length === 0) {
        return fetch('/pos/orders/' + _cobrarState.orderId, {
          method: 'DELETE',
          headers: authHeaders()
        }).then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); });
      }

      var pending = items.filter(function(item) {
        return String(item.status || 'pendiente').toLowerCase() === 'pendiente';
      });
      if (pending.length !== items.length) {
        toast('Solo se pueden limpiar items pendientes antes de enviarlos', 'warn');
        return null;
      }

      return Promise.all(pending.map(function(item) {
        return fetch('/pos/order-items/' + item.id + '/status', {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({
            status: 'cancelado',
            cancelled_by: getCurrentEmployeeId(),
            cancel_reason: 'Limpieza completa de orden'
          })
        }).then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); });
      }))
        .then(function() {
          return fetch('/pos/orders/' + _cobrarState.orderId, {
            method: 'DELETE',
            headers: authHeaders()
          }).then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); });
        });
    })
    .then(function(data) {
      if (!data) return;
      if (data && data.ok === false) return Promise.reject(data.error || 'No se pudo limpiar la orden');
      _cobrarState.orderId = null;
      _cobrarState.items = [];
      _cobrarState.subtotal = 0;
      _cobrarState.discount = 0;
      _cobrarState.tax = 0;
      _cobrarState.total = 0;
      resetRenderedOrder();
      loadTables();
      toast('Orden limpiada', 'warn');
    })
    .catch(function(err) {
      toast('Error limpiando orden: ' + err, 'error');
    });
}

function updateTotals() {
  const subtotal = orderTotal;
  const financials = getOrderFinancials(subtotal);
  const hhDisc = financials.discount;
  const iva = financials.tax;
  const total = financials.total;
  const hhLine = hhDisc > 0
    ? '<div class="tr disc"><span>&#x1F37A; Happy Hour</span><span>-$' + hhDisc.toLocaleString() + '</span></div>'
    : '';
  const totalsHTML =
    '<div class="tr"><span>Subtotal</span><span>$' + subtotal.toLocaleString() + '</span></div>' +
    hhLine +
    '<div class="tr"><span>IVA 16%</span><span>$' + iva.toLocaleString() + '</span></div>' +
    '<div class="tr grand"><span>Total</span><span>$' + total.toLocaleString() + '</span></div>';
  document.getElementById('totals-area').innerHTML = totalsHTML;
  const overlayTotals = document.getElementById('totals-area-overlay');
  if (overlayTotals) overlayTotals.innerHTML = totalsHTML;
  const orderHeaderHTML = '&#x1F4CB; Orden (' + orderCount + ') <span onclick="clearOrder()">Limpiar</span>';
  document.querySelector('.order-h').innerHTML = orderHeaderHTML;
  const overlayOrderH = document.querySelector('#pos-sheet-inner .order-h');
  if (overlayOrderH) overlayOrderH.innerHTML = orderHeaderHTML;
  // Update FAB badge
  const badge = document.getElementById('fab-badge');
  if (badge) badge.textContent = orderCount;
}

// â•â•â• MOBILE POS OVERLAY â•â•â•
function openPosOverlay() {
  const overlay = document.getElementById('pos-overlay');
  const inner = document.getElementById('pos-sheet-inner');
  // Clone the desktop POS content into the overlay (excluding the outer .pos div)
  const posEl = document.querySelector('.pos');
  inner.innerHTML = posEl.innerHTML;
  // Remap IDs to avoid duplicate IDs
  const clonedOrderList = inner.querySelector('#order-list');
  if (clonedOrderList) clonedOrderList.id = 'order-list-overlay';
  const clonedTotals = inner.querySelector('#totals-area');
  if (clonedTotals) clonedTotals.id = 'totals-area-overlay';
  const clonedPosMesa = inner.querySelector('#pos-mesa');
  if (clonedPosMesa) clonedPosMesa.removeAttribute('id');
  // Wire up category buttons in the overlay
  const cats = inner.querySelectorAll('.cat-bar .cc');
  const catMap = ['cervezas','cocktails','shots','botanas','comida','refrescos'];
  cats.forEach((c, i) => { c.onclick = () => switchCat(catMap[i], c); });
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePosOverlay(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('pos-overlay-backdrop') && e.target.id !== 'pos-overlay') return;
  const overlay = document.getElementById('pos-overlay');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

// â•â•â• CATEGORY SWITCHING (API-based) â•â•â•
// Category name â†’ API category_id mapping (1-indexed)
var _catIdMap = { cervezas: 1, cocktails: 2, shots: 3, botanas: 4, comida: 5, refrescos: 6 };

function switchCat(cat, el) {
  document.querySelectorAll('.cc').forEach(function(c) { c.classList.remove('active'); });
  el.classList.add('active');
  loadProducts(_catIdMap[cat] || 1);
}

// â•â•â• TOAST NOTIFICATIONS â•â•â•
function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100px)'; }, 2500);
  setTimeout(() => t.remove(), 3000);
}

// â•â•â• POS ACTIONS â•â•â•
function posAction(action) {
  var actions = {
    enviar: function() { enviarComanda(); },
    cobrar: function() { openCobrarModal(); },
    dividir: function() { toast('Selecciona items para dividir', 'info'); },
    cancion: function() { toast('Abriendo cola de karaoke para esta mesa', 'info'); },
    ticket: function() { openTicketPreview(); },
    cfdi: function() { toast('Abriendo facturacion CFDI 4.0', 'info'); }
  };
  if (actions[action]) actions[action]();
}

function enviarComanda() {
  var orderId = _cobrarState.orderId;
  if (!orderId) { toast('Selecciona una mesa con orden abierta', 'warn'); return; }

  // Fetch order items, then update pending ones to 'enviado'
  fetch('/pos/orders/' + orderId, { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      var order = data.order || data;
      var items = data.items || order.items || [];
      var pending = items.filter(function(it) {
        return (it.status || '').toLowerCase() === 'pendiente';
      });
      if (pending.length === 0) {
        toast('No hay items pendientes para enviar', 'info');
        return Promise.resolve([]);
      }
      // Send all pending items in parallel
      var promises = pending.map(function(it) {
        return fetch('/pos/order-items/' + it.id + '/status', {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ status: 'enviado' })
        })
          .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
          .then(function(resp) {
            if (resp && resp.ok === false) return Promise.reject(resp.error || 'No se pudo enviar el item');
            return resp;
          });
      });
      return Promise.all(promises);
    })
    .then(function(results) {
      if (results && results.length > 0) {
        // Emit socket event if connected
        if (typeof io !== 'undefined' && window._posSocket) {
          window._posSocket.emit('comanda_enviada', { order_id: orderId });
        }
        syncCurrentOrder({ orderId: orderId, silent: true }).catch(function() {});
        toast('Comanda enviada a cocina y barra (' + results.length + ' items)', 'success');
      }
    })
    .catch(function(err) {
      toast('Error enviando comanda: ' + err, 'error');
    });
}

// â•â•â• COMANDAS VIEW â€” Real data â•â•â•
var _comandasTimer = null;

function loadComandas() {
  clearInterval(_comandasTimer);
  _fetchComandas();
  _comandasTimer = setInterval(_fetchComandas, 15000);
}

function _fetchComandas() {
  fetch('/pos/orders', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      var orders = (data.orders || data || []);
      var active = orders.filter(function(o) {
        var st = (o.status || '').toLowerCase();
        return st !== 'pagada' && st !== 'cancelada';
      });
      renderComandas(active);
      var badge = document.getElementById('comandas-count');
      if (badge) badge.textContent = active.length;
    })
    .catch(function(err) {
      var grid = document.getElementById('comandas-grid');
      if (grid) grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);font-size:12px;">Error cargando comandas (' + err + ')</div>';
    });
}

function renderComandas(orders) {
  var grid = document.getElementById('comandas-grid');
  if (!grid) return;
  if (orders.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sub);font-size:12px;">No hay comandas activas</div>';
    return;
  }
  var now = Date.now();
  grid.innerHTML = orders.map(function(order) {
    var mesa = order.table_name || order.table_number || 'Mesa ?';
    var mesero = order.waiter || order.mesero || '---';
    var createdAt = order.created_at ? new Date(order.created_at).getTime() : now;
    var elapsedMin = Math.round((now - createdAt) / 60000);
    var timeClass = elapsedMin < 10 ? 'ok' : (elapsedMin < 20 ? 'warn' : 'late');
    var timeStr = elapsedMin + ' min';
    var items = order.items || [];
    var itemsHtml = items.map(function(it) {
      var st = (it.status || 'pendiente').toLowerCase();
      var badgeCls = st === 'listo' ? 'ki-badge-lista' : (st === 'preparando' ? 'ki-badge-preparando' : 'ki-badge-pendiente');
      return '<div class="k-item"><span class="ki-q">' + (it.quantity || 1) + 'x</span><span class="ki-n">' + escapeHtml(it.name || it.product_name || '?') + '</span><span class="ki-status ' + badgeCls + '">' + escapeHtml(st) + '</span></div>';
    }).join('');
    return '<div class="k-card' + (elapsedMin >= 20 ? ' urgent' : '') + '" style="animation:fadeIn .3s;">' +
      '<div class="k-head"><span>&#x1F37B;</span><span class="kh-mesa">' + escapeHtml(String(mesa)) + '</span><span style="font-size:9px;color:var(--sub);">' + escapeHtml(mesero) + '</span><span class="kh-time ' + timeClass + '">' + timeStr + '</span></div>' +
      '<div class="k-items">' + (itemsHtml || '<div style="font-size:10px;color:var(--sub);padding:4px 0;">Sin items</div>') + '</div>' +
      '<div class="k-foot"><div style="font-size:9px;color:var(--sub);">Estado: ' + escapeHtml(order.status || '?') + '</div><div style="margin-left:auto;font-size:11px;font-weight:700;color:var(--orange);">$' + (order.total || 0) + '</div></div>' +
    '</div>';
  }).join('');
}

// â•â•â• KITCHEN MONITOR â€” Real data â•â•â•
var _cocinaTimer = null;
var _cocinaFilter = 'todo';

function setCocinaFilter(el, filter) {
  _cocinaFilter = filter;
  document.querySelectorAll('.cocina-filter').forEach(function(c) { c.classList.remove('active'); });
  el.classList.add('active');
  _fetchCocina();
}

function loadCocina() {
  clearInterval(_cocinaTimer);
  _fetchCocina();
  _cocinaTimer = setInterval(_fetchCocina, 10000);
}

function _fetchCocina() {
  fetch('/pos/orders', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      var orders = (data.orders || data || []);
      renderCocina(orders);
    })
    .catch(function(err) {
      var grid = document.getElementById('cocina-grid');
      if (grid) grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);font-size:12px;">Error cargando cocina (' + err + ')</div>';
    });
}

function renderCocina(orders) {
  var grid = document.getElementById('cocina-grid');
  if (!grid) return;
  var now = Date.now();
  var tables = {};
  orders.forEach(function(order) {
    var st = (order.status || '').toLowerCase();
    if (st === 'pagada' || st === 'cancelada') return;
    var items = (order.items || []).filter(function(it) {
      var itemSt = (it.status || 'pendiente').toLowerCase();
      return itemSt === 'pendiente' || itemSt === 'preparando';
    });
    if (items.length === 0) return;
    var mesa = order.table_name || order.table_number || 'Mesa ?';
    var key = String(mesa);
    if (!tables[key]) {
      tables[key] = { mesa: mesa, created_at: order.created_at, items: [] };
    }
    items.forEach(function(it) {
      tables[key].items.push({
        id: it.id || it._id || null,
        name: it.name || it.product_name || '?',
        quantity: it.quantity || 1,
        status: (it.status || 'pendiente').toLowerCase(),
        notes: it.notes || it.note || '',
        category: (it.category || '').toLowerCase()
      });
    });
  });
  var tableKeys = Object.keys(tables);
  if (tableKeys.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sub);font-size:12px;">Sin ordenes pendientes en cocina</div>';
    return;
  }
  tableKeys.sort(function(a, b) {
    var ta = tables[a].created_at ? new Date(tables[a].created_at).getTime() : now;
    var tb = tables[b].created_at ? new Date(tables[b].created_at).getTime() : now;
    return ta - tb;
  });
  grid.innerHTML = tableKeys.map(function(key) {
    var t = tables[key];
    var createdAt = t.created_at ? new Date(t.created_at).getTime() : now;
    var elapsedMin = Math.round((now - createdAt) / 60000);
    var timeClass = elapsedMin < 10 ? 'ok' : (elapsedMin < 20 ? 'warn' : 'late');
    var timeStr = elapsedMin + ' min';
    var filteredItems = t.items;
    if (_cocinaFilter === 'cocina') {
      filteredItems = t.items.filter(function(it) {
        var cat = it.category;
        return cat !== 'bebidas' && cat !== 'cervezas' && cat !== 'cocktails' && cat !== 'shots' && cat !== 'refrescos' && cat !== 'drinks';
      });
    } else if (_cocinaFilter === 'barra') {
      filteredItems = t.items.filter(function(it) {
        var cat = it.category;
        return cat === 'bebidas' || cat === 'cervezas' || cat === 'cocktails' || cat === 'shots' || cat === 'refrescos' || cat === 'drinks';
      });
    }
    if (filteredItems.length === 0) return '';
    var itemsHtml = filteredItems.map(function(it) {
      var isPending = it.status === 'pendiente';
      var btnHtml = '';
      if (it.id) {
        if (isPending) {
          btnHtml = '<button class="k-btn progress" onclick="kitchenAction(this,\'' + it.id + '\',\'preparando\')" style="padding:3px 6px;font-size:9px;">&#x1F373; Preparando</button>';
        }
        btnHtml += '<button class="k-btn ready" onclick="kitchenAction(this,\'' + it.id + '\',\'listo\')" style="padding:3px 6px;font-size:9px;">&#x2705; Lista</button>';
      }
      return '<div class="k-item" style="flex-wrap:wrap;"><span class="ki-q">' + it.quantity + 'x</span><span class="ki-n">' + escapeHtml(it.name) + '</span>' +
        (it.notes ? '<span class="ki-note">' + escapeHtml(it.notes) + '</span>' : '') +
        '<span class="ki-status ' + (isPending ? 'ki-badge-pendiente' : 'ki-badge-preparando') + '">' + it.status + '</span>' +
        (btnHtml ? '<div style="width:100%;display:flex;gap:4px;margin-top:4px;">' + btnHtml + '</div>' : '') +
        '</div>';
    }).join('');
    return '<div class="k-card' + (elapsedMin >= 20 ? ' urgent' : '') + '" style="animation:fadeIn .3s;">' +
      '<div class="k-head"><span>&#x1F37B;</span><span class="kh-mesa">' + escapeHtml(String(t.mesa)) + '</span><span class="kh-time ' + timeClass + '">' + timeStr + '</span></div>' +
      '<div class="k-items">' + itemsHtml + '</div>' +
    '</div>';
  }).join('');
}

function kitchenAction(btn, itemId, newStatus) {
  btn.disabled = true;
  btn.style.opacity = '0.5';
  fetch('/pos/order-items/' + itemId + '/status', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ status: newStatus })
  })
    .then(function(r) {
      if (!r.ok) return Promise.reject(r.status);
      return r.json();
    })
    .then(function(data) {
      if (data && data.ok === false) return Promise.reject(data.error || 'No se pudo actualizar el item');
      toast(newStatus === 'listo' ? 'Item listo - notificando mesero' : 'Marcado en preparacion', newStatus === 'listo' ? 'success' : 'info');
      _fetchCocina();
    })
    .catch(function(err) {
      toast('Error actualizando item (' + err + ')', 'error');
      btn.disabled = false;
      btn.style.opacity = '1';
    });
}

// â•â•â• CLOCK â•â•â•
setInterval(() => {
  const d = new Date();
  document.getElementById('clock').textContent = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}, 1000);

// â•â•â• HAPPY HOUR TIMER â•â•â•
let hhTime = 44*60+32;
setInterval(() => {
  if(hhTime<=0) {
    document.getElementById('hh').textContent='TERMINADO';
    document.getElementById('hh').style.color='var(--red)';
    return;
  }
  hhTime--;
  const m=Math.floor(hhTime/60),s=hhTime%60;
  document.getElementById('hh').textContent='0:'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
},1000);

// â•â•â• TOUR SYSTEM â•â•â•
const tourSteps = [
  { el: '.topbar', msg: 'ðŸ” BARRA SUPERIOR â€” Aqui ves el nombre del bar, estado operativo, Happy Hour activo, cover, QR menu, delivery, notificaciones y reloj en vivo.', pos: 'bottom' },
  { el: '.sidebar', msg: 'ðŸ“‹ SIDEBAR â€” Navegacion principal. 3 secciones: Operacion (mesas, comandas, karaoke, cobro), Produccion (cocina, barra, inventario) y Admin (reportes, corte, CFDI, empleados). Abajo ves las stats del dia en tiempo real.', pos: 'right' },
  { el: '.grid', msg: 'ðŸ—ºï¸ MAPA DE MESAS â€” Vista en vivo de todo el piso. Verde=libre, Naranja=ocupada, Rosa=cantando karaoke, Azul=reservada, Amarillo=pidio cuenta, Morado=tab abierto. Click en cualquier mesa para cargarla en el POS.', pos: 'top' },
  { el: '.promo', msg: 'ðŸº HAPPY HOUR â€” Banner con timer en vivo. El descuento se aplica AUTOMATICAMENTE cuando cobras. Se configura desde Admin: horarios, productos, % descuento.', pos: 'bottom' },
  { el: '.pos', msg: 'ðŸ’° PANEL POS â€” El corazon del sistema. 4 tabs: Comanda (agregar productos), Cobrar (efectivo/tarjeta/dividir), Karaoke (cola de canciones de la mesa), QR (codigo para que el cliente pida). Los precios en Happy Hour muestran el precio original tachado.', pos: 'left' },
  { el: '.prod-grid', msg: 'ðŸ›’ CATALOGO â€” Toca un producto y se agrega a la orden. Las categorias cambian el menu: Cervezas, Cocktails, Shots, Botanas, Comida, Refrescos. En Happy Hour ves el precio normal tachado y el precio con descuento.', pos: 'left' },
  { el: '.order-sec', msg: 'ðŸ“‹ ORDEN ACTUAL â€” Items agregados con cantidad, nombre y precio. La X roja elimina un item. "Limpiar" borra todo. Los totales se calculan automaticamente con Happy Hour y IVA.', pos: 'left' },
  { el: '.kq', msg: 'ðŸŽ¤ COLA KARAOKE â€” Lo que NADIE mas tiene. Ves las canciones que esta mesa pidio para cantar. Integrado directo con el sistema de karaoke de ByFlow. El DJ ve la cola completa de todas las mesas.', pos: 'left' },
  { el: '.pos-actions', msg: 'âš¡ ACCIONES â€” Enviar (manda comanda a cocina/barra), Cobrar (abre pago), Dividir (split la cuenta entre amigos), Cancion (agregar cancion al karaoke), Ticket (imprime), CFDI (factura electronica mexicana).', pos: 'left' }
];

let tourIdx = -1;
function startTour() {
  tourIdx = 0;
  const mesasNav = document.querySelector('[onclick*="showView(\'mesas\'"]') || document.querySelector('[onclick*="showView(\'mesas\'"]');
  showViewDirect('mesas');
  if (mesasNav) mesasNav.classList.add('active');
  showTourStep();
}

function showTourStep() {
  // Remove previous
  document.querySelectorAll('.tour-overlay,.tour-tooltip').forEach(e => e.remove());
  if (tourIdx >= tourSteps.length) {
    toast('Tour completado! Ya conoces todo el sistema', 'success');
    tourIdx = -1;
    return;
  }
  const step = tourSteps[tourIdx];
  const el = document.querySelector(step.el);
  if (!el) { tourIdx++; showTourStep(); return; }

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  document.body.appendChild(overlay);

  // Highlight
  el.style.position = el.style.position || 'relative';
  el.style.zIndex = '200';
  el.style.boxShadow = '0 0 0 4px var(--orange), 0 0 30px rgba(255,138,0,.3)';
  el.style.borderRadius = el.style.borderRadius || '12px';

  // Tooltip
  const tip = document.createElement('div');
  tip.className = 'tour-tooltip';
  tip.innerHTML = '<div class="tt-msg">' + step.msg + '</div>' +
    '<div class="tt-nav">' +
    '<span class="tt-count">' + (tourIdx+1) + '/' + tourSteps.length + '</span>' +
    (tourIdx > 0 ? '<button class="tt-btn" onclick="tourPrev()">&#x2190; Anterior</button>' : '') +
    '<button class="tt-btn tt-next" onclick="tourNext()">' + (tourIdx < tourSteps.length-1 ? 'Siguiente &#x2192;' : '&#x2705; Terminar') + '</button>' +
    '</div>';
  document.body.appendChild(tip);

  // Position tooltip near element
  const rect = el.getBoundingClientRect();
  if (step.pos === 'bottom') { tip.style.top = (rect.bottom + 10) + 'px'; tip.style.left = Math.max(10, rect.left) + 'px'; }
  else if (step.pos === 'right') { tip.style.top = rect.top + 'px'; tip.style.left = (rect.right + 10) + 'px'; }
  else if (step.pos === 'left') { tip.style.top = rect.top + 'px'; tip.style.right = (window.innerWidth - rect.left + 10) + 'px'; }
  else { tip.style.bottom = (window.innerHeight - rect.top + 10) + 'px'; tip.style.left = rect.left + 'px'; }
}

function tourNext() {
  cleanTourHighlight();
  tourIdx++;
  // Switch views for later steps
  if (tourIdx >= 5) {
    // ensure we're on mesas view for POS steps
    showViewDirect('mesas');
  }
  showTourStep();
}
function tourPrev() {
  cleanTourHighlight();
  tourIdx--;
  showTourStep();
}
function cleanTourHighlight() {
  document.querySelectorAll('[style*="z-index: 200"], [style*="z-index:200"]').forEach(el => {
    el.style.zIndex = '';
    el.style.boxShadow = '';
  });
  // also clean by checking all potential tour elements
  tourSteps.forEach(s => {
    const el = document.querySelector(s.el);
    if (el) { el.style.zIndex = ''; el.style.boxShadow = ''; }
  });
}

function showViewDirect(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('v-' + id);
  if (target) target.classList.add('active');
}

// â•â•â• INIT: Wire up category buttons â•â•â•
document.addEventListener('DOMContentLoaded', () => {
  const cats = document.querySelectorAll('.cat-bar .cc');
  const catMap = ['cervezas','cocktails','shots','botanas','comida','refrescos'];
  cats.forEach((c, i) => {
    c.onclick = () => switchCat(catMap[i], c);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// API INTEGRATION â€” Real data from POS backend
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â•â•â• AUTH (shared module from /js/pos-auth.js) â•â•â•
const getToken = PosAuth.getToken;
const getBarId = PosAuth.getBarId;
const authHeaders = PosAuth.authHeaders;

// â”€â”€ Auth guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function checkAuth() {
  if (!getToken()) {
    window.location.replace('/pos.html');
  }
})();

// â”€â”€ Render tables from API response â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderTables(tables) {
  var grid = document.querySelector('#v-mesas .grid');
  if (!grid || !Array.isArray(tables) || tables.length === 0) return;

  var statusClass = { libre: 'libre', ocupada: 'ocupada', cantando: 'cantando', reservada: 'reservada', cuenta: 'cuenta', tab: 'ocupada' };
  var statusLabel = { libre: 'Libre', ocupada: 'Ocupada', cantando: 'Cantando', reservada: 'Reservada', cuenta: 'Cuenta', tab: 'Tab' };
  var statusTs = { libre: 'ts-libre', ocupada: 'ts-ocupada', cantando: 'ts-cantando', reservada: 'ts-reservada', cuenta: 'ts-cuenta', tab: 'ts-tab' };

  grid.innerHTML = tables.map(function(t) {
    var st = (t.status || 'libre').toLowerCase();
    var tcCls = statusClass[st] || 'libre';
    var tsCls = statusTs[st] || 'ts-libre';
    var label = statusLabel[st] || st;
    var guests = t.guests || t.capacity || '';
    var area = t.area ? t.area + ' &bull; ' : '';
    var total = t.total ? '<div class="tc-t">$' + Number(t.total).toLocaleString() + '</div>' : '';
    var waiter = t.waiter_name ? '<div style="font-size:9px;color:var(--sub);margin-top:1px;">' + t.waiter_name + '</div>' : '';
    var mic = st === 'cantando' ? '<span class="tc-mic">&#x1F3A4;</span>' : '';
    var tableId = t.number || t.id;
    return '<div class="tc ' + tcCls + '" onclick="selT(' + JSON.stringify(tableId) + ',this)">' +
      mic +
      '<div class="tc-n">' + (t.number || t.id) + '</div>' +
      '<div class="tc-l">' + area + guests + ' pers</div>' +
      total +
      waiter +
      '<span class="tc-s ' + tsCls + '">' + label + '</span>' +
      '</div>';
  }).join('');
}

// â”€â”€ Render summary stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderSummary(tables, covers) {
  var summaryCards = document.querySelectorAll('#v-mesas .summary .sm');
  if (!summaryCards.length) return;

  var total = tables.length;
  var occupied = tables.filter(function(t) { return t.status && t.status !== 'libre'; }).length;
  var openTotal = tables.reduce(function(acc, t) { return acc + (Number(t.total) || 0); }, 0);
  var coverCount = covers && covers.count != null ? covers.count : null;

  if (summaryCards[0]) {
    summaryCards[0].innerHTML = '<div class="sm-l">Ocupadas</div><div class="sm-v" style="color:var(--orange);">' +
      occupied + '<span style="font-size:11px;color:var(--sub);">/' + total + '</span></div>';
  }
  if (summaryCards[1] && openTotal > 0) {
    summaryCards[1].innerHTML = '<div class="sm-l">Cuentas abiertas</div><div class="sm-v">$' + openTotal.toLocaleString() + '</div>';
  }
  if (summaryCards[4] && coverCount !== null) {
    summaryCards[4].innerHTML = '<div class="sm-l">Personas</div><div class="sm-v" style="color:var(--cyan);">' + coverCount + '</div>';
  }
}

// â”€â”€ Render products from API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function renderProducts(products) {
  var grid = document.querySelector('.prod-grid');
  if (!grid || !Array.isArray(products) || products.length === 0) return;

  grid.innerHTML = products.map(function(p, idx) {
    var icon = p.icon || '&#x1F37A;';
    var price = Number(p.price || p.precio || 0);
    var happyPrice = p.happy_hour_price ? Number(p.happy_hour_price) : null;
    var hhTag = happyPrice
      ? '<span class="pi-hh">$' + price + '</span>$' + happyPrice
      : '$' + price;
    var name = p.name || p.nombre || '';
    var productId = p.id || p.product_id || null;
    return '<div class="pi" data-product-id="' + (productId || '') + '" onclick="addI(' + JSON.stringify(name) + ',' + price + ',this,' + (productId || 'null') + ')" ' +
      'style="animation:fadeIn .2s ' + (idx * 0.03) + 's backwards;">' +
      '<div class="pi-i">' + icon + '</div>' +
      '<div class="pi-n">' + name + '</div>' +
      '<div class="pi-p">' + hhTag + '</div>' +
      '</div>';
  }).join('');
}

// â”€â”€ Load tables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadTables() {
  fetch('/pos/tables', { headers: authHeaders() })
    .then(function(res) { return res.ok ? res.json() : Promise.reject(res.status); })
    .then(function(data) {
      var tables = Array.isArray(data) ? data : (data.tables || data.data || []);
      if (tables.length > 0) {
        renderTables(tables);
        window._posTablesCache = tables;
        loadCovers(tables);
      }
    })
    .catch(function() { /* API unavailable â€” keep static HTML */ });
}

// â”€â”€ Load covers / today count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadCovers(tables) {
  fetch('/pos/covers/today', { headers: authHeaders() })
    .then(function(res) { return res.ok ? res.json() : Promise.reject(res.status); })
    .then(function(data) {
      renderSummary(tables || window._posTablesCache || [], data);
    })
    .catch(function() { /* Keep static fallback */ });
}

// â”€â”€ Load products by category_id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function loadProducts(categoryId) {
  var url = categoryId != null ? '/pos/products?category_id=' + categoryId : '/pos/products';
  fetch(url, { headers: authHeaders() })
    .then(function(res) { return res.ok ? res.json() : Promise.reject(res.status); })
    .then(function(data) {
      var products = Array.isArray(data) ? data : (data.products || data.data || []);
      if (products.length > 0) renderProducts(products);
    })
    .catch(function() { /* Keep static fallback */ });
}

// â”€â”€ Patch category bar to also fetch from API â”€â”€â”€â”€
document.addEventListener('DOMContentLoaded', function() {
  var cats = document.querySelectorAll('.cat-bar .cc');
  cats.forEach(function(c, i) {
    var prev = c.onclick;
    c.onclick = function(e) {
      if (prev) prev.call(c, e);
      loadProducts(i + 1);
    };
  });

  // Bootstrap on load: fetch tables and default category (1 = cervezas)
  loadTables();
  loadProducts(1);
  resetRenderedOrder();
  document.getElementById('pos-mesa').textContent = 'Selecciona mesa';
  setPosMeta('Sin mesa seleccionada');
  loadReservationsToday();
  loadCoverData();
  initHappyHourBanner();
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// RESERVACIONES â€” Full CRUD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

function loadReservationsToday() {
  var dateEl = document.getElementById('reserv-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  loadReservations(dateEl ? dateEl.value : null);
}

function loadReservations(date) {
  var url = '/pos/reservations' + (date ? '?date=' + encodeURIComponent(date) : '');
  fetch(url, { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      var list = data.reservations || [];
      var container = document.getElementById('reserv-list');
      var countEl = document.getElementById('reserv-count');
      var active = list.filter(function(r) { return r.status !== 'cancelada' && r.status !== 'completada' && r.status !== 'no_show'; });
      if (countEl) countEl.textContent = active.length;

      if (list.length === 0) {
        container.innerHTML = '<div class="clean-empty"><div class="ce-icon">&#x1F4C5;</div><div class="ce-title">Sin reservaciones</div><div class="ce-sub">Agrega una reservacion para este dia</div></div>';
        return;
      }
      container.innerHTML = list.map(function(r) {
        var statusLabels = { pendiente:'Pendiente', confirmada:'Confirmada', llego:'Llego', cancelada:'Cancelada', completada:'Completada', no_show:'No Show' };
        var label = statusLabels[r.status] || r.status;
        var actions = '';
        if (r.status === 'pendiente') {
          actions = '<button class="pb success" style="padding:4px 8px;font-size:9px;" onclick="updateReservStatus(' + r.id + ',\'confirmada\')">Confirmar</button>' +
            '<button class="pb" style="padding:4px 8px;font-size:9px;background:rgba(52,211,153,.08);color:var(--green);border:1px solid rgba(52,211,153,.12);" onclick="updateReservStatus(' + r.id + ',\'llego\')">Llego</button>' +
            '<button class="pb danger" style="padding:4px 8px;font-size:9px;" onclick="updateReservStatus(' + r.id + ',\'cancelada\')">Cancelar</button>';
        } else if (r.status === 'confirmada') {
          actions = '<button class="pb" style="padding:4px 8px;font-size:9px;background:rgba(52,211,153,.08);color:var(--green);border:1px solid rgba(52,211,153,.12);" onclick="updateReservStatus(' + r.id + ',\'llego\')">Llego</button>' +
            '<button class="pb danger" style="padding:4px 8px;font-size:9px;" onclick="updateReservStatus(' + r.id + ',\'cancelada\')">Cancelar</button>';
        }
        return '<div class="res-card">' +
          '<div class="rc-time">' + escapeHtml(r.time || '') + '</div>' +
          '<div class="rc-info">' +
            '<div class="rc-name">' + escapeHtml(r.customer_name || '') + '</div>' +
            '<div class="rc-meta">' + escapeHtml(String(r.guests || 2)) + ' personas' +
              (r.table_number ? ' &bull; Mesa ' + escapeHtml(String(r.table_number)) : '') +
              (r.phone ? ' &bull; ' + escapeHtml(r.phone) : '') +
              (r.notes ? ' &bull; <em>' + escapeHtml(r.notes) + '</em>' : '') +
            '</div>' +
          '</div>' +
          '<span class="res-badge ' + escapeHtml(r.status || 'pendiente') + '">' + escapeHtml(label) + '</span>' +
          '<div class="rc-actions">' + actions + '</div>' +
        '</div>';
      }).join('');
    })
    .catch(function() {});
}

function openReservModal() {
  var dateEl = document.getElementById('reserv-date');
  var rfDate = document.getElementById('rf-date');
  if (rfDate) rfDate.value = (dateEl && dateEl.value) ? dateEl.value : new Date().toISOString().slice(0, 10);
  // Populate table dropdown from cache
  var sel = document.getElementById('rf-table');
  if (sel && window._posTablesCache) {
    sel.innerHTML = '<option value="">Sin asignar</option>';
    window._posTablesCache.forEach(function(t) {
      sel.innerHTML += '<option value="' + t.id + '">Mesa ' + escapeHtml(String(t.number)) + ' (' + escapeHtml(t.area) + ', ' + t.capacity + 'p)</option>';
    });
  }
  document.getElementById('modal-reserv').classList.add('show');
}

function saveReservation() {
  var data = {
    name: document.getElementById('rf-name').value.trim(),
    phone: document.getElementById('rf-phone').value.trim(),
    date: document.getElementById('rf-date').value,
    time: document.getElementById('rf-time').value,
    guests: parseInt(document.getElementById('rf-guests').value) || 2,
    table_id: document.getElementById('rf-table').value || null,
    notes: document.getElementById('rf-notes').value.trim()
  };
  if (!data.name || !data.date || !data.time) { toast('Nombre, fecha y hora requeridos', 'warn'); return; }
  fetch('/pos/reservations', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify(data)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      toast('Reservacion creada para ' + data.name, 'success');
      document.getElementById('modal-reserv').classList.remove('show');
      document.getElementById('rf-name').value = '';
      document.getElementById('rf-phone').value = '';
      document.getElementById('rf-notes').value = '';
      loadReservations(data.date);
    } else {
      toast(d.error || 'Error al crear reservacion', 'error');
    }
  })
  .catch(function() { toast('Error de conexion', 'error'); });
}

function updateReservStatus(id, status) {
  fetch('/pos/reservations/' + id, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ status: status })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      var labels = { confirmada:'Confirmada', llego:'Marcada como llegada', cancelada:'Cancelada' };
      toast('Reservacion: ' + (labels[status] || status), 'success');
      loadReservationsToday();
    } else {
      toast(d.error || 'Error', 'error');
    }
  })
  .catch(function() { toast('Error de conexion', 'error'); });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// COVER / ENTRADA â€” Full CRUD
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

var _coverSettings = { cover_general: 150, cover_vip: 250 };

function loadCoverData() {
  // Load settings for cover prices
  fetch('/pos/settings', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) {
      if (d && d.settings) {
        _coverSettings.cover_general = parseFloat(d.settings.cover_general) || 150;
        _coverSettings.cover_vip = parseFloat(d.settings.cover_vip) || 250;
      }
    })
    .catch(function() {});

  // Load today's covers
  loadCoverLog();
}

function loadCoverLog() {
  fetch('/pos/covers/today', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      var covers = data.covers || [];
      var totals = data.totals || {};
      // Still-present guests = entries without departure_time
      var presentGuests = covers.reduce(function(acc, c) {
        return acc + (c.departure_time ? 0 : (c.guests || 0));
      }, 0);

      var guestsEl = document.getElementById('cv-guests');
      var revenueEl = document.getElementById('cv-revenue');
      var entriesEl = document.getElementById('cv-entries');
      if (guestsEl) guestsEl.textContent = presentGuests;
      if (revenueEl) revenueEl.textContent = '$' + Number(totals.total_amount || 0).toLocaleString();
      if (entriesEl) entriesEl.textContent = totals.total_entries || 0;

      var log = document.getElementById('cover-log');
      if (!log) return;
      if (covers.length === 0) {
        log.innerHTML = '<div class="clean-empty"><div class="ce-icon">&#x1F3AB;</div><div class="ce-title">Sin entradas hoy</div></div>';
        return;
      }
      log.innerHTML = covers.map(function(c) {
        var time = (c.created_at || '').slice(11, 16) || '--:--';
        var typeLabels = { general:'GENERAL', vip:'VIP', cortesia:'CORTESIA', lista:'LISTA' };
        var typeCls = c.type === 'vip' ? 'vip' : (c.type === 'cortesia' ? 'cortesia' : 'entry');
        var departed = c.departure_time;
        var amt = c.amount > 0 ? '<span style="font-weight:700;">$' + Number(c.amount).toLocaleString() + '</span>' : '<span style="color:var(--sub);">$0</span>';
        var exitBtn = departed
          ? '<span style="font-size:9px;color:var(--sub);">Salio ' + (c.departure_time || '').slice(11, 16) + '</span>'
          : '<button class="pb secondary" style="padding:2px 8px;font-size:9px;" onclick="registerDeparture(' + c.id + ')">Salida</button>';
        return '<div class="entry-row">' +
          '<span class="er-time">' + escapeHtml(time) + '</span>' +
          '<span class="er-type ' + typeCls + '">' + (typeLabels[c.type] || 'ENTRADA') + '</span>' +
          '<span style="flex:1;">' + escapeHtml(String(c.guests || 1)) + ' persona' + (c.guests > 1 ? 's' : '') +
            (c.notes ? ' &mdash; ' + escapeHtml(c.notes) : '') +
          '</span>' +
          amt +
          '<span style="margin-left:6px;">' + exitBtn + '</span>' +
        '</div>';
      }).join('');
    })
    .catch(function() {});
}

function registerCover(type, guests) {
  var prices = { general: _coverSettings.cover_general, vip: _coverSettings.cover_vip, cortesia: 0, lista: 0 };
  var amount = (prices[type] || 0) * guests;
  fetch('/pos/covers', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ type: type, guests: guests, amount: amount, notes: '' })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      var label = type.charAt(0).toUpperCase() + type.slice(1);
      toast('+' + guests + ' ' + label + (amount > 0 ? ' â€” $' + amount : ''), 'success');
      loadCoverLog();
    } else {
      toast(d.error || 'Error', 'error');
    }
  })
  .catch(function() { toast('Error de conexion', 'error'); });
}

function openCoverModal() {
  document.getElementById('cf-type').value = 'general';
  document.getElementById('cf-guests').value = '1';
  document.getElementById('cf-notes').value = '';
  document.getElementById('modal-cover').classList.add('show');
}

function saveCoverFromModal() {
  var type = document.getElementById('cf-type').value;
  var guests = parseInt(document.getElementById('cf-guests').value) || 1;
  var notes = document.getElementById('cf-notes').value.trim();
  var prices = { general: _coverSettings.cover_general, vip: _coverSettings.cover_vip, cortesia: 0, lista: 0 };
  var amount = (prices[type] || 0) * guests;
  fetch('/pos/covers', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ type: type, guests: guests, amount: amount, notes: notes })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      toast('Entrada registrada: ' + guests + ' persona(s)', 'success');
      document.getElementById('modal-cover').classList.remove('show');
      loadCoverLog();
    } else {
      toast(d.error || 'Error', 'error');
    }
  })
  .catch(function() { toast('Error de conexion', 'error'); });
}

function registerDeparture(coverId) {
  fetch('/pos/covers/' + coverId + '/departure', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: '{}'
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok) {
      toast('Salida registrada', 'info');
      loadCoverLog();
    }
  })
  .catch(function() { toast('Error de conexion', 'error'); });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HAPPY HOUR BANNER â€” Real API check
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

var _hhActive = [];
var _hhTimerInterval = null;

function initHappyHourBanner() {
  checkHappyHourStatus();
  // Re-check every 5 minutes
  setInterval(checkHappyHourStatus, 5 * 60 * 1000);
}

function checkHappyHourStatus() {
  fetch('/pos/happy-hour/active', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (!data) return;
      _hhActive = data.active || [];
      isHappyHour = data.is_happy_hour;
      updateTotals();

      var promo = document.querySelector('#v-mesas .promo');
      if (!promo) return;

      if (_hhActive.length > 0) {
        var hh = _hhActive[0];
        promo.style.display = 'flex';
        var titleEl = promo.querySelector('.p-title');
        var subEl = promo.querySelector('.p-sub');
        if (titleEl) titleEl.innerHTML = '&#x1F525; ' + escapeHtml(hh.name) + ' &mdash; ' + escapeHtml(String(hh.discount_pct || 50)) + '% dcto';
        if (subEl) subEl.textContent = 'Aplica automaticamente al cobrar';
        // Start countdown timer
        if (_hhTimerInterval) clearInterval(_hhTimerInterval);
        _hhTimerInterval = setInterval(function() { updateHHTimer(hh.end_time); }, 1000);
        updateHHTimer(hh.end_time);
      } else {
        promo.style.display = 'none';
        if (_hhTimerInterval) { clearInterval(_hhTimerInterval); _hhTimerInterval = null; }
      }
    })
    .catch(function() {});
}

function updateHHTimer(endTime) {
  var timerEl = document.getElementById('hh');
  if (!timerEl || !endTime) return;
  var now = new Date();
  var endParts = endTime.split(':');
  var end = new Date(now);
  end.setHours(parseInt(endParts[0]) || 0, parseInt(endParts[1]) || 0, 0, 0);
  var diff = end - now;
  if (diff <= 0) {
    timerEl.textContent = '0:00:00';
    return;
  }
  var h = Math.floor(diff / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  timerEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}


// â•â•â• LICENSE-AWARE INIT â•â•â•
(function initLicenseState() {
  var params = new URLSearchParams(location.search);
  var isLicensed = params.get('licensed') === '1';
  var licenseData = null;

  try { licenseData = JSON.parse(sessionStorage.getItem('pos_license')); } catch(_) {}

  if (isLicensed || (licenseData && licenseData.active)) {
    // Show license badge in sidebar
    var sbLicense = document.getElementById('sb-license');
    if (sbLicense) {
      sbLicense.style.display = 'block';
      var planName = (licenseData && licenseData.plan) || 'POS';
      document.getElementById('sb-license-plan').textContent = 'Licencia: ' + planName;
    }

    // Show setup link if NOT yet configured
    var setupComplete = localStorage.getItem('pos_setup_complete');
    if (!setupComplete) {
      var setupLink = document.getElementById('sb-setup-link');
      if (setupLink) setupLink.style.display = 'block';

      // Show welcome wizard for first-time users
      document.getElementById('setup-wizard').classList.add('open');
    }

    // Clean state: replace demo data with empty state when no real data loaded
    cleanDemoState();

    // Hide demo banners / "Proximamente" toasts by overriding the nav items
    overrideProximamente();
  }
})();

function cleanDemoState() {
  // Only clean if there's no real data (no API override happened yet)
  // We mark it so the API data fetch can skip cleaning
  window._posLicensedClean = true;

  // Replace demo promo banner text
  var promoTitle = document.querySelector('.promo .p-title');
  if (promoTitle && promoTitle.textContent.indexOf('Happy Hour') !== -1) {
    // Keep the promo structure but make it configurable
    var promoSub = document.querySelector('.promo .p-sub');
    if (promoSub) promoSub.textContent = 'Configura tus promociones desde Admin';
  }

  // Replace hardcoded demo employee data with clean state
  var empGrid = document.querySelector('#v-empleados .emp-grid');
  if (empGrid) {
    empGrid.innerHTML =
      '<div class="clean-empty" style="grid-column:1/-1;">' +
      '<div class="ce-icon">&#x1F465;</div>' +
      '<div class="ce-title">Sin empleados registrados</div>' +
      '<div class="ce-sub">Agrega tu equipo desde Admin para que puedan entrar con su PIN</div>' +
      '<a href="/pos-admin.html#employees" style="display:inline-block;margin-top:12px;padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,var(--orange2),var(--orange));color:#fff;text-decoration:none;font-size:11px;font-weight:700;">+ Agregar Empleados</a>' +
      '</div>';
  }

  // Replace hardcoded sidebar stats with zeros for clean start
  var sidebarStats = document.querySelectorAll('.sb-stat .ss-v');
  sidebarStats.forEach(function(el) {
    if (el.textContent.indexOf('$') === 0) el.textContent = '$0';
    else if (!isNaN(parseInt(el.textContent))) el.textContent = '0';
  });
  var sidebarChanges = document.querySelectorAll('.sb-stat .ss-c');
  sidebarChanges.forEach(function(el) { el.textContent = 'â€”'; });
}

function overrideProximamente() {
  // Remove "Proximamente" toast calls â€” replace with actual navigation
  var navItems = document.querySelectorAll('.nav[onclick*="Proximamente"]');
  navItems.forEach(function(nav) {
    // Extract the view name from the toast message
    var onclick = nav.getAttribute('onclick') || '';
    nav.removeAttribute('onclick');
    nav.style.cursor = 'pointer';
    nav.addEventListener('click', function() {
      toast('Modulo disponible pronto con tu licencia activa', 'info');
    });
  });
}

// â•â•â• SETUP WIZARD LOGIC â•â•â•
function wizardNext(step) {
  // Validate step 1
  if (step === 2) {
    var barName = document.getElementById('sw-bar-name').value.trim();
    if (!barName) {
      document.getElementById('sw-bar-name').style.borderColor = 'var(--red)';
      document.getElementById('sw-bar-name').focus();
      return;
    }
    localStorage.setItem('pos_bar_name', barName);
    localStorage.setItem('pos_bar_address', document.getElementById('sw-bar-address').value.trim());
    // Update topbar with actual bar name
    var barNameEl = document.querySelector('.topbar .bar-name');
    if (barNameEl) barNameEl.textContent = barName;
  }

  // Update step indicators
  var steps = document.querySelectorAll('.sw-step');
  steps.forEach(function(s) {
    var sNum = parseInt(s.getAttribute('data-step'));
    if (sNum < step) { s.className = 'sw-step done'; s.innerHTML = '<span>&#x2713;</span>'; }
    else if (sNum === step) { s.className = 'sw-step active'; }
    else { s.className = 'sw-step'; }
  });

  // Show correct body
  document.querySelectorAll('.sw-body').forEach(function(b) { b.classList.remove('active'); });
  var target = document.getElementById('sw-step-' + step);
  if (target) target.classList.add('active');
}

function wizardBack(step) {
  wizardNext(step);
}

function wizardFinish() {
  localStorage.setItem('pos_setup_complete', '1');
  document.getElementById('setup-wizard').classList.remove('open');

  // Hide the setup link in sidebar
  var setupLink = document.getElementById('sb-setup-link');
  if (setupLink) setupLink.style.display = 'none';

  // Update bar name in topbar if set
  var barName = localStorage.getItem('pos_bar_name');
  if (barName) {
    var barNameEl = document.querySelector('.topbar .bar-name');
    if (barNameEl) barNameEl.textContent = barName;
  }

  toast('Bar configurado! Bienvenido a ByFlow POS', 'success');
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// INVENTORY â€” Live data from /pos/inventory
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
var _invData = [];
var _invFilter = '';

function loadInventory() {
  fetch('/pos/inventory', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (!data || !data.ok) return;
      _invData = data.products || [];
      renderInvCategories();
      renderInventory();
    })
    .catch(function() { toast('Error cargando inventario', 'error'); });
}

function renderInvCategories() {
  var cats = {};
  _invData.forEach(function(p) { cats[p.category_name || 'Sin Cat'] = true; });
  var bar = document.getElementById('inv-cats-bar');
  if (!bar) return;
  var html = '<div class="inv-cat' + (_invFilter === '' ? ' active' : '') + '" onclick="setInvCat(\'\',this)">Todo</div>';
  Object.keys(cats).forEach(function(c) {
    html += '<div class="inv-cat' + (_invFilter === c ? ' active' : '') + '" onclick="setInvCat(\'' + escapeHtml(c) + '\',this)">' + escapeHtml(c) + '</div>';
  });
  bar.innerHTML = html;
}

function setInvCat(cat, el) {
  _invFilter = cat;
  document.querySelectorAll('#inv-cats-bar .inv-cat').forEach(function(c) { c.classList.remove('active'); });
  if (el) el.classList.add('active');
  renderInventory();
}

function filterInventory() {
  renderInventory();
}

function renderInventory() {
  var tbody = document.getElementById('inv-tbody');
  if (!tbody) return;
  var search = (document.getElementById('inv-search-input') || {}).value || '';
  search = search.toLowerCase();

  var filtered = _invData.filter(function(p) {
    if (_invFilter && p.category_name !== _invFilter) return false;
    if (search && p.name.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--sub);">Sin productos' + (search ? ' para "' + escapeHtml(search) + '"' : '') + '</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function(p) {
    var st = p.stock_status || 'ok';
    var fillClass = st === 'critical' || st === 'low' ? 'low' : st === 'medium' ? 'mid' : 'high';
    var pct = p.stock === -1 ? 100 : (p.min_stock > 0 ? Math.min(100, Math.round((p.stock / (p.min_stock * 3)) * 100)) : 100);
    var alertClass = st === 'critical' ? 'danger' : st === 'low' ? 'danger' : st === 'medium' ? 'warn' : 'ok';
    var alertText = st === 'critical' ? 'Critico' : st === 'low' ? 'Bajo' : st === 'medium' ? 'Medio' : st === 'unlimited' ? 'Ilim.' : 'OK';
    var margin = p.margin || 0;
    var marginColor = margin > 50 ? 'var(--green)' : margin > 20 ? 'var(--amber)' : 'var(--sub)';
    var stockText = p.stock === -1 ? 'Ilimitado' : p.stock + ' ' + (p.unit || 'pza');

    return '<tr>' +
      '<td>' + escapeHtml(p.icon || '') + ' ' + escapeHtml(p.name) + '<div style="font-size:9px;color:var(--sub);">' + escapeHtml(p.category_name || '') + '</div></td>' +
      '<td>' + stockText + '</td>' +
      '<td><div class="stock-bar"><div class="stock-fill ' + fillClass + '" style="width:' + pct + '%;"></div></div></td>' +
      '<td>$' + (p.cost || 0).toFixed(2) + '</td>' +
      '<td>$' + (p.price || 0).toFixed(2) + '</td>' +
      '<td style="color:' + marginColor + ';font-weight:700;">' + margin + '%</td>' +
      '<td><span class="inv-alert ' + alertClass + '">' + alertText + '</span></td>' +
      '<td style="white-space:nowrap;">' +
        '<button class="tb" style="font-size:9px;padding:3px 6px;" onclick="openAdjModal(' + p.id + ',\'' + escapeHtml(p.name).replace(/'/g, "\\'") + '\')">Ajustar</button> ' +
        '<button class="tb" style="font-size:9px;padding:3px 6px;" onclick="openInvModal(\'edit\',' + p.id + ')">Editar</button>' +
      '</td>' +
      '</tr>';
  }).join('');
}

function openInvModal(mode, id) {
  document.getElementById('inv-m-name').value = '';
  document.getElementById('inv-m-stock').value = '';
  document.getElementById('inv-m-minstock').value = '';
  document.getElementById('inv-m-cost').value = '';
  document.getElementById('inv-m-price').value = '';
  document.getElementById('inv-m-unit').value = '';
  document.getElementById('inv-m-id').value = '';
  document.getElementById('inv-modal-title').textContent = mode === 'edit' ? 'Editar Producto' : 'Agregar Producto';

  if (mode === 'edit' && id) {
    var p = _invData.find(function(x) { return x.id === id; });
    if (p) {
      document.getElementById('inv-m-name').value = p.name;
      document.getElementById('inv-m-stock').value = p.stock === -1 ? '' : p.stock;
      document.getElementById('inv-m-minstock').value = p.min_stock;
      document.getElementById('inv-m-cost').value = p.cost;
      document.getElementById('inv-m-price').value = p.price;
      document.getElementById('inv-m-unit').value = p.unit || '';
      document.getElementById('inv-m-id').value = id;
    }
  }
  document.getElementById('inv-modal').style.display = 'flex';
}

function closeInvModal() { document.getElementById('inv-modal').style.display = 'none'; }

function saveInvItem() {
  var id = document.getElementById('inv-m-id').value;
  var body = {
    name: document.getElementById('inv-m-name').value.trim(),
    current_stock: parseInt(document.getElementById('inv-m-stock').value) || 0,
    min_stock: parseInt(document.getElementById('inv-m-minstock').value) || 5,
    cost_per_unit: parseFloat(document.getElementById('inv-m-cost').value) || 0,
    price: parseFloat(document.getElementById('inv-m-price').value) || 0,
    unit: document.getElementById('inv-m-unit').value.trim() || 'pza'
  };
  if (!body.name) { toast('Nombre requerido', 'error'); return; }

  var url = id ? '/pos/inventory/' + id : '/pos/inventory';
  var method = id ? 'PUT' : 'POST';
  fetch(url, { method: method, headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify(body) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) { toast(id ? 'Producto actualizado' : 'Producto creado', 'success'); closeInvModal(); loadInventory(); }
      else toast(data.error || 'Error', 'error');
    })
    .catch(function() { toast('Error de conexion', 'error'); });
}

function openAdjModal(id, name) {
  document.getElementById('adj-product-id').value = id;
  document.getElementById('adj-product-name').textContent = name;
  document.getElementById('adj-qty').value = '';
  document.getElementById('adj-notes').value = '';
  document.getElementById('adj-type').value = 'purchase';
  document.getElementById('inv-adjust-modal').style.display = 'flex';
}

function closeAdjModal() { document.getElementById('inv-adjust-modal').style.display = 'none'; }

function saveAdjust() {
  var id = document.getElementById('adj-product-id').value;
  var body = {
    type: document.getElementById('adj-type').value,
    quantity: parseFloat(document.getElementById('adj-qty').value),
    notes: document.getElementById('adj-notes').value.trim()
  };
  if (!body.quantity || body.quantity <= 0) { toast('Cantidad requerida', 'error'); return; }

  fetch('/pos/inventory/' + id + '/adjust', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()), body: JSON.stringify(body) })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) { toast('Stock ajustado: ' + data.new_stock, 'success'); closeAdjModal(); loadInventory(); }
      else toast(data.error || 'Error', 'error');
    })
    .catch(function() { toast('Error de conexion', 'error'); });
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// REPORTS â€” Live data from /pos/reports
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
var _reportRange = 'today';

function setReportRange(range, el) {
  _reportRange = range;
  document.querySelectorAll('.report-range').forEach(function(b) { b.classList.remove('active'); });
  if (el) el.classList.add('active');
  loadReports();
}

function loadReports() {
  var url;
  if (_reportRange === 'today') {
    url = '/pos/reports/today';
  } else {
    var now = new Date();
    var to = now.toISOString().slice(0, 10);
    var from;
    if (_reportRange === 'week') {
      var d = new Date(now); d.setDate(d.getDate() - 7); from = d.toISOString().slice(0, 10);
    } else {
      var d2 = new Date(now); d2.setDate(d2.getDate() - 30); from = d2.toISOString().slice(0, 10);
    }
    url = '/pos/reports/range?from=' + from + '&to=' + to;
  }

  fetch(url, { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (!data || !data.ok) return;
      renderReports(data);
    })
    .catch(function() { toast('Error cargando reportes', 'error'); });
}

function fmtMoney(n) { return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

function renderReports(data) {
  var s = data.sales || {};
  document.getElementById('rp-sales').textContent = fmtMoney(s.total_sales);
  document.getElementById('rp-avg').textContent = fmtMoney(s.avg_ticket);
  document.getElementById('rp-orders').textContent = s.total_orders || 0;
  document.getElementById('rp-tips').textContent = fmtMoney(s.total_tips);

  // Hours chart
  var hours = data.byHour || [];
  var maxSales = Math.max.apply(null, hours.map(function(h) { return h.sales || 0; }).concat([1]));
  var chartEl = document.getElementById('report-hours-chart');
  if (chartEl) {
    if (hours.length === 0) {
      chartEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);font-size:11px;">Sin datos de ventas</div>';
    } else {
      chartEl.innerHTML = hours.map(function(h) {
        var pct = Math.round(((h.sales || 0) / maxSales) * 100);
        var bg = pct > 80 ? 'linear-gradient(180deg,var(--orange),var(--amber))' : pct > 50 ? 'rgba(255,138,0,.' + (pct/200+0.2).toFixed(1) + ')' : 'var(--surface2)';
        return '<div class="chart-bar" style="height:' + Math.max(5, pct) + '%;background:' + bg + ';"><span class="cb-val">' + fmtMoney(h.sales) + '</span><span class="cb-label">' + (parseInt(h.hour) || 0) + 'h</span></div>';
      }).join('');
    }
  }

  // Top products
  var prods = data.topProducts || [];
  var prodsEl = document.getElementById('report-top-products');
  if (prodsEl) {
    if (prods.length === 0) {
      prodsEl.innerHTML = '<div style="padding:10px;color:var(--sub);">Sin ventas</div>';
    } else {
      prodsEl.innerHTML = prods.slice(0, 8).map(function(p, i) {
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">' +
          '<span>' + (i + 1) + '. ' + escapeHtml((p.icon || '') + ' ' + p.name) + '</span>' +
          '<span style="color:var(--orange);font-weight:700;">' + (p.qty || 0) + ' uds &mdash; ' + fmtMoney(p.revenue) + '</span></div>';
      }).join('');
    }
  }

  // Employees
  var emps = data.byEmployee || [];
  var empsEl = document.getElementById('report-employees');
  if (empsEl) {
    if (emps.length === 0) {
      empsEl.innerHTML = '<div style="padding:10px;color:var(--sub);">Sin datos</div>';
    } else {
      empsEl.innerHTML = emps.map(function(e) {
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">' +
          '<span>' + escapeHtml(e.name) + ' <span style="color:var(--sub);font-size:9px;">(' + (e.orders_count || 0) + ' ord)</span></span>' +
          '<span style="color:var(--orange);font-weight:700;">' + fmtMoney(e.total_sales) + '</span></div>';
      }).join('');
    }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CORTE DE CAJA â€” Live data from /pos/shifts
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function loadCorte() {
  // Load current shift + history in parallel
  Promise.all([
    fetch('/pos/shifts/current', { headers: authHeaders() }).then(function(r) { return r.ok ? r.json() : null; }),
    fetch('/pos/shifts', { headers: authHeaders() }).then(function(r) { return r.ok ? r.json() : null; })
  ]).then(function(results) {
    var currentData = results[0];
    var historyData = results[1];
    renderCorteControls(currentData);
    renderCorteCurrent(currentData);
    renderCorteHistory(historyData);
  }).catch(function() { toast('Error cargando corte', 'error'); });
}

function renderCorteControls(data) {
  var el = document.getElementById('corte-controls');
  if (!el) return;
  var shift = data && data.shift;
  if (!shift) {
    el.innerHTML = '<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">' +
      '<div style="font-size:24px;margin-bottom:8px;">&#x1F513;</div>' +
      '<div style="font-size:12px;font-weight:700;margin-bottom:4px;">No hay turno abierto</div>' +
      '<div style="font-size:10px;color:var(--sub);margin-bottom:12px;">Abre un turno para comenzar a registrar ventas</div>' +
      '<button onclick="openShiftOpenModal()" style="padding:10px 24px;border-radius:8px;background:linear-gradient(135deg,var(--green),#059669);border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Abrir Turno</button></div>';
  } else {
    var started = new Date(shift.started_at + 'Z');
    var elapsed = Math.round((Date.now() - started.getTime()) / 60000);
    var hrs = Math.floor(elapsed / 60);
    var mins = elapsed % 60;
    el.innerHTML = '<div style="background:rgba(52,211,153,.05);border:1px solid rgba(52,211,153,.2);border-radius:12px;padding:14px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">' +
      '<div style="font-size:24px;">&#x1F7E2;</div>' +
      '<div style="flex:1;">' +
        '<div style="font-size:12px;font-weight:700;">Turno Activo &mdash; ' + escapeHtml(shift.employee_name || 'Empleado') + '</div>' +
        '<div style="font-size:10px;color:var(--sub);">Inicio: ' + started.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'}) + ' &bull; Duracion: ' + hrs + 'h ' + mins + 'm &bull; Fondo: ' + fmtMoney(shift.cash_start) + '</div>' +
      '</div>' +
      '<button onclick="openShiftCloseModal(' + shift.id + ')" style="padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,var(--red),#dc2626);border:none;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">Cerrar Turno</button></div>';
  }
}

function renderCorteCurrent(data) {
  var el = document.getElementById('corte-current');
  if (!el) return;
  if (!data || !data.shift) { el.innerHTML = ''; return; }

  var sales = data.sales || {};
  var methods = data.byMethod || [];
  var getMethod = function(m) { var found = methods.find(function(x) { return x.method === m; }); return found ? found.total : 0; };

  el.innerHTML = '<div class="corte-grid">' +
    '<div class="corte-card"><h3>&#x1F4B5; Ventas del Turno</h3>' +
      '<div class="corte-row"><span>Efectivo</span><span style="font-weight:700;">' + fmtMoney(getMethod('efectivo')) + '</span></div>' +
      '<div class="corte-row"><span>Tarjeta</span><span style="font-weight:700;">' + fmtMoney(getMethod('tarjeta')) + '</span></div>' +
      '<div class="corte-row"><span>Transferencia</span><span style="font-weight:700;">' + fmtMoney(getMethod('transferencia')) + '</span></div>' +
      '<div class="corte-row"><span>Propinas</span><span style="font-weight:700;color:var(--green);">' + fmtMoney(sales.total_tips) + '</span></div>' +
      '<div class="corte-row total"><span>Total Ventas</span><span style="color:var(--green);">' + fmtMoney(sales.total_sales) + '</span></div>' +
    '</div>' +
    '<div class="corte-card"><h3>&#x1F4CA; Resumen</h3>' +
      '<div class="corte-row"><span>Ordenes cerradas</span><span style="font-weight:700;">' + (sales.total_orders || 0) + '</span></div>' +
      '<div class="corte-row"><span>Fondo inicial</span><span style="font-weight:700;">' + fmtMoney(data.shift.cash_start) + '</span></div>' +
      '<div class="corte-row"><span>Efectivo esperado</span><span style="font-weight:700;">' + fmtMoney((data.shift.cash_start || 0) + getMethod('efectivo')) + '</span></div>' +
    '</div></div>';
}

function renderCorteHistory(data) {
  var el = document.getElementById('corte-history');
  if (!el) return;
  var shifts = (data && data.shifts) || [];
  if (shifts.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);font-size:11px;">Sin turnos anteriores</div>';
    return;
  }

  el.innerHTML = '<table class="inv-table"><thead><tr><th>Empleado</th><th>Inicio</th><th>Fin</th><th>Ordenes</th><th>Ventas</th><th>Fondo</th><th>Cierre</th><th>Diferencia</th></tr></thead><tbody>' +
    shifts.map(function(s) {
      var start = new Date(s.started_at + 'Z');
      var end = s.ended_at ? new Date(s.ended_at + 'Z') : null;
      var variance = s.cash_end !== null && s.cash_end !== undefined ? (s.cash_end - (s.cash_start || 0)) : null;
      var varColor = variance === null ? 'var(--sub)' : variance >= 0 ? 'var(--green)' : 'var(--red)';
      return '<tr>' +
        '<td>' + escapeHtml(s.employee_name || '?') + '</td>' +
        '<td style="font-size:10px;">' + start.toLocaleDateString('es-MX', {day:'2-digit',month:'short'}) + ' ' + start.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'}) + '</td>' +
        '<td style="font-size:10px;">' + (end ? end.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'}) : '<span style="color:var(--green);">Abierto</span>') + '</td>' +
        '<td>' + (s.order_count || 0) + '</td>' +
        '<td style="font-weight:700;">' + fmtMoney(s.total_sales) + '</td>' +
        '<td>' + fmtMoney(s.cash_start) + '</td>' +
        '<td>' + (s.cash_end !== null && s.cash_end !== undefined ? fmtMoney(s.cash_end) : '&mdash;') + '</td>' +
        '<td style="color:' + varColor + ';font-weight:700;">' + (variance !== null ? (variance >= 0 ? '+' : '') + fmtMoney(variance) : '&mdash;') + '</td>' +
        '</tr>';
    }).join('') +
    '</tbody></table>';
}

function openShiftOpenModal() {
  document.getElementById('shift-open-cash').value = '';
  document.getElementById('shift-open-modal').style.display = 'flex';
}

function closeShiftOpenModal() { document.getElementById('shift-open-modal').style.display = 'none'; }

function confirmOpenShift() {
  var cash = parseFloat(document.getElementById('shift-open-cash').value) || 0;
  var empData = null;
  try { empData = JSON.parse(sessionStorage.getItem('pos_employee')); } catch(_) {}
  var empId = (empData && empData.id) ? empData.id : 1;
  fetch('/pos/shifts', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ employee_id: empId, opening_cash: cash })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) { toast('Turno abierto', 'success'); closeShiftOpenModal(); loadCorte(); }
      else toast(data.error || 'Error', 'error');
    })
    .catch(function() { toast('Error de conexion', 'error'); });
}

function openShiftCloseModal(shiftId) {
  document.getElementById('shift-close-cash').value = '';
  document.getElementById('shift-close-id').value = shiftId;
  document.getElementById('shift-close-modal').style.display = 'flex';
}

function closeShiftCloseModal() { document.getElementById('shift-close-modal').style.display = 'none'; }

function confirmCloseShift() {
  var shiftId = document.getElementById('shift-close-id').value;
  var cash = parseFloat(document.getElementById('shift-close-cash').value);
  if (isNaN(cash) || cash < 0) { toast('Ingresa el efectivo contado', 'error'); return; }

  fetch('/pos/shifts/' + shiftId + '/close', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ closing_cash: cash })
  })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        var variance = data.variance || 0;
        var msg = 'Turno cerrado. Diferencia: ' + (variance >= 0 ? '+' : '') + '$' + variance.toFixed(2);
        toast(msg, variance === 0 ? 'success' : 'info');
        closeShiftCloseModal();
        loadCorte();
      } else toast(data.error || 'Error', 'error');
    })
    .catch(function() { toast('Error de conexion', 'error'); });
}

// Load saved bar name on page load (also fetch from server settings for multi-tenant)
(function loadBarName() {
  var barName = localStorage.getItem('pos_bar_name');
  if (barName) {
    var barNameEl = document.querySelector('.topbar .bar-name');
    if (barNameEl) barNameEl.textContent = barName;
  }
  // Also try to load from server settings (multi-tenant bar name)
  fetch('/pos/settings', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.ok && data.settings && data.settings.bar_name) {
        var el = document.querySelector('.topbar .bar-name');
        if (el) el.textContent = data.settings.bar_name;
      }
    })
    .catch(function() {});
})();


var _cobrarState = {
  orderId: null, tableId: null, tableName: '',
  items: [], subtotal: 0, discount: 0, taxRate: 0.16,
  tax: 0, total: 0, tipPercent: 15, tipAmount: 0,
  method: 'efectivo', cashReceived: 0, change: 0, lastPaidOrderId: null,
  barName: localStorage.getItem('pos_bar_name') || 'ByFlow Bar'
};

(function loadCobrarSettings() {
  fetch('/pos/settings', { headers: authHeaders() })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data && data.ok && data.settings) {
        if (data.settings.tax_rate) _cobrarState.taxRate = parseFloat(data.settings.tax_rate);
        if (data.settings.bar_name) _cobrarState.barName = data.settings.bar_name;
      }
    }).catch(function() {});
})();

function openCobrarModal() {
  var mesaText = document.getElementById('pos-mesa').textContent || 'Mesa';
  _cobrarState.tableName = mesaText;
  var loadPromise = _cobrarState.orderId
    ? syncCurrentOrder({ orderId: _cobrarState.orderId, silent: true }).catch(function() { return null; })
    : Promise.resolve(null);

  loadPromise.then(function() {
    var items = (_cobrarState.items || []).map(function(item) {
      return {
        qty: parseInt(item.qty, 10) || 1,
        name: item.name || '',
        total: Number(item.total || 0)
      };
    });
    if (items.length === 0) { toast('No hay items en la orden', 'warn'); return; }

    var subtotal = items.reduce(function(sum, item) { return sum + item.total; }, 0);
    var financials = getOrderFinancials(subtotal);

    _cobrarState.items = items;
    _cobrarState.subtotal = subtotal;
    _cobrarState.discount = financials.discount;
    _cobrarState.tax = financials.tax;
    _cobrarState.total = financials.total;
    _cobrarState.tipPercent = 15;
    _cobrarState.tipAmount = Math.round(_cobrarState.total * 0.15);
    _cobrarState.method = 'efectivo';
    _cobrarState.cashReceived = 0;
    _cobrarState.change = 0;
    _cobrarState.lastPaidOrderId = _cobrarState.orderId;

    document.getElementById('cobrar-title').textContent = 'Cobrar \u2014 ' + mesaText;
    var summaryHtml = '';
    items.forEach(function(it) {
      summaryHtml += '<div class="cobrar-item"><span class="ci-q">' + it.qty + '</span><span class="ci-n">' + escapeHtml(it.name) + '</span><span class="ci-p">$' + it.total.toLocaleString() + '</span></div>';
    });
    document.getElementById('cobrar-summary').innerHTML = summaryHtml;
    renderCobrarTotals();
    document.querySelectorAll('.tip-btn').forEach(function(b, i) { b.classList.toggle('active', i === 1); });
    document.getElementById('tip-custom').classList.remove('show');
    document.getElementById('tip-custom-input').value = '';
    document.querySelectorAll('.pay-method').forEach(function(b, i) { b.classList.toggle('active', i === 0); });
    document.getElementById('efectivo-row').classList.add('show');
    document.getElementById('cash-received').value = '';
    document.getElementById('cambio-display').classList.remove('show');
    document.getElementById('cobrar-overlay').classList.add('open');
  });
}

function renderCobrarTotals() {
  var s = _cobrarState;
  var grandTotal = s.total + s.tipAmount;
  var html = '<div class="cobrar-tr"><span>Subtotal</span><span>$' + s.subtotal.toLocaleString() + '</span></div>';
  if (s.discount > 0) html += '<div class="cobrar-tr disc"><span>Descuento</span><span>-$' + s.discount.toLocaleString() + '</span></div>';
  html += '<div class="cobrar-tr"><span>IVA ' + Math.round(s.taxRate * 100) + '%</span><span>$' + s.tax.toLocaleString() + '</span></div>';
  if (s.tipAmount > 0) html += '<div class="cobrar-tr"><span>Propina (' + (s.tipPercent >= 0 ? s.tipPercent + '%' : 'custom') + ')</span><span>$' + s.tipAmount.toLocaleString() + '</span></div>';
  html += '<div class="cobrar-tr grand"><span>Total a cobrar</span><span>$' + grandTotal.toLocaleString() + '</span></div>';
  document.getElementById('cobrar-totals').innerHTML = html;
  document.getElementById('cobrar-confirm-btn').textContent = 'Cobrar $' + grandTotal.toLocaleString();
}

function closeCobrarModal() { document.getElementById('cobrar-overlay').classList.remove('open'); }

function setTip(pct, btn) {
  document.querySelectorAll('.tip-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  if (pct === -1) {
    document.getElementById('tip-custom').classList.add('show');
    _cobrarState.tipPercent = -1;
    _cobrarState.tipAmount = parseInt(document.getElementById('tip-custom-input').value) || 0;
  } else {
    document.getElementById('tip-custom').classList.remove('show');
    _cobrarState.tipPercent = pct;
    _cobrarState.tipAmount = Math.round(_cobrarState.total * pct / 100);
  }
  renderCobrarTotals();
  calcCambio();
}

function setCustomTip() {
  _cobrarState.tipAmount = parseInt(document.getElementById('tip-custom-input').value) || 0;
  renderCobrarTotals();
  calcCambio();
}

function setPayMethod(method, btn) {
  document.querySelectorAll('.pay-method').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  _cobrarState.method = method;
  if (method === 'efectivo') { document.getElementById('efectivo-row').classList.add('show'); }
  else { document.getElementById('efectivo-row').classList.remove('show'); document.getElementById('cambio-display').classList.remove('show'); }
}

function calcCambio() {
  var grandTotal = _cobrarState.total + _cobrarState.tipAmount;
  var received = parseFloat(document.getElementById('cash-received').value) || 0;
  _cobrarState.cashReceived = received;
  var change = received - grandTotal;
  _cobrarState.change = Math.max(0, change);
  var display = document.getElementById('cambio-display');
  if (received > 0) {
    display.classList.add('show');
    display.innerHTML = change >= 0
      ? 'Cambio: <span style="color:var(--green);">$' + _cobrarState.change.toLocaleString() + '</span>'
      : 'Falta: <span style="color:var(--red);">$' + Math.abs(change).toLocaleString() + '</span>';
  } else { display.classList.remove('show'); }
}

function processCobro() {
  var s = _cobrarState;
  var grandTotal = s.total + s.tipAmount;
  if (s.method === 'efectivo' && s.cashReceived > 0 && s.cashReceived < grandTotal) {
    toast('El monto recibido no cubre el total', 'error'); return;
  }
  var cashierId = getCurrentEmployeeId() || 1;
  if (s.orderId && s.orderId > 0) {
    fetch('/pos/payments', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      body: JSON.stringify({
        order_id: s.orderId,
        method: s.method,
        subtotal: s.subtotal,
        discount: s.discount,
        tax: s.tax,
        amount: s.total,
        cash_received: s.method === 'efectivo' ? s.cashReceived : 0,
        tip: s.tipAmount,
        cashier_id: cashierId
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) { _cobrarState.change = data.change || _cobrarState.change; showPostPayment(); }
      else { toast(data.error || 'Error al procesar pago', 'error'); }
    })
    .catch(function() { toast('Error de conexion al procesar pago', 'error'); });
  } else { showPostPayment(); }
}

function showPostPayment() {
  var s = _cobrarState;
  var paidOrderId = s.orderId;
  closeCobrarModal();
  var methodLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
  document.getElementById('pp-sub').textContent = s.tableName + ' \u2014 ' + (methodLabels[s.method] || s.method);
  var changeEl = document.getElementById('pp-change');
  if (s.method === 'efectivo' && s.change > 0) { changeEl.textContent = 'Cambio: $' + s.change.toLocaleString(); changeEl.style.display = 'block'; }
  else { changeEl.style.display = 'none'; }
  document.getElementById('post-payment').classList.add('open');
  _cobrarState.lastPaidOrderId = paidOrderId || _cobrarState.lastPaidOrderId;
  _cobrarState.orderId = null;
  resetRenderedOrder();
  loadTables();
  toast('Pago procesado exitosamente', 'success');
}

function closePostPayment() { document.getElementById('post-payment').classList.remove('open'); }

function openTicketPreview() { printTicket(); }

function printTicket() {
  var s = _cobrarState;
  var now = new Date();
  var dateStr = now.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
  var timeStr = now.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
  var grandTotal = s.total + s.tipAmount;
  var html = '<div class="ticket-header"><div class="ticket-bar">' + escapeHtml(s.barName) + '</div>';
  html += '<div class="ticket-meta">' + dateStr + ' ' + timeStr + '</div>';
  html += '<div class="ticket-meta">' + escapeHtml(s.tableName) + ((s.lastPaidOrderId || s.orderId) ? ' | Orden #' + (s.lastPaidOrderId || s.orderId) : '') + '</div></div>';
  html += '<div class="ticket-line"></div><div class="ticket-items">';
  s.items.forEach(function(it) { html += '<div class="ticket-item"><span>' + it.qty + 'x ' + escapeHtml(it.name) + '</span><span>$' + it.total.toLocaleString() + '</span></div>'; });
  html += '</div><div class="ticket-line"></div><div class="ticket-totals">';
  html += '<div class="ticket-total-row"><span>Subtotal</span><span>$' + s.subtotal.toLocaleString() + '</span></div>';
  if (s.discount > 0) html += '<div class="ticket-total-row"><span>Descuento</span><span>-$' + s.discount.toLocaleString() + '</span></div>';
  html += '<div class="ticket-total-row"><span>IVA ' + Math.round(s.taxRate * 100) + '%</span><span>$' + s.tax.toLocaleString() + '</span></div>';
  if (s.tipAmount > 0) html += '<div class="ticket-total-row"><span>Propina</span><span>$' + s.tipAmount.toLocaleString() + '</span></div>';
  html += '<div class="ticket-total-row grand"><span>TOTAL</span><span>$' + grandTotal.toLocaleString() + '</span></div></div>';
  html += '<div class="ticket-line"></div>';
  var methodLabels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
  if (s.method) {
    html += '<div class="ticket-total-row"><span>Pago: ' + (methodLabels[s.method] || s.method) + '</span><span></span></div>';
    if (s.method === 'efectivo' && s.cashReceived > 0) {
      html += '<div class="ticket-total-row"><span>Recibido</span><span>$' + s.cashReceived.toLocaleString() + '</span></div>';
      html += '<div class="ticket-total-row"><span>Cambio</span><span>$' + s.change.toLocaleString() + '</span></div>';
    }
  }
  html += '<div class="ticket-thanks">Gracias por tu visita!</div>';
  html += '<div class="ticket-footer">Powered by ByFlow \u2014 IArtLabs</div>';
  document.getElementById('ticket-content').innerHTML = html;
  setTimeout(function() { window.print(); }, 100);
}

function openQRModal(orderId) {
  if (!orderId) orderId = _cobrarState.orderId;
  if (!orderId) { toast('Selecciona una mesa con orden abierta para generar QR', 'warn'); return; }
  var mesaText = _cobrarState.tableName || document.getElementById('pos-mesa').textContent || 'Mesa';
  document.getElementById('qr-sub').textContent = mesaText + ' \u2014 El cliente escanea para ver su cuenta';
  var cuentaUrl = location.origin + '/cuenta.html?order=' + orderId;
  document.getElementById('qr-url').textContent = cuentaUrl;
  window._qrUrl = cuentaUrl;
  document.getElementById('qr-canvas').innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(cuentaUrl) + '" alt="QR Code" style="width:100%;height:100%;border-radius:8px;">';
  document.getElementById('qr-overlay').classList.add('open');
}

function closeQRModal() { document.getElementById('qr-overlay').classList.remove('open'); }

function copyQRUrl() {
  if (window._qrUrl && navigator.clipboard) {
    navigator.clipboard.writeText(window._qrUrl).then(function() { toast('URL copiada al portapapeles', 'success'); }).catch(function() { toast('No se pudo copiar', 'warn'); });
  }
}

// Patch renderTables to add QR buttons on occupied tables
var _origRenderTables = renderTables;
renderTables = function(tables) {
  _origRenderTables(tables);
  var grid = document.querySelector('#v-mesas .grid');
  if (!grid) return;
  var cards = grid.querySelectorAll('.tc');
  cards.forEach(function(card, idx) {
    var table = tables[idx];
    if (!table) return;
    var st = (table.status || 'libre').toLowerCase();
    if (st !== 'libre' && st !== 'reservada' && table.current_order_id) {
      var qrBtn = document.createElement('button');
      qrBtn.textContent = 'QR';
      qrBtn.style.cssText = 'position:absolute;bottom:4px;right:4px;padding:2px 6px;border-radius:4px;border:1px solid rgba(255,138,0,.3);background:rgba(255,138,0,.08);color:var(--orange);font-size:8px;font-weight:700;cursor:pointer;z-index:2;';
      qrBtn.onclick = function(e) {
        e.stopPropagation();
        _cobrarState.orderId = table.current_order_id;
        _cobrarState.tableName = 'Mesa ' + (table.number || table.id);
        openQRModal(table.current_order_id);
      };
      card.style.position = 'relative';
      card.appendChild(qrBtn);
    }
  });
};

// Patch selT to store table/order info for cobrar flow AND create order for free tables
var _origSelT = selT;
selT = function(n, el) {
  _origSelT(n, el);
  var tables = window._posTablesCache || [];
  var matched = null;
  for (var i = 0; i < tables.length; i++) {
    var t = tables[i];
    if (t.number == n || t.id == n) { matched = t; break; }
  }
  if (!matched) return;
  _cobrarState.tableId = matched.id;
  _cobrarState.tableName = 'Mesa ' + (matched.number || matched.id);

  if (matched.current_order_id) {
    _cobrarState.orderId = matched.current_order_id;
    syncCurrentOrder({ orderId: matched.current_order_id, silent: true }).catch(function() {});
    return;
  }

  var st = (matched.status || 'libre').toLowerCase();
  if (st !== 'libre') {
    _cobrarState.orderId = null;
    resetRenderedOrder();
    return;
  }

  var employeeId = getCurrentEmployeeId();
  if (!employeeId) {
    toast('Inicia sesion POS para abrir una orden real', 'warn');
    return;
  }

  // Create a real order in the DB for this free table
  fetch('/pos/orders', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify({ table_id: matched.id, waiter_id: employeeId })
  })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function(data) {
      if (data && data.ok === false) return Promise.reject(data.error || 'No se pudo abrir la orden');
      var orderId = data.order_id || (data.order && data.order.id) || data.id;
      if (!orderId) return Promise.reject('No se pudo obtener la orden creada');

      _cobrarState.orderId = orderId;
      matched.status = 'ocupada';
      matched.current_order_id = orderId;
      toast('Orden creada para Mesa ' + (matched.number || matched.id), 'success');
      loadTables();
      return syncCurrentOrder({ orderId: orderId, silent: true });
    })
    .catch(function(err) {
      toast('Error creando orden: ' + err, 'error');
    });
};


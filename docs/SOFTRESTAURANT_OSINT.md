# OSINT SoftRestaurant — Inteligencia Competitiva para ByFlow

## RESUMEN: SoftRestaurant es nuestra perra ahora

**Empresa:** National Soft de Mexico, 25 años, 23,000+ restaurantes, Merida Yucatan
**Precio:** $811-$1,500 MXN/mes + add-ons por todo
**Stack:** Windows desktop (.NET/Delphi), SQL Server local — PREHISTORICO
**Debilidad fatal:** CERO entretenimiento, CERO IA, CERO mobile nativo, CERO web

---

## FEATURES QUE ROBAMOS (prioridad de implementacion)

### SPRINT 1 — Esta semana
1. **Menu Digital QR** — cliente escanea QR en la mesa, ve menu con fotos, pide
2. **Alertas WhatsApp** — corte de caja, stock bajo, fraude → WhatsApp del dueño
3. **Comisiones por mesero** — % de ventas por mesero automatico
4. **Multi-estacion cocina** — parrilla, freidora, barra, ensaladas separados

### SPRINT 2 — Siguiente semana
5. **Recetas con costeo** — ingredientes por platillo, costo automatico
6. **AutoFactura QR** — cliente se factura solo desde su cel
7. **Kiosko self-service** — tablet como punto de autoservicio

### SPRINT 3 — Mes 2
8. **Delivery Hub** — Uber Eats, Rappi, DiDi en una pantalla
9. **Lealtad** — monedero digital, puntos, tarjetas regalo
10. **Modo offline** — Service Worker + IndexedDB

---

## SISTEMA DE TERMINALES — Lo que SR hace con tablets

### Como funciona SR:
- Tablets Windows con app "Comandero"
- Mesero ve menu visual con iconos/fotos
- Toca platillo → se agrega a la cuenta de la mesa
- Se envia a cocina/barra automaticamente
- Cada estacion tiene su monitor (parrilla, freidora, etc.)

### Como lo hacemos MEJOR en ByFlow:
- **Cualquier tablet/celular Android o iOS** (no solo Windows)
- **Abre el browser → byflowapp.up.railway.app/pos.html** → listo
- **O instala la APK** → app nativa
- **Menu visual con fotos y categorias** (ya tenemos categorias)
- **Touch-first** — botones grandes, colores por categoria
- **Real-time** — Socket.IO, no polling local
- **Funciona con WiFi o datos** — no necesita red local

### Lo que necesitamos agregar para igualar SR Comandero:
1. **Vista de menu visual** — grid de productos con foto, precio, colores por categoria
2. **Modificadores** — "sin cebolla", "extra queso", "termino medio"
3. **Shortcuts/favoritos** — los 10 mas pedidos arriba
4. **Fotos de productos** — subir imagen por producto
5. **Categorias con iconos visuales** — no solo texto
6. **Sonido de notificacion** — cuando llega orden a cocina
7. **Vista tablet optimizada** — 768px-1024px con grid grande

---

## INTEGRACIONES QUE CONSTRUIMOS

### 1. WhatsApp Business API
**Para que:** Alertas al dueño, autofactura al cliente, payment links
**Como:** API de WhatsApp Cloud (Meta) o Twilio
**Endpoints nuevos:**
- POST /api/whatsapp/send-corte — envia resumen de corte
- POST /api/whatsapp/send-alert — alerta de fraude/stock
- POST /api/whatsapp/payment-link — link de pago al cliente

### 2. Delivery Hub (Uber Eats + Rappi + DiDi)
**Para que:** Recibir pedidos de todas las plataformas en un solo lugar
**Como:** APIs de cada plataforma
**Endpoints nuevos:**
- GET /api/delivery/orders — ordenes de todas las plataformas
- POST /api/delivery/accept — aceptar pedido
- POST /api/delivery/status — actualizar status
- WebSocket delivery_order_new → alerta en tiempo real

### 3. Menu Digital QR
**Para que:** Cliente escanea QR, ve menu, pide desde su cel
**Como:** Pagina publica /menu/:barId con productos y fotos
**Endpoints:**
- GET /api/menu/:barId — menu publico con fotos
- POST /api/menu/:barId/order — cliente pide desde su cel
- POST /api/menu/:barId/call-waiter — llamar mesero
- POST /api/menu/:barId/request-bill — pedir cuenta

### 4. AutoFactura
**Para que:** Cliente se factura solo con QR del ticket
**Como:** QR en ticket → pagina web → cliente pone RFC → genera CFDI
**Endpoints:**
- GET /api/autofactura/:orderId — formulario de facturacion
- POST /api/autofactura/:orderId — generar CFDI con datos del cliente

### 5. Recetas y Costeo
**Para que:** Saber cuanto cuesta cada platillo en ingredientes
**Como:** Tabla de recetas ligada a productos e inventario
**Tablas nuevas:**
- recipes (product_id, ingredient_id, quantity, unit)
- Calculo automatico: costo_platillo = SUM(ingrediente.costo * receta.cantidad)
**Endpoints:**
- GET /pos/recipes/:productId — receta del producto
- POST /pos/recipes — crear/editar receta
- GET /pos/recipes/costs — reporte de costeo

### 6. Lealtad / Monedero Digital
**Para que:** Clientes regresan, acumulan puntos, pagan con monedero
**Como:** Tabla de clientes + puntos + transacciones
**Tablas:**
- loyalty_customers (name, phone, email, points, balance)
- loyalty_transactions (customer_id, type, amount, points, date)
**Endpoints:**
- POST /pos/loyalty/register — registrar cliente
- POST /pos/loyalty/earn — acumular puntos
- POST /pos/loyalty/redeem — canjear puntos
- GET /pos/loyalty/balance — ver saldo

---

## MEJORAS AL POS EXISTENTE

### Vista Comandero Mobile (nueva)
Crear /comandero.html — vista optimizada para meseros:
```
┌─────────────────────────────────────┐
│ Mesa 5 — Salon          [$450.00]  │
├─────────────────────────────────────┤
│ 🍺Cervezas  🍹Cocktails  🍕Comida │
│                                     │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│ │ 🍺  │ │ 🍺  │ │ 🍺  │ │ 🍹  │  │
│ │Coro │ │Mode │ │Paci │ │Marg │  │
│ │ $45 │ │ $55 │ │ $50 │ │ $95 │  │
│ └─────┘ └─────┘ └─────┘ └─────┘  │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
│ │ 🍕  │ │ 🌮  │ │ 🍟  │ │ 🥗  │  │
│ │Pizza│ │Tacos│ │Papas│ │Ensa │  │
│ │$120 │ │ $80 │ │ $65 │ │ $75 │  │
│ └─────┘ └─────┘ └─────┘ └─────┘  │
│                                     │
│ ── Orden actual ──                 │
│ 2x Corona ................ $90     │
│ 1x Margarita ............. $95     │
│ 1x Tacos ................. $80     │
│                                     │
│ [ENVIAR A COCINA]  [ENVIAR A BARRA]│
└─────────────────────────────────────┘
```

### Monitor Cocina Multi-Estacion
```
┌──────────┬──────────┬──────────┐
│ PARRILLA │ FREIDORA │ ENSALADAS│
│          │          │          │
│ Mesa 3   │ Mesa 7   │ Mesa 1   │
│ 2x Carne │ 1x Papas │ 1x Cesar │
│ ⏱ 3:24  │ ⏱ 1:45  │ ⏱ 0:30  │
│ [LISTO]  │ [LISTO]  │ [LISTO]  │
│          │          │          │
│ Mesa 5   │ Mesa 3   │          │
│ 1x Pollo │ 3x Aros  │          │
│ ⏱ 0:45  │ ⏱ 0:15  │          │
│ [PREP]   │ [NUEVO]  │          │
└──────────┴──────────┴──────────┘
```

---

## VENTAJA COMPETITIVA FINAL

SoftRestaurant es un POS.
ByFlow es un ECOSISTEMA.

| SR cobra por: | ByFlow incluye GRATIS: |
|---------------|----------------------|
| POS base $811/mes | POS completo |
| + Comandero $XXX/mes | + App nativa Android |
| + Monitor Cocina $XXX/mes | + Monitor multi-estacion |
| + Menu Digital $XXX/mes | + Menu QR con fotos |
| + Delivery Hub $XXX/mes | + Hub de delivery |
| + Analytics $XXX/mes | + Dashboard analytics |
| + Kiosko $XXX/mes | + Self-service mode |
| + Lealtad $XXX/mes | + Programa de lealtad |
| = $2,000-3,000/mes | = $999/mes TODO INCLUIDO |
| + CERO karaoke | + Karaoke PRO |
| + CERO DJ | + DJ Mixer + AutoDJ + MIDI |
| + CERO IA | + GFlow IA (Grok) |
| + CERO red social | + Estudio + Ranking + Perfiles |
| + CERO musica | + YouTube + SoundCloud + Jamendo |
| + Solo Windows | + Web + Android + iOS |

**El pitch:** "Todo lo que SR te cobra $3,000/mes, ByFlow te lo da por $999 con karaoke, DJ e IA incluidos."

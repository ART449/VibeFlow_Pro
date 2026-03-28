# ByFlow POS Eatertainment — Plan Maestro

## Vision
Primer POS en Mexico que integra punto de venta + karaoke + entretenimiento.
Competencia directa: SoftRestaurant, Parrot, Square. Ventaja: nadie tiene Eatertainment.

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (SPA)                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │
│  │Dueno │ │Geren.│ │Mesero│ │Cocina│ │Bartender │  │
│  │ VIEW │ │ VIEW │ │ VIEW │ │ VIEW │ │  VIEW    │  │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └────┬─────┘  │
│     └────────┴────────┴────────┴───────────┘        │
│                    Socket.IO Client                  │
└─────────────────────┬───────────────────────────────┘
                      │ WebSocket + REST
┌─────────────────────┴───────────────────────────────┐
│                   BACKEND (server.js)                │
│  ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────────┐ │
│  │ Auth/PIN │ │ Orders │ │ Tables │ │ Inventory  │ │
│  │ + RBAC   │ │ Module │ │ Module │ │  Module    │ │
│  └──────────┘ └────────┘ └────────┘ └────────────┘ │
│  ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────────┐ │
│  │ Kitchen  │ │Payment │ │Karaoke │ │  Reports   │ │
│  │  Module  │ │ Module │ │ Module │ │  Module    │ │
│  └──────────┘ └────────┘ └────────┘ └────────────┘ │
│                   Socket.IO Server                   │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────┐
│              DATABASE (better-sqlite3)               │
│  employees, tables, products, categories,            │
│  orders, order_items, payments, inventory,            │
│  shifts, covers, karaoke_queue, settings             │
└─────────────────────────────────────────────────────┘
```

## Jerarquia de Roles

| Nivel | Rol | PIN | Acceso |
|-------|-----|-----|--------|
| 0 | Dueno | 6 digitos | TODO - multi-sucursal, finanzas, config global |
| 1 | Gerente | 6 digitos | Operacion completa, reportes, empleados turno |
| 2 | Capitan | 4 digitos | Asignar mesas, supervisar, aprobar cortesias |
| 3 | Cajero | 4 digitos | Cobrar, corte de SU caja, tickets, CFDI |
| 4 | Mesero | 4 digitos | Comandas SUS mesas, pedir cuenta |
| 5 | Bartender | 4 digitos | Monitor barra, marcar lista |
| 6 | Cocinero | 4 digitos | Monitor cocina, marcar lista |
| 7 | DJ | 4 digitos | Cola karaoke, siguiente cancion |
| 8 | Seguridad | 4 digitos | Cover, registro entrada/salida |

## Autorizacion Escalonada
- Cancelar item → requiere PIN de Capitan+ (nivel 2+)
- Descuento hasta 10% → requiere PIN de Capitan+
- Descuento 10-20% → requiere PIN de Gerente+
- Descuento 20%+ → requiere PIN de Dueno
- Cortesia (100% gratis) → requiere PIN de Gerente+
- Corte de caja → requiere PIN de Cajero+ para SU caja, Gerente+ para todas
- Modificar menu/precios → requiere PIN de Dueno

## Multi-Dispositivo (Socket.IO Rooms)

```
Room: bar_{barId}           → Todos los dispositivos del bar
Room: bar_{barId}_kitchen   → Solo pantallas de cocina
Room: bar_{barId}_bar       → Solo pantalla de barra
Room: bar_{barId}_karaoke   → Solo pantalla de karaoke/DJ
Room: bar_{barId}_entrance  → Solo pantalla de seguridad
```

Eventos sync:
- order:new → notifica cocina + barra + mesa
- order:update → actualiza item en todas las pantallas
- order:ready → notifica mesero que comida esta lista
- table:status → actualiza mapa de mesas en todas las pantallas
- karaoke:next → cambia cancion en teleprompter + DJ
- cover:entry → actualiza contador en entrada + dashboard
- payment:complete → libera mesa en mapa

## Fases de Implementacion

### Fase 1: Core (esta sesion)
- [x] Prototipo visual completo
- [ ] Database schema + migrations
- [ ] Auth por PIN + RBAC middleware
- [ ] API REST: employees, tables, products, orders
- [ ] Socket.IO rooms + sync basico

### Fase 2: POS Funcional
- [ ] Comandas funcionales (crear, agregar items, enviar)
- [ ] Monitor cocina en tiempo real
- [ ] Monitor barra en tiempo real
- [ ] Cobro (efectivo, tarjeta, dividir cuenta)
- [ ] Corte de caja

### Fase 3: Eatertainment
- [ ] Karaoke integrado al POS (cola por mesa)
- [ ] Cover/entrada con control de capacidad
- [ ] Happy Hour automatico (horarios, productos, descuentos)
- [ ] Soundboard y jingles por mesa
- [ ] QR Menu (cliente escanea y ve menu)

### Fase 4: Admin & Analytics
- [ ] Reportes en tiempo real (ventas, productos, empleados)
- [ ] Inventario con alertas de stock bajo
- [ ] Costo por trago y margen de ganancia
- [ ] Facturacion CFDI 4.0
- [ ] Multi-sucursal

### Fase 5: Mobile & Growth
- [ ] App movil para meseros (PWA)
- [ ] Delivery integration
- [ ] Programa de lealtad (puntos, wallet)
- [ ] Reservaciones online
- [ ] Dashboard dueno (ver desde casa)

# ByFlow Native Prep

Fecha: 2026-03-30

## Objetivo

Preparar ByFlow para migrar de web app a app nativa sin romper el backend POS ya operativo ni volver a meter la logica de negocio dentro de la UI.

## Decision que no cambia

- Mantener el backend actual de ByFlow y POS como fuente de verdad.
- Mover la logica de experiencia a cliente nativo.
- Evitar portar HTML inline y estado DOM-dependiente tal cual.

## Lo que ya esta listo para reutilizar

- Backend POS en `pos/` con rutas, auth, RBAC y pagos.
- Contratos REST existentes para mesas, ordenes, items, covers, karaoke, inventario y corte.
- Flujos operativos ya probados en web:
  - seleccionar mesa
  - abrir orden
  - agregar items
  - enviar comanda
  - monitor cocina/barra
  - cobrar
  - karaoke por mesa

## Bloqueadores actuales para nativo

- `public/bares-v2.html` sigue concentrando demasiada logica de presentacion + estado.
- El estado del POS aun vive mezclado entre variables globales y mutaciones del DOM.
- El overlay movil actual es un clon del panel desktop, bueno para UX web, pero no portable a nativo.
- Hay helpers que dependen de IDs/estructura HTML en vez de un store o view-model.

## Camino recomendado

### 1. Mantener backend, rehacer cliente

No conviene “envolver” la web actual si el objetivo es app nativa seria. Lo correcto es:

- reutilizar backend actual
- definir store del POS
- recrear pantallas nativas por flujo

### 2. Extraer dominio compartido

Crear una capa compartida de dominio para POS con:

- `order`
- `table`
- `payment`
- `kitchen`
- `karaoke`
- `inventory`

Cada modulo debe describir:

- estado minimo
- eventos
- acciones
- transformaciones de datos

### 3. Separar flujos por rol

La app nativa no debe intentar cargar todo el dashboard web completo en una sola vista.

Pantallas nativas sugeridas:

1. Login PIN / sesion
2. Mapa de mesas
3. Comanda de mesa
4. Cobro
5. Cocina
6. Barra
7. Karaoke/DJ
8. Corte / resumen

## Flujos nativos prioritarios

### Mesero

- ver mesas
- tocar mesa
- abrir/ver orden
- agregar items
- enviar comanda
- cobrar rapido

### Cocina / Barra

- ver cola filtrada
- marcar preparando
- marcar listo

### Caja

- cobrar efectivo
- cobrar tarjeta
- propina
- ticket

## Recomendacion tecnica

### Si Claude va por React Native / Expo

Este es el camino mas rapido para ByFlow:

- compartir modelos y utilidades JS/TS
- usar REST existente
- usar WebSocket/Socket.IO solo donde de verdad importe tiempo real
- migrar por modulo, no por pantalla monstruo

### Si Claude va por nativo puro

Tambien es valido, pero hay que congelar contratos API cuanto antes para evitar doble trabajo.

## Contratos que deben congelarse primero

- `GET /pos/tables`
- `POST /pos/orders`
- `GET /pos/orders/:id`
- `POST /pos/orders/:id/items`
- `PUT /pos/order-items/:id/status`
- `POST /pos/payments`
- `GET /pos/karaoke/queue`
- `POST /pos/karaoke/queue`
- `GET /pos/orders`

## No-regret tasks para Codex

Estas tareas ayudan aunque la app nativa cambie de stack:

1. seguir sacando logica de UI de `public/bares-v2.html`
2. documentar flujos y contratos del POS
3. mantener regresiones sobre comportamiento operativo
4. reducir dependencias de IDs del DOM
5. dejar nombres de acciones y estado consistentes

## Recomendacion operativa para hoy

Si hoy mismo inicia la migracion:

- Claude toma arquitectura y shell nativo
- Codex sigue limpiando flujos POS y contratos
- no intentar “migrar toda la web” de una
- empezar por:
  - Login
  - Mesas
  - Comanda
  - Cobro

## Dictamen

ByFlow ya esta en punto de pasar a cliente nativo.

Lo que no conviene hacer es portar el HTML actual como si fuera la arquitectura final.

Lo que si conviene hacer es usar el backend POS actual como columna vertebral y reconstruir la experiencia nativa por flujos.

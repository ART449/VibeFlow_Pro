# Auditoria de Roles y Perfiles POS — Para Codex

## Objetivo
Entrar a la app como cada tipo de usuario y verificar que:
1. Cada rol solo ve lo que le corresponde
2. Todos los botones funcionan
3. No se puede escalar privilegios
4. El login por Google funciona para duenos y empleados
5. Sin licencia NO se puede entrar al POS

## URLs
- Produccion: https://byflowapp.up.railway.app
- POS login: https://byflowapp.up.railway.app/pos.html
- POS dashboard: https://byflowapp.up.railway.app/bares-v2.html
- Karaoke (gratis): https://byflowapp.up.railway.app/
- Admin licencias: https://byflowapp.up.railway.app/admin-licencias.html

## Licencia del dueno (ya activa)
- Email: elricondelgeekdearturo@gmail.com
- Plan: POS_VITALICIO
- Key: VFP-D17FA-30334-AA568-9313C

## Arquitectura de auth
- Login por Google → `/pos/auth/login-email` (busca email en tabla employees)
- Login por PIN → `/pos/auth/login` (PIN 4-6 digitos, unico por bar)
- Setup primera vez → `/pos/auth/setup-owner` (solo si bar vacio, genera PIN aleatorio)
- Token JWT en sessionStorage → Bearer token en cada request
- bar_id = SHA-256 del email del dueno (multi-tenant)

## Roles a auditar (9 roles)

### 1. DUENO (role_level: 0)
- **Debe ver**: TODO — mesas, comandas, cobrar, cocina, barra, inventario, reportes, corte, CFDI, empleados, config, El Avispero, Builders UX/UI, karaoke, reservaciones, cover
- **Puede hacer**: agregar/editar/eliminar empleados, cambiar config, ver reportes, hacer cortes, todo
- **Test**: Entrar con Google (elricondelgeekdearturo@gmail.com) → verificar sidebar completo

### 2. GERENTE (role_level: 1)
- **Debe ver**: casi todo + El Avispero, Builders UX/UI
- **NO debe ver**: nada bloqueado (tiene casi todos los permisos)
- **Test**: Crear empleado gerente con email, login con Google, verificar sidebar

### 3. CAPITAN (role_level: 2)
- **Debe ver**: mesas, comandas, cobrar, reservaciones, cover, cocina, barra
- **NO debe ver**: empleados, config, El Avispero, Builders UX/UI, CFDI
- **Test**: Crear capitan, verificar que no ve items admin

### 4. CAJERO (role_level: 3)
- **Debe ver**: cobrar, corte, mesas, comandas
- **NO debe ver**: empleados, config, reportes, El Avispero, Builders UX/UI
- **Test**: Crear cajero, verificar que solo ve lo suyo

### 5. MESERO (role_level: 4)
- **Debe ver**: mis mesas, comandas
- **NO debe ver**: empleados, config, reportes, CFDI, inventario completo, El Avispero, Builders UX/UI
- **NO puede hacer**: descuentos sin autorizacion, eliminar ordenes
- **Test**: Crear mesero con email, login con Google, verificar sidebar limitado

### 6. BARTENDER (role_level: 5)
- **Debe ver**: monitor barra, comandas
- **NO debe ver**: config, empleados, reportes, El Avispero, Builders
- **Test**: Crear bartender, verificar vista barra

### 7. COCINERO (role_level: 6)
- **Debe ver**: monitor cocina
- **NO debe ver**: casi todo lo admin
- **Test**: Crear cocinero, verificar que solo ve cocina

### 8. DJ (role_level: 7)
- **Debe ver**: cola karaoke
- **NO debe ver**: todo lo admin, POS
- **Test**: Crear DJ, verificar solo karaoke

### 9. SEGURIDAD (role_level: 8)
- **Debe ver**: cover/entrada
- **NO debe ver**: todo lo demas
- **Test**: Crear seguridad, verificar acceso minimo

## Tests de seguridad

### Test A: Sin licencia
1. Cerrar sesion
2. Login con email que NO tiene licencia
3. Debe mostrar "No tienes licencia POS. Contacta IArtLabs"
4. NO debe poder acceder a bares-v2.html

### Test B: PIN duplicado
1. Como dueno, intentar crear dos empleados con el mismo PIN
2. Debe rechazar: "Ese PIN ya esta en uso por otro empleado"

### Test C: Email duplicado
1. Intentar crear dos empleados con el mismo email en el mismo bar
2. Debe rechazar: "Ya hay un empleado con ese email en este bar"

### Test D: Escalacion de privilegios
1. Como mesero, intentar acceder directamente a /pos/employees (API)
2. Debe recibir 403 o error de permisos
3. Intentar PUT /pos/settings sin ser dueno → debe fallar

### Test E: Token expirado
1. Guardar un token viejo
2. Esperar o invalidar
3. Usar token viejo en request → debe devolver "Sesion expirada"

### Test F: Karaoke gratis (sin login POS)
1. Ir a / (raiz)
2. Entrar al karaoke sin cuenta → debe funcionar gratis
3. Buscar cancion en YouTube → debe funcionar sin API key
4. Teleprompter → debe cargar letra y hacer scroll
5. Voice Scroll → boton de microfono visible
6. GFlow IA → debe mostrar "GFlow · grok-3-mini"

### Test G: Botones funcionales
En CADA vista del POS, hacer click en CADA boton visible y verificar que:
1. No da error en consola
2. Hace lo que dice
3. Si abre modal, el modal se cierra correctamente
4. Si hace fetch, la respuesta no es error

## Endpoints clave para verificar

```
POST /pos/auth/login          — PIN login
POST /pos/auth/login-email    — Google login por email
POST /pos/auth/setup-owner    — Setup primera vez (solo bar vacio)
GET  /pos/employees           — Lista empleados (requiere auth)
POST /pos/employees           — Crear empleado (requiere auth + permisos)
GET  /pos/orders              — Ordenes activas
POST /pos/orders              — Crear orden
GET  /pos/products            — Menu (publico para display)
GET  /api/pos/license?email=  — Verificar licencia
POST /api/pos/license/grant   — Crear licencia (admin only)
GET  /api/health              — Health check
GET  /api/ai/status           — GFlow status
GET  /api/config/keys         — YouTube/Jamendo config
```

## Archivos clave
- `pos/auth.js` — RBAC, tokens, permisos, PIN hashing
- `pos/routes.js` — 50+ endpoints POS
- `pos/database.js` — Schema SQLite + migraciones
- `public/pos.html` — Login page
- `public/bares-v2.html` — POS dashboard
- `public/index.html` — Karaoke/teleprompter
- `public/js/modules/auth.js` — Login karaoke (Firebase)
- `routes/billing.js` — Licencias + Stripe

## Criterio de exito
- CERO botones rotos
- CERO errores en consola al navegar
- Cada rol ve EXACTAMENTE lo que le corresponde
- Sin licencia = bloqueado
- PIN 000000 NO existe en ningun lado
- Google login funciona para dueno Y empleados
- Karaoke funciona gratis sin login POS

# ByFlow — Estado Real al 31 Marzo 2026

## LO QUE FUNCIONA (verificado en produccion)

### Karaoke (GRATIS) ✅
- [x] Welcome screen con login Google + email
- [x] Teleprompter con scroll palabra por palabra
- [x] Teleprompter PRO: voice scroll, countdown, focus line, marcadores, loop
- [x] Busqueda de letras en LRCLIB (LRC sincronizado + texto plano)
- [x] Letras de ArT-AtR hardcodeadas (11 canciones)
- [x] Catalogo Suno (30 tracks)
- [x] Cola de cantantes con Socket.IO en tiempo real
- [x] Controles: play/pause, velocidad, sync offset, fullscreen
- [x] Efectos de audio: VOL, REVERB, ECO, GRAVES, AGUDOS
- [x] Barra de progreso animada
- [x] Vista remota (/remote.html) para pantalla publica
- [x] QR para conectar dispositivos

### YouTube/Musica ✅
- [x] Busqueda YouTube sin API key (Piped fallback)
- [x] Busqueda YouTube con API key (server proxy)
- [x] Reproductor embebido iframe
- [x] SoundCloud widget
- [x] Jamendo streaming (si tiene client ID)
- [x] Auto-busqueda de letras al reproducir cancion

### IA Studio ✅
- [x] GFlow con Grok 3 Mini (server-side, sin config del usuario)
- [x] Chat IA integrado
- [x] Motor de letras offline v2 (192 frases, 65+ rimas)
- [x] Generacion de letras con firma ByFlow

### Estudio (Red Social) ✅
- [x] Editor de letras con beats de YouTube
- [x] Ranking/leaderboard con votos
- [x] Perfiles de creador (alias + PIN)
- [x] Feed de actividad en tiempo real
- [x] Mis Letras (publicar/despublicar)
- [x] Grabacion de voz (WebRTC)
- [x] Beats favoritos (localStorage)

### POS (Requiere Licencia) ✅
- [x] Login Google para duenos con licencia
- [x] Login Google para empleados (por email)
- [x] Login por PIN (4-6 digitos, unico por bar)
- [x] 9 roles con RBAC (dueno→seguridad)
- [x] Multi-tenant (cada bar = bar_id unico SHA-256)
- [x] 63 endpoints API
- [x] Mesas: crear, editar, cambiar estado, asignar mesero
- [x] Ordenes: crear, agregar items, cambiar status
- [x] Pagos: procesar pago, propinas, splits
- [x] Inventario: CRUD productos, ajustes de stock, alertas bajo stock
- [x] Categorias: CRUD con iconos
- [x] Monitor Cocina: ordenes pendientes con timer
- [x] Monitor Barra: filtro de pedidos de barra
- [x] Corte de caja: abrir/cerrar turno, resumen
- [x] Reservaciones: CRUD con status
- [x] Cover/Entrada: registro de covers
- [x] Happy Hour: programar descuentos automaticos
- [x] Empleados: CRUD, roles, PINs, emails
- [x] Configuracion: nombre del bar, impuestos, propinas
- [x] Backups automaticos SQLite
- [x] El Avispero: IA integrada (solo dueno/gerente)
- [x] Sidebar filtrado por rol

### Licencias/Billing ✅
- [x] Stripe checkout (3 planes POS)
- [x] Webhook auto-genera licencia al pagar
- [x] Admin panel de licencias (/admin-licencias.html)
- [x] Verificacion por email, bar_id, o key
- [x] Founder license hardcodeada (nunca se pierde)

### Infraestructura ✅
- [x] Railway deploy con Dockerfile
- [x] Volumen persistente /data para SQLite
- [x] CSP con Helmet (scriptSrcAttr unsafe-inline)
- [x] Security Shield (rate limit, IP blocking)
- [x] Socket.IO para tiempo real
- [x] APK Android nativa (Capacitor)
- [x] Pagina de descarga (/descargar.html)

### Seguridad ✅
- [x] bcrypt para PINs
- [x] Tokens con expiracion
- [x] Rate limiting en login
- [x] Input sanitization
- [x] Multi-tenant isolation por bar_id
- [x] Admin endpoints protegidos
- [x] PIN unico por bar (validacion)
- [x] Email unico por bar (validacion)

---

## LO QUE FALTA (pendientes reales)

### CRITICO (para piloto en bares)
- [ ] **Stripe configurado en Railway** — env vars de Stripe (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, precios)
- [ ] **YouTube API key en Railway** — para busquedas de mejor calidad
- [ ] **Facturacion CFDI** — necesita PAC provider (Finkok, Facturapi)
- [ ] **Imprimir tickets** — API de impresora termica (ESC/POS via USB/BT)
- [ ] **Tap to Pay NFC** — Stripe Terminal SDK (necesita APK nativa)

### ALTO (mejorar experiencia)
- [ ] **Flow Battle** — batallas de freestyle entre usuarios (spec escrita, no implementado)
- [ ] **Avatares/fotos de perfil** — Estudio solo tiene emoji placeholder
- [ ] **Notificaciones push** — Firebase Cloud Messaging en APK
- [ ] **Google Analytics** — GA_MEASUREMENT_ID en Railway env vars
- [ ] **Tutorial/onboarding** — guia interactiva para nuevos usuarios
- [ ] **Modo offline POS** — Service Worker + IndexedDB fallback

### MEDIO (nice to have)
- [ ] **Staging environment** — branch staging en Railway (servicio separado)
- [ ] **Demo ficticio** — pos-demo-sim.html sin datos reales
- [ ] **n8n auto-publish** — publicar automaticamente en Facebook
- [ ] **Catalogo de beats Suno** — 50 beats en proceso de generacion
- [ ] **Firma release APK** — keystore para Google Play
- [ ] **PWA install prompt** — mejorar el prompt de instalacion web
- [ ] **Multi-idioma** — ingles como segundo idioma

### BAJO (futuro)
- [ ] **Red social completa** — follows, likes, comments en letras
- [ ] **Streaming en vivo** — WebRTC para shows en vivo
- [ ] **Marketplace de beats** — compra/venta entre usuarios
- [ ] **API publica** — documentacion para integraciones terceros
- [ ] **Panel admin web** — dashboard de metricas para IArtLabs

---

## PAGINAS HTML (19 archivos)

| Pagina | Proposito | Estado |
|--------|-----------|--------|
| index.html | Karaoke + Teleprompter + Estudio | ✅ Funcional |
| bares-v2.html | POS Dashboard (14 vistas) | ✅ Funcional |
| pos.html | Login POS (PIN + Google) | ✅ Funcional |
| pos-admin.html | Admin empleados/productos | ✅ Funcional |
| pos-demo.html | Demo POS para marketing | ⚠️ Datos reales mezclados |
| admin-licencias.html | Generar licencias (solo Arturo) | ✅ Funcional |
| descargar.html | Descarga APK Android | ✅ Funcional |
| remote.html | Vista publica teleprompter | ✅ Funcional |
| show-control.html | Control de show DJ | ⚠️ Parcial |
| twin-player.html | Doble reproductor beat+voz | ⚠️ Parcial |
| lrc-studio.html | Editor LRC standalone | ⚠️ Parcial |
| landing.html | Landing page marketing | ✅ Estatica |
| presentacion-pos.html | Presentacion para bares | ✅ Estatica |
| migracion-pos.html | Info migracion a ByFlow | ✅ Estatica |
| cuenta.html | Gestion de cuenta | ⚠️ Parcial |
| documental.html | Historia de ByFlow | ✅ Estatica |
| privacy.html | Politica de privacidad | ✅ Estatica |
| terms.html | Terminos de servicio | ✅ Estatica |
| pos-offline.html | POS sin conexion | ❌ No implementado |

## NUMEROS

- **132 endpoints** API en total
- **34 modulos** JavaScript frontend
- **19 paginas** HTML
- **10 route files** backend
- **6 modulos** POS backend
- **9 roles** RBAC
- **17.4k creditos** Suno disponibles
- **4.6 MB** APK Android
- **~6000 lineas** index.html
- **~4000 lineas** bares-v2.html

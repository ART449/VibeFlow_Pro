# AUDITORÍA COMPLETA — ByFlow 31 Marzo 2026

## 5 auditorías profundas, ejecutadas en paralelo

---

## RESUMEN EJECUTIVO

| Auditoría | Archivos | Críticos | Altos | Medios | Bajos |
|-----------|----------|----------|-------|--------|-------|
| POS Endpoints (63) | routes.js, auth.js | 3 | 3 | 5 | 8 |
| 35 Módulos JS | 35 archivos | 0 | 6 patrones | 6 | 3 |
| Server + Infra | 14 archivos | 3 | 6 | 4 | 5 |
| CSS + Mobile + WCAG | index.html, bares-v2 | 8 | 5 | 5 | 0 |
| APK + PWA | 14+ archivos | 4 | 4 | 5 | 6 |
| **TOTAL** | **~80 archivos** | **18** | **24** | **25** | **22** |

---

## CRÍTICOS (18) — Arreglar ANTES de piloto

### POS Endpoints
1. **`/api/cuenta/:orderId` sin bar_id** — cualquiera puede ver facturas de CUALQUIER bar enumerando IDs
2. **`cancelled_by` spoofable** — cliente puede marcar items cancelados por otro empleado
3. **`PUT /pos/order-items/:id/status` sin middleware auth explícito** — edge case de bypass

### Server + Infra
4. **WebSocket tp_* sin auth** — cualquiera puede controlar el teleprompter en un evento en vivo
5. **Admin key leak** — `/api/license/admin/list` expone todas las licencias
6. **Email enumeration** — `/api/billing/status` permite descubrir emails con PRO

### CSS + Mobile
7. **30+ touch targets < 44px** — botones imposibles de tocar en mobile
8. **Font sizes 7-8px** — texto ilegible, viola WCAG AA
9. **Inputs 12px** — iOS hace zoom automático en cada campo
10. **z-index POS overlay (400) > topbar (50)** — topbar desaparece
11. **Layout roto 375px** — solo 225px de contenido en iPhone SE
12. **Modal overflow** — contenido inalcanzable en mobile (318px max)
13. **Bottom spacing** — POS sheet colisiona con topbar
14. **Color contrast --sub** — 5.2:1 falla en texto pequeño

### APK
15. **`cleartext: true`** — tráfico HTTP sin encriptar, robo de credenciales
16. **`allowMixedContent: true`** — recursos inseguros cargados en WebView
17. **google-services.json faltante** — push notifications no funcionan
18. **Firebase API key hardcodeada** — visible en código fuente público

---

## ALTOS (24) — Arreglar en primera semana

### POS
19. PATCH endpoints sin auth (cola, canciones, eventos)
20. No try/catch en transacciones de pago
21. Validación numérica inconsistente

### JS Modules
22. Funciones globales no verificadas (showToast, escHtml)
23. getElementById sin null checks (crash silencioso)
24. Dependencias de módulos asumidas sin validar
25. localStorage sin QuotaExceededError handling
26. Fetch error handling inconsistente
27. Valores hardcodeados (usernames, URLs)

### Server
28. HMAC signature solo 32 bits (brute-forceable)
29. IP-based voting con bypass VPN/proxy
30. LRCLIB proxy sin rate limit
31. YouTube API key en query params (leak en logs)
32. No email verification en billing checkout
33. Race conditions en JSON persistence

### APK
34. Permisos RECORD_AUDIO y CAMERA faltantes
35. PosHubActivity exported sin validación de intents
36. ProGuard deshabilitado (código legible)
37. Sin signing config para release/Play Store
38. Service Worker no cachea todas las páginas

### CSS
39. Solo 2 breakpoints (900px, 600px) — falta 768px tablet
40. Report grid 4 columnas en 375px (aplastado)
41. bares-v2 sin dark/light mode
42. Table cards 8px labels en tablet
43. Animations box-shadow causan 25% FPS drop

---

## LO QUE SÍ FUNCIONA BIEN

### POS ✅
- 90+ botones verificados — TODOS funcionan
- 12 modales abren/cierran correcto
- 25+ endpoints con auth correcta
- 59 de 63 endpoints protegidos (94%)
- SQL injection prevenido (queries parametrizados)
- XSS protection (HTML tag stripping)
- bcrypt PIN hashing con auto-upgrade
- Multi-tenant isolation por bar_id (95%)
- RBAC con 9 roles funcionando

### Karaoke ✅
- 163 onclick handlers — 158 funcionan (5 fixeados)
- 48+ wrappers globales verificados
- Teleprompter PRO features activas
- YouTube búsqueda sin API key
- GFlow IA con Grok 3 Mini
- Estudio con ranking y perfiles

### APK ✅
- Icons completos en 6 densidades
- Adaptive icons para API 26+
- Splash screen dark correcto
- Chrome Custom Tabs para OAuth
- PWA manifest completo
- Java code quality buena
- Capacitor bridge funcional

### Server ✅
- Security Shield con 20+ detectors
- Helmet CSP configurado
- Stripe webhook signature verified
- Rate limiting en endpoints críticos
- Graceful shutdown handlers
- Room/session isolation

---

## PLAN DE FIXES (priorizado)

### Semana 1 — Críticos
1. Agregar bar_id a `/api/cuenta/:orderId`
2. Eliminar `cancelled_by` del request body
3. Auth en WebSocket tp_* events
4. `cleartext: false` y `allowMixedContent: false` en Capacitor
5. Firebase key desde servidor (no hardcoded)
6. Touch targets mínimo 48px
7. Font sizes mínimo 12px (14px para body)
8. Inputs a 16px (prevenir iOS zoom)
9. z-index hierarchy: topbar 1000, overlays 100-600

### Semana 2 — Altos
10. PATCH endpoints con auth
11. try/catch en transacciones
12. HMAC signature a 128 bits
13. Permisos Android (audio, cámara)
14. ProGuard habilitado
15. Breakpoint 768px para tablet
16. Signing config para release

### Semana 3 — Medios
17. Rate limit en LRCLIB proxy
18. Email verification en billing
19. Back button handling en APK
20. Service Worker expandido
21. prefers-color-scheme detection
22. FileProvider paths restringidos

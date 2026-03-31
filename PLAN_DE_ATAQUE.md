# ByFlow — Plan de Ataque para Piloto en Bares

## Fase 0: LO QUE YA ESTA LISTO (no tocar)
- Karaoke + Teleprompter PRO ✅
- POS con 63 endpoints + 9 roles ✅
- Login Google + PIN + Email ✅
- Licencias con Stripe webhook ✅
- APK Android ✅
- GFlow IA ✅
- Estudio/Red Social ✅
- Security Shield ✅

---

## Fase 1: FIXES CRITICOS (antes de ir a un bar)
**Tiempo estimado: 2-3 dias**

### 1.1 Stripe en produccion
- [ ] Configurar env vars en Railway:
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - STRIPE_PRICE_POS_STARTER
  - STRIPE_PRICE_POS_PRO
  - STRIPE_PRICE_POS_VITALICIO
- [ ] Crear productos en Stripe Dashboard:
  - POS Starter: $499/mes
  - POS Pro: $999/mes
  - POS Vitalicio: $12,999 unico
- [ ] Probar flujo completo: checkout → webhook → licencia auto

### 1.2 YouTube API Key
- [ ] Crear proyecto en Google Cloud Console
- [ ] Habilitar YouTube Data API v3
- [ ] Generar API key
- [ ] Agregar YOUTUBE_API_KEY en Railway env vars

### 1.3 Fixes de Codex
- [ ] Esperar que termine auditoria
- [ ] Integrar sus fixes
- [ ] Verificar que nada se rompio
- [ ] Push final

---

## Fase 2: PILOTO EN BARES (primera semana)
**Tiempo estimado: 1 semana**

### 2.1 Preparar el pitch
- [ ] Presentacion visual (Canva o /presentacion-pos.html)
- [ ] Demo en vivo desde tu cel (APK o web)
- [ ] Lista de 5 bares target en Aguascalientes
- [ ] Precios claros:
  - Starter: $499/mes (mesas + ordenes + cobro basico)
  - Pro: $999/mes (todo + IA + reportes + karaoke)
  - Vitalicio: $12,999 (todo para siempre)

### 2.2 Onboarding del bar
- [ ] Dueno compra licencia via Stripe (o tu la generas desde admin)
- [ ] Login con Google → POS se configura automatico
- [ ] Dueno agrega empleados con email + rol
- [ ] Cada empleado entra con su Google
- [ ] Capacitacion rapida (15 min por rol)

### 2.3 Hardware minimo del bar
- Tablet o celular Android para meseros (APK)
- Laptop/tablet para caja (web browser)
- Pantalla para karaoke (cualquier smart TV con browser → /remote.html)
- Internet WiFi (obligatorio)

### 2.4 Lo que NO necesitan para el piloto
- ❌ Impresora de tickets (fase 3)
- ❌ Tap to Pay NFC (fase 3)
- ❌ Facturacion CFDI (fase 4)
- ❌ App en Play Store (fase 4)

---

## Fase 3: POST-PILOTO (segundo mes)
**Tiempo estimado: 2-4 semanas**

### 3.1 Impresion de tickets
- Investigar ESC/POS via Web Bluetooth API
- O usar impresora de red (API directa)
- Integrar boton "Imprimir cuenta" en POS

### 3.2 Tap to Pay NFC
- Stripe Terminal SDK en APK nativa
- Requiere Stripe cuenta verificada
- Solo funciona en Android con NFC

### 3.3 Feedback del piloto
- Recopilar quejas/sugerencias de los bares
- Priorizar fixes basado en uso real
- Iterar rapido (deploy diario si es necesario)

---

## Fase 4: ESCALAR (tercer mes+)
**Tiempo estimado: continuo**

### 4.1 Play Store
- Firmar APK con keystore
- Subir a Google Play Console
- Listing: screenshots, descripcion, categorias

### 4.2 Facturacion CFDI
- Elegir PAC: Facturapi (mas simple) o Finkok
- Integrar endpoint POST /pos/cfdi
- Validar RFC del cliente

### 4.3 Red Social (Estudio)
- Flow Battle (batallas de freestyle)
- Avatares/fotos de perfil
- Follows y likes en letras
- Catalogo de beats completo (Suno)

### 4.4 El Avispero como producto
- SaaS para empresas ($999-$12,999/mes)
- Dashboard visual
- Agentes por categoria

---

## Flujos de Trabajo por Usuario

### USUARIO GRATIS (cantante/rapero)
```
Abre byflowapp.up.railway.app
  → Login con Google (opcional)
  → Modo Karaoke (gratis)
    → Busca cancion en YouTube
    → Letra se carga automatico del LRCLIB
    → Canta con teleprompter
    → Voice Scroll sigue su ritmo
  → Modo Estudio (gratis)
    → Escribe letras sobre beats
    → Publica en ranking
    → Vota por otras letras
    → Crea perfil de creador
  → Modo IA (gratis con Grok)
    → Chat con GFlow
    → Genera letras
```

### DUENO DE BAR (licencia POS)
```
Compra licencia via Stripe
  → Recibe email con licencia automatica
  → Va a /pos.html
  → Login con Google
  → Se configura su bar automatico
  → Agrega empleados (nombre + email + rol + PIN)
  → Configura: nombre del bar, impuestos, propinas
  → Agrega categorias y productos al menu
  → Abre su primer turno

Dia a dia:
  → Ve mesas en tiempo real
  → Monitorea cocina/barra
  → Hace cortes de caja
  → Ve reportes
  → Usa El Avispero para decisiones
  → Karaoke en la pantalla grande (/remote.html)
```

### MESERO
```
Dueno lo agrega con email + rol "mesero"
  → Entra a /pos.html con su Google
  → Ve SOLO sus mesas
  → Toma ordenes
  → Manda a cocina/barra
  → No ve config, empleados, reportes, ni IA
```

### COCINERO
```
Dueno lo agrega con rol "cocinero"
  → Entra y ve SOLO Monitor Cocina
  → Ve ordenes pendientes con timer
  → Marca items como "preparando" o "listo"
  → No ve nada mas
```

### CAJERO
```
Dueno lo agrega con rol "cajero"
  → Ve cobrar, corte de caja, mesas
  → Procesa pagos
  → Abre/cierra turnos
  → No ve config ni empleados
```

---

## Checklist Pre-Piloto

### Obligatorio
- [x] POS funcional con ordenes reales
- [x] Login por Google para duenos y empleados
- [x] Roles con permisos correctos
- [x] Multi-tenant (cada bar aislado)
- [x] Karaoke funcional
- [x] APK disponible para descarga
- [ ] Stripe configurado y probado
- [ ] YouTube API key en Railway
- [ ] Auditoria de Codex integrada

### Recomendado
- [ ] 50 beats en catalogo Suno
- [ ] Tutorial/onboarding basico
- [ ] Demo ficticio (pos-demo-sim.html)
- [ ] Google Analytics activo

### Opcional (puede esperar)
- [ ] Impresion de tickets
- [ ] Tap to Pay NFC
- [ ] CFDI
- [ ] Flow Battle
- [ ] Play Store

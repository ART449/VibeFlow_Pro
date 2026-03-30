# Auditoria local de seguridad

Fecha: 2026-03-30
Equipo: C:\Users\art44
Modo: solo lectura, sin mover ni borrar archivos

## Resumen ejecutivo

La auditoria encontro exposicion real de credenciales y codigos de recuperacion en carpetas de uso diario, especialmente en `Downloads` y `Desktop`. Tambien hay varias zonas de screenshots con actividad reciente que merecen triage manual o una segunda pasada mas agresiva.

## Hallazgos criticos

1. Credenciales de Google OAuth en `Downloads`
   - `C:\Users\art44\Downloads\client_secret_500542723902-jq5oq4plncrr4bpduaca3u44smqsmun1.apps.googleusercontent.com.json`
   - `C:\Users\art44\Downloads\client_secret_2_500542723902-rdhlj67ae7nrghkl4n2tboaimu84qkbu.apps.googleusercontent.com.json`
   - Riesgo: secretos de cliente almacenados en una carpeta de alto ruido y alta exposicion accidental.

2. Service account JSON con llave privada en `Downloads`
   - `C:\Users\art44\Downloads\gen-lang-client-0278672371-955cb5c0494f.json`
   - Riesgo: el archivo contiene campos de service account, incluyendo `private_key`, `client_email` y `client_id`.

3. Codigos de recuperacion guardados en `Downloads`
   - `C:\Users\art44\Downloads\stripe_backup_code.txt`
   - `C:\Users\art44\Downloads\n8n-recovery-codes.txt`
   - `C:\Users\art44\Downloads\Backup-codes-elricondelgeekdearturo.txt`
   - Riesgo: acceso total o bypass parcial de MFA si alguien obtiene esos archivos.

4. Archivos `.env` en rutas activas e historicas
   - `C:\Users\art44\Desktop\byflow-prod\.env`
   - `C:\Users\art44\Desktop\verciones antiguas byflow\files\.env`
   - `C:\Users\art44\Desktop\verciones antiguas byflow\vibeflokaraoke\files\backend\.env`
   - Riesgo: credenciales, tokens, endpoints y configuracion sensible fuera de un vault.

5. Inventario de tokens en CSV
   - `C:\Users\art44\Desktop\verciones antiguas byflow\byfl\tokens.csv`
   - Riesgo: archivo tabular facil de abrir, copiar o reenviar por error.

## Hallazgos altos

1. Capturas de documentacion con credenciales visibles por nombre y OCR parcial
   - `C:\Users\art44\OneDrive\Documentos\GitHub\byflow\openclaw\docs\images\feishu-step3-credentials.png`
   - `C:\Users\art44\OneDrive\Documentos\GitHub\byflow\openclaw\docs\images\feishu-verification-token.png`
   - Riesgo: screenshots de configuracion con secretos visibles o casi visibles.

2. Zonas grandes de screenshots para revisar
   - `C:\Users\art44\Pictures\Screenshots` -> 185 archivos
   - `C:\Users\art44\OneDrive\galgo\Imágenes\Screenshots` -> 102 archivos
   - `C:\Users\art44\CrossDevice\Armor 26 Ultra\storage\Pictures\Screenshots` -> 17 archivos
   - Riesgo: fuga de dashboards, API consoles, chats con secretos o variables de entorno.

3. Directorios de almacenamiento privado o sensible en dispositivo sincronizado
   - `C:\Users\art44\CrossDevice\Armor 26 Ultra\storage\DCIM\GalleryVault`
   - `C:\Users\art44\CrossDevice\Armor 26 Ultra\storage\Movies\Secret Video Recorder`
   - Riesgo: material privado disperso fuera de un esquema claro de resguardo.

## Descargas: triage de organizacion

Top folders en `Downloads`:

- `C:\Users\art44\Downloads\Instaladores` -> 1018 items
- `C:\Users\art44\Downloads\NLA Y YO_files` -> 451 items
- `C:\Users\art44\Downloads\VibeFlow_Pro_ESTADO_PROYECTO.md at main · ART449_VibeFlow_Pro_files` -> 114 items
- `C:\Users\art44\Downloads\KIMI IN VS` -> 29 items
- `C:\Users\art44\Downloads\Fotos - Google Fotos_files` -> 16 items
- `C:\Users\art44\Downloads\creacion visual` -> 14 items
- `C:\Users\art44\Downloads\Musica` -> 11 items

Top-level files en `Downloads`:

- 10 `.txt`
- 10 `.pdf`
- 10 `.zip`
- 9 `.wav`
- 8 `.png`
- 6 `.mp4`
- 6 `.exe`
- 5 `.html`
- 5 `.json`

Ruido y duplicados obvios:

- instaladores repetidos de PostgreSQL
- varios ZIP y paquetes con sufijos `(1)` o `(2)`
- browser saves tipo `*_files`, `.descarga`, `.loaded_0`, `saved_resource.html`
- multiples audios y renders duplicados

## Acciones recomendadas

1. Rotar o revocar de inmediato cualquier secreto vivo encontrado en:
   - JSON de Google OAuth
   - service account JSON
   - `.env`
   - `tokens.csv`

2. Sacar codigos de recuperacion de `Downloads` hoy mismo y guardarlos en:
   - un password manager
   - un contenedor cifrado
   - o un medio offline controlado

3. Consolidar screenshots sensibles en una carpeta de cuarentena antes de seguir compartiendo o sincronizando.

4. Separar `Downloads` en cuatro grupos:
   - `Credenciales y seguridad`
   - `Instaladores`
   - `Exportes web`
   - `Medios/proyectos`

5. Revisar manualmente o con OCR adicional las capturas mas recientes de `Pictures\Screenshots`.

## Pendiente

No se copiaron ni movieron archivos fuera del workspace. Si quieres una segunda fase, puedo:

- crear una carpeta segura en `Downloads` para juntar screenshots sensibles
- preparar una carpeta de cuarentena para credenciales y recovery codes
- proponer una reorganizacion automatica de `Downloads` sin borrar nada

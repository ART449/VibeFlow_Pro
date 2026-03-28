# ByFlow — Doctrina Kaizen + 5S

> "El sistema parpadea, pero el código no miente" — ArT-AtR

## Ley escrita. No se negocia. Cada commit debe dejar el código mejor que como lo encontró.

---

## 🇯🇵 KAIZEN (改善) — Mejora Continua

**Principio:** Pequeñas mejoras constantes > un cambio grande.

Cada sesión de desarrollo DEBE incluir al menos UNA mejora que no fue pedida — un refactor, un fix de accesibilidad, una limpieza, una optimización. No importa qué tan pequeña sea. La acumulación de mejoras pequeñas crea productos invencibles.

### Reglas Kaizen para ByFlow:

1. **Nunca commitear codigo peor** — si tocas un archivo, déjalo mejor
2. **Cada PR debe incluir un "Kaizen bonus"** — algo extra que mejoró
3. **Medir para mejorar** — si no lo mides, no lo puedes mejorar
4. **Preguntar "¿por qué?" 5 veces** — llegar a la raíz del problema
5. **Eliminar desperdicio (muda)** — código muerto, features fantasma, abstracciones inútiles

---

## 5S Aplicado al Código

### 1S — SEIRI (整理) Clasificar / Sort
> "Si no sirve, elimínalo"

- [ ] Eliminar código muerto (funciones sin llamar)
- [ ] Eliminar features fantasma (botones que no hacen nada)
- [ ] Eliminar comentarios viejos y TODOs abandonados
- [ ] Eliminar dependencias no usadas del package.json
- [ ] Eliminar archivos huérfanos que nadie importa

**Frecuencia:** Cada sesión de desarrollo
**Herramienta:** `knip`, `depcheck`, grep por `TODO|FIXME|HACK`

### 2S — SEITON (整頓) Ordenar / Set in Order
> "Un lugar para cada cosa, cada cosa en su lugar"

- [ ] Estructura de archivos predecible:
  ```
  pos/           → Backend POS (auth, routes, db, sockets, security)
  public/        → Frontend (HTML, CSS, JS, assets)
  data/          → Datos persistentes (DB, JSON, backups)
  ```
- [ ] Nombres de archivo descriptivos (no `utils2.js` o `temp.js`)
- [ ] Imports agrupados: node core → npm packages → locales
- [ ] Funciones ordenadas: helpers arriba, handlers abajo, exports al final
- [ ] Constantes al inicio del archivo, no enterradas en funciones
- [ ] Single source of truth: cada dato definido en UN solo lugar

**Frecuencia:** Al crear archivos nuevos
**Regla:** Si necesitas buscar más de 30 segundos, está mal organizado

### 3S — SEISO (清掃) Limpiar / Shine
> "Código limpio = código seguro"

- [ ] Sin `console.log` de debug en producción (solo logs de startup)
- [ ] Sin contraseñas, tokens o secretos hardcodeados
- [ ] Sin código comentado ("por si acaso" = basura)
- [ ] Respuestas de error consistentes: `{ ok: false, error: 'mensaje' }`
- [ ] Sin variables con nombres de 1 letra (excepto loops)
- [ ] Sin funciones de más de 50 líneas
- [ ] Sin archivos de más de 500 líneas (separar en módulos)

**Frecuencia:** Antes de cada commit
**Herramienta:** ESLint, revisión visual

### 4S — SEIKETSU (清潔) Estandarizar / Standardize
> "Lo que no se estandariza, se deteriora"

- [ ] Todas las rutas API siguen el patrón: validar → autenticar → ejecutar → responder
- [ ] Todas las funciones de DB usan transacciones para operaciones multi-tabla
- [ ] Todos los inputs se validan con whitelist (no blacklist)
- [ ] Todos los endpoints POST/PUT usan `posJson` middleware
- [ ] Todos los valores del usuario se escapan con `escapeHtml()` antes de innerHTML
- [ ] Todos los archivos HTML tienen `lang="es"` y meta tags básicos
- [ ] Naming convention: camelCase para JS, kebab-case para archivos, UPPER_CASE para constantes

**Frecuencia:** Al diseñar nuevos módulos
**Herramienta:** Templates de código, code review

### 5S — SHITSUKE (躾) Disciplina / Sustain
> "La disciplina convierte la mejora en hábito"

- [ ] Pre-commit hooks que validan:
  - No secretos en el código
  - No console.log de debug
  - Lint pasando
  - Tests pasando
- [ ] Auditoría automática semanal (La Colmena)
- [ ] Cada sesión empieza leyendo ESTADO_PROYECTO.md
- [ ] Cada sesión termina actualizando NotebookLM
- [ ] Code review obligatorio (agentes auditores) antes de push a producción
- [ ] Retrospectiva mensual: ¿qué mejoró? ¿qué empeoró? ¿qué sigue?

**Frecuencia:** Siempre. Es la regla que sostiene las otras 4.
**Herramienta:** Hooks de git, CI/CD, cultura

---

## Checklist Pre-Commit (obligatorio)

Antes de cada `git commit`, verificar:

```
[ ] ¿Dejé el código mejor que como lo encontré? (Kaizen)
[ ] ¿Eliminé algo que no servía? (1S Seiri)
[ ] ¿Cada archivo está en su lugar? (2S Seiton)
[ ] ¿No hay basura (logs, comentarios, stubs)? (3S Seiso)
[ ] ¿Seguí los patrones existentes? (4S Seiketsu)
[ ] ¿Corrí los tests/auditorías? (5S Shitsuke)
```

---

## Métricas Kaizen

| Métrica | Meta | Cómo medir |
|---------|------|------------|
| Issues de seguridad | 0 CRITICOS | Auditoría de agentes |
| Código muerto | 0 funciones sin usar | knip/grep |
| Console.logs de debug | 0 en producción | grep console.log |
| Tiempo de respuesta API | < 100ms | Monitoring |
| Cobertura de tests | > 80% | Jest/Mocha |
| Archivos > 500 líneas | 0 (excepto index.html legacy) | wc -l |
| TODO/FIXME en código | 0 abandonados | grep TODO |

---

## Filosofía IArtLabs

> Kaizen no es un proyecto. Es una forma de vida.
> Cada línea de código que escribimos refleja nuestro estándar.
> Si no estamos mejorando, estamos retrocediendo.
> La Colmena no descansa. El código no miente.

**— Arturo Torres (ArT-AtR) & Guillermo Claudio RenterIA**
**IArtLabs, 2026**

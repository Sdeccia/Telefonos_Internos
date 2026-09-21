# Informe técnico y analítico — Sistema de Internos Telefónicos

**Fecha:** 21/09/2026
**Estado del relevamiento:** versión de datos 215 — 87 internos, 16 sectores
**Alcance:** descripción técnica y funcional del sistema

---

## 1. Resumen ejecutivo

El sistema es una aplicación web para consultar, clasificar y editar el directorio de internos telefónicos del hospital, con agrupación por sector y exportación a pantalla, CSV, HTML de impresión y PDF.

Está construido en **Node.js puro, sin una sola dependencia externa**: no hay `package.json`, no hay `node_modules`, no hay framework. El único requisito es tener Node instalado. Los datos viven en un único archivo JSON dentro del proyecto, lo que hace que respaldar y restaurar sea copiar un archivo.

| Dato | Valor |
| --- | --- |
| Lenguaje | JavaScript (Node.js ≥ 18; probado en v24.14.0) |
| Dependencias externas | **Ninguna** |
| Backend | `server.mjs` — 802 líneas, API REST propia sobre `node:http` |
| Frontend | `public/` — HTML + CSS + JS sin build, 1.682 líneas |
| Almacenamiento | `data/telefonos.json` (34 KB) |
| Base de datos | No usa. Store en memoria + escritura atómica a JSON |
| Autenticación | No tiene (red interna) |
| Acceso | `http://<ip-del-servidor>:5173` desde cualquier PC de la red |

---

## 2. De dónde salen los datos

### 2.1 Origen

`extensions.csv` (20 KB) es un **export de FreePBX/Asterisk** con 31 columnas: nombre visible, extensión, DID directo, CID de salida, Call Waiting, secreto SIP, configuración de voicemail, contexto, tecnología, permisos y política de grabación. Contiene **87 internos** (rangos 100–199, con huecos).

De esas 31 columnas, el sistema **usa tres**:

| Columna del CSV | Campo en el sistema | Uso |
| --- | --- | --- |
| `Display Name` | `nombre` | Identificación del interno |
| `User Extension` | `interno` | Número de extensión |
| `Call Waiting` | `estado` | Referencia inicial del estado |

### 2.2 Proceso de carga (`tools/seed.mjs`)

1. **Parseo CSV propio** (`parsearCSV`): implementación manual de comillas dobles y comas internas, sin librería. Necesario porque los nombres del CSV contienen caracteres especiales.
2. **Normalización**: se recortan espacios, se colapsan espacios múltiples, se descartan filas sin extensión o sin nombre.
3. **Control de duplicados**: si una extensión aparece dos veces, se conserva la primera y se emite un aviso por consola.
4. **Clasificación automática**: se asigna un sector según reglas de nombre (sección 3).
5. **Generación del catálogo**: la lista de sectores se deriva de los sectores realmente asignados.

### 2.3 El campo "estado"

El estado (`activo` / `inactivo`) es informativo y se administra desde el dashboard. El CSV trae `Call Waiting = DISABLED` en 7 internos, pero **ese campo de Asterisk controla el aviso de llamada en espera, no indica si la extensión está de alta**, así que no determina el estado en el sistema. Todos los internos quedaron cargados como activos.

El estado se muestra como etiqueta en la lista, permite filtrar, y en el papel los inactivos salen atenuados y tachados.

---

## 3. Cómo se asigna el sector

### 3.1 Reglas por nombre (`tools/sectores.mjs`)

Módulo puro, sin efectos secundarios, de 56 líneas. Contiene **34 reglas** que se evalúan **en orden**: gana la primera coincidencia. Cada regla es una expresión regular aplicada al nombre normalizado (sin acentos, en minúsculas).

```
[/^consultorio/,              'Consultorios']
[/^laboratorio/,              'Laboratorio']
[/^farmacia/,                 'Farmacia']
[/^(urgencias|reanima)/,      'Urgencias']
... 34 reglas en total
```

Si ninguna coincide, el interno queda en `Sin asignar`.

Las reglas se evalúan secuencialmente, así que las más específicas van antes que las genéricas: `Hogar de Ancianos` se evalúa antes que `Farmacia` para que "Farmacia - consultas externas" del Hogar no caiga en Farmacia.

### 3.2 Alcance del mecanismo

Las reglas son un **punto de partida automático**, no la estructura definitiva del hospital. Por eso el sistema trata `sector` como **texto libre por interno** y mantiene el catálogo de sectores como una entidad separada y editable: la estructura real se construye y ajusta desde el panel, y nunca se deriva de las reglas al vuelo.

### 3.3 Reclasificación masiva

Un botón del panel reaplica las reglas a todos los internos. Como esa operación **pisa las asignaciones hechas a mano**, la interfaz pide dos confirmaciones y el servidor exige `confirmar: true`; sin ese flag responde:

> `Reclasificar todo por nombre pisa las asignaciones hechas a mano. Manda confirmar: true para hacerlo igual.`

La variante que no reclasifica todo solo toca los internos que están en `Sin asignar`.

---

## 4. Arquitectura

```
┌────────────────────────────────────────────────────────────────┐
│  Navegador (PC de la red)                                      │
│  index.html + styles.css + app.js  (vanilla, sin build)        │
└───────────────┬────────────────────────────────────────────────┘
                │  HTTP · fetch · JSON
                ▼
┌────────────────────────────────────────────────────────────────┐
│  server.mjs  (node:http, puerto 5173, 0.0.0.0)                 │
│                                                                │
│  · Enrutador propio por pathname + método                      │
│  · Validación y normalización de entrada                       │
│  · Store en memoria + cola de escritura serializada            │
│  · Escritura atómica (tmp + rename)                            │
│  · Respaldo automático antes de cada cambio                    │
│  · Render del HTML de impresión (server-side)                  │
│  · Generación de PDF lanzando Chrome/Edge headless             │
└───────────────┬─────────────────────────┬──────────────────────┘
                │                         │
                ▼                         ▼
     data/telefonos.json         tools/sectores.mjs (reglas)
     data/respaldos/*.json       tools/imprimir.mjs (render)
                ▲
                │
     extensions.csv (origen, no se modifica)
```

### 4.1 Decisiones de diseño

| Decisión | Motivo |
| --- | --- |
| Sin dependencias | Instalación cero y sin riesgo de supply chain. Se copia la carpeta y funciona. |
| JSON en lugar de base de datos | El volumen (87 registros) no justifica un motor. Un archivo es respaldo y restauración trivial. |
| Sin framework de frontend | La interfaz es una pantalla con búsqueda, filtros, tabla y modales. Un build step agregaría complejidad sin beneficio. |
| HTML de impresión renderizado en el servidor | Garantiza que el motor de impresión reciba el contenido completo en la primera respuesta, sin depender de la ejecución de JavaScript. |
| Store en memoria con caché | Evita leer y parsear el archivo en cada consulta. |

---

## 5. Modelo de datos

### 5.1 Estructura del archivo

```json
{
  "version": 215,
  "actualizado": "2026-09-21T18:08:00.000Z",
  "sectores": ["ASISTENCIALES", "CONSULTORIOS", "..."],
  "colores": { "URGENCIAS": "#c2410c" },
  "extensiones": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "interno": "149",
      "nombre": "Informática - Sergio",
      "sector": "INFORMATICA",
      "estado": "activo",
      "notas": ""
    }
  ]
}
```

| Campo | Tipo | Descripción |
| --- | --- | --- |
| `version` | entero | Se incrementa en **cada** escritura. Marca el estado global del archivo. |
| `actualizado` | ISO 8601 | Marca temporal del último cambio. |
| `sectores` | array de texto | **Catálogo ordenado.** El índice del array *es* el orden de presentación. |
| `colores` | objeto | Color fijo por sector en hexadecimal. Si falta, se deriva del nombre. |
| `extensiones` | array | Los internos. |
| `id` | UUID v4 | Clave interna estable. El `interno` es el número visible. |

### 5.2 Por qué el sector es texto libre

`sector` en cada interno es un **string**, no una clave foránea. Ventajas: renombrar un sector es actualizar N strings, borrar un sector vacío no rompe nada, e importar datos externos no requiere resolver referencias. El catálogo de sectores se mantiene aparte y los conteos se derivan de los internos.

### 5.3 Consistencia

- **Escrituras serializadas**: una cola de promesas encadena las mutaciones; no hay dos escrituras simultáneas.
- **Escritura atómica**: se escribe `telefonos.json.tmp` y luego `rename()` sobre el original. Una interrupción a mitad no deja el archivo corrupto.
- **Store en memoria**: las lecturas no tocan el disco.
- `version` viaja en las respuestas; a esta escala, dos ediciones del mismo interno se resuelven por orden de llegada.

---

## 6. API REST

Enrutador propio en `manejarAPI()`. Todas las rutas bajo `/api/`.

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/estado` | Totales: internos, activos, inactivos, sin sector, catálogo con conteos. |
| GET | `/api/extensiones` | Lista con filtros `q`, `sector`, `estado` y orden `orden`. |
| POST | `/api/extensiones` | Crea un interno. Valida número, unicidad y nombre. |
| PUT | `/api/extensiones/:id` | Edita (merge parcial sobre el registro existente). |
| DELETE | `/api/extensiones/:id` | Elimina. |
| POST | `/api/extensiones/importar` | Carga masiva: `modo: fusionar` o `reemplazar`. Clasifica el sector si no viene. |
| POST | `/api/organizar` | Reaplica reglas de nombre. Requiere `confirmar: true` si es masivo. |
| GET | `/api/sectores` | Catálogo con conteos, orden, color y flag `protegido`. |
| POST | `/api/sectores` | Crea sector. Rechaza duplicados sin distinguir mayúsculas ni acentos. |
| POST | `/api/sectores/reordenar` | Guarda el orden. Valida que la lista sea completa y consistente. |
| POST | `/api/sectores/:nombre/color` | Fija color en hexadecimal. `null` vuelve al derivado. |
| GET | `/api/sectores/:nombre` | Detalle de un sector y sus internos. |
| PUT | `/api/sectores/:nombre` | Renombra. Si el destino existe, fusiona. |
| DELETE | `/api/sectores/:nombre` | Elimina. Los internos van a `Sin asignar` salvo destino explícito. |
| GET | `/api/export.csv` | CSV con BOM UTF-8, respetando filtros. |
| GET | `/imprimir` | HTML del directorio para papel, renderizado en el servidor. |
| GET | `/api/imprimir.pdf` | PDF generado con Chrome/Edge headless, respetando filtros. |

### 6.1 Validaciones

```js
// Número: solo dígitos, 1 a 6
if (!/^\d{1,6}$/.test(interno)) → "El interno debe ser un numero de 1 a 6 digitos."

// Unicidad
if (repetido) → 'El interno 100 ya esta asignado a "Central Tel".'

// Estado acotado
ESTADOS = new Set(['activo', 'inactivo'])

// Color
if (!/^#[0-9a-fA-F]{6}$/.test(color)) → "El color debe estar en formato hexadecimal..."

// Cuerpo de la petición acotado a 2 MB
leerCuerpo(req, limite = 2 * 1024 * 1024)
```

### 6.2 El sector "Sin asignar"

Es el destino por defecto al eliminar un sector, de modo que **ningún interno se pierda**. Está marcado como `protegido`: no se puede renombrar ni eliminar. Si nadie lo usa, no aparece en el catálogo: el servidor lo crea solo cuando hace falta.

---

## 7. Interfaz de usuario

### 7.1 Estructura

| Archivo | Líneas | Contenido |
| --- | --- | --- |
| `public/index.html` | 180 | Marcado: barra, tarjetas, filtros, vistas, dos modales. |
| `public/styles.css` | 567 | Estilos, incluyendo reglas `@media print`. |
| `public/app.js` | 935 | Lógica: fetch, render, eventos, arrastre, modales. |

Sin bundler ni transpilador: el navegador carga `app.js` como módulo ES.

### 7.2 Vistas

- **Vista por sector**: tarjetas por sector, con color, total y los primeros 5 internos. Si hay más, botón "Ver los N restantes".
- **Lista completa**: tabla con interno, nombre, sector, estado y notas. Cabecera fija al hacer scroll.
- **Búsqueda**: por número, nombre, sector o nota. **Ignora mayúsculas y acentos** (normalización NFD). Resalta las coincidencias uniendo rangos superpuestos. Atajo: `/` enfoca el buscador.
- **Filtros**: sector, estado, y orden por número, nombre o sector. Los enlaces de exportación se recalculan con los filtros activos.

### 7.3 Arrastre para reordenar

Implementado con **eventos de puntero** (`mousedown`/`mousemove`/`mouseup`). Es la técnica que funciona por igual con mouse, dedo o lápiz en pantallas táctiles. Umbral de 6 px para no disparar el arrastre con un clic. Incluye indicador visual del destino e interfaz por teclado (`Alt` + flechas).

### 7.4 Usabilidad

- Escape cierra modales; `/` enfoca el buscador; Enter activa la fila enfocada.
- Avisos flotantes confirman cada operación e indicador `Guardado hh:mm:ss` da feedback de persistencia.

---

## 8. Impresión y PDF

### 8.1 Mecanismo

El PDF **no** se genera con una librería. Se lanza Chrome o Edge en modo headless con `--print-to-pdf`, apuntando a la ruta `/imprimir`, que devuelve el HTML **ya renderizado por el servidor**.

```
GET /api/imprimir.pdf?q=química
   │
   ├─ 1. El servidor arma el HTML con los datos filtrados (tools/imprimir.mjs)
   ├─ 2. Lanza:  chrome --headless=new --print-to-pdf=<tmp> http://127.0.0.1:5173/imprimir?...
   ├─ 3. Sondea el archivo hasta que deja de crecer
   ├─ 4. Lo devuelve como application/pdf
   └─ 5. Borra el temporal (finally)
```

**Detección del navegador:** se busca Chrome o Edge en las rutas habituales de Windows, Linux y macOS. Si no hay ninguno, responde 503 con un mensaje que sugiere usar el botón "Imprimir".

**El proceso se lanza sin captura de salida** (`stdio: 'ignore'`): la prueba de éxito es que el archivo aparezca.

**El PDF se genera en el servidor**, así que cualquier PC de la red puede descargarlo sin tener Chrome instalado.

### 8.2 Diseño para papel

- A4, márgenes 14 mm × 12 mm.
- **Un bloque por sector no se parte entre hojas** (`break-inside: avoid`).
- Encabezados de tabla repetidos en cada página (`display: table-header-group`).
- Números en tipografía monoespaciada; internos inactivos atenuados y tachados.
- La columna Notas **solo aparece si algún interno tiene notas**.
- Colores de pantalla aplanados; botones ocultos.

### 8.3 Exportación CSV

Respeta los filtros y el orden activos, e incluye BOM UTF-8 para que Excel abra los acentos correctamente.

---

## 9. Gestión de sectores

| Operación | Comportamiento |
| --- | --- |
| Crear | Rechaza duplicados comparando sin mayúsculas ni acentos. |
| Renombrar | Actualiza todos los internos y traslada el color fijo. |
| Fusionar | Renombrar a un nombre existente une los dos sectores. |
| Reordenar | Flechas o arrastre. El orden se persiste y aplica en todas las vistas. |
| Ordenar A-Z | Ordena con criterio español (ignora acentos); `Sin asignar` va al final. |
| Color | Paleta de 12 + selector libre; o volver al color derivado del nombre. |
| Eliminar | Pregunta el destino. Por defecto `Sin asignar`; mover a otro sector es elección explícita. |

**Migración automática:** al cargar, si el archivo no tiene el campo `sectores` (formato antiguo), el catálogo se reconstruye con los sectores que usan los internos.

---

## 10. Respaldos

Dos capas:

**Automática.** Antes de **cada** escritura, el servidor guarda una copia en `data/respaldos/auto-<fecha>.json`. Limitada a una cada **10 minutos** y con las últimas **60** conservadas. Un fallo al respaldar no impide guardar el cambio.

**Manual.** `respaldar.cmd` (doble clic) o `node tools/respaldar.mjs`. Nombra con fecha y hora exactas y conserva los últimos **30**. `--listar` muestra los existentes.

### Restauración

```powershell
# Servidor detenido
Copy-Item data\respaldos\telefonos-2026-09-21_150836.json data\telefonos.json -Force
```

---

## 11. Verificación automática

`tools/verificar-ui.mjs` — **632 líneas**, 32 verificaciones. Controla Chrome por **CDP** (Chrome DevTools Protocol) sobre WebSocket nativo, sin Puppeteer.

### 11.1 Cobertura

Carga de página, datos, búsqueda sin acentos, filtros, vista por sector, "Ver más", lista completa, modal de internos, panel de sectores (crear, duplicado, renombrar, eliminar moviendo internos), reordenar con flechas, arrastrar filas, ordenar A-Z, asignar color con persistencia tras recargar, enlaces de exportación con filtro, render de impresión y PDF verificado por tamaño según filtro.

### 11.2 Aislamiento

La suite **no toca los datos reales**: copia `server.mjs`, `public/` y `tools/` a una carpeta temporal, arranca un segundo servidor en el puerto 5198 con su propio `data/telefonos.json`, prueba contra esa copia y la borra al terminar. Verificado por hash: el archivo real queda idéntico.

### 11.3 Aserciones relativas

Las verificaciones no fijan valores de los datos: consultan la API para calcular los esperados (total de internos, cantidad de sectores, un sector con más de 5 internos, un nombre con acentos). Así la suite sigue siendo válida cuando se reorganizan los sectores.

---

## 12. Operación y despliegue

### 12.1 Instalación

1. Copiar la carpeta al equipo servidor.
2. Tener Node.js instalado.
3. Doble clic en `iniciar.cmd`.

Arranca el servidor, muestra las direcciones y abre el navegador. Si el puerto 5173 está ocupado, prueba el siguiente automáticamente (hasta 10 intentos).

### 12.2 Red

Escucha en `0.0.0.0:5173`. Los clientes entran por la IP del servidor, por ejemplo `http://10.10.20.141:5173`. Al arrancar, el banner lista las IPs locales.

### 12.3 Variables de entorno

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PORT` | 5173 | Puerto inicial. |
| `HOST` | 0.0.0.0 | Interfaz de escucha. |
| `DIR_DATOS` | `./data` | Directorio de datos. |

### 12.4 Herramientas

| Script | Función |
| --- | --- |
| `tools/seed.mjs` | Regenera la base desde el CSV. |
| `tools/sectores.mjs` | Las 34 reglas de clasificación. |
| `tools/imprimir.mjs` | Render del HTML de impresión. |
| `tools/respaldar.mjs` | Respaldo manual con rotación. |
| `tools/ubicar-internos.mjs` | Ubicación explícita número → sector, con simulacro previo. |
| `tools/diagnosticar-sectores.mjs` | Informa la distribución actual de sectores. |
| `tools/verificar-ui.mjs` | Suite de 32 verificaciones, aislada. |
| `tools/capturar-panel.mjs` | Capturas del panel, aisladas. |

---

## 13. Seguridad

### 13.1 Modelo

El sistema **no tiene autenticación ni autorización**: está pensado para una red interna, con edición abierta a quien tenga acceso.

### 13.2 Superficie de riesgo

| Aspecto | Estado |
| --- | --- |
| **Path traversal** | Mitigado: el servidor estático resuelve la ruta y verifica que quede dentro de `public/`. |
| **XSS** | Mitigado: todo dato se escapa antes de insertarse en el DOM (`escapar()`); la búsqueda escapa antes de resaltar. |
| **Inyección** | No aplica: no hay SQL. |
| **Tamaño de petición** | Acotado a 2 MB. |
| **Secretos SIP** | **Los secretos del CSV no entran al sistema**: el seed usa solo nombre, extensión y estado. |
| **Exposición del archivo de datos** | `data/` no está bajo `public/`; no se sirve por HTTP. |

### 13.3 Recomendaciones

1. **Autenticación** si el sistema trasciende la red interna: un login simple con sesión bastaría.
2. **Registro de cambios por registro** (quién editó qué y cuándo).
3. **Copia externa** de `data/respaldos`, que hoy vive en el mismo disco que el original.
4. **Servicio de Windows** en lugar de una consola abierta, para operación desatendida.

---

## 14. Limitaciones conocidas

1. **Sin autenticación** — edición abierta a quien tenga acceso a la red.
2. **Sin historial por registro** — el respaldo automático da granularidad de 10 minutos, no de operación.
3. **Generación de PDF dependiente de Chrome o Edge** en el servidor; sin ellos queda el botón "Imprimir".
4. **Sin paginación** — con 87 registros es irrelevante; a partir de varios cientos convendría.
5. **Las reglas de clasificación son un punto de partida**, no la estructura oficial (sección 3.2).
6. **Sin tests unitarios** — la verificación es de interfaz, de punta a punta.
7. **`Sin asignar` reaparece** cada vez que se elimina un sector, porque es el destino seguro.

---

## 15. Conclusiones

**Fortalezas**

- **Dependencias cero**: sin instalación, sin actualizaciones de terceros, sin vulnerabilidades heredadas.
- **Portabilidad total**: la carpeta es el sistema; los datos son un archivo.
- **Simplicidad operativa**: doble clic para arrancar, doble clic para respaldar.
- **Respaldo en dos capas**, incluida una automática previa a cada escritura.
- **Verificación automatizada** que controla un navegador real y no toca los datos en uso.
- **Exportación resuelta** a pantalla, CSV, papel y PDF, respetando los filtros.
- **Integridad de datos**: escritura atómica, secretos SIP fuera del sistema, escapado de HTML.

**Debilidades**

- Sin autenticación ni historial de cambios por registro.
- La clasificación automática por nombre no refleja por sí sola la estructura del hospital.

**Recomendación principal**

El sistema es adecuado para su propósito: un directorio de 87 internos consultado y mantenido por un equipo pequeño en red interna. La prioridad, si crece, es **autenticar la edición y registrar quién cambia qué**. Lo demás —paginación, base de datos, framework— no se justifica al volumen actual.

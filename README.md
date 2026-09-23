# SIGA — Hospital de Flores

Sistema Integrado de Guardias y Agenda para consultar el directorio interno,
organizar guardias y administrar agendas telefónicas del Hospital de Flores.

> El export original de FreePBX (`extensions.csv`) fue retirado del repositorio
> porque contenia secretos SIP. Los archivos de datos y respaldos tambien quedan
> excluidos de Git por contener informacion interna.

## Como se usa

**Doble clic en `iniciar.cmd`.** Se abre el navegador solo.

Tambien por consola:

```powershell
node server.mjs        # arranca en http://localhost:5173
```

La direccion de red se imprime al arrancar, por ejemplo `http://10.10.20.141:5173`,
y esa es la que se comparte con el resto del hospital. Mientras el servidor este
corriendo, todos los que entren ven y editan **los mismos datos**.

> La ventana de consola debe quedar abierta. Al cerrarla, el sistema se apaga.

## Que se puede hacer

- **Vista por sector**: tarjetas agrupadas por sector, con el color y el total de cada uno.
- **Funcionarios**: agenda privada del personal hospitalario; telefonistas y administradores pueden cargar nombre, C.I., rol, celulares y disponibilidad.
- **Guardias**: la gestión privada arma turnos usando Funcionarios; el **Visor de guardias** permite consultar el teléfono de guardia del día sin contraseña.
  Los sectores con mas de 5 internos muestran "Ver los N restantes".
- **Lista completa**: tabla con interno, nombre, sector, estado y notas.
- **Buscar**: por numero, nombre, sector o nota. Ignora mayusculas y acentos, asi que
  `quirurgico` encuentra "Block Quirurgico" y `quimica` encuentra "Farmacia - Quimica".
  Las coincidencias se resaltan. Atajo: la tecla `/` lleva el foco al buscador.
- **Filtrar**: por sector y por estado (activo / inactivo), y ordenar por numero,
  nombre o sector.
- **Crear** con el boton `+ Nuevo interno`.
- **Editar**: clic en cualquier fila o en `Editar`. Tambien se puede eliminar.
- **Gestionar sectores** con el boton `Sectores`: crear, renombrar, fusionar y eliminar
  (ver abajo).
- **Organizar sectores**: vuelve a clasificar automaticamente los internos que esten
  en "Sin asignar".
- **Exportar CSV**: descarga lo que se este viendo en ese momento, respetando los
  filtros y el orden.
- **Imprimir / PDF**: ver abajo.

## Imprimir y PDF

Hay dos botones en la barra superior:

| Boton | Que hace |
| --- | --- |
| **Imprimir** | Abre el directorio listo para papel en otra pestana, agrupado por sector. Desde ahi se imprime o se guarda como PDF con el dialogo del navegador. |
| **Descargar PDF** | Baja el archivo `.pdf` directamente, sin abrir nada. |

Los dos **respetan los filtros y el buscador**: si estas viendo un sector o una
busqueda, el papel sale con eso. La vista de impresion esta pensada para papel A4:
numeros en monoespaciada, un bloque por sector que no se corta entre hojas, los
internos inactivos marcados, y salen ocultos los botones y los colores de pantalla.

El PDF lo arma **el propio Chrome o Edge** con su motor de impresion, asi que no
hace falta instalar nada. Si en la PC no hay Chrome ni Edge, el boton `Descargar PDF`
avisa y queda el de **Imprimir** como alternativa.

Los botones se pueden usar desde cualquier PC de la red: el PDF se genera en el
servidor, no en el navegador de quien lo pide.

Los cambios se guardan al instante en el servidor. El indicador `Guardado hh:mm:ss`
de la barra superior confirma cada grabacion.

## De donde sale el estado "inactivo"

Al generar la base, los internos que en el CSV de FreePBX tienen
`Call Waiting = DISABLED` quedan marcados como **inactivos** (son 7: 178, 179, 180,
182, 190, 198 y 199). El estado es solo informativo y se puede cambiar a mano.

## Sectores

Al importar, los internos se clasifican por el nombre usando las reglas de
`tools/sectores.mjs` (34 reglas: Urgencias, Consultorios, Farmacia, Contaduria,
Imagenologia, etc.). Se aplican **en orden** y gana la primera que coincide.

Los 87 internos del CSV quedaron repartidos en 33 sectores, ninguno sin asignar.

Los sectores son una lista propia del sistema (viven en `sectores` dentro de
`data/telefonos.json`), y se administran desde el boton **Sectores**:

| Accion | Como funciona |
| --- | --- |
| **Crear** | Escribi el nombre y `Agregar`. No se permiten duplicados (compara sin distinguir mayusculas ni acentos). |
| **Reordenar** | Arrastra las filas por el asa `⋮⋮` (tambien funciona con el dedo, en pantalla tactil), o usa las flechas `▲` `▼` para mover un lugar. Con `Ordenar A-Z` se ordenan todos de una vez; "Sin asignar" queda siempre al final. El orden se guarda y se usa en todas las vistas. |
| **Color** | El recuadro de la columna Color abre una paleta de 12 colores; el selector de la derecha permite elegir cualquier otro, y `Color automatico` vuelve al color derivado del nombre. El color se aplica en el panel, en las tarjetas y en la columna Sector de la lista. |
| **Renombrar** | `Renombrar` en la fila. Todos los internos de ese sector pasan al nombre nuevo, y el color fijo viaja con el sector. |
| **Fusionar** | Si al renombrar escribis el nombre de otro sector que ya existe, los dos se unen y los internos se juntan. |
| **Eliminar** | `Eliminar` en la fila. Si el sector tiene internos, el sistema pregunta si **moverlos** a otro sector o **borrarlos** junto con el sector. La opcion de borrar pide una confirmacion aparte. |
| **Sector vacio** | Se puede crear y eliminar sin internos. Un sector con 0 internos sigue en la lista hasta que lo elimines. |

Respetando los nombres, se pueden escribir con acentos, espacios y barras
(por ejemplo `Cardiología / Pruebas`).

El orden y los colores son opcionales: si no los tocas, los sectores salen en el orden
en que se crearon y con un color derivado del nombre.

**Sector "Sin asignar"**: es el destino por defecto cuando eliminas un sector y elegis
mover sus internos. Aparece marcado como `protegido` y no se puede renombrar ni
eliminar, para que ese destino nunca falte.

Si un interno nuevo no coincide con ninguna regla, queda en "Sin asignar" hasta que
se le asigne un sector a mano o se agregue una regla.

## Respaldos

Los datos viven en un solo archivo, asi que hay dos redes de seguridad:

**1. Automatica.** El servidor guarda una copia en `data/respaldos/` **antes de cada cambio**, como maximo una cada 10 minutos, y conserva las ultimas 60. Son los archivos `auto-...`. No hay que hacer nada: si algo sale mal, ahi esta la version previa.

**2. Manual.** Cuando quieras marcar un estado como bueno, doble clic en `respaldar.cmd` (o `node tools/respaldar.mjs`). Crea `data/respaldos/telefonos-<fecha>_<hora>.json` y conserva los ultimos 30.

Para ver que respaldos hay:

```powershell
node tools/respaldar.mjs --listar
```

Para restaurar uno: copialo sobre `data/telefonos.json` con el servidor detenido, y volve a arrancar.

```powershell
Copy-Item data\respaldos\telefonos-2026-09-21_150836.json data\telefonos.json -Force
```

## Regenerar la base desde un export de FreePBX

**Ojo: esto sobrescribe todos los cambios hechos en el sistema.**

```powershell
node tools/seed.mjs
```

El script espera un `extensions.csv` local. Ese archivo no se versiona: debe
obtenerse de forma segura desde FreePBX y colocarse temporalmente en la raiz del
proyecto.

Conviene guardar una copia de `data/telefonos.json` antes de hacerlo.

## Verificacion automatica

```powershell
node tools/verificar-ui.mjs
```

Levanta Chrome headless, recorre la interfaz (vista por sector, busqueda con acentos,
filtros, lista completa, modal de internos, panel de sectores: crear, duplicado,
renombrar, eliminar moviendo internos, reordenar con flechas, arrastrar filas, ordenar
A-Z, asignar color, y la impresion/PDF) y deja capturas en `captura-sectores.png`,
`captura-lista.png`, `captura-modal.png` y `captura-sectores-panel.png`.

**No toca tus datos**: levanta una copia del servidor en el puerto 5198 con su propio
archivo de datos y prueba contra esa copia, que se borra al terminar. Se puede correr
las veces que haga falta. (Si algun dia queres probar contra el servidor real, pasale
la direccion: `node tools/verificar-ui.mjs http://localhost:5173` — y en ese caso la
corrida si modifica los datos.)

Con `node tools/seed.mjs` volves a generar la base desde el CSV, pero **eso borra tus
cambios**: el orden, los colores, los sectores que hayas creado y los movimientos de
internos. Guarda una copia de `data/telefonos.json` antes.

## Archivos

| Ruta | Que es |
| --- | --- |
| `INFORME.md` | Informe tecnico y analitico del sistema (como esta hecho y como se opera). |
| `extensions.csv` | Export local de FreePBX. No se versiona porque puede contener secretos SIP. |
| `data/telefonos.json` | **Base editable**: catalogo de sectores (con orden y colores) + internos. Los cambios viven aca. |
| `server.mjs` | Servidor y API REST (Node puro, sin dependencias). |
| `public/` | Interfaz: `index.html`, `styles.css`, `app.js`. |
| `tools/seed.mjs` | Genera `data/telefonos.json` desde `extensions.csv`. |
| `tools/sectores.mjs` | Reglas de clasificacion por sector. |
| `tools/imprimir.mjs` | Arma el HTML del directorio para imprimir/PDF. |
| `tools/probar-renombre.mjs` | Prueba el renombrado de sectores sobre una copia aislada. |
| `tools/verificar-ui.mjs` | Verificacion automatica de la interfaz con Chrome (no toca tus datos). |
| `tools/capturar-panel.mjs` | Regenera la captura del panel de sectores (tampoco los toca). |
| `tools/respaldar.mjs` | Respaldo manual con fecha y hora. |
| `data/respaldos/` | Respaldos automaticos (`auto-...`) y manuales. |
| `respaldar.cmd` | Doble clic para hacer un respaldo. |
| `iniciar.cmd` | Lanzador: arranca el servidor y abre el navegador. |

## API

| Metodo | Ruta | Para que |
| --- | --- | --- |
| GET | `/api/estado` | Totales por estado y por sector. |
| GET | `/api/extensiones?q=&sector=&estado=&orden=` | Lista filtrada. |
| POST | `/api/extensiones` | Crea un interno. |
| PUT | `/api/extensiones/:id` | Edita un interno. |
| DELETE | `/api/extensiones/:id` | Elimina un interno. |
| POST | `/api/extensiones/importar` | Carga masiva (`modo: fusionar` o `reemplazar`). |
| POST | `/api/organizar` | Reaplica las reglas de sector (`{ "todo": true }` reclasifica todo). |
| GET | `/api/sectores` | Catalogo de sectores con conteos, orden y color. |
| POST | `/api/sectores` | Crea un sector (`{ "nombre": "..." }`). |
| POST | `/api/sectores/reordenar` | Guarda el orden (`{ "orden": ["Urgencias", ...] }`, debe incluir todos). |
| POST | `/api/sectores/:nombre/color` | Color fijo (`{ "color": "#c2410c" }`); `null` vuelve al automatico. |
| GET | `/api/sectores/:nombre` | Detalle de un sector y sus internos. |
| PUT | `/api/sectores/:nombre` | Renombra o fusiona (`{ "nombre": "..." }`). |
| DELETE | `/api/sectores/:nombre` | Elimina. Cuerpo: `{ "estrategia": "mover", "destino": "UCE" }` o `{ "estrategia": "borrar" }`. |
| GET | `/api/export.csv` | Exporta CSV con los filtros aplicados. |
| GET | `/imprimir?q=&sector=&estado=&orden=` | Vista de impresion (HTML ya armado). |
| GET | `/api/imprimir.pdf?q=&sector=&estado=&orden=` | Descarga el directorio en PDF. |

El nombre del sector va en la URL codificado (por ejemplo `Cocina%20%2F%20Economato`).

## Sin conexion a internet

El sistema no usa internet ni librerias externas: todo corre local. Solo necesita
Node.js instalado en la PC donde se ejecuta `iniciar.cmd`.

## Despliegue en NAS con Docker

La carpeta incluye `Dockerfile` y `docker-compose.yml`. Como `Z:` corresponde
al recurso compartido `Docker` del NAS, la ruta Linux habitual es
`/volume1/Docker/Telefonos_Internos`. Entra al NAS por SSH/PuTTY y ejecuta:

```sh
cd /volume1/Docker/Telefonos_Internos
sudo docker-compose up -d --build
```

El sistema quedara disponible en `http://IP_DEL_NAS:5173`. La carpeta `data/`
se monta fuera del contenedor para conservar la base y los respaldos al
actualizar o recrear el contenedor.

Para comprobar el estado y ver los registros:

```sh
sudo docker-compose ps
sudo docker-compose logs -f
```

Para detenerlo:

```sh
sudo docker-compose down
```

### Contraseña de administrador

La consulta es pública, pero crear, editar, eliminar, reorganizar y cambiar
sectores requiere una sesión de administrador. En el NAS, crea el archivo local
`.env` a partir de `.env.example` y define una contraseña fuerte:

```sh
cp .env.example .env
vi .env
```

Con Docker, `docker-compose` lee ese archivo automáticamente. Sin Docker, usa
los scripts `iniciar-nas.sh` y `detener-nas.sh`:

```sh
chmod +x iniciar-nas.sh detener-nas.sh
./iniciar-nas.sh
```

El archivo `.env` nunca se versiona ni se debe publicar. También puedes definir
`TELEFONISTA_PASSWORD` para habilitar el rol telefonista: puede gestionar
contactos personales y guardias, pero no modificar el directorio general ni la
configuración de internos. Define `RRHH_PASSWORD` para que Recursos Humanos
gestione Guardias: consulta Funcionarios, filtra por fecha/servicio/estado,
edita horarios y estados, e imprime o exporta la planificación. RRHH no puede
modificar Internos Hospital, Funcionarios ni los directorios generales.

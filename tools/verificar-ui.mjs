/**
 * Verificacion real de la UI con Chrome via CDP (sin dependencias).
 * Uso:  node tools/verificar-ui.mjs [urlBase] [puertoCDP]
 *
 * Por defecto NO toca los datos reales: levanta una copia del servidor en el
 * puerto 5198 con su propio archivo de datos y prueba contra esa copia, que se
 * descarta al terminar. La suite se puede correr las veces que haga falta.
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO_PRUEBA = 5198;
const DIR_PRUEBA = path.join(tmpdir(), 'internos-verificacion');
// Con un argumento se prueba contra ese servidor; sin argumento, contra la copia.
const BASE = process.argv[2] || `http://127.0.0.1:${PUERTO_PRUEBA}`;
const AISLADO = !process.argv[2];
const PUERTO = Number(process.argv[3] || 9333);
// El perfil va al temporal del sistema: Chrome le pone ACLs que no se pueden
// borrar desde el proyecto sin permisos de administrador.
const PERFIL = path.join(tmpdir(), 'internos-chrome-cdp');

const RUTAS_CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Copia server.mjs, public/ y tools/ a una carpeta temporal, con sus propios datos. */
function prepararEntornoAislado() {
  rmSync(DIR_PRUEBA, { recursive: true, force: true });
  mkdirSync(path.join(DIR_PRUEBA, 'data'), { recursive: true });
  for (const carpeta of ['public', 'tools']) {
    cpSync(path.join(RAIZ, carpeta), path.join(DIR_PRUEBA, carpeta), { recursive: true });
  }
  copyFileSync(path.join(RAIZ, 'server.mjs'), path.join(DIR_PRUEBA, 'server.mjs'));
  const origen = path.join(RAIZ, 'data', 'telefonos.json');
  if (!existsSync(origen)) throw new Error('No existe data/telefonos.json: corre primero  node tools/seed.mjs');
  copyFileSync(origen, path.join(DIR_PRUEBA, 'data', 'telefonos.json'));
}

let servidorPrueba = null;

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/estado`);
      if (r.ok) return true;
    } catch { /* todavia no responde */ }
    await dormir(250);
  }
  return false;
}


class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pendientes = new Map();
    this.escucha = new Map();
    this.errores = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pendientes.has(msg.id)) {
        const { resolver, rechazar } = this.pendientes.get(msg.id);
        this.pendientes.delete(msg.id);
        msg.error ? rechazar(new Error(msg.error.message)) : resolver(msg.result);
        return;
      }
      // Los dialogos nativos (alert/confirm/prompt) bloquean la pagina: se responden solos.
      if (msg.method === 'Page.javascriptDialogOpening') {
        const responder = this.escucha.get('dialogo');
        console.log(`      (dialogo ${msg.params.type}: ${JSON.stringify(msg.params.message).slice(0, 90)}...)`);
        responder?.(msg.params);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errores.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        this.errores.push(msg.params.exceptionDetails.text || 'excepcion sin detalle');
      }
    });
  }

  alAbrirDialogo(fn) { this.escucha.set('dialogo', fn); }

  enviar(metodo, params = {}) {
    const id = ++this.id;
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      this.ws.send(JSON.stringify({ id, method: metodo, params }));
    });
  }

  /** Evalua JS en la pagina y devuelve el valor. */
  async evaluar(expresion) {
    const r = await this.enviar('Runtime.evaluate', {
      expression: expresion,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'error en la pagina');
    return r.result.value;
  }

  async captura(archivo) {
    const r = await this.enviar('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(RAIZ, archivo), Buffer.from(r.data, 'base64'));
    return archivo;
  }

  /** Captura la pagina entera ajustando el viewport a la altura del contenido. */
  async capturaCompleta(archivo, ancho = 1400) {
    const m = await this.enviar('Page.getLayoutMetrics');
    const alto = Math.min(Math.ceil(m.cssContentSize.height), 20000);
    await this.enviar('Emulation.setDeviceMetricsOverride', {
      width: ancho, height: alto, deviceScaleFactor: 1, mobile: false,
    });
    await dormir(250);
    const r = await this.enviar('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(RAIZ, archivo), Buffer.from(r.data, 'base64'));
    // Vuelve al tamano de ventana normal.
    await this.enviar('Emulation.setDeviceMetricsOverride', {
      width: ancho, height: 1200, deviceScaleFactor: 1, mobile: false,
    });
    await dormir(150);
    return archivo;
  }
}

async function conectar() {
  for (let i = 0; i < 60; i++) {
    try {
      const info = await fetch(`http://127.0.0.1:${PUERTO}/json/list`).then((r) => r.json());
      const pagina = info.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      if (pagina) {
        const ws = new WebSocket(pagina.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.addEventListener('open', res, { once: true });
          ws.addEventListener('error', () => rej(new Error('no se pudo abrir el websocket')), { once: true });
        });
        return new CDP(ws);
      }
    } catch { /* Chrome todavia no responde */ }
    await dormir(250);
  }
  throw new Error('Chrome no expuso el endpoint de depuracion a tiempo');
}

async function main() {
  const exe = RUTAS_CHROME.find((p) => existsSync(p));
  if (!exe) throw new Error('No se encontro Chrome ni Edge.');

  if (AISLADO) {
    prepararEntornoAislado();
    servidorPrueba = spawn(process.execPath, ['server.mjs'], {
      cwd: DIR_PRUEBA,
      env: { ...process.env, PORT: String(PUERTO_PRUEBA), HOST: '127.0.0.1', ADMIN_PASSWORD: 'verificacion-admin' },
      stdio: 'ignore',
    });
    if (!(await esperarServidor())) throw new Error('la copia del servidor no arranco');
    console.log(`Probando contra una copia aislada: ${BASE}\n`);
  } else {
    console.log(`Probando contra ${BASE}\n`);
  }

  rmSync(PERFIL, { recursive: true, force: true });
  mkdirSync(PERFIL, { recursive: true });

  const chrome = spawn(exe, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    '--window-size=1400,1200',
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  const pruebas = [];
  const anotar = (nombre, ok, detalle) => {
    pruebas.push({ nombre, ok, detalle });
    console.log(`${ok ? 'OK  ' : 'FALLA'}  ${nombre}${detalle ? `  -> ${detalle}` : ''}`);
  };

  try {
    const cdp = await conectar();
    await cdp.enviar('Page.enable');
    await cdp.enviar('Runtime.enable');
    await cdp.enviar('Emulation.setDeviceMetricsOverride', {
      width: 1400, height: 1200, deviceScaleFactor: 1, mobile: false,
    });
    await cdp.enviar('Page.navigate', { url: BASE });
    await dormir(2500);

    // Las mutaciones del sistema requieren una sesión: se usa una credencial
    // temporal solo para la copia aislada de esta suite.
    if (AISLADO) {
      await cdp.evaluar("document.querySelector('#btnAdmin').click(); document.querySelector('#fUsuario').value='admin'; document.querySelector('#fPassword').value='verificacion-admin'; document.querySelector('#formAdmin').requestSubmit();");
      await dormir(500);
    }

    // 1. Carga y errores de consola
    const titulo = await cdp.evaluar('document.title');
    anotar('la pagina carga', titulo === 'Internos Telefonicos', `title="${titulo}"`);

    // Los valores esperados se calculan desde la API: la suite no depende de
    // que los datos tengan ciertos sectores o numeros concretos.
    const estadoAPI = await fetch(`${BASE}/api/estado`).then((r) => r.json());
    const totalEsperado = estadoAPI.total;
    const conInternos = estadoAPI.sectores.filter((s) => s.total > 0).length;

    const stats = await cdp.evaluar(`JSON.stringify({
      total: document.querySelector('#kTotal').textContent,
      activos: document.querySelector('#kActivos').textContent,
      inactivos: document.querySelector('#kInactivos').textContent,
      sectores: document.querySelector('#kSectores').textContent,
      subtitulo: document.querySelector('#subtitulo').textContent,
    })`);
    const s = JSON.parse(stats);
    anotar('las tarjetas de resumen se llenan',
      s.total === String(totalEsperado) && s.sectores === String(estadoAPI.totalSectores),
      `total=${s.total}/${totalEsperado} activos=${s.activos} inactivos=${s.inactivos} sectores=${s.sectores}/${estadoAPI.totalSectores}`);

    anotar('el modal arranca oculto',
      await cdp.evaluar("getComputedStyle(document.querySelector('#modal')).display === 'none'"));

    const tarjetas = await cdp.evaluar("document.querySelectorAll('.sector-card').length");
    anotar('la vista por sector dibuja tarjetas', tarjetas === conInternos,
      `${tarjetas} tarjetas (${conInternos} sectores con internos)`);

    await cdp.capturaCompleta('captura-sectores.png');

    // 2. "Ver mas" en un sector con mas de 5 internos (si hay alguno)
    const sectorLargo = estadoAPI.sectores.find((x) => x.total > 5);
    if (sectorLargo) {
      const antes = await cdp.evaluar(
        `document.querySelectorAll('.sector-card[data-sector="${sectorLargo.sector}"] .fila').length`
      );
      await cdp.evaluar(`document.querySelector('[data-vermas="${sectorLargo.sector}"]').click()`);
      await dormir(300);
      const despues = await cdp.evaluar(
        `document.querySelectorAll('.sector-card[data-sector="${sectorLargo.sector}"] .fila').length`
      );
      anotar('"Ver mas" expande el sector',
        antes === 5 && despues === sectorLargo.total,
        `"${sectorLargo.sector}": ${antes} -> ${despues} filas (total ${sectorLargo.total})`);
    } else {
      anotar('"Ver mas" expande el sector', false, 'no hay ningun sector con mas de 5 internos para probar');
    }

    // 3. Busqueda con resaltado, sin acentos: se busca un nombre real de los datos.
    const muestra = await fetch(`${BASE}/api/extensiones`).then((r) => r.json());
    const elegido = muestra.extensiones.find((e) => /[áéíóúñ]/i.test(e.nombre)) || muestra.extensiones[0];
    const termino = elegido.nombre.split(/[\s-]+/).filter((p) => p.length > 3)[0] || elegido.nombre;
    const sinTildes = termino.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    await cdp.evaluar(`(() => {
      const q = document.querySelector('#q');
      q.value = ${JSON.stringify(sinTildes)};
      q.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await dormir(800);
    const busqueda = JSON.parse(await cdp.evaluar(`JSON.stringify({
      filas: document.querySelectorAll('.fila').length,
      marcas: document.querySelectorAll('mark').length,
      tarjetas: document.querySelectorAll('.sector-card').length,
      titulo: document.querySelector('.sector-card h3')?.textContent || '',
    })`));
    anotar('la busqueda ignora acentos y resalta la coincidencia',
      busqueda.filas >= 1 && busqueda.marcas >= 1,
      `"${sinTildes}" -> ${busqueda.filas} fila(s), ${busqueda.marcas} resaltado(s)`);

    // 4. Limpiar filtros
    await cdp.evaluar("document.querySelector('#btnLimpiarFiltros').click()");
    await dormir(800);
    const total = await cdp.evaluar("document.querySelectorAll('.fila').length");
    anotar('limpiar filtros restaura la vista', total >= tarjetas, `${total} filas visibles en ${tarjetas} tarjetas`);

    // 5. Vista de lista completa
    await cdp.evaluar("document.querySelector('.tab[data-vista=\"lista\"]').click()");
    await dormir(400);
    const filasTabla = await cdp.evaluar("document.querySelectorAll('#cuerpoTabla tr').length");
    anotar('la lista completa muestra todos los internos', filasTabla === totalEsperado,
      `${filasTabla} filas (esperadas ${totalEsperado})`);
    await cdp.capturaCompleta('captura-lista.png');

    // 6. Abrir el modal de edicion desde la tabla
    await cdp.evaluar("document.querySelector('#cuerpoTabla [data-editar]').click()");
    await dormir(400);
    const modal = JSON.parse(await cdp.evaluar(`JSON.stringify({
      visible: getComputedStyle(document.querySelector('#modal')).display !== 'none',
      interno: document.querySelector('#fInterno').value,
      nombre: document.querySelector('#fNombre').value,
      sector: document.querySelector('#fSector').value,
      eliminar: !document.querySelector('#btnEliminar').hidden,
    })`));
    anotar('el modal de edicion se abre con los datos reales',
      modal.visible && modal.interno === muestra.extensiones[0].interno && modal.eliminar,
      `interno=${modal.interno} nombre="${modal.nombre}" sector="${modal.sector}"`);
    await cdp.captura('captura-modal.png');

    // 7. Esc cierra el modal
    await cdp.evaluar("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await dormir(250);
    anotar('Escape cierra el modal',
      await cdp.evaluar("getComputedStyle(document.querySelector('#modal')).display === 'none'"));

    /* ------------------------------------------- gestion de sectores ---- */

    // 8. Abrir el panel de sectores
    await cdp.evaluar("document.querySelector('#btnSectores').click()");
    await dormir(400);
    const panel = JSON.parse(await cdp.evaluar(`JSON.stringify({
      visible: !document.querySelector('#modalSectores').hidden,
      filas: document.querySelectorAll('#cuerpoSectores tr').length,
      totalTarjetas: document.querySelector('#kSectores').textContent,
      conProtegido: document.querySelectorAll('#cuerpoSectores .pill-protegido').length,
      protegidoSinBotones: (() => {
        const fila = [...document.querySelectorAll('#cuerpoSectores tr')]
          .find((f) => f.textContent.includes('Sin asignar'));
        return fila ? fila.querySelectorAll('[data-renombrar],[data-eliminar-sector]').length === 0 : false;
      })(),
    })`));
    anotar('el panel de sectores abre y lista el catalogo',
      panel.visible && panel.filas === Number(panel.totalTarjetas),
      `${panel.filas} filas, contador=${panel.totalTarjetas}`);
    anotar('"Sin asignar" aparece protegido y sin acciones',
      panel.conProtegido === 1 && panel.protegidoSinBotones);

    // 9. Crear un sector desde el panel
    await cdp.evaluar(`(() => {
      const i = document.querySelector('#nuevoSector');
      i.value = 'Sector Desde UI';
      document.querySelector('#formSector').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`);
    await dormir(900);
    const trasCrear = JSON.parse(await cdp.evaluar(`JSON.stringify({
      existe: [...document.querySelectorAll('#cuerpoSectores .nom-sector')].some((n) => n.textContent === 'Sector Desde UI'),
      contador: document.querySelector('#kSectores').textContent,
      input: document.querySelector('#nuevoSector').value,
    })`));
    anotar('crear sector desde el panel', trasCrear.existe && trasCrear.input === '',
      `contador de sectores=${trasCrear.contador}, input limpio=${trasCrear.input === ''}`);

    // 10. Duplicado: debe mostrar el error
    await cdp.evaluar(`(() => {
      const i = document.querySelector('#nuevoSector');
      i.value = 'sector desde ui';
      document.querySelector('#formSector').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    })()`);
    await dormir(700);
    const dup = JSON.parse(await cdp.evaluar(`JSON.stringify({
      error: document.querySelector('#errorSector').hidden ? '' : document.querySelector('#errorSector').textContent,
    })`));
    anotar('rechaza un sector duplicado (ignorando mayusculas)', /ya existe/.test(dup.error), dup.error);

    // 11. Renombrar desde el panel
    await cdp.evaluar(`document.querySelector('[data-renombrar="Sector Desde UI"]').click()`);
    await dormir(300);
    await cdp.evaluar(`(() => {
      const i = document.querySelector('.input-renombrar');
      i.value = 'Sector Renombrado UI';
      document.querySelector('[data-guardar-sector]').click();
    })()`);
    await dormir(900);
    const renombrado = JSON.parse(await cdp.evaluar(`JSON.stringify({
      existe: [...document.querySelectorAll('#cuerpoSectores .nom-sector')].some((n) => n.textContent === 'Sector Renombrado UI'),
      viejo: [...document.querySelectorAll('#cuerpoSectores .nom-sector')].some((n) => n.textContent === 'Sector Desde UI'),
    })`));
    anotar('renombrar sector desde el panel', renombrado.existe && !renombrado.viejo);

    // 12. Eliminar un sector real con internos, moviendolos a otro.
    // Se usa un sector de los datos actuales que no sea "Sin asignar".
    const candidato = estadoAPI.sectores.find((x) => x.total > 0 && !x.protegido);
    if (!candidato) throw new Error('no hay ningun sector con internos para probar la eliminacion');
    const destinoNombre = estadoAPI.sectores.find((x) => x.sector !== candidato.sector).sector;

    cdp.alAbrirDialogo((params) => {
      // En el prompt se escribe el numero de la opcion 1 (mover al primer sector).
      const texto = params.type === 'prompt' ? '1' : '';
      cdp.enviar('Page.handleJavaScriptDialog', { accept: true, promptText: texto }).catch(() => {});
    });
    // Se mide el catalogo justo antes de borrar, para que el assert no dependa
    // de lo que hayan dejado los pasos anteriores (asi la suite es repetible).
    const antesDelBorrado = JSON.parse(await cdp.evaluar(
      `JSON.stringify([...document.querySelectorAll('#cuerpoSectores .nom-sector')].map((n) => n.textContent))`
    ));
    await cdp.evaluar(`(() => {
      const fila = [...document.querySelectorAll('#cuerpoSectores tr')]
        .find((f) => f.querySelector('.nom-sector')?.textContent === ${JSON.stringify(candidato.sector)});
      fila.querySelector('[data-eliminar-sector]').click();
    })()`);
    await dormir(1500);
    const despuesDelBorrado = JSON.parse(await cdp.evaluar(
      `JSON.stringify([...document.querySelectorAll('#cuerpoSectores .nom-sector')].map((n) => n.textContent))`
    ));
    const eliminado = JSON.parse(await cdp.evaluar(`JSON.stringify({
      totalInternos: document.querySelector('#kTotal').textContent,
      contador: document.querySelector('#kSectores').textContent,
      // Los avisos se apilan: puede quedar el de un renombre anterior.
      avisos: [...document.querySelectorAll('.aviso')].map((a) => a.textContent),
    })`));
    const desaparecidos = antesDelBorrado.filter((n) => !despuesDelBorrado.includes(n));
    anotar('eliminar sector moviendo sus internos',
      desaparecidos.length === 1
        && desaparecidos[0] === candidato.sector
        && despuesDelBorrado.length === antesDelBorrado.length - 1
        && eliminado.totalInternos === String(totalEsperado)
        && Number(eliminado.contador) === despuesDelBorrado.length,
      `"${candidato.sector}" (${candidato.total} internos) -> ${destinoNombre}; `
      + `${antesDelBorrado.length} -> ${despuesDelBorrado.length} sectores, ${eliminado.totalInternos} internos intactos`);
    await cdp.captura('captura-sectores-panel.png');

    /* ------------------------------------------ orden manual y colores ---- */

    // 13. Reordenar con la flecha de subir (se usa un sector real, no el primero)
    const movible = estadoAPI.sectores.filter((x) => x.sector !== candidato.sector)[1]
      || estadoAPI.sectores[1];
    const reorden = JSON.parse(await cdp.evaluar(`(() => {
      const nombres = [...document.querySelectorAll('#cuerpoSectores .nom-sector')].map((n) => n.textContent);
      const fila = [...document.querySelectorAll('#cuerpoSectores tr')]
        .find((f) => f.querySelector('.nom-sector')?.textContent === ${JSON.stringify(movible.sector)});
      fila.querySelector('[data-mover][data-delta="-1"]').click();
      return JSON.stringify({ antes: nombres, movido: ${JSON.stringify(movible.sector)} });
    })()`));
    await dormir(1200);
    const orden = JSON.parse(await cdp.evaluar(`JSON.stringify({
      nombres: [...document.querySelectorAll('#cuerpoSectores .nom-sector')].map((n) => n.textContent),
      primeraFlechaSubirDeshabilitada: document.querySelector('#cuerpoSectores [data-mover][data-delta="-1"]').disabled,
    })`));
    const posAntes = reorden.antes.indexOf(movible.sector);
    const posAhora = orden.nombres.indexOf(movible.sector);
    anotar('la flecha sube el sector un lugar', posAhora === posAntes - 1,
      `"${movible.sector}": posicion ${posAntes} -> ${posAhora}`);
    anotar('el primer sector no puede subir mas', orden.primeraFlechaSubirDeshabilitada);

    // 14. Asignar un color fijo y comprobar que se aplica en todo el dashboard
    const COLOR = '#c2410c';
    const COLOR_RGB = 'rgb(194, 65, 12)';
    const conColor = movible.sector;
    await cdp.evaluar(`(() => {
      const fila = [...document.querySelectorAll('#cuerpoSectores tr')]
        .find((f) => f.querySelector('.nom-sector')?.textContent === ${JSON.stringify(conColor)});
      fila.querySelector('[data-color]').click();
    })()`);
    await dormir(300);
    const paletaVisible = await cdp.evaluar("document.querySelectorAll('.color-opcion').length");
    anotar('el selector de color abre la paleta', paletaVisible >= 12, `${paletaVisible} colores`);

    await cdp.evaluar(`document.querySelector('[data-set-color=${JSON.stringify(conColor)}][data-valor="${COLOR}"]').click()`);
    await dormir(1200);
    const colorAplicado = await cdp.evaluar(
      `document.querySelector('#cuerpoSectores [data-color=${JSON.stringify(conColor)}]').style.background`
    );
    anotar('el color fijo se aplica en el panel',
      colorAplicado === COLOR_RGB, `"${conColor}" = ${colorAplicado}`);

    // 15. El color sobrevive a recargar la pagina (esta guardado en el servidor)
    await cdp.enviar('Page.navigate', { url: BASE });
    await dormir(2500);
    const trasRecarga = JSON.parse(await cdp.evaluar(`JSON.stringify({
      btnSectores: !!document.querySelector('#btnSectores'),
    })`));
    await cdp.evaluar("document.querySelector('#btnSectores').click()");
    await dormir(400);
    const colorPersistido = await cdp.evaluar(
      `document.querySelector('#cuerpoSectores [data-color=${JSON.stringify(conColor)}]').style.background`
    );
    anotar('el color persiste tras recargar', colorPersistido === COLOR_RGB,
      `${colorPersistido} (boton sectores presente: ${trasRecarga.btnSectores})`);

    // 16. El color fijo se usa tambien en la vista por sector (tarjetas)
    await cdp.evaluar("document.querySelector('#btnCerrarSectores2').click()");
    await dormir(400);
    const colorTarjeta = await cdp.evaluar(
      `document.querySelector('.sector-card[data-sector=${JSON.stringify(conColor)}] .punto')?.style.background || ''`
    );
    anotar('el color fijo se usa en las tarjetas', colorTarjeta === COLOR_RGB, colorTarjeta);

    // 17. Arrastrar una fila para reordenarla (eventos de puntero reales)
    // El paso anterior cerro el panel: se vuelve a abrir.
    await cdp.evaluar("document.querySelector('#btnSectores').click()");
    await dormir(600);
    await cdp.evaluar("window.scrollTo(0, 0); document.querySelector('#modalSectores .modal').scrollTop = 0;");
    await dormir(400);
    const drag = JSON.parse(await cdp.evaluar(`(() => {
      const filas = [...document.querySelectorAll('#cuerpoSectores tr[data-sector]')];
      const nombres = filas.map((f) => f.querySelector('.nom-sector').textContent);
      // Se arrastra una fila visible hacia arriba: en headless no hay scroll,
      // asi que las filas fuera del viewport no reciben el puntero.
      const desde = 4, hasta = 1;
      const origen = filas[desde].querySelector('.asa').getBoundingClientRect();
      const destino = filas[hasta].getBoundingClientRect();
      const cajaOrigen = filas[desde].getBoundingClientRect();
      return JSON.stringify({
        nombres,
        indiceDesde: desde,
        indiceDestino: hasta,
        arrastrado: nombres[desde],
        destino: nombres[hasta],
        x: Math.round(origen.left + 4),
        y: Math.round(origen.top + origen.height / 2),
        xd: Math.round(destino.left + 80),
        yd: Math.round(destino.top + destino.height * 0.3),
        visible: cajaOrigen.top >= 0 && cajaOrigen.bottom <= window.innerHeight
          && destino.top >= 0 && destino.bottom <= window.innerHeight
          && !document.querySelector('#modalSectores').hidden,
        cajaOrigen: { top: Math.round(cajaOrigen.top), bottom: Math.round(cajaOrigen.bottom) },
        cajaDestino: { top: Math.round(destino.top), bottom: Math.round(destino.bottom) },
        altoVentana: window.innerHeight,
      });
    })()`));
    anotar('las filas a arrastrar estan visibles', drag.visible,
      `origen ${drag.cajaOrigen.top}-${drag.cajaOrigen.bottom}, destino ${drag.cajaDestino.top}-${drag.cajaDestino.bottom}, ventana ${drag.altoVentana}`);

    // Se comprueba que el puntero caiga de verdad sobre la fila de origen.
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x, y: drag.y });
    await dormir(120);
    const bajoPuntero = await cdp.evaluar(`(() => {
      const e = document.elementFromPoint(${drag.x}, ${drag.y});
      return e ? e.tagName + '.' + e.className + ' | fila=' + (e.closest('tr[data-sector]')?.dataset.sector ?? 'ninguna') : 'nada';
    })()`);
    anotar('el puntero cae sobre la fila de origen',
      bajoPuntero.includes(drag.arrastrado), bajoPuntero);

    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.x, y: drag.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await cdp.enviar('Input.dispatchMouseEvent', {
        type: 'mouseMoved', button: 'left', buttons: 1,
        x: Math.round(drag.x + (drag.xd - drag.x) * i / 8),
        y: Math.round(drag.y + (drag.yd - drag.y) * i / 8),
      });
      await dormir(60);
    }
    const marcadorVisible = await cdp.evaluar(
      "document.querySelectorAll('#cuerpoSectores .soltar-antes, #cuerpoSectores .soltar-despues').length"
    );
    anotar('mientras se arrastra se marca la posicion de destino', marcadorVisible === 1,
      `${marcadorVisible} marca(s)`);
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.xd, y: drag.yd, button: 'left' });
    await dormir(1300);

    const trasArrastre = JSON.parse(await cdp.evaluar(
      `JSON.stringify([...document.querySelectorAll('#cuerpoSectores .nom-sector')].map((n) => n.textContent))`
    ));
    const posFinal = trasArrastre.indexOf(drag.arrastrado);
    // Al soltar sobre la mitad superior de la fila 2, la arrastrada queda en esa posicion.
    anotar('arrastrar una fila la reordena',
      posFinal === drag.indiceDestino,
      `"${drag.arrastrado}" paso de la posicion ${drag.indiceDesde + 1} a la ${posFinal + 1} (esperada ${drag.indiceDestino + 1})`);
    await cdp.captura('captura-sectores-arrastre.png');

    // 18. Ordenar alfabeticamente todos los sectores
    await cdp.evaluar("document.querySelector('#btnOrdenar').click()");
    await dormir(1500);
    const alfabetico = JSON.parse(await cdp.evaluar(`(() => {
      const nombres = [...document.querySelectorAll('#cuerpoSectores .nom-sector')].map((n) => n.textContent);
      const sinAsignar = nombres.indexOf('Sin asignar');
      const ordenados = nombres.filter((n) => n !== 'Sin asignar');
      const esperados = [...ordenados].sort(new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare);
      return JSON.stringify({
        coincide: ordenados.every((n, i) => n === esperados[i]),
        primeros: nombres.slice(0, 5),
        sinAsignarAlFinal: sinAsignar === nombres.length - 1,
        total: nombres.length,
      });
    })()`));
    anotar('"Ordenar A-Z" deja los sectores alfabeticos',
      alfabetico.coincide && alfabetico.sinAsignarAlFinal,
      `${alfabetico.total} sectores; primeros: ${alfabetico.primeros.join(', ')}; "Sin asignar" al final: ${alfabetico.sinAsignarAlFinal}`);

    // 19. El orden alfabetico quedo guardado en el servidor
    const ordenServidor = await fetch(`${BASE}/api/sectores`).then((r) => r.json());
    const nombresServidor = ordenServidor.sectores.map((s) => s.sector);
    anotar('el orden queda guardado en el servidor',
      nombresServidor.slice(0, 5).every((n, i) => n === alfabetico.primeros[i]),
      `servidor: ${nombresServidor.slice(0, 3).join(', ')}`);

    // 20. Los enlaces de exportar, imprimir y PDF respetan los filtros activos
    const terminoFiltro = termino.toLowerCase();
    await cdp.evaluar(`(() => {
      const q = document.querySelector('#q');
      q.value = ${JSON.stringify(terminoFiltro)};
      q.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await dormir(900);
    const enlaces = JSON.parse(await cdp.evaluar(`JSON.stringify({
      csv: document.querySelector('#btnExportar').getAttribute('href'),
      imprimir: document.querySelector('#btnImprimir').getAttribute('href'),
      pdf: document.querySelector('#btnPdf').getAttribute('href'),
    })`));
    const conFiltro = `q=${encodeURIComponent(terminoFiltro)}`;
    anotar('exportar, imprimir y PDF llevan el filtro activo',
      [enlaces.csv, enlaces.imprimir, enlaces.pdf].every((h) => h && h.includes(conFiltro)),
      `imprimir=${enlaces.imprimir} | pdf=${enlaces.pdf}`);

    // 21. La vista de impresion viene renderizada del servidor (sin JavaScript)
    const impresion = await fetch(`${BASE}/imprimir?${conFiltro}`).then((r) => r.text());
    const secciones = (impresion.match(/class="sector"/g) || []).length;
    anotar('la vista de impresion sale renderizada del servidor',
      secciones > 0 && !impresion.includes('Cargando'),
      `${secciones} sector(es) para "${terminoFiltro}", sin placeholders`);

    // 22. El PDF respeta el filtro (el archivo cambia de tamano)
    const pdfCompleto = await fetch(`${BASE}/api/imprimir.pdf`).then((r) => r.arrayBuffer());
    const pdfFiltrado = await fetch(`${BASE}/api/imprimir.pdf?${conFiltro}`).then((r) => r.arrayBuffer());
    anotar('el PDF respeta el filtro aplicado',
      pdfCompleto.byteLength > pdfFiltrado.byteLength && pdfFiltrado.byteLength > 5000,
      `completo ${Math.round(pdfCompleto.byteLength / 1024)} KB vs "${terminoFiltro}" ${Math.round(pdfFiltrado.byteLength / 1024)} KB`);

    // 23. Sin errores de consola en toda la sesion
    anotar('la consola no reporta errores', cdp.errores.length === 0,
      cdp.errores.length ? cdp.errores.join(' | ') : 'ninguno');

  } finally {
    chrome.kill();
    if (servidorPrueba) servidorPrueba.kill();
    await dormir(400);
    if (AISLADO) rmSync(DIR_PRUEBA, { recursive: true, force: true });
  }

  const fallas = pruebas.filter((p) => !p.ok);
  console.log(`\n${pruebas.length - fallas.length}/${pruebas.length} verificaciones OK`);
  if (fallas.length) process.exitCode = 1;
}

main().catch((e) => { console.error('Error:', e.message); process.exitCode = 1; });

/**
 * Servidor del sistema de internos telefonicos.
 * Node puro, sin dependencias externas.  Uso:  node server.mjs
 */
import http from 'node:http';
import { readFile, writeFile, rename, mkdir, rm, stat, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { asignarSector, SIN_ASIGNAR } from './tools/sectores.mjs';
import { renderDirectorio } from './tools/imprimir.mjs';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const DIR_PUBLIC = path.join(RAIZ, 'public');
// El directorio de datos se puede cambiar (lo usa la verificacion automatizada
// para trabajar sobre una copia y no tocar los datos reales).
const DIR_DATOS = process.env.DIR_DATOS ? path.resolve(process.env.DIR_DATOS) : path.join(RAIZ, 'data');
const ARCHIVO_DATOS = path.join(DIR_DATOS, 'telefonos.json');

const PUERTO_INICIAL = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';
const ESTADOS = new Set(['activo', 'inactivo']);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const TELEFONISTA_PASSWORD = process.env.TELEFONISTA_PASSWORD || '';
const sesionesAdmin = new Map();

// Puerto real donde quedo escuchando (puede cambiar si el inicial estaba ocupado).
let PUERTO_ACTIVO = PUERTO_INICIAL;

/* ------------------------------------------------------------------ store */

let store = null;          // cache en memoria
let colaEscritura = Promise.resolve();

async function cargarStore() {
  if (store) return store;
  if (!existsSync(ARCHIVO_DATOS)) {
    throw new Error(
      'No existe data/telefonos.json. Ejecuta primero:  node tools/seed.mjs'
    );
  }
  store = JSON.parse(await readFile(ARCHIVO_DATOS, 'utf8'));
  if (!Array.isArray(store.extensiones)) store.extensiones = [];
  if (typeof store.version !== 'number') store.version = 1;
  if (!Array.isArray(store.sectores)) store.sectores = [];
  if (!store.colores || typeof store.colores !== 'object') store.colores = {};
  migrarModulos(store);
  // Migracion: el catalogo de sectores se completa con los que ya usan los internos.
  for (const e of store.extensiones) {
    if (e.sector && !store.sectores.includes(e.sector)) store.sectores.push(e.sector);
  }
  // "Sin asignar" solo se agrega si hace falta: es el destino por defecto al
  // eliminar un sector, pero no se impone si ningun interno lo usa.
  if (store.extensiones.some((e) => e.sector === SIN_ASIGNAR)) {
    asegurarSector(store, SIN_ASIGNAR);
  }
  return store;
}

function migrarModulos(s) {
  if (!Array.isArray(s.usuarios)) s.usuarios = [];
  if (!s.usuarios.some((u) => u.rol === 'administrador')) {
    s.usuarios.push({ id: 'rol-administrador', usuario: 'admin', rol: 'administrador', activo: true });
  }
  if (!Array.isArray(s.contactos_privados)) s.contactos_privados = [];
  if (!Array.isArray(s.guardias)) s.guardias = [];
  if (!Array.isArray(s.directorio_flores)) s.directorio_flores = datosFloresIniciales();
  if (!Array.isArray(s.directorio_nacional_salud)) s.directorio_nacional_salud = [];
}

function datosFloresIniciales() {
  return [
    { id: crypto.randomUUID(), categoria: 'Emergencias', nombre: 'Emergencias 911', telefono: '911', servicio: 'Emergencias', localidad: 'Trinidad', notas: '' },
    { id: crypto.randomUUID(), categoria: 'Emergencias', nombre: 'Bomberos', telefono: '104', servicio: 'Emergencias', localidad: 'Trinidad', notas: '' },
    { id: crypto.randomUUID(), categoria: 'Emergencias', nombre: 'ASSE / SAME 105', telefono: '105', servicio: 'Emergencias móviles', localidad: 'Trinidad', notas: '' },
    { id: crypto.randomUUID(), categoria: 'Salud', nombre: 'COMEPA', telefono: '', servicio: 'Central / atención al usuario', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: crypto.randomUUID(), categoria: 'Salud', nombre: 'AMEDRIN', telefono: '', servicio: 'Central / atención al usuario', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: crypto.randomUUID(), categoria: 'Salud', nombre: 'COMEF', telefono: '', servicio: 'Central / atención al usuario', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: crypto.randomUUID(), categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Intendencia de Flores', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: crypto.randomUUID(), categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Jefatura de Policía de Flores', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: crypto.randomUUID(), categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Batallón de Infantería', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: crypto.randomUUID(), categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Junta Departamental de Flores', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: crypto.randomUUID(), categoria: 'Servicios', nombre: 'UTE', telefono: '0800 1930', servicio: 'Atención general', localidad: 'Flores', notas: '' },
    { id: crypto.randomUUID(), categoria: 'Servicios', nombre: 'OSE', telefono: '0800 1871', servicio: 'Atención general', localidad: 'Flores', notas: '' },
    { id: crypto.randomUUID(), categoria: 'Servicios', nombre: 'ANTEL', telefono: '123', servicio: 'Atención general', localidad: 'Flores', notas: '' },
  ];
}

const esColor = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ''));

/** Se asegura de que un sector exista en el catalogo. */
function asegurarSector(s, nombre) {
  const limpio = limpiar(nombre);
  if (!limpio) return;
  if (!s.sectores.includes(limpio)) s.sectores.push(limpio);
}

/** Devuelve el color fijo del sector, o null si usa el color derivado del nombre. */
function colorDe(s, nombre) {
  const c = s.colores?.[nombre];
  return esColor(c) ? c : null;
}

/** Serializa las escrituras y guarda de forma atomica (tmp + rename). */
function mutar(fn) {
  const tarea = colaEscritura.then(async () => {
    const s = await cargarStore();
    const resultado = fn(s);
    if (resultado !== undefined && resultado !== null) {
      s.version += 1;
      s.actualizado = new Date().toISOString();
      await mkdir(DIR_DATOS, { recursive: true });
      await respaldarAntesDeEscribir(s);
      const tmp = `${ARCHIVO_DATOS}.tmp`;
      await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
      await rename(tmp, ARCHIVO_DATOS);
    }
    return resultado;
  });
  // La cola no debe romperse si una tarea falla.
  colaEscritura = tarea.then(() => {}, () => {});
  return tarea;
}

/* ------------------------------------------------------------- respaldos */

const DIR_RESPALDOS = path.join(DIR_DATOS, 'respaldos');
const MAX_RESPALDOS = 60;
const MINUTOS_ENTRE_AUTOS = 10;
let ultimoAuto = null;

const marcaTiempo = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Guarda una copia del estado actual antes de sobreescribirlo, como mucho una
 * cada MINUTOS_ENTRE_AUTOS. Es la red de seguridad: si algo sale mal, la version
 * anterior esta en data/respaldos.
 */
async function respaldarAntesDeEscribir(store) {
  try {
    if (ultimoAuto && Date.now() - ultimoAuto < MINUTOS_ENTRE_AUTOS * 60_000) return;
    await mkdir(DIR_RESPALDOS, { recursive: true });
    await writeFile(
      path.join(DIR_RESPALDOS, `auto-${marcaTiempo()}.json`),
      JSON.stringify(store, null, 2),
      'utf8'
    );
    ultimoAuto = Date.now();

    // Se conservan los mas recientes.
    const archivos = (await readdir(DIR_RESPALDOS)).filter((f) => f.startsWith('auto-')).sort();
    for (const viejo of archivos.slice(0, Math.max(0, archivos.length - MAX_RESPALDOS))) {
      await rm(path.join(DIR_RESPALDOS, viejo), { force: true }).catch(() => {});
    }
  } catch {
    // Un fallo al respaldar no debe impedir guardar el cambio.
  }
}

/* ------------------------------------------------------------- validacion */

class ErrorDatos extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.status = 400;
  }
}

const limpiar = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

function validar(datos, lista = store.extensiones, idActual = null) {
  const interno = limpiar(datos.interno);
  if (!/^\d{1,6}$/.test(interno)) {
    throw new ErrorDatos('El interno debe ser un numero de 1 a 6 digitos.');
  }
  const repetido = lista.find((e) => e.interno === interno && e.id !== idActual);
  if (repetido) {
    throw new ErrorDatos(`El interno ${interno} ya esta asignado a "${repetido.nombre}".`);
  }

  const nombre = limpiar(datos.nombre);
  if (!nombre) throw new ErrorDatos('El nombre no puede quedar vacio.');

  const sector = limpiar(datos.sector) || asignarSector(nombre);
  const estado = limpiar(datos.estado) || 'activo';
  if (!ESTADOS.has(estado)) {
    throw new ErrorDatos('El estado debe ser "activo" o "inactivo".');
  }

  return { interno, nombre, sector, estado, notas: limpiar(datos.notas) };
}

/* ------------------------------------------------------------------- HTTP */

function json(res, status, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    'Cache-Control': 'no-store',
  });
  res.end(texto);
}

function error(res, status, mensaje) {
  json(res, status, { error: mensaje });
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((parte) => {
    const i = parte.indexOf('=');
    return [parte.slice(0, i).trim(), decodeURIComponent(parte.slice(i + 1).trim())];
  }));
}

function rolSesion(req) {
  const token = cookies(req).internos_admin;
  const sesion = token ? sesionesAdmin.get(token) : null;
  const vence = sesion?.vence || 0;
  if (vence && vence < Date.now()) sesionesAdmin.delete(token);
  return token && vence >= Date.now() ? sesion.rol : null;
}

function esAdmin(req) {
  return rolSesion(req) === 'administrador';
}

function esTelefonista(req) {
  return ['administrador', 'telefonista'].includes(rolSesion(req));
}

function cookieSesion(token, maxAge = 60 * 60 * 12) {
  return `internos_admin=${encodeURIComponent(token)}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict; Path=/`;
}

function respuestaAuth(res, estado) {
  return json(res, 200, {
    configurado: Boolean(ADMIN_PASSWORD),
    telefonistaConfigurado: Boolean(TELEFONISTA_PASSWORD),
    autenticado: Boolean(estado),
    rol: estado || null,
  });
}

function responderHTML(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
  });
  res.end(html);
}

function escaparHTML(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function leerCuerpo(req, limite = 2 * 1024 * 1024) {
  const partes = [];
  let total = 0;
  for await (const trozo of req) {
    total += trozo.length;
    if (total > limite) throw new ErrorDatos('El cuerpo de la peticion es demasiado grande.');
    partes.push(trozo);
  }
  if (!partes.length) return {};
  const texto = Buffer.concat(partes).toString('utf8');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorDatos('El cuerpo de la peticion no es JSON valido.');
  }
}

function comparar(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

/* --------------------------------------------------------------- PDF / papel */

const RUTAS_NAVEGADOR = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const navegadorDisponible = () => RUTAS_NAVEGADOR.find((ruta) => existsSync(ruta)) || null;

/**
 * Genera un PDF con el motor de impresion de Chrome/Edge headless.
 * No usa librerias externas: el navegador ya sabe paginar.
 *
 * Se lanza con stdio 'ignore' a proposito: no depende de capturar la salida del
 * proceso por un pipe (innecesario, y bloqueado en entornos restringidos).
 * La prueba de exito es que el archivo aparezca.
 */
function generarPDF(urlImpresion, destino) {
  return new Promise((resolve, reject) => {
    const exe = navegadorDisponible();
    if (!exe) {
      const error = new Error(
        'No se encontro Chrome ni Edge en este equipo. Usa el boton "Imprimir / Guardar como PDF".'
      );
      error.status = 503;
      return reject(error);
    }

    let proceso;
    try {
      proceso = spawn(exe, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pdf-header-footer',
        `--print-to-pdf=${destino}`,
        urlImpresion,
      ], { stdio: 'ignore', windowsHide: true });
    } catch (e) {
      const error = new Error(`No se pudo lanzar el navegador para generar el PDF: ${e.message}`);
      error.status = 500;
      return reject(error);
    }

    let terminado = false;
    const limite = setTimeout(() => {
      terminado = true;
      proceso.kill();
      const error = new Error('El navegador tardo demasiado en generar el PDF.');
      error.status = 504;
      reject(error);
    }, 60000);

    proceso.on('error', (e) => {
      clearTimeout(limite);
      terminado = true;
      const error = new Error(`No se pudo lanzar el navegador para generar el PDF: ${e.message}`);
      error.status = 500;
      reject(error);
    });

    // El navegador escribe el PDF y termina: se sondea el archivo.
    const esperar = setInterval(async () => {
      if (terminado) { clearInterval(esperar); return; }
      if (!existsSync(destino)) return;
      // Se espera a que el archivo deje de crecer para no devolverlo a medias.
      const antes = (await stat(destino).catch(() => null))?.size ?? 0;
      await new Promise((r) => setTimeout(r, 350));
      const ahora = (await stat(destino).catch(() => null))?.size ?? 0;
      if (antes > 0 && antes === ahora) {
        clearInterval(esperar);
        clearTimeout(limite);
        terminado = true;
        resolve(destino);
      }
    }, 250);
  });
}

function ordenar(lista, criterio) {
  const copia = [...lista];
  switch (criterio) {
    case 'nombre': return copia.sort((a, b) => comparar(a.nombre, b.nombre));
    case 'sector': return copia.sort((a, b) => comparar(a.sector, b.sector) || comparar(a.nombre, b.nombre));
    case 'interno':
    default: return copia.sort((a, b) => comparar(a.interno, b.interno));
  }
}

function filtrar(lista, { q = '', sector = '', estado = '' }) {
  // Busqueda y sector se comparan sin mayusculas ni acentos.
  const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const texto = normalizar(limpiar(q));
  const sec = normalizar(limpiar(sector));
  const est = limpiar(estado);
  return lista.filter((e) => {
    if (sec && normalizar(e.sector) !== sec) return false;
    if (est && e.estado !== est) return false;
    if (!texto) return true;
    const pajar = normalizar(`${e.interno} ${e.nombre} ${e.sector} ${e.notas}`);
    return texto.split(/\s+/).every((palabra) => pajar.includes(palabra));
  });
}

/**
 * Catalogo de sectores con sus conteos. Respeta el orden manual guardado en
 * store.sectores (no alfabetico), e incluye los sectores que quedaron sin internos.
 */
function listarSectores() {
  const conteos = new Map();
  for (const e of store.extensiones) {
    const actual = conteos.get(e.sector) || { total: 0, activos: 0, inactivos: 0 };
    actual.total += 1;
    if (e.estado === 'activo') actual.activos += 1; else actual.inactivos += 1;
    conteos.set(e.sector, actual);
  }
  return store.sectores.map((sector, i) => ({
    sector,
    orden: i,
    color: colorDe(store, sector),
    total: 0, activos: 0, inactivos: 0,
    ...(conteos.get(sector) || {}),
    // "Sin asignar" no se puede renombrar ni eliminar.
    protegido: sector === SIN_ASIGNAR,
  }));
}

function resumen(extensiones) {
  const sectores = listarSectores();
  return {
    version: store.version,
    actualizado: store.actualizado,
    total: extensiones.length,
    activos: extensiones.filter((e) => e.estado === 'activo').length,
    inactivos: extensiones.filter((e) => e.estado === 'inactivo').length,
    sinSector: extensiones.filter((e) => !e.sector || e.sector === 'Sin asignar').length,
    totalSectores: sectores.length,
    sectores,
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

async function servirEstatico(res, rutaUrl) {
  const rel = rutaUrl === '/' ? 'index.html' : decodeURIComponent(rutaUrl).replace(/^\/+/, '');
  const destino = path.resolve(DIR_PUBLIC, rel);
  if (!destino.startsWith(DIR_PUBLIC)) return error(res, 403, 'Acceso denegado.');
  if (!existsSync(destino)) return error(res, 404, 'Recurso no encontrado.');

  const contenido = await readFile(destino);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(destino).toLowerCase()] || 'application/octet-stream',
    'Content-Length': contenido.length,
    'Cache-Control': 'no-cache',
  });
  res.end(contenido);
}

function escaparCSV(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function manejarAPI(req, res, url) {
  const partes = url.pathname.split('/').filter(Boolean); // ['api', 'extensiones', id]
  const metodo = req.method;

  if (partes[1] === 'auth' && partes[2] === 'estado' && metodo === 'GET') {
    return respuestaAuth(res, esAdmin(req));
  }

  if (partes[1] === 'auth' && partes[2] === 'login' && metodo === 'POST') {
    const { password, usuario = 'admin' } = await leerCuerpo(req);
    const rol = usuario === 'telefonista' ? 'telefonista' : 'administrador';
    const clave = rol === 'telefonista' ? TELEFONISTA_PASSWORD : ADMIN_PASSWORD;
    if (!clave) return error(res, 503, `La cuenta ${rol} no esta configurada en el servidor.`);
    if (typeof password !== 'string' || password !== clave) {
      return error(res, 401, 'Contraseña incorrecta.');
    }
    const token = crypto.randomUUID();
    sesionesAdmin.set(token, { rol, vence: Date.now() + 12 * 60 * 60 * 1000 });
    res.setHeader('Set-Cookie', cookieSesion(token));
    return respuestaAuth(res, rol);
  }

  if (partes[1] === 'auth' && partes[2] === 'logout' && metodo === 'POST') {
    const token = cookies(req).internos_admin;
    if (token) sesionesAdmin.delete(token);
    res.setHeader('Set-Cookie', cookieSesion('', 0));
    return respuestaAuth(res, false);
  }

  // Visor público: solo lectura y únicamente los datos necesarios para ubicar
  // al funcionario de guardia. La gestión completa sigue siendo privada.
  if (partes[1] === 'guardias' && partes[2] === 'visor' && metodo === 'GET') {
    const fecha = url.searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
    const guardias = store.guardias
      .filter((g) => g.fecha === fecha)
      .sort((a, b) => `${a.turno}${a.rolGuardia}`.localeCompare(`${b.turno}${b.rolGuardia}`))
      .map(({ id, fecha: fechaGuardia, turno, rolGuardia, contactoNombre, telefono }) => ({
        id, fecha: fechaGuardia, turno, rolGuardia, contactoNombre, telefono,
      }));
    return json(res, 200, { fecha, guardias });
  }

  const modifica = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo);
  const recursoTelefonista = ['contactos', 'funcionarios', 'guardias'].includes(partes[1]);
  if (recursoTelefonista && !esTelefonista(req)) {
    return error(res, 401, 'Este modulo requiere una sesion de telefonista o administrador.');
  }
  if (modifica && !esAdmin(req) && !recursoTelefonista) {
    return error(res, 401, ADMIN_PASSWORD
      ? 'Necesitas iniciar sesion como administrador para modificar datos.'
      : 'La cuenta administrador no esta configurada en el servidor.');
  }

  if (['contactos', 'funcionarios'].includes(partes[1])) {
    const consulta = (url.searchParams.get('q') || '').toLocaleLowerCase();
    if (metodo === 'GET' && partes.length === 2) {
      const contactos = store.contactos_privados.filter((c) => !consulta
        || `${c.nombre} ${c.ci} ${c.rol} ${c.funcion}`.toLocaleLowerCase().includes(consulta));
      return json(res, 200, partes[1] === 'funcionarios' ? { funcionarios: contactos } : { contactos });
    }
    if (metodo === 'POST' && partes.length === 2) {
      const cuerpo = await leerCuerpo(req);
      if (!limpiar(cuerpo.nombre) || !limpiar(cuerpo.celularPrincipal)) {
        throw new ErrorDatos('Nombre y celular principal son obligatorios.');
      }
      const contacto = { id: crypto.randomUUID(), nombre: limpiar(cuerpo.nombre), ci: limpiar(cuerpo.ci), rol: limpiar(cuerpo.rol), funcion: limpiar(cuerpo.funcion), celularPrincipal: limpiar(cuerpo.celularPrincipal), celularSecundario: limpiar(cuerpo.celularSecundario), disponibilidad: limpiar(cuerpo.disponibilidad) };
      await mutar((s) => { s.contactos_privados.push(contacto); return contacto; });
      return json(res, 201, partes[1] === 'funcionarios' ? { funcionario: contacto } : { contacto });
    }
    if (partes.length === 3 && ['PUT', 'PATCH'].includes(metodo)) {
      const id = decodeURIComponent(partes[2]);
      const cuerpo = await leerCuerpo(req);
      const actualizado = await mutar((s) => {
        const contacto = s.contactos_privados.find((c) => c.id === id);
        if (!contacto) return null;
        Object.assign(contacto, cuerpo, { id, nombre: limpiar(cuerpo.nombre ?? contacto.nombre) });
        return contacto;
      });
      if (!actualizado) return error(res, 404, 'Contacto no encontrado.');
      return json(res, 200, { contacto: actualizado });
    }
    if (partes.length === 3 && metodo === 'DELETE') {
      const id = decodeURIComponent(partes[2]);
      const antes = store.contactos_privados.length;
      await mutar((s) => { s.contactos_privados = s.contactos_privados.filter((c) => c.id !== id); return s.contactos_privados.length !== antes; });
      return json(res, 200, { eliminado: id });
    }
  }

  if (partes[1] === 'guardias') {
    if (metodo === 'GET' && partes[2] === 'export.csv') {
      const fecha = url.searchParams.get('fecha') || '';
      const lista = store.guardias.filter((g) => !fecha || g.fecha === fecha);
      const lineas = ['Fecha,Turno,Rol,Funcionario,Telefono,Notas', ...lista.map((g) => [g.fecha, g.turno, g.rolGuardia, g.contactoNombre, g.telefono, g.notas].map(escaparCSV).join(','))];
      const texto = '\uFEFF' + lineas.join('\r\n') + '\r\n';
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="guardias.csv"', 'Content-Length': Buffer.byteLength(texto) });
      return res.end(texto);
    }
    if (metodo === 'GET' && partes.length === 2) {
      const fecha = url.searchParams.get('fecha') || '';
      const guardias = store.guardias.filter((g) => !fecha || g.fecha === fecha).sort((a, b) => `${a.fecha}${a.turno}`.localeCompare(`${b.fecha}${b.turno}`));
      return json(res, 200, { guardias });
    }
    if (metodo === 'POST' && partes.length === 2) {
      const cuerpo = await leerCuerpo(req);
      if (!limpiar(cuerpo.fecha) || !limpiar(cuerpo.turno) || !limpiar(cuerpo.rolGuardia) || !limpiar(cuerpo.contactoId)) throw new ErrorDatos('Fecha, turno, rol y funcionario son obligatorios.');
      const contacto = store.contactos_privados.find((c) => c.id === cuerpo.contactoId);
      if (!contacto) throw new ErrorDatos('El contacto seleccionado no existe.');
      const guardia = { id: crypto.randomUUID(), fecha: limpiar(cuerpo.fecha), turno: limpiar(cuerpo.turno), rolGuardia: limpiar(cuerpo.rolGuardia), contactoId: contacto.id, contactoNombre: contacto.nombre, telefono: contacto.celularPrincipal, notas: limpiar(cuerpo.notas) };
      await mutar((s) => { s.guardias.push(guardia); return guardia; });
      return json(res, 201, { guardia });
    }
    if (partes.length === 3 && metodo === 'DELETE') {
      const id = decodeURIComponent(partes[2]);
      await mutar((s) => { s.guardias = s.guardias.filter((g) => g.id !== id); return true; });
      return json(res, 200, { eliminado: id });
    }
  }

  if (partes[1] === 'directorio' && ['flores', 'salud'].includes(partes[2])) {
    const campo = partes[2] === 'flores' ? 'directorio_flores' : 'directorio_nacional_salud';
    if (metodo === 'GET' && partes.length === 3) {
      const q = (url.searchParams.get('q') || '').toLocaleLowerCase();
      const departamento = url.searchParams.get('departamento') || '';
      const tipo = url.searchParams.get('tipo') || '';
      const registros = store[campo].filter((r) => (!q || JSON.stringify(r).toLocaleLowerCase().includes(q)) && (!departamento || r.departamento === departamento) && (!tipo || r.tipoCentro === tipo));
      return json(res, 200, { registros });
    }
    if (metodo === 'POST' && partes.length === 3) {
      const cuerpo = await leerCuerpo(req);
      const registro = { id: crypto.randomUUID(), ...cuerpo };
      await mutar((s) => { s[campo].push(registro); return registro; });
      return json(res, 201, { registro });
    }
    if (partes.length === 4 && ['PUT', 'PATCH'].includes(metodo)) {
      const id = decodeURIComponent(partes[3]);
      const cuerpo = await leerCuerpo(req);
      const registro = await mutar((s) => { const actual = s[campo].find((r) => r.id === id); if (!actual) return null; Object.assign(actual, cuerpo, { id }); return actual; });
      if (!registro) return error(res, 404, 'Registro no encontrado.');
      return json(res, 200, { registro });
    }
    if (partes.length === 4 && metodo === 'DELETE') {
      const id = decodeURIComponent(partes[3]);
      await mutar((s) => { s[campo] = s[campo].filter((r) => r.id !== id); return true; });
      return json(res, 200, { eliminado: id });
    }
  }

  // GET /api/estado
  if (partes[1] === 'estado' && metodo === 'GET') {
    return json(res, 200, resumen(store.extensiones));
  }

  // GET /api/extensiones | POST /api/extensiones
  if (partes[1] === 'extensiones' && partes.length === 2) {
    if (metodo === 'GET') {
      const lista = ordenar(
        filtrar(store.extensiones, {
          q: url.searchParams.get('q') || '',
          sector: url.searchParams.get('sector') || '',
          estado: url.searchParams.get('estado') || '',
        }),
        url.searchParams.get('orden') || 'interno'
      );
      return json(res, 200, { version: store.version, total: lista.length, extensiones: lista });
    }
    if (metodo === 'POST') {
      const datos = validar(await leerCuerpo(req));
      const nueva = await mutar((s) => {
        const reg = { id: crypto.randomUUID(), ...datos };
        asegurarSector(s, reg.sector);
        s.extensiones.push(reg);
        return reg;
      });      return json(res, 201, { version: store.version, extension: nueva });
    }
    return error(res, 405, 'Metodo no permitido.');
  }

  // POST /api/extensiones/importar  (reemplaza o fusiona)
  if (partes[1] === 'extensiones' && partes[2] === 'importar' && metodo === 'POST') {
    const cuerpo = await leerCuerpo(req);
    const entrantes = Array.isArray(cuerpo) ? cuerpo : cuerpo.extensiones;
    if (!Array.isArray(entrantes) || !entrantes.length) {
      throw new ErrorDatos('Se esperaba una lista de extensiones.');
    }
    const modo = cuerpo.modo === 'reemplazar' ? 'reemplazar' : 'fusionar';
    const resultado = await mutar((s) => {
      if (modo === 'reemplazar') s.extensiones = [];
      let creadas = 0;
      let actualizadas = 0;
      for (const cruda of entrantes) {
        const existente = s.extensiones.find((e) => e.interno === limpiar(cruda.interno));
        const idActual = existente ? existente.id : null;
        // Si el registro no trae sector, se intenta clasificar por el nombre.
        const crudaConSector = limpiar(cruda.sector)
          ? cruda
          : { ...cruda, sector: asignarSector(cruda.nombre) };
        const datos = validar(crudaConSector, s.extensiones, idActual);
        asegurarSector(s, datos.sector);
        if (existente) {
          Object.assign(existente, datos);
          actualizadas += 1;
        } else {
          s.extensiones.push({ id: crypto.randomUUID(), ...datos });
          creadas += 1;
        }
      }
      return { creadas, actualizadas, total: s.extensiones.length };
    });
    return json(res, 200, { version: store.version, ...resultado });
  }

  // POST /api/organizar  (reaplica las reglas de sector automaticas)
  // Por defecto SOLO toca los que estan en "Sin asignar". Reclasificar todo
  // (pisando asignaciones hechas a mano) exige pedirlo de forma explicita.
  if (partes[1] === 'organizar' && metodo === 'POST') {
    const cuerpo = await leerCuerpo(req).catch(() => ({}));
    const todo = cuerpo?.todo === true;
    const confirmado = cuerpo?.confirmar === true;

    if (todo && !confirmado) {
      throw new ErrorDatos(
        'Reclasificar todo por nombre pisa las asignaciones hechas a mano. '
        + 'Manda confirmar: true para hacerlo igual.'
      );
    }

    const cambios = await mutar((s) => {
      const modificados = [];
      for (const e of s.extensiones) {
        if (!todo && e.sector && e.sector !== SIN_ASIGNAR) continue;
        const sugerido = asignarSector(e.nombre);
        if (sugerido !== e.sector) {
          modificados.push({ interno: e.interno, nombre: e.nombre, de: e.sector, a: sugerido });
          e.sector = sugerido;
          asegurarSector(s, sugerido);
        }
      }
      // Limpia del catalogo los sectores que quedaron sin uso.
      const enUso = new Set(s.extensiones.map((e) => e.sector));
      s.sectores = s.sectores.filter((sec) => enUso.has(sec));
      for (const sec of Object.keys(s.colores)) {
        if (!s.sectores.includes(sec)) delete s.colores[sec];
      }
      return modificados.length ? modificados : null; // null => no se guarda ni sube version
    });
    return json(res, 200, { version: store.version, cambios: cambios || [] });
  }

  /* ------------------------------------------------------------ sectores */

  // GET /api/sectores  -> catalogo con conteos
  if (partes[1] === 'sectores' && partes.length === 2 && metodo === 'GET') {
    return json(res, 200, { version: store.version, sectores: listarSectores() });
  }

  // POST /api/sectores  -> crear
  if (partes[1] === 'sectores' && partes.length === 2 && metodo === 'POST') {
    const { nombre } = await leerCuerpo(req);
    const nuevo = limpiar(nombre);
    if (!nuevo) throw new ErrorDatos('El nombre del sector no puede quedar vacio.');
    if (store.sectores.some((s) => comparar(s, nuevo) === 0)) {
      throw new ErrorDatos(`El sector "${nuevo}" ya existe.`);
    }
    await mutar((s) => { s.sectores.push(nuevo); return true; });
    return json(res, 201, { version: store.version, sectores: listarSectores() });
  }

  // POST /api/sectores/reordenar  -> nuevo orden del catalogo
  if (partes[1] === 'sectores' && partes[2] === 'reordenar' && metodo === 'POST') {
    const { orden } = await leerCuerpo(req);
    if (!Array.isArray(orden)) throw new ErrorDatos('Se esperaba una lista con el orden de los sectores.');
    const pedidos = orden.map(limpiar);
    const actuales = [...store.sectores];
    if (pedidos.length !== actuales.length || new Set(pedidos).size !== actuales.length) {
      throw new ErrorDatos('El orden recibido no coincide con los sectores existentes.');
    }
    if (!pedidos.every((s) => actuales.includes(s))) {
      throw new ErrorDatos('El orden recibido incluye sectores que no existen.');
    }
    await mutar((s) => { s.sectores = pedidos; return true; });
    return json(res, 200, { version: store.version, sectores: listarSectores() });
  }

  // POST /api/sectores/:nombre/color  -> color fijo (o null para volver al derivado)
  if (partes[1] === 'sectores' && partes.length === 4 && partes[3] === 'color' && metodo === 'POST') {
    const nombre = decodeURIComponent(partes[2]);
    if (!store.sectores.includes(nombre)) {
      return error(res, 404, `El sector "${nombre}" no existe.`);
    }
    const { color } = await leerCuerpo(req);
    const valor = color === null || color === '' ? null : limpiar(color);
    if (valor !== null && !esColor(valor)) {
      throw new ErrorDatos('El color debe estar en formato hexadecimal, por ejemplo #1f5fd1.');
    }
    await mutar((s) => {
      if (valor === null) delete s.colores[nombre];
      else s.colores[nombre] = valor.toLowerCase();
      return true;
    });
    return json(res, 200, { version: store.version, sector: nombre, color: valor, sectores: listarSectores() });
  }

  // /api/sectores/:nombre
  if (partes[1] === 'sectores' && partes.length === 3) {
    const actual = decodeURIComponent(partes[2]);
    if (!store.sectores.includes(actual)) {
      return error(res, 404, `El sector "${actual}" no existe.`);
    }
    if (actual === SIN_ASIGNAR && metodo !== 'GET') {
      throw new ErrorDatos(
        `El sector "${SIN_ASIGNAR}" no se puede renombrar ni eliminar: es el destino por defecto al eliminar un sector.`
      );
    }

    // GET -> detalle del sector, con los internos que quedarian afectados
    if (metodo === 'GET') {
      const internos = store.extensiones.filter((e) => e.sector === actual);
      return json(res, 200, {
        version: store.version,
        sector: actual,
        total: internos.length,
        activos: internos.filter((e) => e.estado === 'activo').length,
        inactivos: internos.filter((e) => e.estado === 'inactivo').length,
        internos,
      });
    }

    // PUT   -> renombrar (si el destino ya existe, se fusionan)
    if (metodo === 'PUT' || metodo === 'PATCH') {
      const { nombre } = await leerCuerpo(req);
      const destino = limpiar(nombre);
      if (!destino) throw new ErrorDatos('El nombre del sector no puede quedar vacio.');
      if (destino === actual) {
        return json(res, 200, { version: store.version, movidos: 0, fusionado: false, sectores: listarSectores() });
      }
      const fusionado = store.sectores.some((s) => s !== actual && comparar(s, destino) === 0);
      const resultado = await mutar((s) => {
        let movidos = 0;
        for (const e of s.extensiones) {
          if (e.sector === actual) { e.sector = destino; movidos += 1; }
        }
        s.sectores = s.sectores.filter((sec) => sec !== actual);
        asegurarSector(s, destino);
        // El color fijo viaja con el sector renombrado; si se fusiona, gana el del destino.
        if (s.colores[actual] && !s.colores[destino]) s.colores[destino] = s.colores[actual];
        delete s.colores[actual];
        return { movidos };
      });
      return json(res, 200, {
        version: store.version,
        movidos: resultado.movidos,
        fusionado,
        sectores: listarSectores(),
      });
    }

    // DELETE -> eliminar. Hay que decidir que pasa con sus internos.
    if (metodo === 'DELETE') {
      const cuerpo = await leerCuerpo(req).catch(() => ({}));
      const estrategia = cuerpo?.estrategia === 'borrar' ? 'borrar' : 'mover';
      // Sin destino explicito los internos quedan en "Sin asignar", NUNCA en un
      // sector cualquiera: mandarlos a otro sector existente es una decision del usuario.
      const destino = limpiar(cuerpo?.destino) || SIN_ASIGNAR;
      const afectados = store.extensiones.filter((e) => e.sector === actual);

      if (estrategia === 'mover' && destino === actual) {
        throw new ErrorDatos('El sector de destino debe ser distinto del que se elimina.');
      }
      if (estrategia === 'mover' && destino !== SIN_ASIGNAR && !store.sectores.includes(destino)) {
        throw new ErrorDatos(`El sector de destino "${destino}" no existe.`);
      }

      const resultado = await mutar((s) => {
        let eliminados = 0;
        if (estrategia === 'borrar') {
          eliminados = s.extensiones.filter((e) => e.sector === actual).length;
          s.extensiones = s.extensiones.filter((e) => e.sector !== actual);
        } else {
          for (const e of s.extensiones) if (e.sector === actual) e.sector = destino;
          asegurarSector(s, destino);
        }
        s.sectores = s.sectores.filter((sec) => sec !== actual);
        delete s.colores[actual];
        return { eliminados, movidos: estrategia === 'mover' ? afectados.length : 0 };
      });
      return json(res, 200, {
        version: store.version,
        estrategia,
        destino: estrategia === 'mover' ? destino : null,
        afectados: afectados.length,
        ...resultado,
        sectores: listarSectores(),
      });
    }
    return error(res, 405, 'Metodo no permitido.');
  }

  // GET /api/imprimir.pdf  -> directorio en PDF con los filtros aplicados
  if (partes[1] === 'imprimir.pdf' && metodo === 'GET') {
    const consulta = url.searchParams.toString();
    const destino = path.join(DIR_DATOS, `directorio-${Date.now()}.pdf`);
    const urlImpresion = `http://127.0.0.1:${PUERTO_ACTIVO}/imprimir${consulta ? `?${consulta}` : ''}`;

    try {
      await generarPDF(urlImpresion, destino);
      const pdf = await readFile(destino);
      const fecha = new Date().toISOString().slice(0, 10);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="directorio-internos-${fecha}.pdf"`,
        'Content-Length': pdf.length,
      });
      return res.end(pdf);
    } finally {
      // El archivo temporal solo sirve para armarlo.
      await rm(destino, { force: true }).catch(() => {});
    }
  }

  // GET /api/export.csv
  if (partes[1] === 'export.csv' && metodo === 'GET') {
    const lista = ordenar(
      filtrar(store.extensiones, {
        q: url.searchParams.get('q') || '',
        sector: url.searchParams.get('sector') || '',
        estado: url.searchParams.get('estado') || '',
      }),
      url.searchParams.get('orden') || 'interno'
    );
    const lineas = ['Interno,Nombre,Sector,Estado,Notas'];
    for (const e of lista) {
      lineas.push([e.interno, e.nombre, e.sector, e.estado, e.notas].map(escaparCSV).join(','));
    }
    const texto = '\uFEFF' + lineas.join('\r\n') + '\r\n';
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="internos.csv"',
      'Content-Length': Buffer.byteLength(texto),
    });
    return res.end(texto);
  }

  // /api/extensiones/:id
  if (partes[1] === 'extensiones' && partes.length === 3) {
    const id = decodeURIComponent(partes[2]);
    const existente = store.extensiones.find((e) => e.id === id);
    if (!existente) return error(res, 404, 'Interno no encontrado.');

    if (metodo === 'PUT' || metodo === 'PATCH') {
      const cuerpo = await leerCuerpo(req);
      const datos = validar({ ...existente, ...cuerpo }, store.extensiones, id);
      const actualizada = await mutar((s) => {
        const reg = s.extensiones.find((e) => e.id === id);
        Object.assign(reg, datos);
        asegurarSector(s, datos.sector);
        return reg;
      });
      return json(res, 200, { version: store.version, extension: actualizada });
    }
    if (metodo === 'DELETE') {
      await mutar((s) => {
        s.extensiones = s.extensiones.filter((e) => e.id !== id);
        return true;
      });
      return json(res, 200, { version: store.version, eliminado: id });
    }
    return error(res, 405, 'Metodo no permitido.');
  }

  return error(res, 404, 'Ruta no encontrada.');
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Vista de impresion: HTML ya renderizado, sin depender de JavaScript.
    if (url.pathname === '/imprimir') {
      await cargarStore();
      const filtros = {
        q: url.searchParams.get('q') || '',
        sector: url.searchParams.get('sector') || '',
        estado: url.searchParams.get('estado') || '',
        orden: url.searchParams.get('orden') || 'interno',
      };
      const internos = ordenar(filtrar(store.extensiones, filtros), filtros.orden);
      const html = renderDirectorio({
        internos,
        catalogo: store.sectores.map((s) => ({ sector: s })),
        filtros,
        consulta: url.searchParams.toString(),
      });
      return responderHTML(res, html);
    }

    if (url.pathname === '/guardias/imprimir') {
      await cargarStore();
      if (!esTelefonista(req)) return error(res, 401, 'Necesitas una sesion de telefonista o administrador.');
      const fecha = url.searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
      const guardias = store.guardias.filter((g) => g.fecha === fecha);
      const filas = guardias.map((g) => `<tr><td>${escaparHTML(g.turno)}</td><td>${escaparHTML(g.rolGuardia)}</td><td>${escaparHTML(g.contactoNombre)}</td><td>${escaparHTML(g.telefono)}</td><td>${escaparHTML(g.notas)}</td></tr>`).join('');
      return responderHTML(res, `<!doctype html><html lang="es"><meta charset="utf-8"><title>Guardias ${escaparHTML(fecha)}</title><style>body{font:14px Arial;color:#172033;margin:32px}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #ccd3dd;text-align:left}@media print{button{display:none}}</style><h1>Guardia del día: ${escaparHTML(fecha)}</h1><button onclick="print()">Imprimir / Guardar PDF</button><table><thead><tr><th>Turno</th><th>Rol</th><th>Funcionario</th><th>Telefono</th><th>Notas</th></tr></thead><tbody>${filas || '<tr><td colspan="5">No hay guardias asignadas.</td></tr>'}</tbody></table></html>`);
    }

    if (url.pathname === '/guardias/visor') {
      await cargarStore();
      const fecha = url.searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
      const guardias = store.guardias.filter((g) => g.fecha === fecha);
      const filas = guardias.map((g) => `<tr><td>${escaparHTML(g.turno)}</td><td>${escaparHTML(g.rolGuardia)}</td><td>${escaparHTML(g.contactoNombre)}</td><td>${escaparHTML(g.telefono)}</td></tr>`).join('');
      return responderHTML(res, `<!doctype html><html lang="es"><meta charset="utf-8"><title>Guardias ${escaparHTML(fecha)}</title><style>body{font:14px Arial;color:#172033;margin:32px}h1{font-size:22px}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #ccd3dd;text-align:left}@media print{button{display:none}}</style><h1>Guardias del día: ${escaparHTML(fecha)}</h1><button onclick="print()">Imprimir / Guardar PDF</button><table><thead><tr><th>Turno</th><th>Rol</th><th>Funcionario</th><th>Telefono directo</th></tr></thead><tbody>${filas || '<tr><td colspan="4">No hay guardias cargadas.</td></tr>'}</tbody></table></html>`);
    }

    if (url.pathname.startsWith('/api/')) {
      await cargarStore();
      return await manejarAPI(req, res, url);
    }
    return await servirEstatico(res, url.pathname);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) error(res, status, e.message || 'Error interno.');
    else res.end();
  }
});

/** Arranca en el primer puerto libre a partir de PUERTO_INICIAL. */
function arrancar(puerto, intentos = 10) {
  servidor.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && intentos > 0) {
      console.log(`Puerto ${puerto} ocupado, probando ${puerto + 1}...`);
      arrancar(puerto + 1, intentos - 1);
    } else {
      console.error(`No se pudo iniciar el servidor: ${e.message}`);
      process.exit(1);
    }
  });
  servidor.listen(puerto, HOST, () => {
    PUERTO_ACTIVO = puerto;
    // El banner no debe tumbar el servidor si el archivo todavia no existe.
    let resumenDatos = 'sin datos cargados todavia';
    try {
      const s = JSON.parse(readFileSync(ARCHIVO_DATOS, 'utf8'));
      resumenDatos = `${s.extensiones.length} internos cargados  |  v${s.version}`;
    } catch {
      resumenDatos = 'sin datos: ejecuta  node tools/seed.mjs';
    }
    console.log('');
    console.log('  Sistema de Internos Telefonicos');
    console.log(`  ${resumenDatos}`);
    console.log('');
    console.log(`  Local :  http://localhost:${puerto}`);
    for (const ip of direccionesLocales()) {
      console.log(`  Red   :  http://${ip}:${puerto}`);
    }
    console.log('');
    console.log('  Ctrl+C para detener.');
  });
}

function direccionesLocales() {
  const salida = [];
  for (const lista of Object.values(networkInterfaces())) {
    for (const iface of lista || []) {
      if (iface.family === 'IPv4' && !iface.internal) salida.push(iface.address);
    }
  }
  return salida;
}

arrancar(PUERTO_INICIAL);

export { servidor };

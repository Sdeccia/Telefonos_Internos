/**
 * Lee extensions.csv (export de FreePBX) y genera la base editable del sistema.
 * Uso:  node tools/seed.mjs
 *
 * OJO: solo define funciones al importarse; el trabajo ocurre en main(),
 * que unicamente corre si este archivo es el punto de entrada.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asignarSector, norm, SIN_ASIGNAR } from './sectores.mjs';

export { asignarSector, norm, SIN_ASIGNAR };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(RAIZ, 'extensions.csv');
const DIR_DATOS = path.join(RAIZ, 'data');
const ARCHIVO = path.join(DIR_DATOS, 'telefonos.json');

/** Parseo CSV con comillas dobles y comas internas. */
function parsearCSV(texto) {
  const filas = [];
  let campo = '';
  let fila = [];
  let entreComillas = false;
  const t = texto.replace(/\r\n/g, '\n');

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += c;
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      fila.push(campo); campo = '';
    } else if (c === '\n') {
      fila.push(campo); campo = '';
      filas.push(fila); fila = [];
    } else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }

  const encabezados = filas.shift().map((h) => h.trim());
  return filas
    .filter((f) => f.some((v) => v.trim() !== ''))
    .map((f) => Object.fromEntries(encabezados.map((h, i) => [h, (f[i] ?? '').trim()])));
}

/** Reconstruye data/telefonos.json desde extensions.csv. */
export async function sembrar({ forzar = true } = {}) {
  if (!forzar && existsSync(ARCHIVO)) return null;

  const filas = parsearCSV(await readFile(CSV, 'utf8'));
  const vistos = new Set();
  const lista = [];

  for (const f of filas) {
    const interno = (f['User Extension'] || '').trim();
    const nombre = (f['Display Name'] || '').trim().replace(/\s+/g, ' ');
    if (!interno || !nombre) continue;
    if (vistos.has(interno)) {
      console.warn(`Aviso: interno duplicado en el CSV, se omite: ${interno} (${nombre})`);
      continue;
    }
    vistos.add(interno);
    lista.push({
      id: crypto.randomUUID(),
      interno,
      nombre,
      sector: asignarSector(nombre),
      // Todos los internos se cargan como activos. El CSV de FreePBX trae
      // "Call Waiting = DISABLED" en algunos, pero eso no significa que el
      // interno este dado de baja; el estado se maneja desde el dashboard.
      estado: 'activo',
      notas: '',
    });
  }

  await mkdir(DIR_DATOS, { recursive: true });
  const store = {
    version: 1,
    actualizado: new Date().toISOString(),
    sectores: [...new Set(lista.map((e) => e.sector))].sort((a, b) => a.localeCompare(b, 'es')),
    extensiones: lista,
  };
  await writeFile(ARCHIVO, JSON.stringify(store, null, 2), 'utf8');

  const porSector = {};
  for (const e of lista) porSector[e.sector] = (porSector[e.sector] || 0) + 1;
  return { archivo: ARCHIVO, total: lista.length, porSector };
}

// Solo corre como programa si se invoca directamente (node tools/seed.mjs).
const esPuntoDeEntrada = (() => {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (esPuntoDeEntrada) {
  if (!existsSync(CSV)) {
    console.error(`No se encontro ${CSV}`);
    process.exit(1);
  }
  sembrar()
    .then((r) => {
      console.log(`Generado ${path.relative(RAIZ, r.archivo)} con ${r.total} internos.\n`);
      for (const [s, n] of Object.entries(r.porSector).sort()) {
        console.log(`  ${String(n).padStart(3)}  ${s}`);
      }
    })
    .catch((e) => { console.error(e); process.exit(1); });
}

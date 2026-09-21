/**
 * Respalda data/telefonos.json con fecha y hora en el nombre.
 *
 * Uso:
 *   node tools/respaldar.mjs            -> crea el respaldo
 *   node tools/respaldar.mjs --listar   -> muestra los respaldos que hay
 *
 * Conserva los ultimos 30 y borra los mas viejos, para que la carpeta no crezca
 * sin control. Nunca toca data/telefonos.json.
 */
import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join(RAIZ, 'data', 'telefonos.json');
const DIR_RESPALDOS = path.join(RAIZ, 'data', 'respaldos');
const MAXIMOS = 30;

const listar = async () => {
  if (!existsSync(DIR_RESPALDOS)) return [];
  const archivos = (await readdir(DIR_RESPALDOS)).filter((f) => f.endsWith('.json'));
  const conFecha = await Promise.all(archivos.map(async (f) => {
    const ruta = path.join(DIR_RESPALDOS, f);
    return { archivo: f, ruta, mtime: (await stat(ruta)).mtime };
  }));
  return conFecha.sort((a, b) => b.mtime - a.mtime);
};

if (process.argv.includes('--listar')) {
  const lista = await listar();
  if (!lista.length) console.log('No hay respaldos todavia.');
  else {
    console.log(`${lista.length} respaldo(s) en data/respaldos:\n`);
    for (const r of lista) {
      const j = JSON.parse(await readFile(r.ruta, 'utf8'));
      console.log(`  ${r.archivo}  ${j.extensiones.length} internos, ${j.sectores.length} sectores`);
    }
  }
  process.exit(0);
}

if (!existsSync(ORIGEN)) {
  console.error('No existe data/telefonos.json');
  process.exit(1);
}

const datos = JSON.parse(await readFile(ORIGEN, 'utf8'));
const ahora = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`
  + `_${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;

await mkdir(DIR_RESPALDOS, { recursive: true });
const destino = path.join(DIR_RESPALDOS, `telefonos-${stamp}.json`);
await writeFile(destino, JSON.stringify(datos, null, 2), 'utf8');

console.log(`Respaldo creado: data/respaldos/telefonos-${stamp}.json`);
console.log(`  ${datos.extensiones.length} internos, ${datos.sectores.length} sectores, v${datos.version}`);
console.log(`  activos: ${datos.extensiones.filter((e) => e.estado === 'activo').length}`);

// Rotacion: se conservan los MAXIMOS mas recientes.
const lista = await listar();
if (lista.length > MAXIMOS) {
  for (const viejo of lista.slice(MAXIMOS)) {
    await rm(viejo.ruta, { force: true });
    console.log(`  (borrado el respaldo viejo ${viejo.archivo})`);
  }
}

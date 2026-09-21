/**
 * Simulacro: calcula a que sector iria cada interno que hoy esta mal en
 * "HOGAR DE ANCIANOS", segun las reglas de nombre (tools/sectores.mjs) y
 * segun la foto de las 12:00. NO modifica nada.
 *
 * Uso:  node tools/simular-hogar.mjs
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asignarSector } from './sectores.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = async (f) => JSON.parse(await readFile(path.join(RAIZ, 'data', f), 'utf8'));

const hoy = await leer('telefonos.json');
const mediodia = await leer('telefonos-hoy-1200.json');

const sectorMediodia = new Map(mediodia.extensiones.map((e) => [e.interno, e.sector]));
const sectoresActuales = new Set(hoy.sectores);
const hogarHoy = hoy.extensiones.filter((e) => e.sector === 'HOGAR DE ANCIANOS');

// Los que si pertenecen al Hogar: su nombre lo dice.
const esDelHogar = (nombre) => /hogar|anciano/i.test(nombre);
const seQuedan = hogarHoy.filter((e) => esDelHogar(e.nombre));
const aMover = hogarHoy.filter((e) => !esDelHogar(e.nombre));

console.log(`HOGAR DE ANCIANOS hoy: ${hogarHoy.length} internos`);
console.log(`  se quedan (el nombre lo indica): ${seQuedan.length}`);
for (const e of seQuedan) console.log(`    ${e.interno.padStart(4)}  ${e.nombre}`);
console.log(`  a reubicar: ${aMover.length}\n`);

console.log('A DONDE IRIA CADA UNO:');
console.log('  interno  nombre                                  por-nombre                  a-mediodia(12:00)');
console.log('  ' + '-'.repeat(104));

const destinoNombre = new Map();
const destinoMediodia = new Map();
let nombreInexistente = 0;
let mediodiaInexistente = 0;

for (const e of aMover) {
  const porNombre = asignarSector(e.nombre);
  const previo = sectorMediodia.get(e.interno) || '(no estaba)';
  const nombreOk = sectoresActuales.has(porNombre);
  const mediodiaOk = sectoresActuales.has(previo);
  if (!nombreOk) nombreInexistente += 1;
  if (!mediodiaOk) mediodiaInexistente += 1;
  destinoNombre.set(porNombre, (destinoNombre.get(porNombre) || 0) + 1);
  destinoMediodia.set(previo, (destinoMediodia.get(previo) || 0) + 1);
  console.log(`  ${e.interno.padStart(7)}  ${e.nombre.slice(0, 38).padEnd(38)}  `
    + `${(nombreOk ? porNombre : `${porNombre} (NO EXISTE)`).slice(0, 26).padEnd(26)}  `
    + `${mediodiaOk ? previo : `${previo} (NO EXISTE)`}`);
}

console.log('\nRESUMEN POR REGLAS DE NOMBRE:');
for (const [s, n] of [...destinoNombre.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${s}${sectoresActuales.has(s) ? '' : '   <-- no existe hoy'}`);
}
console.log(`\nRESUMEN POR LA FOTO DE LAS 12:00:`);
for (const [s, n] of [...destinoMediodia.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${s}${sectoresActuales.has(s) ? '' : '   <-- no existe hoy'}`);
}

console.log(`\n(por nombre, ${nombreInexistente} irian a sectores que hoy no existen)`);
console.log(`(por la foto, ${mediodiaInexistente} irian a sectores que hoy no existen)`);

/**
 * Diagnostico: compara los sectores guardados contra lo que asignarian las
 * reglas de nombre (tools/sectores.mjs). Sirve para entender por que un sector
 * aparece con internos de mas.
 *
 * Uso:  node tools/diagnosticar-sectores.mjs
 * No modifica nada: solo lee y compara.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asignarSector } from './sectores.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = JSON.parse(await readFile(path.join(RAIZ, 'data', 'telefonos.json'), 'utf8'));

const porSector = new Map();
for (const e of datos.extensiones) {
  if (!porSector.has(e.sector)) porSector.set(e.sector, []);
  porSector.get(e.sector).push(e);
}

console.log(`internos: ${datos.extensiones.length} | sectores: ${datos.sectores.length}\n`);
console.log('SECTORES ACTUALES (por cantidad):');
for (const [sector, lista] of [...porSector.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(lista.length).padStart(3)}  ${sector}`);
}

// Que internos tienen un sector que NO coincide con su nombre segun las reglas.
const discrepancias = datos.extensiones
  .map((e) => ({ interno: e.interno, nombre: e.nombre, guardado: e.sector, regla: asignarSector(e.nombre) }))
  .filter((x) => x.guardado !== x.regla);

console.log(`\nINTERNOS CON SECTOR DISTINTO AL QUE SUGIERE SU NOMBRE: ${discrepancias.length} de ${datos.extensiones.length}`);
console.log('(esto es normal si los reasignaste a mano; el problema es si el numero es enorme)\n');

const porRegla = new Map();
for (const d of discrepancias) {
  if (!porRegla.has(d.regla)) porRegla.set(d.regla, []);
  porRegla.get(d.regla).push(d);
}
for (const [regla, lista] of [...porRegla.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  las reglas los mandarian a "${regla}": ${lista.length}`);
}

console.log('\nDETALLE (primeros 60):');
for (const d of discrepancias.slice(0, 60)) {
  console.log(`  ${d.interno.padStart(4)}  ${d.nombre.slice(0, 38).padEnd(38)} guardado="${d.guardado}" regla="${d.regla}"`);
}

// Cuantos irian a parar a cada sector si se re-clasificara todo por nombre.
const destinoReglas = new Map();
for (const e of datos.extensiones) {
  const r = asignarSector(e.nombre);
  destinoReglas.set(r, (destinoReglas.get(r) || 0) + 1);
}
console.log('\nSI SE RECLASIFICARA TODO POR NOMBRE, quedaria asi:');
for (const [sector, n] of [...destinoReglas.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${sector}`);
}

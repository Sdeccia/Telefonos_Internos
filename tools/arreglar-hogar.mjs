/**
 * Reparte los internos mal ubicados en "HOGAR DE ANCIANOS" entre los sectores
 * que ya existen, segun lo que su nombre indica.
 *
 * Uso:
 *   node tools/arreglar-hogar.mjs            -> simulacro (no cambia nada)
 *   node tools/arreglar-hogar.mjs --aplicar  -> aplica los cambios
 *
 * Los que pertenecen al Hogar (el nombre lo dice) se quedan donde estan.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO = path.join(RAIZ, 'data', 'telefonos.json');
const APLICAR = process.argv.includes('--aplicar');

const datos = JSON.parse(await readFile(ARCHIVO, 'utf8'));

/** Los que si son del Hogar: su nombre lo dice. */
const esDelHogar = (nombre) => /hogar|anciano/i.test(nombre);

/**
 * Destino segun el nombre, usando los sectores que YA existen.
 * El orden importa: gana la primera que coincide.
 */
function destino(nombre) {
  const n = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (esDelHogar(nombre)) return 'HOGAR DE ANCIANOS';
  if (/^consultorio|consultorio (medico|[0-9])/.test(n)) return 'CONSULTORIOS';
  if (/direccion|directora|sub ?director|juridic|secretaria|administrador/.test(n)) return 'DIRECCION / ADMINISTRACION';
  if (/quimica|farmacia|dosis/.test(n)) return 'FARMACIA';
  if (/contaduria|gerencia financiera|patrimonial|sueldos|dahiana|^andrea$|^martin$/.test(n)) return 'CONTADURIA';
  if (/compras|centro materiales|jaqueline|rosana|roxana|rosario|sorayda|monica/.test(n)) return 'COMPRAS';
  if (/recaudacion|despacho ventanilla/.test(n)) return 'RECAUDACION / CAJA';
  if (/enfermeria|policlinicas/.test(n)) return 'ENFERMERIA';
  if (/laboratorio|anatomia/.test(n)) return 'LABORATORIO';
  if (/rayos|tomografo|cardiol/.test(n)) return 'IMAGENOLOGIA';
  if (/banco sangre|sanatorio|block quirurgico|quimioterapia|sala mixta|sala ninos|uce/.test(n)) return 'INTERNACION / QUIRURGICO';
  if (/telemedicina/.test(n)) return 'TELEMEDICINA';
  if (/psiquiatr/.test(n)) return 'PSIQUIATRIA';
  if (/rack|deposito|general/.test(n)) return 'DEPOSITO / ALMACEN';
  if (/asistencia integral|tania|liliana|ivonne|at usuario/.test(n)) return 'ATENCION AL USUARIO';
  if (/reanim|urgencia/.test(n)) return 'URGENCIAS';
  if (/seguridad|porteria/.test(n)) return 'SERVICIOS';
  return 'Sin asignar';
}

const enHogar = datos.extensiones.filter((e) => e.sector === 'HOGAR DE ANCIANOS');
const seQuedan = enHogar.filter((e) => esDelHogar(e.nombre));
const aMover = enHogar.filter((e) => !esDelHogar(e.nombre));

const plan = aMover.map((e) => ({ ...e, nuevo: destino(e.nombre) }));

const resumen = new Map();
for (const p of plan) {
  if (!resumen.has(p.nuevo)) resumen.set(p.nuevo, []);
  resumen.get(p.nuevo).push(p);
}

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO'} - HOGAR DE ANCIANOS tiene ${enHogar.length} internos`);
console.log(`  se quedan: ${seQuedan.length} -> ${seQuedan.map((e) => e.interno).join(', ')}`);
console.log(`  se reubican: ${aMover.length}\n`);

console.log('PLAN (sectores que se crearian si no existen, marcados con +):');
const existentes = new Set(datos.sectores);
for (const [sector, lista] of [...resumen.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${existentes.has(sector) ? ' ' : '+'} ${sector}  (${lista.length})`);
  for (const p of lista.sort((x, y) => Number(x.interno) - Number(y.interno))) {
    console.log(`      ${String(p.interno).padStart(4)}  ${p.nombre}`);
  }
}

if (!APLICAR) {
  console.log('\n(Simulacro: no se cambio nada. Para aplicarlo:  node tools/arreglar-hogar.mjs --aplicar)');
  process.exit(0);
}

// Respaldo antes de tocar.
if (!existsSync(`${ARCHIVO}.previo-hogar`)) {
  await writeFile(`${ARCHIVO}.previo-hogar`, JSON.stringify(datos, null, 2), 'utf8');
  console.log(`\nRespaldo guardado en data/telefonos.json.previo-hogar`);
}

for (const p of plan) {
  const reg = datos.extensiones.find((e) => e.interno === p.interno);
  reg.sector = p.nuevo;
}

// El catalogo se completa con los sectores nuevos y se limpia de los vacios.
const enUso = new Set(datos.extensiones.map((e) => e.sector));
for (const s of enUso) if (!datos.sectores.includes(s)) datos.sectores.push(s);
datos.sectores = datos.sectores.filter((s) => enUso.has(s));
datos.version = (datos.version || 0) + 1;
datos.actualizado = new Date().toISOString();

await writeFile(ARCHIVO, JSON.stringify(datos, null, 2), 'utf8');

const porSector = new Map();
for (const e of datos.extensiones) porSector.set(e.sector, (porSector.get(e.sector) || 0) + 1);
console.log('\nRESULTADO:');
for (const [s, n] of [...porSector.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${s}`);
}
console.log(`\ninternos: ${datos.extensiones.length} (deben seguir siendo 87)`);

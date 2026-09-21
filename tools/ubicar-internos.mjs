/**
 * Ubica los 87 internos en los 10 sectores definitivos.
 *
 * Uso:
 *   node tools/ubicar-internos.mjs            -> simulacro (no cambia nada)
 *   node tools/ubicar-internos.mjs --aplicar  -> aplica
 *
 * Solo cambia el campo `sector` de cada interno. Numeros, nombres y estado no se tocan.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO = path.join(RAIZ, 'data', 'telefonos.json');
const APLICAR = process.argv.includes('--aplicar');

/** Los sectores definitivos, en el orden en que deben quedar. */
const SECTORES = [
  'ASISTENCIALES',
  'CONSULTORIOS',
  'CONTADURIA',
  'COMPRAS',
  'FARMACIA',
  'ATENCION AL USUARIO',
  'EQUIPO DE GESTION',
  'REGISTROS MEDICOS',
  'SERVICIOS',
  'URGENCIAS',
  'MATERNIDAD',
  'IMAGENOLOGIA',
  'LABORATORIO',
  'INFORMATICA',
  'HOGAR DE ANCIANOS',
];

/**
 * Asignacion por numero de interno. Es lo mas explicito y auditable:
 * se ve de un vistazo quien va donde.
 */
const UBICACION = {
  // Atencion de pacientes y apoyo sin sector propio: enfermeria, internacion,
  // quirofano, recaudacion, deposito, telemedicina y psiquiatria.
  ASISTENCIALES: [
    106, 173,                          // Enfermeria
    123, 125, 128, 129, 131, 133, 156, // Internacion y quirofano
    109, 121,                          // Recaudacion y ventanilla
    108,                               // Deposito / rack
    117, 118,                          // Telemedicina y psiquiatria
  ],
  // Consultorios 01 al 13
  CONSULTORIOS: [102, 144, 157, 158, 159, 165, 166, 167, 171, 174, 175, 176],
  // Contaduria y sueldos
  CONTADURIA: [132, 142, 150, 161, 182, 183],
  // Compras y suministros
  COMPRAS: [111, 114, 124, 126, 154, 164],
  // Farmacia y consultas externas
  FARMACIA: [105, 141, 190],
  // Atencion al usuario
  'ATENCION AL USUARIO': [101, 113, 155],
  // Direccion, juridica, secretaria
  'EQUIPO DE GESTION': [127, 140, 152, 153, 162],
  // Archivos, agendas y RRHH
  'REGISTROS MEDICOS': [103, 104, 112, 115, 135, 136, 172, 191],
  // Central, cocina, lavanderia, economato, taller, lenceria
  SERVICIOS: [100, 119, 120, 134, 169, 177, 198, 199],
  URGENCIAS: [116, 145, 147, 148, 163],
  MATERNIDAD: [137, 146, 160, 168],
  IMAGENOLOGIA: [107, 130, 138, 143],
  LABORATORIO: [110, 122, 139, 170],
  INFORMATICA: [149, 151],
  'HOGAR DE ANCIANOS': [178, 179, 180],
};

const datos = JSON.parse(await readFile(ARCHIVO, 'utf8'));
const ubicacion = new Map();
for (const [sector, internos] of Object.entries(UBICACION)) {
  for (const n of internos) ubicacion.set(String(n), sector);
}

// Control: que ningun interno quede sin destino y que no haya numeros de mas.
const sinDestino = datos.extensiones.filter((e) => !ubicacion.has(e.interno));
const numerosDeMas = [...ubicacion.keys()].filter(
  (n) => !datos.extensiones.some((e) => e.interno === n)
);

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULACRO'} - ${datos.extensiones.length} internos en ${SECTORES.length} sectores\n`);

if (sinDestino.length) {
  console.log('SIN DESTINO (hay que decidir):');
  for (const e of sinDestino) console.log(`  ${e.interno}  ${e.nombre}`);
  console.log('');
}
if (numerosDeMas.length) {
  console.log(`AVISO: en la lista hay numeros que no existen: ${numerosDeMas.join(', ')}\n`);
}

// Reparto propuesto.
const reparto = new Map(SECTORES.map((s) => [s, []]));
for (const e of datos.extensiones) {
  const destino = ubicacion.get(e.interno);
  if (destino) reparto.get(destino).push(e);
}

let total = 0;
for (const sector of SECTORES) {
  const lista = reparto.get(sector).sort((a, b) => Number(a.interno) - Number(b.interno));
  total += lista.length;
  console.log(`[${sector}]  ${lista.length}`);
  console.log('   ' + lista.map((e) => `${e.interno}=${e.nombre}`).join('  |  '));
  console.log('');
}
console.log(`total ubicados: ${total} de ${datos.extensiones.length}`);

// Cambios respecto de hoy.
const cambios = datos.extensiones.filter((e) => ubicacion.has(e.interno) && e.sector !== ubicacion.get(e.interno));
console.log(`\nCAMBIOS DE SECTOR: ${cambios.length}`);
for (const e of cambios.sort((a, b) => Number(a.interno) - Number(b.interno))) {
  console.log(`  ${String(e.interno).padStart(4)}  ${e.nombre.slice(0, 34).padEnd(34)}  ${e.sector}  ->  ${ubicacion.get(e.interno)}`);
}

if (!APLICAR) {
  console.log('\n(Simulacro: no se cambio nada. Para aplicarlo:  node tools/ubicar-internos.mjs --aplicar)');
  process.exit(0);
}
if (sinDestino.length) {
  console.error('\nNo se aplica: hay internos sin destino.');
  process.exit(1);
}

if (!existsSync(`${ARCHIVO}.previo-ubicacion`)) {
  await writeFile(`${ARCHIVO}.previo-ubicacion`, JSON.stringify(datos, null, 2), 'utf8');
  console.log(`\nRespaldo: data/telefonos.json.previo-ubicacion`);
}

for (const e of datos.extensiones) {
  if (ubicacion.has(e.interno)) e.sector = ubicacion.get(e.interno);
}
datos.sectores = [...SECTORES];
datos.version = (datos.version || 0) + 1;
datos.actualizado = new Date().toISOString();
await writeFile(ARCHIVO, JSON.stringify(datos, null, 2), 'utf8');

console.log('\nAplicado.');

/**
 * Arma un entorno aislado para probar cambios de sectores sin tocar los datos reales.
 * Uso:  node tools/probar-renombre.mjs
 * Copia server.mjs, public/ y tools/ a una carpeta temporal, levanta ahi un servidor
 * en el puerto 5199 y ejecuta las pruebas contra esa copia.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(tmpdir(), 'prueba-sector-aislada');
const BASE = 'http://localhost:5199';
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(path.join(DESTINO, 'data'), { recursive: true });
for (const carpeta of ['public', 'tools']) {
  cpSync(path.join(RAIZ, carpeta), path.join(DESTINO, carpeta), { recursive: true });
}
copyFileSync(path.join(RAIZ, 'server.mjs'), path.join(DESTINO, 'server.mjs'));
copyFileSync(
  path.join(RAIZ, 'data', 'telefonos.json'),
  path.join(DESTINO, 'data', 'telefonos.json')
);
// El seed no hace falta en la copia: el servidor solo necesita el JSON.
console.log(`Entorno aislado: ${DESTINO}\n`);

const servidor = spawn(process.execPath, ['server.mjs'], {
  cwd: DESTINO,
  env: { ...process.env, PORT: '5199', HOST: '127.0.0.1' },
  stdio: 'ignore',
});

const pedir = async (metodo, ruta, cuerpo) => {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  return { status: r.status, datos };
};

const pruebas = [];
const anotar = (nombre, ok, detalle = '') => {
  pruebas.push(ok);
  console.log(`${ok ? 'OK  ' : 'FALLA'}  ${nombre}${detalle ? `  -> ${detalle}` : ''}`);
};

try {
  // Espera a que el servidor aislado responda.
  let listo = false;
  for (let i = 0; i < 40 && !listo; i++) {
    try {
      const r = await fetch(`${BASE}/api/estado`);
      listo = r.ok;
    } catch { /* todavia no */ }
    if (!listo) await dormir(250);
  }
  if (!listo) throw new Error('el servidor aislado no arranco');

  const inicial = (await pedir('GET', '/api/sectores')).datos;
  console.log(`catalogo inicial: ${inicial.sectores.length} sectores\n`);

  // 1. Renombrar: los internos siguen al nombre nuevo.
  const antes = (await pedir('GET', '/api/extensiones?sector=Consultorios')).datos.total;
  const r1 = await pedir('PUT', '/api/sectores/Consultorios', { nombre: 'Consultorios Externos' });
  const despues = (await pedir('GET', '/api/extensiones?sector=Consultorios Externos')).datos;
  anotar('renombrar un sector mueve sus internos',
    r1.status === 200 && r1.datos.movidos === antes && despues.total === antes,
    `"Consultorios" -> "Consultorios Externos": ${r1.datos.movidos} internos`);

  // 2. Corregir un nombre mal escrito (con acento).
  const r2 = await pedir('PUT', '/api/sectores/Anatomia Patologica', { nombre: 'Anatomía Patológica' });
  const existe = (await pedir('GET', '/api/sectores')).datos.sectores.some((s) => s.sector === 'Anatomía Patológica');
  anotar('se puede corregir la ortografia del nombre',
    r2.status === 200 && existe && r2.datos.movidos === 1,
    '"Anatomia Patologica" -> "Anatomía Patológica"');

  // 3. Nombre vacio: se rechaza.
  const r3 = await pedir('PUT', '/api/sectores/UCE', { nombre: '   ' });
  anotar('rechaza un nombre vacio', r3.status === 400, r3.datos.error);

  // 4. Renombrar a un nombre existente: fusiona.
  const r4 = await pedir('PUT', '/api/sectores/Consultorios Externos', { nombre: 'UCE' });
  anotar('renombrar a un nombre existente fusiona los sectores',
    r4.status === 200 && r4.datos.fusionado === true,
    `${r4.datos.movidos} internos pasaron a UCE`);

  // 5. El interno conserva todos sus datos al cambiar de sector.
  const uno = (await pedir('GET', '/api/extensiones?q=102')).datos.extensiones[0];
  anotar('los internos conservan numero, nombre y estado',
    uno.interno === '102' && uno.nombre === 'Consultorio 02 - ASociales' && uno.estado === 'activo',
    `${uno.interno} ${uno.nombre} [${uno.sector}] ${uno.estado}`);

  // 6. Renombrar el sector protegido: se rechaza.
  const r6 = await pedir('PUT', '/api/sectores/Sin asignar', { nombre: 'Otro' });
  anotar('no se puede renombrar el sector protegido', r6.status === 400, r6.datos.error);
} finally {
  servidor.kill();
  await dormir(300);
}

const fallas = pruebas.filter((p) => !p).length;
console.log(`\n${pruebas.length - fallas}/${pruebas.length} pruebas OK`);
if (fallas) process.exitCode = 1;

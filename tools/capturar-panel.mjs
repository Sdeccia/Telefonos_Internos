/**
 * Captura el panel de sectores con orden manual y algunos colores fijos.
 * Uso:  node tools/capturar-panel.mjs [urlBase]
 *
 * OJO: aplica colores de ejemplo, asi que por defecto trabaja contra una copia
 * aislada del servidor (puerto 5197) para no ensuciar los datos reales.
 * Para capturar el servidor real:  node tools/capturar-panel.mjs http://localhost:5173
 */
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, copyFileSync, cpSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO_PRUEBA = 5197;
const DIR_PRUEBA = path.join(tmpdir(), 'internos-captura');
const BASE = process.argv[2] || `http://127.0.0.1:${PUERTO_PRUEBA}`;
const AISLADO = !process.argv[2];
const PUERTO = 9334;
const PERFIL = path.join(tmpdir(), 'internos-chrome-captura');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

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

async function conectar() {
  for (let i = 0; i < 60; i++) {
    try {
      const lista = await fetch(`http://127.0.0.1:${PUERTO}/json/list`).then((r) => r.json());
      const pagina = lista.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      if (pagina) {
        const ws = new WebSocket(pagina.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.addEventListener('open', res, { once: true });
          ws.addEventListener('error', () => rej(new Error('ws')), { once: true });
        });
        let id = 0;
        const pend = new Map();
        ws.addEventListener('message', (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pend.has(m.id)) {
            const { resolver, rechazar } = pend.get(m.id);
            pend.delete(m.id);
            m.error ? rechazar(new Error(m.error.message)) : resolver(m.result);
          }
        });
        const enviar = (metodo, params = {}) => new Promise((resolver, rechazar) => {
          const n = ++id;
          pend.set(n, { resolver, rechazar });
          ws.send(JSON.stringify({ id: n, method: metodo, params }));
        });
        return {
          enviar,
          evaluar: async (expr) => (await enviar('Runtime.evaluate', {
            expression: expr, returnByValue: true, awaitPromise: true,
          })).result.value,
          async captura(archivo, alto) {
            await enviar('Emulation.setDeviceMetricsOverride', {
              width: 1400, height: alto, deviceScaleFactor: 1, mobile: false,
            });
            await dormir(300);
            const r = await enviar('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(RAIZ, archivo), Buffer.from(r.data, 'base64'));
          },
        };
      }
    } catch { /* todavia no responde */ }
    await dormir(250);
  }
  throw new Error('Chrome no expuso el puerto de depuracion');
}

const chrome = spawn(EXE, [
  '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run',
  `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  '--window-size=1400,1200', 'about:blank',
], { stdio: 'ignore' });

let servidorPrueba = null;

try {
  if (AISLADO) {
    prepararEntornoAislado();
    servidorPrueba = spawn(process.execPath, ['server.mjs'], {
      cwd: DIR_PRUEBA,
      env: { ...process.env, PORT: String(PUERTO_PRUEBA), HOST: '127.0.0.1' },
      stdio: 'ignore',
    });
    let listo = false;
    for (let i = 0; i < 60 && !listo; i++) {
      try { listo = (await fetch(`${BASE}/api/estado`)).ok; } catch { /* todavia no */ }
      if (!listo) await dormir(250);
    }
    if (!listo) throw new Error('la copia del servidor no arranco');
    console.log(`Capturando desde una copia aislada: ${BASE}`);
  }

  const cdp = await conectar();
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Page.navigate', { url: BASE });
  await dormir(2500);

  // Se colorean los primeros sectores reales, para que se vea la funcion.
  const catalogo = await fetch(`${BASE}/api/sectores`).then((r) => r.json());
  const paleta = ['#c2410c', '#0e7490', '#15803d', '#6d28d9', '#b45309'];
  const elegidos = catalogo.sectores.slice(0, paleta.length).map((s, i) => [s.sector, paleta[i]]);
  for (const [sector, color] of elegidos) {
    const r = await fetch(`${BASE}/api/sectores/${encodeURIComponent(sector)}/color`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    });
    if (!r.ok) console.warn(`No se pudo colorear "${sector}": ${r.status}`);
  }

  await cdp.enviar('Page.navigate', { url: BASE });
  await dormir(2500);
  await cdp.evaluar("document.querySelector('#btnSectores').click()");
  await dormir(500);

  // Se muestra el primer sector coloreado (el panel arranca arriba, ya visible).
  await cdp.evaluar(`(() => {
    const env = document.querySelector('.tabla-envoltura.en-modal');
    const fila = document.querySelector('#cuerpoSectores tr[data-sector]');
    if (env && fila) env.scrollTop = 0;
  })()`);
  await dormir(400);

  // Comprueba que los colores fijos esten realmente pintados.
  // Ojo: el color automatico tambien es un estilo inline, asi que se busca
  // exactamente el valor hex que se asigno.
  const esperados = elegidos.map(([sector, color]) => {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return { sector, rgb: `rgb(${r}, ${g}, ${b})` };
  });
  const encontrados = JSON.parse(await cdp.evaluar(`JSON.stringify(
    [...document.querySelectorAll('#cuerpoSectores tr[data-sector]')].map(
      (f) => f.dataset.sector + '|' + f.querySelector('.btn-color').style.background
    )
  )`));
  const faltan = esperados.filter(({ sector, rgb }) => !encontrados.includes(`${sector}|${rgb}`));
  console.log(`sectores con color fijo aplicado: ${esperados.length - faltan.length}/${esperados.length}`);
  for (const { sector, rgb } of esperados) {
    console.log(`  ${faltan.some((f) => f.sector === sector) ? 'FALTA' : 'OK  '}  ${sector} = ${rgb}`);
  }

  await cdp.captura('captura-sectores-panel.png', 1120);
  console.log('captura-sectores-panel.png actualizada');
} finally {
  chrome.kill();
  if (servidorPrueba) servidorPrueba.kill();
  await dormir(400);
  if (AISLADO) rmSync(DIR_PRUEBA, { recursive: true, force: true });
}

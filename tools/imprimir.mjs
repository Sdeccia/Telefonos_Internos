/**
 * Genera el HTML del directorio para imprimir.
 * Se renderiza en el servidor a proposito: asi el PDF no depende de que el
 * navegador termine de ejecutar JavaScript antes de imprimir.
 */

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const comparar = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });

export function describirFiltros({ q, sector, estado, orden }) {
  const partes = [];
  if (sector) partes.push(`Sector: ${sector}`);
  if (estado) partes.push(estado === 'activo' ? 'Solo activos' : 'Solo inactivos');
  if (q) partes.push(`Busqueda: "${q}"`);
  partes.push(`Orden: ${orden === 'nombre' ? 'nombre' : orden === 'sector' ? 'sector' : 'numero'}`);
  return partes.join(' · ');
}

function filaHTML(e, conNotas) {
  const inactivo = e.estado === 'inactivo';
  return `<tr class="${inactivo ? 'inactivo' : ''}">
    <td class="num">${escapar(e.interno)}</td>
    <td>${escapar(e.nombre)}${inactivo ? ' <span class="etq-inactivo">inactivo</span>' : ''}</td>
    ${conNotas ? `<td class="notas">${escapar(e.notas)}</td>` : ''}
  </tr>`;
}

/** Agrupa por sector respetando el orden del catalogo. */
function agrupar(internos, catalogo) {
  const porSector = new Map();
  for (const e of internos) {
    if (!porSector.has(e.sector)) porSector.set(e.sector, []);
    porSector.get(e.sector).push(e);
  }
  const orden = new Map(catalogo.map((s, i) => [s.sector, i]));
  return [...porSector.entries()].sort((a, b) => {
    const ia = orden.has(a[0]) ? orden.get(a[0]) : 9999;
    const ib = orden.has(b[0]) ? orden.get(b[0]) : 9999;
    return ia - ib || comparar(a[0], b[0]);
  });
}

const ESTILOS = `
  :root { --texto:#16202e; --gris:#5b6678; --linea:#c8d0dc; --suave:#eef1f6; }
  * { box-sizing:border-box; }
  body { margin:0; padding:0; font-family:"Segoe UI",Roboto,system-ui,sans-serif; color:var(--texto); background:#fff; font-size:10.5pt; }
  .acciones { position:sticky; top:0; z-index:10; display:flex; gap:8px; flex-wrap:wrap; align-items:center;
    background:#1b2534; color:#fff; padding:10px 14px; font-size:10pt; }
  .acciones .crecer { flex:1; }
  .acciones button, .acciones a { font:inherit; padding:7px 13px; border-radius:7px; border:1px solid rgba(255,255,255,.25);
    background:rgba(255,255,255,.08); color:#fff; cursor:pointer; text-decoration:none; }
  .acciones button:hover, .acciones a:hover { background:rgba(255,255,255,.18); }
  .acciones .principal { background:#1f5fd1; border-color:#1f5fd1; font-weight:600; }
  .hoja { max-width:900px; margin:0 auto; padding:28px 32px 40px; }
  .cab { border-bottom:2.5px solid var(--texto); padding-bottom:10px; margin-bottom:16px;
    display:flex; justify-content:space-between; align-items:flex-end; gap:20px; flex-wrap:wrap; }
  .cab h1 { margin:0; font-size:16pt; letter-spacing:-.3px; }
  .cab .sub { color:var(--gris); font-size:9.5pt; margin-top:3px; }
  .cab .meta { text-align:right; font-size:9pt; color:var(--gris); line-height:1.5; }
  .sector { margin-bottom:14px; break-inside:avoid; page-break-inside:avoid; }
  .sector h2 { margin:0 0 5px; font-size:10pt; text-transform:uppercase; letter-spacing:.6px;
    padding:3px 7px; border-left:4px solid var(--texto); background:var(--suave);
    display:flex; justify-content:space-between; gap:10px; }
  .sector h2 .cuenta { font-weight:400; text-transform:none; letter-spacing:0; color:var(--gris); }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:7.5pt; text-transform:uppercase; letter-spacing:.5px; color:var(--gris);
    border-bottom:1px solid var(--linea); padding:3px 7px; }
  td { padding:3px 7px; border-bottom:1px solid #eaeef4; vertical-align:top; }
  td.num { font-family:Consolas,"Courier New",monospace; font-weight:700; font-size:10.5pt; width:72px; white-space:nowrap; }
  td.notas { color:var(--gris); font-size:9pt; }
  tr.inactivo td { color:#7b8494; }
  tr.inactivo td.num { text-decoration:line-through; }
  .etq-inactivo { font-size:7.5pt; border:1px solid var(--linea); border-radius:3px; padding:0 4px; color:var(--gris); vertical-align:middle; }
  .pie { margin-top:20px; border-top:1px solid var(--linea); padding-top:8px; font-size:8.5pt; color:var(--gris);
    display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .sin-resultados { padding:40px 0; text-align:center; color:var(--gris); }
  @page { size:A4; margin:14mm 12mm; }
  @media print {
    body { background:#fff; }
    .acciones { display:none !important; }
    .hoja { max-width:none; padding:0; }
    .sector h2 { background:#e8ebf0 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    thead { display:table-header-group; }
    tr { break-inside:avoid; page-break-inside:avoid; }
    a { color:inherit; text-decoration:none; }
  }
`;

/**
 * @param {object} opciones
 * @param {Array} opciones.internos  internos ya filtrados y ordenados
 * @param {Array} opciones.catalogo  catalogo de sectores (para el orden)
 * @param {object} opciones.filtros  { q, sector, estado, orden }
 * @param {string} opciones.consulta query string ya codificada (para los enlaces)
 */
export function renderDirectorio({ internos, catalogo, filtros, consulta }) {
  const activos = internos.filter((e) => e.estado === 'activo').length;
  const inactivos = internos.length - activos;
  const hayNotas = internos.some((e) => e.notas);
  const grupos = agrupar(internos, catalogo);

  const cuerpo = internos.length
    ? grupos.map(([nombre, lista]) => `<section class="sector">
        <h2>${escapar(nombre)} <span class="cuenta">${lista.length}</span></h2>
        <table>
          <thead><tr><th>Interno</th><th>Nombre</th>${hayNotas ? '<th>Notas</th>' : ''}</tr></thead>
          <tbody>${lista.map((e) => filaHTML(e, hayNotas)).join('')}</tbody>
        </table>
      </section>`).join('')
    : '<p class="sin-resultados">No hay internos que coincidan con los filtros.</p>';

  const conSector = new Set(internos.map((e) => e.sector)).size;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Directorio de internos${filtros.sector ? ` - ${escapar(filtros.sector)}` : ''}</title>
<style>${ESTILOS}</style>
</head>
<body>
<div class="acciones">
  <button class="principal" id="btnImprimir" type="button">Imprimir / Guardar como PDF</button>
  <a href="/api/imprimir.pdf${consulta ? `?${escapar(consulta)}` : ''}">Descargar PDF</a>
  <a href="/api/export.csv${consulta ? `?${escapar(consulta)}` : ''}">Exportar CSV</a>
  <span class="crecer"></span>
  <a href="/">Volver al dashboard</a>
</div>
<div class="hoja">
  <header class="cab">
    <div>
      <h1>Directorio de internos telefonicos</h1>
      <div class="sub">${escapar(describirFiltros(filtros))}</div>
    </div>
    <div class="meta">${internos.length} internos<br>${activos} activos · ${inactivos} inactivos</div>
  </header>
  <main>${cuerpo}</main>
  <footer class="pie">
    <span>${internos.length} internos en ${conSector} sectores</span>
    <span>Generado el ${new Date().toLocaleString('es')}</span>
  </footer>
</div>
<script>
  document.getElementById('btnImprimir').addEventListener('click', () => window.print());
</script>
</body>
</html>`;
}

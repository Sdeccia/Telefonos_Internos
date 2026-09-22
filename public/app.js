/* Dashboard de internos telefonicos - cliente */

const $ = (sel) => document.querySelector(sel);

const el = {
  subtitulo: $('#subtitulo'),
  guardado: $('#guardado'),
  kTotal: $('#kTotal'),
  kActivos: $('#kActivos'),
  kInactivos: $('#kInactivos'),
  kSectores: $('#kSectores'),
  kSinSector: $('#kSinSector'),
  q: $('#q'),
  limpiarQ: $('#limpiarQ'),
  sector: $('#sector'),
  estado: $('#estado'),
  orden: $('#orden'),
  btnLimpiarFiltros: $('#btnLimpiarFiltros'),
  btnNuevo: $('#btnNuevo'),
  btnOrganizar: $('#btnOrganizar'),
  btnExportar: $('#btnExportar'),
  btnImprimir: $('#btnImprimir'),
  btnPdf: $('#btnPdf'),
  btnSectores: $('#btnSectores'),
  btnAdmin: $('#btnAdmin'),
  fUsuario: $('#fUsuario'),
  modalAdmin: $('#modalAdmin'),
  formAdmin: $('#formAdmin'),
  fPassword: $('#fPassword'),
  errorAdmin: $('#errorAdmin'),
  estadoAdmin: $('#estadoAdmin'),
  btnLogin: $('#btnLogin'),
  btnLogout: $('#btnLogout'),
  btnCerrarAdmin: $('#btnCerrarAdmin'),
  btnCerrarAdmin2: $('#btnCerrarAdmin2'),
  modalSectores: $('#modalSectores'),
  btnCerrarSectores: $('#btnCerrarSectores'),
  btnCerrarSectores2: $('#btnCerrarSectores2'),
  formSector: $('#formSector'),
  nuevoSector: $('#nuevoSector'),
  errorSector: $('#errorSector'),
  pistaSectores: $('#pistaSectores'),
  pieSectores: $('#pieSectores'),
  cuerpoSectores: $('#cuerpoSectores'),
  btnOrdenar: $('#btnOrdenar'),
  vistaSectores: $('#vistaSectores'),
  vistaLista: $('#vistaLista'),
  cuerpoTabla: $('#cuerpoTabla'),
  vacio: $('#vacio'),
  pieInfo: $('#pieInfo'),
  modal: $('#modal'),
  modalTitulo: $('#modalTitulo'),
  form: $('#form'),
  fInterno: $('#fInterno'),
  fNombre: $('#fNombre'),
  fSector: $('#fSector'),
  fEstado: $('#fEstado'),
  fNotas: $('#fNotas'),
  listaSectores: $('#listaSectores'),
  errorForm: $('#errorForm'),
  btnEliminar: $('#btnEliminar'),
  btnGuardar: $('#btnGuardar'),
  btnCancelar: $('#btnCancelar'),
  btnCerrar: $('#btnCerrar'),
  avisos: $('#avisos'),
  dashboardVista: $('#dashboardVista'),
  moduloContactos: $('#moduloContactos'),
  moduloGuardias: $('#moduloGuardias'),
  moduloVisorGuardias: $('#moduloVisorGuardias'),
  moduloFlores: $('#moduloFlores'),
  moduloSalud: $('#moduloSalud'),
  tablaContactos: $('#tablaContactos'),
  tablaGuardias: $('#tablaGuardias'),
  tablaVisorGuardias: $('#tablaVisorGuardias'),
  visorGuardiasFecha: $('#visorGuardiaFecha'),
  imprimirVisorGuardias: $('#imprimirVisorGuardias'),
  visorGuardiasVacio: $('#visorGuardiasVacio'),
  tablaFlores: $('#tablaFlores'),
  tablaSalud: $('#tablaSalud'),
  formGuardia: $('#formGuardia'),
  exportarGuardias: $('#exportarGuardias'),
  imprimirGuardias: $('#imprimirGuardias'),
  guardiaFecha: $('#guardiaFecha'),
  guardiaTurno: $('#guardiaTurno'),
  guardiaRol: $('#guardiaRol'),
  guardiaContacto: $('#guardiaContacto'),
  guardiaNotas: $('#guardiaNotas'),
};

const estado = {
  q: '',
  sector: '',
  sectorActivo: '',
  estado: '',
  orden: 'interno',
  vista: 'sectores',
  lista: [],
  resumen: null,
  editando: null,
  sectorEditando: null,
  colorEditando: null,
  arrastrando: null,
  expandidos: new Set(),
  admin: false,
  rol: null,
  modulo: 'dashboard',
  contactos: [],
  guardias: [],
  flores: [],
  salud: [],
};

const POR_PAGINA = 5;

/* ------------------------------------------------------------------- utils */

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function sinAcentos(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Escapa y resalta las palabras buscadas. */
function resaltar(texto, consulta) {
  const base = escapar(texto);
  const palabras = sinAcentos(consulta).split(/\s+/).filter((p) => p.length > 1);
  if (!palabras.length) return base;

  const plano = sinAcentos(base);
  const marcas = [];
  for (const palabra of palabras) {
    let desde = 0;
    let i;
    while ((i = plano.indexOf(palabra, desde)) !== -1) {
      marcas.push([i, i + palabra.length]);
      desde = i + palabra.length;
    }
  }
  if (!marcas.length) return base;

  // Une rangos superpuestos y arma el HTML en una sola pasada (indices intactos).
  marcas.sort((a, b) => a[0] - b[0]);
  const unidas = [marcas[0]];
  for (const [ini, fin] of marcas.slice(1)) {
    const ultimo = unidas[unidas.length - 1];
    if (ini <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fin);
    else unidas.push([ini, fin]);
  }

  let salida = '';
  let cursor = 0;
  for (const [ini, fin] of unidas) {
    salida += base.slice(cursor, ini) + '<mark>' + base.slice(ini, fin) + '</mark>';
    cursor = fin;
  }
  return salida + base.slice(cursor);
}

function colorSector(nombre) {
  // Si el sector tiene un color fijo asignado, se usa ese.
  const fijo = estado.resumen?.sectores?.find((s) => s.sector === nombre)?.color;
  if (fijo) return fijo;
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 58% 48%)`;
}

const PALETA = [
  '#1f5fd1', '#0e7490', '#0f766e', '#15803d', '#4d7c0f', '#a16207',
  '#b45309', '#c2410c', '#be123c', '#a21caf', '#6d28d9', '#475569',
];

/** Comparador alfabetico en espanol: sin distinguir mayusculas ni acentos. */
const comparador = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function aviso(mensaje, tipo = '') {
  const div = document.createElement('div');
  div.className = `aviso ${tipo}`;
  div.textContent = mensaje;
  el.avisos.appendChild(div);
  setTimeout(() => div.remove(), 3800);
}

function marcarGuardado() {
  const ahora = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.guardado.textContent = `Guardado ${ahora}`;
  el.guardado.hidden = false;
  clearTimeout(marcarGuardado._t);
  marcarGuardado._t = setTimeout(() => { el.guardado.hidden = true; }, 4000);
}

/* --------------------------------------------------------------------- API */

async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, {
    headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opciones,
  });
  const tipo = respuesta.headers.get('content-type') || '';
  const datos = tipo.includes('json') ? await respuesta.json() : await respuesta.text();
  if (!respuesta.ok) {
    if (respuesta.status === 401) {
      estado.admin = false;
      actualizarAdmin();
      abrirAdmin();
    }
    const error = new Error((datos && datos.error) || `Error ${respuesta.status}`);
    error.status = respuesta.status;
    throw error;
  }
  return datos;
}

function abrirAdmin() {
  el.errorAdmin.hidden = true;
  el.fPassword.value = '';
  el.modalAdmin.hidden = false;
  el.fPassword.focus();
}

function cerrarAdmin() { el.modalAdmin.hidden = true; }

function actualizarAdmin() {
  el.btnAdmin.textContent = estado.admin ? `${estado.rol} (activo)` : 'Acceso';
  el.btnAdmin.classList.toggle('primario', estado.admin);
  el.estadoAdmin.textContent = estado.admin
    ? 'Sesión activa. Puedes modificar los datos.'
    : 'La consulta es pública. Inicia sesión para modificar datos.';
  el.btnLogin.hidden = estado.admin;
  el.fPassword.hidden = estado.admin;
  el.btnLogout.hidden = !estado.admin;
  document.querySelectorAll('[data-restringido]').forEach((b) => { b.hidden = !puedePrivado(); });
  document.querySelectorAll('.solo-admin').forEach((b) => { b.hidden = !estado.admin; });
}

async function cargarAuth() {
  const r = await pedir('/api/auth/estado');
  estado.rol = r.rol;
  estado.admin = r.rol === 'administrador';
  actualizarAdmin();
}

async function asegurarAdmin() {
  if (estado.admin) return true;
  abrirAdmin();
  return false;
}

function puedePrivado() { return estado.rol === 'administrador' || estado.rol === 'telefonista'; }

function cambiarModulo(nombre) {
  if (['contactos', 'guardias'].includes(nombre) && !puedePrivado()) {
    abrirAdmin();
    return;
  }
  estado.modulo = nombre;
  el.dashboardVista.hidden = nombre !== 'dashboard';
  [el.moduloContactos, el.moduloGuardias, el.moduloVisorGuardias, el.moduloFlores, el.moduloSalud].forEach((vista) => { vista.hidden = true; });
  const vista = { contactos: el.moduloContactos, guardias: el.moduloGuardias, 'visor-guardias': el.moduloVisorGuardias, flores: el.moduloFlores, salud: el.moduloSalud }[nombre];
  if (vista) vista.hidden = false;
  document.querySelectorAll('[data-modulo]').forEach((b) => b.classList.toggle('activo', b.dataset.modulo === nombre));
  if (nombre !== 'dashboard') cargarModulo(nombre).catch((e) => aviso(e.message, 'mal'));
}

async function cargarModulo(nombre) {
  if (nombre === 'contactos') {
    const q = encodeURIComponent($('#buscarContactos').value || '');
    estado.contactos = (await pedir(`/api/contactos?q=${q}`)).contactos;
    el.tablaContactos.innerHTML = estado.contactos.map((c) => `<tr><td><strong>${escapar(c.nombre)}</strong><br><small>C.I. ${escapar(c.ci)}</small></td><td>${escapar(c.rol)}<br>${escapar(c.funcion)}</td><td>${escapar(c.celularPrincipal)}</td><td>${escapar(c.celularSecundario)}</td><td>${escapar(c.disponibilidad)} <button class="btn-mini peligro" data-borrar-contacto="${c.id}">Eliminar</button></td></tr>`).join('');
  }
  if (nombre === 'guardias') {
    const fecha = el.guardiaFecha.value || new Date().toISOString().slice(0, 10);
    el.guardiaFecha.value = fecha;
    el.exportarGuardias.href = `/api/guardias/export.csv?fecha=${encodeURIComponent(fecha)}`;
    el.imprimirGuardias.href = `/guardias/imprimir?fecha=${encodeURIComponent(fecha)}`;
    const [guardias, contactos] = await Promise.all([pedir(`/api/guardias?fecha=${fecha}`), pedir('/api/contactos')]);
    estado.guardias = guardias.guardias;
    estado.contactos = contactos.contactos;
    el.guardiaContacto.innerHTML = '<option value="">Funcionario</option>' + estado.contactos.map((c) => `<option value="${c.id}">${escapar(c.nombre)} - ${escapar(c.celularPrincipal)}</option>`).join('');
    el.tablaGuardias.innerHTML = estado.guardias.map((g) => `<tr><td>${escapar(g.fecha)}</td><td>${escapar(g.turno)}</td><td>${escapar(g.rolGuardia)}</td><td>${escapar(g.contactoNombre)}</td><td><a href="tel:${escapar(g.telefono)}">${escapar(g.telefono)}</a></td><td><button class="btn-mini peligro" data-borrar-guardia="${g.id}">Eliminar</button></td></tr>`).join('');
  }
  if (nombre === 'visor-guardias') {
    const fecha = el.visorGuardiasFecha.value || new Date().toISOString().slice(0, 10);
    el.visorGuardiasFecha.value = fecha;
    el.imprimirVisorGuardias.href = `/guardias/visor?fecha=${encodeURIComponent(fecha)}`;
    const r = await pedir(`/api/guardias/visor?fecha=${encodeURIComponent(fecha)}`);
    el.tablaVisorGuardias.innerHTML = r.guardias.map((g) => `<tr><td>${escapar(g.turno)}</td><td>${escapar(g.rolGuardia)}</td><td>${escapar(g.contactoNombre)}</td><td><a href="tel:${escapar(g.telefono)}">${escapar(g.telefono)}</a></td></tr>`).join('');
    el.visorGuardiasVacio.hidden = r.guardias.length !== 0;
  }
  if (nombre === 'flores') {
    const q = encodeURIComponent($('#buscarFlores').value || '');
    const categoria = encodeURIComponent($('#filtroFlores').value || '');
    const r = await pedir(`/api/directorio/flores?q=${q}`);
    estado.flores = r.registros.filter((x) => !categoria || x.categoria === categoria);
    el.tablaFlores.innerHTML = estado.flores.map((x) => `<tr><td>${escapar(x.categoria)}</td><td>${escapar(x.nombre)}</td><td><a href="tel:${escapar(x.telefono)}">${escapar(x.telefono)}</a></td><td>${escapar(x.servicio)}</td><td>${escapar(x.localidad)}</td><td>${estado.admin ? `<button class="btn-mini peligro" data-borrar-directorio="flores:${x.id}">Eliminar</button>` : ''}</td></tr>`).join('');
  }
  if (nombre === 'salud') {
    const p = new URLSearchParams({ q: $('#buscarSalud').value || '', departamento: $('#filtroDepartamento').value || '', tipo: $('#filtroTipo').value || '' });
    estado.salud = (await pedir(`/api/directorio/salud?${p}`)).registros;
    el.tablaSalud.innerHTML = estado.salud.map((x) => `<tr><td>${escapar(x.departamento)}</td><td>${escapar(x.tipoCentro)}</td><td>${escapar(x.nombre)}</td><td>${escapar(x.localidad)}</td><td>${escapar(x.telefonoCentral)}</td><td>${escapar(x.servicio)}</td><td>${estado.admin ? `<button class="btn-mini peligro" data-borrar-directorio="salud:${x.id}">Eliminar</button>` : ''}</td></tr>`).join('');
  }
}

async function nuevoContacto() {
  const nombre = prompt('Nombre completo:');
  if (!nombre) return;
  const celularPrincipal = prompt('Celular principal:');
  if (!celularPrincipal) return;
  await pedir('/api/contactos', { method: 'POST', body: JSON.stringify({ nombre, celularPrincipal, ci: prompt('C.I. (opcional):') || '', rol: prompt('Rol / especialidad:') || '', funcion: prompt('Funcion:') || '', celularSecundario: prompt('Celular secundario (opcional):') || '', disponibilidad: prompt('Disponibilidad / observaciones:') || '' }) });
  aviso('Contacto creado.', 'ok');
  await cargarModulo('contactos');
}

async function nuevoDirectorio(campo) {
  const nombre = prompt('Nombre:');
  if (!nombre) return;
  const telefono = prompt('Telefono:') || '';
  const registro = campo === 'flores'
    ? { nombre, telefono, categoria: prompt('Categoria (Emergencias, Salud, Institucionales / Fuerzas Vivas, Servicios):') || 'Servicios', servicio: prompt('Servicio:') || '', localidad: prompt('Localidad:') || 'Flores', notas: '' }
    : { nombre, departamento: prompt('Departamento:') || '', tipoCentro: prompt('Tipo de centro:') || '', localidad: prompt('Ciudad / localidad:') || '', telefonoCentral: telefono, servicio: prompt('Modulo / servicio:') || '' };
  await pedir(`/api/directorio/${campo}`, { method: 'POST', body: JSON.stringify(registro) });
  aviso('Registro agregado.', 'ok');
  await cargarModulo(campo);
}

function parametros() {
  const p = new URLSearchParams();
  if (estado.q) p.set('q', estado.q);
  // En la vista por sector se usa el filtro local (sectorActivo); en la lista, el del selector.
  const sector = estado.vista === 'sectores' ? estado.sectorActivo : estado.sector;
  if (sector) p.set('sector', sector);
  if (estado.estado) p.set('estado', estado.estado);
  p.set('orden', estado.orden);
  return p;
}

async function cargar({ conResumen = false } = {}) {
  const p = parametros();
  const datos = await pedir(`/api/extensiones?${p}`);
  estado.lista = datos.extensiones;
  if (conResumen || !estado.resumen) {
    estado.resumen = await pedir('/api/estado');
    pintarResumen();
  }
  // Exportar, imprimir y PDF respetan los filtros que se estan viendo.
  el.btnExportar.href = `/api/export.csv?${p}`;
  el.btnImprimir.href = `/imprimir?${p}`;
  el.btnPdf.href = `/api/imprimir.pdf?${p}`;
  pintar();
}

function pintarResumen() {
  const r = estado.resumen;
  el.kTotal.textContent = r.total;
  el.kActivos.textContent = r.activos;
  el.kInactivos.textContent = r.inactivos;
  el.kSectores.textContent = r.totalSectores ?? r.sectores.length;
  el.kSinSector.textContent = r.sinSector;

  const actual = el.sector.value;
  el.sector.innerHTML = '<option value="">Todos los sectores</option>' +
    r.sectores.map((s) => `<option value="${escapar(s.sector)}">${escapar(s.sector)} (${s.total})</option>`).join('');
  el.sector.value = actual;

  el.listaSectores.innerHTML = r.sectores.map((s) => `<option value="${escapar(s.sector)}">`).join('');

  el.subtitulo.textContent =
    `${r.total} internos en ${r.totalSectores ?? r.sectores.length} sectores · actualizado ${new Date(r.actualizado).toLocaleString('es')}`;

  if (!el.modalSectores.hidden) pintarPanelSectores();
}

/* ------------------------------------------------- gestion de sectores */

function pintarPanelSectores() {
  const sectores = estado.resumen?.sectores || [];
  const vacios = sectores.filter((s) => s.total === 0).length;
  el.pistaSectores.textContent =
    `${sectores.length} sectores. Con las flechas cambias el orden en que aparecen; ` +
    'el color se aplica en todo el dashboard. Al eliminar un sector podes mover sus internos a otro o borrarlos junto con el sector.';
  el.pieSectores.textContent = vacios ? `${vacios} sector(es) sin internos.` : '';

  el.cuerpoSectores.innerHTML = sectores.map((s, i) => {
    const color = s.color || colorSector(s.sector);
    const flechas = `<div class="orden-celda">
      <span class="asa" title="Arrastrar para reordenar" aria-hidden="true">&#8942;&#8942;</span>
      <button class="btn-orden" data-mover="${escapar(s.sector)}" data-delta="-1" type="button"
        title="Subir" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
      <button class="btn-orden" data-mover="${escapar(s.sector)}" data-delta="1" type="button"
        title="Bajar" ${i === sectores.length - 1 ? 'disabled' : ''}>&#9660;</button>
      <span class="orden-num">${i + 1}</span>
    </div>`;

    if (estado.sectorEditando === s.sector) {
      return `<tr class="editando" data-sector="${escapar(s.sector)}">
        <td>${flechas}</td>
        <td><button class="btn-color" data-color="${escapar(s.sector)}" type="button"
          style="background:${color}" title="Cambiar color"></button></td>
        <td colspan="4"><input class="input-renombrar" value="${escapar(s.sector)}" maxlength="60"></td>
        <td><div class="acciones-sector">
          <button class="btn-mini" data-guardar-sector="${escapar(s.sector)}" type="button">Guardar</button>
          <button class="btn-mini" data-cancelar-sector="1" type="button">Cancelar</button>
        </div></td>
      </tr>`;
    }

    const paleta = estado.colorEditando === s.sector ? `<tr class="fila-paleta" data-paleta-de="${escapar(s.sector)}">
      <td colspan="7">
        <div class="color-paleta">
          ${PALETA.map((c) => `<button class="color-opcion" data-set-color="${escapar(s.sector)}" data-valor="${c}"
            type="button" style="background:${c}" title="${c}"></button>`).join('')}
          <input type="color" class="color-propio" data-set-color="${escapar(s.sector)}" data-valor-auto="1"
            value="${color.startsWith('#') ? color : '#1f5fd1'}" title="Elegir otro color">
          ${s.color ? `<button class="btn-mini auto" data-set-color="${escapar(s.sector)}" data-valor=""
            type="button">Color automatico</button>` : ''}
        </div>
      </td>
    </tr>` : '';

    return `<tr data-sector="${escapar(s.sector)}">
      <td>${flechas}</td>
      <td><button class="btn-color" data-color="${escapar(s.sector)}" type="button"
        style="background:${color}" title="Cambiar color"></button></td>
      <td>
        <div class="celda-nombre">
          <span class="nom-sector">${escapar(s.sector)}</span>
          ${s.protegido ? '<span class="pill-protegido">protegido</span>' : ''}
        </div>
      </td>
      <td class="col-num">${s.total}</td>
      <td class="col-num">${s.activos}</td>
      <td class="col-num">${s.inactivos}</td>
      <td>
        <div class="acciones-sector">
          ${s.protegido ? '' : `
            <button class="btn-mini" data-renombrar="${escapar(s.sector)}" type="button">Renombrar</button>
            <button class="btn-mini peligro" data-eliminar-sector="${escapar(s.sector)}" type="button">Eliminar</button>`}
        </div>
      </td>
    </tr>${paleta}`;
  }).join('');

  marcarCimaArrastrada();
}

/** Marca el borde de la fila que esta debajo del puntero durante el arrastre. */
function marcarCimaArrastrada() {
  el.cuerpoSectores.querySelectorAll('tr').forEach((fila) => {
    if (estado.arrastrando && fila.dataset.sector === estado.arrastrando.sector) {
      fila.classList.add('arrastrando');
    } else {
      fila.classList.remove('arrastrando', 'soltar-antes', 'soltar-despues');
    }
  });
}

/**
 * Arrastre con eventos de puntero (no el drag nativo de HTML5): funciona igual
 * con mouse, dedo o lapiz, y es verificable de forma automatica.
 */
function iniciarArrastreManual(evento) {
  const fila = evento.target.closest('tr[data-sector]');
  if (!fila || evento.button !== 0) return;
  if (evento.target.closest('button, input')) return; // las flechas y demas siguen siendo clicks
  if (estado.sectorEditando) return;
  evento.preventDefault();

  estado.arrastrando = {
    sector: fila.dataset.sector,
    desde: { x: evento.clientX, y: evento.clientY },
    puntero: null,
    movido: false,
  };
}

function moverArrastreManual(evento) {
  if (!estado.arrastrando) return;
  const d = estado.arrastrando;
  if (!d.movido) {
    const lejos = Math.abs(evento.clientY - d.desde.y) + Math.abs(evento.clientX - d.desde.x);
    if (lejos < 6) return; // tolerancia para no disparar el arrastre con un simple clic
    d.movido = true;
    el.cuerpoSectores.classList.add('arrastrando-activo');
  }
  if (d.movido) evento.preventDefault();

  d.puntero = { x: evento.clientX, y: evento.clientY };
  const bajo = document.elementFromPoint(evento.clientX, evento.clientY);
  const fila = bajo?.closest?.('tr[data-sector]');
  const objetivo = fila && fila.dataset.sector !== d.sector ? fila : null;
  if (objetivo) d.sobre = objetivo.dataset.sector;
  else d.sobre = null;

  el.cuerpoSectores.querySelectorAll('tr').forEach((f) => {
    const esObjetivo = objetivo && f === objetivo;
    const caja = f.getBoundingClientRect();
    const abajo = esObjetivo && evento.clientY > caja.top + caja.height / 2;
    f.classList.toggle('soltar-antes', !!esObjetivo && !abajo);
    f.classList.toggle('soltar-despues', !!esObjetivo && abajo);
  });
}

function terminarArrastreManual() {
  const d = estado.arrastrando;
  if (!d) return;
  estado.arrastrando = null;
  el.cuerpoSectores.classList.remove('arrastrando-activo');

  if (!d.movido || !d.sobre) { pintarPanelSectores(); return; }

  const nombres = (estado.resumen?.sectores || []).map((s) => s.sector).filter((n) => n !== d.sector);
  let destino = nombres.indexOf(d.sobre);
  if (destino === -1) { pintarPanelSectores(); return; }

  const filaObjetivo = el.cuerpoSectores.querySelector(`tr[data-sector="${CSS.escape(d.sobre)}"]`);
  if (filaObjetivo && d.puntero) {
    const caja = filaObjetivo.getBoundingClientRect();
    if (d.puntero.y > caja.top + caja.height / 2) destino += 1;
  }
  nombres.splice(destino, 0, d.sector);
  guardarOrden(nombres, `"${d.sector}" movido a la posicion ${destino + 1}.`);
}

/** Guarda un orden nuevo, con repintado inmediato y vuelta atras si el servidor falla. */
async function guardarOrden(nombres, mensaje) {
  const previo = estado.resumen.sectores;
  estado.resumen.sectores = nombres.map((s) => previo.find((x) => x.sector === s)).filter(Boolean);
  pintarPanelSectores();

  try {
    const r = await pedir('/api/sectores/reordenar', {
      method: 'POST',
      body: JSON.stringify({ orden: nombres }),
    });
    estado.resumen.sectores = r.sectores;
    if (mensaje) aviso(mensaje, 'ok');
    marcarGuardado();
    pintarResumen();
    await cargar();
  } catch (e) {
    estado.resumen.sectores = previo;
    pintarPanelSectores();
    aviso(e.message, 'mal');
  }
}

/** Ordena todos los sectores alfabeticamente. "Sin asignar" siempre queda al final. */
async function ordenarAlfabeticamente() {
  const nombres = (estado.resumen?.sectores || []).map((s) => s.sector);
  const normales = nombres.filter((n) => n !== 'Sin asignar').sort(comparador.compare);
  const nuevo = nombres.includes('Sin asignar') ? [...normales, 'Sin asignar'] : normales;
  if (nuevo.every((n, i) => n === nombres[i])) {
    aviso('Los sectores ya estan en orden alfabetico.');
    return;
  }
  await guardarOrden(nuevo, 'Sectores ordenados alfabeticamente.');
}

/** Mueve un sector un lugar arriba o abajo (botones de flecha). */
async function moverSector(nombre, delta) {
  const sectores = (estado.resumen?.sectores || []).map((s) => s.sector);
  const i = sectores.indexOf(nombre);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= sectores.length) return;
  [sectores[i], sectores[j]] = [sectores[j], sectores[i]];
  await guardarOrden(sectores);
}

async function asignarColor(nombre, valor) {
  try {
    const r = await pedir(`/api/sectores/${encodeURIComponent(nombre)}/color`, {
      method: 'POST',
      body: JSON.stringify({ color: valor || null }),
    });
    estado.resumen.sectores = r.sectores;
    estado.colorEditando = null;
    aviso(
      valor ? `Color de "${nombre}" actualizado.` : `"${nombre}" vuelve al color automatico.`,
      'ok'
    );
    marcarGuardado();
    pintarResumen();
    await cargar();
  } catch (e) {
    aviso(e.message, 'mal');
  }
}

async function crearSector(evento) {
  evento.preventDefault();
  el.errorSector.hidden = true;
  const nombre = el.nuevoSector.value.trim();
  if (!nombre) return;
  try {
    await pedir('/api/sectores', { method: 'POST', body: JSON.stringify({ nombre }) });
    el.nuevoSector.value = '';
    aviso(`Sector "${nombre}" creado.`, 'ok');
    marcarGuardado();
    await refrescarSectores();
  } catch (e) {
    el.errorSector.textContent = e.message;
    el.errorSector.hidden = false;
  }
}

async function guardarRenombre(original) {
  const fila = el.cuerpoSectores.querySelector(`tr[data-sector="${CSS.escape(original)}"]`);
  const destino = fila?.querySelector('.input-renombrar')?.value.trim();
  if (!destino || destino === original) {
    estado.sectorEditando = null;
    pintarPanelSectores();
    return;
  }
  try {
    const r = await pedir(`/api/sectores/${encodeURIComponent(original)}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre: destino }),
    });
    aviso(
      r.fusionado
        ? `"${original}" se fusiono con "${destino}": ${r.movidos} interno(s) movidos.`
        : `Sector renombrado a "${destino}" (${r.movidos} interno(s) movidos).`,
      'ok'
    );
    estado.sectorEditando = null;
    if (estado.sector === original) estado.sector = destino;
    if (estado.sectorActivo === original) estado.sectorActivo = destino;
    marcarGuardado();
    await refrescarSectores();
  } catch (e) {
    el.errorSector.textContent = e.message;
    el.errorSector.hidden = false;
  }
}

async function eliminarSector(nombre, info) {
  if (info.total === 0) {
    if (!confirm(`Eliminar el sector "${nombre}"? No tiene internos asignados.`)) return;
    try {
      await pedir(`/api/sectores/${encodeURIComponent(nombre)}`, {
        method: 'DELETE',
        body: JSON.stringify({ estrategia: 'mover', destino: 'Sin asignar' }),
      });
      aviso(`Sector "${nombre}" eliminado.`, 'ok');
      marcarGuardado();
      await refrescarSectores();
    } catch (e) { aviso(e.message, 'mal'); }
    return;
  }

  // Si el sector tiene internos, hay que decidir que pasa con ellos.
  // Por defecto quedan en "Sin asignar"; moverlos a otro sector es una eleccion.
  const opciones = (estado.resumen?.sectores || []).filter((s) => s.sector !== nombre);
  const lista = opciones.map((s, i) => `  ${i + 1}) ${s.sector} (${s.total})`).join('\n');
  const respuesta = prompt(
    `El sector "${nombre}" tiene ${info.total} interno(s).\n\n`
    + `Escribi el NUMERO del sector al que moverlos, o deja 0 para que queden en "Sin asignar":\n\n`
    + `${lista}\n`,
    '0'
  );
  if (respuesta === null) return;

  const indice = Number(respuesta.trim());
  if (!Number.isInteger(indice) || indice < 0 || indice > opciones.length) {
    aviso('Opcion invalida: no se elimino nada.', 'mal');
    return;
  }

  if (indice === 0) {
    if (!confirm(
      `Confirmas eliminar el sector "${nombre}"?\n\n`
      + `Sus ${info.total} interno(s) quedan en "Sin asignar" y no se pierde ninguno.`
    )) return;
  }

  const cuerpo = indice === 0
    ? { estrategia: 'mover', destino: 'Sin asignar' }
    : { estrategia: 'mover', destino: opciones[indice - 1].sector };

  try {
    const r = await pedir(`/api/sectores/${encodeURIComponent(nombre)}`, {
      method: 'DELETE',
      body: JSON.stringify(cuerpo),
    });
    aviso(
      r.destino === 'Sin asignar'
        ? `Sector "${nombre}" eliminado: sus ${r.movidos} interno(s) quedaron en "Sin asignar".`
        : `Sector "${nombre}" eliminado: ${r.movidos} interno(s) movidos a "${r.destino}".`,
      'ok'
    );
    if (estado.sector === nombre) el.sector.value = '';
    if (estado.sectorActivo === nombre) estado.sectorActivo = '';
    if (estado.sectorActivo || estado.sector) estado.sector = el.sector.value;
    marcarGuardado();
    await refrescarSectores();
  } catch (e) {
    aviso(e.message, 'mal');
  }
}

/** Recarga resumen, panel de sectores y la vista actual. */
async function refrescarSectores() {
  estado.resumen = await pedir('/api/estado');
  pintarResumen();
  await cargar();
}

function abrirSectores() {
  estado.sectorEditando = null;
  estado.colorEditando = null;
  estado.arrastrando = null;
  el.errorSector.hidden = true;
  el.nuevoSector.value = '';
  el.modalSectores.hidden = false;
  pintarPanelSectores();
  setTimeout(() => el.nuevoSector.focus(), 30);
}

function cerrarSectores() {
  el.modalSectores.hidden = true;
  estado.sectorEditando = null;
  estado.colorEditando = null;
  estado.arrastrando = null;
}

/* ------------------------------------------------------------------ pintado */

function pintar() {
  const hay = estado.lista.length > 0;
  el.vacio.hidden = hay;
  if (estado.vista === 'sectores') pintarSectores();
  else pintarTabla();
  el.pieInfo.textContent = hay
    ? `Mostrando ${estado.lista.length} de ${estado.resumen?.total ?? estado.lista.length} internos.`
    : '';
}

function filaHTML(e, consulta) {
  const inactivo = e.estado === 'inactivo';
  return `<li class="fila ${inactivo ? 'inactivo' : ''}" data-id="${e.id}" tabindex="0" title="Clic para editar">
    <span class="num">${escapar(e.interno)}</span>
    <span class="nom">${resaltar(e.nombre, consulta)}</span>
    ${inactivo ? '<span class="pildora">inactivo</span>' : ''}
  </li>`;
}

function pintarSectores() {
  const grupos = new Map();
  for (const e of estado.lista) {
    if (!grupos.has(e.sector)) grupos.set(e.sector, []);
    grupos.get(e.sector).push(e);
  }

  const sectores = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  const partes = [];

  for (const sector of sectores) {
    const items = grupos.get(sector);
    const abierto = estado.expandidos.has(sector) || items.length <= POR_PAGINA || estado.q;
    const visibles = abierto ? items : items.slice(0, POR_PAGINA);
    const activos = items.filter((e) => e.estado === 'activo').length;
    const color = colorSector(sector);

    partes.push(`<article class="sector-card" data-sector="${escapar(sector)}">
      <header class="sector-cab">
        <span class="punto" style="background:${color}"></span>
        <h3>${escapar(sector)}</h3>
        <span class="contador">${items.length}</span>
      </header>
      <ul class="sector-lista">
        ${visibles.map((e) => filaHTML(e, estado.q)).join('')}
      </ul>
      ${!abierto ? `<button class="ver-mas" data-vermas="${escapar(sector)}">Ver los ${items.length - POR_PAGINA} restantes (${activos} activos)</button>` : ''}
    </article>`);
  }

  el.vistaSectores.innerHTML = partes.join('');
}

function pintarTabla() {
  el.cuerpoTabla.innerHTML = estado.lista.map((e) => `<tr data-id="${e.id}">
    <td><span class="num">${escapar(e.interno)}</span></td>
    <td>${resaltar(e.nombre, estado.q)}</td>
    <td><span class="chip" style="border-left:4px solid ${colorSector(e.sector)}">${escapar(e.sector)}</span></td>
    <td><span class="chip ${e.estado}">${e.estado}</span></td>
    <td>${escapar(e.notas)}</td>
    <td><button class="btn sutil" data-editar="${e.id}" type="button">Editar</button></td>
  </tr>`).join('');
}

/* -------------------------------------------------------------------- modal */

function abrirModal(registro = null) {
  estado.editando = registro;
  el.modalTitulo.textContent = registro ? `Editar interno ${registro.interno}` : 'Nuevo interno';
  el.fInterno.value = registro?.interno ?? '';
  el.fNombre.value = registro?.nombre ?? '';
  el.fSector.value = registro?.sector ?? estado.sectorActivo ?? '';
  el.fEstado.value = registro?.estado ?? 'activo';
  el.fNotas.value = registro?.notas ?? '';
  el.errorForm.hidden = true;
  el.btnEliminar.hidden = !registro;
  el.modal.hidden = false;
  setTimeout(() => el.fInterno.focus(), 30);
}

function cerrarModal() {
  el.modal.hidden = true;
  estado.editando = null;
}

async function guardar(evento) {
  evento.preventDefault();
  el.btnGuardar.disabled = true;
  el.errorForm.hidden = true;

  const cuerpo = {
    interno: el.fInterno.value,
    nombre: el.fNombre.value,
    sector: el.fSector.value,
    estado: el.fEstado.value,
    notas: el.fNotas.value,
  };

  try {
    if (estado.editando) {
      await pedir(`/api/extensiones/${estado.editando.id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
      aviso(`Interno ${cuerpo.interno} actualizado.`, 'ok');
    } else {
      await pedir('/api/extensiones', { method: 'POST', body: JSON.stringify(cuerpo) });
      aviso(`Interno ${cuerpo.interno} creado.`, 'ok');
    }
    cerrarModal();
    marcarGuardado();
    await cargar({ conResumen: true });
  } catch (e) {
    el.errorForm.textContent = e.message;
    el.errorForm.hidden = false;
  } finally {
    el.btnGuardar.disabled = false;
  }
}

async function eliminar() {
  if (!estado.editando) return;
  const { id, interno, nombre } = estado.editando;
  if (!confirm(`Eliminar el interno ${interno} (${nombre})?`)) return;
  try {
    await pedir(`/api/extensiones/${id}`, { method: 'DELETE' });
    aviso(`Interno ${interno} eliminado.`, 'ok');
    cerrarModal();
    marcarGuardado();
    await cargar({ conResumen: true });
  } catch (e) {
    aviso(e.message, 'mal');
  }
}

async function organizar() {
  // Reclasificar todo pisa las asignaciones hechas a mano: se advierte primero.
  const total = estado.resumen?.total ?? 0;
  const aviso1 = confirm(
    'Esto reasigna los internos segun su nombre y PISA las asignaciones que hiciste a mano.\n\n'
    + `Son ${total} internos. Si tenes sectores armados a tu gusto, se van a rearmar.\n\n`
    + '¿Queres continuar?'
  );
  if (!aviso1) return;
  if (!confirm('Estas seguro? Esta accion no se puede deshacer.')) return;

  el.btnOrganizar.disabled = true;
  try {
    const r = await pedir('/api/organizar', {
      method: 'POST',
      body: JSON.stringify({ todo: true, confirmar: true }),
    });
    if (!r.cambios.length) aviso('Todos los internos ya tienen sector asignado.');
    else {
      aviso(`${r.cambios.length} internos reclasificados por nombre.`, 'ok');
      console.table(r.cambios);
    }
    marcarGuardado();
    await cargar({ conResumen: true });
  } catch (e) {
    aviso(e.message, 'mal');
  } finally {
    el.btnOrganizar.disabled = false;
  }
}

/* ------------------------------------------------------------------ eventos */

let temporizador;
el.q.addEventListener('input', () => {
  clearTimeout(temporizador);
  el.limpiarQ.hidden = !el.q.value;
  temporizador = setTimeout(() => {
    estado.q = el.q.value.trim();
    cargar().catch((e) => aviso(e.message, 'mal'));
  }, 180);
});

el.limpiarQ.addEventListener('click', () => {
  el.q.value = '';
  el.limpiarQ.hidden = true;
  estado.q = '';
  cargar().catch((e) => aviso(e.message, 'mal'));
});

el.sector.addEventListener('change', () => {
  estado.sector = el.sector.value;
  if (estado.vista === 'sectores') {
    estado.sectorActivo = el.sector.value;
    if (estado.sector) {
      const tarjeta = el.vistaSectores.querySelector(`[data-sector="${CSS.escape(estado.sector)}"]`);
      if (tarjeta) tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  cargar().catch((e) => aviso(e.message, 'mal'));
});

el.estado.addEventListener('change', () => {
  estado.estado = el.estado.value;
  cargar().catch((e) => aviso(e.message, 'mal'));
});

el.orden.addEventListener('change', () => {
  estado.orden = el.orden.value;
  cargar().catch((e) => aviso(e.message, 'mal'));
});

el.btnLimpiarFiltros.addEventListener('click', () => {
  el.q.value = '';
  el.limpiarQ.hidden = true;
  el.estado.value = '';
  el.sector.value = '';
  estado.q = '';
  estado.sector = '';
  estado.sectorActivo = '';
  estado.estado = '';
  cargar().catch((e) => aviso(e.message, 'mal'));
});

document.querySelectorAll('.tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      const activo = t === tab;
      t.classList.toggle('activo', activo);
      t.setAttribute('aria-selected', String(activo));
    });
    estado.vista = tab.dataset.vista;
    el.vistaSectores.hidden = estado.vista !== 'sectores';
    el.vistaLista.hidden = estado.vista !== 'lista';
    pintar();
  });
});

document.querySelectorAll('[data-modulo]').forEach((boton) => boton.addEventListener('click', () => cambiarModulo(boton.dataset.modulo)));
$('#btnNuevoContacto').addEventListener('click', nuevoContacto);
document.querySelectorAll('[data-directorio]').forEach((b) => b.addEventListener('click', () => nuevoDirectorio(b.dataset.directorio)));
['buscarContactos', 'buscarFlores', 'buscarSalud', 'filtroFlores', 'filtroDepartamento', 'filtroTipo'].forEach((id) => {
  document.getElementById(id).addEventListener('input', () => cargarModulo(estado.modulo).catch((e) => aviso(e.message, 'mal')));
  document.getElementById(id).addEventListener('change', () => cargarModulo(estado.modulo).catch((e) => aviso(e.message, 'mal')));
});
el.guardiaFecha.addEventListener('change', () => cargarModulo('guardias').catch((e) => aviso(e.message, 'mal')));
el.visorGuardiasFecha.addEventListener('change', () => cargarModulo('visor-guardias').catch((e) => aviso(e.message, 'mal')));
el.formGuardia.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  try {
    await pedir('/api/guardias', { method: 'POST', body: JSON.stringify({ fecha: el.guardiaFecha.value, turno: el.guardiaTurno.value, rolGuardia: el.guardiaRol.value, contactoId: el.guardiaContacto.value, notas: el.guardiaNotas.value }) });
    aviso('Guardia asignada.', 'ok');
    el.formGuardia.reset();
    el.guardiaFecha.value = new Date().toISOString().slice(0, 10);
    await cargarModulo('guardias');
  } catch (e) { aviso(e.message, 'mal'); }
});
document.addEventListener('click', async (evento) => {
  const contacto = evento.target.closest('[data-borrar-contacto]');
  const guardia = evento.target.closest('[data-borrar-guardia]');
  const directorio = evento.target.closest('[data-borrar-directorio]');
  if (contacto && confirm('Eliminar contacto?')) await pedir(`/api/contactos/${contacto.dataset.borrarContacto}`, { method: 'DELETE' });
  if (guardia && confirm('Eliminar guardia?')) await pedir(`/api/guardias/${guardia.dataset.borrarGuardia}`, { method: 'DELETE' });
  if (directorio && confirm('Eliminar registro?')) { const [campo, id] = directorio.dataset.borrarDirectorio.split(':'); await pedir(`/api/directorio/${campo}/${id}`, { method: 'DELETE' }); }
  if (contacto || guardia || directorio) await cargarModulo(estado.modulo);
});

// Clic en una fila -> editar; en "ver mas" -> expandir.
document.addEventListener('click', (evento) => {
  const verMas = evento.target.closest('[data-vermas]');
  if (verMas) {
    estado.expandidos.add(verMas.dataset.vermas);
    pintarSectores();
    return;
  }
  const botonEditar = evento.target.closest('[data-editar]');
  const fila = evento.target.closest('.fila, tr[data-id]');
  const id = botonEditar?.dataset.editar || fila?.dataset.id;
  if (!id) return;
  // Las filas del panel de sectores no abren el modal de internos.
  if (evento.target.closest('#modalSectores')) return;
  const registro = estado.lista.find((e) => e.id === id);
  if (registro) abrirModal(registro);
});

// Acciones del panel de sectores.
el.cuerpoSectores.addEventListener('click', (evento) => {
  const mover = evento.target.closest('[data-mover]');
  if (mover) {
    moverSector(mover.dataset.mover, Number(mover.dataset.delta));
    return;
  }
  const abrirColor = evento.target.closest('[data-color]');
  if (abrirColor) {
    const nombre = abrirColor.dataset.color;
    estado.colorEditando = estado.colorEditando === nombre ? null : nombre;
    pintarPanelSectores();
    return;
  }
  const ponerColor = evento.target.closest('[data-set-color]');
  if (ponerColor && !ponerColor.classList.contains('color-propio')) {
    asignarColor(ponerColor.dataset.setColor, ponerColor.dataset.valor || null);
    return;
  }
  const renombrar = evento.target.closest('[data-renombrar]');
  if (renombrar) {
    estado.sectorEditando = renombrar.dataset.renombrar;
    el.errorSector.hidden = true;
    pintarPanelSectores();
    const input = el.cuerpoSectores.querySelector('.input-renombrar');
    input?.focus();
    input?.select();
    return;
  }
  const guardar = evento.target.closest('[data-guardar-sector]');
  if (guardar) {
    guardarRenombre(guardar.dataset.guardarSector);
    return;
  }
  if (evento.target.closest('[data-cancelar-sector]')) {
    estado.sectorEditando = null;
    pintarPanelSectores();
    return;
  }
  const eliminar = evento.target.closest('[data-eliminar-sector]');
  if (eliminar) {
    const nombre = eliminar.dataset.eliminarSector;
    const info = (estado.resumen?.sectores || []).find((s) => s.sector === nombre);
    if (info) eliminarSector(nombre, info);
  }
});

// El selector nativo de color necesita "change" en vez de "click".
el.cuerpoSectores.addEventListener('change', (evento) => {
  const input = evento.target.closest('.color-propio');
  if (input) asignarColor(input.dataset.setColor, input.value);
});

el.cuerpoSectores.addEventListener('keydown', (evento) => {
  if (!evento.target.classList.contains('input-renombrar')) return;
  if (evento.key === 'Enter') {
    evento.preventDefault();
    guardarRenombre(estado.sectorEditando);
  }
  if (evento.key === 'Escape') {
    evento.stopPropagation();
    estado.sectorEditando = null;
    pintarPanelSectores();
  }
});

el.btnSectores.addEventListener('click', abrirSectores);
el.btnOrdenar.addEventListener('click', ordenarAlfabeticamente);
el.btnCerrarSectores.addEventListener('click', cerrarSectores);
el.btnCerrarSectores2.addEventListener('click', cerrarSectores);
el.formSector.addEventListener('submit', crearSector);
el.modalSectores.addEventListener('click', (e) => { if (e.target === el.modalSectores) cerrarSectores(); });

/* ------------------------------------------------ arrastrar para reordenar */

el.cuerpoSectores.addEventListener('mousedown', iniciarArrastreManual);
window.addEventListener('mousemove', moverArrastreManual);
window.addEventListener('mouseup', () => { if (estado.arrastrando) terminarArrastreManual(); });
window.addEventListener('blur', () => { if (estado.arrastrando) terminarArrastreManual(); });

// El drag nativo queda desactivado: el reordenamiento usa los eventos de arriba.
el.cuerpoSectores.addEventListener('dragstart', (evento) => evento.preventDefault());

el.cuerpoSectores.addEventListener('keydown', (evento) => {
  // Accesibilidad: con Alt + flechas tambien se reordena la fila enfocada.
  if (!evento.altKey) return;
  const fila = evento.target.closest('tr[data-sector]');
  if (!fila) return;
  if (evento.key === 'ArrowUp') { evento.preventDefault(); moverSector(fila.dataset.sector, -1); }
  if (evento.key === 'ArrowDown') { evento.preventDefault(); moverSector(fila.dataset.sector, 1); }
});

document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    if (!el.modalAdmin.hidden) { cerrarAdmin(); return; }
    if (!el.modalSectores.hidden) { cerrarSectores(); return; }
    if (!el.modal.hidden) { cerrarModal(); return; }
  }
  if (evento.key === '/' && document.activeElement !== el.q) {
    evento.preventDefault();
    el.q.focus();
  }
  if (evento.key === 'Enter' && evento.target.classList.contains('fila')) {
    evento.target.click();
  }
});

el.btnNuevo.addEventListener('click', () => abrirModal());
el.btnCerrar.addEventListener('click', cerrarModal);
el.btnCancelar.addEventListener('click', cerrarModal);
el.btnEliminar.addEventListener('click', eliminar);
el.btnOrganizar.addEventListener('click', organizar);
el.form.addEventListener('submit', guardar);
el.modal.addEventListener('click', (e) => { if (e.target === el.modal) cerrarModal(); });

el.btnAdmin.addEventListener('click', abrirAdmin);
el.btnCerrarAdmin.addEventListener('click', cerrarAdmin);
el.btnCerrarAdmin2.addEventListener('click', cerrarAdmin);
el.modalAdmin.addEventListener('click', (e) => { if (e.target === el.modalAdmin) cerrarAdmin(); });
el.formAdmin.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  el.errorAdmin.hidden = true;
  el.btnLogin.disabled = true;
  try {
    await pedir('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario: el.fUsuario.value, password: el.fPassword.value }),
    });
    estado.rol = el.fUsuario.value;
    estado.admin = estado.rol === 'administrador';
    actualizarAdmin();
    cerrarAdmin();
    aviso('Sesion de administrador iniciada.', 'ok');
  } catch (e) {
    el.errorAdmin.textContent = e.message;
    el.errorAdmin.hidden = false;
  } finally {
    el.btnLogin.disabled = false;
  }
});
el.btnLogout.addEventListener('click', async () => {
  await pedir('/api/auth/logout', { method: 'POST' });
  estado.admin = false;
  actualizarAdmin();
  cerrarAdmin();
  aviso('Sesion de administrador cerrada.');
});

Promise.all([cargarAuth(), cargar({ conResumen: true })]).catch((e) => {
  el.subtitulo.textContent = 'Error al conectar con el servidor';
  aviso(e.message, 'mal');
});

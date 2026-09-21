/**
 * Reglas de clasificacion por sector. Modulo puro, sin efectos secundarios:
 * lo comparten el seed (tools/seed.mjs) y el servidor.
 */

/** Normaliza para comparar sin acentos ni mayusculas. */
export const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Reglas evaluadas EN ORDEN: gana la primera que coincide.
// Se apoyan en los prefijos reales de los nombres del CSV de FreePBX.
export const REGLAS = [
  [/^(almacen|deposito|rack)/, 'Deposito / Almacen'],
  [/^taller/, 'Mantenimiento'],
  [/central tel/, 'Telefonia / Central'],
  [/^recepcion|^recep policlinicas/, 'Recepcion'],
  [/^agenda/, 'Agenda / Admision'],
  [/^at usuario/, 'Atencion al Usuario'],
  [/^asist integral/, 'Atencion al Usuario'],
  [/recaudacion|^caja/, 'Recaudacion / Caja'],
  [/^adjunto/, 'Sanatorio Barizo'],
  [/hogar (de )?ancianos|^hogar -/, 'Hogar de Ancianos'],
  [/^(urgencias|reanima)/, 'Urgencias'],
  [/quimioterapia/, 'Quimioterapia'],
  [/^maternidad|sala partos|cuarto parteras|parteras|ginecolog/, 'Maternidad / Partos'],
  [/^block quirurgico|^sanatorio/, 'Quirofano / Sanatorio'],
  [/^consultorio/, 'Consultorios'],
  [/^farmacia/, 'Farmacia'],
  [/^laboratorio/, 'Laboratorio'],
  [/^rayos x|tomografo/, 'Imagenologia'],
  [/^banco sangre/, 'Banco de Sangre'],
  [/^anatomia/, 'Anatomia Patologica'],
  [/cardiol/, 'Cardiologia'],
  [/^enfermeria|^dpto enfermeria|^cuarto medico/, 'Enfermeria'],
  [/^cocina|^economato/, 'Cocina / Economato'],
  [/^lavanderia|^lenceria/, 'Lavanderia / Lenceria'],
  [/^psiquiatria/, 'Psiquiatria'],
  [/^telemedicina/, 'Telemedicina'],
  [/^salas? (mixta|ninos)/, 'Salas de Internacion'],
  [/^archivo/, 'Archivo'],
  [/^compras|^centro materiales/, 'Compras / Suministros'],
  [/^rrhh|^sueldos/, 'RRHH / Sueldos'],
  [/^contaduria/, 'Contaduria'],
  [/^informatica/, 'Informatica'],
  [/^direccion|^sub-direccion|^administrador/, 'Direccion / Administracion'],
  [/^uce$/, 'UCE'],
];

export const SIN_ASIGNAR = 'Sin asignar';

/** Devuelve el sector sugerido para un nombre de interno. */
export function asignarSector(nombre) {
  const n = norm(nombre);
  for (const [re, sector] of REGLAS) if (re.test(n)) return sector;
  return SIN_ASIGNAR;
}

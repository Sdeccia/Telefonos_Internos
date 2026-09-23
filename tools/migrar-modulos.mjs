/** Migra data/telefonos.json para los modulos nuevos sin borrar datos existentes. */
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivo = path.join(process.env.DIR_DATOS ? path.resolve(process.env.DIR_DATOS) : path.join(raiz, 'data'), 'telefonos.json');
const store = JSON.parse(await readFile(archivo, 'utf8'));

if (!Array.isArray(store.usuarios)) {
  store.usuarios = [{ id: 'rol-administrador', usuario: 'admin', rol: 'administrador', activo: true }];
}
if (!Array.isArray(store.contactos_privados)) store.contactos_privados = [];
if (!Array.isArray(store.guardias)) store.guardias = [];
if (!Array.isArray(store.servicios_guardia)) store.servicios_guardia = [];
if (!Array.isArray(store.auditoria_guardias)) store.auditoria_guardias = [];
const serviciosExistentes = new Set(store.servicios_guardia.map((servicio) => servicio.nombre));
for (const guardia of store.guardias) {
  guardia.servicio ||= guardia.rolGuardia || 'Sin servicio';
  guardia.rolGuardia ||= guardia.servicio;
  guardia.horaInicio ||= '';
  guardia.horaFin ||= '';
  guardia.estado ||= 'planificada';
  if (!serviciosExistentes.has(guardia.servicio)) {
    store.servicios_guardia.push({ id: crypto.randomUUID(), nombre: guardia.servicio, activo: true });
    serviciosExistentes.add(guardia.servicio);
  }
}
if (!Array.isArray(store.directorio_flores) || !store.directorio_flores.length) {
  store.directorio_flores = [
    { id: 'flores-911', categoria: 'Emergencias', nombre: 'Emergencias 911', telefono: '911', servicio: 'Emergencias', localidad: 'Trinidad', notas: '' },
    { id: 'flores-104', categoria: 'Emergencias', nombre: 'Bomberos', telefono: '104', servicio: 'Emergencias', localidad: 'Trinidad', notas: '' },
    { id: 'flores-105', categoria: 'Emergencias', nombre: 'ASSE / SAME 105', telefono: '105', servicio: 'Emergencias móviles', localidad: 'Trinidad', notas: '' },
    { id: 'flores-comepa', categoria: 'Salud', nombre: 'COMEPA', telefono: '', servicio: 'Central / atención al usuario', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: 'flores-amedrin', categoria: 'Salud', nombre: 'AMEDRIN', telefono: '', servicio: 'Central / atención al usuario', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: 'flores-comef', categoria: 'Salud', nombre: 'COMEF', telefono: '', servicio: 'Central / atención al usuario', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: 'flores-intendencia', categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Intendencia de Flores', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: 'flores-jefatura', categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Jefatura de Policía de Flores', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: 'flores-batallon', categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Batallón de Infantería', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: 'flores-junta', categoria: 'Institucionales / Fuerzas Vivas', nombre: 'Junta Departamental de Flores', telefono: '', servicio: 'Central', localidad: 'Trinidad', notas: 'Completar teléfono local.' },
    { id: 'flores-ute', categoria: 'Servicios', nombre: 'UTE', telefono: '0800 1930', servicio: 'Atención general', localidad: 'Flores', notas: '' },
    { id: 'flores-ose', categoria: 'Servicios', nombre: 'OSE', telefono: '0800 1871', servicio: 'Atención general', localidad: 'Flores', notas: '' },
    { id: 'flores-antel', categoria: 'Servicios', nombre: 'ANTEL', telefono: '123', servicio: 'Atención general', localidad: 'Flores', notas: '' },
  ];
}
if (!Array.isArray(store.directorio_nacional_salud)) store.directorio_nacional_salud = [];
store.version = Math.max(Number(store.version) || 1, 218);
store.actualizado = new Date().toISOString();

const temporal = `${archivo}.tmp`;
await writeFile(temporal, JSON.stringify(store, null, 2) + '\n', 'utf8');
await rename(temporal, archivo);
console.log('Migracion completada:', {
  usuarios: store.usuarios.length,
  contactos: store.contactos_privados.length,
  guardias: store.guardias.length,
  servicios: store.servicios_guardia.length,
  flores: store.directorio_flores.length,
  salud: store.directorio_nacional_salud.length,
});

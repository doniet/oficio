export type EstadoSesion = 'cargando' | 'sinRed' | 'invitado' | 'autenticado';

// Decide qué mostrar en pantallas que dependen de la sesión (Cuenta, Mensajes), sin acoplarlas
// a react-native: así se prueba con jest puro. `cargando` manda siempre (arranque en curso);
// `sinRed` es el caso "hay token guardado pero no se pudo comprobar por falta de red" — ahí NO
// se sabe si el usuario está autenticado, así que no se flashea ni el invitado ni el autenticado.
export function estadoSesion({ cargando, sinRed, usuario }: { cargando: boolean; sinRed: boolean; usuario: unknown }): EstadoSesion {
  if (cargando) return 'cargando';
  if (sinRed) return 'sinRed';
  return usuario ? 'autenticado' : 'invitado';
}

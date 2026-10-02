import { Share } from 'react-native';
import { origenWeb } from './api';

/**
 * La URL pública del perfil para compartir: la web (`origenWeb()`), no un deep link de la app —
 * a quien la reciba sin la app instalada le tiene que abrir algo. El id va escapado, como todos
 * los métodos de `shared/src/api.ts`.
 */
export function urlPerfil(id: string): string {
  return `${origenWeb()}/proveedor/${encodeURIComponent(id)}`;
}

/**
 * Comparte el perfil: mismo contrato que la web (`FichaPunto.tsx:329-341` en el mapa),
 * `{ title: nombre, url }`. Cancelar (cerrar la hoja del sistema) no es un error — ver
 * `esCancelacion` — así que se traga en silencio y la función no lanza por eso.
 */
export async function compartirPerfil(id: string, nombre: string): Promise<void> {
  return compartir(nombre, urlPerfil(id));
}

/**
 * El compartir de verdad, y el único: lo llaman `compartirPerfil` y el `BotonCompartir` de
 * `componentes/ui.tsx`. Vive aquí y no dentro del botón porque es lo que las pruebas cubren — un
 * `Share.share` escrito a mano en el componente dejaría las pruebas verdes sobre un camino que
 * nadie recorre.
 */
export async function compartir(titulo: string, url: string): Promise<void> {
  try {
    const resultado = await Share.share({ title: titulo, url });
    if (esCancelacion(resultado)) return;
  } catch (error) {
    if (esCancelacion(error)) return;
    throw error;
  }
}

/**
 * Distingue cancelar (cerrar la hoja de compartir) de un fallo de verdad.
 *
 * - En iOS, `Share.share` RESUELVE con `{ action: 'dismissedAction' }` cuando el usuario cierra
 *   la hoja sin elegir nada; con cualquier otra forma (p. ej. `sharedAction`) no hay cancelación.
 * - En Android, al día de hoy no hay un resultado que distinga cancelar: lo que llega es un
 *   rechazo de la promesa, sin un `action` que lo diga. Tratar ese rechazo como fallo le mostraría
 *   al usuario un aviso de error por no haber hecho nada — el peor error posible aquí — así que
 *   cualquier rechazo que no tenga la forma de un `ShareAction` se trata como cancelación.
 */
export function esCancelacion(resultadoOError: unknown): boolean {
  if (resultadoOError && typeof resultadoOError === 'object' && 'action' in resultadoOError) {
    return (resultadoOError as { action: unknown }).action === 'dismissedAction';
  }
  return true;
}

import * as SecureStore from 'expo-secure-store';
import { ClienteApi, DatosLogin, DatosRegistro, ErrorApi, User } from '@oficio/shared';

const CLAVE = 'oficio_token';

export const almacenToken = {
  leer: () => SecureStore.getItemAsync(CLAVE),
  guardar: (t: string) => SecureStore.setItemAsync(CLAVE, t),
  borrar: () => SecureStore.deleteItemAsync(CLAVE),
};

type Almacen = { leer(): Promise<string | null>; guardar(t: string): Promise<void>; borrar(): Promise<void> };

export function crearSesion({ almacen, api }: { almacen: Almacen; api: ClienteApi }) {
  return {
    async arrancar(): Promise<User | null> {
      if (!(await almacen.leer())) return null;
      try {
        return (await api.auth.me()).user;
      } catch (err) {
        // Solo un rechazo del servidor invalida la sesión; sin red se conserva y se reintenta.
        if (err instanceof ErrorApi && err.status === 401) {
          await almacen.borrar();
          return null;
        }
        throw err;
      }
    },
    async entrar(d: DatosLogin) {
      const r = await api.auth.login(d);
      await almacen.guardar(r.token);
      return r.user;
    },
    async registrarse(d: DatosRegistro) {
      const r = await api.auth.register(d);
      await almacen.guardar(r.token);
      return r.user;
    },
    async salir() {
      await almacen.borrar();
    },
  };
}

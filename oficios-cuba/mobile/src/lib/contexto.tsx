import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { crearCliente, DatosLogin, DatosRegistro, User } from '@oficio/shared';
import type { ImperativeRouter } from 'expo-router';
import { configApi } from './api';
import { almacenToken, crearCierreSesion, crearSesion } from './sesion';

type Valor = {
  usuario: User | null; cargando: boolean; sinRed: boolean;
  entrar(d: DatosLogin): Promise<void>; registrarse(d: DatosRegistro): Promise<void>; salir(): Promise<void>; reintentar(): void;
  api: ReturnType<typeof crearCliente>;
};
const Contexto = createContext<Valor | null>(null);

// Debe montarse DENTRO de QueryClientProvider: al cerrar sesión (o ante un 401) vacía su caché.
export function ProveedorSesion({ children, alSalir }: { children: ReactNode; alSalir?: () => Promise<void> }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sinRed, setSinRed] = useState(false);
  const [intento, setIntento] = useState(0);

  const queryClient = useQueryClient();
  const cierre = useMemo(() => crearCierreSesion({
    almacen: almacenToken,
    limpiarDatos: () => queryClient.clear(),
    olvidarUsuario: () => setUsuario(null),
  }), [queryClient]);

  const api = useMemo(() => crearCliente({
    baseUrl: configApi.baseUrl,
    getToken: almacenToken.leer,
    onUnauthorized: cierre.alNoAutorizado,
  }), [cierre]);
  const sesion = useMemo(() => crearSesion({ almacen: almacenToken, api }), [api]);

  useEffect(() => {
    sesion.arrancar()
      .then((u) => { setUsuario(u); setSinRed(false); })
      .catch(() => setSinRed(true))
      .finally(() => setCargando(false));
  }, [sesion, intento]);

  const valor: Valor = {
    usuario, cargando, sinRed, api,
    entrar: async (d) => setUsuario(await sesion.entrar(d)),
    registrarse: async (d) => setUsuario(await sesion.registrarse(d)),
    salir: () => cierre.salir(alSalir),
    reintentar: () => setIntento((n) => n + 1),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useSesion fuera de ProveedorSesion');
  return v;
}

export function requiereSesion(router: ImperativeRouter, usuario: User | null, volverA: string) {
  if (usuario) return true;
  router.push({ pathname: '/(auth)/entrar', params: { volver: volverA } });
  return false;
}

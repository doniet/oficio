import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import type { CatalogItem, PuntoMapa } from '@oficio/shared';
import FichaPunto from './FichaPunto';
import ListaCelda from './ListaCelda';
import ListaProductos, { type PropsListaProductos } from './ListaProductos';
import { accionAtras, fondoHoja } from '../lib/hojaPunto';
import { tituloCelda } from '../lib/listaCelda';
import { contenidoHoja } from '../lib/panelMapa';
import { tituloListaProductos } from '../lib/productosMapa';
import { radios, sand } from '../lib/tema';

// Los dos anclajes de la hoja, exportados porque explorar.tsx los necesita para reservarle
// espacio al mapa y que sus controles flotantes (Cerca de mí, Reintentar) no queden tapados — ver
// el comentario junto a `altoReservado` en explorar.tsx. En la web ese acoplamiento lo resolvía
// una variable CSS que el mapa leía en vivo; en React Native no hay nada parecido a una variable
// global de layout, así que aquí se resuelve con dos números compartidos entre ambos archivos.
export const ANCLA_ASOMADA = 0.3;
export const ANCLA_ABIERTA = 0.85;
const PUNTOS_ANCLAJE = [`${ANCLA_ASOMADA * 100}%`, `${ANCLA_ABIERTA * 100}%`];

/**
 * Hoja inferior que se abre al tocar un punto del mapa. La monta explorar.tsx (no MapaExplorar):
 * el mapa solo avisa con `onAbrir`, quién está abierto vive en la pantalla, igual que en la web.
 */
export default function HojaPunto({ punto, lista, productos, errorLista, onCerrar, onCambiaIndice, onElegirDeLista, onReintentarLista, onVolverALista, onVolverAProductos, tab, q, productoMarcado, etiquetaVolver }: {
  punto: PuntoMapa | null;
  lista?: PuntoMapa[] | null;
  /** Presente = la lista de productos de la pestaña Productos. Cede ante una ficha o una celda. */
  productos?: PropsListaProductos | null;
  errorLista?: string;
  onCerrar(): void;
  /**
   * -1 cerrada, 0 asomada, 1 abierta. Opcional: solo lo usa explorar.tsx para reservar el alto
   * del mapa (ver el comentario junto a ANCLA_ASOMADA arriba). Nadie más depende de esto.
   */
  onCambiaIndice?(indice: number): void;
  onElegirDeLista?(p: PuntoMapa): void;
  onReintentarLista?(): void;
  /** Volver a la lista de la que salió esta ficha. Que exista ES la señal de que hay lista previa. */
  onVolverALista?(): void;
  /** Volver a la lista de productos: presente solo si esta ficha se abrió tocando un producto (y no
   *  hay celda detrás, que gana). Que exista ES la señal de «desde productos», como arriba. */
  onVolverAProductos?(): void;
  /** Pestaña del mapa: con `'productos'` la ficha enseña el catálogo filtrado en lugar de Servicios. */
  tab?: string;
  /** Texto de búsqueda activo, para filtrar el catálogo del negocio con el mismo criterio. */
  q?: string;
  /** El producto tocado en la lista de productos: va primero y marcado. */
  productoMarcado?: CatalogItem | null;
  /** Texto del botón de volver a productos («N productos»). El de la celda es siempre «Volver a la lista». */
  etiquetaVolver?: string;
}) {
  const contenido = contenidoHoja({ punto, lista: lista ?? null, productos: Boolean(productos) });
  const sheetRef = useRef<BottomSheet>(null);
  // El botón físico Atrás y el cierre por `onClose` de la propia hoja necesitan la última
  // versión de `punto`/`onCerrar` sin volver a suscribirse: por eso van en refs, no en deps.
  const puntoRef = useRef(punto);
  const onCerrarRef = useRef(onCerrar);
  puntoRef.current = punto;
  onCerrarRef.current = onCerrar;
  const listaRef = useRef(lista);
  const hayPreviaRef = useRef(Boolean(onVolverALista));
  listaRef.current = lista;
  hayPreviaRef.current = Boolean(onVolverALista);
  const onVolverRef = useRef(onVolverALista);
  onVolverRef.current = onVolverALista;
  const onVolverAProductosRef = useRef(onVolverAProductos);
  onVolverAProductosRef.current = onVolverAProductos;
  const productosRef = useRef(Boolean(productos));
  productosRef.current = Boolean(productos);
  // Solo para decidir cuándo pedir la ficha completa (ver más abajo): la hoja empieza asomada,
  // así que la primera vez que se abre un punto no debe disparar la petición todavía.
  const [indiceActual, setIndiceActual] = useState(-1);

  // Al abrir un punto (o cambiar a otro con la hoja ya abierta) vuelve siempre a "asomada",
  // igual que en la web. Cuando punto pasa a null se cierra (arrastre, X, fondo o Atrás ya
  // dejaron a `punto` en null antes de que esto se dispare — ver más abajo).
  // `contenido` también: pasar de la lista de productos a una ficha (o volver) es contenido nuevo
  // aunque la ficha sea del mismo negocio que la última vez.
  useEffect(() => {
    if (contenido) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [punto?.id, lista, contenido]);

  // 🚨 El listener solo existe mientras la pantalla que monta la hoja está EN FOCO, y por eso va en
  // `useFocusEffect` y no en `useEffect`. Con un `useEffect` el listener vive siempre que la pestaña
  // esté montada y devuelve `true` con solo haber un punto abierto, sin saber qué hay encima: desde
  // que la ficha empuja pantallas dentro de la app (`/proveedor/[id]`), el Atrás estando en el
  // perfil se lo comía la hoja —cerrándola por detrás— y al usuario le parecía que el Atrás no
  // hacía nada. Lo mismo valía estando en otra pestaña con un punto abierto.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Sin `productos` aquí, Atrás con solo la lista de productos abierta devolvería 'nada' y
      // sacaría al usuario de Explorar.
      const accion = accionAtras({ punto: puntoRef.current, lista: listaRef.current ?? null, hayListaPrevia: hayPreviaRef.current,
        desdeProductos: Boolean(onVolverAProductosRef.current), productos: productosRef.current });
      if (accion === 'nada') return false;
      if (accion === 'volver-a-productos') { onVolverAProductosRef.current?.(); return true; }
      // Volver a la lista NO cierra la hoja: cambia su contenido. Cerrarla y reabrirla haría
      // desaparecer y reaparecer la hoja entera por un paso atrás.
      if (accion === 'volver-a-lista') { onVolverRef.current?.(); return true; }
      // No se llama a onCerrar directo: se le pide a la hoja que se cierre con su propia
      // animación, y es su `onClose` (más abajo) quien avisa al padre cuando ya terminó.
      sheetRef.current?.close();
      return true;
    });
    return () => sub.remove();
  }, []));

  // Con la lista de productos asomada el fondo ni se ve ni come toques: el mapa sigue usable
  // (ver `fondoHoja`). Con ficha o celda, como siempre.
  const { appearsOnIndex, disappearsOnIndex } = fondoHoja(contenido);
  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={appearsOnIndex} disappearsOnIndex={disappearsOnIndex} pressBehavior="close" opacity={0.3} />
  ), [appearsOnIndex, disappearsOnIndex]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={PUNTOS_ANCLAJE}
      // Con snapPoints explícitos y el "dynamic sizing" (activado por defecto) puesto, la
      // librería espera a medir el contenido y puede insertar un tercer anclaje por su cuenta —
      // rompería el supuesto de este archivo de que el índice 0 es "asomada" y el 1 "abierta".
      enableDynamicSizing={false}
      enablePanDownToClose
      onClose={() => onCerrarRef.current()}
      onChange={(indice) => { setIndiceActual(indice); onCambiaIndice?.(indice); }}
      backdropComponent={renderBackdrop}
      backgroundStyle={e.fondo}
      handleIndicatorStyle={e.asa}
      accessibilityLabel={lista ? tituloCelda(errorLista ? 0 : lista.length) : punto ? `Ficha de ${punto.nombre}` : productos ? tituloListaProductos(productos) : 'Ficha del punto seleccionado'}
    >
      <BottomSheetScrollView contentContainerStyle={e.contenido}>
        {lista ? (
          <ListaCelda
            puntos={lista}
            error={errorLista}
            onReintentar={onReintentarLista}
            onElegir={(p) => onElegirDeLista?.(p)}
            onCerrar={() => sheetRef.current?.close()}
          />
        ) : punto ? (
          <FichaPunto punto={punto} desplegada={indiceActual === 1} onCerrar={() => sheetRef.current?.close()}
            onDesplegar={() => sheetRef.current?.snapToIndex(1)}
            // La celda gana a productos: con una lista de celda detrás, se vuelve a ella.
            onVolverALista={onVolverALista ?? onVolverAProductos}
            etiquetaVolver={onVolverALista ? undefined : etiquetaVolver}
            tab={tab} q={q} productoMarcado={productoMarcado} />
        ) : productos ? (
          <ListaProductos {...productos} onCerrar={() => sheetRef.current?.close()} />
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const e = StyleSheet.create({
  fondo: { borderTopLeftRadius: radios.grande, borderTopRightRadius: radios.grande },
  asa: { backgroundColor: sand[300], width: 40 },
  contenido: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
});

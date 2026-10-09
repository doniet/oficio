import { useId } from 'react';
import HojaPunto from './HojaPunto';
import PanelLateral from './PanelLateral';
import FichaPunto from './FichaPunto';
import ListaCelda from './ListaCelda';
import { usarEsEscritorio, usarPanel } from './usarPanel';
import type { CatalogItem, PuntoMapa } from '../../types';

/**
 * La superficie donde el mapa enseña lo que el usuario toca. Elige el envoltorio (hoja inferior
 * o panel lateral) y el contenido (la ficha de un punto o la lista de una celda); ni el envoltorio
 * sabe qué muestra ni el contenido sabe dónde está.
 */
export default function PanelMapa({
  punto, lista, tab, q, errorLista, onReintentarLista, onElegirDeLista, onVolverALista, productoMarcado, etiquetaVolver, onCerrar, focoOrigen,
}: {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  /** Se reenvían tal cual a FichaPunto: con 'productos', cambia lo que se ve bajo «Ver perfil
   *  completo» (ver el comentario en FichaPunto.tsx). */
  tab?: string;
  q?: string;
  errorLista?: string;
  onReintentarLista?: () => void;
  onElegirDeLista(p: PuntoMapa): void;
  /** Presente solo si se llegó a la ficha desde una lista: pinta «Volver a la lista». */
  onVolverALista?: () => void;
  productoMarcado?: CatalogItem | null;
  etiquetaVolver?: string;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
}) {
  const tituloId = useId();
  const Envoltorio = usarEsEscritorio() ? PanelLateral : HojaPunto;

  // La clave distingue `punto:` de `lista`, pero las dos son "abierto": pasar de la lista a una
  // ficha NO empuja una entrada de historial nueva, porque es el mismo panel cambiando de
  // contenido. Si empujara una por cada paso, recorrer cinco negocios de una celda dejaría cinco
  // entradas y haría falta pulsar Atrás cinco veces para salir de Explorar.
  const abierta = punto ? `punto:${punto.id}` : lista ? 'lista' : null;

  // El historial y el foco viven AQUÍ y no en los envoltorios: este componente sobrevive al
  // cambio de envoltorio al cruzar los 1024 px, y ellos no.
  const { cerrar, limpiarEntradaPropia } = usarPanel({ abierta, onCerrar, focoOrigen });

  return (
    <Envoltorio abierta={abierta} tituloId={tituloId} cerrar={cerrar} onAntesDeNavegar={limpiarEntradaPropia}>
      {({ expandida, onAntesDeNavegar, cerrar }) => (punto ? (
        <FichaPunto
          punto={punto}
          tituloId={tituloId}
          expandida={expandida}
          tab={tab}
          q={q}
          onCerrar={cerrar}
          onAntesDeNavegar={onAntesDeNavegar}
          onVolverALista={onVolverALista}
          productoMarcado={productoMarcado}
          etiquetaVolver={etiquetaVolver}
        />
      ) : (
        <ListaCelda
          puntos={lista ?? []}
          tituloId={tituloId}
          onElegir={onElegirDeLista}
          onCerrar={cerrar}
          error={errorLista}
          onReintentar={onReintentarLista}
        />
      ))}
    </Envoltorio>
  );
}

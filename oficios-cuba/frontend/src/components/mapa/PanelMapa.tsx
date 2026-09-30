import { useId } from 'react';
import HojaPunto from './HojaPunto';
import PanelLateral from './PanelLateral';
import FichaPunto from './FichaPunto';
import ListaCelda from './ListaCelda';
import { usarEsEscritorio } from './usarPanel';
import type { PuntoMapa } from '../../types';

/**
 * La superficie donde el mapa enseña lo que el usuario toca. Elige el envoltorio (hoja inferior
 * o panel lateral) y el contenido (la ficha de un punto o la lista de una celda); ni el envoltorio
 * sabe qué muestra ni el contenido sabe dónde está.
 */
export default function PanelMapa({
  punto, lista, errorLista, onReintentarLista, onElegirDeLista, onVolverALista, onCerrar, focoOrigen,
}: {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  errorLista?: string;
  onReintentarLista?: () => void;
  onElegirDeLista(p: PuntoMapa): void;
  /** Presente solo si se llegó a la ficha desde una lista: pinta «Volver a la lista». */
  onVolverALista?: () => void;
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

  return (
    <Envoltorio abierta={abierta} tituloId={tituloId} onCerrar={onCerrar} focoOrigen={focoOrigen}>
      {({ expandida, onAntesDeNavegar, cerrar }) => (punto ? (
        <FichaPunto
          punto={punto}
          tituloId={tituloId}
          expandida={expandida}
          onCerrar={cerrar}
          onAntesDeNavegar={onAntesDeNavegar}
          onVolverALista={onVolverALista}
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

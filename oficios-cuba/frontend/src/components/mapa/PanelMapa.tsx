import { useId } from 'react';
import HojaPunto from './HojaPunto';
import FichaPunto from './FichaPunto';
import type { PuntoMapa } from '../../types';

/**
 * La superficie donde el mapa enseña lo que el usuario toca. Elige el envoltorio y el contenido;
 * ni el envoltorio sabe qué muestra ni el contenido sabe dónde está.
 */
export default function PanelMapa({ punto, onCerrar, focoOrigen }: {
  punto: PuntoMapa | null;
  lista: PuntoMapa[] | null;
  onElegirDeLista(p: PuntoMapa): void;
  onCerrar(): void;
  focoOrigen?: HTMLElement | null;
}) {
  const tituloId = useId();

  return (
    <HojaPunto abierta={punto ? `punto:${punto.id}` : null} tituloId={tituloId} onCerrar={onCerrar} focoOrigen={focoOrigen}>
      {({ expandida, onAntesDeNavegar, cerrar }) => (punto ? (
        <FichaPunto
          punto={punto}
          tituloId={tituloId}
          expandida={expandida}
          onCerrar={cerrar}
          onAntesDeNavegar={onAntesDeNavegar}
        />
      ) : null)}
    </HojaPunto>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { apiError, providerApi } from '../../services/api';
import { telLink, whatsappLink } from '../../lib/format';
import { Avatar, ErrorState, RatingInline, Spinner } from '../ui';
import { NegocioChip } from '../cards';
import type { ProviderPublic, PuntoMapa } from '../../types';

/**
 * El CONTENIDO de la ficha de un punto del mapa. No sabe nada del envoltorio que lo contiene:
 * sirve igual dentro de la hoja inferior de móvil que del panel lateral de escritorio.
 *
 * `expandida` es lo que decide si se pide el perfil completo. La hoja móvil lo pone a true solo
 * cuando el usuario la despliega — en la conexión que esta app apunta a servir, no se pide lo que
 * no se está mirando —; el panel lateral, donde sobra sitio y no hay dos alturas, lo pone siempre.
 */
export default function FichaPunto({ punto, tituloId, expandida, onCerrar, onAntesDeNavegar, onVolverALista }: {
  punto: PuntoMapa;
  tituloId: string;
  expandida: boolean;
  onCerrar(): void;
  /** Se llama justo antes de navegar a /proveedor/:id, para soltar la entrada de historial. */
  onAntesDeNavegar(): void;
  /** Ausente = no se llegó desde una lista de celda. Presente = pinta «Volver a la lista». */
  onVolverALista?: () => void;
}) {
  const [perfil, setPerfil] = useState<ProviderPublic | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState('');
  const [reintentos, setReintentos] = useState(0);

  // El id ya pedido. Antes esto se hacía con un efecto que ponía `setPerfil(null)` al cambiar de
  // punto y con `perfil` entre las dependencias del efecto de carga: el resultado era que al pasar
  // de A a B se pedía B DOS veces — una con el perfil de A todavía puesto, y otra en cuanto el
  // reset cambiaba esa dependencia. Con un ref no hay dependencia que cambiar.
  const pedidoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!expandida) return;
    if (pedidoRef.current === punto.id) return;
    pedidoRef.current = punto.id;
    let cancelado = false;
    setCargandoPerfil(true);
    setErrorPerfil('');
    providerApi.getById(punto.id)
      // Sin `.finally()`: `setPerfil` cambia una dependencia de este mismo efecto, así que React
      // lo desmonta (pone `cancelado = true`) en cuanto se aplica — antes de que un `.finally()`
      // aparte llegue a mirar la misma variable. Con `.finally()` eso dejaba `cargandoPerfil` en
      // true para siempre pese a haber cargado bien: apagarlo junto con `setPerfil`, en la misma
      // pasada, evita la ventana entre un microtask y el otro.
      .then((r) => {
        if (cancelado) return;
        setPerfil(r.data.provider);
        setCargandoPerfil(false);
      })
      .catch((err) => {
        if (cancelado) return;
        setErrorPerfil(apiError(err, 'No pudimos cargar la ficha completa.'));
        setCargandoPerfil(false);
      });
    return () => { cancelado = true; };
    // `reintentos` no lo lee el cuerpo: solo está para que "Reintentar" fuerce otra pasada (el
    // manejador borra antes `pedidoRef`, que si no bloquearía el reintento del mismo id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto.id, expandida, reintentos]);

  // Lo que se pinta tiene que ser el perfil DE ESTE punto: entre que se toca otro y llega su
  // respuesta, `perfil` todavía guarda el anterior, y pintarlo mostraría el teléfono de un
  // negocio bajo el nombre de otro.
  const perfilVigente = perfil?.id === punto.id ? perfil : null;

  const telefonoContacto = perfilVigente?.whatsapp ?? null;
  const mostrarWhatsapp = Boolean(telefonoContacto) && perfilVigente?.contact_mode !== 'call';
  const mostrarLlamar = Boolean(telefonoContacto) && perfilVigente?.contact_mode !== 'whatsapp';
  const lugar = [perfilVigente?.municipality_name, perfilVigente?.province_name].filter(Boolean).join(', ');

  return (
    <>
      {onVolverALista && (
        <button type="button" onClick={onVolverALista} className="btn-ghost btn-sm -ml-2 mb-2">
          <ArrowLeft className="h-4 w-4" /> Volver a la lista
        </button>
      )}

      <div className="flex items-start gap-3">
        <Avatar name={punto.nombre} size="md" square={punto.tipo === 'negocio'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id={tituloId} className="truncate text-lg font-bold text-ink-900">{punto.nombre}</h2>
            {punto.tipo === 'negocio' && <NegocioChip />}
          </div>
          {punto.resumen && <p className="mt-1 line-clamp-2 text-sm text-ink-600">{punto.resumen}</p>}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="-m-2 shrink-0 rounded-xl p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          aria-label="Cerrar la ficha"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <Link to={`/proveedor/${punto.id}`} onClick={onAntesDeNavegar} className="link mt-3 inline-block text-sm">
        Ver perfil completo
      </Link>

      {expandida && (
        <div className="mt-5 border-t border-sand-200 pt-5">
          {cargandoPerfil && (
            <div className="flex justify-center py-6" role="status" aria-label="Cargando la ficha completa">
              <Spinner />
            </div>
          )}
          {errorPerfil && <ErrorState message={errorPerfil} onRetry={() => { pedidoRef.current = null; setReintentos((n) => n + 1); }} />}
          {perfilVigente && !cargandoPerfil && (
            <div className="space-y-4">
              <RatingInline rating={perfilVigente.rating} count={perfilVigente.review_count} />
              {perfilVigente.description && <p className="text-sm text-ink-700">{perfilVigente.description}</p>}
              {lugar && <p className="text-sm text-ink-500">{lugar}</p>}
              {perfilVigente.horario && <p className="text-sm text-ink-500">Horario: {perfilVigente.horario}</p>}
              {perfilVigente.categories.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {perfilVigente.categories.map((c) => <li key={c} className="badge bg-sand-100 text-ink-700">{c}</li>)}
                </ul>
              )}
              {(mostrarWhatsapp || mostrarLlamar) && telefonoContacto && (
                <div className="grid grid-cols-2 gap-2">
                  {mostrarWhatsapp && (
                    <a
                      href={whatsappLink(telefonoContacto, `Hola, vi tu perfil en Encuentrauno y me gustaría consultarte un trabajo.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => providerApi.contact(punto.id, 'whatsapp')}
                      className="btn-whatsapp btn-sm"
                    >
                      WhatsApp
                    </a>
                  )}
                  {mostrarLlamar && (
                    <a href={telLink(telefonoContacto)} onClick={() => providerApi.contact(punto.id, 'call')} className="btn-secondary btn-sm">Llamar</a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

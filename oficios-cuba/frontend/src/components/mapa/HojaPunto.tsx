import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { apiError, providerApi } from '../../services/api';
import { telLink, whatsappLink } from '../../lib/format';
import { Avatar, ErrorState, RatingInline, Spinner } from '../ui';
import { NegocioChip } from '../cards';
import { usarPanel } from './usarPanel';
import type { ProviderPublic, PuntoMapa } from '../../types';

// Nombre de la variable CSS que expone cuánto de la parte de abajo del viewport ocupa la
// hoja ahora mismo (en px; "0px" cuando está cerrada). El mapa la necesita para recolocar el
// botón «Buscar en esta zona» por encima — ver el comentario al final del archivo, que la
// Tarea 7 debe leer porque este componente no puede tocar MapaExplorar.tsx.
const VAR_ALTO_HOJA = '--hoja-punto-alto';

const ALTO_ABIERTA_VH = 85;
const ALTO_ASOMADA_VH = 30;
// Distancia mínima de arrastre (px) para que cuente como arrastre y no como toque en el asa.
const UMBRAL_TOQUE = 6;
// Cuánto hay que pasarse de "asomada" arrastrando hacia abajo para que la hoja se cierre.
const HOLGURA_CIERRE = 60;
// Rebote permitido arrastrando hacia arriba, más allá de "abierta" del todo (sensación de tope
// blando en vez de un corte seco).
const REBOTE_ARRIBA = 24;
// Cuánto se deja arrastrar hacia abajo pasado el umbral de cierre antes de topar del todo
// (algo de margen visual mientras `terminarArrastre` decide si cierra).
const REBOTE_CIERRE = 80;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

type Posicion = 'asomada' | 'abierta';

export default function HojaPunto({ punto, onCerrar, focoOrigen }: {
  punto: PuntoMapa | null;
  onCerrar(): void;
  /**
   * Elemento al que devolver el foco al cerrar (normalmente el marcador que abrió la hoja).
   * Opcional: si no se da, se usa el `document.activeElement` capturado al abrir — que ya
   * cubre el caso normal si el marcador es un elemento enfocable. Es la vía que le queda al
   * padre (Tarea 7) para afinar esto sin que esta hoja dependa de su código.
   */
  focoOrigen?: HTMLElement | null;
}) {
  const [posicion, setPosicion] = useState<Posicion>('asomada');
  const [offsetArrastre, setOffsetArrastre] = useState<number | null>(null);
  const [perfil, setPerfil] = useState<ProviderPublic | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState('');
  const [reintentos, setReintentos] = useState(0);
  // Fuerza a recalcular las anclas (en px) si cambia el tamaño de la ventana.
  const [, tocar] = useState(0);

  const tituloId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const arrastreRef = useRef<{ inicioY: number } | null>(null);
  const huboArrastreRef = useRef(false);

  // Historial, Esc, Atrás, trampa de foco y bloqueo de scroll viven en el hook: son idénticos en
  // la hoja y en el panel lateral, y tenerlos dos veces era la forma segura de que uno de los dos
  // se quedara atrás en el próximo cambio.
  const { cerrar, limpiarEntradaPropia } = usarPanel({
    abierta: punto?.id ?? null,
    onCerrar,
    focoOrigen,
    contenedorRef: sheetRef,
  });

  // Al abrir un punto nuevo: vuelve a "asomada" y limpia la ficha completa de otro punto.
  useEffect(() => {
    if (!punto) return;
    setPosicion('asomada');
    setPerfil(null);
    setErrorPerfil('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto?.id]);

  // La ficha completa ("abierta") se pide a la API la primera vez que se despliega, no antes.
  useEffect(() => {
    if (!punto || posicion !== 'abierta') return;
    if (perfil?.id === punto.id) return;
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
    // `reintentos` no lo lee el cuerpo: solo está para que "Reintentar" fuerce otra pasada,
    // porque un fallo deja `perfil` en null igual que antes de pedir nada (si no, el efecto no
    // tendría por qué volver a correr).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto, posicion, perfil, reintentos]);

  useEffect(() => {
    const onResize = () => tocar((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const altoVentana = typeof window !== 'undefined' ? window.innerHeight : 800;
  const altoAbierta = Math.round((altoVentana * ALTO_ABIERTA_VH) / 100);
  const altoAsomada = Math.round((altoVentana * ALTO_ASOMADA_VH) / 100);
  const offsetAsomada = altoAbierta - altoAsomada;
  const offsetBase = posicion === 'abierta' ? 0 : offsetAsomada;
  const offsetActual = offsetArrastre === null
    ? offsetBase
    : clamp(offsetBase + offsetArrastre, -REBOTE_ARRIBA, offsetAsomada + HOLGURA_CIERRE + REBOTE_CIERRE);

  // Comunica al mapa (fuera de nuestro control) cuánto tapa la hoja ahora mismo.
  useEffect(() => {
    const altoVisible = punto ? Math.max(0, altoAbierta - offsetActual) : 0;
    document.documentElement.style.setProperty(VAR_ALTO_HOJA, `${Math.round(altoVisible)}px`);
  }, [punto, altoAbierta, offsetActual]);

  useEffect(() => () => { document.documentElement.style.removeProperty(VAR_ALTO_HOJA); }, []);

  const onAsaPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { inicioY: e.clientY };
    huboArrastreRef.current = false;
    setOffsetArrastre(0);
  };
  const onAsaPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!arrastreRef.current) return;
    const delta = e.clientY - arrastreRef.current.inicioY;
    if (Math.abs(delta) > UMBRAL_TOQUE) huboArrastreRef.current = true;
    setOffsetArrastre(delta);
  };
  const terminarArrastre = () => {
    if (!arrastreRef.current) return;
    const delta = offsetArrastre ?? 0;
    arrastreRef.current = null;
    setOffsetArrastre(null);
    if (!huboArrastreRef.current) return; // fue un toque: lo resuelve el onClick del asa
    const final = offsetBase + delta;
    if (final > offsetAsomada + HOLGURA_CIERRE) { cerrar(); return; }
    setPosicion(final > offsetAsomada / 2 ? 'asomada' : 'abierta');
  };
  const onAsaClick = () => {
    if (huboArrastreRef.current) { huboArrastreRef.current = false; return; }
    setPosicion((p) => (p === 'abierta' ? 'asomada' : 'abierta'));
  };

  if (!punto) return null;

  const telefonoContacto = perfil?.whatsapp ?? null;
  const mostrarWhatsapp = Boolean(telefonoContacto) && perfil?.contact_mode !== 'call';
  const mostrarLlamar = Boolean(telefonoContacto) && perfil?.contact_mode !== 'whatsapp';
  const lugar = [perfil?.municipality_name, perfil?.province_name].filter(Boolean).join(', ');

  return (
    // pointer-events-none: el mapa detrás sigue recibiendo toques salvo bajo la propia hoja.
    // z-[500]: por encima de los controles flotantes de MapaExplorar (z-[400], la escala de
    // Leaflet que usa el resto del mapa — ver ProvinceMapSelector.tsx), incluido el botón
    // «Buscar en esta zona» que esta hoja existe justamente para no tapar. La variable CSS
    // --hoja-punto-alto de más abajo no sirve de nada si el botón, aun recolocado, queda
    // pintado por debajo de la hoja.
    <div className="pointer-events-none fixed inset-0 z-[500]">
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="pointer-events-auto fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-lift outline-none"
        style={{
          height: `${altoAbierta}px`,
          transform: `translateY(${offsetActual}px)`,
          transition: offsetArrastre === null ? 'transform .32s cubic-bezier(.2,.7,.2,1)' : 'none',
        }}
      >
        <button
          type="button"
          onClick={onAsaClick}
          onPointerDown={onAsaPointerDown}
          onPointerMove={onAsaPointerMove}
          onPointerUp={terminarArrastre}
          onPointerCancel={terminarArrastre}
          aria-label={posicion === 'abierta' ? 'Recoger la ficha' : 'Ver la ficha completa'}
          className="flex w-full shrink-0 cursor-grab touch-none items-center justify-center py-2.5 active:cursor-grabbing"
        >
          <span className="h-1.5 w-10 rounded-full bg-sand-300" aria-hidden="true" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
              onClick={cerrar}
              className="-m-2 shrink-0 rounded-xl p-2 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
              aria-label="Cerrar la ficha"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <Link to={`/proveedor/${punto.id}`} onClick={limpiarEntradaPropia} className="link mt-3 inline-block text-sm">
            Ver perfil completo
          </Link>

          {posicion === 'abierta' && (
            <div className="mt-5 border-t border-sand-200 pt-5">
              {cargandoPerfil && (
                <div className="flex justify-center py-6" role="status" aria-label="Cargando la ficha completa">
                  <Spinner />
                </div>
              )}
              {errorPerfil && <ErrorState message={errorPerfil} onRetry={() => setReintentos((n) => n + 1)} />}
              {perfil && !cargandoPerfil && (
                <div className="space-y-4">
                  <RatingInline rating={perfil.rating} count={perfil.review_count} />
                  {perfil.description && <p className="text-sm text-ink-700">{perfil.description}</p>}
                  {lugar && <p className="text-sm text-ink-500">{lugar}</p>}
                  {perfil.horario && <p className="text-sm text-ink-500">Horario: {perfil.horario}</p>}
                  {perfil.categories.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {perfil.categories.map((c) => <li key={c} className="badge bg-sand-100 text-ink-700">{c}</li>)}
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
        </div>
      </div>
    </div>
  );
}

// Contrato con quien monte esta hoja junto al mapa: mientras está abierta, mantiene la variable
// CSS `--hoja-punto-alto` en `document.documentElement` con la altura (en px, p. ej. "320px") que
// ocupa desde abajo del viewport en cada instante — "0px" cuando está cerrada, y cambia en vivo
// mientras se arrastra. El botón «Cerca de mí» de `MapaExplorar.tsx` la lee en su `bottom` para no
// quedar debajo.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { apiError, providerApi } from '../../services/api';
import { telLink, whatsappLink } from '../../lib/format';
import { Avatar, ErrorState, PlanBadge, RatingInline, Spinner } from '../ui';
import { NegocioChip } from '../cards';
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
  const puntoRef = useRef(punto);
  const onCerrarRef = useRef(onCerrar);
  const elementoAlAbrirRef = useRef<HTMLElement | null>(null);
  const arrastreRef = useRef<{ inicioY: number } | null>(null);
  const huboArrastreRef = useRef(false);
  const habiaPuntoRef = useRef(false);
  const historiaEmpujadaRef = useRef(false);
  const teniaPuntoParaFocoRef = useRef(false);

  puntoRef.current = punto;
  onCerrarRef.current = onCerrar;

  // Cierra: si la hoja dejó una entrada propia en el historial, retrocede (el popstate de abajo
  // hace el resto); si no, avisa directo. Así el botón Atrás y las demás formas de cerrar
  // (Esc, la X, soltar arrastrando bastante) pasan siempre por el mismo camino.
  const cerrar = useCallback(() => {
    if (historiaEmpujadaRef.current && window.history.state?.hojaPunto) {
      window.history.back();
    } else {
      onCerrarRef.current();
    }
  }, []);

  // Quita la marca de nuestra entrada sin navegar, para cuando la hoja se cierra por una vía
  // que NO es cerrar() (el enlace "Ver perfil completo", u otro que el padre decida): si no se
  // limpiara, la entrada {hojaPunto:true} queda huérfana bajo la ruta nueva y hace falta un
  // segundo Atrás, sin efecto visible, para salir de verdad de Explorar.
  const limpiarEntradaPropia = useCallback(() => {
    if (historiaEmpujadaRef.current && window.history.state?.hojaPunto) {
      window.history.replaceState(null, '');
    }
    historiaEmpujadaRef.current = false;
  }, []);

  // Al abrir un punto nuevo: vuelve a "asomada", limpia la ficha completa de otro punto y
  // recuerda quién tenía el foco para devolvérselo al cerrar.
  useEffect(() => {
    if (!punto) return;
    setPosicion('asomada');
    setPerfil(null);
    setErrorPerfil('');
    elementoAlAbrirRef.current = focoOrigen ?? (document.activeElement as HTMLElement | null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punto?.id]);

  // Una sola entrada de historial por apertura (cambiar de punto sin cerrar no añade otra).
  // Si `punto` pasa a null sin haber pasado por cerrar() (el padre lo puso en null por su
  // cuenta), limpia igual la entrada en vez de dejarla huérfana.
  useEffect(() => {
    const abierto = Boolean(punto);
    if (abierto && !habiaPuntoRef.current) {
      window.history.pushState({ hojaPunto: true }, '');
      historiaEmpujadaRef.current = true;
    } else if (!abierto) {
      limpiarEntradaPropia();
    }
    habiaPuntoRef.current = abierto;
  }, [Boolean(punto), limpiarEntradaPropia]);

  // Red de seguridad: si el componente se desmonta entero (p. ej. cambia de ruta) mientras
  // nuestra entrada de historial sigue siendo la actual, sin haber pasado por ningún camino
  // de cierre, límpiala igual.
  useEffect(() => () => limpiarEntradaPropia(), [limpiarEntradaPropia]);

  // El botón Atrás del navegador (o cualquier otro pop del historial) cierra la hoja sin
  // recargar la página ni sacar al usuario de Explorar.
  useEffect(() => {
    const onPopState = () => {
      if (puntoRef.current) onCerrarRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Devuelve el foco a quien abrió la hoja justo cuando termina de cerrarse. Lleva su propia
  // referencia de "había punto" (en vez de reusar habiaPuntoRef) porque ese otro ref ya lo
  // actualiza, para este mismo render, el efecto del historial que corre antes que este.
  useEffect(() => {
    if (!punto && teniaPuntoParaFocoRef.current && elementoAlAbrirRef.current) {
      elementoAlAbrirRef.current.focus?.();
      elementoAlAbrirRef.current = null;
    }
    teniaPuntoParaFocoRef.current = Boolean(punto);
  }, [punto]);

  // Esc cierra.
  useEffect(() => {
    if (!punto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [punto, cerrar]);

  // Con la hoja abierta, el fondo no hace scroll (igual que el resto de los diálogos del sitio).
  useEffect(() => {
    if (!punto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [punto]);

  // Atrapa el foco de teclado dentro de la hoja y lo manda al primer control al abrir.
  useEffect(() => {
    if (!punto) return;
    const contenedor = sheetRef.current;
    if (!contenedor) return;
    const enfocables = () => Array.from(
      contenedor.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null);

    (enfocables()[0] ?? contenedor).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = enfocables();
      if (els.length === 0) { e.preventDefault(); return; }
      const primero = els[0];
      const ultimo = els[els.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    contenedor.addEventListener('keydown', onKey);
    return () => contenedor.removeEventListener('keydown', onKey);
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
                {punto.plan === 'pro' && <PlanBadge plan="pro" />}
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

// Contrato con la Tarea 7 (MapaExplorar.tsx / la página que la monta): mientras la hoja está
// abierta, esta hoja mantiene la variable CSS `--hoja-punto-alto` en `document.documentElement`
// con la altura (en px, p. ej. "320px") que ocupa desde abajo del viewport en cada instante —
// "0px" cuando está cerrada, y cambia en vivo mientras se arrastra. El botón «Buscar en esta
// zona» vive en MapaExplorar.tsx, que esta tarea tiene prohibido tocar: para que no quede
// tapado, hace falta darle un `bottom` que la lea, por ejemplo con una clase arbitraria de
// Tailwind: `bottom-[calc(var(--hoja-punto-alto,0px)+1rem)]`, o el `style` equivalente
// (`bottom: 'calc(var(--hoja-punto-alto, 0px) + 16px)'`). Sin ese cambio en MapaExplorar.tsx
// (o en la página que junta ambos componentes), el botón queda debajo de la hoja cuando está
// asomada o abierta.

import { useEffect, useState } from 'react';
import { ChevronDown, Download, ShieldCheck, Smartphone } from 'lucide-react';
import { cn } from './ui';

// El APK no va en la imagen de la web: vive en descargas/ de vps2 (montada en nginx) junto a
// android.json, que escribe mobile/scripts/publicar-apk.sh. Sin ese archivo no se ofrece la descarga.
export interface InfoApk {
  version: string;
  archivo: string;
  bytes: number;
  sha256: string;
  android_min: string;
  publicado: string;
}

let pendiente: Promise<InfoApk | null> | null = null;

function cargarInfo() {
  pendiente ??= fetch('/descargas/android.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: InfoApk | null) => (d?.archivo && d.version ? d : null))
    .catch(() => null);
  return pendiente;
}

export function useInfoApk() {
  const [info, setInfo] = useState<InfoApk | null>(null);
  useEffect(() => {
    let vivo = true;
    cargarInfo().then((d) => vivo && setInfo(d));
    return () => { vivo = false; };
  }, []);
  return info;
}

const esIphone = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
const megas = (bytes: number) => `${Math.round(bytes / 1_048_576)} MB`;
const urlApk = (info: InfoApk) => `/descargas/${encodeURIComponent(info.archivo)}`;

const PASOS = [
  'Toca «Descargar APK» y espera a que termine (con datos móviles, mejor con buena cobertura).',
  'Abre el archivo desde las notificaciones o la carpeta Descargas.',
  'Si Android lo pide, permite «Instalar apps desconocidas» para tu navegador y vuelve a abrirlo.',
];

/** Sección de la portada: la app para Android. */
export function SeccionApp() {
  const info = useInfoApk();
  const [pasos, setPasos] = useState(false);
  if (!info) return null;
  const iphone = esIphone();

  return (
    <section className="container-page pt-12" aria-labelledby="titulo-app">
      <div className="relative overflow-hidden rounded-4xl bg-ink-950 px-6 py-10 text-white sm:px-12 sm:py-14">
        <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-brand-600/25 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-28 right-10 h-56 w-56 rounded-full bg-sea-600/20 blur-2xl" aria-hidden="true" />

        <div className="relative grid items-center gap-10 md:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-300">App para Android</p>
            <h2 id="titulo-app" className="mt-3 text-balance text-3xl font-bold text-white sm:text-4xl">Oficios Cuba en tu teléfono</h2>
            <p className="mt-3 text-ink-300">
              Busca, escríbele al profesional y recibe un aviso cuando te responda. Gratis, sin tienda de apps y pensada para conexiones lentas.
            </p>

            {iphone ? (
              <p className="mt-7 inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm text-ink-200">
                <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
                Por ahora es solo para Android. La versión para iPhone está en camino.
              </p>
            ) : (
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href={urlApk(info)} download={info.archivo} className="btn-primary btn-lg">
                  <Download className="h-5 w-5" aria-hidden="true" />
                  Descargar APK
                </a>
                <p className="text-sm text-ink-400">
                  Versión {info.version} · {megas(info.bytes)} · Android {info.android_min} o superior
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setPasos((v) => !v)}
              aria-expanded={pasos}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 underline-offset-4 hover:underline"
            >
              ¿Cómo instalarla?
              <ChevronDown className={cn('h-4 w-4 transition-transform', pasos && 'rotate-180')} aria-hidden="true" />
            </button>
            {pasos && (
              <div className="animate-fade-in">
                <ol className="mt-4 space-y-3">
                  {PASOS.map((p, i) => (
                    <li key={p} className="flex gap-3 text-sm text-ink-300">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{i + 1}</span>
                      <span className="pt-0.5">{p}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 flex items-start gap-2 text-xs text-ink-500">
                  <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-sea-400" aria-hidden="true" />
                  <span className="min-w-0">
                    Firmada por DARDOIT. Huella SHA-256 del archivo:
                    <span className="mt-1 block break-all font-mono text-[11px] text-ink-400">{info.sha256}</span>
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="hidden justify-center md:flex" aria-hidden="true">
            <img src="/app-icono.png" alt="" width={160} height={160} className="h-40 w-40 rotate-3 rounded-[2.25rem] shadow-lift ring-1 ring-white/10" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Elemento de lista para el pie de página (sin APK publicado no pinta nada, ni el <li>). */
export function EnlaceApp({ className }: { className?: string }) {
  const info = useInfoApk();
  if (!info || esIphone()) return null;
  return (
    <li>
      <a href={urlApk(info)} download={info.archivo} className={className}>
        Descarga la app (Android)
      </a>
    </li>
  );
}

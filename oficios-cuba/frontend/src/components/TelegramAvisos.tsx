import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, ExternalLink, Send, Unlink } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { apiError, telegramApi } from '../services/api';
import type { TelegramGroupId, TelegramStatus } from '../types';
import { parseDate } from '../lib/format';
import { Alert, Spinner, cn } from './ui';
import { ConfirmDialog, FormSection } from '../pages/dashboard/parts';

const ESPERA_MS = 3000;
const MAX_ESPERA_MS = 10 * 60_000;

function Interruptor({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="h-6 w-11 rounded-full bg-sand-300 transition peer-checked:bg-sea-500 peer-focus-visible:ring-2 peer-focus-visible:ring-sea-500/40" />
      <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </span>
  );
}

export default function TelegramAvisos() {
  const toast = useToast();
  const [estado, setEstado] = useState<TelegramStatus | null>(null);
  const [error, setError] = useState('');
  const [conectando, setConectando] = useState(false);
  const [enlace, setEnlace] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const temporizador = useRef<number | null>(null);

  const parar = useCallback(() => {
    if (temporizador.current !== null) window.clearInterval(temporizador.current);
    temporizador.current = null;
    setEsperando(false);
  }, []);

  useEffect(() => {
    telegramApi.status().then((r) => setEstado(r.data)).catch((err) => setError(apiError(err, 'No se pudo cargar el estado de Telegram.')));
    return parar;
  }, [parar]);

  // Tras abrir el bot, se consulta hasta que el usuario pulse «Iniciar» (o caduque el enlace).
  const vigilar = () => {
    parar();
    setEsperando(true);
    const inicio = Date.now();
    temporizador.current = window.setInterval(async () => {
      if (Date.now() - inicio > MAX_ESPERA_MS) { parar(); setEnlace(null); return; }
      try {
        const r = await telegramApi.status();
        if (r.data.linked) {
          parar();
          setEnlace(null);
          setEstado(r.data);
          toast('Telegram conectado');
        }
      } catch { /* se reintenta en la siguiente vuelta */ }
    }, ESPERA_MS);
  };

  const conectar = async () => {
    setConectando(true);
    try {
      const { data } = await telegramApi.link();
      setEnlace(data.url);
      window.open(data.url, '_blank', 'noopener');
      vigilar();
    } catch (err) {
      toast(apiError(err, 'No se pudo generar el enlace.'), 'error');
    } finally {
      setConectando(false);
    }
  };

  const cambiar = async (id: TelegramGroupId, valor: boolean) => {
    if (!estado) return;
    const antes = estado;
    setEstado({ ...estado, prefs: { ...estado.prefs, [id]: valor } });
    try {
      const r = await telegramApi.setPrefs({ [id]: valor });
      setEstado(r.data);
    } catch (err) {
      setEstado(antes);
      toast(apiError(err, 'No se pudo guardar.'), 'error');
    }
  };

  const probar = async () => {
    setProbando(true);
    try {
      await telegramApi.test();
      toast('Te enviamos un aviso de prueba');
    } catch (err) {
      toast(apiError(err, 'No se pudo enviar la prueba.'), 'error');
    } finally {
      setProbando(false);
    }
  };

  const desconectar = async () => {
    setDesconectando(true);
    try {
      const r = await telegramApi.unlink();
      setEstado(r.data);
      setConfirmar(false);
      toast('Telegram desconectado');
    } catch (err) {
      toast(apiError(err, 'No se pudo desconectar.'), 'error');
    } finally {
      setDesconectando(false);
    }
  };

  if (error) return <FormSection title="Avisos por Telegram"><Alert>{error}</Alert></FormSection>;
  if (!estado) return <FormSection title="Avisos por Telegram"><div className="flex justify-center py-4 text-ink-400"><Spinner /></div></FormSection>;

  if (!estado.linked && !estado.available) {
    return (
      <section className="card flex items-start gap-3 p-5 opacity-70 sm:p-6">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-ink-400" />
        <div>
          <h2 className="text-lg font-bold">Avisos por Telegram <span className="badge bg-sand-200 text-ink-500">Muy pronto</span></h2>
          <p className="mt-0.5 text-sm text-ink-500">Te avisaremos en Telegram de tus citas, recordatorios y mensajes.</p>
        </div>
      </section>
    );
  }

  if (!estado.linked) {
    return (
      <FormSection title="Avisos por Telegram" description="Recibe en Telegram tus citas, recordatorios y mensajes nuevos. No compartimos tu número con nadie.">
        <button type="button" onClick={conectar} disabled={conectando} className="btn-primary w-full sm:w-auto">
          {conectando ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Conectar Telegram
        </button>
        <p className="text-sm text-ink-500">Se abrirá Telegram: pulsa «Iniciar». El enlace caduca en 10 minutos.</p>
        {enlace && (
          <div className="rounded-xl bg-sand-100 p-3 text-sm">
            {esperando && <p className="mb-1 flex items-center gap-2 text-ink-600"><Spinner className="h-4 w-4" /> Esperando a que pulses «Iniciar» en Telegram…</p>}
            <a href={enlace} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 font-semibold">
              Si no se abrió, toca aquí <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </FormSection>
    );
  }

  const fecha = estado.linked_at ? parseDate(estado.linked_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <FormSection title="Avisos por Telegram" description="Elige qué avisos quieres recibir.">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="badge bg-sea-100 text-sea-800">Conectado</span>
        {estado.bot_username && <span className="font-semibold text-ink-700">@{estado.bot_username}</span>}
        {fecha && <span className="text-ink-400">desde el {fecha}</span>}
      </div>
      {!estado.available && <Alert tone="info">Los envíos están en pausa por mantenimiento. Tus preferencias se guardan igual.</Alert>}
      <ul className="divide-y divide-sand-200 rounded-xl border border-sand-200">
        {estado.groups.map((g) => (
          <li key={g.id}>
            <label className="flex cursor-pointer items-start justify-between gap-4 p-3">
              <span className="min-w-0">
                <span className="block font-semibold text-ink-900">{g.label}</span>
                <span className="block text-sm text-ink-500">{g.description}</span>
              </span>
              <Interruptor checked={estado.prefs[g.id] ?? true} onChange={(v) => cambiar(g.id, v)} label={g.label} />
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={probar} disabled={probando || !estado.available} className={cn('btn-secondary', 'sm:flex-1')}>
          {probando ? <Spinner className="h-4 w-4" /> : <BellRing className="h-4 w-4" />} Enviar aviso de prueba
        </button>
        <button type="button" onClick={() => setConfirmar(true)} className="btn-ghost text-red-600 hover:bg-red-50 sm:flex-1">
          <Unlink className="h-4 w-4" /> Desconectar
        </button>
      </div>
      <ConfirmDialog open={confirmar} title="¿Desconectar Telegram?" confirmLabel="Desconectar" busy={desconectando} onConfirm={desconectar} onClose={() => setConfirmar(false)}>
        Dejarás de recibir avisos en Telegram. Puedes volver a conectarte cuando quieras.
      </ConfirmDialog>
    </FormSection>
  );
}

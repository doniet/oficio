import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError } from '../../services/api';
import { adminApi } from '../../services/adminApi';
import type { AdminTelegram } from '../../types';
import { relativeTime } from '../../lib/format';
import { Alert, ErrorState, Field, Modal, PageLoader, Spinner, cn } from '../../components/ui';
import { CodeInput, Stat, fechaHora } from './parts';

const ESTADOS: Record<string, string> = { pending: 'Pendientes', sent: 'Enviados', failed: 'Fallidos', skipped: 'Descartados' };

export default function TelegramTab() {
  const toast = useToast();
  const [data, setData] = useState<AdminTelegram | null>(null);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [ver, setVer] = useState(false);
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [quitar, setQuitar] = useState(false);
  const [codeQuitar, setCodeQuitar] = useState('');
  const [quitarError, setQuitarError] = useState('');
  const sondeo = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = (await adminApi.telegram()).data;
      setData(d);
      setError('');
      return d;
    } catch (err) {
      setError(apiError(err, 'No se pudo leer el estado de Telegram.'));
      return null;
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (sondeo.current) window.clearInterval(sondeo.current); }, []);

  // Tras guardar, el notificador tarda hasta ~10 s en releer el token y conectarse.
  const vigilar = () => {
    if (sondeo.current) window.clearInterval(sondeo.current);
    setConectando(true);
    const fin = Date.now() + 60_000;
    sondeo.current = window.setInterval(async () => {
      const d = await load();
      if ((d && (d.notifier.bot_username || d.token.error)) || Date.now() > fin) {
        window.clearInterval(sondeo.current!);
        sondeo.current = null;
        setConectando(false);
      }
    }, 5000);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) { setFormError('Pega el token que te dio @BotFather'); return; }
    if (code.length !== 6) { setFormError('Escribe un código nuevo de 6 cifras de tu app'); return; }
    setSaving(true);
    setFormError('');
    try {
      const { data: r } = await adminApi.setTelegramToken(token.trim(), code);
      setToken('');
      setVer(false);
      setCode('');
      toast(`Token guardado (···${r.hint})`);
      await load();
      vigilar();
    } catch (err) {
      setFormError(apiError(err, 'No se pudo guardar el token.'));
      setCode('');
    } finally {
      setSaving(false);
    }
  };

  const confirmarQuitar = async () => {
    if (codeQuitar.length !== 6) { setQuitarError('Escribe un código nuevo de 6 cifras'); return; }
    setSaving(true);
    setQuitarError('');
    try {
      await adminApi.deleteTelegramToken(codeQuitar);
      toast('Token quitado: el notificador deja de enviar');
      setQuitar(false);
      setCodeQuitar('');
      await load();
    } catch (err) {
      setQuitarError(apiError(err, 'No se pudo quitar el token.'));
      setCodeQuitar('');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return error ? <ErrorState message={error} onRetry={load} /> : <PageLoader />;

  const n = data.notifier;
  const t = data.token;
  let estadoBot: { texto: string; tono: string };
  if (!n.heartbeat || !n.alive) estadoBot = { texto: n.heartbeat ? 'Parado' : 'Nunca ha arrancado', tono: 'bg-red-100 text-red-700' };
  else if (n.bot_username) estadoBot = { texto: `Activo como @${n.bot_username}`, tono: 'bg-sea-100 text-sea-800' };
  else if (conectando && t.configured) estadoBot = { texto: 'Conectando…', tono: 'bg-amber-100 text-amber-800' };
  else estadoBot = { texto: t.configured ? 'En marcha, sin conectar' : 'En marcha, esperando token', tono: 'bg-amber-100 text-amber-800' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Avisos por Telegram</h2>
        <button type="button" onClick={load} className="btn-secondary btn-sm"><RefreshCw className="h-4 w-4" /> Refrescar</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Notificador</p>
          <span className={cn('badge', estadoBot.tono)}>{conectando && <Spinner className="h-3 w-3" />} {estadoBot.texto}</span>
          <p className="text-sm text-ink-600">Última señal: {n.heartbeat ? relativeTime(n.heartbeat) : '—'}</p>
          <p className="text-xs text-ink-400">Huella de su clave: <code className="font-mono">{n.key_fingerprint ?? '—'}</code></p>
        </div>
        <div className={cn('card space-y-2 p-4', t.error && 'ring-1 ring-red-300')}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Token del bot</p>
          <p className="font-display text-lg font-bold">{t.configured ? <>Configurado <span className="font-mono">···{t.hint}</span></> : 'Sin configurar'}</p>
          {t.updated_at && <p className="text-sm text-ink-600">Cambiado {fechaHora(t.updated_at)}</p>}
          {t.error && <p className="break-words text-sm font-semibold text-red-600">No funciona: {t.error}</p>}
          <p className="text-xs text-ink-400">Se guarda cifrado: solo el notificador puede leerlo. Nadie puede volver a verlo desde aquí.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Usuarios vinculados" value={data.linked_users} />
        {(['sent', 'pending', 'failed', 'skipped'] as const).map((k) => (
          <Stat key={k} label={`${ESTADOS[k]} (7 días)`} value={data.last7d[k] ?? 0} tone={k === 'failed' && data.last7d[k] ? 'bad' : undefined} />
        ))}
      </div>

      <form onSubmit={guardar} noValidate className="card space-y-4 p-4 sm:p-5">
        <div>
          <h3 className="font-bold">{t.configured ? 'Cambiar el token' : 'Pegar token de @BotFather'}</h3>
          <p className="mt-1 text-sm text-ink-500">En Telegram, abre @BotFather → /newbot (o /token para uno existente) y copia el token.</p>
        </div>
        {formError && <Alert>{formError}</Alert>}
        <Field label="Token" htmlFor="tg-token">
          <div className="flex gap-2">
            <input id="tg-token" type={ver ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)}
              autoComplete="off" spellCheck={false} placeholder="123456789:AA…" className="input min-w-0 flex-1 font-mono" />
            <button type="button" onClick={() => setVer((v) => !v)} className="btn-secondary px-3" aria-label={ver ? 'Ocultar token' : 'Mostrar token'}>
              {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Código de tu app" htmlFor="tg-code" hint="Usa un código nuevo de tu app (cambia cada 30 s): el que usaste para entrar ya no vale.">
          <CodeInput id="tg-code" value={code} onChange={setCode} />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {t.configured ? (
            <button type="button" onClick={() => { setQuitar(true); setQuitarError(''); }} className="btn-ghost text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Quitar token
            </button>
          ) : <span />}
          <button type="submit" disabled={saving} className="btn-primary">{saving && <Spinner className="h-4 w-4" />} Guardar token</button>
        </div>
      </form>

      <section>
        <h3 className="mb-3 font-bold">Últimos errores</h3>
        {data.recent_errors.length === 0 ? (
          <p className="card p-4 text-sm text-ink-400">Sin errores.</p>
        ) : (
          <ul className="card divide-y divide-sand-200">
            {data.recent_errors.map((e, i) => (
              <li key={i} className="p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-sand-100 text-ink-700">{e.kind}</span>
                  <span className="text-xs text-ink-400">{ESTADOS[e.status] ?? e.status} · {e.attempts} intentos · {fechaHora(e.created_at)}</span>
                </div>
                <p className="mt-1 break-words text-ink-700">{e.last_error}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={quitar} onClose={() => !saving && setQuitar(false)} title="¿Quitar el token del bot?">
        <div className="space-y-4 text-sm text-ink-600">
          <p>El notificador deja de enviar avisos al momento. Los usuarios siguen vinculados y vuelven a recibir avisos cuando pongas un token nuevo del mismo bot.</p>
          {quitarError && <Alert>{quitarError}</Alert>}
          <Field label="Código nuevo de tu app" htmlFor="tg-code-q"><CodeInput id="tg-code-q" value={codeQuitar} onChange={setCodeQuitar} autoFocus /></Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setQuitar(false)} disabled={saving} className="btn-secondary">Cancelar</button>
            <button type="button" onClick={confirmarQuitar} disabled={saving} className="btn-danger">{saving && <Spinner className="h-4 w-4" />} Quitar token</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banknote, Check, Clock, CreditCard, ExternalLink, Landmark, MessageSquareMore, Receipt } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { apiError, subscriptionApi } from '../../services/api';
import type { Payment, Plan, PlanInfo, Subscription } from '../../types';
import { DARDOIT_URL, parseDate, planLabel, planPrice, usd } from '../../lib/format';
import { useTasa } from '../../hooks/useTasa';
import { PageTitle } from '../../components/DashboardLayout';
import { Alert, ErrorState, Modal, PageLoader, PlanPill, Spinner, cn } from '../../components/ui';
import { ConfirmDialog } from './parts';

type PaidPlan = Exclude<Plan, 'free'>;
type Method = 'transfer' | 'cash';

const PLAN_ORDER: Plan[] = ['free', 'basic', 'pro'];

const paymentStatus: Record<Payment['status'], { label: string; cls: string }> = {
  pending: { label: 'En revisión', cls: 'bg-amber-100 text-amber-800' },
  succeeded: { label: 'Pagado', cls: 'bg-sea-100 text-sea-800' },
  failed: { label: 'Fallido', cls: 'bg-red-100 text-red-800' },
  refunded: { label: 'Reembolsado', cls: 'bg-sand-200 text-ink-600' },
};

const longDate = (v: string) => parseDate(v).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

interface MeResponse {
  provider: { id: string; subscription_plan: Plan; subscription_expires_at: string | null };
  subscription?: Subscription | null;
  payments: Payment[];
  service_count: number;
}

function ReportPayment({ subscriptionId, onDone }: { subscriptionId: string; onDone: () => void }) {
  const toast = useToast();
  const [tx, setTx] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (tx.trim().length < 3) { setError('Escribe el número de transacción o el comprobante'); return; }
    setSending(true);
    setError('');
    try {
      const res = await subscriptionApi.confirmManual({ subscription_id: subscriptionId, transaction_id: tx.trim() });
      toast(res.data.message);
      setTx('');
      onDone();
    } catch (err) {
      setError(apiError(err, 'No se pudo reportar el pago.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1">
        <label htmlFor="txid" className="sr-only">Número de transacción</label>
        <input id="txid" value={tx} onChange={(e) => { setTx(e.target.value); setError(''); }} maxLength={80}
          placeholder="Nº de transacción o comprobante" className={cn('input bg-white', error && 'input-error')} aria-invalid={Boolean(error)} />
        {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
      </div>
      <button type="submit" disabled={sending} className="btn-dark">{sending && <Spinner className="h-4 w-4" />} Reportar pago</button>
    </form>
  );
}

export default function MySubscription() {
  const toast = useToast();
  const tasa = useTasa();
  const [data, setData] = useState<MeResponse | null>(null);
  const [plans, setPlans] = useState<Record<Plan, PlanInfo> | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<PaidPlan | null>(null);
  const [method, setMethod] = useState<Method>('transfer');
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [params, setParams] = useSearchParams();

  const load = useCallback(async () => {
    setError('');
    try {
      const [me, pl] = await Promise.all([subscriptionApi.getMine(), subscriptionApi.getPlans()]);
      setData(me.data);
      setPlans(pl.data.plans);
      setDemo(Boolean(pl.data.demo));
    } catch (err) {
      setError(apiError(err, 'No se pudo cargar tu suscripción.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Desde /planes se llega con ?plan=<id>: se abre directamente el checkout de ese plan.
  useEffect(() => {
    const wanted = params.get('plan');
    if (!data || !wanted) return;
    const pendingPlan = data.subscription?.status === 'pending' ? data.subscription.plan : null;
    if ((wanted === 'basic' || wanted === 'pro') && wanted !== data.provider.subscription_plan && wanted !== pendingPlan) {
      setChosen(wanted);
      setCheckoutError('');
    }
    setParams((p) => { p.delete('plan'); return p; }, { replace: true });
  }, [data, params, setParams]);

  const checkout = async () => {
    if (!chosen) return;
    setCheckingOut(true);
    setCheckoutError('');
    try {
      const res = await subscriptionApi.checkout(chosen, demo ? undefined : method);
      toast(res.data.message);
      setChosen(null);
      await load();
    } catch (err) {
      setCheckoutError(apiError(err, 'No se pudo procesar la solicitud.'));
    } finally {
      setCheckingOut(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      const res = await subscriptionApi.cancel();
      toast(res.data.message);
      setCancelOpen(false);
      await load();
    } catch (err) {
      toast(apiError(err, 'No se pudo cancelar la suscripción.'), 'error');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error || !data || !plans) return <ErrorState message={error || 'Sin datos'} onRetry={() => { setLoading(true); load(); }} />;

  const current = data.provider.subscription_plan;
  const currentInfo = plans[current];
  const pending = data.subscription?.status === 'pending' ? data.subscription : null;
  const paymentReported = Boolean(pending && data.payments.some((p) => p.status === 'pending' && p.plan === pending.plan));
  const expires = data.provider.subscription_expires_at;
  const max = currentInfo.maxServices;
  const hasPaidOrPending = current !== 'free' || Boolean(pending);

  return (
    <div className="space-y-6">
      <PageTitle title="Mi plan" subtitle="Más fotos, más oficios, agenda y chat según tu plan." />

      {demo && (
        <Alert tone="info">Modo demostración: los pagos se simulan y el plan se activa al momento. No se cobra nada.</Alert>
      )}

      <section className="card grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
        <div>
          <p className="text-sm font-semibold text-ink-500">Plan actual</p>
          <div className="mt-2 flex items-center gap-2">
            <PlanPill plan={current} />
            {current !== 'free' && <span className="font-display text-xl font-bold">{planPrice(currentInfo.price, tasa).usd}<span className="text-sm font-normal text-ink-400"> / mes</span></span>}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">{current === 'free' ? 'Vigencia' : 'Se renueva o vence'}</p>
          <p className="mt-2 font-semibold">{current === 'free' ? 'Sin vencimiento' : expires ? longDate(expires) : '—'}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">Oficios publicados</p>
          <p className="mt-2 font-semibold">{data.service_count} {max === null ? '· ilimitados' : `de ${max}`}</p>
          {max !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-200" aria-hidden="true">
              <div className={cn('h-full rounded-full', data.service_count >= max ? 'bg-amber-500' : 'bg-sea-500')} style={{ width: `${Math.min(100, (data.service_count / max) * 100)}%` }} />
            </div>
          )}
        </div>
      </section>

      {pending && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="flex-1">
              <h2 className="text-lg font-bold text-amber-950">Solicitud del plan {planLabel[pending.plan]} pendiente</h2>
              {paymentReported ? (
                <p className="mt-1 text-sm text-amber-900">Ya reportaste tu pago de {usd(pending.amount)}. Lo estamos verificando y activaremos tu plan en cuanto se confirme.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-amber-900">
                    Realiza el pago de <strong>{usd(pending.amount)}</strong> por transferencia o en efectivo y escribe aquí el número de
                    transacción o comprobante. Activaremos tu plan cuando lo verifiquemos.
                  </p>
                  <ReportPayment subscriptionId={pending.id} onDone={load} />
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-bold">Planes</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const p = plans[id];
            const isCurrent = id === current;
            const isPending = pending?.plan === id;
            const featured = id === 'pro';
            return (
              <div key={id} className={cn('card relative flex flex-col p-5', isCurrent && 'ring-2 ring-brand-500', featured && !isCurrent && 'ring-1 ring-sea-300')}>
                {isCurrent && <span className="badge absolute -top-2.5 left-5 bg-brand-600 text-white">Tu plan</span>}
                {featured && !isCurrent && <span className="badge absolute -top-2.5 left-5 bg-sea-600 text-white">Recomendado</span>}
                <h3 className="font-sans text-lg font-bold">{planLabel[id]}</h3>
                <p className="mt-1">
                  <span className="font-display text-3xl font-bold">{planPrice(p.price, tasa).usd}</span>
                  {p.price > 0 && <span className="text-sm text-ink-400"> / mes</span>}
                </p>
                {planPrice(p.price, tasa).cup && <p className="text-xs text-ink-400">{planPrice(p.price, tasa).cup} al cambio de hoy</p>}
                <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-600">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-sea-600" aria-hidden="true" /> {f}</li>
                  ))}
                </ul>
                <div className="mt-5">
                  {isCurrent ? (
                    <button type="button" disabled className="btn-secondary w-full">Plan actual</button>
                  ) : id === 'free' ? (
                    hasPaidOrPending && (
                      <button type="button" onClick={() => setCancelOpen(true)} className="btn-ghost w-full">Volver al Gratis</button>
                    )
                  ) : isPending ? (
                    <button type="button" disabled className="btn-secondary w-full"><Clock className="h-4 w-4" /> Pendiente</button>
                  ) : (
                    <button type="button" onClick={() => { setChosen(id); setCheckoutError(''); }} className={featured ? 'btn-primary w-full' : 'btn-dark w-full'}>
                      {PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(current) ? 'Mejorar' : 'Cambiar'} a {planLabel[id]}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div className="card flex flex-col bg-ink-900 p-5 text-white">
            <MessageSquareMore className="h-6 w-6 text-amber-300" aria-hidden="true" />
            <h3 className="mt-3 font-sans text-lg font-bold">¿Necesitas algo a medida?</h3>
            <p className="mt-1 flex-1 text-sm text-white/70">Varias sucursales, una web propia o una integración especial: cuéntanos qué necesitas.</p>
            <a href={DARDOIT_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-5 w-full">
              Contáctanos <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Receipt className="h-5 w-5 text-ink-400" /> Historial de pagos</h2>
        {data.payments.length === 0 ? (
          <p className="py-4 text-sm text-ink-400">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="-mx-2 divide-y divide-sand-200">
            {data.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-2 py-3 text-sm">
                <CreditCard className="h-5 w-5 shrink-0 text-ink-300" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Plan {planLabel[p.plan]}</p>
                  <p className="text-xs text-ink-400">{longDate(p.created_at)}</p>
                </div>
                <span className={cn('badge', paymentStatus[p.status].cls)}>{paymentStatus[p.status].label}</span>
                <span className="w-20 text-right font-semibold">{usd(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasPaidOrPending && (
        <p className="text-center text-sm text-ink-500">
          ¿Quieres dejar de pagar? <button type="button" onClick={() => setCancelOpen(true)} className="link">Cancelar suscripción</button>
        </p>
      )}

      <Modal open={Boolean(chosen)} onClose={() => !checkingOut && setChosen(null)} title={chosen ? `Plan ${planLabel[chosen]}` : ''}>
        {chosen && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between rounded-2xl bg-sand-100 px-4 py-3">
              <span className="text-sm text-ink-600">Pago mensual</span>
              <span className="text-right">
                <span className="block font-display text-2xl font-bold">{planPrice(plans[chosen].price, tasa).usd}</span>
                <span className="block text-xs text-ink-400">{planPrice(plans[chosen].price, tasa).cup}</span>
              </span>
            </div>
            {demo ? (
              <p className="text-sm text-ink-600">Es una demostración: el plan se activa ahora mismo sin cobro real.</p>
            ) : (
              <fieldset>
                <legend className="label">¿Cómo vas a pagar?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([['transfer', 'Transferencia', Landmark], ['cash', 'Efectivo', Banknote]] as const).map(([value, label, Icon]) => (
                    <label key={value} className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm font-semibold transition',
                      method === value ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-sand-200 hover:border-sand-300')}>
                      <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} className="sr-only" />
                      <Icon className="h-5 w-5" aria-hidden="true" /> {label}
                    </label>
                  ))}
                </div>
                <p className="hint mt-2">Tu solicitud queda pendiente. Después de pagar, reporta el número de transacción en esta página.</p>
              </fieldset>
            )}
            {checkoutError && <Alert>{checkoutError}</Alert>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setChosen(null)} disabled={checkingOut} className="btn-secondary">Cancelar</button>
              <button type="button" onClick={checkout} disabled={checkingOut} className="btn-primary">
                {checkingOut && <Spinner className="h-4 w-4" />} {demo ? 'Activar plan' : 'Solicitar plan'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={cancelOpen}
        title="¿Cancelar tu suscripción?"
        confirmLabel="Sí, pasar al Gratis"
        busy={cancelling}
        onConfirm={cancel}
        onClose={() => setCancelOpen(false)}
      >
        Tu cuenta pasará al plan <strong>Gratis</strong> ahora mismo: sin fotos, sin chat ni agenda, y sin posición destacada.
        {plans.free.maxServices !== null && <> Ese plan permite {plans.free.maxServices} oficio activo: los demás quedarán pausados.</>}
        {' '}No se borra nada: tus fotos y oficios vuelven a verse si mejoras de plan.
      </ConfirmDialog>

      <p className="text-center text-xs text-ink-400">
        ¿Dudas con tu plan? <Link to="/planes" className="link">Compara los planes</Link>
      </p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Info } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { subscriptionApi, apiError } from '../services/api';
import type { Plan, PlanInfo } from '../types';
import { usd } from '../lib/format';
import { Alert, ErrorState, cn } from '../components/ui';

const ORDER: Plan[] = ['free', 'basic', 'pro', 'premium'];

const TAGLINES: Record<Plan, string> = {
  free: 'Para empezar a darte a conocer.',
  basic: 'Para quien ofrece varios trabajos.',
  pro: 'Para vivir de tu oficio.',
  premium: 'Máxima visibilidad y confianza.',
};

const FAQ = [
  { q: '¿Cobran comisión por cada trabajo?', a: 'No. El cliente te contacta y acuerdan el precio entre ustedes. El plan es una cuota mensual fija.' },
  { q: '¿Puedo cambiar de plan cuando quiera?', a: 'Sí. Puedes cambiar de plan desde tu panel. Si cancelas, tu cuenta vuelve al plan gratuito.' },
  { q: '¿Cómo se paga?', a: 'Desde tu panel eliges el plan y el método de pago (transferencia o efectivo). Cuando se confirma el pago, el plan se activa.' },
  { q: '¿Qué pasa con mis servicios si vuelvo al plan gratuito?', a: 'No se borra nada. Solo no podrás publicar servicios nuevos por encima del límite del plan gratuito.' },
];

export default function Plans() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Record<Plan, PlanInfo> | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError('');
    subscriptionApi.getPlans()
      .then((r) => { setPlans(r.data.plans); setDemo(Boolean(r.data.demo)); })
      .catch((err) => setError(apiError(err, 'No pudimos cargar los planes.')));
  }, [reload]);

  const cta = (plan: Plan) => {
    if (!user) return { to: '/registro?tipo=profesional', label: plan === 'free' ? 'Empezar gratis' : 'Crear cuenta profesional' };
    if (user.user_type === 'provider') return { to: plan === 'free' ? '/dashboard/servicios/nuevo' : `/dashboard/suscripcion?plan=${plan}`, label: plan === 'free' ? 'Publicar un servicio' : `Elegir ${plans?.[plan].name ?? ''}` };
    return null;
  };

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="eyebrow mb-3">Planes para profesionales</p>
        <h1 className="text-balance text-4xl font-bold sm:text-5xl">Empieza gratis. Crece cuando quieras.</h1>
        <p className="mt-4 text-lg text-ink-500">Buscar y contactar profesionales siempre es gratis para los clientes. Los planes son solo para quien anuncia su oficio.</p>
      </div>

      {user?.user_type === 'client' && (
        <div className="mx-auto mt-8 max-w-2xl">
          <Alert tone="info">Tu cuenta es de cliente. Para anunciar un oficio necesitas una cuenta profesional con otro email.</Alert>
        </div>
      )}
      {demo && (
        <div className="mx-auto mt-6 max-w-2xl">
          <Alert tone="info"><span className="inline-flex items-center gap-2"><Info className="h-4 w-4 shrink-0" /> Modo demostración: los pagos son simulados.</span></Alert>
        </div>
      )}

      <div className="mt-12">
        {error ? (
          <div className="mx-auto max-w-md"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ORDER.map((id) => {
              const plan = plans?.[id];
              if (!plan) return <div key={id} className="skeleton h-[26rem] rounded-3xl" />;
              const featured = id === 'pro';
              const action = cta(id);
              return (
                <article
                  key={id}
                  className={cn(
                    'relative flex flex-col rounded-3xl border p-6',
                    featured ? 'border-ink-900 bg-ink-900 text-white shadow-lift lg:-translate-y-3' : 'border-sand-200 bg-white shadow-card',
                  )}
                >
                  {featured && <span className="badge absolute -top-3 left-6 bg-amber-400 text-ink-900">El más elegido</span>}
                  <h2 className={cn('font-sans text-lg font-bold', featured ? 'text-white' : 'text-ink-900')}>{plan.name}</h2>
                  <p className={cn('mt-1 text-sm', featured ? 'text-ink-300' : 'text-ink-500')}>{TAGLINES[id]}</p>
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className={cn('font-display text-4xl font-bold', featured ? 'text-white' : 'text-ink-900')}>{plan.price ? usd(plan.price) : 'Gratis'}</span>
                    {plan.price > 0 && <span className={cn('text-sm', featured ? 'text-ink-300' : 'text-ink-400')}>/ mes</span>}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <Check className={cn('mt-0.5 h-4 w-4 shrink-0', featured ? 'text-amber-300' : 'text-sea-600')} aria-hidden="true" />
                        <span className={featured ? 'text-ink-100' : 'text-ink-700'}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {action && (
                    <Link
                      to={action.to}
                      className={cn('mt-8 w-full', featured ? 'btn bg-amber-400 text-ink-900 hover:bg-amber-300' : id === 'free' ? 'btn-secondary' : 'btn-dark')}
                    >
                      {action.label}
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <section className="mx-auto mt-20 max-w-3xl">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Preguntas frecuentes</h2>
        <div className="mt-8 divide-y divide-sand-200 rounded-2xl border border-sand-200 bg-white">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink-900">
                {item.q}
                <span className="text-xl leading-none text-ink-400 transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

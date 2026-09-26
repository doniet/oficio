import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Info, MessagesSquare } from 'lucide-react';
import { useTasa } from '../hooks/useTasa';
import { useAuth } from '../hooks/useAuth';
import { subscriptionApi, apiError } from '../services/api';
import type { Plan, PlanInfo } from '../types';
import { DARDOIT_URL, planPrice } from '../lib/format';
import { Alert, ErrorState, cn } from '../components/ui';

const ORDER: Plan[] = ['free', 'basic', 'pro'];

const TAGLINES: Record<Plan, string> = {
  free: 'Para darte a conocer: tu oficio, tu logo y tu teléfono.',
  basic: 'Para enseñar tu trabajo con fotos y ofrecer varios oficios.',
  pro: 'Para tu negocio: citas, chat y punto de venta.',
};

const FAQ = [
  { q: '¿Cómo me registro gratis?', a: 'Entra con tu cuenta de Google (o con email y contraseña) y elige "Soy profesional". Pones tu nombre, tu logo, una descripción de tu oficio, tu dirección (opcional, también en el mapa) y un teléfono. Tú decides si te contactan por WhatsApp, por llamada o por las dos vías.' },
  { q: '¿Cobran comisión por cada trabajo?', a: 'No. El cliente te contacta y acuerdan el precio entre ustedes. El plan es una cuota mensual fija.' },
  { q: '¿Qué incluye el chat interno?', a: 'El chat dentro de Oficios Cuba es del plan Profesional. Con los planes Gratis y Básico los clientes te contactan por WhatsApp o por llamada, como hayas elegido.' },
  { q: '¿Cómo funcionan las citas?', a: 'Con el plan Profesional eliges qué días y a qué horas atiendes. Los clientes piden cita desde tu perfil entrando con su cuenta de Google, y tú la confirmas o la cancelas desde tu panel.' },
  { q: '¿Qué es el punto de venta DardoVentas?', a: 'Es una app de punto de venta para tu teléfono Android: inventario, cobros y ventas sin conexión. El plan Profesional te da acceso desde tu panel.' },
  { q: '¿Cómo se paga?', a: 'Los precios están en USD; el equivalente en CUP se calcula con la tasa del mercado informal del día. Desde tu panel eliges el plan y el método de pago (transferencia o efectivo). Cuando se confirma el pago, el plan se activa por un mes.' },
  { q: '¿Qué pasa si vuelvo al plan Gratis?', a: 'No se borra nada: tus fotos y oficios de más se guardan, pero dejan de mostrarse hasta que vuelvas a un plan que los incluya.' },
];

export default function Plans() {
  const { user } = useAuth();
  const tasa = useTasa();
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
    if (user.user_type === 'provider') return { to: plan === 'free' ? '/dashboard/perfil' : `/dashboard/suscripcion?plan=${plan}`, label: plan === 'free' ? 'Completar mi perfil' : `Elegir ${plans?.[plan].name ?? ''}` };
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
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
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
                  <p className="mt-6 flex flex-wrap items-baseline gap-x-1">
                    <span className={cn('font-display text-4xl font-bold', featured ? 'text-white' : 'text-ink-900')}>{planPrice(plan.price, tasa).usd}</span>
                    {plan.price > 0 && <span className={cn('text-sm', featured ? 'text-ink-300' : 'text-ink-400')}>/ mes</span>}
                  </p>
                  <p className={cn('mt-1 h-5 text-sm', featured ? 'text-ink-300' : 'text-ink-500')}>{planPrice(plan.price, tasa).cup}</p>
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
        <p className="mt-6 text-center text-xs text-ink-400">Precios en USD. El equivalente en CUP usa la tasa del mercado informal (elTOQUE) vía dardoventas.com: 1 USD ≈ {tasa} CUP.</p>

        <a
          href={DARDOIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto mt-10 flex max-w-5xl flex-col gap-4 rounded-3xl border border-sand-200 bg-white p-6 shadow-card transition hover:border-ink-300 sm:flex-row sm:items-center"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <MessagesSquare className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold text-ink-900">¿Necesitas algo a la medida? Contáctanos</span>
            <span className="block text-sm text-ink-500">Varias sucursales, una web propia para tu negocio o una integración especial: lo vemos contigo en Dardoit.</span>
          </span>
          <span className="btn-dark shrink-0">Contáctanos <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
        </a>
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

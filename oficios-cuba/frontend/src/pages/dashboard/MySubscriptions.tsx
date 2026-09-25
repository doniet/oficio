import { useEffect, useState } from 'react';
import { subscriptionApi } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { providerApi } from '../../services/api';
import type { Subscription, Payment } from '../../types';
import { CreditCard, Clock, CheckCircle, AlertCircle, XCircle, Loader2, ArrowRight, DollarSign, Crown, Award, Shield, HelpCircle, Building2 } from 'lucide-react';

const PLANS = {
  free: { name: 'Gratuito', price: 0, features: ['1 servicio publicado', 'Perfil básico', 'Búsqueda estándar'], color: 'bg-gray-100 text-gray-700', icon: Building2 },
  basic: { name: 'Básico', price: 9.99, features: ['Hasta 5 servicios', 'Perfil básico', 'Soporte por email'], color: 'bg-green-100 text-green-800', icon: Shield },
  pro: { name: 'Profesional', price: 19.99, features: ['Servicios ilimitados', 'Perfil destacado en búsquedas', 'Estadísticas básicas', 'Soporte prioritario'], color: 'bg-blue-100 text-blue-800', icon: Award },
  premium: { name: 'Premium', price: 39.99, features: ['Todo en Profesional', 'Top 3 en búsquedas', 'Estadísticas avanzadas', 'Badge verificado', 'Soporte 24/7', 'API access'], color: 'bg-purple-100 text-purple-800', icon: Crown },
};

export default function MySubscriptions() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [provider, setProvider] = useState<{ subscription_plan: string; subscription_expires_at?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (user?.user_type !== 'provider') return;

    const fetchData = async () => {
      try {
        const [subRes, providerRes] = await Promise.all([
          subscriptionApi.getMySubscription(),
          providerApi.getMyProfile(),
        ]);
        setSubscription(subRes.data.subscription);
        setPayments(subRes.data.payments || []);
        setProvider(providerRes.data.provider);
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const handleCheckout = async (plan: 'basic' | 'pro' | 'premium') => {
    setProcessing(plan);
    try {
      const res = await subscriptionApi.checkout({ plan, payment_method: 'stripe' });
      // In a real app, redirect to Stripe Checkout
      // window.location.href = res.data.stripe_session_url;
      alert(`Redirigiendo a pago para plan ${plan}... $${PLANS[plan].price}/mes`);
    } catch (error) {
      console.error('Error creating checkout:', error);
      alert('Error al iniciar el pago');
    } finally {
      setProcessing(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('¿Estás seguro de que quieres cancelar tu suscripción? Perderás los beneficios al final del período actual.')) return;
    
    try {
      await subscriptionApi.cancel();
      alert('Suscripción cancelada correctamente');
      window.location.reload();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      alert('Error al cancelar la suscripción');
    }
  };

  const getCurrentPlan = () => {
    if (subscription?.status === 'active' && subscription.plan) {
      return subscription.plan;
    }
    return provider?.subscription_plan || 'free';
  };

  const currentPlan = getCurrentPlan();
  const isActive = subscription?.status === 'active';
  const CurrentPlanIcon = PLANS[currentPlan].icon;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Mi Suscripción</h1>
          <p className="text-gray-600 mt-1">Gestiona tu plan y pagos</p>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Plan Actual</h2>
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${PLANS[currentPlan].color}`}>
                  <CurrentPlanIcon className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{PLANS[currentPlan].name}</h3>
                  <p className="text-gray-500">
                    {currentPlan === 'free' ? 'Plan gratuito' : `$${PLANS[currentPlan].price.toFixed(2)}/mes`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={`badge ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  {isActive ? 'Activo' : 'Inactivo'}
                </span>
                {subscription?.current_period_end && (
                  <p className="text-sm text-gray-500 mt-1">
                    Renueva: {new Date(subscription.current_period_end).toLocaleDateString('es-ES')}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PLANS[currentPlan].features.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            {currentPlan !== 'free' && isActive && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <button
                  onClick={handleCancel}
                  className="btn-danger gap-2"
                >
                  <XCircle className="w-5 h-5" />
                  Cancelar suscripción
                </button>
                <p className="text-sm text-gray-500 mt-2">
                  Tu suscripción seguirá activa hasta el final del período pagado.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Planes Disponibles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(['basic', 'pro', 'premium'] as const).map((planKey) => {
              const plan = PLANS[planKey];
              const isCurrent = currentPlan === planKey;
              const isUpgrade = ['free', 'basic', 'pro'].indexOf(currentPlan) < ['free', 'basic', 'pro'].indexOf(planKey);
              
              return (
                <div
                  key={planKey}
                  className={`card p-6 relative ${isCurrent ? 'ring-2 ring-primary-500' : ''}`}
                >
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs px-2 py-1 rounded-full">
                      Plan actual
                    </div>
                  )}
                  <div className="text-center mb-6">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-xl flex items-center justify-center ${plan.color}`}>
                      <plan.icon className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-1">${plan.price.toFixed(2)}<span className="text-lg font-normal text-gray-500">/mes</span></p>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleCheckout(planKey)}
                    disabled={processing === planKey || isCurrent}
                    className={`w-full ${isCurrent ? 'btn-secondary' : 'btn-primary'} gap-2 justify-center`}
                  >
                    {processing === planKey ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Procesando...
                      </>
                    ) : isCurrent ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Plan actual
                      </>
                    ) : isUpgrade ? (
                      <>
                        <ArrowRight className="w-5 h-5" />
                        Actualizar
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-5 h-5" />
                        Cambiar a este plan
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Historial de Pagos</h2>
          <div className="card overflow-hidden">
            {payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(payment.created_at).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {payment.subscription_id ? subscription?.plan?.charAt(0).toUpperCase() + subscription?.plan?.slice(1) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          ${payment.amount.toFixed(2)} {payment.currency}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`badge ${
                            payment.status === 'succeeded' ? 'bg-green-100 text-green-800' :
                            payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            payment.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {payment.status === 'succeeded' ? 'Pagado' :
                             payment.status === 'pending' ? 'Pendiente' :
                             payment.status === 'failed' ? 'Fallido' :
                             payment.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <h3 className="font-medium text-gray-900 mb-1">Sin pagos registrados</h3>
                <p className="text-gray-500">Tu historial de pagos aparecerá aquí</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

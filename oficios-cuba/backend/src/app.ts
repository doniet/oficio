import 'dotenv/config';
import express from 'express';
import { clienteIp } from './lib/cliente.js';
import appMovilRoutes from './routes/app-movil.js';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import provinceRoutes from './routes/provinces.js';
import categoryRoutes from './routes/categories.js';
import providerRoutes from './routes/providers.js';
import serviceRoutes from './routes/services.js';
import subscriptionRoutes from './routes/subscriptions.js';
import conversationRoutes from './routes/conversations.js';
import reviewRoutes from './routes/reviews.js';
import favoriteRoutes from './routes/favorites.js';
import statsRoutes from './routes/stats.js';
import appointmentRoutes from './routes/appointments.js';
import catalogRoutes from './routes/catalog.js';
import telegramRoutes from './routes/telegram.js';
import adminRoutes from './routes/admin.js';
import uploadRoutes, { UPLOAD_DIR } from './routes/uploads.js';
import pushRoutes from './routes/push.js';
import { errorHandler } from './middleware/errorHandler.js';
import { DEMO_MODE, googleClientId, TASA_CUP_USD } from './config.js';

const app = express();

app.disable('x-powered-by');

const clientKey = clienteIp;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  validate: false,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: clientKey,
  validate: false,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
});

// Además del límite por IP: bajo el CGNAT de ETECSA muchos usuarios comparten IP, y un atacante
// puede rotar IPs. Este cuenta los fallos contra una misma cuenta, venga de donde venga.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `cuenta:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  validate: false,
  message: { error: 'Demasiados intentos fallidos con esta cuenta. Espera 15 minutos e inténtalo de nuevo.' },
});

if (process.env.FRONTEND_URL) {
  app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
}
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  const clientId = googleClientId();
  res.json({ demo: DEMO_MODE, google: clientId ? 'real' : DEMO_MODE ? 'demo' : null, google_client_id: clientId || null });
});

// En producción nginx sirve /api/tasas desde dardoventas.com/tasas.json (la API no tiene salida
// a internet). Esta respuesta es el respaldo: en dev y cuando dardoventas no responde.
app.get('/api/tasas', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ok: true, fuente: 'respaldo', usd: TASA_CUP_USD, updated_at: null });
});

app.use('/api/', apiLimiter);
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/google'], authLimiter);
app.use('/api/auth/login', loginAccountLimiter);

app.use('/api/uploads', express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false }));
app.use('/api/uploads', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/provinces', provinceRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/app', appMovilRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(errorHandler);

export default app;

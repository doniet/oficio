import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { initDatabase, expireSubscriptions } from './db/index.js';
import { seedBase } from './db/seed.js';
import { seedDemo } from './db/seed-demo.js';
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
import uploadRoutes, { UPLOAD_DIR } from './routes/uploads.js';
import { errorHandler } from './middleware/errorHandler.js';
import { DEMO_MODE } from './config.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');

// Detrás de Cloudflare → cloudflared → Traefik → nginx. La IP real del visitante llega en
// CF-Connecting-IP; el backend no tiene puertos publicados, así que no se puede falsificar.
const clientKey = (req: express.Request) =>
  (req.headers['cf-connecting-ip'] as string) || (req.headers['x-real-ip'] as string) || req.ip || 'unknown';

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

if (process.env.FRONTEND_URL) {
  app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
}
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  res.json({ demo: DEMO_MODE });
});

app.use('/api/', apiLimiter);
app.use(['/api/auth/login', '/api/auth/register'], authLimiter);

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

app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(errorHandler);

async function start() {
  initDatabase();
  seedBase();
  if (DEMO_MODE && (await seedDemo())) {
    console.log('Datos demo creados');
  }
  expireSubscriptions();
  setInterval(expireSubscriptions, 60 * 60 * 1000).unref();

  app.listen(PORT, () => {
    console.log(`API escuchando en :${PORT} (demo=${DEMO_MODE})`);
  });
}

start().catch((err) => {
  console.error('No se pudo arrancar la API:', err);
  process.exit(1);
});

export default app;

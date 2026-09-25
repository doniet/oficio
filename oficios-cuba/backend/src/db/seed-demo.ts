import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from './index.js';

async function seedDemoUsers() {
  const demoPassword = 'Demo123!';
  const clientEmail = 'cliente@demo.com';
  const providerEmail = 'proveedor@demo.com';

  const clientId = uuidv4();
  const providerId = uuidv4();
  const providerProfileId = uuidv4();

  const clientHash = await bcrypt.hash(demoPassword, 10);
  const providerHash = await bcrypt.hash(demoPassword, 10);

  const existingClient = db.prepare('SELECT id FROM users WHERE email = ?').get(clientEmail) as { id: string } | undefined;
  if (!existingClient) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, user_type, avatar_url, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      clientId,
      clientEmail,
      clientHash,
      'Cliente Demo',
      '+5350000001',
      'client',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80'
    );
  }

  const existingProvider = db.prepare('SELECT id FROM users WHERE email = ?').get(providerEmail) as { id: string } | undefined;
  if (!existingProvider) {
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, phone, user_type, avatar_url, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      providerId,
      providerEmail,
      providerHash,
      'Proveedor Demo',
      '+5350000002',
      'provider',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80'
    );
  }

  const clientUserId = db.prepare('SELECT id FROM users WHERE email = ?').get(clientEmail) as { id: string } | undefined;
  const providerUserId = db.prepare('SELECT id FROM users WHERE email = ?').get(providerEmail) as { id: string } | undefined;

  const provinceId = db.prepare('SELECT id FROM provinces WHERE name = ?').get('La Habana')?.id ?? db.prepare('SELECT id FROM provinces LIMIT 1').get()?.id;
  const municipalityId = db.prepare('SELECT id FROM municipalities WHERE province_id = ? LIMIT 1').get(provinceId)?.id;

  if (!provinceId || !providerUserId || !clientUserId) {
    throw new Error('No se pudo determinar la provincia o los usuarios demo');
  }

  const existingProviderProfile = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(providerUserId.id) as { id: string } | undefined;
  const resolvedProviderProfileId = existingProviderProfile?.id ?? providerProfileId;

  db.prepare(`
    INSERT OR IGNORE INTO provider_profiles (
      id, user_id, business_name, description, province_id, municipality_id, address, lat, lng, whatsapp, telegram, email_contact, years_experience, rating, review_count, is_active, subscription_plan
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pro')
  `).run(
    resolvedProviderProfileId,
    providerUserId.id,
    'Electricidad & Plomería Demo',
    'Servicios generales de electricidad, plomería y mantenimiento del hogar con atención rápida y profesional en La Habana.',
    provinceId,
    municipalityId,
    'Calle 23 #123 e/ 10 y 12, Vedado, La Habana',
    23.1367,
    -82.3666,
    '+5350000002',
    '@demoelectricista',
    'proveedor@demo.com',
    8,
    4.9,
    18
  );

  const serviceCategoryIds = db.prepare('SELECT id FROM categories WHERE parent_id IS NOT NULL ORDER BY sort_order LIMIT 6').all() as { id: string }[];

  const serviceRows = [
    {
      title: 'Instalación eléctrica residencial',
      description: 'Cambios de tomas, cableado y mantenimiento eléctrico de viviendas.',
      price_min: 35,
      price_max: 90,
      category_id: serviceCategoryIds[0]?.id,
    },
    {
      title: 'Reparación de plomería rápida',
      description: 'Arreglo de fugas, cañerías y grifería para casas y pequeños locales.',
      price_min: 40,
      price_max: 110,
      category_id: serviceCategoryIds[1]?.id,
    },
    {
      title: 'Mantenimiento general del hogar',
      description: 'Mantenimiento preventivo y correctivo para viviendas en La Habana.',
      price_min: 25,
      price_max: 75,
      category_id: serviceCategoryIds[2]?.id,
    },
  ];

  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (id, provider_id, category_id, title, description, price_min, price_max, price_type, images, is_active)
    VALUES (?, (SELECT id FROM provider_profiles WHERE user_id = ?), ?, ?, ?, ?, ?, 'fixed', ?, 1)
  `);

  for (const service of serviceRows) {
    if (!service.category_id) continue;

    insertService.run(
      uuidv4(),
      providerUserId.id,
      service.category_id,
      service.title,
      service.description,
      service.price_min,
      service.price_max,
      JSON.stringify([
        'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1200&q=80',
      ])
    );
  }

  const actualProviderProfileId = db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(providerUserId.id) as { id: string } | undefined;

  db.prepare(
    'INSERT OR IGNORE INTO favorites (id, client_id, provider_id) VALUES (?, ?, ?)'
  ).run(uuidv4(), clientUserId.id, actualProviderProfileId?.id ?? resolvedProviderProfileId);

  console.log('Demo credentials created:');
  console.log(`Client: ${clientEmail} / ${demoPassword}`);
  console.log(`Provider: ${providerEmail} / ${demoPassword}`);
}

void seedDemoUsers();

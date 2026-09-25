import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from './index.js';

const provinces = [
  { id: uuidv4(), name: 'Pinar del Río', capital: 'Pinar del Río', lat: 22.4123, lng: -83.6919, zoom: 9 },
  { id: uuidv4(), name: 'Artemisa', capital: 'Artemisa', lat: 22.8136, lng: -82.7633, zoom: 9 },
  { id: uuidv4(), name: 'La Habana', capital: 'La Habana', lat: 23.1136, lng: -82.3666, zoom: 10 },
  { id: uuidv4(), name: 'Mayabeque', capital: 'San José de las Lajas', lat: 22.9583, lng: -82.1542, zoom: 9 },
  { id: uuidv4(), name: 'Matanzas', capital: 'Matanzas', lat: 23.0494, lng: -81.5736, zoom: 9 },
  { id: uuidv4(), name: 'Cienfuegos', capital: 'Cienfuegos', lat: 22.1456, lng: -80.4364, zoom: 9 },
  { id: uuidv4(), name: 'Villa Clara', capital: 'Santa Clara', lat: 22.4067, lng: -79.9647, zoom: 9 },
  { id: uuidv4(), name: 'Sancti Spíritus', capital: 'Sancti Spíritus', lat: 21.9339, lng: -79.4433, zoom: 9 },
  { id: uuidv4(), name: 'Ciego de Ávila', capital: 'Ciego de Ávila', lat: 21.8408, lng: -78.7633, zoom: 9 },
  { id: uuidv4(), name: 'Camagüey', capital: 'Camagüey', lat: 21.3814, lng: -77.9167, zoom: 9 },
  { id: uuidv4(), name: 'Las Tunas', capital: 'Las Tunas', lat: 20.9611, lng: -76.9517, zoom: 9 },
  { id: uuidv4(), name: 'Granma', capital: 'Bayamo', lat: 20.3789, lng: -76.6453, zoom: 9 },
  { id: uuidv4(), name: 'Holguín', capital: 'Holguín', lat: 20.8870, lng: -76.2636, zoom: 9 },
  { id: uuidv4(), name: 'Santiago de Cuba', capital: 'Santiago de Cuba', lat: 20.0217, lng: -75.8294, zoom: 9 },
  { id: uuidv4(), name: 'Guantánamo', capital: 'Guantánamo', lat: 20.1411, lng: -75.2092, zoom: 9 },
  { id: uuidv4(), name: 'Isla de la Juventud', capital: 'Nueva Gerona', lat: 21.8333, lng: -82.7833, zoom: 9 },
];

const municipalities = [
  { province: 'Pinar del Río', municipalities: ['Pinar del Río', 'Consolación del Sur', 'Guane', 'La Palma', 'Los Palacios', 'Mantua', 'Minas de Matahambre', 'San Juan y Martínez', 'San Luis', 'Sandino', 'Viñales'] },
  { province: 'Artemisa', municipalities: ['Artemisa', 'Alquízar', 'Batabanó', 'Bauta', 'Caimito', 'Candelaria', 'Guanajay', 'Güira de Melena', 'Mariel', 'San Antonio de los Baños', 'San Cristóbal'] },
  { province: 'La Habana', municipalities: ['Plaza de la Revolución', 'Playa', 'Centro Habana', 'Habana Vieja', 'Habana del Este', 'Cerro', '10 de Octubre', 'Marianao', 'La Lisa', 'Boyeros', 'Arroyo Naranjo', 'Cotorro', 'San Miguel del Padrón'] },
  { province: 'Mayabeque', municipalities: ['San José de las Lajas', 'Batabanó', 'Bejucal', 'Güines', 'Jaruco', 'Madruga', 'Melena del Sur', 'Nueva Paz', 'Quivicán', 'San Nicolás de Bari', 'Santa Cruz del Norte'] },
  { province: 'Matanzas', municipalities: ['Matanzas', 'Cárdenas', 'Ciénaga de Zapata', 'Colón', 'Jagüey Grande', 'Jovellanos', 'Los Arabos', 'Martí', 'Pedro Betancourt', 'Perico', 'Unión de Reyes'] },
  { province: 'Cienfuegos', municipalities: ['Cienfuegos', 'Aguada de Pasajeros', 'Cruces', 'Cumanayagua', 'Lajas', 'Palmira', 'Rodas'] },
  { province: 'Villa Clara', municipalities: ['Santa Clara', 'Caibarién', 'Camajuaní', 'Cifuentes', 'Corralillo', 'Encrucijada', 'Manicaragua', 'Placetas', 'Quemado de Güines', 'Ranchuelo', 'Sagua la Grande', 'Santo Domingo'] },
  { province: 'Sancti Spíritus', municipalities: ['Sancti Spíritus', 'Cabaiguán', 'Fomento', 'Jatibonico', 'La Sierpe', 'Taguasco', 'Trinidad', 'Yaguajay'] },
  { province: 'Ciego de Ávila', municipalities: ['Ciego de Ávila', 'Baraguá', 'Bolivia', 'Chambas', 'Ciro Redondo', 'Florencia', 'Majagua', 'Morón', 'Primero de Enero', 'Venezuela'] },
  { province: 'Camagüey', municipalities: ['Camagüey', 'Carlos Manuel de Céspedes', 'Esmeralda', 'Florida', 'Guaimaro', 'Jimaguayú', 'Minas', 'Najasa', 'Nuevitas', 'Santa Cruz del Sur', 'Sibanicú', 'Sierra de Cubitas', 'Vertientes'] },
  { province: 'Las Tunas', municipalities: ['Las Tunas', 'Amancio', 'Colombia', 'Jesús Menéndez', 'Jobabo', 'Majibacoa', 'Manatí', 'Puerto Padre'] },
  { province: 'Granma', municipalities: ['Bayamo', 'Bartolomé Masó', 'Buey Arriba', 'Campechuela', 'Cauto Cristo', 'Guisa', 'Jiguaní', 'Manzanillo', 'Media Luna', 'Niquero', 'Pilón', 'Río Cauto', 'Yara'] },
  { province: 'Holguín', municipalities: ['Holguín', 'Antilla', 'Báguanos', 'Banés', 'Cacocum', 'Calixto García', 'Cueto', 'Frank País', 'Gibara', 'Mayarí', 'Moa', 'Rafael Freyre', 'Sagua de Tánamo', 'Urbano Noris'] },
  { province: 'Santiago de Cuba', municipalities: ['Santiago de Cuba', 'Contramaestre', 'Guamá', 'Mella', 'Palma Soriano', 'San Luis', 'Songo-La Maya', 'Tercer Frente'] },
  { province: 'Guantánamo', municipalities: ['Guantánamo', 'Baracoa', 'Caimanera', 'El Salvador', 'Imías', 'Maisí', 'Manuel Tames', 'Niceto Pérez', 'San Antonio del Sur', 'Yateras'] },
  { province: 'Isla de la Juventud', municipalities: ['Nueva Gerona', 'Santa Fe'] },
];

const categories = [
  { id: uuidv4(), name: 'Construcción y Reformas', slug: 'construccion-reformas', icon: '🏗️', sort_order: 1, subcategories: [
    { name: 'Albañilería', slug: 'albanileria', icon: '🧱' },
    { name: 'Carpintería', slug: 'carpinteria', icon: '🪚' },
    { name: 'Electricidad', slug: 'electricidad', icon: '⚡' },
    { name: 'Fontanería/Plomería', slug: 'fontaneria-plomeria', icon: '🔧' },
    { name: 'Pintura', slug: 'pintura', icon: '🎨' },
    { name: 'Soldadura', slug: 'soldadura', icon: '🔥' },
    { name: 'Cerrajería', slug: 'cerrajeria', icon: '🔒' },
    { name: 'Techos y Impermeabilización', slug: 'techos-impermeabilizacion', icon: '🏠' },
    { name: 'Yeso y Tablaroca', slug: 'yeso-tablaroca', icon: '📐' },
    { name: 'Pisos y Azulejos', slug: 'pisos-azulejos', icon: '🔲' },
  ]},
  { id: uuidv4(), name: 'Reparaciones del Hogar', slug: 'reparaciones-hogar', icon: '🔧', sort_order: 2, subcategories: [
    { name: 'Electrodomésticos', slug: 'electrodomesticos', icon: '🧺' },
    { name: 'Aire Acondicionado', slug: 'aire-acondicionado', icon: '❄️' },
    { name: 'Refrigeración', slug: 'refrigeracion', icon: '🧊' },
    { name: 'Gas y Estufas', slug: 'gas-estufas', icon: '🔥' },
    { name: 'Cerrajería Hogar', slug: 'cerrajeria-hogar', icon: '🔑' },
    { name: 'Vidrios y Espejos', slug: 'vidrios-espejos', icon: '🪞' },
    { name: 'Persianas y Cortinas', slug: 'persianas-cortinas', icon: '🪟' },
  ]},
  { id: uuidv4(), name: 'Servicios Técnicos', slug: 'servicios-tecnicos', icon: '💻', sort_order: 3, subcategories: [
    { name: 'Computadoras y Laptops', slug: 'computadoras-laptops', icon: '💻' },
    { name: 'Celulares y Tablets', slug: 'celulares-tablets', icon: '📱' },
    { name: 'Redes e Internet', slug: 'redes-internet', icon: '🌐' },
    { name: 'Cámaras y Seguridad', slug: 'camaras-seguridad', icon: '📷' },
    { name: 'TV y Audio', slug: 'tv-audio', icon: '📺' },
    { name: 'Consolas de Videojuegos', slug: 'consolas-videojuegos', icon: '🎮' },
  ]},
  { id: uuidv4(), name: 'Automotriz', slug: 'automotriz', icon: '🚗', sort_order: 4, subcategories: [
    { name: 'Mecánica General', slug: 'mecanica-general', icon: '🔧' },
    { name: 'Electricidad Automotriz', slug: 'electricidad-automotriz', icon: '⚡' },
    { name: 'Neumáticos', slug: 'neumaticos', icon: '🛞' },
    { name: 'Chapa y Pintura', slug: 'chapa-pintura', icon: '🎨' },
    { name: 'Aire Acondicionado Auto', slug: 'aire-acondicionado-auto', icon: '❄️' },
    { name: 'Lavado y Detallado', slug: 'lavado-detallado', icon: '🧽' },
    { name: 'GNC/Gas', slug: 'gnc-gas', icon: '⛽' },
  ]},
  { id: uuidv4(), name: 'Belleza y Cuidado Personal', slug: 'belleza-cuidado-personal', icon: '💇', sort_order: 5, subcategories: [
    { name: 'Peluquería/Barbería', slug: 'peluqueria-barberia', icon: '💈' },
    { name: 'Manicura/Pedicura', slug: 'manicura-pedicura', icon: '💅' },
    { name: 'Maquillaje', slug: 'maquillaje', icon: '💄' },
    { name: 'Masajes', slug: 'masajes', icon: '💆' },
    { name: 'Estética', slug: 'estetica', icon: '✨' },
    { name: 'Depilación', slug: 'depilacion', icon: '🧴' },
  ]},
  { id: uuidv4(), name: 'Limpieza y Mantenimiento', slug: 'limpieza-mantenimiento', icon: '🧹', sort_order: 6, subcategories: [
    { name: 'Limpieza de Hogar', slug: 'limpieza-hogar', icon: '🏠' },
    { name: 'Limpieza de Oficinas', slug: 'limpieza-oficinas', icon: '🏢' },
    { name: 'Limpieza Post-Obra', slug: 'limpieza-post-obra', icon: '🏗️' },
    { name: 'Jardinería', slug: 'jardineria', icon: '🌿' },
    { name: 'Fumigación/Control Plagas', slug: 'fumigacion-control-plagas', icon: '🐜' },
    { name: 'Piscinas', slug: 'piscinas', icon: '🏊' },
  ]},
  { id: uuidv4(), name: 'Transporte y Mudanzas', slug: 'transporte-mudanzas', icon: '🚚', sort_order: 7, subcategories: [
    { name: 'Mudanzas', slug: 'mudanzas', icon: '📦' },
    { name: 'Fletes y Carga', slug: 'fletes-carga', icon: '📦' },
    { name: 'Mensajería', slug: 'mensajeria', icon: '📬' },
    { name: 'Transporte Escolar', slug: 'transporte-escolar', icon: '🚌' },
    { name: 'Taxi/Conductor', slug: 'taxi-conductor', icon: '🚕' },
    { name: 'Grúa', slug: 'grua', icon: '🚛' },
  ]},
  { id: uuidv4(), name: 'Eventos y Entretenimiento', slug: 'eventos-entretenimiento', icon: '🎉', sort_order: 8, subcategories: [
    { name: 'DJ y Sonido', slug: 'dj-sonido', icon: '🎧' },
    { name: 'Fotografía/Video', slug: 'fotografia-video', icon: '📸' },
    { name: 'Decoración Eventos', slug: 'decoracion-eventos', icon: '🎊' },
    { name: 'Catering/Buffet', slug: 'catering-buffet', icon: '🍽️' },
    { name: 'Animación Infantil', slug: 'animacion-infantil', icon: '🤹' },
    { name: 'Música en Vivo', slug: 'musica-vivo', icon: '🎵' },
    { name: 'Alquiler Carpas/Sillas', slug: 'alquiler-carpas-sillas', icon: '🪑' },
  ]},
  { id: uuidv4(), name: 'Clases y Tutorías', slug: 'clases-tutorias', icon: '📚', sort_order: 9, subcategories: [
    { name: 'Idiomas', slug: 'idiomas', icon: '🌍' },
    { name: 'Matemáticas/Física', slug: 'matematicas-fisica', icon: '📐' },
    { name: 'Música/Instrumentos', slug: 'musica-instrumentos', icon: '🎸' },
    { name: 'Baile', slug: 'baile', icon: '💃' },
    { name: 'Informática', slug: 'informatica', icon: '💻' },
    { name: 'Artes Manuales', slug: 'artes-manuales', icon: '🎨' },
    { name: 'Refuerzo Escolar', slug: 'refuerzo-escolar', icon: '📖' },
  ]},
  { id: uuidv4(), name: 'Salud y Bienestar', slug: 'salud-bienestar', icon: '🏥', sort_order: 10, subcategories: [
    { name: 'Enfermería a Domicilio', slug: 'enfermeria-domicilio', icon: '🩺' },
    { name: 'Fisioterapia', slug: 'fisioterapia', icon: '💪' },
    { name: 'Psicología', slug: 'psicologia', icon: '🧠' },
    { name: 'Nutrición', slug: 'nutricion', icon: '🥗' },
    { name: 'Cuidado Adultos Mayores', slug: 'cuidado-adultos-mayores', icon: '👴' },
    { name: 'Cuidado Niños/Niñera', slug: 'cuidado-ninos-ninera', icon: '👶' },
  ]},
  { id: uuidv4(), name: 'Servicios Profesionales', slug: 'servicios-profesionales', icon: '💼', sort_order: 11, subcategories: [
    { name: 'Abogados', slug: 'abogados', icon: '⚖️' },
    { name: 'Contadores', slug: 'contadores', icon: '📊' },
    { name: 'Arquitectos', slug: 'arquitectos', icon: '🏛️' },
    { name: 'Ingenieros', slug: 'ingenieros', icon: '⚙️' },
    { name: 'Diseño Gráfico', slug: 'diseno-grafico', icon: '🎨' },
    { name: 'Marketing Digital', slug: 'marketing-digital', icon: '📱' },
    { name: 'Trámites y Gestoría', slug: 'tramites-gestoria', icon: '📋' },
    { name: 'Traducción/Interpretación', slug: 'traduccion-interpretacion', icon: '🌐' },
  ]},
  { id: uuidv4(), name: 'Alimentos y Bebidas', slug: 'alimentos-bebidas', icon: '🍳', sort_order: 12, subcategories: [
    { name: 'Chef a Domicilio', slug: 'chef-domicilio', icon: '👨‍🍳' },
    { name: 'Repostería', slug: 'reposteria', icon: '🍰' },
    { name: 'Comida para Eventos', slug: 'comida-eventos', icon: '🍽️' },
    { name: 'Elaboración Conservas', slug: 'elaboracion-conservas', icon: '🫙' },
    { name: 'Panadería', slug: 'panaderia', icon: '🍞' },
  ]},
  { id: uuidv4(), name: 'Moda y Costura', slug: 'moda-costura', icon: '👗', sort_order: 13, subcategories: [
    { name: 'Costura/Arreglos', slug: 'costura-arreglos', icon: '🧵' },
    { name: 'Sastrería', slug: 'sastreria', icon: '👔' },
    { name: 'Modista', slug: 'modista', icon: '👗' },
    { name: 'Bordado', slug: 'bordado', icon: '🧵' },
    { name: 'Lavandería/Tintorería', slug: 'lavanderia-tintoreria', icon: '🧺' },
  ]},
];

export async function seedDemoUsers() {
  const demoPassword = 'Demo123!';
  const clientEmail = 'cliente@demo.com';
  const providerEmail = 'proveedor@demo.com';

  const clientId = uuidv4();
  const providerId = uuidv4();
  const providerProfileId = uuidv4();

  const clientHash = await bcrypt.hash(demoPassword, 10);
  const providerHash = await bcrypt.hash(demoPassword, 10);

  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, phone, user_type, avatar_url, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(clientId, clientEmail, clientHash, 'Cliente Demo', '+5350000001', 'client', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80');

  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, phone, user_type, avatar_url, is_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(providerId, providerEmail, providerHash, 'Proveedor Demo', '+5350000002', 'provider', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80');

  const provinceId = db.prepare('SELECT id FROM provinces WHERE name = ?').get('La Habana')?.id ?? db.prepare('SELECT id FROM provinces LIMIT 1').get()?.id;
  const municipalityId = db.prepare('SELECT id FROM municipalities WHERE province_id = ? LIMIT 1').get(provinceId)?.id;

  if (!provinceId) {
    throw new Error('No se pudo determinar una provincia para el usuario demo');
  }

  db.prepare(`
    INSERT OR IGNORE INTO provider_profiles (
      id, user_id, business_name, description, province_id, municipality_id, address, lat, lng, whatsapp, telegram, email_contact, years_experience, rating, review_count, is_active, subscription_plan
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pro')
  `).run(
    providerProfileId,
    providerId,
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
    { title: 'Instalación eléctrica residencial', description: 'Cambios de tomas, cableado y mantenimiento eléctrico de viviendas.', price_min: 35, price_max: 90, category_id: serviceCategoryIds[0]?.id },
    { title: 'Reparación de plomería rápida', description: 'Arreglo de fugas, cañerías y grifería para casas y pequeños locales.', price_min: 40, price_max: 110, category_id: serviceCategoryIds[1]?.id },
    { title: 'Mantenimiento general del hogar', description: 'Mantenimiento preventivo y correctivo para viviendas en La Habana.', price_min: 25, price_max: 75, category_id: serviceCategoryIds[2]?.id },
  ];

  const insertService = db.prepare(`
    INSERT OR IGNORE INTO services (id, provider_id, category_id, title, description, price_min, price_max, price_type, images, is_active)
    VALUES (?, (SELECT id FROM provider_profiles WHERE user_id = ?), ?, ?, ?, ?, ?, 'fixed', ?, 1)
  `);

  for (const service of serviceRows) {
    if (!service.category_id) continue;
    insertService.run(
      uuidv4(),
      providerId,
      service.category_id,
      service.title,
      service.description,
      service.price_min,
      service.price_max,
      JSON.stringify([
        'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1200&q=80'
      ])
    );
  }

  db.prepare('INSERT OR IGNORE INTO favorites (id, client_id, provider_id) VALUES (?, (SELECT id FROM users WHERE email = ?), (SELECT id FROM provider_profiles WHERE user_id = ?))')
    .run(uuidv4(), clientEmail, providerId);

  console.log('Demo credentials created:');
  console.log(`Client: ${clientEmail} / ${demoPassword}`);
  console.log(`Provider: ${providerEmail} / ${demoPassword}`);
}

function seedDatabase() {
  console.log('Seeding database...');

  // Insert provinces
  const insertProvince = db.prepare(`
    INSERT OR IGNORE INTO provinces (id, name, capital, lat, lng, zoom)
    VALUES (@id, @name, @capital, @lat, @lng, @zoom)
  `);

  const provinceMap = new Map<string, string>();
  for (const province of provinces) {
    const existingProvince = db.prepare('SELECT id FROM provinces WHERE name = ?').get(province.name) as { id: string } | undefined;
    if (existingProvince) {
      provinceMap.set(province.name, existingProvince.id);
      continue;
    }

    insertProvince.run(province);
    provinceMap.set(province.name, province.id);
  }
  console.log(`Inserted ${provinces.length} provinces`);

  // Insert municipalities
  const insertMunicipality = db.prepare(`
    INSERT OR IGNORE INTO municipalities (id, name, province_id, lat, lng)
    VALUES (@id, @name, @province_id, @lat, @lng)
  `);

  let municipalityCount = 0;
  const municipalityMap = new Map<string, string>();

  for (const { province, municipalities: munis } of municipalities) {
    const provinceId = provinceMap.get(province);
    if (!provinceId) continue;

    for (const muniName of munis) {
      const id = uuidv4();
      // Approximate coordinates - in production would use real geocoding
      const provinceData = provinces.find(p => p.name === province);
      const lat = provinceData!.lat + (Math.random() - 0.5) * 0.5;
      const lng = provinceData!.lng + (Math.random() - 0.5) * 0.5;

      insertMunicipality.run({ id, name: muniName, province_id: provinceId, lat, lng });
      municipalityMap.set(`${province}:${muniName}`, id);
      municipalityCount++;
    }
  }
  console.log(`Inserted ${municipalityCount} municipalities`);

  // Insert categories and subcategories
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, slug, icon, description, parent_id, sort_order)
    VALUES (@id, @name, @slug, @icon, @description, @parent_id, @sort_order)
  `);

  let categoryCount = 0;
  const categoryMap = new Map<string, string>();

  for (const cat of categories) {
    const existingCategory = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cat.slug) as { id: string } | undefined;
    const parentId = existingCategory?.id ?? cat.id;

    if (!existingCategory) {
      insertCategory.run({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        description: cat.name,
        parent_id: null,
        sort_order: cat.sort_order
      });
    }

    const savedCategoryId = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cat.slug) as { id: string } | undefined;
    const resolvedParentId = savedCategoryId?.id ?? parentId;
    categoryMap.set(cat.name, resolvedParentId);
    categoryCount++;

    for (let i = 0; i < cat.subcategories.length; i++) {
      const sub = cat.subcategories[i];
      const existingSubcategory = db.prepare('SELECT id FROM categories WHERE slug = ?').get(sub.slug) as { id: string } | undefined;

      if (!existingSubcategory) {
        insertCategory.run({
          id: uuidv4(),
          name: sub.name,
          slug: sub.slug,
          icon: sub.icon,
          description: sub.name,
          parent_id: resolvedParentId,
          sort_order: i
        });
      }

      categoryCount++;
    }
  }
  console.log(`Inserted ${categoryCount} categories`);

  console.log('Database seeding completed!');
}

seedDatabase();
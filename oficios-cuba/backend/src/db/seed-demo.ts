import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db, { refreshProviderRating } from './index.js';
import { fechaLocal, instanteLocal, sumarDias } from '../lib/hora.js';

export const DEMO_PASSWORD = 'Demo123!';

type Plan = 'free' | 'basic' | 'pro';
type PriceType = 'fixed' | 'hourly' | 'daily' | 'negotiable';

interface DemoService {
  category: string;
  title: string;
  description: string;
  price_min?: number;
  price_max?: number;
  price_type: PriceType;
  price_currency?: 'CUP' | 'USD';
  images?: string[];
}

interface DemoProvider {
  email: string;
  full_name: string;
  avatar?: string;
  business_name: string;
  description: string;
  province: string;
  municipality: string;
  address: string;
  whatsapp: string;
  years: number;
  plan: Plan;
  contact_mode?: 'whatsapp' | 'call' | 'both';
  negocio?: { horario: string };
  services: DemoService[];
}

const img = (name: string) => `/demo/${name}.webp`;

const providers: DemoProvider[] = [
  {
    email: 'proveedor@demo.com',
    full_name: 'Yoandry Pérez',
    avatar: img('avatar-7'),
    business_name: 'ElectroHogar Vedado',
    description: 'Electricista y plomero con 8 años de oficio en La Habana. Instalaciones nuevas, averías urgentes y mantenimiento de viviendas y pequeños negocios. Trabajo limpio, materiales garantizados y presupuesto sin compromiso.',
    province: 'La Habana', municipality: 'Plaza de la Revolución',
    address: 'Calle 23 e/ 10 y 12, Vedado', whatsapp: '+5352000002', years: 8, plan: 'pro',
    services: [
      { category: 'electricidad', title: 'Instalación eléctrica residencial', description: 'Cableado nuevo, cambio de tomacorrientes e interruptores, breakers y tierra física. Reviso la instalación completa antes de empezar y te entrego todo probado.', price_min: 15000, price_max: 60000, price_type: 'fixed', images: [img('electricidad-1'), img('electricidad-2')] },
      { category: 'fontaneria-plomeria', title: 'Reparación de plomería y salideros', description: 'Salideros, tupiciones, cambio de llaves y mezcladoras, instalación de tanques y bombas de agua. Atención el mismo día en Plaza, Centro Habana y Vedado.', price_min: 3000, price_max: 12000, price_type: 'fixed', images: [img('plomeria-1'), img('plomeria-2')] },
      { category: 'electricidad', title: 'Instalación de ventiladores y lámparas', description: 'Montaje de ventiladores de techo, lámparas LED y reflectores. Incluye revisión de la línea y fijación segura.', price_min: 2500, price_max: 6000, price_type: 'fixed' },
    ],
  },
  {
    email: 'carpinteria@demo.com',
    full_name: 'Reinaldo Díaz',
    avatar: img('avatar-2'),
    business_name: 'Carpintería Hermanos Díaz',
    description: 'Taller familiar con tres generaciones de carpinteros. Muebles a medida en maderas preciosas, restauración de piezas antiguas y carpintería de obra (puertas, ventanas y closets).',
    province: 'Santiago de Cuba', municipality: 'Santiago de Cuba',
    address: 'Calle Heredia #412, Centro histórico', whatsapp: '+5352000011', years: 22, plan: 'pro', negocio: { horario: 'Lunes a sábado, 8:00 a. m. – 5:00 p. m.' }, contact_mode: 'both',
    services: [
      { category: 'carpinteria', title: 'Muebles a medida en madera preciosa', description: 'Closets, cocinas, libreros y camas diseñados para tu espacio. Te acompañamos desde el boceto hasta la instalación.', price_min: 150, price_max: 700, price_currency: 'USD', price_type: 'fixed', images: [img('carpinteria-1'), img('carpinteria-2')] },
      { category: 'carpinteria', title: 'Restauración de muebles antiguos', description: 'Recuperamos sillones, cómodas y puertas coloniales: desarme, tratamiento contra comején, barniz y tapicería.', price_type: 'negotiable', images: [img('carpinteria-2')] },
    ],
  },
  {
    email: 'clima@demo.com',
    full_name: 'Osmany Rodríguez',
    avatar: img('avatar-3'),
    business_name: 'Clima Frío Express',
    description: 'Técnico en refrigeración y climatización. Instalo, limpio y reparo splits, neveras y aires de ventana. Carga de gas con equipo de medición y garantía de 3 meses.',
    province: 'La Habana', municipality: 'Playa',
    address: '5ta Avenida y 42, Miramar', whatsapp: '+5352000012', years: 11, plan: 'pro', negocio: { horario: 'Todos los días, 8:00 a. m. – 8:00 p. m.' },
    services: [
      { category: 'aire-acondicionado', title: 'Instalación de split con garantía', description: 'Instalación completa de split de 1 a 2 toneladas: soporte, tubería, desagüe y puesta en marcha con prueba de presión.', price_min: 40, price_max: 80, price_currency: 'USD', price_type: 'fixed' },
      { category: 'aire-acondicionado', title: 'Mantenimiento y limpieza de aire acondicionado', description: 'Limpieza profunda de evaporador y condensador, revisión de gas y ajuste eléctrico. Tu equipo enfría más y gasta menos.', price_min: 6000, price_max: 12000, price_type: 'fixed' },
      { category: 'refrigeracion', title: 'Reparación de neveras y freezers', description: 'Diagnóstico a domicilio, cambio de termostato, relé y compresor. Carga de gas R134a y R600.', price_min: 5000, price_max: 40000, price_type: 'fixed' },
    ],
  },
  {
    email: 'belleza@demo.com',
    full_name: 'Yamilé Castro',
    avatar: img('avatar-5'),
    business_name: 'Estudio de Belleza Yami',
    description: 'Peluquería y maquillaje profesional en Santa Clara. Cortes, color, keratina y maquillaje para bodas y quinces. También voy a domicilio.',
    province: 'Villa Clara', municipality: 'Santa Clara',
    address: 'Calle Independencia #58', whatsapp: '+5352000013', years: 9, plan: 'basic',
    services: [
      { category: 'peluqueria-barberia', title: 'Corte, color y peinado', description: 'Corte a la moda, tinte o mechas y secado con peinado. Uso productos profesionales y te asesoro según tu tipo de pelo.', price_min: 1500, price_max: 10000, price_type: 'fixed', images: [img('salon-1')] },
      { category: 'maquillaje', title: 'Maquillaje para bodas y quinces', description: 'Prueba previa incluida, maquillaje de larga duración y retoque. Paquetes para la novia o quinceañera y acompañantes.', price_min: 8000, price_max: 20000, price_type: 'fixed', images: [img('maquillaje-1')] },
    ],
  },
  {
    email: 'mecanica@demo.com',
    full_name: 'Alexis Martínez',
    business_name: 'Mecánica El Tinajón',
    description: 'Taller de mecánica general para autos americanos, Ladas, Moskvich y carros modernos. Motor, caja, frenos y suspensión. Diagnóstico honesto antes de tocar nada.',
    province: 'Camagüey', municipality: 'Camagüey',
    address: 'Carretera Central km 3', whatsapp: '+5352000014', years: 17, plan: 'pro',
    services: [
      { category: 'mecanica-general', title: 'Reparación de motor y ajuste', description: 'Ajuste de motor, cambio de juntas, puesta a punto y adaptación de motores diésel. Te muestro las piezas cambiadas.', price_type: 'negotiable', images: [img('mecanica-1'), img('mecanica-3')] },
      { category: 'mecanica-general', title: 'Cambio de aceite y revisión general', description: 'Cambio de aceite y filtros, revisión de frenos, luces y suspensión con informe por escrito.', price_min: 4000, price_max: 8000, price_type: 'fixed', images: [img('mecanica-2')] },
    ],
  },
  {
    email: 'tecnofix@demo.com',
    full_name: 'Daniel Fuentes',
    business_name: 'TecnoFix Holguín',
    description: 'Reparación de celulares, tablets y laptops. Cambio de pantallas y baterías, software, recuperación de datos y liberaciones.',
    province: 'Holguín', municipality: 'Holguín',
    address: 'Calle Maceo, frente al parque Calixto García', whatsapp: '+5352000015', years: 6, plan: 'free', contact_mode: 'both',
    services: [
      { category: 'celulares-tablets', title: 'Cambio de pantalla y batería de celular', description: 'Pantallas y baterías para Samsung, Xiaomi, Motorola e iPhone. La mayoría de los arreglos quedan listos en el día.', price_min: 8000, price_max: 45000, price_type: 'fixed', images: [img('celulares-1'), img('electronica-1')] },
    ],
  },
  {
    email: 'dulces@demo.com',
    full_name: 'Marisol Hernández',
    avatar: img('avatar-4'),
    business_name: 'Dulces La Abuela',
    description: 'Repostería casera por encargo en Matanzas: cakes de cumpleaños, panetelas, pasteles y dulces finos para fiestas. Recetas de familia y buenos ingredientes.',
    province: 'Matanzas', municipality: 'Matanzas',
    address: 'Reparto Versalles', whatsapp: '+5352000016', years: 14, plan: 'basic',
    services: [
      { category: 'reposteria', title: 'Cakes de cumpleaños por encargo', description: 'Cakes decorados de 1 a 5 libras con merengue o chocolate. Encarga con 48 horas; entrega a domicilio en la ciudad.', price_min: 4000, price_max: 18000, price_type: 'fixed', images: [img('reposteria-1')] },
      { category: 'comida-eventos', title: 'Buffet de dulces para fiestas', description: 'Mesa de dulces completa: bocaditos, pastelitos, gaceñiga y señoritas. Precio por invitado.', price_min: 350, price_max: 700, price_type: 'fixed', images: [img('cocina-1')] },
    ],
  },
  {
    email: 'profeana@demo.com',
    full_name: 'Ana Beatriz Soto',
    avatar: img('avatar-1'),
    business_name: 'Profe Ana — Repasos',
    description: 'Licenciada en Educación, especialidad Matemática. Repasos para pruebas de ingreso, secundaria y preuniversitario. Grupos pequeños o clases individuales.',
    province: 'Cienfuegos', municipality: 'Cienfuegos',
    address: 'Punta Gorda', whatsapp: '+5352000017', years: 12, plan: 'free', contact_mode: 'call',
    services: [
      { category: 'matematicas-fisica', title: 'Repaso de Matemática para pruebas de ingreso', description: 'Temario completo de las pruebas de ingreso, exámenes resueltos y simulacros cronometrados cada semana.', price_min: 800, price_max: 1500, price_type: 'hourly', images: [img('clases-1'), img('clases-2')] },
    ],
  },
  {
    email: 'pinturas@demo.com',
    full_name: 'Ernesto Valdés',
    business_name: 'Pinturas Colonial Trinidad',
    description: 'Pintura de interiores y fachadas, con especialidad en casas coloniales: resanes, cal, esmalte y rejas. Cuadrilla de tres pintores.',
    province: 'Sancti Spíritus', municipality: 'Trinidad',
    address: 'Calle Simón Bolívar', whatsapp: '+5352000018', years: 15, plan: 'pro',
    services: [
      { category: 'pintura', title: 'Pintura de fachadas e interiores', description: 'Preparación de superficie, resane, sellador y dos manos de pintura. Cotizo por metro cuadrado tras visitar la casa.', price_min: 600, price_max: 1200, price_type: 'fixed', images: [img('pintura-1')] },
      { category: 'soldadura', title: 'Rejas y portones a medida', description: 'Fabricación, soldadura y pintura anticorrosiva de rejas, portones y barandas.', price_type: 'negotiable', images: [img('soldadura-1')] },
    ],
  },
  {
    email: 'mudanzas@demo.com',
    full_name: 'Raúl Cabrera',
    business_name: 'Mudanzas Vueltabajo',
    description: 'Mudanzas y fletes en camión cerrado dentro de Pinar del Río y hacia La Habana. Embalaje, carga y montaje de muebles.',
    province: 'Pinar del Río', municipality: 'Pinar del Río',
    address: 'Calle Martí final', whatsapp: '+5352000019', years: 7, plan: 'basic',
    services: [
      { category: 'mudanzas', title: 'Mudanza completa con embalaje', description: 'Camión cerrado, dos cargadores, mantas y embalaje de lo frágil. Precio cerrado según volumen y distancia.', price_min: 15000, price_max: 70000, price_type: 'fixed', images: [img('mudanzas-1')] },
      { category: 'fletes-carga', title: 'Flete por día', description: 'Camión con chofer para cargas de materiales, mercancía o equipos.', price_min: 35000, price_max: 35000, price_type: 'daily' },
    ],
  },
  {
    email: 'limpieza@demo.com',
    full_name: 'Lisandra Gómez',
    business_name: 'Brillo Total',
    description: 'Limpieza profunda de casas, apartamentos de renta y oficinas. Limpieza post-obra y de cristales.',
    province: 'La Habana', municipality: 'Habana Vieja',
    address: 'Calle Obispo', whatsapp: '+5352000020', years: 5, plan: 'free',
    services: [
      { category: 'limpieza-hogar', title: 'Limpieza profunda de vivienda', description: 'Cocina, baños, cristales y pisos. Ideal para rentas entre huéspedes. Llevamos los productos.', price_min: 4000, price_max: 12000, price_type: 'fixed', images: [img('limpieza-1')] },
    ],
  },
  {
    email: 'costura@demo.com',
    full_name: 'Caridad Estrada',
    business_name: 'Taller de Costura Cachita',
    description: 'Arreglos de ropa, confección a medida y vestidos de quince. Trabajo rápido y con esmero.',
    province: 'Granma', municipality: 'Bayamo',
    address: 'Calle General García', whatsapp: '+5352000021', years: 25, plan: 'free',
    services: [
      { category: 'costura-arreglos', title: 'Arreglos y confección a medida', description: 'Dobladillos, zipper, ajustes de talla y confección de ropa a medida. Arreglos sencillos en 24 horas.', price_min: 500, price_max: 8000, price_type: 'fixed', images: [img('costura-1')] },
    ],
  },
];

const clients = [
  { email: 'cliente@demo.com', full_name: 'Laura Méndez', avatar: img('avatar-6') },
  { email: 'carlos@demo.com', full_name: 'Carlos Ferrer' },
  { email: 'maria@demo.com', full_name: 'María José Ruiz' },
  { email: 'jorge@demo.com', full_name: 'Jorge Luis Batista' },
  { email: 'dayana@demo.com', full_name: 'Dayana Quintero' },
];

const reviewComments: Record<number, string[]> = {
  5: [
    'Excelente trabajo, puntual y muy limpio. Lo recomiendo sin dudas.',
    'Resolvió el problema en una sola visita y me explicó todo. Volveré a llamarlo.',
    'Muy profesional y con buen precio. Quedé encantada.',
    'Rápido, serio y cumplió exactamente lo acordado.',
  ],
  4: [
    'Buen trabajo, aunque llegó un poco tarde. El resultado quedó muy bien.',
    'Cumplió con lo prometido. El precio fue justo.',
  ],
  3: ['El trabajo quedó bien pero tardó más días de lo acordado.'],
};

const daysAgo = (d: number, h = 0) => new Date(Date.now() - (d * 24 + h) * 3600_000).toISOString();

export async function seedDemo() {
  const already = db.prepare('SELECT 1 FROM users WHERE email = ?').get('cliente@demo.com');
  if (already) return false;

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const categoryId = (slug: string) => {
    const row = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) as { id: string } | undefined;
    if (!row) throw new Error(`Categoría demo inexistente: ${slug}`);
    return row.id;
  };

  const tx = db.transaction(() => {
    const clientIds = clients.map((c, i) => {
      const id = uuidv4();
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, phone, user_type, avatar_url, is_verified, created_at)
        VALUES (?, ?, ?, ?, ?, 'client', ?, 1, ?)`)
        .run(id, c.email, hash, c.full_name, `+535300000${i + 1}`, c.avatar ?? null, daysAgo(200 - i * 10));
      return id;
    });

    const providerRows: { profileId: string; userId: string; services: string[] }[] = [];
    providers.forEach((p, i) => {
      const userId = uuidv4();
      const profileId = uuidv4();
      const created = daysAgo(400 - i * 25);
      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, phone, user_type, avatar_url, is_verified, created_at)
        VALUES (?, ?, ?, ?, ?, 'provider', ?, 1, ?)`)
        .run(userId, p.email, hash, p.full_name, p.whatsapp, p.avatar ?? null, created);

      const province = db.prepare('SELECT id, lat, lng FROM provinces WHERE name = ?').get(p.province) as { id: string; lat: number; lng: number };
      const muni = db.prepare('SELECT id, lat, lng FROM municipalities WHERE province_id = ? AND name = ?').get(province.id, p.municipality) as { id: string; lat: number; lng: number } | undefined;
      const expires = p.plan === 'free' ? null : new Date(Date.now() + 365 * 86400_000).toISOString();
      // Galería del negocio (planes con fotos): las fotos de sus servicios.
      const gallery = p.plan === 'free' ? [] : [...new Set(p.services.flatMap((s) => s.images ?? []))].slice(0, 10);
      const paid = p.plan !== 'free';
      db.prepare(`INSERT INTO provider_profiles (id, user_id, business_name, description, province_id, municipality_id, address, lat, lng,
          whatsapp, telegram, email_contact, years_experience, is_active, subscription_plan, subscription_expires_at, created_at,
          contact_mode, kind, horario, gallery, show_on_map)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1)`)
        .run(profileId, userId, p.business_name, p.description, province.id, muni?.id ?? null, p.address,
          muni?.lat ?? province.lat, muni?.lng ?? province.lng, p.whatsapp, paid ? p.whatsapp : null, paid ? p.email : null, p.years, p.plan, expires, created,
          p.contact_mode ?? 'whatsapp', p.negocio ? 'negocio' : 'oficio', p.negocio?.horario ?? null, JSON.stringify(gallery));

      if (p.plan !== 'free') {
        const subId = uuidv4();
        const price = { basic: 1, pro: 10 }[p.plan];
        db.prepare(`INSERT INTO subscriptions (id, provider_id, plan, amount, status, current_period_start, current_period_end)
          VALUES (?, ?, ?, ?, 'active', ?, ?)`).run(subId, profileId, p.plan, price, daysAgo(20), expires);
        db.prepare(`INSERT INTO payments (id, subscription_id, provider_id, amount, status, metadata, created_at)
          VALUES (?, ?, ?, ?, 'succeeded', ?, ?)`).run(uuidv4(), subId, profileId, price, JSON.stringify({ demo: true }), daysAgo(20));
      }

      const serviceIds = p.services.map((s, j) => {
        const sid = uuidv4();
        db.prepare(`INSERT INTO services (id, provider_id, category_id, title, description, price_min, price_max, price_type, price_currency, images, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
          .run(sid, profileId, categoryId(s.category), s.title, s.description, s.price_min ?? null, s.price_max ?? null,
            s.price_type, s.price_currency ?? 'CUP', JSON.stringify(s.images ?? []), daysAgo(300 - i * 20 - j * 7));
        return sid;
      });

      db.prepare('INSERT INTO service_areas (id, provider_id, municipality_id) SELECT ?, ?, id FROM municipalities WHERE province_id = ? ORDER BY name LIMIT 1')
        .run(uuidv4(), profileId, province.id);
      if (muni) db.prepare('INSERT OR IGNORE INTO service_areas (id, provider_id, municipality_id) VALUES (?, ?, ?)').run(uuidv4(), profileId, muni.id);

      providerRows.push({ profileId, userId, services: serviceIds });
    });

    // Reseñas deterministas: cada proveedor recibe entre 0 y 5, con conversación previa
    // (la API solo deja reseñar a quien ya contactó al proveedor).
    const ratingPattern = [5, 5, 4, 5, 3, 5, 4, 5];
    providerRows.forEach((prov, i) => {
      const count = [5, 4, 5, 3, 4, 1, 4, 2, 3, 2, 0, 1][i] ?? 0;
      for (let k = 0; k < count; k++) {
        const clientIndex = (i + k) % clients.length;
        const clientId = clientIds[clientIndex];
        const serviceId = prov.services[k % prov.services.length];
        const rating = ratingPattern[(i * 3 + k) % ratingPattern.length];
        const comments = reviewComments[rating];
        const when = daysAgo(5 + i * 3 + k * 11);
        const exists = db.prepare('SELECT 1 FROM conversations WHERE client_id = ? AND provider_id = ? AND service_id = ?').get(clientId, prov.profileId, serviceId);
        if (!exists) {
          db.prepare('INSERT INTO conversations (id, client_id, provider_id, service_id, last_message, last_message_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), clientId, prov.profileId, serviceId, 'Gracias por todo.', when, when);
        }
        db.prepare('INSERT INTO reviews (id, service_id, client_id, provider_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), serviceId, clientId, prov.profileId, rating, comments[(i + k) % comments.length], when);
      }
      refreshProviderRating(prov.profileId);
    });

    // Conversación viva entre las dos cuentas demo principales.
    const laura = clientIds[0];
    const electro = providerRows[0];
    const convId = uuidv4();
    const thread: [('client' | 'provider'), string, number][] = [
      ['client', 'Hola Yoandry, se me botó el agua por la llave del fregadero y además el breaker de la cocina se dispara. ¿Puedes venir esta semana?', 50],
      ['provider', '¡Hola Laura! Sí, puedo pasar el jueves por la mañana. ¿Me dices la dirección exacta?', 49],
      ['client', 'Calle 17 #254 e/ H e I, Vedado. Segundo piso.', 48],
      ['provider', 'Perfecto. Llevo la llave de repuesto y reviso el breaker. La visita más la llave sale en unos 9 000 CUP.', 47],
      ['client', 'Dale, te espero el jueves. ¡Gracias!', 2],
    ];
    const last = thread[thread.length - 1];
    db.prepare('INSERT INTO conversations (id, client_id, provider_id, service_id, last_message, last_message_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(convId, laura, electro.profileId, electro.services[1], last[1], daysAgo(0, last[2]), daysAgo(0, thread[0][2]));
    for (const [who, content, hoursAgo] of thread) {
      const sender = who === 'client' ? laura : electro.userId;
      const readAt = hoursAgo > 2 ? daysAgo(0, hoursAgo - 1) : null;
      db.prepare('INSERT INTO messages (id, conversation_id, sender_id, sender_type, content, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), convId, sender, who, content, readAt, daysAgo(0, hoursAgo));
    }

    // Agenda de ElectroHogar (plan Profesional): partido de 9 a 13 y de 14 a 18, sábado por la mañana.
    const partido = [{ desde: '09:00', hasta: '13:00' }, { desde: '14:00', hasta: '18:00' }];
    db.prepare('UPDATE provider_profiles SET agenda = ? WHERE id = ?').run(JSON.stringify({
      v: 2, semana: [[], partido, partido, partido, partido, partido, [{ desde: '09:00', hasta: '13:00' }]], excepciones: [],
      duracion: 60, intervalo: 30, margen_antes: 0, margen_despues: 30, antelacion_min: 120, horizonte_dias: 30,
      max_por_dia: null, confirmacion: 'manual', cancelacion_horas: 12,
    }), electro.profileId);
    db.prepare('UPDATE services SET duration_min = 90 WHERE id = ?').run(electro.services[1]);

    // Citas: mañana confirmada, pasado mañana pendiente, una hecha, un "no vino" y una apuntada a mano.
    const aLas = (dias: number, hora: number) => new Date(instanteLocal(sumarDias(fechaLocal(Date.now()), dias), hora * 60, 'despues')!).toISOString();
    const citas: [string | null, number, number, string, string, string | null][] = [
      [laura, 1, 10, 'confirmed', 'Revisar el breaker de la cocina.', null],
      [clientIds[1], 2, 14, 'pending', 'Instalar dos ventiladores de techo.', null],
      [clientIds[2], -3, 9, 'done', 'Cambio de tomacorrientes.', null],
      [clientIds[1], -6, 11, 'no_show', 'Revisar el calentador.', null],
      [null, 1, 15, 'confirmed', 'Pasa por el taller con la batidora.', 'Mercedes (vecina)'],
    ];
    for (const [cliente, dias, hora, status, note, nombre] of citas) {
      const inicio = aLas(dias, hora);
      db.prepare(`INSERT INTO appointments (id, provider_id, client_id, service_id, starts_at, ends_at, duration_min, note, client_name, client_phone, origin, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 60, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), electro.profileId, cliente, electro.services[0], inicio,
        new Date(Date.parse(inicio) + 3_600_000).toISOString(), note, nombre, nombre ? '+53 5 555 0101' : null, nombre ? 'manual' : 'online', status, daysAgo(4));
    }
    db.prepare('INSERT INTO agenda_blocks (id, provider_id, starts_at, ends_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), electro.profileId, aLas(3, 9), aLas(3, 13), 'Compra de piezas', daysAgo(1));

    // Catálogos: ElectroHogar (Profesional) vende piezas y Dulces La Abuela (Básico) sus dulces.
    const catalogo = (providerIdx: number, items: [string, string, number | null, 'fixed' | 'from' | 'ask', 'CUP' | 'USD', string | null, string, boolean][]) => {
      items.forEach(([name, description, price, price_type, currency, image, section, available], i) => {
        db.prepare(`INSERT INTO catalog_items (id, provider_id, name, description, price, price_type, price_currency, image, section, available, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(uuidv4(), providerRows[providerIdx].profileId, name, description, price, price_type,
          currency, image, section, available ? 1 : 0, daysAgo(20 - i));
      });
    };
    catalogo(0, [
      ['Breaker 20 A', 'Interruptor termomagnético de riel DIN, nuevo en caja.', 3500, 'fixed', 'CUP', '/demo/electricidad-1.webp', 'Piezas', true],
      ['Tomacorriente doble', 'Con tierra, blanco. Incluye tapa.', 900, 'fixed', 'CUP', null, 'Piezas', true],
      ['Cable 2×12 (metro)', 'Cable dúplex de cobre, se vende por metros.', 450, 'fixed', 'CUP', null, 'Piezas', true],
      ['Bombillo LED 12 W', 'Luz fría, rosca E27.', 2, 'fixed', 'USD', null, 'Piezas', false],
      ['Ventilador de techo', 'Tres velocidades, con instalación aparte.', 95, 'fixed', 'USD', '/demo/electricidad-2.webp', 'Equipos', true],
      ['Estabilizador de voltaje', 'Para refrigerador o split. Pregunta por modelos.', null, 'ask', 'USD', '/demo/electronica-1.webp', 'Equipos', true],
      ['Revisión de instalación', 'Visita, diagnóstico y presupuesto por escrito.', 2000, 'from', 'CUP', null, 'Servicios', true],
      ['Montaje de lámpara', 'Colgar y conectar lámpara o plafón.', 1500, 'from', 'CUP', null, 'Servicios', true],
    ]);
    catalogo(6, [
      ['Cake de chocolate (1 lb)', 'Relleno de dulce de leche, decorado a tu gusto.', 3500, 'fixed', 'CUP', '/demo/reposteria-1.webp', 'Cakes', true],
      ['Cake de cumpleaños (3 lb)', 'Con nombre y figuras. Encárgalo con 2 días.', 9000, 'from', 'CUP', null, 'Cakes', true],
      ['Pastelitos de guayaba (docena)', 'Hojaldre casero.', 1200, 'fixed', 'CUP', null, 'Dulces', true],
      ['Flan de leche', 'Molde grande, para 8 personas.', 1800, 'fixed', 'CUP', null, 'Dulces', true],
      ['Merenguitos (bolsa)', 'Unos 30 merenguitos de colores.', 600, 'fixed', 'CUP', null, 'Dulces', false],
    ]);

    for (const idx of [0, 2, 3]) {
      db.prepare('INSERT OR IGNORE INTO favorites (id, client_id, provider_id) VALUES (?, ?, ?)').run(uuidv4(), laura, providerRows[idx].profileId);
    }
  });
  tx();
  return true;
}

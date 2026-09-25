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

// Los municipios no traen coordenadas reales: se reparten en espiral alrededor de la
// capital provincial para que los marcadores no se solapen y sean estables entre arranques.
function municipalityCoords(base: { lat: number; lng: number }, index: number) {
  if (index === 0) return { lat: base.lat, lng: base.lng };
  const angle = index * 2.39996;
  const radius = 0.06 + 0.035 * Math.sqrt(index);
  return { lat: base.lat + radius * Math.sin(angle), lng: base.lng + radius * 1.2 * Math.cos(angle) };
}

export function seedBase() {
  const tx = db.transaction(() => {
    const provinceIds = new Map<string, string>();
    for (const province of provinces) {
      const existing = db.prepare('SELECT id FROM provinces WHERE name = ?').get(province.name) as { id: string } | undefined;
      if (existing) {
        provinceIds.set(province.name, existing.id);
        continue;
      }
      db.prepare('INSERT INTO provinces (id, name, capital, lat, lng, zoom) VALUES (@id, @name, @capital, @lat, @lng, @zoom)').run(province);
      provinceIds.set(province.name, province.id);
    }

    for (const { province, municipalities: names } of municipalities) {
      const provinceId = provinceIds.get(province);
      const base = provinces.find((p) => p.name === province);
      if (!provinceId || !base) continue;
      names.forEach((name, index) => {
        const exists = db.prepare('SELECT 1 FROM municipalities WHERE name = ? AND province_id = ?').get(name, provinceId);
        if (exists) return;
        const { lat, lng } = municipalityCoords(base, index);
        db.prepare('INSERT INTO municipalities (id, name, province_id, lat, lng) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), name, provinceId, lat, lng);
      });
    }

    const insertCategory = db.prepare(`
      INSERT INTO categories (id, name, slug, icon, description, parent_id, sort_order)
      VALUES (@id, @name, @slug, @icon, @description, @parent_id, @sort_order)
    `);
    for (const cat of categories) {
      let parent = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cat.slug) as { id: string } | undefined;
      if (!parent) {
        insertCategory.run({ id: cat.id, name: cat.name, slug: cat.slug, icon: cat.icon, description: cat.name, parent_id: null, sort_order: cat.sort_order });
        parent = { id: cat.id };
      }
      cat.subcategories.forEach((sub, i) => {
        if (db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(sub.slug)) return;
        insertCategory.run({ id: uuidv4(), name: sub.name, slug: sub.slug, icon: sub.icon, description: sub.name, parent_id: parent!.id, sort_order: i });
      });
    }
  });
  tx();
}

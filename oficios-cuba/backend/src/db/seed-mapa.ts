import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from './index.js';
import { puntoPublico } from '../lib/ubicacion.js';
import { seedBase } from './seed.js';

export const SEED_MAPA_PASSWORD = 'Prueba123!';

const N = 300;

// El 40 % vive en municipios de La Habana: a zoom de provincia eso deja celdas con cinco o seis
// perfiles detrás, que es lo que hace visible el «+N». HABANA_LAT/LNG es el centro de celda fijo
// donde se apilan los tres de ZONA_COMPARTIDA, no el centro del reparto.
const HABANA_LAT = 23.10;
const HABANA_LNG = -82.38;
const EN_HABANA = Math.round(N * 0.4);

// Los perfiles cuelgan del centro de su MUNICIPIO, no de la capital provincial. Antes se
// dispersaban ±0,3° (±33 km) alrededor de la capital, lo que en provincias costeras sembraba
// negocios mar adentro. El centro de un municipio es un pueblo: está en tierra por definición,
// y ±900 m de ahí sigue estándolo. Además queda realista — los negocios se agrupan en los
// pueblos, que es como se reparten de verdad, en vez de salpicar el campo de forma uniforme.
const JITTER_MUNICIPIO = 0.016;

// Nombres creíbles: al tocar un punto del mapa se lee un negocio, no «Prueba 137».
const RUBROS = ['Taller', 'Servicios', 'Casa', 'Punto', 'El Rincón', 'La Esquina', 'Agro', 'Clínica',
  'Barbería', 'Dulcería', 'Ferretería', 'Cafetería', 'Estudio', 'Multiservicios'];
const APELLIDOS = ['Pérez', 'Rodríguez', 'Hernández', 'Díaz', 'Fernández', 'Suárez', 'Caballero',
  'Valdés', 'Almeida', 'Quesada', 'Betancourt', 'Zaldívar', 'Nápoles', 'Guerra', 'Sotolongo'];
const CALLES = ['Calle Martí', 'Avenida Céspedes', 'Calle Maceo', 'Carretera Central', 'Calle Real',
  'Avenida Libertad', 'Calle Independencia', 'Calle Gómez'];

// Determinista y sin Math.random: el mismo índice da siempre el mismo desvío, así el sembrado
// (y por tanto el recorte de /api/mapa sobre él) es reproducible y las pruebas pueden afirmar
// ids y conteos concretos en vez de "algún número".
function pseudoAzar(i: number, sal: number): number {
  const x = Math.sin(i * 12.9898 + sal * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// Ronda de arreglo 1: "divisible por 3 → pro, por 4 → basic" (la fórmula original del brief) le
// da los múltiplos de 12 a pro antes de que basic los cuente, y deja 33 %/17 %/50 % en vez del
// ~35/25/40 objetivo. Un ciclo de 20 (300 = 15 vueltas exactas) sí da el objetivo exacto: 7 pro
// (35 %), 5 basic (25 %), 8 free (40 %). Verificado contando las filas, no razonando la fórmula.
function planDe(i: number): 'free' | 'basic' | 'pro' {
  const ciclo = (i - 1) % 20;
  if (ciclo < 7) return 'pro';
  if (ciclo < 12) return 'basic';
  return 'free';
}

// Uno de cada cinco perfiles se publica con precisión de "zona" (redondeada a la celda de
// ~1 km que usa /api/mapa): antes del arreglo, los 300 quedaban en 'exacta' (el default de la
// columna) porque el INSERT nunca tocaba map_precision, así que el camino de coordenada
// redondeada no tenía ni un dato de desarrollo que lo mostrara.
const ZONA_CADA = 5;

// A propósito, tres de esos perfiles "zona" comparten la misma celda de 0,01° al redondear (con
// suficiente margen — ±0,003° contra medio lado de celda 0,005° — para que caigan siempre en la
// celda de La Habana, aunque los tres son perfiles distintos con su propio desvío): así hay un
// caso real de "varios profesionales de zona apilados en el mismo punto" que mirar en desarrollo.
const ZONA_COMPARTIDA = new Set([5, 10, 15]);

/**
 * Siembra 300 perfiles sintéticos ("Prueba 1".."Prueba 300"), visibles en el mapa, para que la
 * densidad del /api/mapa (un perfil por celda, "+N detrás") se pueda ver y probar en desarrollo.
 * Producción tiene 12 perfiles con coordenadas: a casi cualquier zoom salen todos, y nadie puede
 * comprobar el algoritmo con eso.
 */
export async function seedMapa(): Promise<number> {
  // El centinela es DEMO_MODE, no NODE_ENV: DEMO_MODE=true es el marcador que ya usa el proyecto
  // para «esta base contiene datos falsos». Mirar NODE_ENV protegía menos — una instancia real a
  // la que se le perdiera la variable quedaba abierta, y un despliegue de demo, cerrado sin razón.
  if (process.env.DEMO_MODE !== 'true') {
    throw new Error('seedMapa solo corre con DEMO_MODE=true: sembraría 300 negocios falsos en datos reales.');
  }

  // El centinela es el correo, no el nombre del negocio: los nombres ahora son creíbles y
  // variados, así que ya no sirven para reconocer lo sembrado. El correo sí es estable.
  const yaExiste = db.prepare("SELECT 1 FROM users WHERE email = 'prueba.mapa.1@oficios.test'").get();
  if (yaExiste) return 0;

  // seedBase() es idempotente (revisa lo que ya existe antes de insertar): llamarla aquí deja
  // a seedMapa() valerse por sí sola con solo initDatabase(), como hace su propia prueba.
  seedBase();

  const categoria = db.prepare('SELECT id FROM categories WHERE parent_id IS NOT NULL LIMIT 1').get() as { id: string } | undefined;
  if (!categoria) throw new Error('seedMapa necesita las categorías ya sembradas (seedBase primero)');

  const provincias = db.prepare('SELECT id, name, lat, lng FROM provinces ORDER BY name').all() as
    { id: string; name: string; lat: number; lng: number }[];
  if (provincias.length === 0) throw new Error('seedMapa necesita las provincias ya sembradas (seedBase primero)');
  const habana = provincias.find((p) => p.name === 'La Habana') ?? provincias[0];

  const municipios = db.prepare('SELECT id, name, province_id, lat, lng FROM municipalities ORDER BY name').all() as
    { id: string; name: string; province_id: string; lat: number; lng: number }[];
  if (municipios.length === 0) throw new Error('seedMapa necesita los municipios ya sembrados (seedBase primero)');
  const deHabana = municipios.filter((m) => m.province_id === habana.id);

  const hash = await bcrypt.hash(SEED_MAPA_PASSWORD, 10);

  const tx = db.transaction(() => {
    for (let i = 1; i <= N; i++) {
      const plan = planDe(i);
      const mapPrecision: 'exacta' | 'zona' = i % ZONA_CADA === 0 ? 'zona' : 'exacta';

      let provinceId: string;
      let municipalityId: string | null;
      let lat: number;
      let lng: number;
      if (ZONA_COMPARTIDA.has(i)) {
        // Los tres tienen que caer en la MISMA celda de ~1 km para que el redondeo de 'zona' sea
        // observable, así que estos no cuelgan de un municipio: van a ±0,003° de un centro de
        // celda fijo (23,10 / −82,38, en tierra, entre Cerro y Plaza).
        provinceId = habana.id;
        municipalityId = deHabana[0]?.id ?? null;
        lat = HABANA_LAT + (pseudoAzar(i, 7) - 0.5) * 0.006;
        lng = HABANA_LNG + (pseudoAzar(i, 8) - 0.5) * 0.006;
      } else {
        // El 40 % en municipios de La Habana; el resto repartido por toda la isla.
        const pool = i <= EN_HABANA && deHabana.length ? deHabana : municipios;
        const m = pool[i % pool.length];
        provinceId = m.province_id;
        municipalityId = m.id;
        lat = m.lat + (pseudoAzar(i, 1) - 0.5) * JITTER_MUNICIPIO;
        lng = m.lng + (pseudoAzar(i, 2) - 0.5) * JITTER_MUNICIPIO;
      }
      const nombre = `${RUBROS[i % RUBROS.length]} ${APELLIDOS[(i * 7) % APELLIDOS.length]}`;
      const direccion = `${CALLES[(i * 3) % CALLES.length]} nº ${10 + (i % 180)}`;

      const userId = uuidv4();
      const profileId = uuidv4();

      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, phone, user_type, is_verified)
        VALUES (?, ?, ?, ?, ?, 'provider', 1)`)
        .run(userId, `prueba.mapa.${i}@oficios.test`, hash, `Prueba ${i}`, `+53500${String(i).padStart(5, '0')}`);

      // El punto publicado se sortea aquí, igual que lo haría el formulario: así el sembrado
      // ejercita de verdad el camino aproximado y no una versión de juguete.
      const pub = puntoPublico(lat, lng, mapPrecision);
      db.prepare(`INSERT INTO provider_profiles
          (id, user_id, business_name, description, province_id, municipality_id, address, lat, lng, map_lat_pub, map_lng_pub, whatsapp, is_active, subscription_plan, show_on_map, map_precision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?)`)
        .run(profileId, userId, nombre, 'Perfil sintético de prueba para la densidad del mapa.',
          provinceId, municipalityId, direccion, lat, lng, pub.lat, pub.lng, `+53500${String(i).padStart(5, '0')}`, plan, mapPrecision);

      // Un oficio activo por perfil: lo exige el tab por defecto (servicios) de /api/mapa.
      db.prepare(`INSERT INTO services (id, provider_id, category_id, title, price_type, is_active)
        VALUES (?, ?, ?, ?, 'negotiable', 1)`)
        .run(uuidv4(), profileId, categoria.id, `${RUBROS[i % RUBROS.length]}: servicio ${i}`);
    }
  });
  tx();
  return N;
}

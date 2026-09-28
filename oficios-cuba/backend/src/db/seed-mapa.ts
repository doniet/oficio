import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from './index.js';
import { seedBase } from './seed.js';

export const SEED_MAPA_PASSWORD = 'Prueba123!';

const N = 300;

// El 40 % vive apretado en un cuadrado de 0,3° alrededor de La Habana: a zoom de provincia
// eso deja celdas con cinco o seis perfiles detrás, que es lo que hace visible el «+N».
const HABANA_LAT = 23.10;
const HABANA_LNG = -82.38;
const LADO_HABANA = 0.3;
const EN_HABANA = Math.round(N * 0.4);

// Desvío alrededor de la capital de cada provincia: separa a los perfiles entre sí sin sacarlos
// de su provincia (los municipios reales caben en un radio así).
const JITTER_PROVINCIA = 0.6;

// Determinista y sin Math.random: el mismo índice da siempre el mismo desvío, así el sembrado
// (y por tanto el recorte de /api/mapa sobre él) es reproducible y las pruebas pueden afirmar
// ids y conteos concretos en vez de "algún número".
function pseudoAzar(i: number, sal: number): number {
  const x = Math.sin(i * 12.9898 + sal * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Siembra 300 perfiles sintéticos ("Prueba 1".."Prueba 300"), visibles en el mapa, para que la
 * densidad del /api/mapa (un perfil por celda, "+N detrás") se pueda ver y probar en desarrollo.
 * Producción tiene 12 perfiles con coordenadas: a casi cualquier zoom salen todos, y nadie puede
 * comprobar el algoritmo con eso.
 */
export async function seedMapa(): Promise<number> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seedMapa no se ejecuta en producción: sembraría 300 negocios falsos en datos reales.');
  }

  // Mismo centinela que seed-demo.ts: si "Prueba 1" ya existe, el sembrado ya corrió.
  const yaExiste = db.prepare("SELECT 1 FROM provider_profiles WHERE business_name = 'Prueba 1'").get();
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

  const hash = await bcrypt.hash(SEED_MAPA_PASSWORD, 10);

  const tx = db.transaction(() => {
    for (let i = 1; i <= N; i++) {
      const plan = i % 3 === 0 ? 'pro' : i % 4 === 0 ? 'basic' : 'free';

      let provinceId: string;
      let lat: number;
      let lng: number;
      if (i <= EN_HABANA) {
        provinceId = habana.id;
        lat = HABANA_LAT + (pseudoAzar(i, 1) - 0.5) * LADO_HABANA;
        lng = HABANA_LNG + (pseudoAzar(i, 2) - 0.5) * LADO_HABANA;
      } else {
        const p = provincias[i % provincias.length];
        provinceId = p.id;
        lat = p.lat + (pseudoAzar(i, 3) - 0.5) * JITTER_PROVINCIA;
        lng = p.lng + (pseudoAzar(i, 4) - 0.5) * JITTER_PROVINCIA;
      }

      const userId = uuidv4();
      const profileId = uuidv4();

      db.prepare(`INSERT INTO users (id, email, password_hash, full_name, phone, user_type, is_verified)
        VALUES (?, ?, ?, ?, ?, 'provider', 1)`)
        .run(userId, `prueba.mapa.${i}@oficios.test`, hash, `Prueba ${i}`, `+53500${String(i).padStart(5, '0')}`);

      db.prepare(`INSERT INTO provider_profiles
          (id, user_id, business_name, description, province_id, lat, lng, whatsapp, is_active, subscription_plan, show_on_map)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)`)
        .run(profileId, userId, `Prueba ${i}`, 'Perfil sintético de prueba para la densidad del mapa.',
          provinceId, lat, lng, `+53500${String(i).padStart(5, '0')}`, plan);

      // Un oficio activo por perfil: lo exige el tab por defecto (servicios) de /api/mapa.
      db.prepare(`INSERT INTO services (id, provider_id, category_id, title, price_type, is_active)
        VALUES (?, ?, ?, ?, 'negotiable', 1)`)
        .run(uuidv4(), profileId, categoria.id, `Servicio de prueba ${i}`);
    }
  });
  tx();
  return N;
}

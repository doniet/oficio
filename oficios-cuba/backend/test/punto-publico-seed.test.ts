import { describe, expect, it } from 'vitest';
import { q } from '../src/db/acceso.js';
import { seedMapa } from '../src/db/seed-mapa.js';

// Verificación puntual pedida por la revisión de la Tarea 10: el camino del SEED escribe
// punto_pub con el orden correcto de ST_MakePoint(x=lng, y=lat). Si estuviera invertido,
// todo perfil 'exacta' publicaría lat y lng intercambiados — en Cuba eso pone los negocios
// en el océano Índico, y ningún test del alcance de esa tarea lo habría detectado.
describe('ST_MakePoint en el camino del seed', () => {
  it('un perfil exacta publica su propia coordenada, sin intercambiar lat y lng', async () => {
    process.env.DEMO_MODE = 'true';  // seedMapa se niega a correr sin esto, y con razon
    await seedMapa();
    const filas = await q<{ lat: number; lng: number; pl: number; pg: number }>(`
      SELECT lat, lng, ST_Y(punto_pub::geometry) AS pl, ST_X(punto_pub::geometry) AS pg
      FROM provider_profiles
      WHERE map_precision = 'exacta' AND punto_pub IS NOT NULL AND lat IS NOT NULL
      LIMIT 20
    `);
    expect(filas.length).toBeGreaterThan(5);
    for (const f of filas) {
      expect(Math.abs(f.pl - f.lat), `latitud de ${f.lat},${f.lng}`).toBeLessThan(0.000001);
      expect(Math.abs(f.pg - f.lng), `longitud de ${f.lat},${f.lng}`).toBeLessThan(0.000001);
    }
    // Y que de verdad caen en Cuba, no en el hemisferio equivocado.
    for (const f of filas) {
      expect(f.pl).toBeGreaterThan(19);
      expect(f.pl).toBeLessThan(24);
      expect(f.pg).toBeLessThan(-73);
    }
  });
});

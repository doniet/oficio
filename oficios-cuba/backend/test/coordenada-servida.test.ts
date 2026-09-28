import { describe, expect, it } from 'vitest';
import { api, db, registrar } from './helpers.js';
import { CELDA_ZONA } from '../src/db/index.js';

// Tarea 11: GET /api/mapa (Tarea 2) ya cierra el oráculo de bisección publicando siempre la
// coordenada SERVIDA (redondeada si map_precision != 'exacta'). Pero GET /providers/:id seguía
// devolviendo pp.lat/pp.lng —lo guardado, sin pasar por LAT_SERVIDA/LNG_SERVIDA— así que un
// perfil `zona` publicaba su casa exacta por esta puerta aunque el mapa ya la escondiera. Estas
// pruebas cubren ese endpoint con la misma definición compartida (db/index.ts), para que las dos
// puertas cuenten la misma historia.

function provinciaId() {
  return (db.prepare('SELECT id FROM provinces LIMIT 1').get() as { id: string }).id;
}

async function crearProveedorConMapa(opts: { nombre: string; lat: number; lng: number; mapPrecision?: string }) {
  const pro = await registrar('provider');
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: opts.nombre, province_id: provinciaId(), contact_mode: 'whatsapp',
    lat: opts.lat, lng: opts.lng, show_on_map: true,
    map_precision: opts.mapPrecision === 'zona' ? 'zona' : 'exacta',
  });
  expect(res.status).toBe(200);
  return pro;
}

describe('GET /api/providers/:id — coordenada servida', () => {
  it('un perfil map_precision=zona no devuelve su coordenada exacta: la redondea, y es distinta de la guardada', async () => {
    const LAT_EXACTA = 23.137856, LNG_EXACTA = -82.383754;
    const pro = await crearProveedorConMapa({ nombre: 'Zona Coordenada Servida', lat: LAT_EXACTA, lng: LNG_EXACTA, mapPrecision: 'zona' });

    const r = await api.get(`/api/providers/${pro.providerId}`);
    expect(r.status).toBe(200);

    const LAT_REDONDA = Math.round(LAT_EXACTA / CELDA_ZONA) * CELDA_ZONA;
    const LNG_REDONDA = Math.round(LNG_EXACTA / CELDA_ZONA) * CELDA_ZONA;
    expect(r.body.provider.lat).toBeCloseTo(LAT_REDONDA, 6);
    expect(r.body.provider.lng).toBeCloseTo(LNG_REDONDA, 6);
    expect(r.body.provider.lat).not.toBe(LAT_EXACTA);
    expect(r.body.provider.lng).not.toBe(LNG_EXACTA);
  });

  it('un perfil map_precision=exacta devuelve la suya, sin redondear', async () => {
    const LAT_EXACTA = 22.412233, LNG_EXACTA = -79.987654;
    const pro = await crearProveedorConMapa({ nombre: 'Exacta Coordenada Servida', lat: LAT_EXACTA, lng: LNG_EXACTA, mapPrecision: 'exacta' });

    const r = await api.get(`/api/providers/${pro.providerId}`);
    expect(r.status).toBe(200);
    expect(r.body.provider.lat).toBe(LAT_EXACTA);
    expect(r.body.provider.lng).toBe(LNG_EXACTA);
  });

  // Más allá de lo que pide el brief, igual que test/mapa.test.ts: un valor de map_precision que
  // no es ni 'exacta' ni 'zona' (colado por fuera del CHECK) también debe salir redondeado. La
  // dirección segura de LAT_SERVIDA/LNG_SERVIDA es "todo lo que no sea 'exacta' se degrada", y
  // eso tiene que valer aquí igual que en /api/mapa: es la misma constante compartida.
  it('un map_precision que no es exacta ni zona también sale redondeado', async () => {
    const LAT = 21.654321, LNG = -80.123456;
    const pro = await crearProveedorConMapa({ nombre: 'Precision Rara Coordenada Servida', lat: LAT, lng: LNG, mapPrecision: 'exacta' });
    db.pragma('ignore_check_constraints = ON');
    db.prepare("UPDATE provider_profiles SET map_precision = 'aproximada' WHERE id = ?").run(pro.providerId);
    db.pragma('ignore_check_constraints = OFF');

    const r = await api.get(`/api/providers/${pro.providerId}`);
    expect(r.status).toBe(200);
    const LAT_REDONDA = Math.round(LAT / CELDA_ZONA) * CELDA_ZONA;
    const LNG_REDONDA = Math.round(LNG / CELDA_ZONA) * CELDA_ZONA;
    expect(r.body.provider.lat).toBeCloseTo(LAT_REDONDA, 6);
    expect(r.body.provider.lng).toBeCloseTo(LNG_REDONDA, 6);
  });
});

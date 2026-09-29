import { describe, expect, it } from 'vitest';
import { qOne } from '../src/db/acceso.js';
import { api, registrar } from './helpers.js';
import { metrosEntre, puntoPublico, RADIO_APROX_MAX_M, RADIO_APROX_MIN_M } from '../src/lib/ubicacion.js';

// Las dos puertas que publican ubicación —GET /api/mapa y GET /providers/:id— tienen que contar
// la misma historia, y desde la enmienda del 2026-09-29 esa historia es: un perfil `zona` publica
// un punto desplazado 100-300 m, sorteado UNA vez al guardar. Lo que estas pruebas protegen no es
// el desplazamiento en sí (eso es aritmética), sino las dos propiedades de las que depende que
// sirva de algo: que el punto publicado NO sea el real, y que NO cambie entre peticiones.

async function provinciaId() {
  return (await qOne<{ id: string }>('SELECT id FROM provinces LIMIT 1'))!.id;
}

async function crearProveedorConMapa(opts: { nombre: string; lat: number; lng: number; mapPrecision?: string }) {
  const pro = await registrar('provider');
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: opts.nombre, province_id: await provinciaId(), contact_mode: 'whatsapp',
    lat: opts.lat, lng: opts.lng, show_on_map: true,
    map_precision: opts.mapPrecision === 'zona' ? 'zona' : 'exacta',
  });
  expect(res.status).toBe(200);
  return pro;
}

describe('GET /api/providers/:id — coordenada servida', () => {
  it('un perfil zona publica un punto a entre 100 y 300 m del suyo, nunca el suyo', async () => {
    const LAT = 23.137856, LNG = -82.383754;
    const pro = await crearProveedorConMapa({ nombre: 'Zona Coordenada Servida', lat: LAT, lng: LNG, mapPrecision: 'zona' });

    const r = await api.get(`/api/providers/${pro.providerId}`);
    expect(r.status).toBe(200);
    expect(r.body.provider.lat).not.toBe(LAT);
    expect(r.body.provider.lng).not.toBe(LNG);

    const d = metrosEntre({ lat: LAT, lng: LNG }, { lat: r.body.provider.lat, lng: r.body.provider.lng });
    // El mínimo importa tanto como el máximo: sin él el sorteo puede devolver un punto pegado al
    // real y la protección desaparece justo en los casos desafortunados.
    expect(d).toBeGreaterThanOrEqual(RADIO_APROX_MIN_M - 1);
    expect(d).toBeLessThanOrEqual(RADIO_APROX_MAX_M + 1);
  });

  it('un perfil map_precision=exacta devuelve la suya, sin desplazar', async () => {
    const LAT = 22.412233, LNG = -79.987654;
    const pro = await crearProveedorConMapa({ nombre: 'Exacta Coordenada Servida', lat: LAT, lng: LNG, mapPrecision: 'exacta' });

    const r = await api.get(`/api/providers/${pro.providerId}`);
    expect(r.status).toBe(200);
    expect(r.body.provider.lat).toBe(LAT);
    expect(r.body.provider.lng).toBe(LNG);
  });

  // ESTA es la propiedad que hace que el desplazamiento sirva. Si el punto se sorteara en cada
  // petición, bastaría pedir el perfil muchas veces y promediar para recuperar el verdadero.
  it('el punto publicado no cambia entre peticiones: no se re-sortea al servir', async () => {
    const pro = await crearProveedorConMapa({ nombre: 'Zona Estable', lat: 23.05, lng: -82.2, mapPrecision: 'zona' });
    const lecturas = [];
    for (let i = 0; i < 12; i++) {
      const r = await api.get(`/api/providers/${pro.providerId}`);
      lecturas.push(`${r.body.provider.lat},${r.body.provider.lng}`);
    }
    expect(new Set(lecturas).size).toBe(1);
  });

  it('guardar el perfil sin mover la ubicación no mueve el punto publicado', async () => {
    const pro = await crearProveedorConMapa({ nombre: 'Zona Quieta', lat: 22.9, lng: -80.5, mapPrecision: 'zona' });
    const antes = (await api.get(`/api/providers/${pro.providerId}`)).body.provider;

    // Mismo punto, misma precisión, otro campo: el pin no puede saltar porque corrijan un teléfono.
    const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
      business_name: 'Zona Quieta', province_id: await provinciaId(), contact_mode: 'whatsapp',
      lat: 22.9, lng: -80.5, show_on_map: true, map_precision: 'zona', whatsapp: '+5352000999',
    });
    expect(res.status).toBe(200);

    const despues = (await api.get(`/api/providers/${pro.providerId}`)).body.provider;
    expect(despues.lat).toBe(antes.lat);
    expect(despues.lng).toBe(antes.lng);
  });

  it('mover la ubicación sí vuelve a sortear el punto', async () => {
    const pro = await crearProveedorConMapa({ nombre: 'Zona Mudanza', lat: 21.8, lng: -79.98, mapPrecision: 'zona' });
    const antes = (await api.get(`/api/providers/${pro.providerId}`)).body.provider;

    await api.put('/api/providers/me/profile').set(pro.auth).send({
      business_name: 'Zona Mudanza', province_id: await provinciaId(), contact_mode: 'whatsapp',
      lat: 21.81, lng: -79.99, show_on_map: true, map_precision: 'zona',
    });
    const despues = (await api.get(`/api/providers/${pro.providerId}`)).body.provider;
    expect(despues.lat).not.toBe(antes.lat);
  });

  it('ningún perfil con punto se queda sin coordenada publicada', async () => {
    // LAT_SERVIDA/LNG_SERVIDA leen punto_pub (antes map_lat_pub/map_lng_pub, migradas a una sola
    // columna geography): sin respaldo a pp.lat, un perfil al que le falte desaparece del mapa.
    // Es el fallo seguro, pero tiene que no ocurrir nunca por un camino de escritura.
    const huerfanos = await qOne<{ n: string }>(`
      SELECT COUNT(*) AS n FROM provider_profiles
      WHERE lat IS NOT NULL AND lng IS NOT NULL AND punto_pub IS NULL
    `);
    expect(Number(huerfanos!.n)).toBe(0);
  });
});

describe('lib/ubicacion — dirección segura', () => {
  it('cualquier precisión que no sea exacta desplaza; solo «exacta» publica el punto real', () => {
    const LAT = 23.1, LNG = -82.3;
    expect(puntoPublico(LAT, LNG, 'exacta')).toEqual({ lat: LAT, lng: LNG });
    for (const rara of ['zona', 'aproximada', '', 'EXACTA'] as const) {
      const p = puntoPublico(LAT, LNG, rara as 'exacta' | 'zona');
      expect(p.lat, `«${rara}» debería degradarse, no publicar el punto real`).not.toBe(LAT);
    }
  });

  it('sin punto propio no hay punto publicado', () => {
    expect(puntoPublico(null, null, 'zona')).toEqual({ lat: null, lng: null });
    expect(puntoPublico(23.1, null, 'zona')).toEqual({ lat: null, lng: null });
  });

  it('mil sorteos caen todos dentro del anillo', () => {
    let min = Infinity, max = 0;
    for (let i = 0; i < 1000; i++) {
      const p = puntoPublico(23.1, -82.3, 'zona') as { lat: number; lng: number };
      const d = metrosEntre({ lat: 23.1, lng: -82.3 }, p);
      min = Math.min(min, d); max = Math.max(max, d);
    }
    expect(min).toBeGreaterThanOrEqual(RADIO_APROX_MIN_M - 1);
    expect(max).toBeLessThanOrEqual(RADIO_APROX_MAX_M + 1);
  });

  it('dos perfiles en la misma coordenada publican puntos distintos', () => {
    // Si el desplazamiento se derivara de la coordenada (un hash) en vez de sortearse, seguiría
    // cayendo en el anillo y todos los demás tests pasarían — pero dos perfiles en la misma
    // dirección publicarían el mismo punto, y de ahí se deduce el desplazamiento de ambos.
    const puntos = new Set(
      Array.from({ length: 20 }, () => JSON.stringify(puntoPublico(23.1, -82.3, 'zona'))),
    );
    expect(puntos.size).toBeGreaterThan(15);
  });
});

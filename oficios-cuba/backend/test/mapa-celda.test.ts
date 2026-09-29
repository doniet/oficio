import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { api, crearServicio, db, registrar } from './helpers.js';

// GET /api/mapa/celda: los negocios de UNA celda. Hasta esta entrega `detras` era solo una
// insignia — si una celda tenía cinco, veías uno y los otros cuatro eran inalcanzables desde el
// mapa. Lo que hay que proteger aquí no es que devuelva filas, sino que devuelva EXACTAMENTE las
// que el «+N» prometió, y que no sea una puerta nueva al oráculo de bisección.

const CELDA_BBOX = '22.9,-82.5,23.3,-82.1';

function provinciaId() {
  return (db.prepare('SELECT id FROM provinces LIMIT 1').get() as { id: string }).id;
}

async function sembrar(nombre: string, lat: number, lng: number, precision: 'exacta' | 'zona' = 'exacta') {
  const pro = await registrar('provider');
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: nombre, province_id: provinciaId(), contact_mode: 'whatsapp',
    lat, lng, show_on_map: true, map_precision: precision,
  });
  expect(res.status).toBe(200);
  expect((await crearServicio(pro.auth)).status).toBe(201);
  return pro.providerId!;
}

let IDS: string[] = [];

beforeAll(async () => {
  // Cuatro negocios muy juntos: a esta escala caen todos en la misma celda.
  IDS = [
    await sembrar('Celda Uno', 23.10, -82.30),
    await sembrar('Celda Dos', 23.101, -82.301),
    await sembrar('Celda Tres', 23.102, -82.302),
    await sembrar('Celda Cuatro', 23.103, -82.303),
  ];
});

describe('GET /api/mapa/celda', () => {
  it('devuelve exactamente los que el «+N» del mapa prometió', async () => {
    const mapa = await request(app).get(`/api/mapa?bbox=${CELDA_BBOX}`);
    const punto = mapa.body.puntos.find((p: any) => IDS.includes(p.id));
    expect(punto, 'los sembrados deberían salir en el mapa').toBeDefined();
    expect(punto.detras).toBeGreaterThan(0);

    const celda = await request(app).get(`/api/mapa/celda?bbox=${CELDA_BBOX}&cy=${punto.cy}&cx=${punto.cx}`);
    expect(celda.status).toBe(200);
    // La promesa del mapa es «este y N más»: la lista tiene que traer N+1.
    expect(celda.body.puntos.length).toBe(punto.detras + 1);
    // Y el primero de la lista es el que se veía en el mapa: mismo orden por plan.
    expect(celda.body.puntos[0].id).toBe(punto.id);
  });

  it('honra los filtros: una pestaña sin resultados devuelve la celda vacía', async () => {
    const mapa = await request(app).get(`/api/mapa?bbox=${CELDA_BBOX}`);
    const punto = mapa.body.puntos.find((p: any) => IDS.includes(p.id));
    // Los sembrados son oficios sin catálogo: en Productos no debe salir ninguno.
    const celda = await request(app).get(`/api/mapa/celda?bbox=${CELDA_BBOX}&tab=productos&cy=${punto.cy}&cx=${punto.cx}`);
    expect(celda.status).toBe(200);
    expect(celda.body.puntos.map((p: any) => p.id).filter((id: string) => IDS.includes(id))).toEqual([]);
  });

  it('un perfil zona no se puede acorralar por bisección tampoco por esta puerta', async () => {
    const LAT = 22.95, LNG = -80.12;
    const id = await sembrar('Celda Zona', LAT, LNG, 'zona');

    // Un rectángulo minúsculo sobre la coordenada EXACTA. Como el desplazamiento es de 100 m como
    // mínimo y el margen del servidor solo infla un 50 %, el punto publicado queda fuera: si esta
    // puerta filtrara por pp.lat, aquí aparecería y se podría acorralar la casa real.
    const bbox = `${LAT - 0.0005},${LNG - 0.0005},${LAT + 0.0005},${LNG + 0.0005}`;
    for (const [cy, cx] of [[0, 0], [1, 1], [-1, -1], [2294, -8012]]) {
      const r = await request(app).get(`/api/mapa/celda?bbox=${bbox}&cy=${cy}&cx=${cx}`);
      expect(r.status).toBe(200);
      expect(r.body.puntos.map((p: any) => p.id)).not.toContain(id);
    }
  });

  it('rechaza una celda que no son enteros y una pestaña inventada', async () => {
    expect((await request(app).get(`/api/mapa/celda?bbox=${CELDA_BBOX}&cy=x&cx=1`)).status).toBe(400);
    expect((await request(app).get(`/api/mapa/celda?bbox=${CELDA_BBOX}&cy=1.5&cx=1`)).status).toBe(400);
    expect((await request(app).get(`/api/mapa/celda?bbox=${CELDA_BBOX}&cy=1&cx=1&tab=inventada`)).status).toBe(400);
    expect((await request(app).get('/api/mapa/celda?bbox=99,-99,100,-98&cy=1&cx=1')).status).toBe(400);
  });

  it('marca cuáles son aproximados, para que el cliente no los dibuje como exactos', async () => {
    const LAT = 21.5, LNG = -78.5;
    await sembrar('Celda Marca Exacta', LAT, LNG, 'exacta');
    await sembrar('Celda Marca Zona', LAT + 0.001, LNG + 0.001, 'zona');
    const bbox = `${LAT - 0.05},${LNG - 0.05},${LAT + 0.05},${LNG + 0.05}`;
    const mapa = await request(app).get(`/api/mapa?bbox=${bbox}`);
    const punto = mapa.body.puntos.find((p: any) => p.nombre.startsWith('Celda Marca'));
    expect(punto).toBeDefined();
    const celda = await request(app).get(`/api/mapa/celda?bbox=${bbox}&cy=${punto.cy}&cx=${punto.cx}`);
    const marcas = celda.body.puntos.filter((p: any) => p.nombre.startsWith('Celda Marca')).map((p: any) => p.aproximado);
    expect(marcas.length).toBeGreaterThan(0);
    expect(marcas.every((m: unknown) => typeof m === 'boolean')).toBe(true);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { api, categoriaId, crearServicio, db, ponerPlan, registrar } from './helpers.js';
import { conMargen, leerBbox, tamanoCelda } from '../src/lib/mapa.js';

describe('leerBbox', () => {
  it('lee cuatro números en orden sur,oeste,norte,este', () => {
    expect(leerBbox('23,-82.5,23.2,-82.3')).toEqual({ sur: 23, oeste: -82.5, norte: 23.2, este: -82.3 });
  });
  it('rechaza un bbox invertido: sur por encima de norte', () => {
    expect(() => leerBbox('23.2,-82.5,23,-82.3')).toThrow(/no válida/i);
  });
  it('rechaza un bbox de área cero', () => {
    expect(() => leerBbox('23,-82.5,23,-82.5')).toThrow(/no válida/i);
  });
  it('rechaza coordenadas fuera de Cuba', () => {
    expect(() => leerBbox('25,-82.5,26,-82.3')).toThrow(/no válida/i);
    expect(() => leerBbox('23,-90,23.2,-89')).toThrow(/no válida/i);
  });
  it('rechaza lo que no son cuatro números', () => {
    expect(() => leerBbox('23,-82.5,23.2')).toThrow(/no válida/i);
    expect(() => leerBbox('a,b,c,d')).toThrow(/no válida/i);
    expect(() => leerBbox(undefined)).toThrow(/no válida/i);
  });
});

describe('tamanoCelda', () => {
  it('es el lado corto partido por cinco', () => {
    expect(tamanoCelda({ sur: 23, oeste: -83, norte: 24, este: -82 })).toBeCloseTo(0.2);
  });
  it('usa el lado corto cuando la ventana es más ancha que alta', () => {
    expect(tamanoCelda({ sur: 23, oeste: -85, norte: 23.5, este: -80 })).toBeCloseTo(0.1);
  });
  it('acota entre 0,0005 y 4 grados', () => {
    expect(tamanoCelda({ sur: 23, oeste: -82.5, norte: 23.0001, este: -82.4999 })).toBe(0.0005);
    expect(tamanoCelda({ sur: 19, oeste: -85.5, norte: 24, este: -73.5 })).toBeLessThanOrEqual(4);
  });
});

describe('conMargen', () => {
  it('infla el rectángulo un 50 % por lado', () => {
    // norte: 23 en vez de 24 — con 24 (el borde norte de Cuba) el propio recorte de conMargen
    // (ver el próximo test) se comería la inflación y esta prueba dejaría de medir lo que dice medir.
    expect(conMargen({ sur: 22, oeste: -83, norte: 23, este: -82 }))
      .toEqual({ sur: 21.5, oeste: -83.5, norte: 23.5, este: -81.5 });
  });
  it('no se sale de Cuba al inflar', () => {
    const b = conMargen({ sur: 19.1, oeste: -85.4, norte: 19.3, este: -85.2 });
    expect(b.sur).toBeGreaterThanOrEqual(19);
    expect(b.oeste).toBeGreaterThanOrEqual(-85.5);
  });
});

// ─── GET /api/mapa ─────────────────────────────────────────────────────────────────────────────
// El sembrado se hace UNA sola vez (beforeAll), con coordenadas y planes fijos: los totales que
// comprueban las pruebas (TOTAL_VISIBLES, la celda compartida) dependen de que nadie más toque
// esta base entre pruebas.

function provinciaId() {
  return (db.prepare('SELECT id FROM provinces LIMIT 1').get() as { id: string }).id;
}

const CUBA_ENTERA = '19,-85.5,24,-73.5';
const UNA_CIUDAD = '23,-82.5,23.2,-82.3';
const NOMBRE_DEL_OCULTO = 'Perfil Oculto De Prueba Mapa';

// Dos negocios (pro y premium) en la MISMA celda de la vista de Cuba entera (celda = 1°).
const LAT_A = 20.1, LNG_A = -77.1;
const LAT_B = 20.2, LNG_B = -77.2;
// Un negocio que bajó a Gratis: sigue en el mapa general, pero no en la pestaña Negocios.
const LAT_SIN_PLAN = 22.5, LNG_SIN_PLAN = -79.5;
// Precisión de zona: se sirve redondeado, sin dejar de filtrarse por la coordenada exacta.
const LAT_EXACTA = 23.137856, LNG_EXACTA = -82.383754;
const BBOX_DEL_PERFIL_ZONA = `${LAT_EXACTA - 0.05},${LNG_EXACTA - 0.05},${LAT_EXACTA + 0.05},${LNG_EXACTA + 0.05}`;
// Un valor de `map_precision` que no es ni 'exacta' ni 'zona' (se cuela por fuera del CHECK,
// como podría hacerlo un dato viejo o una migración futura mal escrita).
const LAT_TERCERO = 21.654321, LNG_TERCERO = -80.123456;
const BBOX_TERCER_VALOR = `${LAT_TERCERO - 0.05},${LNG_TERCERO - 0.05},${LAT_TERCERO + 0.05},${LNG_TERCERO + 0.05}`;
// Nunca debe salir, tenga o no coordenadas válidas.
const LAT_OCULTO = 19.5, LNG_OCULTO = -84.5;

let ID_NEGOCIO_SIN_PLAN: string;
let ID_PERFIL_ZONA: string;
let ID_PERFIL_TERCERO: string;
// Los cinco perfiles con show_on_map = 1 y un oficio activo: la suma de "1 + detras" de la
// pestaña por defecto (servicios) sobre toda Cuba tiene que dar este número.
const TOTAL_VISIBLES = 5;

async function crearProveedorConMapa(opts: {
  nombre: string; lat: number; lng: number; showOnMap: boolean; kind?: 'oficio' | 'negocio'; conServicio?: boolean;
}) {
  const pro = await registrar('provider');
  if (opts.kind === 'negocio') ponerPlan(pro.providerId!, 'pro'); // el plan Profesional es requisito para guardar kind='negocio'
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: opts.nombre, province_id: provinciaId(), contact_mode: 'whatsapp',
    kind: opts.kind ?? 'oficio', lat: opts.lat, lng: opts.lng, show_on_map: opts.showOnMap,
  });
  expect(res.status).toBe(200);
  if (opts.conServicio !== false) {
    const s = await crearServicio(pro.auth);
    expect(s.status).toBe(201);
  }
  return pro;
}

beforeAll(async () => {
  const a = await crearProveedorConMapa({ nombre: 'Negocio Prueba Pro', lat: LAT_A, lng: LNG_A, showOnMap: true, kind: 'negocio' });

  const b = await crearProveedorConMapa({ nombre: 'Negocio Prueba Premium', lat: LAT_B, lng: LNG_B, showOnMap: true, kind: 'negocio' });
  // 'premium' ya no se vende, pero el CHECK lo sigue permitiendo (bases viejas): ponerPlan() no
  // lo tipa porque no es una opción nueva, así que se escribe directo.
  db.prepare("UPDATE provider_profiles SET subscription_plan = 'premium' WHERE id = ?").run(b.providerId);

  const sinPlan = await crearProveedorConMapa({ nombre: 'Negocio Bajado De Plan', lat: LAT_SIN_PLAN, lng: LNG_SIN_PLAN, showOnMap: true, kind: 'negocio' });
  ponerPlan(sinPlan.providerId!, 'free'); // se registró Profesional para poder marcar kind='negocio', y luego bajó
  ID_NEGOCIO_SIN_PLAN = sinPlan.providerId!;

  const zona = await crearProveedorConMapa({ nombre: 'Perfil Precision Zona', lat: LAT_EXACTA, lng: LNG_EXACTA, showOnMap: true });
  db.prepare("UPDATE provider_profiles SET map_precision = 'zona' WHERE id = ?").run(zona.providerId);
  ID_PERFIL_ZONA = zona.providerId!;

  const tercero = await crearProveedorConMapa({ nombre: 'Perfil Precision Rara', lat: LAT_TERCERO, lng: LNG_TERCERO, showOnMap: true });
  // Bypass deliberado del CHECK: el punto es probar que servir el mapa es seguro incluso cuando
  // el dato no lo es (una fila que no debería existir, pero un día podría).
  db.pragma('ignore_check_constraints = ON');
  db.prepare("UPDATE provider_profiles SET map_precision = 'aproximada' WHERE id = ?").run(tercero.providerId);
  db.pragma('ignore_check_constraints = OFF');
  ID_PERFIL_TERCERO = tercero.providerId!;

  await crearProveedorConMapa({ nombre: NOMBRE_DEL_OCULTO, lat: LAT_OCULTO, lng: LNG_OCULTO, showOnMap: false, conServicio: false });
});

describe('GET /api/mapa', () => {
  it('rechaza un bbox inválido con 400', async () => {
    const r = await request(app).get('/api/mapa?bbox=25,-82,26,-81');
    expect(r.status).toBe(400);
  });

  it('rechaza una pestaña inventada con 400, no cae en servicios en silencio', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=inventada`);
    expect(r.status).toBe(400);
  });

  it('devuelve un solo punto por celda y es el de mejor plan', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=negocios`);
    expect(r.status).toBe(200);
    const celdas = r.body.puntos.map((p: any) => `${Math.trunc(p.lat / r.body.celda)}:${Math.trunc(p.lng / r.body.celda)}`);
    expect(new Set(celdas).size).toBe(celdas.length);
    expect(r.body.puntos[0].plan).toBe('pro');
  });

  it('detras cuenta los que quedaron en la celda', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    const suma = r.body.puntos.reduce((n: number, p: any) => n + 1 + p.detras, 0);
    expect(suma).toBe(TOTAL_VISIBLES);
  });

  it('al encoger la celda aparecen más puntos', async () => {
    const lejos = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    const cerca = await request(app).get(`/api/mapa?bbox=${UNA_CIUDAD}`);
    expect(cerca.body.celda).toBeLessThan(lejos.body.celda);
  });

  it('un perfil con show_on_map = 0 no sale nunca, ni buscándolo por nombre', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&q=${NOMBRE_DEL_OCULTO}`);
    expect(r.body.puntos).toHaveLength(0);
  });

  it('map_precision = zona redondea al servir y no filtra por la redondeada', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${BBOX_DEL_PERFIL_ZONA}`);
    const p = r.body.puntos.find((x: any) => x.id === ID_PERFIL_ZONA);
    expect(p).toBeDefined();
    // Redondeado a celda de ~1 km (0,01°): los decimales finos desaparecen.
    expect(p.lat).toBeCloseTo(Math.round(LAT_EXACTA / 0.01) * 0.01, 6);
    expect(p.lat).not.toBe(LAT_EXACTA);
  });

  // Más allá de lo que pide el brief: un valor de map_precision que no es 'exacta' ni 'zona'
  // (aquí sembrado saltándose el CHECK) también debe salir redondeado, nunca con la casa exacta.
  it('un map_precision que no es exacta ni zona también sale redondeado', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${BBOX_TERCER_VALOR}`);
    const p = r.body.puntos.find((x: any) => x.id === ID_PERFIL_TERCERO);
    expect(p).toBeDefined();
    expect(p.lat).toBeCloseTo(Math.round(LAT_TERCERO / 0.01) * 0.01, 6);
    expect(p.lat).not.toBe(LAT_TERCERO);
  });

  it('un perfil que bajó de plan no sale en tab=negocios', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=negocios`);
    expect(r.body.puntos.map((p: any) => p.id)).not.toContain(ID_NEGOCIO_SIN_PLAN);
  });

  it('el recorte es determinista: dos peticiones iguales dan los mismos puntos', async () => {
    const a = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    const b = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    expect(a.body.puntos.map((p: any) => p.id)).toEqual(b.body.puntos.map((p: any) => p.id));
  });

  it('la celda se deriva del rectángulo visible, no del inflado', async () => {
    const r = await request(app).get(`/api/mapa?bbox=23,-83,24,-82`);
    expect(r.body.celda).toBeCloseTo(0.2); // 1° / 5, no 2° / 5
  });
});

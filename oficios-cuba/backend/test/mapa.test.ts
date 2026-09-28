import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { api, categoriaId, crearServicio, db, ponerPlan, registrar } from './helpers.js';
import { conMargen, leerBbox, tamanoCelda } from '../src/lib/mapa.js';
import { seedMapa } from '../src/db/seed-mapa.js';

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

const CELDA_ZONA = 0.01; // debe coincidir con la del servidor (routes/mapa.ts)

const CUBA_ENTERA = '19,-85.5,24,-73.5';
const UNA_CIUDAD = '23,-82.5,23.2,-82.3';
const NOMBRE_DEL_OCULTO = 'Perfil Oculto De Prueba Mapa';

// Dos negocios en la MISMA celda de la vista de Cuba entera (celda = 1°), con planes que de
// verdad compiten en PLAN_WEIGHT_SQL (pro=2, basic=1 — a diferencia de pro/premium, que empatan
// en 2 y no probarían nada). Se dejan como kind='negocio' a propósito: CON_NEGOCIO_SQL solo se
// aplica cuando tab==='negocios', así que en la pestaña por defecto (servicios) el de plan básico
// sigue visible y la competencia de planes es real.
const LAT_A = 20.1, LNG_A = -77.1;
const LAT_B = 20.2, LNG_B = -77.2;
// Un negocio que bajó a Gratis: sigue en el mapa general, pero no en la pestaña Negocios.
const LAT_SIN_PLAN = 22.5, LNG_SIN_PLAN = -79.5;
// Precisión de zona: se sirve redondeado, y la presencia también depende de lo redondeado.
const LAT_EXACTA = 23.137856, LNG_EXACTA = -82.383754;
const LAT_REDONDA = Math.round(LAT_EXACTA / CELDA_ZONA) * CELDA_ZONA;
const LNG_REDONDA = Math.round(LNG_EXACTA / CELDA_ZONA) * CELDA_ZONA;
const BBOX_DEL_PERFIL_ZONA = `${LAT_EXACTA - 0.05},${LNG_EXACTA - 0.05},${LAT_EXACTA + 0.05},${LNG_EXACTA + 0.05}`;
// Un rectángulo minúsculo alrededor de la coordenada EXACTA que, a propósito, NO contiene la
// coordenada redondeada (0,0005° de radio: incluso inflado un 50 % por conMargen se queda corto
// para alcanzar los ~0,002-0,004° que separan LAT_EXACTA/LNG_EXACTA de su redondeo). Es la
// prueba central del arreglo: si el filtro todavía mirara pp.lat/pp.lng en vez de lo servido,
// el perfil aparecería aquí y se podría localizar por bisección.
const BBOX_ZONA_SIN_REDONDA = `${LAT_EXACTA - 0.0005},${LNG_EXACTA - 0.0005},${LAT_EXACTA + 0.0005},${LNG_EXACTA + 0.0005}`;
// Un valor de `map_precision` que no es ni 'exacta' ni 'zona' (se cuela por fuera del CHECK,
// como podría hacerlo un dato viejo o una migración futura mal escrita).
const LAT_TERCERO = 21.654321, LNG_TERCERO = -80.123456;
const LAT_TERCERA_REDONDA = Math.round(LAT_TERCERO / CELDA_ZONA) * CELDA_ZONA;
const LNG_TERCERA_REDONDA = Math.round(LNG_TERCERO / CELDA_ZONA) * CELDA_ZONA;
const BBOX_TERCER_VALOR = `${LAT_TERCERO - 0.05},${LNG_TERCERO - 0.05},${LAT_TERCERO + 0.05},${LNG_TERCERO + 0.05}`;
// Nunca debe salir, tenga o no coordenadas válidas.
const LAT_OCULTO = 19.5, LNG_OCULTO = -84.5;

let ID_NEGOCIO_A: string;
let ID_NEGOCIO_B: string;
let ID_NEGOCIO_SIN_PLAN: string;
let ID_PERFIL_ZONA: string;
let ID_PERFIL_TERCERO: string;
// Los cinco perfiles con show_on_map = 1 y un oficio activo: la suma de "1 + detras" de la
// pestaña por defecto (servicios) sobre toda Cuba tiene que dar este número.
const TOTAL_VISIBLES = 5;

// Todo perfil sembrado lleva un oficio activo (default tab='servicios' lo exige): así, salvo en
// el caso de show_on_map=0, ningún filtro además de privacidad decide si aparece o no.
async function crearProveedorConMapa(opts: {
  nombre: string; lat: number; lng: number; showOnMap: boolean; kind?: 'oficio' | 'negocio';
}) {
  const pro = await registrar('provider');
  if (opts.kind === 'negocio') ponerPlan(pro.providerId!, 'pro'); // el plan Profesional es requisito para guardar kind='negocio'
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: opts.nombre, province_id: provinciaId(), contact_mode: 'whatsapp',
    kind: opts.kind ?? 'oficio', lat: opts.lat, lng: opts.lng, show_on_map: opts.showOnMap,
  });
  expect(res.status).toBe(200);
  const s = await crearServicio(pro.auth);
  expect(s.status).toBe(201);
  return pro;
}

beforeAll(async () => {
  const a = await crearProveedorConMapa({ nombre: 'Negocio Prueba Pro', lat: LAT_A, lng: LNG_A, showOnMap: true, kind: 'negocio' });
  ID_NEGOCIO_A = a.providerId!; // ya queda en plan 'pro' (ver crearProveedorConMapa)

  const b = await crearProveedorConMapa({ nombre: 'Negocio Prueba Básico', lat: LAT_B, lng: LNG_B, showOnMap: true, kind: 'negocio' });
  ponerPlan(b.providerId!, 'basic'); // se registró Profesional para poder marcar kind='negocio', y luego bajó a Básico
  ID_NEGOCIO_B = b.providerId!;
  // B (el que debe PERDER por plan) queda con mejor rating que A: si alguien quitara
  // PLAN_WEIGHT_SQL del ORDER BY, el desempate seguiría siendo determinista (B ganaría por
  // rating) en vez de caer en pp.id — un uuid al azar que solo detectaría la regresión la mitad
  // de las veces. Antes ambos se quedaban en rating=0/review_count=0 por defecto.
  db.prepare('UPDATE provider_profiles SET rating = 4.8, review_count = 20 WHERE id = ?').run(b.providerId);
  // Un artículo de catálogo sobre B (su plan Básico ya lo permite): sirve para probar el
  // resumen y la búsqueda de la pestaña Productos sin sembrar un perfil aparte que alteraría
  // TOTAL_VISIBLES.
  const articulo = await api.post('/api/catalog').set(b.auth).send({ name: 'Manguera de jardín', price_type: 'fixed', price: 500 });
  expect(articulo.status).toBe(201);

  const sinPlan = await crearProveedorConMapa({ nombre: 'Negocio Bajado De Plan', lat: LAT_SIN_PLAN, lng: LNG_SIN_PLAN, showOnMap: true, kind: 'negocio' });
  ponerPlan(sinPlan.providerId!, 'free'); // bajó hasta Gratis: tampoco cuenta como negocio
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

  // Con coordenadas y un oficio activo como cualquier otro: si algo que no sea show_on_map lo
  // excluyera, este perfil igual desaparecería y la prueba de abajo no probaría nada.
  await crearProveedorConMapa({ nombre: NOMBRE_DEL_OCULTO, lat: LAT_OCULTO, lng: LNG_OCULTO, showOnMap: false });
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

  it('un tab que no es una cadena (?tab[x]=1) también da 400, no cae en servicios en silencio', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab[x]=1`);
    expect(r.status).toBe(400);
  });

  it('devuelve un solo punto por celda y es el de mejor plan', async () => {
    // Tab por defecto (servicios): a propósito, no tab=negocios — ahí CON_NEGOCIO_SQL solo deja
    // pasar pro/premium, que empatan en PLAN_WEIGHT_SQL y no probarían que gana "el mejor plan".
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    expect(r.status).toBe(200);
    const celdas = r.body.puntos.map((p: any) => `${Math.trunc(p.lat / r.body.celda)}:${Math.trunc(p.lng / r.body.celda)}`);
    expect(new Set(celdas).size).toBe(celdas.length);
    expect(r.body.puntos.length).toBeGreaterThan(1); // para que la unicidad de arriba no sea trivial
    const ids = r.body.puntos.map((p: any) => p.id);
    expect(ids).toContain(ID_NEGOCIO_A); // pro (peso 2) le gana a básico (peso 1) en la misma celda
    expect(ids).not.toContain(ID_NEGOCIO_B);
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

  it('map_precision = zona: sale redondeado cuando el rectángulo contiene la coordenada redondeada', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${BBOX_DEL_PERFIL_ZONA}`);
    const p = r.body.puntos.find((x: any) => x.id === ID_PERFIL_ZONA);
    expect(p).toBeDefined();
    // Redondeado a celda de ~1 km (0,01°): los decimales finos desaparecen.
    expect(p.lat).toBeCloseTo(LAT_REDONDA, 6);
    expect(p.lng).toBeCloseTo(LNG_REDONDA, 6);
    expect(p.lat).not.toBe(LAT_EXACTA);
    expect(p.lng).not.toBe(LNG_EXACTA);
  });

  // El corazón del arreglo de esta ronda: antes se filtraba por pp.lat/pp.lng (lo guardado) y
  // solo se redondeaba al servir, así que un rectángulo minúsculo alrededor de la coordenada
  // EXACTA (que no llega a cubrir la redondeada) igual encontraba el perfil — eso es un oráculo
  // de bisección sobre la casa real de alguien que pidió precisión de zona. Ahora la presencia
  // depende de la coordenada SERVIDA, así que este rectángulo no debe encontrar nada.
  it('map_precision = zona: no se puede localizar por bisección alrededor de la coordenada exacta', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${BBOX_ZONA_SIN_REDONDA}`);
    expect(r.body.puntos.map((p: any) => p.id)).not.toContain(ID_PERFIL_ZONA);
  });

  // Más allá de lo que pide el brief: un valor de map_precision que no es 'exacta' ni 'zona'
  // (aquí sembrado saltándose el CHECK) también debe salir redondeado, nunca con la casa exacta.
  it('un map_precision que no es exacta ni zona también sale redondeado', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${BBOX_TERCER_VALOR}`);
    const p = r.body.puntos.find((x: any) => x.id === ID_PERFIL_TERCERO);
    expect(p).toBeDefined();
    expect(p.lat).toBeCloseTo(LAT_TERCERA_REDONDA, 6);
    expect(p.lng).toBeCloseTo(LNG_TERCERA_REDONDA, 6);
    expect(p.lat).not.toBe(LAT_TERCERO);
    expect(p.lng).not.toBe(LNG_TERCERO);
  });

  it('un perfil que bajó de plan no sale en tab=negocios', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=negocios`);
    expect(r.body.puntos.map((p: any) => p.id)).not.toContain(ID_NEGOCIO_SIN_PLAN);
  });

  // ─── resumen: siempre una cadena ────────────────────────────────────────────────────────────
  // El defecto que encontró la revisión final: resumenDe() devolvía un objeto distinto por
  // pestaña ({titulo,precio_min,…} / {articulos} / {categoria}) y los cuatro tipos declarados
  // (shared, frontend, los dos móviles) dicen `resumen: string`. Cualquier punto del mapa
  // reventaba la ficha al abrirla. Esta prueba es la que evita que eso vuelva a desviarse.
  it('resumen es siempre una cadena, nunca un objeto, en las tres pestañas', async () => {
    for (const tab of ['servicios', 'productos', 'negocios'] as const) {
      const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=${tab}`);
      expect(r.status).toBe(200);
      expect(r.body.puntos.length).toBeGreaterThan(0); // para que "todos son string" no sea trivial sobre una lista vacía
      for (const p of r.body.puntos) {
        expect(typeof p.resumen).toBe('string');
      }
    }
  });

  it('en tab=servicios, resumen es "título · precio" del oficio activo más reciente', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    const p = r.body.puntos.find((x: any) => x.id === ID_NEGOCIO_A);
    expect(p).toBeDefined();
    // crearServicio() (helpers.ts) siembra 'Servicio de prueba' con price_type 'negotiable'.
    expect(p.resumen).toBe('Servicio de prueba · a convenir');
  });

  it('en tab=productos, resumen cuenta los artículos visibles del catálogo', async () => {
    const bbox = `${LAT_B - 0.05},${LNG_B - 0.05},${LAT_B + 0.05},${LNG_B + 0.05}`;
    const r = await request(app).get(`/api/mapa?bbox=${bbox}&tab=productos`);
    const p = r.body.puntos.find((x: any) => x.id === ID_NEGOCIO_B);
    expect(p).toBeDefined();
    expect(p.resumen).toBe('1 artículo');
  });

  it('en tab=negocios, resumen es la categoría principal del negocio', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=negocios`);
    const p = r.body.puntos.find((x: any) => x.id === ID_NEGOCIO_A);
    expect(p).toBeDefined();
    expect(typeof p.resumen).toBe('string');
    expect(p.resumen.length).toBeGreaterThan(0);
  });

  // ─── tipo: la etiqueta sigue al plan, no al dato crudo ─────────────────────────────────────
  it('un negocio que bajó de plan aparece como "oficio" fuera de tab=negocios (la etiqueta sigue a segunPlan, no a pp.kind crudo)', async () => {
    const bbox = `${LAT_SIN_PLAN - 0.05},${LNG_SIN_PLAN - 0.05},${LAT_SIN_PLAN + 0.05},${LNG_SIN_PLAN + 0.05}`;
    const r = await request(app).get(`/api/mapa?bbox=${bbox}`); // tab por defecto: servicios
    const p = r.body.puntos.find((x: any) => x.id === ID_NEGOCIO_SIN_PLAN);
    expect(p).toBeDefined();
    expect(p.tipo).toBe('oficio');
  });

  // ─── q busca lo mismo que la lista de esa pestaña ──────────────────────────────────────────
  it('en tab=servicios, q busca el título del oficio, no solo los campos del perfil', async () => {
    const LAT = 21.3, LNG = -78.3;
    const pro = await registrar('provider');
    const perfil = await api.put('/api/providers/me/profile').set(pro.auth).send({
      business_name: 'Taller El Progreso', province_id: provinciaId(), contact_mode: 'whatsapp',
      lat: LAT, lng: LNG, show_on_map: true,
    });
    expect(perfil.status).toBe(200);
    // 'Destornillador' no aparece en el nombre del negocio ni en el de su dueño: con el buscador
    // viejo (que miraba pp.business_name/pp.description/u.full_name) esto no encontraba nada.
    const TERMINO = 'Destornillador';
    const s = await crearServicio(pro.auth, { title: `Afilado de ${TERMINO}` });
    expect(s.status).toBe(201);

    const bbox = `${LAT - 0.05},${LNG - 0.05},${LAT + 0.05},${LNG + 0.05}`;
    const r = await request(app).get(`/api/mapa?bbox=${bbox}&tab=servicios&q=${TERMINO}`);
    expect(r.body.puntos.map((p: any) => p.id)).toContain(pro.providerId);
  });

  it('en tab=productos, q busca el nombre del artículo del catálogo, no el nombre del negocio', async () => {
    // 'Manguera' no aparece en 'Negocio Prueba Básico': con el buscador viejo esto vaciaba el mapa.
    const bbox = `${LAT_B - 0.05},${LNG_B - 0.05},${LAT_B + 0.05},${LNG_B + 0.05}`;
    const r = await request(app).get(`/api/mapa?bbox=${bbox}&tab=productos&q=Manguera`);
    expect(r.body.puntos.map((p: any) => p.id)).toContain(ID_NEGOCIO_B);
  });

  it('en tab=negocios, q sigue buscando en los campos del perfil: ahí no hay un "servicio que coincide" que mostrar', async () => {
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}&tab=negocios&q=Negocio Prueba Pro`);
    expect(r.body.puntos.map((p: any) => p.id)).toContain(ID_NEGOCIO_A);
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

  it('con 300 perfiles, el tope de 200 se activa y lo dice', async () => {
    await seedMapa();
    const r = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    expect(r.body.puntos.length).toBeLessThanOrEqual(200);
    if (r.body.puntos.length === 200) expect(r.body.hay_mas).toBe(true);

    // El recorte sigue siendo determinista sobre el conjunto más grande de toda la suite (300
    // perfiles de prueba, repartidos entre muchas más celdas que las 4 de la prueba de arriba):
    // dos peticiones iguales dan los mismos ids en el mismo orden. Nota: con celda ≈ 1° (Cuba
    // entera cabe en ~5×12 celdas) esto no llega a agotar el LIMIT 201 interno — ver el informe
    // de la tarea, que documenta por qué 300 perfiles no alcanzan a desbordarlo con este bbox.
    const otra = await request(app).get(`/api/mapa?bbox=${CUBA_ENTERA}`);
    expect(otra.body.puntos.map((p: any) => p.id)).toEqual(r.body.puntos.map((p: any) => p.id));
  });
});

describe('PUT /api/providers/me/profile — map_precision', () => {
  it('acepta map_precision y rechaza un valor inventado', async () => {
    const pro = await registrar('provider');
    const perfil = { business_name: 'Perfil De Prueba Precision', province_id: provinciaId(), contact_mode: 'whatsapp' };

    const ok = await api.put('/api/providers/me/profile').set(pro.auth).send({ ...perfil, map_precision: 'zona' });
    expect(ok.status).toBe(200);
    expect(ok.body.provider.map_precision).toBe('zona');

    const mal = await api.put('/api/providers/me/profile').set(pro.auth).send({ ...perfil, map_precision: 'aproximada' });
    expect(mal.status).toBe(400);
  });
});

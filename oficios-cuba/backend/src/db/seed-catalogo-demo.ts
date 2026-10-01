import { v4 as uuidv4 } from 'uuid';
import { q, qOne, tx } from './acceso.js';

type ItemCatalogo = [
  nombre: string, descripcion: string, precio: number | null, tipo: 'fixed' | 'from' | 'ask',
  moneda: 'CUP' | 'USD', imagen: string | null, seccion: string, disponible: boolean,
];

const img = (name: string) => `/demo/${name}.webp`;

// Seis proveedores demo que ya existen (sembrados por seedDemo()) pero se quedaron sin catálogo:
// tenían plan con cupo (básico o pro — maxCatalog 50/1000) pero el bloque de catálogo de
// seedDemo() solo tocaba a ElectroHogar y Dulces La Abuela. ElectroHogar y Dulces NO están aquí
// a propósito: seedCatalogoDemo() se salta a cualquier proveedor que ya tenga artículos (ver más
// abajo), así que repetirlos aquí no haría nada.
const CATALOGOS: Record<string, ItemCatalogo[]> = {
  'carpinteria@demo.com': [
    ['Juego de sala en caoba', 'Sofá de 3 plazas y dos butacas, tapizado a elegir.', 450, 'from', 'USD', img('carpinteria-1'), 'Muebles', true],
    ['Puerta de cedro (estándar)', 'Puerta interior lisa, 0,80 × 2,00 m, lista para pintar.', 90, 'fixed', 'USD', null, 'Puertas y ventanas', true],
    ['Clavos y tornillos (surtido)', 'Caja surtida para trabajos de carpintería.', 350, 'fixed', 'CUP', null, 'Ferretería', true],
    ['Barniz poliuretano (galón)', 'Acabado brillante, para interior y exterior.', 1800, 'fixed', 'CUP', null, 'Ferretería', true],
    ['Restauración de sillón', 'Desarme, tratamiento contra comején, barniz y tapicería.', null, 'ask', 'USD', img('carpinteria-2'), 'Servicios', true],
    ['Cama king en madera maciza', 'Cabecera tallada a mano. Encárgala con 15 días.', 380, 'from', 'USD', null, 'Muebles', false],
  ],
  'clima@demo.com': [
    ['Split 12000 BTU (nuevo)', 'Instalación incluida en La Habana.', 320, 'from', 'USD', null, 'Equipos', true],
    ['Filtro de aire universal', 'Compatible con la mayoría de los splits domésticos.', 450, 'fixed', 'CUP', null, 'Piezas', true],
    ['Gas refrigerante R410A (libra)', 'Recarga certificada, se cobra por libra usada.', 8, 'fixed', 'USD', null, 'Piezas', true],
    ['Mantenimiento preventivo', 'Limpieza de filtros, serpentín y revisión de gas.', 2500, 'fixed', 'CUP', null, 'Servicios', true],
    ['Ventilador industrial', 'Para locales y talleres, 3 velocidades.', 85, 'from', 'USD', null, 'Equipos', false],
  ],
  'belleza@demo.com': [
    ['Kit de maquillaje profesional', 'Base, corrector, sombras y brochas.', 45, 'fixed', 'USD', img('maquillaje-1'), 'Maquillaje', true],
    ['Esmalte semipermanente', 'Varios colores disponibles, pregunta por el catálogo.', 400, 'fixed', 'CUP', null, 'Uñas', true],
    ['Extensiones de pestañas', 'Técnica pelo a pelo, duran hasta 3 semanas.', 1500, 'from', 'CUP', null, 'Servicios', true],
    ['Plancha de cabello', 'Placas de cerámica, uso profesional.', 35, 'fixed', 'USD', img('salon-1'), 'Equipos', false],
    ['Tinte capilar (caja)', 'Varios tonos, incluye revelador.', 600, 'fixed', 'CUP', null, 'Cabello', true],
  ],
  'mecanica@demo.com': [
    ['Batería 12V 60Ah', 'Para autos medianos, con garantía de 6 meses.', 95, 'fixed', 'USD', img('mecanica-1'), 'Piezas', true],
    ['Pastillas de freno (juego)', 'Delanteras, para los modelos más comunes en Cuba.', 2200, 'fixed', 'CUP', null, 'Piezas', true],
    ['Aceite de motor (galón)', 'Sintético 20W-50, para gasolina y diésel.', 28, 'fixed', 'USD', img('mecanica-2'), 'Lubricantes', true],
    ['Cambio de aceite y filtro', 'Incluye revisión de niveles.', 1500, 'from', 'CUP', null, 'Servicios', true],
    ['Llanta 175/70 R13', 'Nueva, de fábrica.', 65, 'fixed', 'USD', img('mecanica-3'), 'Piezas', true],
    ['Diagnóstico computarizado', 'Escaneo de fallas con equipo propio.', 1000, 'fixed', 'CUP', null, 'Servicios', false],
  ],
  'pinturas@demo.com': [
    ['Pintura de aceite (galón)', 'Para madera y metal, varios colores.', 2800, 'fixed', 'CUP', img('pintura-1'), 'Pinturas', true],
    ['Pintura de agua para exterior', 'Resistente a la humedad, color a elegir.', 3200, 'fixed', 'CUP', null, 'Pinturas', true],
    ['Brocha y rodillo (kit)', 'Set completo para un cuarto mediano.', 500, 'fixed', 'CUP', null, 'Herramientas', true],
    ['Masilla para pared (saco)', 'Para resanar grietas antes de pintar.', 700, 'fixed', 'CUP', null, 'Materiales', true],
    ['Pintura de fachada completa', 'Casa de una planta, incluye andamio.', null, 'ask', 'USD', null, 'Servicios', true],
  ],
  'mudanzas@demo.com': [
    ['Cajas de cartón (paquete de 10)', 'Resistentes, tamaño mediano.', 600, 'fixed', 'CUP', img('mudanzas-1'), 'Embalaje', true],
    ['Rollo de plástico burbuja', '10 metros, para proteger objetos frágiles.', 450, 'fixed', 'CUP', null, 'Embalaje', true],
    ['Cinta de embalaje (unidad)', 'Rollo grande, de alta adherencia.', 150, 'fixed', 'CUP', null, 'Embalaje', true],
    ['Mudanza local (hasta 3 habitaciones)', 'Incluye carga, transporte y descarga.', 60, 'from', 'USD', null, 'Servicios', true],
    ['Flete de carga pesada', 'Camión y ayudantes, pregunta por tu caso.', null, 'ask', 'USD', null, 'Servicios', false],
  ],
};

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600_000).toISOString();

/**
 * Agrega catálogo de productos a proveedores demo que ya existen pero se quedaron sin ninguno
 * (ver el comentario de CATALOGOS arriba). Complementa a seedDemo() — no lo reemplaza — para
 * bases YA sembradas, donde seedDemo() no vuelve a correr nada nuevo que se le agregue (su
 * guardián mira solo si existe 'cliente@demo.com').
 *
 * Idempotente por proveedor: si ya tiene algún artículo (de esta función o de seedDemo()), se
 * salta — así un reintento no duplica nada. Mismo centinela de seguridad que seedMapa(): sin
 * DEMO_MODE=true, ni se acerca a la base.
 */
export async function seedCatalogoDemo() {
  if (process.env.DEMO_MODE !== 'true') {
    throw new Error('seedCatalogoDemo solo corre con DEMO_MODE=true: sembraría catálogo falso en datos reales.');
  }
  let creados = 0;
  for (const [email, items] of Object.entries(CATALOGOS)) {
    const perfil = await qOne<{ id: string }>(
      `SELECT pp.id FROM provider_profiles pp JOIN users u ON u.id = pp.user_id WHERE u.email = $1`,
      [email],
    );
    if (!perfil) continue; // este proveedor demo no existe en esta base — no truena, solo lo salta
    const yaTiene = await qOne('SELECT 1 FROM catalog_items WHERE provider_id = $1', [perfil.id]);
    if (yaTiene) continue;
    await tx(async (c) => {
      for (let i = 0; i < items.length; i++) {
        const [name, description, price, price_type, currency, image, section, available] = items[i];
        await c.q(
          `INSERT INTO catalog_items (id, provider_id, name, description, price, price_type, price_currency, image, section, available, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [uuidv4(), perfil.id, name, description, price, price_type, currency, image, section, available, daysAgo(20 - i)],
        );
      }
    });
    creados += items.length;
  }
  return creados;
}

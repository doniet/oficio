import { describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { seedDemo } from '../src/db/seed-demo.js';
import { seedCatalogoDemo } from '../src/db/seed-catalogo-demo.js';

describe('seedCatalogoDemo', () => {
  // Los tests de este archivo comparten la base del propio proceso (igual que seed-mapa.test.ts):
  // este va PRIMERO, antes de que otro test siembre nada, porque comprueba justo la base vacía.
  it('sobre una base sin seedDemo(), no encuentra a quién sembrarle y no falla', async () => {
    process.env.DEMO_MODE = 'true';
    expect(await seedCatalogoDemo()).toBe(0);
    expect(await qOne('SELECT 1 FROM catalog_items')).toBeUndefined();
  });

  it('se niega a sembrar sin DEMO_MODE', async () => {
    delete process.env.DEMO_MODE;
    delete process.env.NODE_ENV;
    await expect(seedCatalogoDemo()).rejects.toThrow(/DEMO_MODE/);
    process.env.DEMO_MODE = 'true';
  });

  it('agrega catálogo a los proveedores demo que seedDemo() dejó sin ninguno', async () => {
    process.env.DEMO_MODE = 'true';
    await seedDemo();

    const creados = await seedCatalogoDemo();
    expect(creados).toBeGreaterThan(0);

    const porProveedor = await q<{ email: string; c: string }>(`
      SELECT u.email, count(*) c FROM catalog_items ci
      JOIN provider_profiles pp ON ci.provider_id = pp.id
      JOIN users u ON pp.user_id = u.id
      WHERE u.email LIKE '%@demo.com'
      GROUP BY u.email ORDER BY u.email
    `);
    const emails = porProveedor.map((r) => r.email);
    // Los seis que seedDemo() dejó sin catálogo (plan básico o pro, cupo de sobra).
    for (const email of ['carpinteria@demo.com', 'clima@demo.com', 'belleza@demo.com', 'mecanica@demo.com', 'pinturas@demo.com', 'mudanzas@demo.com']) {
      expect(emails).toContain(email);
    }

    // No duplica lo que seedDemo() ya había sembrado en ElectroHogar y Dulces La Abuela.
    const electro = porProveedor.find((r) => r.email === 'proveedor@demo.com');
    expect(Number(electro?.c)).toBe(8); // los mismos 8 artículos que siembra seedDemo()
  });

  it('es idempotente: correrlo dos veces no duplica', async () => {
    process.env.DEMO_MODE = 'true';
    expect(await seedCatalogoDemo()).toBe(0); // ya sembrado por el test anterior, en la misma base
  });
});

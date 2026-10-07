import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { q, qOne } from '../src/db/acceso.js';
import { cerrarPool } from '../src/db/conexion.js';
import { migrar } from '../src/db/migrar.js';
import { registrar } from './helpers.js';

beforeAll(async () => { await migrar(); });
afterAll(async () => { await cerrarPool(); });

const existe = async (tabla: string, col: string) => Boolean(await qOne(
  'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [tabla, col],
));

describe('migración 2: DardoVentas', () => {
  it('una base que se quedó en la v1 recibe solo la 2, y sus datos siguen ahí', async () => {
    // Así está producción: esquema.sql aplicado y nada más.
    const p = await registrar('provider');
    await q(`ALTER TABLE catalog_items DROP COLUMN origen, DROP COLUMN uid_externo`);
    await q(`ALTER TABLE provider_profiles DROP COLUMN dardoventas_slug, DROP COLUMN dardoventas_linked_at,
      DROP COLUMN dardoventas_etag, DROP COLUMN dardoventas_synced_at, DROP COLUMN dardoventas_fallos,
      DROP COLUMN dardoventas_reintento_en`);
    await q('DROP TABLE dardoventas_canjes');
    await q('DELETE FROM schema_migrations WHERE version = 2');
    await q("INSERT INTO catalog_items (id, provider_id, name, created_at) VALUES ($1, $2, 'Pan', now())", [uuidv4(), p.providerId]);

    await migrar();

    expect(await existe('catalog_items', 'origen')).toBe(true);
    expect(await existe('provider_profiles', 'dardoventas_slug')).toBe(true);
    expect(await existe('dardoventas_canjes', 'code')).toBe(true);
    const fila = await qOne<{ origen: string }>('SELECT origen FROM catalog_items WHERE provider_id = $1', [p.providerId]);
    expect(fila?.origen).toBe('propio');
    expect((await q('SELECT version FROM schema_migrations ORDER BY version')).length).toBe(2);
  });

  it('el mismo uid externo no puede entrar dos veces en un perfil, y los propios (uid NULL) no chocan', async () => {
    const p = await registrar('provider');
    const meter = (uid: string | null) => q(
      "INSERT INTO catalog_items (id, provider_id, name, origen, uid_externo, created_at) VALUES ($1, $2, 'x', $3, $4, now())",
      [uuidv4(), p.providerId, uid ? 'dardoventas' : 'propio', uid],
    );
    await meter(null);
    await meter(null);
    await meter('u1');
    await expect(meter('u1')).rejects.toThrow();
  });

  it('origen solo admite propio o dardoventas', async () => {
    const p = await registrar('provider');
    await expect(q(
      "INSERT INTO catalog_items (id, provider_id, name, origen, created_at) VALUES ($1, $2, 'x', 'otro', now())",
      [uuidv4(), p.providerId],
    )).rejects.toThrow();
  });
});

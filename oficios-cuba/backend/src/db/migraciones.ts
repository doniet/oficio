// Cambios de esquema posteriores a la v1 (esquema.sql). Una por versión, cada una en su propia
// transacción. Una base nueva recibe esquema.sql y luego todas; producción, solo las que le falten.
// El SQL va en el .ts y no en un .sql aparte para que `npm run build` no tenga que copiar nada más.
export const MIGRACIONES: { version: number; sql: string }[] = [
  {
    // Catálogo importado de DardoVentas (docs/superpowers/specs/2026-10-06-dardoventas-catalogo-design.md).
    version: 2,
    sql: `
      ALTER TABLE provider_profiles
        ADD COLUMN dardoventas_slug text UNIQUE,
        ADD COLUMN dardoventas_linked_at timestamptz,
        ADD COLUMN dardoventas_etag text,
        ADD COLUMN dardoventas_synced_at timestamptz,
        ADD COLUMN dardoventas_fallos integer NOT NULL DEFAULT 0,
        ADD COLUMN dardoventas_reintento_en timestamptz;

      ALTER TABLE catalog_items
        ADD COLUMN origen text NOT NULL DEFAULT 'propio' CHECK (origen IN ('propio', 'dardoventas')),
        ADD COLUMN uid_externo text;

      -- Lo que hace idempotente la sincronización: el upsert choca contra este índice.
      CREATE UNIQUE INDEX idx_catalog_externo ON catalog_items (provider_id, uid_externo)
        WHERE uid_externo IS NOT NULL;

      -- La API apunta aquí el código; oficio_notifier (el único con salida) lo canjea y lo borra.
      CREATE TABLE dardoventas_canjes (
        id uuid PRIMARY KEY,
        provider_id uuid NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
        code text,
        status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'ok', 'error')),
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        done_at timestamptz
      );
      CREATE INDEX idx_dv_canjes ON dardoventas_canjes (status, created_at);
      CREATE INDEX idx_dv_canjes_perfil ON dardoventas_canjes (provider_id, created_at);
    `,
  },
];

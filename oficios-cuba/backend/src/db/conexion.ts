import pg, { Pool } from 'pg';

// pg devuelve timestamptz/timestamp como objeto Date; JSON.stringify lo serializaría con la zona
// local del contenedor. El contrato de la API (y las dos apps) espera una cadena ISO en UTC, que
// es lo que mandaba SQLite. Se parsea como texto y se normaliza, en vez de tocar los cientos de
// sitios que devuelven fechas.
//
// Vive AQUÍ y no en app.ts (Express) porque es un efecto global sobre el driver `pg`, compartido
// por todo el proceso: tiene que registrarse junto al driver, no junto al servidor web. Este
// módulo es el único que cargan los cuatro puntos de entrada del proyecto (API, notificador,
// scripts de CLI y el CLI de seed del mapa) porque todos consultan la base a través del pool que
// define más abajo. Si el registro viviera en app.ts, cualquier proceso que no arrancara la API
// recibiría objetos Date donde el resto del código espera cadenas — y tsc no lo avisaría, porque
// los tipos declarados asumen que el parser ya corrió (ver PagoPendiente en db/pagos.ts).
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (v) => new Date(v).toISOString());
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => new Date(`${v}Z`).toISOString());

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL');

export const pool = new Pool({
  connectionString: url,
  // Por proceso. Con varios procesos de API, procesos × max tiene que caber
  // en el max_connections de Postgres con margen.
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function cerrarPool() {
  await pool.end();
}

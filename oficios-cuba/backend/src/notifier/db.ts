// Acceso a Postgres del notificador. A propósito NO importa db/index.ts: ese módulo carga
// config.ts, que exige JWT_SECRET, y el notificador no lo tiene (ni le hace falta — es el único
// proceso con salida a internet y no debe arrastrar nada que no necesite). db/acceso.ts y
// db/conexion.ts no dependen de config.ts, así que son el único camino permitido aquí.
export { q, qOne, tx, type Tx } from '../db/acceso.js';
export { pool } from '../db/conexion.js';

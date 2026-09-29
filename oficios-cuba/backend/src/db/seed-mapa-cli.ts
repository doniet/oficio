import 'dotenv/config';
import { migrar } from './migrar.js';
import { seedMapa } from './seed-mapa.js';
import { cerrarPool } from './conexion.js';

async function main() {
  await migrar();
  const n = await seedMapa();
  console.log(`Perfiles de prueba creados: ${n}`);
}

main()
  .catch((err) => {
    console.error('No se pudo sembrar el mapa:', err);
    process.exitCode = 1;
  })
  .finally(cerrarPool);

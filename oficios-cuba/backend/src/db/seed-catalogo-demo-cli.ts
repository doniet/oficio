import 'dotenv/config';
import { migrar } from './migrar.js';
import { seedCatalogoDemo } from './seed-catalogo-demo.js';
import { cerrarPool } from './conexion.js';

async function main() {
  await migrar();
  const n = await seedCatalogoDemo();
  console.log(`Artículos de catálogo creados: ${n}`);
}

main()
  .catch((err) => {
    console.error('No se pudo sembrar el catálogo demo:', err);
    process.exitCode = 1;
  })
  .finally(cerrarPool);

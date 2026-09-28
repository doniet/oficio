import 'dotenv/config';
import { initDatabase } from './index.js';
import { seedMapa } from './seed-mapa.js';

initDatabase();
seedMapa().then((n) => console.log(`Perfiles de prueba creados: ${n}`));

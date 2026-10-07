// Doble del lado de DardoVentas para probar Encuentrauno a mano sin el servidor real
// (spec 2026-10-06-dardoventas-catalogo-design.md, «Contrato» y «Precisiones del contrato»).
// También sirve de referencia para quien construya el endpoint de verdad.
//   npm run doble:dardoventas        → http://127.0.0.1:4100
// El notificador local apunta aquí con DARDOVENTAS_URL=http://127.0.0.1:4100 y un archivo de
// secreto que contenga "secreto-local". Ese secreto es SOLO para uso local: el real tiene que ser
// una cadena aleatoria de al menos 32 bytes, distinta de cualquier otra credencial.
// Códigos válidos: los que empiecen por "demo" y cumplan el formato del contrato (22–128
// caracteres de [A-Za-z0-9_-]), p. ej. "demo-recorrido-000000001". Cada código vale una sola vez:
// canjearlo otra vez da 409 (reinicia el doble para volver a usarlo).
// Para simular la baja: crear el archivo /tmp/doble-dv-baja (410 en el catálogo).
// El canje y el catálogo responden directo, sin redirecciones (el notificador usa redirect: 'error').
// La foto con una `v` que ya no es la actual responde 301 a la actual (aquí, v=1); un uid
// desconocido, 404.
import { createServer } from 'http';
import { existsSync } from 'fs';
import { createHash } from 'crypto';

const PUERTO = Number(process.env.PUERTO) || 4100;
const SECRETO = process.env.DOBLE_SECRETO || 'secreto-local';
const SLUG = 'dobleDardoVentas0001';
const BASE = `http://127.0.0.1:${PUERTO}`;
const CODIGO = /^[A-Za-z0-9_-]{22,128}$/;
const VERSION_FOTO = '1';
const codigosUsados = new Set<string>();
// JPEG de 48×48 px generado a propósito (baseline, decodifica en un navegador): basta para ver que
// el proxy y la caché funcionan.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAwADADASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAYEBf/EACUQAAEDAgMJAAAAAAAAAAAAAAEAAwQCEQYTIQUSIjFBUWGh0f/EABYBAQEBAAAAAAAAAAAAAAAAAAIDBP/EABgRAQADAQAAAAAAAAAAAAAAAAABAhIx/9oADAMBAAIRAxEAPwDAiLRCiOzZAZZGp1JPIDusDazoqyPh2G3QM7feq6m9h6SRh2G5QcnfZq6G9x7TxIbhJotE2I7CkFl4ajUEciO6zoGKsw0xS3s7OtxO1G58DT6pNVmGpFLmz8m/E1UbjwdfqdOhfjroiKyLkYlYpc2dnEcTVQsfB0+KTVXiWRS3s8M34nahp4GvxSijfq1OC0Q5bsJ8PMmxGhB5Edis6IGrI+IoblAzt9mrqLXHpJGIobdJyd96roLWHtSaJ7kMQ0TJbs18vPG5OgA5Adgs6Igb/9k=', 'base64');

const catalogo = () => ({
  schema_version: 1,
  items: [
    { uid: 'cafe', name: 'Café cubano', description: 'Taza', category: 'Bebidas', priceSource: 'cup', priceCup: 120, priceUsd: null, disponible: true, updatedAt: '2026-10-07T00:00:00Z', photoUrl: `${BASE}/api/pub/foto/${SLUG}/cafe.jpg?v=${VERSION_FOTO}` },
    { uid: 'malta', name: 'Malta', description: null, category: 'Bebidas', priceSource: 'usd', priceCup: 365, priceUsd: 1, disponible: true, updatedAt: '2026-10-07T00:00:00Z', photoUrl: null },
    { uid: 'pan', name: 'Pan con croqueta', description: null, category: null, priceSource: 'cup', priceCup: null, priceUsd: null, disponible: false, updatedAt: '2026-10-07T00:00:00Z', photoUrl: null },
  ],
});

createServer((req, res) => {
  const url = new URL(req.url ?? '/', BASE);
  if (req.method === 'POST' && url.pathname === '/api/pub/link') {
    if (req.headers.authorization !== `Bearer ${SECRETO}`) { res.writeHead(401).end(); return; }
    let cuerpo = '';
    req.on('data', (t) => { cuerpo += t; });
    req.on('end', () => {
      const code = (() => { try { return JSON.parse(cuerpo).code as string; } catch { return ''; } })();
      if (typeof code !== 'string' || !CODIGO.test(code) || !code.startsWith('demo')) { res.writeHead(404).end(); return; }
      if (codigosUsados.has(code)) { res.writeHead(409).end(); return; }
      codigosUsados.add(code);
      res.writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ ok: true, slug: SLUG, businessName: 'Cafetería del doble' }));
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === `/api/pub/catalog/${SLUG}`) {
    if (existsSync('/tmp/doble-dv-baja')) { res.writeHead(410).end(); return; }
    const cuerpo = JSON.stringify(catalogo());
    const etag = `"${createHash('sha1').update(cuerpo).digest('hex').slice(0, 16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', ETag: etag }).end(cuerpo);
    return;
  }
  if (req.method === 'GET' && url.pathname === `/api/pub/foto/${SLUG}/cafe.jpg`) {
    if (url.searchParams.get('v') !== VERSION_FOTO) {
      res.writeHead(301, { Location: `${BASE}${url.pathname}?v=${VERSION_FOTO}` }).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(JPEG);
    return;
  }
  res.writeHead(404).end();
}).listen(PUERTO, '127.0.0.1', () => console.log(`Doble de DardoVentas en ${BASE}`));

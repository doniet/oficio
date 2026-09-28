// Genera los PNG de la app desde assets/marca/glifo.svg: así el logo vive en un solo sitio.
// Correr con `npm run iconos` después de tocar el glifo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(raiz, 'assets/images');
const salidaWeb = resolve(raiz, '../frontend/public');
const PAPER = { r: 0xfa, g: 0xf6, b: 0xef, alpha: 1 };

const glifo = readFileSync(resolve(raiz, 'assets/marca/glifo.svg'), 'utf8');

/**
 * El glifo como silueta plana de un solo color, para las capas monocromas de Android.
 * Funde la lente y el «1» con el pin a propósito: un monocromo ES una silueta, y Android solo
 * usa su canal alfa. Quita la sombra porque su desenfoque ensucia el borde de esa silueta.
 * No se aplica a las capas a color: ahí el glifo va tal como se diseñó, con su degradado.
 */
const silueta = (color) =>
  Buffer.from(
    glifo
      .replaceAll('#FF9A3A', color)
      .replaceAll('#F26A00', color)
      .replaceAll('#FFFFFF', color)
      .replace(' filter="url(#sh)"', ''),
  );

/** Dibuja el glifo centrado ocupando `proporcion` del lienzo, sobre `fondo` (null = transparente).
 *  `color` null = el glifo como se diseñó; un color = silueta plana de ese color. */
async function pieza(archivo, lado, proporcion, fondo, color = null, destino = salida) {
  const capas = [];
  if (proporcion > 0) {
    const dentro = Math.round(lado * proporcion);
    const fuente = color ? silueta(color) : Buffer.from(glifo);
    capas.push({ input: await sharp(fuente).resize(dentro, dentro).png().toBuffer(), gravity: 'center' });
  }
  const png = await sharp({
    create: { width: lado, height: lado, channels: 4, background: fondo ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(capas).png().toBuffer();
  writeFileSync(resolve(destino, archivo), png);
  console.log(`${archivo} · ${lado}px`);
}

mkdirSync(salida, { recursive: true });

// icon.png: el icono completo, con fondo. El glifo ocupa el 72 % del lienzo.
await pieza('icon.png', 1024, 0.72, PAPER);
// Pantalla de arranque: sin fondo, que lo pone expo-splash-screen desde app.config.ts.
await pieza('splash-icon.png', 512, 0.8, null);
// Adaptativo de Android: la capa de delante se recorta fuerte, así que el glifo ocupa menos.
await pieza('android-icon-foreground.png', 1024, 0.5, null);
await pieza('android-icon-background.png', 1024, 0, PAPER);
// Monocromo y notificación: Android solo usa el canal alfa, el color da igual mientras sea opaco.
await pieza('android-icon-monochrome.png', 1024, 0.5, null, '#FFFFFF');
await pieza('notification-icon.png', 96, 0.8, null, '#FFFFFF');
// Icono de la app en la portada web (DescargarApp.tsx): mismo fondo y proporción que icon.png.
await pieza('app-icono.png', 320, 0.72, PAPER, null, salidaWeb);

import { AppError } from '../middleware/errorHandler.js';

export type Bbox = { sur: number; oeste: number; norte: number; este: number };

// Los mismos límites que valida el perfil en providers.ts.
const CUBA = { sur: 19, oeste: -85.5, norte: 24, este: -73.5 };
const CELDA_MIN = 0.0005;
const CELDA_MAX = 4;
const CELDAS_POR_PANTALLA = 5;
const MARGEN = 0.5;

export function leerBbox(crudo: string | undefined): Bbox {
  const partes = (crudo ?? '').split(',').map((n) => Number(n));
  if (partes.length !== 4 || partes.some((n) => !Number.isFinite(n))) {
    throw new AppError('Área del mapa no válida', 400);
  }
  const [sur, oeste, norte, este] = partes;
  // Un rectángulo invertido o de área cero daría un tamaño de celda 0 o negativo, y el
  // CAST(lat/celda) devolvería basura en vez de fallar.
  if (!(norte > sur) || !(este > oeste)) throw new AppError('Área del mapa no válida', 400);
  if (sur < CUBA.sur || norte > CUBA.norte || oeste < CUBA.oeste || este > CUBA.este) {
    throw new AppError('Área del mapa no válida', 400);
  }
  return { sur, oeste, norte, este };
}

export function tamanoCelda(b: Bbox): number {
  const lado = Math.min(b.norte - b.sur, b.este - b.oeste);
  return Math.min(CELDA_MAX, Math.max(CELDA_MIN, lado / CELDAS_POR_PANTALLA));
}

export function conMargen(b: Bbox): Bbox {
  const alto = (b.norte - b.sur) * MARGEN;
  const ancho = (b.este - b.oeste) * MARGEN;
  return {
    sur: Math.max(CUBA.sur, b.sur - alto),
    norte: Math.min(CUBA.norte, b.norte + alto),
    oeste: Math.max(CUBA.oeste, b.oeste - ancho),
    este: Math.min(CUBA.este, b.este + ancho),
  };
}

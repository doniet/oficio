import type { Request } from 'express';

// Detrás de Cloudflare → cloudflared → Traefik → nginx. La IP real del visitante llega en
// CF-Connecting-IP; el backend no tiene puertos publicados, así que no se puede falsificar.
export const clienteIp = (req: Request) =>
  (req.headers['cf-connecting-ip'] as string) || (req.headers['x-real-ip'] as string) || req.ip || 'unknown';

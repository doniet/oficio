import { createHash } from 'crypto';

// Lo que comparten la API y oficio_notifier. Sin dependencias: el notificador no debe cargar
// config.ts (exigiría JWT_SECRET, un secreto que ese contenedor no necesita).
export const SITIO = (process.env.SITE_URL || 'https://oficio.dardoit.com').replace(/\/$/, '');
export const hashCodigo = (codigo: string) => createHash('sha256').update(codigo).digest('hex');

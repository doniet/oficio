import { constants, createHash, privateDecrypt, publicEncrypt } from 'crypto';

// Lo que comparten la API y oficio_notifier. Sin dependencias: el notificador no debe cargar
// config.ts (exigiría JWT_SECRET, un secreto que ese contenedor no necesita).
export const SITIO = (process.env.SITE_URL || 'https://oficio.dardoit.com').replace(/\/$/, '');
export const hashCodigo = (codigo: string) => createHash('sha256').update(codigo).digest('hex');

// El token del bot se guarda cifrado con la clave PÚBLICA del notificador (RSA-OAEP / SHA-256).
// La API solo cifra: ni ella ni quien lea la base o sus copias puede recuperarlo; solo
// oficio_notifier, que guarda la clave privada en su propio volumen.
export const FORMATO_TOKEN = /^\d{5,15}:[\w-]{30,60}$/;

export function cifrarToken(clavePublicaPem: string, token: string) {
  return publicEncrypt({ key: clavePublicaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(token)).toString('base64');
}

export function descifrarToken(clavePrivadaPem: string, cifrado: string) {
  return privateDecrypt({ key: clavePrivadaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(cifrado, 'base64')).toString();
}

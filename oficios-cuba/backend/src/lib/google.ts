import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';
import { googleClientId } from '../config.js';

// Flujo real (apagado hasta tener GOOGLE_CLIENT_ID y salida de red hacia Google): el navegador
// vuelve de accounts.google.com con un id_token y la API comprueba firma, audiencia, emisor,
// caducidad y el nonce que generó el frontend antes de redirigir.
let jwks: JWTVerifyGetKey | null = null;

export interface IdentidadGoogle {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export async function verificarIdTokenGoogle(idToken: string, nonce: string, claves?: JWTVerifyGetKey): Promise<IdentidadGoogle> {
  const audience = googleClientId();
  if (!audience) throw new Error('Login con Google no configurado');
  jwks ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  const { payload } = await jwtVerify(idToken, claves ?? jwks, {
    audience,
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
  });
  if (payload.nonce !== nonce) throw new Error('nonce no coincide');
  if (payload.email_verified !== true || typeof payload.email !== 'string') throw new Error('email de Google sin verificar');
  return {
    sub: String(payload.sub),
    email: payload.email.toLowerCase(),
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 80) : payload.email.split('@')[0],
    picture: null, // la foto de Google es una URL externa que la CSP bloquea
  };
}

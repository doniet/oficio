import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// TOTP (RFC 6238: HMAC-SHA1, pasos de 30 s, 6 cifras), compatible con Google Authenticator, Aegis, etc.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Buffer) {
  let bits = 0, valor = 0, out = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}

function desdeBase32(s: string) {
  let bits = 0, valor = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('base32 no válido');
    valor = (valor << 5) | i; bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const nuevoSecreto = () => base32(randomBytes(20));

export function codigo(secreto: string, paso: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', desdeBase32(secreto)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

export const pasoActual = (ahora = Date.now()) => Math.floor(ahora / 30_000);

/**
 * Devuelve el paso que valida el código (±1 paso de tolerancia al reloj) o null. Solo se acepta un
 * paso posterior a `ultimoUsado`: el mismo código no sirve dos veces.
 */
export function verificar(secreto: string, entrada: string, ultimoUsado: number | null, ahora = Date.now()): number | null {
  const limpio = entrada.replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;
  const actual = pasoActual(ahora);
  for (const paso of [actual - 1, actual, actual + 1]) {
    if (ultimoUsado !== null && paso <= ultimoUsado) continue;
    if (timingSafeEqual(Buffer.from(codigo(secreto, paso)), Buffer.from(limpio))) return paso;
  }
  return null;
}

export const uriOtpauth = (secreto: string, cuenta: string) =>
  `otpauth://totp/${encodeURIComponent(`Oficios Cuba:${cuenta}`)}?secret=${secreto}&issuer=${encodeURIComponent('Oficios Cuba')}&algorithm=SHA1&digits=6&period=30`;

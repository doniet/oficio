import { describe, expect, it } from 'vitest';
import { esquemaLogin, esquemaMensaje, esquemaRegistro } from '../src/validacion';

describe('validación (mismas reglas que backend/src/routes/auth.ts)', () => {
  it('registro', () => {
    const ok = { email: ' Ana@X.cu ', password: '12345678', full_name: 'Ana Pérez', user_type: 'client' };
    expect(esquemaRegistro.parse(ok).email).toBe('ana@x.cu');
    expect(esquemaRegistro.safeParse({ ...ok, password: 'corta' }).success).toBe(false);
    expect(esquemaRegistro.safeParse({ ...ok, user_type: 'admin' }).success).toBe(false);
    expect(esquemaRegistro.safeParse({ ...ok, phone: 'abc' }).success).toBe(false);
  });
  it('login y mensaje', () => {
    expect(esquemaLogin.safeParse({ email: 'a@b.cu', password: '' }).success).toBe(false);
    expect(esquemaMensaje.safeParse({ content: '   ' }).success).toBe(false);
    expect(esquemaMensaje.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false);
  });
});

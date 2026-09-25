import { z } from 'zod';

// Copia de las reglas de backend/src/routes/auth.ts y conversations.ts: el formulario avisa antes de ir a la red.
// 🚨 phone: el backend SOLO exige trim + max(20) (ver auth.ts registerSchema); esta regex es más estricta
// a propósito para dar feedback temprano en el formulario. No afloja nada del backend, pero registrar el
// mismatch: un teléfono que el backend aceptaría (p.ej. sin dígitos suficientes) el formulario lo rechaza antes.
export const esquemaRegistro = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  full_name: z.string().trim().min(2, 'Escribe tu nombre completo').max(80),
  phone: z.string().trim().regex(/^\+?[\d\s-]{8,20}$/, 'Usa solo números, por ejemplo +53 5 123 4567').optional(),
  user_type: z.enum(['client', 'provider']),
});

export const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export const esquemaMensaje = z.object({ content: z.string().trim().min(1, 'Escribe un mensaje').max(2000) });

export type DatosRegistro = z.infer<typeof esquemaRegistro>;
export type DatosLogin = z.infer<typeof esquemaLogin>;

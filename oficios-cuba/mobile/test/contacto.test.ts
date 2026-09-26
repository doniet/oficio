import { opcionesContacto } from '../src/lib/contacto';

const base = { is_owner: false, has_chat: false, contact_mode: 'whatsapp' as const, whatsapp: '+53 5 123-4567', title: 'Arreglo de neveras' };
const cliente = { user_type: 'client' as const };
const proveedor = { user_type: 'provider' as const };

describe('opcionesContacto', () => {
  it('Profesional: chat además de WhatsApp', () => {
    const o = opcionesContacto({ ...base, has_chat: true }, cliente);
    expect(o.chat).toBe(true);
    expect(o.whatsapp).toBe('https://wa.me/5351234567?text=' + encodeURIComponent('Hola, vi tu servicio «Arreglo de neveras» en Oficios Cuba y me interesa.'));
    expect(o.llamar).toBeNull();
  });

  it('sin chat (Gratis/Básico): solo lo que eligió el profesional', () => {
    expect(opcionesContacto(base, cliente)).toMatchObject({ chat: false, llamar: null });
    expect(opcionesContacto(base, cliente).whatsapp).not.toBeNull();
    const llamada = opcionesContacto({ ...base, contact_mode: 'call' }, cliente);
    expect(llamada).toEqual({ chat: false, whatsapp: null, llamar: 'tel:+5351234567', nada: false });
    const ambos = opcionesContacto({ ...base, contact_mode: 'both' }, cliente);
    expect(ambos.whatsapp && ambos.llamar).toBeTruthy();
  });

  it('sin sesión también se ve el contacto (el chat pedirá entrar al pulsarlo)', () => {
    expect(opcionesContacto({ ...base, has_chat: true }, null)).toMatchObject({ chat: true, nada: false });
  });

  it('un proveedor no abre chats con otros, pero sí ve WhatsApp/llamada', () => {
    const o = opcionesContacto({ ...base, has_chat: true, contact_mode: 'both' }, proveedor);
    expect(o.chat).toBe(false);
    expect(o.whatsapp && o.llamar).toBeTruthy();
  });

  it('el dueño no ve botones de contacto de su propio servicio', () => {
    expect(opcionesContacto({ ...base, is_owner: true, has_chat: true, contact_mode: 'both' }, proveedor))
      .toEqual({ chat: false, whatsapp: null, llamar: null, nada: false });
  });

  it('sin teléfono ni chat: "nada" para poder avisar', () => {
    expect(opcionesContacto({ ...base, whatsapp: null, contact_mode: 'both' }, cliente)).toEqual({ chat: false, whatsapp: null, llamar: null, nada: true });
    expect(opcionesContacto({ ...base, whatsapp: '  ' }, cliente).nada).toBe(true);
  });
});

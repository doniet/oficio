import type { Message } from '@oficio/shared';
import { chatVacio, trasEnviar, trasSondeo } from '../src/lib/chat';

const m = (id: string, created_at: string, sender_type: 'client' | 'provider' = 'client') =>
  ({ id, conversation_id: 'c1', sender_id: sender_type, sender_type, content: id, is_read: false, created_at }) as unknown as Message;

describe('cursor del chat', () => {
  it('lo que el otro escribió entre el último sondeo y mi envío no se salta', () => {
    let e = trasSondeo(chatVacio, [m('m1', '2026-09-25T10:00:00.000Z')]);
    // El profesional escribe m2 (10:00:05); yo envío m3 (10:00:08) antes del siguiente sondeo.
    e = trasEnviar(e, m('m3', '2026-09-25T10:00:08.000Z'));
    expect(e.mensajes.map((x) => x.id)).toEqual(['m1', 'm3']); // mi mensaje se ve al instante
    expect(e.cursor).toBe('2026-09-25T10:00:00.000Z');        // pero el cursor no se mueve

    // El siguiente sondeo pide desde el cursor: el servidor devuelve m2 y m3.
    e = trasSondeo(e, [m('m2', '2026-09-25T10:00:05.000Z', 'provider'), m('m3', '2026-09-25T10:00:08.000Z')]);
    expect(e.mensajes.map((x) => x.id)).toEqual(['m1', 'm2', 'm3']);
    expect(e.cursor).toBe('2026-09-25T10:00:08.000Z');
  });

  it('un sondeo vacío no cambia nada', () => {
    const e = trasSondeo(chatVacio, [m('m1', '2026-09-25T10:00:00.000Z')]);
    expect(trasSondeo(e, [])).toBe(e);
  });

  it('no duplica si el sondeo trae un mensaje que ya estaba', () => {
    let e = trasEnviar(chatVacio, m('m1', '2026-09-25T10:00:00.000Z'));
    e = trasSondeo(e, [m('m1', '2026-09-25T10:00:00.000Z')]);
    expect(e.mensajes).toHaveLength(1);
  });
});

import type { Message } from '@oficio/shared';

export type EstadoChat = { mensajes: Message[]; cursor: string | undefined };

export const chatVacio: EstadoChat = { mensajes: [], cursor: undefined };

// Sin duplicados (por id) y en orden cronológico: un mensaje enviado se muestra al instante,
// y el sondeo puede traer después uno del otro que es anterior a él.
function fusionar(actuales: Message[], nuevos: Message[]): Message[] {
  const frescos = nuevos.filter((n) => !actuales.some((x) => x.id === n.id));
  if (!frescos.length) return actuales;
  return [...actuales, ...frescos].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

// El cursor (`since` del sondeo) SOLO avanza con lo que devuelve el sondeo: el servidor devuelve
// todo lo posterior al cursor, así que lo que el otro escribió entre el último sondeo y nuestro
// envío llega en el siguiente sondeo. Si avanzara al enviar, ese mensaje se saltaría para siempre.
export function trasSondeo(estado: EstadoChat, recibidos: Message[]): EstadoChat {
  if (!recibidos.length) return estado;
  return { mensajes: fusionar(estado.mensajes, recibidos), cursor: recibidos[recibidos.length - 1].created_at };
}

export function trasEnviar(estado: EstadoChat, enviado: Message): EstadoChat {
  return { mensajes: fusionar(estado.mensajes, [enviado]), cursor: estado.cursor };
}

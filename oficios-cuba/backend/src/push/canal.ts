export interface Notificacion { titulo: string; cuerpo: string; datos: Record<string, string> }
export type ResultadoEnvio = 'ok' | 'token_invalido' | 'error';
export interface CanalPush { enviar(token: string, n: Notificacion): Promise<ResultadoEnvio> }

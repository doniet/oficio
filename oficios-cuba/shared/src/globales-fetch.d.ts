// Ambientales mínimos de las APIs fetch: el tsconfig del paquete usa lib ES2022 (sin "DOM") a propósito,
// para que window/localStorage/document no se puedan colar en código que también corre en React Native.
// fetch/Response/AbortController/setTimeout SÍ hacen falta para compilar src/api.ts y sus tests: se declaran
// aquí, mínimos, en vez de agregar "DOM" a lib o @types/node (que traería de vuelta todo lo que se quiere evitar).

declare function fetch(url: string, init?: RequestInit): Promise<Response>;

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

declare class Response {
  constructor(body?: string, init?: { status?: number; headers?: Record<string, string> });
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

interface AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

declare class AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}

declare class DOMException extends Error {
  constructor(message?: string, name?: string);
}

declare function setTimeout(handler: () => void, timeout?: number): number;
declare function clearTimeout(id: number): void;

import { createElement, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelMapa from './PanelMapa';
import { providerApi } from '../../services/api';
import type { ProviderPublic, PuntoMapa } from '../../types';
import { fijarAncho } from './probarAncho';

// Igual que en usarMapa.test.ts: solo se sustituyen las funciones de providerApi que usa la
// hoja, con vi.importActual de por medio para no dejar apiError ni el resto del módulo undefined.
vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...real,
    providerApi: { ...real.providerApi, getById: vi.fn(), contact: vi.fn(() => Promise.resolve()) },
  };
});

const punto: PuntoMapa = {
  id: 'p1', tipo: 'oficio', nombre: 'Juan Plomero', lat: 23, lng: -82, plan: 'free', aproximado: false, cy: 0, cx: 0, detras: 0,
  resumen: 'Plomería a domicilio',
};

const perfilMock: ProviderPublic = {
  id: 'p1',
  business_name: 'Juan Plomero',
  description: 'Plomería a domicilio, 10 años de experiencia.',
  province_id: 'prov1',
  municipality_id: 'mun1',
  years_experience: 10,
  rating: 4.6,
  review_count: 12,
  subscription_plan: 'basic',
  created_at: '2024-01-01T00:00:00.000Z',
  province_name: 'La Habana',
  municipality_name: 'Plaza',
  owner_name: 'Juan Pérez',
  avatar_url: null,
  service_count: 2,
  categories: ['Plomería'],
  cover: null,
  kind: 'oficio',
  contact_mode: 'both',
  has_chat: false,
  has_agenda: false,
  address: null,
  lat: 23,
  lng: -82,
  gallery: [],
  horario: null,
  whatsapp: '+5355555555',
  telegram: null,
  email_contact: null,
};

// jsdom no hace layout: `offsetParent` siempre da null, así que el filtro de "visible" de la
// trampa de foco (usarPanel.ts) descartaría todo elemento y las pruebas de Tab no probarían
// nada. Es un hueco conocido de jsdom (ver la documentación de testing-library al respecto),
// no algo que dependa del navegador real: se parchea aquí, no en el componente.
beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentNode as Element | null; },
  });
});

function panel(props: { onCerrar?: () => void; punto?: PuntoMapa | null; lista?: PuntoMapa[] | null } = {}) {
  return createElement(PanelMapa, {
    punto: props.punto === undefined ? punto : props.punto,
    lista: props.lista ?? null,
    onElegirDeLista: vi.fn(),
    onCerrar: props.onCerrar ?? vi.fn(),
  });
}

function montar(props: { onCerrar?: () => void; punto?: PuntoMapa | null } = {}) {
  const onCerrar = props.onCerrar ?? vi.fn();
  const utils = render(createElement(MemoryRouter, null, panel({ ...props, onCerrar })));
  return { onCerrar, ...utils };
}

describe('PanelMapa — hoja móvil', () => {
  beforeEach(() => {
    vi.mocked(providerApi.getById).mockReset();
    vi.mocked(providerApi.contact).mockClear();
    // Arranca cada prueba con una entrada neutra, sin restos de pushState/replaceState de la
    // prueba anterior (todas comparten el mismo window.history de jsdom dentro del archivo).
    window.history.replaceState(null, '');
    fijarAncho(390);
  });
  afterEach(() => {
    // vitest, a diferencia de Jest, no registra el afterEach de limpieza automática de RTL
    // sin `test.globals: true` (que este proyecto no activa): hay que llamarlo a mano, o cada
    // prueba deja la hoja anterior montada y las búsquedas por rol empiezan a duplicarse.
    cleanup();
    vi.restoreAllMocks();
  });

  // Fija la conducta ANTES de moverla a usarPanel: si la extracción se dejara el efecto por el
  // camino, la página se quedaría sin poder hacer scroll para siempre tras cerrar la hoja.
  it('bloquea el scroll del cuerpo mientras está abierta y devuelve el valor previo al cerrar', () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = montar();
    expect(document.body.style.overflow).toBe('hidden');
    rerender(createElement(MemoryRouter, null, panel({ punto: null })));
    expect(document.body.style.overflow).toBe('scroll');
  });

  // Con una entrada por punto, recorrer cinco negocios de una celda dejaría cinco entradas y
  // haría falta pulsar Atrás cinco veces para salir de Explorar.
  it('abrir otro punto sin cerrar no añade una segunda entrada de historial', async () => {
    const onCerrar = vi.fn();
    const largoInicial = window.history.length;
    const { rerender } = montar({ onCerrar });
    rerender(createElement(MemoryRouter, null, panel({ punto: { ...punto, id: 'p2', nombre: 'Otro' }, onCerrar })));
    expect(window.history.length - largoInicial).toBe(1);
    window.history.back();
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });

  it('Esc cierra la hoja', () => {
    const { onCerrar } = montar();
    // cerrar() delega en history.back() porque la entrada es nuestra; jsdom no dispara el
    // popstate correspondiente en el mismo tick (a diferencia de pushState/replaceState, que
    // sí son síncronos), así que se simula a mano — igual que en la prueba de la X, para no
    // depender de la fidelidad de navegación real de jsdom.
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.popState(window);
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('al abrir empuja una entrada de historial marcada; al cerrar por la X retrocede y el popstate avisa al padre', () => {
    const { onCerrar } = montar();
    expect(window.history.state).toEqual({ hojaPunto: true });

    // Evita que jsdom intente navegar de verdad: lo que importa es que cerrar() LLAME a
    // history.back() porque la entrada es nuestra; la reacción real del navegador a ese back()
    // se simula a mano disparando el popstate que el navegador dispararía por su cuenta.
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la ficha' }));
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(onCerrar).not.toHaveBeenCalled(); // todavía no: falta el popstate

    fireEvent.popState(window);
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('el botón Atrás del navegador (un popstate directo, sin pasar por cerrar()) también cierra', () => {
    const { onCerrar } = montar();
    fireEvent.popState(window);
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('el enlace "Ver perfil completo" limpia la entrada de la hoja antes de navegar, sin dejarla huérfana', () => {
    montar();
    expect(window.history.state).toEqual({ hojaPunto: true });

    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    fireEvent.click(screen.getByRole('link', { name: 'Ver perfil completo' }));

    // replaceState quita la marca de la entrada actual (la que abrió la hoja) en vez de dejarla
    // bajo la ruta nueva a la que navega el <Link>: así un solo Atrás basta para salir.
    expect(replaceSpy).toHaveBeenCalledWith(null, '');
    expect(window.history.state).not.toEqual({ hojaPunto: true });
  });

  it('el foco entra en la hoja al abrir, queda atrapado con Tab/Shift+Tab, y vuelve a quien la abrió al cerrar', async () => {
    const disparador = document.createElement('button');
    disparador.textContent = 'Marcador';
    document.body.appendChild(disparador);
    disparador.focus();
    expect(document.activeElement).toBe(disparador);

    const { rerender, onCerrar } = montar();
    void onCerrar;

    // Primer control dentro de la hoja: el asa (primer <button> del contenedor).
    const asa = screen.getByRole('button', { name: 'Ver la ficha completa' });
    expect(document.activeElement).toBe(asa);

    const cerrarBtn = screen.getByRole('button', { name: 'Cerrar la ficha' });
    const enlace = screen.getByRole('link', { name: 'Ver perfil completo' });

    // Shift+Tab desde el primero (el asa) rebota al último (el enlace).
    fireEvent.keyDown(asa, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(enlace);

    // Tab desde el último (el enlace, con el foco ya ahí) rebota al primero (el asa).
    fireEvent.keyDown(enlace, { key: 'Tab' });
    expect(document.activeElement).toBe(asa);

    void cerrarBtn;

    rerender(createElement(MemoryRouter, null, panel({ punto: null, onCerrar })));
    expect(document.activeElement).toBe(disparador);

    document.body.removeChild(disparador);
  });

  it('--hoja-punto-alto vale un alto positivo mientras está abierta, "0px" al cerrar, y se elimina al desmontar', () => {
    const { rerender, unmount, onCerrar } = montar();
    const raiz = document.documentElement.style;

    expect(raiz.getPropertyValue('--hoja-punto-alto')).toMatch(/^\d+px$/);
    expect(raiz.getPropertyValue('--hoja-punto-alto')).not.toBe('0px');

    rerender(createElement(MemoryRouter, null, panel({ punto: null, onCerrar })));
    expect(raiz.getPropertyValue('--hoja-punto-alto')).toBe('0px');

    unmount();
    expect(raiz.getPropertyValue('--hoja-punto-alto')).toBe('');
  });

  it('al desplegar la ficha completa, contactar por WhatsApp o llamar registra el contacto (derecho a reseñar)', async () => {
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock } } as any);
    montar();

    fireEvent.click(screen.getByRole('button', { name: 'Ver la ficha completa' }));
    await waitFor(() => expect(providerApi.getById).toHaveBeenCalledWith('p1'));

    const whatsapp = await screen.findByRole('link', { name: 'WhatsApp' });
    fireEvent.click(whatsapp);
    expect(providerApi.contact).toHaveBeenCalledWith('p1', 'whatsapp');

    const llamar = screen.getByRole('link', { name: 'Llamar' });
    fireEvent.click(llamar);
    expect(providerApi.contact).toHaveBeenCalledWith('p1', 'call');
  });

  it('si falla la carga de la ficha completa, "Reintentar" vuelve a pedirla', async () => {
    vi.mocked(providerApi.getById)
      .mockRejectedValueOnce(new Error('caída'))
      .mockResolvedValueOnce({ data: { provider: perfilMock } } as any);
    montar();

    fireEvent.click(screen.getByRole('button', { name: 'Ver la ficha completa' }));
    await waitFor(() => expect(providerApi.getById).toHaveBeenCalledTimes(1));
    const reintentar = await screen.findByRole('button', { name: 'Reintentar' });

    fireEvent.click(reintentar);
    await waitFor(() => expect(providerApi.getById).toHaveBeenCalledTimes(2));
    await screen.findByText(perfilMock.description!);
  });
});

describe('PanelMapa — elección de envoltorio', () => {
  beforeEach(() => { vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock } } as never); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('a partir de 1024 px monta el panel lateral, no la hoja', () => {
    fijarAncho(1280);
    montar();
    expect(screen.getByTestId('panel-lateral')).toBeTruthy();
    expect(screen.queryByLabelText(/Ver la ficha completa|Recoger la ficha/)).toBeNull();
  });

  it('por debajo de 1024 px monta la hoja, con su asa', () => {
    fijarAncho(390);
    montar();
    expect(screen.queryByTestId('panel-lateral')).toBeNull();
    expect(screen.getByLabelText(/Ver la ficha completa|Recoger la ficha/)).toBeTruthy();
  });

  // Rotar una tableta con el panel abierto cambia de envoltorio: la entrada de historial la
  // posee PanelMapa, que sobrevive al cambio, y no el envoltorio que se desmonta. Si la poseyera
  // el envoltorio, cada giro dejaría una entrada huérfana y haría falta un Atrás de más.
  it('cruzar el corte no acumula entradas de historial ni pierde el foco', async () => {
    fijarAncho(390);
    const onCerrar = vi.fn();
    const origen = document.createElement('button');
    document.body.appendChild(origen);
    origen.focus();

    const largoInicial = window.history.length;
    const { rerender } = render(createElement(MemoryRouter, null, panel({ onCerrar })));
    fijarAncho(1280);
    rerender(createElement(MemoryRouter, null, panel({ onCerrar })));
    expect(window.history.length - largoInicial).toBe(1);

    rerender(createElement(MemoryRouter, null, panel({ punto: null, onCerrar })));
    await waitFor(() => expect(document.activeElement).toBe(origen));
    origen.remove();
  });

  it('cruzar el corte con el panel abierto conserva el contenido', () => {
    fijarAncho(390);
    const { rerender } = montar();
    expect(screen.getByText('Juan Plomero')).toBeTruthy();
    fijarAncho(1280);
    rerender(createElement(MemoryRouter, null, panel({})));
    expect(screen.getByText('Juan Plomero')).toBeTruthy();
  });
});

describe('PanelMapa — lista de celda', () => {
  const dos: PuntoMapa[] = [punto, { ...punto, id: 'p2', nombre: 'Otro Negocio' }];

  beforeEach(() => {
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock } } as never);
    window.history.replaceState(null, '');
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  // Hasta esta entrega, elegir uno de la lista la descartaba: la única vuelta era volver a tocar
  // el grupo en el mapa.
  it('elegir uno de la lista muestra su ficha, y «Volver a la lista» la devuelve', async () => {
    fijarAncho(1280);
    function Anfitrion() {
      const [lista, setLista] = useState<PuntoMapa[] | null>(dos);
      const [p, setP] = useState<PuntoMapa | null>(null);
      return createElement(PanelMapa, {
        punto: p,
        lista,
        onElegirDeLista: (x: PuntoMapa) => { setP(x); setLista(null); },
        onVolverALista: () => { setP(null); setLista(dos); },
        onCerrar: vi.fn(),
      });
    }
    render(createElement(MemoryRouter, null, createElement(Anfitrion)));
    fireEvent.click(screen.getByText('Otro Negocio'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Otro Negocio' })).toBeTruthy());
    fireEvent.click(screen.getByText(/Volver a la lista/));
    await waitFor(() => expect(screen.getByText('Juan Plomero')).toBeTruthy());
  });

  // La ficha ya se cerraba con Atrás; la lista no, porque no empujaba entrada propia.
  it('Atrás con la lista abierta la cierra en vez de sacarte de Explorar', async () => {
    fijarAncho(390);
    const onCerrar = vi.fn();
    render(createElement(MemoryRouter, null, createElement(PanelMapa, {
      punto: null, lista: dos, onElegirDeLista: vi.fn(), onCerrar,
    })));
    window.history.back();
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });

  it('si la celda falló, la lista enseña el error y «Reintentar»', () => {
    fijarAncho(390);
    const onReintentar = vi.fn();
    render(createElement(MemoryRouter, null, createElement(PanelMapa, {
      punto: null, lista: [], errorLista: 'No pudimos cargar los negocios de esta zona.',
      onReintentarLista: onReintentar, onElegirDeLista: vi.fn(), onCerrar: vi.fn(),
    })));
    expect(screen.getByText(/No pudimos cargar los negocios de esta zona/)).toBeTruthy();
    fireEvent.click(screen.getByText('Reintentar'));
    expect(onReintentar).toHaveBeenCalled();
  });
});

describe('PanelMapa — foco', () => {
  beforeEach(() => {
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock } } as never);
    window.history.replaceState(null, '');
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  // La hoja móvil tapa la pantalla: atrapar el foco es correcto. El panel lateral NO la tapa —
  // declara aria-modal="false" y el mapa a su lado sigue siendo usable —, así que atrapar el foco
  // ahí le miente a quien navega con teclado: no podría volver al buscador.
  it('el panel lateral NO atrapa el foco; la hoja móvil sí', () => {
    fijarAncho(1280);
    const { unmount } = montar();
    const lateral = screen.getByTestId('panel-lateral');
    const enLateral = Array.from(lateral.querySelectorAll<HTMLElement>('a[href], button'));
    enLateral[enLateral.length - 1].focus();
    fireEvent.keyDown(lateral, { key: 'Tab' });
    expect(document.activeElement).toBe(enLateral[enLateral.length - 1]);
    unmount();

    fijarAncho(390);
    montar();
    const hoja = screen.getByRole('dialog');
    const enHoja = Array.from(hoja.querySelectorAll<HTMLElement>('a[href], button'));
    enHoja[enHoja.length - 1].focus();
    fireEvent.keyDown(hoja, { key: 'Tab' });
    expect(document.activeElement).toBe(enHoja[0]);
  });
});

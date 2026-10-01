import { createElement, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelMapa from './PanelMapa';
import { AuthProvider } from '../../hooks/useAuth';
import { configApi, providerApi } from '../../services/api';
import type { ProviderPublic, PuntoMapa } from '../../types';
import { fijarAncho } from './probarAncho';

// Igual que en usarMapa.test.ts: solo se sustituyen las funciones de providerApi que usa la
// hoja, con vi.importActual de por medio para no dejar apiError ni el resto del módulo undefined.
// configApi.get también, porque AuthProvider la llama sola al montar (hace falta desde que
// FichaPunto puede montar BookingModal — "Pedir cita" —, que usa useAuth y por tanto exige el
// provider; Search.test.tsx mockea lo mismo por la misma razón).
vi.mock('../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../services/api')>('../../services/api');
  return {
    ...real,
    configApi: { ...real.configApi, get: vi.fn() },
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

// AuthProvider hace falta desde que FichaPunto puede montar BookingModal ("Pedir cita"), que usa
// useAuth: tanto el primer render como cualquier rerender necesitan este mismo árbol, o React,
// al ver un MemoryRouter cuyo hijo cambió de "AuthProvider" a "PanelMapa", desmonta de más.
function envolver(nodo: ReturnType<typeof createElement>) {
  return createElement(MemoryRouter, null, createElement(AuthProvider, null, nodo));
}

function montar(props: { onCerrar?: () => void; punto?: PuntoMapa | null } = {}) {
  const onCerrar = props.onCerrar ?? vi.fn();
  // Imperativo y no en un beforeEach: los `afterEach(() => vi.restoreAllMocks())` de este archivo
  // borrarían cualquier mockResolvedValue puesto fuera de aquí antes de que el siguiente test
  // llegue a renderizar — AuthProvider llama a configApi.get() sola, en cuanto se monta.
  vi.mocked(configApi.get).mockResolvedValue({ data: { demo: false, google: null, google_client_id: null } } as never);
  const utils = render(envolver(panel({ ...props, onCerrar })));
  return { onCerrar, ...utils };
}

describe('PanelMapa — hoja móvil', () => {
  beforeEach(() => {
    vi.mocked(providerApi.getById).mockReset();
    // La hoja ya pide el perfil completo apenas se abre (ni "asomada" espera a que la desplieguen
    // del todo): sin este valor por defecto, los tests que no les importa el perfil en sí —y por
    // eso no lo mockean a mano— reventarían con "Cannot read properties of undefined (reading
    // 'then')" en cuanto montaran la hoja.
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock } } as any);
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
    rerender(envolver(panel({ punto: null })));
    expect(document.body.style.overflow).toBe('scroll');
  });

  // Con una entrada por punto, recorrer cinco negocios de una celda dejaría cinco entradas y
  // haría falta pulsar Atrás cinco veces para salir de Explorar.
  it('abrir otro punto sin cerrar no añade una segunda entrada de historial', async () => {
    const onCerrar = vi.fn();
    const largoInicial = window.history.length;
    const { rerender } = montar({ onCerrar });
    rerender(envolver(panel({ punto: { ...punto, id: 'p2', nombre: 'Otro' }, onCerrar })));
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
    const compartirBtn = screen.getByRole('button', { name: /Compartir/ });

    // Shift+Tab desde el primero (el asa) rebota al último (el botón «Compartir»).
    fireEvent.keyDown(asa, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(compartirBtn);

    // Tab desde el último (compartir, con el foco ya ahí) rebota al primero (el asa).
    fireEvent.keyDown(compartirBtn, { key: 'Tab' });
    expect(document.activeElement).toBe(asa);

    void cerrarBtn;

    rerender(envolver(panel({ punto: null, onCerrar })));
    expect(document.activeElement).toBe(disparador);

    document.body.removeChild(disparador);
  });

  it('--hoja-punto-alto vale un alto positivo mientras está abierta, "0px" al cerrar, y se elimina al desmontar', () => {
    const { rerender, unmount, onCerrar } = montar();
    const raiz = document.documentElement.style;

    expect(raiz.getPropertyValue('--hoja-punto-alto')).toMatch(/^\d+px$/);
    expect(raiz.getPropertyValue('--hoja-punto-alto')).not.toBe('0px');

    rerender(envolver(panel({ punto: null, onCerrar })));
    expect(raiz.getPropertyValue('--hoja-punto-alto')).toBe('0px');

    unmount();
    expect(raiz.getPropertyValue('--hoja-punto-alto')).toBe('');
  });

  // Antes se medía scrollHeight real (vía ResizeObserver) para decidir si hacía falta el aviso,
  // pero esa medida llega tarde: el perfil carga asíncrono, así que en el PRIMER toque el aviso no
  // alcanzaba a salir (recién aparecía al abrir un segundo punto, cuando el observer ya llevaba un
  // rato activo). Ahora depende solo de la posición de la hoja —síncrono, sin esperar nada del
  // perfil ni del DOM—, así que tiene que estar desde el instante en que se abre.
  it('el indicador de "hay más abajo" sale ya en el primer toque (asomada) y se va al desplegar la hoja del todo', () => {
    montar();
    expect(screen.getByTestId('hoja-indicador-mas')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ver la ficha completa' }));
    expect(screen.queryByTestId('hoja-indicador-mas')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Recoger la ficha' }));
    expect(screen.getByTestId('hoja-indicador-mas')).toBeTruthy();
  });

  // Antes de este cambio, la hoja no pedía el perfil hasta desplegarla del todo (`expandida`
  // dependía de la posición). Ahora pide siempre, apenas se abre: "asomada" ya es una vista real,
  // no un simple avance — así que no hay razón para no pedir lo que ya se está mirando.
  it('pide el perfil apenas se abre el punto, sin esperar a que se despliegue del todo', async () => {
    montar();
    await waitFor(() => expect(providerApi.getById).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText(perfilMock.description!)).toBeTruthy();
  });

  // La calificación va pegada a las reseñas (es el mismo dato: "lo que dicen los demás"), no
  // arriba del todo junto con la descripción — ambos al final, después de qué ofrece el negocio.
  it('la calificación y las reseñas van al final, después de qué ofrece y de los servicios', async () => {
    const servicios = [{
      id: 's1', title: 'Cambio de tubería', description: null, price_min: 1000, price_max: null,
      price_type: 'fixed' as const, price_currency: 'CUP' as const, cover: null,
      category_name: 'Plomería', category_icon: '🔧', category_slug: 'plomeria', created_at: '2024-01-01T00:00:00.000Z',
    }];
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock, services: servicios } } as any);
    const { container } = montar();
    await screen.findByText(perfilMock.description!);
    await screen.findByText(/Servicios/);

    const html = container.innerHTML;
    const posDescripcion = html.indexOf(perfilMock.description!);
    const posServicios = html.indexOf('Servicios');
    const posCalificacion = html.indexOf('4.6');
    expect(posDescripcion).toBeGreaterThan(-1);
    expect(posServicios).toBeGreaterThan(posDescripcion);
    expect(posCalificacion).toBeGreaterThan(posServicios);
  });

  it('los iconos de contacto (llamar, WhatsApp, cita) salen junto a "Compartir" en cuanto se sabe qué ofrece el perfil', async () => {
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: { ...perfilMock, has_agenda: true } } } as any);
    montar();

    const whatsapp = await screen.findByRole('link', { name: 'WhatsApp' });
    fireEvent.click(whatsapp);
    expect(providerApi.contact).toHaveBeenCalledWith('p1', 'whatsapp');

    const llamar = screen.getByRole('link', { name: 'Llamar' });
    fireEvent.click(llamar);
    expect(providerApi.contact).toHaveBeenCalledWith('p1', 'call');

    // "Pedir cita" abre el modal de agenda — basta con que exista y abra, el flujo de reserva en
    // sí ya lo prueba BookingModal.test.tsx.
    fireEvent.click(screen.getByRole('button', { name: 'Pedir cita' }));
    expect(await screen.findByRole('dialog', { name: /cita|agenda/i })).toBeTruthy();
  });

  it('sin WhatsApp, teléfono ni agenda, solo queda "Compartir" en esa fila', async () => {
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: { ...perfilMock, whatsapp: null, has_agenda: false } } } as any);
    montar();
    await waitFor(() => expect(providerApi.getById).toHaveBeenCalled());

    expect(screen.queryByRole('link', { name: 'WhatsApp' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Llamar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pedir cita' })).toBeNull();
    expect(screen.getByRole('button', { name: /Compartir/ })).toBeTruthy();
  });

  it('los servicios van en un acordeón cerrado: sus fotos no se piden hasta desplegarlo', async () => {
    const servicios = [{
      id: 's1', title: 'Cambio de tubería', description: null, price_min: 1000, price_max: null,
      price_type: 'fixed' as const, price_currency: 'CUP' as const, cover: '/demo/plomeria-1.webp',
      category_name: 'Plomería', category_icon: '🔧', category_slug: 'plomeria', created_at: '2024-01-01T00:00:00.000Z',
    }];
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock, services: servicios } } as any);
    const { container } = montar();

    fireEvent.click(screen.getByRole('button', { name: 'Ver la ficha completa' }));
    const toggle = await screen.findByRole('button', { name: /Servicios/ });

    // Cerrado por defecto: ni el link al servicio ni su foto existen todavía en el DOM.
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: /Cambio de tubería/ })).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByRole('link', { name: /Cambio de tubería/ })).toBeTruthy();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('las reseñas van en el mismo tipo de acordeón, con un enlace al resto si hay más de 3', async () => {
    const resenas = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`, rating: 5, comment: `Reseña número ${i}`, created_at: '2024-01-01T00:00:00.000Z', client_name: `Cliente ${i}`,
    }));
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock, reviews: resenas } } as any);
    montar();

    fireEvent.click(screen.getByRole('button', { name: 'Ver la ficha completa' }));
    const toggle = await screen.findByRole('button', { name: /Reseñas/ });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Reseña número 0')).toBeNull();

    fireEvent.click(toggle);
    expect(await screen.findByText('Reseña número 0')).toBeTruthy();
    // Solo las 3 primeras: la 4.ª y 5.ª quedan detrás del enlace a verlas todas.
    expect(screen.queryByText('Reseña número 3')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver las 5 reseñas' }).getAttribute('href')).toBe('/proveedor/p1#resenas');
  });

  it('«Compartir» usa el share nativo del dispositivo, o copia el enlace si no hay', async () => {
    vi.mocked(providerApi.getById).mockResolvedValue({ data: { provider: perfilMock } } as any);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    montar();

    const compartir = screen.getByRole('button', { name: /Compartir/ });
    fireEvent.click(compartir);
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('/proveedor/p1') })));

    // @ts-expect-error — se borra para simular un navegador (de escritorio) sin share nativo.
    delete navigator.share;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    fireEvent.click(compartir);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/proveedor/p1')));
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
    vi.mocked(configApi.get).mockResolvedValue({ data: { demo: false, google: null, google_client_id: null } } as never);
    const { rerender } = render(envolver(panel({ onCerrar })));
    fijarAncho(1280);
    rerender(envolver(panel({ onCerrar })));
    expect(window.history.length - largoInicial).toBe(1);

    rerender(envolver(panel({ punto: null, onCerrar })));
    await waitFor(() => expect(document.activeElement).toBe(origen));
    origen.remove();
  });

  it('cruzar el corte con el panel abierto conserva el contenido', () => {
    fijarAncho(390);
    const { rerender } = montar();
    expect(screen.getByText('Juan Plomero')).toBeTruthy();
    fijarAncho(1280);
    rerender(envolver(panel({})));
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

import type { ProviderServiceArea } from '@oficio/shared';
import {
  accionArticulo, contactoPerfil, enlaceCorreo, enlaceTelegram, etiquetaBarraResenas,
  etiquetaConteoCatalogo, mensajeArticulo, plural, zonasPorProvincia,
} from '../src/lib/perfil';

const area = (province_name: string, municipality_name: string): ProviderServiceArea => ({
  id: `${province_name}-${municipality_name}`,
  municipality_id: municipality_name,
  municipality_name,
  province_name,
});

const perfil = (over: Partial<Parameters<typeof contactoPerfil>[0]> = {}) => ({
  whatsapp: null,
  telegram: null,
  email_contact: null,
  contact_mode: 'both' as const,
  has_chat: false,
  ...over,
});

describe('plural', () => {
  it('con 1 usa el singular', () => {
    expect(plural(1, 'reseña', 'reseñas')).toBe('1 reseña');
  });

  it('con 0 y con más de 1 usa el plural', () => {
    expect(plural(0, 'reseña', 'reseñas')).toBe('0 reseñas');
    expect(plural(3, 'reseña', 'reseñas')).toBe('3 reseñas');
  });
});

describe('zonasPorProvincia', () => {
  it('agrupa los municipios bajo su provincia', () => {
    expect(zonasPorProvincia([area('La Habana', 'Centro Habana'), area('Artemisa', 'Guanajay'), area('La Habana', 'Playa')]))
      .toEqual([
        { provincia: 'La Habana', municipios: ['Centro Habana', 'Playa'] },
        { provincia: 'Artemisa', municipios: ['Guanajay'] },
      ]);
  });

  it('conserva el orden de llegada, no lo alfabetiza', () => {
    expect(zonasPorProvincia([area('Villa Clara', 'Santa Clara'), area('Artemisa', 'Guanajay')]).map((z) => z.provincia))
      .toEqual(['Villa Clara', 'Artemisa']);
  });

  it('sin zonas devuelve una lista vacía (la sección no se monta)', () => {
    expect(zonasPorProvincia([])).toEqual([]);
  });
});

describe('enlaceTelegram', () => {
  it('quita el @ de delante', () => {
    expect(enlaceTelegram('@pepe')).toBe('https://t.me/pepe');
  });

  it('quita el + de delante', () => {
    expect(enlaceTelegram('+5355512345')).toBe('https://t.me/5355512345');
  });

  it('sin usuario no hay enlace', () => {
    expect(enlaceTelegram(null)).toBeNull();
    expect(enlaceTelegram('   ')).toBeNull();
  });
});

describe('enlaceCorreo', () => {
  it('arma el mailto', () => {
    expect(enlaceCorreo(' pepe@correo.cu ')).toBe('mailto:pepe@correo.cu');
  });

  it('sin correo no hay enlace', () => {
    expect(enlaceCorreo(undefined)).toBeNull();
  });
});

describe('contactoPerfil', () => {
  it('sin nada: sinTelefono y sinContacto', () => {
    const c = contactoPerfil(perfil(), null);
    expect(c.sinTelefono).toBe(true);
    expect(c.sinContacto).toBe(true);
  });

  it('solo con Telegram NO está sin contacto, aunque siga sin teléfono', () => {
    const c = contactoPerfil(perfil({ telegram: '@pepe' }), null);
    expect(c.telegram).toBe('https://t.me/pepe');
    expect(c.sinTelefono).toBe(true);
    expect(c.sinContacto).toBe(false);
  });

  it('solo con correo tampoco está sin contacto', () => {
    expect(contactoPerfil(perfil({ email_contact: 'pepe@correo.cu' }), null).sinContacto).toBe(false);
  });

  it('con teléfono y contact_mode both ofrece WhatsApp y llamada', () => {
    const c = contactoPerfil(perfil({ whatsapp: '53551234' }), null);
    expect(c.whatsapp).toContain('53551234');
    expect(c.llamar).toBe('tel:53551234');
    expect(c.sinTelefono).toBe(false);
  });

  it('contact_mode call no ofrece WhatsApp; whatsapp no ofrece llamada', () => {
    expect(contactoPerfil(perfil({ whatsapp: '53551234', contact_mode: 'call' }), null).whatsapp).toBeNull();
    expect(contactoPerfil(perfil({ whatsapp: '53551234', contact_mode: 'whatsapp' }), null).llamar).toBeNull();
  });

  it('el chat no se le ofrece a una cuenta profesional', () => {
    expect(contactoPerfil(perfil({ has_chat: true }), { user_type: 'provider' }).chat).toBe(false);
    expect(contactoPerfil(perfil({ has_chat: true }), { user_type: 'client' }).chat).toBe(true);
  });
});

describe('mensajeArticulo', () => {
  it('disponible: dice que le interesa, con el precio', () => {
    expect(mensajeArticulo({ name: 'Taladro', available: true }, 'desde 3 000 CUP'))
      .toBe('Hola, me interesa «Taladro» (desde 3 000 CUP) que vi en Encuentrauno.');
  });

  it('agotado: pregunta si vuelve a haber', () => {
    expect(mensajeArticulo({ name: 'Taladro', available: false }, '3 000 CUP'))
      .toBe('Hola, vi «Taladro» en tu catálogo de Encuentrauno. ¿Vuelve a haber?');
  });
});

describe('accionArticulo', () => {
  it('cambia según haya o no', () => {
    expect(accionArticulo(true)).toBe('Lo quiero');
    expect(accionArticulo(false)).toBe('Preguntar si vuelve a haber');
  });
});

describe('etiquetaConteoCatalogo', () => {
  it('sin filtro no anuncia nada', () => {
    expect(etiquetaConteoCatalogo({ filtrando: false, cargando: false, total: 30 })).toBeNull();
  });

  it('mientras los datos son de la clave anterior NO canta cifra', () => {
    expect(etiquetaConteoCatalogo({ filtrando: true, cargando: true, total: 30 })).toBe('Buscando…');
  });

  it('con los datos del filtro aplicado da el conteo, pluralizado', () => {
    expect(etiquetaConteoCatalogo({ filtrando: true, cargando: false, total: 2 })).toBe('2 artículos');
    expect(etiquetaConteoCatalogo({ filtrando: true, cargando: false, total: 1 })).toBe('1 artículo');
    expect(etiquetaConteoCatalogo({ filtrando: true, cargando: false, total: 0 })).toBe('0 artículos');
  });
});

describe('etiquetaBarraResenas', () => {
  it('pluriliza las dos palabras, nunca «1 reseñas»', () => {
    expect(etiquetaBarraResenas({ rating: 5, count: 1, porcentaje: 100 })).toBe('1 reseña de 5 estrellas, 100 %');
    expect(etiquetaBarraResenas({ rating: 1, count: 3, porcentaje: 20 })).toBe('3 reseñas de 1 estrella, 20 %');
  });
});

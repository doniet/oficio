// Escalas copiadas de oficios-cuba/frontend/tailwind.config.js: la app usa la misma paleta que la web.
export const brand = {
  50: '#FDF4F1', 100: '#FBE6DF', 200: '#F6CBBD', 300: '#EFA78F', 400: '#E57A5C',
  500: '#D85A3A', 600: '#C8472B', 700: '#A63922', 800: '#85301F', 900: '#6C2A1E',
} as const;
export const ink = {
  50: '#F4F6FA', 100: '#E6EAF2', 200: '#CBD2E1', 300: '#A3AEC6', 400: '#7885A3',
  500: '#5A6784', 600: '#45506B', 700: '#363F56', 800: '#252C40', 900: '#16213E', 950: '#0E1529',
} as const;
export const sea = {
  50: '#EEFAF8', 100: '#D3F1EC', 200: '#A8E2DA', 300: '#6FCBC0', 400: '#36AFA4',
  500: '#14918B', 600: '#0E7C7B', 700: '#0D6362', 800: '#0F4F4F', 900: '#103F40',
} as const;
export const sand = { 100: '#F4EEE4', 200: '#EAE1D2', 300: '#DDD0BB' } as const;
export const paper = '#FAF6EF';
// amber-400 / amber-300 de Tailwind: estrellas y texto de la insignia "Profesional".
export const ambar = { 300: '#FCD34D', 400: '#FBBF24' } as const;
export const whatsapp = '#1FA855';

// Nombres semánticos que ya usaba la app (se mantienen para no tocar pantallas sin necesidad).
export const colores = {
  fondo: paper, superficie: '#ffffff', borde: sand[200], bordeFuerte: sand[300],
  tinta: ink[900], tintaSuave: ink[500], tintaTenue: ink[400],
  acento: brand[600], acentoTexto: '#ffffff', mar: sea[600], error: '#b42318',
};

export const fuentes = {
  titulo: 'BricolageGrotesque_700Bold',
  tituloExtra: 'BricolageGrotesque_800ExtraBold',
  texto: 'Figtree_400Regular',
  textoMedio: 'Figtree_500Medium',
  textoFuerte: 'Figtree_600SemiBold',
  textoNegrita: 'Figtree_700Bold',
};

export const radios = { chip: 999, boton: 12, campo: 12, tarjeta: 16, grande: 24 } as const;

// shadow-card y shadow-lift de la web. RN 0.86 (nueva arquitectura) pinta `boxShadow` igual que CSS
// en Android e iOS, así que se usa la misma sombra y no `elevation` (que en Android sale gris y dura).
export const sombra = {
  card: { boxShadow: '0px 1px 2px rgba(22,33,62,0.05), 0px 4px 16px -6px rgba(22,33,62,0.10)' },
  lift: { boxShadow: '0px 2px 4px rgba(22,33,62,0.06), 0px 18px 40px -16px rgba(22,33,62,0.28)' },
} as const;

export const espacio = (n: number) => n * 4;

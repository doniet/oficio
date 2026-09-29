/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Naranja Encuentrauno: la marca. Ojo con el contraste — ver el comentario de abajo.
        brand: {
          50: '#FFF4EA', 100: '#FFE6CC', 200: '#FFCB99', 300: '#FFAD5C', 400: '#FF922E',
          500: '#FF7A00', 600: '#B85400', 700: '#9A4600', 800: '#7C3800', 900: '#5E2A00',
        },
        // brand-500 es el naranja del logo: vale para fondos, iconos e ilustraciones, pero con
        // texto blanco encima da 2,6:1 y WCAG AA pide 4,5:1. Por eso la escala salta de golpe a
        // brand-600 (#B85400, 4,9:1 con blanco): es el tono de todo lo que lleva texto encima
        // (.btn-primary, insignias, burbujas del chat) y no hace falta tocar cada sitio.
        // Azul tinta: texto, cabeceras y superficies oscuras.
        ink: {
          50: '#F4F6FA', 100: '#E6EAF2', 200: '#CBD2E1', 300: '#A3AEC6', 400: '#7885A3',
          500: '#5A6784', 600: '#45506B', 700: '#363F56', 800: '#252C40', 900: '#16213E', 950: '#0E1529',
        },
        // Turquesa del mar: verificado, éxito, detalles.
        sea: {
          50: '#EEFAF8', 100: '#D3F1EC', 200: '#A8E2DA', 300: '#6FCBC0', 400: '#36AFA4',
          500: '#14918B', 600: '#0E7C7B', 700: '#0D6362', 800: '#0F4F4F', 900: '#103F40',
        },
        // Tema claro estilo Apple (2026-09-29): el fondo deja de ser protagonista. Antes `paper`
        // era un crema (#FAF6EF) que competía con las tarjetas; ahora es blanco y lo que se ve son
        // las fotos y los elementos. `sand` conserva el nombre —lo usan decenas de sitios— pero
        // deja de ser arena: son grises neutros, que no tiñen lo que tienen al lado.
        paper: '#FFFFFF',
        sand: { 100: '#F6F6F8', 200: '#EDEDF1', 300: '#E2E2E8' },
        // Superficie para lo que no tiene foto (portadas de categoría, estados vacíos): un panel
        // liso, sin borde ni sombra. Es el recurso de Apple — separa sin dibujar nada.
        panel: '#F5F5F7',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Sombras mucho más bajas que antes: sobre blanco, una sombra marcada devuelve justo el
        // peso visual que este tema quita. Se quedan para dar relieve a lo que flota de verdad
        // (hojas inferiores, menús), no para dibujar el contorno de cada tarjeta.
        card: '0 1px 2px rgba(16,24,40,.04)',
        lift: '0 2px 6px rgba(16,24,40,.06), 0 12px 32px -18px rgba(16,24,40,.20)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.97)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .35s cubic-bezier(.2,.7,.2,1) both',
        'fade-in': 'fade-in .2s ease-out both',
        'scale-in': 'scale-in .2s cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Naranja Encuentrauno: la marca. Ojo con el contraste — ver el comentario de abajo.
        brand: {
          50: '#FFF4EA', 100: '#FFE6CC', 200: '#FFCB99', 300: '#FFAD5C', 400: '#FF922E',
          500: '#FF7A00', 600: '#C25A00', 700: '#B85400', 800: '#8F4200', 900: '#6B3200',
        },
        // brand-500 es el naranja del logo: vale para fondos, iconos e ilustraciones, pero con
        // texto blanco encima da 2,6:1 y WCAG AA pide 4,5:1. Los botones rellenos y los enlaces
        // usan brand-700 (4,9:1). Sobre naranja vivo, el texto va en ink-950.
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
        paper: '#FAF6EF',
        sand: { 100: '#F4EEE4', 200: '#EAE1D2', 300: '#DDD0BB' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(22,33,62,.05), 0 4px 16px -6px rgba(22,33,62,.10)',
        lift: '0 2px 4px rgba(22,33,62,.06), 0 18px 40px -16px rgba(22,33,62,.28)',
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

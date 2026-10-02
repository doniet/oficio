export const configApi = { baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://oficio.dardoit.com/api' };
// Las imágenes vienen como rutas relativas del sitio (/api/uploads/..., /demo/...).
export const urlImagen = (ruta?: string | null) =>
  !ruta ? undefined : ruta.startsWith('http') ? ruta : `${configApi.baseUrl.replace(/\/api$/, '')}${ruta}`;

// El origen web (oficio.dardoit.com, sin el /api final). Lo usa Compartir para armar una URL que
// le abra algo a quien la reciba sin la app instalada (no un deep link de la app), y la ficha del
// mapa para "ver el perfil completo" mientras la pantalla propia del perfil no existía.
export const origenWeb = () => configApi.baseUrl.replace(/\/api$/, '');

export const configApi = { baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://oficio.dardoit.com/api' };
// Las imágenes vienen como rutas relativas del sitio (/api/uploads/..., /demo/...).
export const urlImagen = (ruta?: string | null) =>
  !ruta ? undefined : ruta.startsWith('http') ? ruta : `${configApi.baseUrl.replace(/\/api$/, '')}${ruta}`;

import { uploadApi } from '../services/api';

// Las fotos del móvil pesan varios MB: se reducen en el navegador antes de subirlas para
// ahorrar datos (clave con la conexión en Cuba) y espacio en el servidor.
export async function compressImage(file: File, maxSide = 1400, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('No se pudo leer la imagen');
  });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite procesar imágenes');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}

export async function uploadImage(file: File, maxSide?: number, purpose?: 'catalog'): Promise<string> {
  const data = await compressImage(file, maxSide);
  const res = await uploadApi.image(data, purpose);
  return res.data.url;
}
